import { ref, watch, computed, getCurrentInstance } from 'vue';
import { useAppState } from './useAppState.ts';
import {
    parsePaletteJson,
    normalizePaletteColors,
    getHighContrastForBackground,
    getHighlightColor,
    formatHexDisplay,
    hexToRgb,
    rgbToHex,
    isLightForegroundHex,
    contrastAnchorIconUrl,
} from '@/modules/utils/colorUtils.mjs';
import { getPerceivedBrightness } from '@/modules/utils/paletteHelpers.mjs';
import { applySaturationMultiplierToPalette } from '@/modules/utils/colorSaturation.mjs';
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';
import { complainLoudlyPaletteS3Failure } from '@/modules/utils/paletteS3LoudError.mjs';
import { resolvePaletteCatalogS3Url } from '@/modules/utils/paletteCatalogS3Url.mjs';
import { parsePaletteBundleFromImageMetadataJsonl } from '@/modules/utils/paletteBundleFromImageMetadata.mjs';

/** True when the error is from catalog/manifest/fetch (show S3/catalog loud banner). */
function isPaletteCatalogOrS3Failure(error) {
    if (!(error instanceof Error)) return false;
    const msg = error.message;
    if (/AppState not loaded/i.test(msg)) return false;
    if (/Unknown theme\.colorPalette/i.test(msg)) return false;
    if (/Invalid hex in palette/i.test(msg)) return false;
    if (/Invalid palette JSON/i.test(msg)) return false;
    if (/palette manifest is not an array/i.test(msg)) return true;
    if (/Failed to fetch palette manifest/i.test(msg)) return true;
    if (/Palette fetch failed/i.test(msg)) return true;
    if (error.name === 'TypeError' && /fetch|network|Failed to fetch/i.test(msg)) return true;
    return false;
}

function getRuntimeBase() {
    const envBase = (import.meta?.env?.BASE_URL || '/');
    let base = envBase;
    if (typeof window !== 'undefined') {
        const path = window.location.pathname || '/';
        const parts = path.split('/').filter(Boolean);
        const useSubpath = parts.length > 0 && (envBase === '/' || !path.startsWith(envBase));
        if (useSubpath) base = `/${parts[0]}/`;
    }
    return base.endsWith('/') ? base : `${base}/`;
}

function basePathJoin(relPath) {
    const b = getRuntimeBase();
    const p = relPath.startsWith('/') ? relPath.slice(1) : relPath;
    return `${b}${p}`;
}

/** Same as server NDJSON post-process — theme.colorPalette needs filename keys on static hosts. */
function ensureSyntheticPaletteFilenamesForClient(bundle) {
    if (!bundle?.palettes) return;
    for (const p of bundle.palettes) {
        if (p.filename || p.key) continue;
        if (typeof p.name !== 'string' || !p.name.trim()) continue;
        const s = p.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'palette';
        const fn = `${s}.json`;
        p.filename = fn;
        p.key = fn;
    }
}

function getPaletteCatalogApiUrl() {
    return basePathJoin('api/palette-catalog');
}

function getPaletteManifestApiUrl() {
    return basePathJoin('api/palette-manifest');
}

function paletteStaticFileUrl(filename) {
    const base = basePathJoin('static_content/colorPalettes').replace(/\/$/, '');
    return `${base}/${filename}`;
}

/** Base path for contrast icons (url/back/img); must contain icons8-{url,back,img}-16-black.png. */
const ICON_BASE = basePathJoin('static_content/icons/anchors');

/**
 * Single source of truth for text/icon contrast against a background color.
 * Returns both text style and icon asset/variant for consistent rendering.
 */
function resolveTextAndIconStyle(backgroundHex) {
    const contrast = getHighContrastForBackground(backgroundHex, { iconBase: ICON_BASE });
    return {
        textColor: contrast.textColor,
        linkColor: contrast.textColor,
        iconSet: contrast.iconSet,
        iconFilter: contrast.iconSet.variant === 'white' ? 'invert(1)' : 'none'
    };
}

/**
 * theme.colorPalette must be the JSON filename (e.g. sweeps.json). If app_state has the
 * palette's display `name` from JSON instead, map it back to the filename.
 * @param {unknown} value - from user-settings.theme.colorPalette
 * @param {Record<string, string>} filenameToName - filename -> display name
 * @returns {string | null} filename key or null
 */
function resolvePaletteFilenameKey(value, filenameToName) {
    if (value == null || typeof value !== 'string') return null;
    const t = value.trim();
    if (!t) return null;
    if (filenameToName[t]) return t;
    const pair = Object.entries(filenameToName).find(([, displayName]) => displayName === t);
    if (pair) return pair[0];
    const tl = t.toLowerCase();
    const pairI = Object.entries(filenameToName).find(
        ([, displayName]) => typeof displayName === 'string' && displayName.toLowerCase() === tl
    );
    return pairI ? pairI[0] : null;
}

// --- Reactive State ---
// This state is shared across all components that use this composable
const colorPalettes = ref({});
/** Per-palette background swatch: map palette name -> index (S3 catalog backgroundSwatchIndex when set). */
const backgroundSwatchIndexByPalette = ref({});
const orderedPaletteNames = ref([]);
/** Maps stored theme key → display name; keys match S3 catalog palette names. Kept for ResumeContainer native select option values. */
const filenameToNameMap = ref({});
/** Optional S3/public image URL per palette (from catalog). */
const imagePublicUrlByPaletteName = ref({});
const isLoading = ref(false);
/**
 * Global HSL-saturation multiplier applied uniformly to every color of the current palette
 * (color-map modal "Saturation" slider), analogous to CSS filter saturate(x). 0.0..3.0;
 * 1.0 = no change (default). In-memory only — resets to 1.0 on reload; not persisted to
 * app_state.json (this is a live preview knob, not a rendering config value like
 * Scene3DSettings' saturationAtMaxZ).
 */
const paletteSaturationMultiplier = ref(1.0);

/**
 * Single centralized place every internal reader goes through to get a palette's *rendered*
 * colors (raw palette colors with paletteSaturationMultiplier applied). Do not read
 * colorPalettes.value[name] directly elsewhere for rendering — route through this so the
 * color-map modal slider affects the 3D scene, 2D resume view, and the modal's own swatches
 * uniformly from one source of truth.
 * @param {string} paletteName
 * @returns {string[] | undefined}
 */
function getEffectivePaletteColors(paletteName) {
    const raw = colorPalettes.value[paletteName];
    if (!raw) return raw;
    return applySaturationMultiplierToPalette(raw, paletteSaturationMultiplier.value);
}

/**
 * Legacy .json basenames / underscores → palette keys in S3 catalog (when names changed).
 * Keys are lowercase.
 */
const LEGACY_PALETTE_KEY_ALIASES = {
    '55 emerald': 'emerald',
    black_monotone: 'Black Monotone',
    'black monotone': 'Black Monotone',
    white_monotone: 'White Monotone',
    'white monotone': 'White Monotone',
    medium_grey_monotone: 'Medium Grey Monotone',
    'medium grey monotone': 'Medium Grey Monotone',
    '50 dark grey monotone': 'Medium Grey Monotone',
    snow_springtime: 'snow springtime',
    blue_berries_on_cheese: 'blue berry & cheese',
    rose_blush: 'rose blush',
    vivid_yellow_on_blue: 'vivid yellow on blue',
    mitzibushi_red: 'mitzibushi red',
    blue_caddelack: 'blue caddelack',
    yellow_grey: 'yellow grey',
    blue_tonal: 'blue tonal',
    so_cherry: 'so cherry',
    '20 hyperpop': 'procreate',
    '25 retro': 'luca',
    '30 canyon': 'gold',
    '40 cosmic': 'purpley',
    '10 oceanic': 'blue tonal',
};

function resolveStoredPaletteKey(stored) {
    if (!stored || typeof stored !== 'string') return null;
    const trimmed = stored.trim();
    const palettes = colorPalettes.value;
    if (trimmed && palettes[trimmed]) return trimmed;

    const mapped = filenameToNameMap.value[trimmed];
    if (mapped && palettes[mapped]) return mapped;

    const base = trimmed.replace(/\.json$/i, '').trim();
    if (!base) return null;
    const baseSpaced = base.replace(/_/g, ' ');

    const aliasCandidates = [
        LEGACY_PALETTE_KEY_ALIASES[base.toLowerCase()],
        LEGACY_PALETTE_KEY_ALIASES[baseSpaced.toLowerCase()],
    ].filter(Boolean);

    const tryExact = [base, baseSpaced, ...aliasCandidates];
    for (const k of tryExact) {
        if (k && palettes[k]) return k;
    }

    const lowerToCanonical = new Map(Object.keys(palettes).map((k) => [k.toLowerCase(), k]));
    for (const k of tryExact) {
        if (!k) continue;
        const canon = lowerToCanonical.get(k.toLowerCase());
        if (canon) return canon;
    }
    return null;
}

/** Resolve palette display key from persisted theme value (.json legacy or palette name). */
function resolvePaletteNameFromFilename(filename) {
    return resolveStoredPaletteKey(filename);
}
let resolveReady;
export const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
// Initialize from the global state, but allow it to be updated locally
const currentPaletteFilename = ref(null);

/**
 * Apply document-level background CSS vars (--background-light, --background-dark) from the current palette.
 * Used on initial load and hard refresh so the scene view background is correct when restoring from state.
 */
function applySceneBackgroundFromCurrentPalette() {
    const filename = currentPaletteFilename.value;
    if (!filename || typeof document === 'undefined') return;
    const paletteName = resolvePaletteNameFromFilename(filename);
    const colorPalette = getEffectivePaletteColors(paletteName);
    if (!paletteName || !colorPalette || colorPalette.length === 0) return;
    const root = document.documentElement;
    const bgIndex = backgroundSwatchIndexByPalette.value[paletteName];
    const baseBackgroundHex = (bgIndex != null && colorPalette[bgIndex] != null)
        ? colorPalette[bgIndex]
        : colorPalette.reduce((darkest, current) => {
            return getPerceivedBrightness(current) < getPerceivedBrightness(darkest) ? current : darkest;
        }, colorPalette[0]);
    const darkHex = baseBackgroundHex || '#333333';
    const darkerHex = getHighlightColor(darkHex, { highlightPercent: 75 });
    const darkestHex = getHighlightColor(darkHex, { highlightPercent: 15 });
    const darkerRgb = hexToRgb(darkerHex) || { r: 51, g: 51, b: 51 };
    const darkestRgb = hexToRgb(darkestHex) || { r: 26, g: 26, b: 26 };
    root.style.setProperty('--background-light', `rgba(${darkerRgb.r}, ${darkerRgb.g}, ${darkerRgb.b}, 1.0)`);
    root.style.setProperty('--background-dark', `rgba(${darkestRgb.r}, ${darkestRgb.g}, ${darkestRgb.b}, 1.0)`);
}

// --- The Composable Function ---
export function useColorPalette() {
    // Access centralized app state
    const { appState, updateAppState } = useAppState();

    // Resolve registry once during setup (inject() only valid here); use in async/watchers
    let elementRegistry = null;
    try {
        elementRegistry = injectGlobalElementRegistry();
    } catch (e) {
        if (typeof window !== 'undefined' && window.globalElementRegistry) {
            elementRegistry = window.globalElementRegistry;
        }
        if (!elementRegistry) throw e;
    }
    function getElementRegistry() {
        return elementRegistry;
    }

    /** Registry from setup-time inject; do not call inject() here (e.g. rAF callbacks are outside setup). */
    async function applyCurrentPaletteToAllElementsBound() {
        const reg =
            elementRegistry || (typeof window !== 'undefined' && window.globalElementRegistry);
        return applyCurrentPaletteToAllElements(reg);
    }

    async function loadPalettes() {
        if (isLoading.value) return; // Don't reload if already loading
        isLoading.value = true;
        
        try {
            // console.log('[ColorPalette] Starting palette loading...');
            
            // AppState is already loaded by useAppState
            if (!appState.value) {
                console.error('[ColorPalette] AppState not loaded yet - useAppState should be called first');
                console.error('[ColorPalette] appState.value:', appState.value);
                throw new Error('AppState not loaded yet - useAppState should be called first');
            }
            
            // console.log('[ColorPalette] AppState is loaded, theme:', appState.value.theme);
            
            // Defer currentPaletteFilename until filenameToNameMap is built (theme may store display name by mistake).

            const tempLoadedColorPalettes = {};
            const tempBackgroundSwatchIndexByPalette = {};
            const tempFilenameToNameMap = {};
            const tempImageUrls = {};
            const tempOrderedNames = [];

            /** @type {{ version: number, palettes: unknown[] } | null} */
            let catalogJson = null;
            const s3Url = resolvePaletteCatalogS3Url();

            /** Load NDJSON catalog from public HTTPS URL (GitHub Pages has no /api). */
            const loadCatalogFromS3 = async () => {
                if (!s3Url) return;
                const s3Res = await fetch(s3Url, { method: 'GET', cache: 'no-store', mode: 'cors' });
                if (!s3Res.ok) {
                    throw new Error(`Palette catalog HTTP ${s3Res.status} (${s3Url})`);
                }
                const raw = await s3Res.text();
                catalogJson = parsePaletteBundleFromImageMetadataJsonl(raw);
                ensureSyntheticPaletteFilenamesForClient(catalogJson);
            };

            // Production bundles are deployed to static hosts (e.g. GitHub Pages) with no /api — never fetch
            // /api/palette-catalog there (avoids 404 console noise). Dev uses the local Express catalog first.
            if (import.meta.env.PROD) {
                if (s3Url) {
                    await loadCatalogFromS3();
                }
            } else {
                const apiCatalogRes = await fetch(getPaletteCatalogApiUrl());
                if (apiCatalogRes.ok) {
                    const ct = (apiCatalogRes.headers.get('content-type') || '').toLowerCase();
                    if (ct.includes('json')) {
                        try {
                            catalogJson = await apiCatalogRes.json();
                        } catch {
                            catalogJson = null;
                        }
                    }
                }
                const apiLooksLikeV2 =
                    catalogJson &&
                    catalogJson.version === 2 &&
                    Array.isArray(catalogJson.palettes) &&
                    catalogJson.palettes.length > 0;
                if (!apiLooksLikeV2 && s3Url) {
                    await loadCatalogFromS3();
                } else if (apiLooksLikeV2) {
                    ensureSyntheticPaletteFilenamesForClient(catalogJson);
                }
            }

            const useV2Catalog =
                catalogJson &&
                catalogJson.version === 2 &&
                Array.isArray(catalogJson.palettes) &&
                catalogJson.palettes.length > 0;

            let loadedFromV2 = false;
            if (useV2Catalog) {
                for (const p of catalogJson.palettes) {
                    const filename = p.filename || p.key;
                    if (!filename || typeof p.name !== 'string' || !Array.isArray(p.colors)) {
                        continue;
                    }
                    normalizePaletteColors(p.colors);
                    tempLoadedColorPalettes[p.name] = p.colors;
                    if (p.backgroundSwatchIndex != null) {
                        tempBackgroundSwatchIndexByPalette[p.name] =
                            Math.max(0, Math.floor(p.backgroundSwatchIndex)) % p.colors.length;
                    }
                    // Optional source image URL used by ResumeContainer's palette-image-btn.
                    // ResumeContainer indexes this map by the selected filename key.
                    if (typeof p.imagePublicUrl === 'string' && p.imagePublicUrl.trim()) {
                        tempImageUrls[filename] = p.imagePublicUrl.trim();
                    }
                    tempFilenameToNameMap[filename] = p.name;
                    tempOrderedNames.push(p.name);
                }
                loadedFromV2 = Object.keys(tempFilenameToNameMap).length > 0;
            }

            if (!loadedFromV2) {
                if (import.meta.env.PROD) {
                    throw new Error(
                        '[ColorPalette] Production: no palette catalog loaded. The static Pages build must bake a catalog URL (S3_COLOR_PALETTES_JSON_URL or bucket/region/key in CI, or config/github-pages-palette-catalog.url). See scripts/verify-palette-catalog-env.mjs.'
                    );
                }
                const response = await fetch(getPaletteManifestApiUrl());
                if (!response.ok) throw new Error('Failed to fetch palette manifest');
                const manifestData = await response.json();
                if (!Array.isArray(manifestData)) {
                    throw new Error('[ColorPalette] palette manifest is not an array');
                }
                Object.keys(tempLoadedColorPalettes).forEach((k) => delete tempLoadedColorPalettes[k]);
                Object.keys(tempBackgroundSwatchIndexByPalette).forEach((k) => delete tempBackgroundSwatchIndexByPalette[k]);
                Object.keys(tempFilenameToNameMap).forEach((k) => delete tempFilenameToNameMap[k]);
                tempOrderedNames.length = 0;
                for (const filename of manifestData) {
                    const filePath = paletteStaticFileUrl(filename);
                    const paletteResponse = await fetch(filePath);
                    if (!paletteResponse.ok) {
                        throw new Error(`Palette fetch failed: ${filePath} (${paletteResponse.status})`);
                    }
                    const raw = await paletteResponse.text();
                    const paletteData = parsePaletteJson(raw);
                    if (!paletteData) {
                        throw new Error(`Invalid palette JSON: ${filename}`);
                    }
                    normalizePaletteColors(paletteData.colors);
                    tempLoadedColorPalettes[paletteData.name] = paletteData.colors;
                    if (paletteData.backgroundSwatchIndex != null) {
                        tempBackgroundSwatchIndexByPalette[paletteData.name] =
                            Math.max(0, Math.floor(paletteData.backgroundSwatchIndex)) % paletteData.colors.length;
                    }
                    tempFilenameToNameMap[filename] = paletteData.name;
                    tempOrderedNames.push(paletteData.name);
                }
            }

            // Fast-fail: validate every palette color at startup; invalid hex fails entire startup.
            for (const [paletteName, colors] of Object.entries(tempLoadedColorPalettes)) {
                for (let i = 0; i < colors.length; i++) {
                    if (!hexToRgb(colors[i])) {
                        throw new Error(`Invalid hex in palette "${paletteName}" at index ${i}: "${colors[i]}"`);
                    }
                }
            }

            colorPalettes.value = tempLoadedColorPalettes;
            backgroundSwatchIndexByPalette.value = tempBackgroundSwatchIndexByPalette;
            filenameToNameMap.value = tempFilenameToNameMap;
            orderedPaletteNames.value = tempOrderedNames;
            imagePublicUrlByPaletteName.value = tempImageUrls;

            const filenames = Object.keys(tempFilenameToNameMap);
            const savedThemePalette = appState.value["user-settings"].theme.colorPalette;
            let selectedFilename = filenames.length ? resolvePaletteFilenameKey(savedThemePalette, tempFilenameToNameMap) : null;

            if (filenames.length > 0) {
                if (!selectedFilename) {
                    selectedFilename = filenames[0];
                    const hadValue = savedThemePalette != null && String(savedThemePalette).trim() !== '';
                    await updateAppState(
                        {
                            "user-settings": {
                                theme: {
                                    colorPalette: selectedFilename
                                }
                            }
                        },
                        true
                    );
                    if (hadValue) {
                        reportError(
                            new Error(`Unknown theme.colorPalette: ${String(savedThemePalette)}`),
                            '[ColorPalette] theme.colorPalette is not a known filename or palette display name',
                            `Remedy: Persisted theme.colorPalette as ${selectedFilename}`
                        );
                    }
                } else {
                    const normalized = String(savedThemePalette).trim();
                    if (normalized !== selectedFilename) {
                        await updateAppState(
                            {
                                "user-settings": {
                                    theme: {
                                        colorPalette: selectedFilename
                                    }
                                }
                            },
                            true
                        );
                        console.log(
                            '[ColorPalette] Remedy: theme.colorPalette was a display name or alias; persisted filename:',
                            selectedFilename
                        );
                    }
                }
                currentPaletteFilename.value = selectedFilename;
            } else {
                currentPaletteFilename.value = null;
            }

            // Ensure scene view background is updated when restoring selected palette from state (initial load / hard refresh)
            applySceneBackgroundFromCurrentPalette();

        } catch (error) {
            if (isPaletteCatalogOrS3Failure(error)) {
                complainLoudlyPaletteS3Failure('[ColorPalette] loadPalettes — browser fetch from S3 failed or catalog invalid', error);
            }
            reportError(error, '[ColorPalette] Failed to load color palettes');
            throw error;
        } finally {
            isLoading.value = false;
            if (resolveReady) resolveReady();
            // console.log('[ColorPalette] Palette loading complete');
        }
    }

    // Check if we're inside a Vue component instance
    const instance = getCurrentInstance();
    
    // Don't auto-load on component mount - wait for explicit loadPalettes call
    // Palettes will be loaded manually from AppContent.vue after AppState is ready

    async function setCurrentPalette(filename) {
        // Wait for palettes to be loaded before proceeding
        if (isLoading.value) {
            await readyPromise;
        }

        const map = filenameToNameMap.value;
        const fileKey = filename ? resolvePaletteFilenameKey(filename, map) : null;

        if (filename && fileKey && map[fileKey]) {
            if (String(filename).trim() !== fileKey) {
                console.log('[ColorPalette] Remedy: setCurrentPalette argument was display name; using filename:', fileKey);
            }
            filename = fileKey;
            const previousFilename = currentPaletteFilename.value;
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] setCurrentPalette called: ${previousFilename} → ${filename}`);
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] appState.theme.colorPalette: ${appState.value?.["user-settings"]?.theme?.colorPalette}`);
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] currentPaletteFilename.value: ${currentPaletteFilename.value}`);
            
            // Check if appState and reactive state are in sync
            if (appState.value?.["user-settings"]?.theme?.colorPalette !== currentPaletteFilename.value) {
                // console.warn(`[ColorPalette] State mismatch detected! appState: ${appState.value?.theme?.colorPalette}, reactive: ${currentPaletteFilename.value}`);
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] User selected ${filename}, proceeding with user choice`);
            }
            
            // Only proceed if actually changing to a different palette from what user selected
            if (currentPaletteFilename.value === filename && appState.value?.['user-settings']?.theme?.colorPalette === filename) {
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] No change needed - already using ${filename}`);
                return;
            }
            
            currentPaletteFilename.value = filename;

            // Paint first (sync, all elements including hidden), then persist without blocking UI.
            applyFullPaletteInstant({
                previousFilename,
                paletteName: map[filename] || filename,
                dispatchEvent: true,
            });

            void updateAppState({
                "user-settings": {
                    theme: {
                        colorPalette: filename
                    }
                }
            }).catch((e) => {
                reportError(e, '[ColorPalette] Failed to persist palette selection');
                throw e;
            });
            
        } else if (filename) {
            reportError(
                new Error(`Invalid palette: ${filename}`),
                '[ColorPalette] setCurrentPalette: value is not a known palette filename or display name',
                'Remedy: Ignored; user selection did not match a loaded palette'
            );
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Available palette files:`, Object.keys(filenameToNameMap.value));
        }
    }

    const currentPaletteName = computed(() => {
        return resolvePaletteNameFromFilename(currentPaletteFilename.value) || null;
    });

    const currentPalette = computed(() => {
        const name = currentPaletteName.value;
        return name ? (getEffectivePaletteColors(name) || []) : [];
    });

    /**
     * Set the global palette saturation multiplier (0.0..3.0; 1.0 = no change, analogous to CSS
     * saturate(x)) and repaint every themed element so the 3D scene, 2D resume view, and
     * color-map modal swatches all update live from this one source of truth (currentPalette /
     * colorPalettes reads already route through getEffectivePaletteColors).
     * @param {number} factor 0.0..3.0
     */
    function setPaletteSaturationMultiplier(factor) {
        const n = Number(factor);
        paletteSaturationMultiplier.value = Number.isFinite(n) ? Math.max(0.0, Math.min(3.0, n)) : 1.0;
        applyFullPaletteInstant({ dispatchEvent: false });
    }

    // Update brightness boosts (computed; not manually adjustable in 3D UI)
    async function updateBrightnessBoosts(selectedBoost, hoveredBoost) {
        const updates = {};
        if (selectedBoost !== undefined) {
            updates.brightnessBoostSelected = selectedBoost;
        }
        if (hoveredBoost !== undefined) {
            updates.brightnessBoostHovered = hoveredBoost;
        }
        
        if (Object.keys(updates).length > 0) {
            await updateAppState({
                "system-constants": {
                    theme: updates
                }
            });
        }
        
        applyFullPaletteInstant({ dispatchEvent: false });
    }

    // Function to update border settings
    async function updateBorderSettings(newBorderSettings) {
        if (newBorderSettings) {
            await updateAppState({
                "system-constants": {
                    theme: {
                        borderSettings: newBorderSettings
                    }
                }
            });
        }
        
        applyFullPaletteInstant({ dispatchEvent: false });
    }

    // Re-apply when palette color data finishes loading (e.g. catalog refresh).
    watch(colorPalettes, () => {
        if (currentPaletteFilename.value) {
            applyFullPaletteInstant({ dispatchEvent: false });
        }
    }, { deep: true });

    // Return all the reactive state and methods
    return {
        colorPalettes,
        orderedPaletteNames,
        filenameToNameMap,
        imagePublicUrlByPaletteName,
        isLoading,
        currentPaletteFilename,
        currentPaletteName,
        currentPalette,
        paletteSaturationMultiplier,
        setCurrentPalette,
        setPaletteSaturationMultiplier,
        loadPalettes,
        updateBrightnessBoosts,
        updateBorderSettings,
        applyCurrentPaletteToAllElements: applyCurrentPaletteToAllElementsBound,
    };
}

/**
 * Apply the current palette to all elements that have data-color-index (cDivs, rDivs, skill cards).
 * Call after initial DOM build (cards + resume list) so palette is applied on first load.
 * @param {{ clearAllCache?: () => void }} [registry] - optional; uses window.globalElementRegistry if not provided
 */
export async function applyCurrentPaletteToAllElements(registry = null) {
    await readyPromise;
    if (!currentPaletteFilename.value) return;
    const reg = registry || (typeof window !== 'undefined' && window.globalElementRegistry);
    reg?.clearAllCache?.();
    applyFullPaletteInstant({ dispatchEvent: true, previousFilename: null });
}

/** Every themed element in the document (visible, hidden, clones, listing copies). */
function collectAllThemedElements() {
    if (typeof document === 'undefined') return [];
    return Array.from(document.querySelectorAll('[data-color-index]'));
}

/**
 * Single synchronous pass: scene background + every [data-color-index] element + interaction-state refresh.
 * @param {{ dispatchEvent?: boolean, previousFilename?: string|null, paletteName?: string }} [options]
 */
export function applyFullPaletteInstant(options = {}) {
    const { appState } = useAppState();
    if (!appState.value || !currentPaletteFilename.value) return;

    const paletteName = resolvePaletteNameFromFilename(currentPaletteFilename.value);
    const colorPalette = getEffectivePaletteColors(paletteName);
    if (!paletteName || !colorPalette?.length) return;

    const root = typeof document !== 'undefined' ? document.documentElement : null;
    root?.classList.add('palette-swapping');

    applySceneBackgroundFromCurrentPalette();

    if (typeof window !== 'undefined' && window.globalElementRegistry?.clearAllCache) {
        window.globalElementRegistry.clearAllCache();
    }

    const snapshot = appState.value;
    for (const element of collectAllThemedElements()) {
        try {
            applyPaletteToElementSync(element, snapshot);
        } catch (err) {
            reportError(
                err,
                `[ColorPalette] applyFullPaletteInstant: ${element.id || element.className || 'element'}`,
                null
            );
        }
    }

    refreshVisualStateAfterPaletteChange();
    root?.classList.remove('palette-swapping');

    if (options.dispatchEvent !== false && typeof window !== 'undefined') {
        const filename = currentPaletteFilename.value;
        window.dispatchEvent(new CustomEvent('color-palette-changed', {
            detail: {
                filename,
                paletteName: options.paletteName ?? paletteName,
                previousFilename: options.previousFilename ?? null,
            },
        }));
    }
}

/** Re-sync inline hover CSS vars on a biz scene card from its data-* attributes (matches useCardsController applyHoverStylesToCard). */
function syncBizCardHoverStyleVarsFromAttributes(card) {
    if (!card || card.classList.contains('clone')) return;

    const pairs = [
        ['--data-background-color-hovered', 'data-background-color-hovered'],
        ['--data-foreground-color-hovered', 'data-foreground-color-hovered'],
        ['--data-hovered-padding', 'data-hovered-padding'],
        ['--data-hovered-inner-border-width', 'data-hovered-inner-border-width'],
        ['--data-hovered-inner-border-color', 'data-hovered-inner-border-color'],
        ['--data-hovered-outer-border-width', 'data-hovered-outer-border-width'],
        ['--data-hovered-outer-border-color', 'data-hovered-outer-border-color'],
        ['--data-hovered-border-radius', 'data-hovered-border-radius'],
    ];
    for (const [prop, attr] of pairs) {
        const val = card.getAttribute(attr);
        if (val) card.style.setProperty(prop, val);
    }
    card.style.setProperty('filter', 'none', 'important');
}

/**
 * Foreground hex already chosen for this card state (same CSS vars that paint the label text).
 */
function getSkillCardForegroundHex(card) {
    const isClone = card.classList.contains('clone');
    const isSelected = card.classList.contains('selected');
    const isHovered = !isClone && !isSelected && card.classList.contains('hovered');

    const cssVar = isClone || isSelected
        ? '--data-foreground-color-selected'
        : isHovered
            ? '--data-foreground-color-hovered'
            : '--data-foreground-color';
    const attr = isClone || isSelected
        ? 'data-foreground-color-selected'
        : isHovered
            ? 'data-foreground-color-hovered'
            : 'data-foreground-color';

    return formatHexDisplay(
        card.style.getPropertyValue(cssVar).trim()
        || card.getAttribute(attr)
        || ''
    );
}

/**
 * Skill-card back arrows mirror label text: read --data-foreground-color* and invert black PNG when light.
 */
export function syncSkillCardBackLinkPresentation(card) {
    if (!card) return;
    const isSkillShell =
        card.classList.contains('skill-card-div')
        || card.classList.contains('skill-resume-div')
        || card.classList.contains('appended-skill-resume-div');
    if (!isSkillShell) return;

    const fgHex = getSkillCardForegroundHex(card);
    if (!fgHex) return;

    const lightText = isLightForegroundHex(fgHex);
    card.classList.toggle('skill-fg-light', lightText);

    const variant = lightText ? 'white' : 'black';
    const blackBackUrl = contrastAnchorIconUrl(ICON_BASE, 'back', 'black');
    card.querySelectorAll('.skill-card-back-icons .back-icon').forEach((icon) => {
        if (icon.getAttribute('src') !== blackBackUrl) {
            icon.setAttribute('src', blackBackUrl);
        }
        icon.setAttribute('data-skill-icon-variant', variant);
        icon.style.setProperty('filter', lightText ? 'invert(1)' : 'none');
    });
}

/** Re-sync every skill shell (scene + resume copies). */
export function syncAllSkillCardBackLinkPresentations() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.skill-card-div, .skill-resume-div, .appended-skill-resume-div').forEach(syncSkillCardBackLinkPresentation);
}

/**
 * After palette data attributes / CSS vars are updated, re-apply interaction-state styling
 * so hovered cards, depth-filtered cards, and resume rows match without requiring a new mouseenter.
 */
export function refreshVisualStateAfterPaletteChange() {
    if (typeof document === 'undefined') return;

    document.querySelectorAll('.biz-card-div.hovered:not(.clone)').forEach(syncBizCardHoverStyleVarsFromAttributes);

    document.querySelectorAll('.biz-card-div:not(.clone), .skill-card-div:not(.clone)').forEach((card) => {
        if (!card.hasAttribute('data-sceneZ')) return;
        if (card.classList.contains('hovered')) return;
        updateContrastForBrightness(card);
    });

    document.querySelectorAll('.skill-card-div.clone').forEach((clone) => {
        updateContrastForBrightness(clone);
    });

    const sm = typeof window !== 'undefined' ? window.resumeFlyer?.selectionManager : null;
    const hoveredJob = sm?.getHoveredJobNumber?.();
    if (hoveredJob != null && sm?.eventTarget) {
        sm.eventTarget.dispatchEvent(new CustomEvent('job-hovered', { detail: { jobNumber: hoveredJob } }));
        sm.eventTarget.dispatchEvent(new CustomEvent('hoverChanged', {
            detail: { hoveredJobNumber: hoveredJob, caller: 'refreshVisualStateAfterPaletteChange' },
        }));
    }

    document.querySelectorAll('.skill-card-div, .skill-resume-div, .appended-skill-resume-div').forEach(syncSkillCardBackLinkPresentation);
}

/**
 * Applies the current color palette to a specific HTML element (synchronous).
 * @param {HTMLElement} element
 * @param {object} appStateSnapshot - merged AppState (not the readonly proxy)
 */
export function applyPaletteToElementSync(element, appStateSnapshot) {
    if (!element) throw new Error('applyPaletteToElementSync: element is required');
    if (!appStateSnapshot) throw new Error('AppState not available for palette application');

    const paletteColorIndexAttr = element.getAttribute('data-color-index');
    if (paletteColorIndexAttr === null || isNaN(parseInt(paletteColorIndexAttr, 10))) {
        throw new Error(`Element missing data-color-index attribute`);
    }
    const paletteColorIndex = parseInt(paletteColorIndexAttr, 10);

    if (!currentPaletteFilename.value) {
        throw new Error('No palette filename set; cannot apply palette');
    }

    const paletteName = resolvePaletteNameFromFilename(currentPaletteFilename.value);
    if (!paletteName) {
        throw new Error(`Palette name not found for filename: ${currentPaletteFilename.value}`);
    }

    const colorPalette = getEffectivePaletteColors(paletteName);
    if (!colorPalette) {
        throw new Error(`Color palette not found for name: ${paletteName}`);
    }

    const backgroundColor = formatHexDisplay(colorPalette[paletteColorIndex % colorPalette.length]) || colorPalette[paletteColorIndex % colorPalette.length];
    const normalStyle = resolveTextAndIconStyle(backgroundColor);
    const foregroundColor = normalStyle.textColor;
    const normalIconSet = normalStyle.iconSet;

    const systemConstants = appStateSnapshot["system-constants"];
    // Selected: single knob 135 → L >= floor(100/1.35) darken (L'=L/1.35), else brighten (L'=L*1.35).
    const selectedHighlightPercent = systemConstants?.theme?.selectedHighlightPercent ?? 135;
    const selectedBrightenRatio = selectedHighlightPercent / 100;
    const highLuminosityThreshold = Math.floor(100 / selectedBrightenRatio);

    const selectedBackgroundColor = getHighlightColor(backgroundColor, {
        highlightPercent: selectedHighlightPercent,
        nearlyWhiteL: highLuminosityThreshold
    });
    const selectedStyle = resolveTextAndIconStyle(selectedBackgroundColor);
    const highlightedTextColor = selectedStyle.textColor;
    const highlightedIconSet = selectedStyle.iconSet;

    // Hover = (unselected + selected) / 2 in RGB. Palette colors are validated at startup.
    const rgbNorm = hexToRgb(backgroundColor);
    const rgbSel = hexToRgb(selectedBackgroundColor);
    if (!rgbNorm || !rgbSel) {
        throw new Error(`Invalid color in palette (startup validation should have caught this): normal=${!!rgbNorm} selected=${!!rgbSel}`);
    }
    const hoveredBackgroundColor = rgbToHex(
        Math.round((rgbNorm.r + rgbSel.r) / 2),
        Math.round((rgbNorm.g + rgbSel.g) / 2),
        Math.round((rgbNorm.b + rgbSel.b) / 2)
    );
    const hoveredStyle = resolveTextAndIconStyle(hoveredBackgroundColor);
    const hoveredForegroundColor = hoveredStyle.textColor;
    const hoveredIconSet = hoveredStyle.iconSet;

    const borderRadius = appStateSnapshot.theme?.borderRadius || '25px';

    // Same padding and border width in all states so text does not shift on hover/select
    const defaultBorderSettings = {
        normal: {
            padding: '8px',
            innerBorderWidth: '1px',
            innerBorderColor: 'white',
            outerBorderWidth: '0px',
            outerBorderColor: 'transparent',
            marginTop: '0px',
            borderRadius: '25px'
        },
        hovered: {
            padding: '8px',
            innerBorderWidth: '1px',
            innerBorderColor: 'rgba(255, 255, 255, 0.8)',
            outerBorderWidth: '0px',
            outerBorderColor: 'transparent',
            marginTop: '0px',
            borderRadius: '25px'
        },
        selected: {
            padding: '8px',
            innerBorderWidth: '1px',
            innerBorderColor: 'purple',
            outerBorderWidth: '0px',
            outerBorderColor: 'transparent',
            marginTop: '0px',
            borderRadius: '25px'
        }
    };

    // Create a deep copy to avoid readonly proxy issues
    const borderSettings = systemConstants?.theme?.borderSettings ? {
        normal: { ...systemConstants.theme.borderSettings.normal },
        hovered: { ...systemConstants.theme.borderSettings.hovered },
        selected: { ...systemConstants.theme.borderSettings.selected }
    } : defaultBorderSettings;

    // rDiv: use rDivBorderOverrideSettings for margin + border + padding, normalized so all states use same dimensions (no text shift)
    const defaultRDivOverride = {
        normal: { padding: '8px', innerBorderWidth: '1px', marginTop: '11px' },
        hovered: { padding: '8px', innerBorderWidth: '1px', marginTop: '11px' },
        selected: { padding: '8px', innerBorderWidth: '1px', marginTop: '11px' }
    };
    const rDivOverride = systemConstants?.theme?.rDivBorderOverrideSettings ? {
        normal: { ...defaultRDivOverride.normal, ...systemConstants.theme.rDivBorderOverrideSettings.normal },
        hovered: { ...defaultRDivOverride.hovered, ...systemConstants.theme.rDivBorderOverrideSettings.hovered },
        selected: { ...defaultRDivOverride.selected, ...systemConstants.theme.rDivBorderOverrideSettings.selected }
    } : defaultRDivOverride;

    const isRDiv = element.classList.contains('biz-resume-div');
    const n = isRDiv ? rDivOverride.normal : null;
    // rDiv: padding matches scene cDiv (borderSettings); override only margin-top + inner border width
    const effectiveBorderSettings = isRDiv && n ? {
        normal: { ...borderSettings.normal, innerBorderWidth: n.innerBorderWidth, marginTop: n.marginTop },
        hovered: { ...borderSettings.hovered, innerBorderWidth: n.innerBorderWidth, marginTop: n.marginTop },
        selected: { ...borderSettings.selected, innerBorderWidth: n.innerBorderWidth, marginTop: n.marginTop }
    } : borderSettings;

    // Set data attributes for all modes of the element
    element.setAttribute('data-background-color', backgroundColor);
    element.setAttribute('data-foreground-color', foregroundColor);
    element.setAttribute('data-background-color-selected', selectedBackgroundColor);
    element.setAttribute('data-foreground-color-selected', highlightedTextColor);
    element.setAttribute('data-icon-set-selected-url', highlightedIconSet.url);
    element.setAttribute('data-icon-set-selected-back', highlightedIconSet.back);
    element.setAttribute('data-icon-set-selected-img', highlightedIconSet.img);
    element.setAttribute('data-icon-set-selected-variant', highlightedIconSet.variant);
    element.setAttribute('data-icon-set-url', normalIconSet.url);
    element.setAttribute('data-icon-set-back', normalIconSet.back);
    element.setAttribute('data-icon-set-img', normalIconSet.img);
    element.setAttribute('data-icon-set-variant', normalIconSet.variant);
    element.setAttribute('data-icon-set-hovered-url', hoveredIconSet.url);
    element.setAttribute('data-icon-set-hovered-back', hoveredIconSet.back);
    element.setAttribute('data-icon-set-hovered-img', hoveredIconSet.img);
    element.setAttribute('data-icon-set-hovered-variant', hoveredIconSet.variant);
    element.setAttribute('data-background-color-hovered', hoveredBackgroundColor);
    element.setAttribute('data-foreground-color-hovered', hoveredForegroundColor);
    element.setAttribute('data-background-border-radius', borderRadius);

    // Set border and padding attributes from effective settings (rDiv uses normalized rDivOverride)
    element.setAttribute('data-normal-padding', effectiveBorderSettings.normal.padding);
    element.setAttribute('data-normal-inner-border-width', effectiveBorderSettings.normal.innerBorderWidth);
    element.setAttribute('data-normal-inner-border-color', effectiveBorderSettings.normal.innerBorderColor);
    element.setAttribute('data-normal-outer-border-width', effectiveBorderSettings.normal.outerBorderWidth);
    element.setAttribute('data-normal-outer-border-color', effectiveBorderSettings.normal.outerBorderColor);
    element.setAttribute('data-normal-border-radius', effectiveBorderSettings.normal.borderRadius);

    element.setAttribute('data-hovered-padding', effectiveBorderSettings.hovered.padding);
    element.setAttribute('data-hovered-inner-border-width', effectiveBorderSettings.hovered.innerBorderWidth);
    element.setAttribute('data-hovered-inner-border-color', effectiveBorderSettings.hovered.innerBorderColor);
    element.setAttribute('data-hovered-outer-border-width', effectiveBorderSettings.hovered.outerBorderWidth);
    element.setAttribute('data-hovered-outer-border-color', effectiveBorderSettings.hovered.outerBorderColor);
    element.setAttribute('data-hovered-border-radius', effectiveBorderSettings.hovered.borderRadius);

    element.setAttribute('data-selected-padding', effectiveBorderSettings.selected.padding);
    element.setAttribute('data-selected-inner-border-width', effectiveBorderSettings.selected.innerBorderWidth);
    element.setAttribute('data-selected-inner-border-color', effectiveBorderSettings.selected.innerBorderColor);
    element.setAttribute('data-selected-outer-border-width', effectiveBorderSettings.selected.outerBorderWidth);
    element.setAttribute('data-selected-outer-border-color', effectiveBorderSettings.selected.outerBorderColor);

    // Set CSS custom properties for use in CSS
    element.style.setProperty('--data-background-color', backgroundColor);
    element.style.setProperty('--data-foreground-color', foregroundColor);
    element.style.setProperty('--data-background-color-selected', selectedBackgroundColor);
    element.style.setProperty('--data-foreground-color-selected', highlightedTextColor);
    element.style.setProperty('--data-icon-set-selected-url', `url(${highlightedIconSet.url})`);
    element.style.setProperty('--data-icon-set-selected-back', `url(${highlightedIconSet.back})`);
    element.style.setProperty('--data-icon-set-selected-img', `url(${highlightedIconSet.img})`);
    element.style.setProperty('--data-icon-set-selected-variant', highlightedIconSet.variant);
    element.style.setProperty('--data-icon-set-url', `url(${normalIconSet.url})`);
    element.style.setProperty('--data-icon-set-back', `url(${normalIconSet.back})`);
    element.style.setProperty('--data-icon-set-img', `url(${normalIconSet.img})`);
    element.style.setProperty('--data-icon-set-variant', normalIconSet.variant);
    // Set as HTML attribute so CSS attribute selectors fire for all element types
    element.setAttribute('data-icon-set-variant', normalIconSet.variant);
    // Clear description icon filters; skill-card back icons sync below.
    element.querySelectorAll('.url-icon, .img-icon').forEach(icon => {
        icon.style.removeProperty('filter');
    });
    element.querySelectorAll('.skill-card-back-icons .back-icon').forEach(icon => {
        icon.style.removeProperty('filter');
    });
    element.style.setProperty('--data-icon-set-hovered-url', `url(${hoveredIconSet.url})`);
    element.style.setProperty('--data-icon-set-hovered-back', `url(${hoveredIconSet.back})`);
    element.style.setProperty('--data-icon-set-hovered-img', `url(${hoveredIconSet.img})`);
    element.style.setProperty('--data-icon-set-hovered-variant', hoveredIconSet.variant);
    element.style.setProperty('--data-background-color-hovered', hoveredBackgroundColor);
    element.style.setProperty('--data-foreground-color-hovered', hoveredForegroundColor);
    element.style.setProperty('--data-background-border-radius', borderRadius);
    /* Link color: same high-contrast as foreground so links are visible on card background */
    element.style.setProperty('--data-link-color', foregroundColor);
    element.style.setProperty('--data-link-color-hovered', hoveredForegroundColor);
    element.style.setProperty('--data-link-color-selected', highlightedTextColor);

    // Set CSS custom properties for border and padding. rDiv margin is container-controlled, not theme.
    element.style.setProperty('--data-normal-padding', effectiveBorderSettings.normal.padding);
    element.style.setProperty('--data-normal-inner-border-width', effectiveBorderSettings.normal.innerBorderWidth);
    element.style.setProperty('--data-normal-inner-border-color', effectiveBorderSettings.normal.innerBorderColor);
    element.style.setProperty('--data-normal-outer-border-width', effectiveBorderSettings.normal.outerBorderWidth);
    element.style.setProperty('--data-normal-outer-border-color', effectiveBorderSettings.normal.outerBorderColor);
    element.style.setProperty('--data-normal-border-radius', effectiveBorderSettings.normal.borderRadius);
    if (!isRDiv) element.style.setProperty('--data-normal-margin-top', effectiveBorderSettings.normal.marginTop ?? '0px');

    element.style.setProperty('--data-hovered-padding', effectiveBorderSettings.hovered.padding);
    element.style.setProperty('--data-hovered-inner-border-width', effectiveBorderSettings.hovered.innerBorderWidth);
    element.style.setProperty('--data-hovered-inner-border-color', effectiveBorderSettings.hovered.innerBorderColor);
    element.style.setProperty('--data-hovered-outer-border-width', effectiveBorderSettings.hovered.outerBorderWidth);
    element.style.setProperty('--data-hovered-outer-border-color', effectiveBorderSettings.hovered.outerBorderColor);
    element.style.setProperty('--data-hovered-border-radius', effectiveBorderSettings.hovered.borderRadius);
    if (!isRDiv) element.style.setProperty('--data-hovered-margin-top', effectiveBorderSettings.hovered.marginTop ?? '0px');

    element.style.setProperty('--data-selected-padding', effectiveBorderSettings.selected.padding);
    element.style.setProperty('--data-selected-inner-border-width', effectiveBorderSettings.selected.innerBorderWidth);
    element.style.setProperty('--data-selected-inner-border-color', effectiveBorderSettings.selected.innerBorderColor);
    element.style.setProperty('--data-selected-outer-border-width', effectiveBorderSettings.selected.outerBorderWidth);
    element.style.setProperty('--data-selected-outer-border-color', effectiveBorderSettings.selected.outerBorderColor);
    element.style.setProperty('--data-selected-border-radius', effectiveBorderSettings.selected.borderRadius);
    if (!isRDiv) element.style.setProperty('--data-selected-margin-top', effectiveBorderSettings.selected.marginTop ?? '0px');

    // Fill hex debug spans if present (biz-card-div / biz-resume-div): unhighlighted and highlighted; CSS bolds the visible one
    const hexNormalEl = element.querySelector('.hex-normal');
    const hexHighlightedEl = element.querySelector('.hex-highlighted');
    if (hexNormalEl) hexNormalEl.textContent = backgroundColor;
    if (hexHighlightedEl) hexHighlightedEl.textContent = selectedBackgroundColor;

    // Cards and resume rows use CSS vars only so normal/hovered/selected control background and text (no inline background or color).
    const useCssVarsOnly =
        element.classList.contains('biz-card-div')
        || element.classList.contains('biz-resume-div')
        || element.classList.contains('skill-card-div')
        || element.classList.contains('skill-resume-div')
        || element.classList.contains('appended-skill-resume-div');
    if (!useCssVarsOnly) {
        element.style.backgroundColor = backgroundColor;
        element.style.color = foregroundColor;
    }

    syncSkillCardBackLinkPresentation(element);
    // For useCssVarsOnly, color comes from CSS (var(--data-foreground-color), -hovered, -selected) so clone and rDiv selected states match
}

/**
 * Applies the current color palette to a specific HTML element (async wrapper; waits for palette catalog).
 * @param {HTMLElement} element The element to apply the palette colors to.
 */
export async function applyPaletteToElement(element) {
    if (!element) throw new Error('applyPaletteToElement: element is required');

    await readyPromise;
    if (isLoading.value) {
        await readyPromise;
    }

    const { appState } = useAppState();
    if (!appState.value) {
        throw new Error('AppState not available for palette application');
    }

    applyPaletteToElementSync(element, appState.value);
}

/**
 * Re-compute icon variant and text color using the visually effective background color,
 * which is the palette color dimmed by the card's Z-depth brightness filter.
 * Must be called after applyPaletteToElement() and after style.filter is set on the element.
 */
export function updateContrastForBrightness(element) {
    const rawBg = element.getAttribute('data-background-color')
    if (!rawBg || !rawBg.startsWith('#')) return

    const sceneZ = parseFloat(element.getAttribute('data-sceneZ'))
    const isSkillShell =
        element.classList.contains('skill-card-div')
        || element.classList.contains('skill-resume-div')
        || element.classList.contains('appended-skill-resume-div')
    if (Number.isNaN(sceneZ) && !isSkillShell) return

    const rgb = hexToRgb(rawBg)
    if (!rgb) return

    // Clone/hover paint at full brightness (CSS filter:none); don't read stale Z filter from style.filter.
    const isClone = element.classList.contains('clone')
    const isHovered = element.classList.contains('hovered') && !isClone
    let brightness = 1.0
    if (!isClone && !isHovered && !Number.isNaN(sceneZ)) {
        const filterStr = element.style.filter || ''
        const brightnessMatch = filterStr.match(/brightness\((\d+(?:\.\d+)?)%\)/)
        brightness = brightnessMatch ? parseFloat(brightnessMatch[1]) / 100 : 1.0
    }

    const effectiveRgb = {
        r: Math.min(255, Math.round(rgb.r * brightness)),
        g: Math.min(255, Math.round(rgb.g * brightness)),
        b: Math.min(255, Math.round(rgb.b * brightness)),
    }
    const effectiveHex = rgbToHex(effectiveRgb.r, effectiveRgb.g, effectiveRgb.b)
    const hoveredBg = element.getAttribute('data-background-color-hovered') || rawBg
    const selectedBg = element.getAttribute('data-background-color-selected') || rawBg
    const hoveredRgb = hexToRgb(hoveredBg) || rgb
    const selectedRgb = hexToRgb(selectedBg) || rgb

    const effectiveHoveredHex = rgbToHex(
        Math.min(255, Math.round(hoveredRgb.r * brightness)),
        Math.min(255, Math.round(hoveredRgb.g * brightness)),
        Math.min(255, Math.round(hoveredRgb.b * brightness))
    )
    const effectiveSelectedHex = rgbToHex(
        Math.min(255, Math.round(selectedRgb.r * brightness)),
        Math.min(255, Math.round(selectedRgb.g * brightness)),
        Math.min(255, Math.round(selectedRgb.b * brightness))
    )

    const normalStyle = resolveTextAndIconStyle(effectiveHex)
    const hoveredStyle = resolveTextAndIconStyle(effectiveHoveredHex)
    const selectedStyle = resolveTextAndIconStyle(effectiveSelectedHex)

    // Keep text/icon decisions in lock-step for all interaction states.
    element.setAttribute('data-icon-set-variant', normalStyle.iconSet.variant)
    element.setAttribute('data-icon-set-hovered-variant', hoveredStyle.iconSet.variant)
    element.setAttribute('data-icon-set-selected-variant', selectedStyle.iconSet.variant)
    element.style.setProperty('--data-icon-set-variant', normalStyle.iconSet.variant)
    element.style.setProperty('--data-icon-set-hovered-variant', hoveredStyle.iconSet.variant)
    element.style.setProperty('--data-icon-set-selected-variant', selectedStyle.iconSet.variant)
    element.style.setProperty('--data-foreground-color', normalStyle.textColor)
    element.style.setProperty('--data-foreground-color-hovered', hoveredStyle.textColor)
    element.style.setProperty('--data-foreground-color-selected', selectedStyle.textColor)
    element.style.setProperty('--data-link-color', normalStyle.linkColor)
    element.style.setProperty('--data-link-color-hovered', hoveredStyle.linkColor)
    element.style.setProperty('--data-link-color-selected', selectedStyle.linkColor)

    // Clear stale inline filter on description icons; skill-card back icons re-sync below.
    element.querySelectorAll('.url-icon, .img-icon').forEach(icon => {
        icon.style.removeProperty('filter')
    })
    element.querySelectorAll('.skill-card-back-icons .back-icon').forEach(icon => {
        icon.style.removeProperty('filter')
    })

    const isBizOrRDiv = element.classList.contains('biz-card-div') || element.classList.contains('biz-resume-div')
    if (!isBizOrRDiv) {
        element.style.color = normalStyle.textColor
    }

    syncSkillCardBackLinkPresentation(element)
}

function applySelectedStateColorsToElement(element) {
    const selectedBgColor = element.getAttribute('data-background-color-selected');
    const selectedFgColor = element.getAttribute('data-foreground-color-selected');
    
    if (selectedBgColor) {
        element.style.backgroundColor = selectedBgColor;
    }
    if (selectedFgColor) {
        element.style.color = selectedFgColor;
    }
    
    return { selectedBgColor, selectedFgColor };
}

