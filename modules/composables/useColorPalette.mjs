import { ref, watch, computed, getCurrentInstance } from 'vue';
import { useAppState } from './useAppState.ts';
import { parsePaletteJson, normalizePaletteColors, getHighContrastForBackground, getHighlightColor, formatHexDisplay, hexToRgb, rgbToHex } from 'color-palette-utils-ts';
import { getPerceivedBrightness } from '@/modules/utils/paletteHelpers.mjs';
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs';
import { reportError } from '@/modules/utils/errorReporting.mjs';

const PALETTE_DIR = './static_content/colorPalettes/';
const CATALOG_ENDPOINT = '/api/palette-catalog';
const MANIFEST_ENDPOINT = '/api/palette-manifest';
/** Base path for contrast icons (url/back/img); must contain icons8-{url,back,img}-16-black.png. */
const ICON_BASE = '/static_content/icons';

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
/** Per-palette background swatch: map palette name -> index. Each palette may define its own default background color via backgroundSwatchIndex in its JSON. */
const backgroundSwatchIndexByPalette = ref({});
const orderedPaletteNames = ref([]);
const filenameToNameMap = ref({});
const isLoading = ref(false);
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
    const paletteName = filenameToNameMap.value[filename];
    const colorPalette = colorPalettes.value[paletteName];
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
            const tempOrderedNames = [];

            const catalogResponse = await fetch(CATALOG_ENDPOINT);
            const catalogJson = catalogResponse.ok ? await catalogResponse.json() : null;
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
                    tempFilenameToNameMap[filename] = p.name;
                    tempOrderedNames.push(p.name);
                }
                loadedFromV2 = Object.keys(tempFilenameToNameMap).length > 0;
            }

            if (!loadedFromV2) {
                const response = await fetch(MANIFEST_ENDPOINT);
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
                    const filePath = PALETTE_DIR + filename;
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
            console.error("[ColorPalette] Failed to load color palettes:", error);
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
            if (currentPaletteFilename.value === filename && appState.value?.theme?.colorPalette === filename) {
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] No change needed - already using ${filename}`);
                return;
            }
            
            currentPaletteFilename.value = filename;
            
            // Update appState with new palette selection
            await updateAppState({
                "user-settings": {
                    theme: {
                        colorPalette: filename
                    }
                }
            });
            
            getElementRegistry()?.clearAllCache();
            
            // Reapply palette to all elements using optimized element registry
            const registry = getElementRegistry();
            const elements = (registry && registry.getAllElementsWithColorIndex) ? registry.getAllElementsWithColorIndex() : [];
            for (const element of elements) {
                await applyPaletteToElement(element);
            }
            
            // Apply palette to ALL rDivs and cDivs (including clones) using optimized queries
            const allRDivs = (registry && registry.getAllBizResumeDivs) ? registry.getAllBizResumeDivs() : [];
            for (const rDiv of allRDivs) {
                if (rDiv.hasAttribute('data-color-index')) {
                    await applyPaletteToElement(rDiv);
                }
            }
            
            const allCDivs = (registry && registry.getAllBizCardDivs) ? registry.getAllBizCardDivs() : [];
            const clones = allCDivs.filter(cDiv => cDiv.id.includes('-clone'));
            console.log(`[ColorPalette] 🔍 Found ${allCDivs.length} total cDivs, ${clones.length} are clones`);
            if (clones.length > 0) {
                console.log(`[ColorPalette] 📋 Clone IDs:`, clones.map(c => c.id));
            }
            
            for (const cDiv of allCDivs) {
                if (cDiv.hasAttribute('data-color-index')) {
                    console.log(`[ColorPalette] 🎨 Applying palette to ${cDiv.id} (${cDiv.id.includes('-clone') ? 'CLONE' : 'original'})`);
                    await applyPaletteToElement(cDiv);
                }
            }
            
            // Dispatch event for components that need to respond to palette changes
            const paletteName = filenameToNameMap.value[filename];
            window.dispatchEvent(new CustomEvent('color-palette-changed', {
                detail: { 
                    filename: filename,
                    paletteName: paletteName,
                    previousFilename: previousFilename
                }
            }));
            
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
        return filenameToNameMap.value[currentPaletteFilename.value] || null;
    });

    const currentPalette = computed(() => {
        const name = currentPaletteName.value;
        return name ? colorPalettes.value[name] : [];
    });
    
    // Function to update brightness factors
    async function updateBrightnessFactors(selectedFactor, hoveredFactor) {
        const updates = {};
        if (selectedFactor !== undefined) {
            updates.brightnessFactorSelected = selectedFactor;
        }
        if (hoveredFactor !== undefined) {
            updates.brightnessFactorHovered = hoveredFactor;
        }
        
        if (Object.keys(updates).length > 0) {
            await updateAppState({
                "system-constants": {
                    theme: updates
                }
            });
        }
        
        const registry = getElementRegistry();
        registry?.clearAllCache?.();
        
        // Reapply palette to all elements using optimized element registry
        const elements = registry?.getAllElementsWithColorIndex?.() || [];
        for (const element of elements) {
            await applyPaletteToElement(element);
        }
        
        // Apply palette to ALL rDivs and cDivs (including clones) using optimized queries
        const allRDivs = registry?.getAllBizResumeDivs?.() || [];
        for (const rDiv of allRDivs) {
            if (rDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(rDiv);
            }
        }
        
        const allCDivs = registry?.getAllBizCardDivs?.() || [];
        for (const cDiv of allCDivs) {
            if (cDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(cDiv);
            }
        }
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
        
        const registry = getElementRegistry();
        registry?.clearAllCache?.();
        
        // Reapply palette to all elements using optimized element registry
        const elements = registry?.getAllElementsWithColorIndex?.() || [];
        for (const element of elements) {
            await applyPaletteToElement(element);
        }
        
        // Apply palette to ALL rDivs and cDivs (including clones) using optimized queries
        const allRDivs = registry?.getAllBizResumeDivs?.() || [];
        for (const rDiv of allRDivs) {
            if (rDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(rDiv);
            }
        }
        
        const allCDivs = registry?.getAllBizCardDivs?.() || [];
        for (const cDiv of allCDivs) {
            if (cDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(cDiv);
            }
        }
    }

    // Color palette filename watcher - handles document-level theming
    watch(currentPaletteFilename, async (newFilename) => {
        if (!newFilename) return;
        
        const paletteName = filenameToNameMap.value[newFilename];
        const colorPalette = colorPalettes.value[paletteName];

        // Wait for both filename mapping and palette data to be loaded
        if (!paletteName || !colorPalette || colorPalette.length === 0) return;

        // Apply scene view background (--background-light, --background-dark) from current palette
        applySceneBackgroundFromCurrentPalette();

        const registry = getElementRegistry();
        registry?.clearAllCache?.();
        
        // Update elements with data-color-index using optimized element registry
        const elements = registry?.getAllElementsWithColorIndex?.() || [];
        window.CONSOLE_LOG_IGNORE(`[ColorPalette] Found ${elements.length} elements with data-color-index to update`);
        
        for (const element of elements) {
            const paletteColorIndexAttr = element.getAttribute("data-color-index");
            if (paletteColorIndexAttr === null || isNaN(parseInt(paletteColorIndexAttr, 10))) continue;
            
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Updating element ${element.id || element.className} with color index ${paletteColorIndexAttr}`);
            
            // Use the applyPaletteToElement function to set all data attributes
            await applyPaletteToElement(element);
            
            // Check if colors were actually applied
            const bgColor = element.getAttribute('data-background-color');
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Element ${element.id || element.className} background color set to: ${bgColor}`);
        }
        
        // Apply palette to ALL rDivs and cDivs (including clones) using optimized queries
        const allRDivs = registry?.getAllBizResumeDivs?.() || [];
        window.CONSOLE_LOG_IGNORE(`[ColorPalette] Found ${allRDivs.length} rDivs to check for color updates`);
        for (const rDiv of allRDivs) {
            if (rDiv.hasAttribute('data-color-index')) {
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] Updating rDiv ${rDiv.id} with color index ${rDiv.getAttribute('data-color-index')}`);
                await applyPaletteToElement(rDiv);
            }
        }
        
        const allCDivs = registry?.getAllBizCardDivs?.() || [];
        window.CONSOLE_LOG_IGNORE(`[ColorPalette] Found ${allCDivs.length} cDivs to check for color updates`);
        for (const cDiv of allCDivs) {
            if (cDiv.hasAttribute('data-color-index')) {
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] Updating cDiv ${cDiv.id} with color index ${cDiv.getAttribute('data-color-index')}`);
                await applyPaletteToElement(cDiv);
                
                // Check current styling state
                const computedStyle = window.getComputedStyle(cDiv);
                const bgColor = cDiv.getAttribute('data-background-color');
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] cDiv ${cDiv.id} - data-background-color: ${bgColor}, computed background-color: ${computedStyle.backgroundColor}`);
            }
        }

        // After updating all palette data, refresh the current visual state of all elements

    }, { immediate: true }); // Run this watcher as soon as the composable is used

    // Additional watcher to trigger palette application when colorPalettes are loaded
    watch(colorPalettes, () => {
        // Trigger palette application when palettes are loaded and we have a current filename
        if (currentPaletteFilename.value) {
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Palettes loaded, re-applying current palette: ${currentPaletteFilename.value}`);
            // Re-trigger the main watcher by setting the filename again
            const filename = currentPaletteFilename.value;
            currentPaletteFilename.value = null;
            currentPaletteFilename.value = filename;
        }
    }, { deep: true });

    // Return all the reactive state and methods
    return {
        colorPalettes,
        orderedPaletteNames,
        filenameToNameMap,
        isLoading,
        currentPaletteFilename,
        currentPaletteName,
        currentPalette,
        setCurrentPalette,
        loadPalettes,
        updateBrightnessFactors,
        updateBorderSettings,
        applyCurrentPaletteToAllElements: applyCurrentPaletteToAllElementsImpl,
    };
}

/**
 * Apply the current palette to all elements that have data-color-index (cDivs, rDivs, skill cards).
 * Call after initial DOM build (cards + resume list) so palette is applied on first load.
 * @param {{ clearAllCache?: () => void, getAllElementsWithColorIndex?: () => HTMLElement[] }} [registry] - optional; uses window.globalElementRegistry if not provided
 */
export async function applyCurrentPaletteToAllElements(registry = null) {
    await readyPromise;
    if (!currentPaletteFilename.value) return;
    const reg = registry || (typeof window !== 'undefined' && window.globalElementRegistry);
    if (!reg?.clearAllCache) return;
    reg.clearAllCache();
    applySceneBackgroundFromCurrentPalette();
    const elements = reg.getAllElementsWithColorIndex?.() || [];
    for (const element of elements) {
        const paletteColorIndexAttr = element.getAttribute('data-color-index');
        if (paletteColorIndexAttr === null || isNaN(parseInt(paletteColorIndexAttr, 10))) continue;
        try {
            await applyPaletteToElement(element);
        } catch (err) {
            console.warn('[ColorPalette] applyCurrentPaletteToAllElements:', element.id || element.className, err);
        }
    }
    const filename = currentPaletteFilename.value;
    const paletteName = filenameToNameMap.value[filename];
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('color-palette-changed', {
            detail: { filename, paletteName, previousFilename: null }
        }));
    }
}

async function applyCurrentPaletteToAllElementsImpl() {
    let reg = null;
    try {
        reg = injectGlobalElementRegistry();
    } catch {
        reg = typeof window !== 'undefined' ? window.globalElementRegistry : null;
    }
    return applyCurrentPaletteToAllElements(reg);
}

/**
 * Applies the current color palette to a specific HTML element.
 * Calculates and sets data attributes for all color states (normal, selected, hovered).
 * Palette swatch index comes from element’s data-color-index: biz cards use their job ID;
 * skill cards use the job ID of the first job that referenced that skill (same index → same colors).
 * @param {HTMLElement} element The element to apply the palette colors to.
 */
export async function applyPaletteToElement(element) {
    if (!element) throw new Error('applyPaletteToElement: element is required');

    // Access the centralized app state
    const { appState } = useAppState();

    // Wait for palettes to be loaded before applying
    if (isLoading.value) {
        await readyPromise;
    }

    // Ensure appState is available
    if (!appState.value) {
        console.warn('[applyPaletteToElement] ❌ AppState not loaded, skipping palette application');
        console.warn('[applyPaletteToElement] appState.value:', appState.value);
        throw new Error('AppState not available for palette application');
    }
    
    // console.log('[applyPaletteToElement] AppState available, checking palettes...');
    // console.log('[applyPaletteToElement] appState.value.color:', appState.value.color);

    // Use a data-attribute for the palette color index, assuming it's set on the element
    const paletteColorIndexAttr = element.getAttribute('data-color-index');

    // If the attribute is not set or is not a valid number,
    // this element has not been configured for color theming
    if (paletteColorIndexAttr === null || isNaN(parseInt(paletteColorIndexAttr, 10))) {
        console.warn(`[applyPaletteToElement] ❌ Element missing or invalid data-color-index: "${paletteColorIndexAttr}"`);
        throw new Error(`Element missing data-color-index attribute`);
    }
    const paletteColorIndex = parseInt(paletteColorIndexAttr, 10);

    // Get the palette name from the filename
    if (!currentPaletteFilename.value) {
        throw new Error('No palette filename set; cannot apply palette');
    }
    
    const paletteName = filenameToNameMap.value[currentPaletteFilename.value];
    if (!paletteName) {
        throw new Error(`Palette name not found for filename: ${currentPaletteFilename.value}`);
    }

    // Get palette from the reactive colorPalettes (loaded dynamically, not stored in appState)
    const colorPalette = colorPalettes.value[paletteName];
    if (!colorPalette) {
        console.error(`[applyPaletteToElement] Color palette not found for name: ${paletteName}`);
        console.error(`[applyPaletteToElement] Available palettes:`, Object.keys(colorPalettes.value || {}));
        console.error(`[applyPaletteToElement] Requested palette name: ${paletteName}`);
        throw new Error(`Color palette not found for name: ${paletteName}`);
    }

    // Calculate base colors (palette-utils-ts: LCH-based highlight, high-contrast text + icons from single call)
    const backgroundColor = formatHexDisplay(colorPalette[paletteColorIndex % colorPalette.length]) || colorPalette[paletteColorIndex % colorPalette.length];
    const normalContrast = getHighContrastForBackground(backgroundColor, { iconBase: ICON_BASE });
    const foregroundColor = normalContrast.textColor;
    const normalIconSet = normalContrast.iconSet;

    const systemConstants = appState.value["system-constants"];
    // Selected: single knob 135 → L >= floor(100/1.35) darken (L'=L/1.35), else brighten (L'=L*1.35).
    const selectedHighlightPercent = systemConstants?.theme?.selectedHighlightPercent ?? 135;
    const selectedBrightenFactor = selectedHighlightPercent / 100;
    const highLuminosityThreshold = Math.floor(100 / selectedBrightenFactor);

    const selectedBackgroundColor = getHighlightColor(backgroundColor, {
        highlightPercent: selectedHighlightPercent,
        nearlyWhiteL: highLuminosityThreshold
    });
    const highlightedContrast = getHighContrastForBackground(selectedBackgroundColor, { iconBase: ICON_BASE });
    const highlightedTextColor = highlightedContrast.textColor;
    const highlightedIconSet = highlightedContrast.iconSet;

    // Hover = (unselected + selected) / 2 in RGB — no brightness factor. Palette colors are validated at startup.
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
    const hoveredContrast = getHighContrastForBackground(hoveredBackgroundColor, { iconBase: ICON_BASE });
    const hoveredForegroundColor = hoveredContrast.textColor;
    const hoveredIconSet = hoveredContrast.iconSet;

    const borderRadius = appState.value.theme?.borderRadius || '25px';

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
        normal: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
        hovered: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' },
        selected: { padding: '15px', innerBorderWidth: '1px', marginTop: '11px' }
    };
    const rDivOverride = systemConstants?.theme?.rDivBorderOverrideSettings ? {
        normal: { ...defaultRDivOverride.normal, ...systemConstants.theme.rDivBorderOverrideSettings.normal },
        hovered: { ...defaultRDivOverride.hovered, ...systemConstants.theme.rDivBorderOverrideSettings.hovered },
        selected: { ...defaultRDivOverride.selected, ...systemConstants.theme.rDivBorderOverrideSettings.selected }
    } : defaultRDivOverride;

    const isRDiv = element.classList.contains('biz-resume-div');
    const n = isRDiv ? rDivOverride.normal : null;
    // For rDiv: same padding, border width, margin-top in all states (normalized from .normal)
    const effectiveBorderSettings = isRDiv && n ? {
        normal: { ...borderSettings.normal, padding: n.padding, innerBorderWidth: n.innerBorderWidth, marginTop: n.marginTop },
        hovered: { ...borderSettings.hovered, padding: n.padding, innerBorderWidth: n.innerBorderWidth, marginTop: n.marginTop },
        selected: { ...borderSettings.selected, padding: n.padding, innerBorderWidth: n.innerBorderWidth, marginTop: n.marginTop }
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
    // Directly set filter on icon children — same decision as textColor/variant, computed once, applied to both
    const normalIconFilter = normalIconSet.variant === 'white' ? 'invert(1)' : 'none';
    element.querySelectorAll('.back-icon, .url-icon, .img-icon').forEach(icon => {
        icon.style.filter = normalIconFilter;
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

    // Apply inline styles. cDiv, clone, and rDiv use CSS vars only so normal/hovered/selected control both background and text (no inline background or color).
    const useCssVarsOnly = element.classList.contains('biz-card-div') || element.classList.contains('biz-resume-div');
    if (!useCssVarsOnly) {
        element.style.backgroundColor = backgroundColor;
        element.style.color = foregroundColor;
    }
    // For useCssVarsOnly, color comes from CSS (var(--data-foreground-color), -hovered, -selected) so clone and rDiv selected states match
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
    if (isNaN(sceneZ)) return

    // Derive brightness factor from the same filter function used when rendering
    // brightness() CSS filter: 1.0 = full, <1.0 = darker
    const rgb = hexToRgb(rawBg)
    if (!rgb) return

    // Import brightness value inline to avoid circular deps — matches filters.get_brightness_value_from_z
    // brightness is stored as a CSS filter string; read it from style.filter instead
    const filterStr = element.style.filter || ''
    const brightnessMatch = filterStr.match(/brightness\((\d+(?:\.\d+)?)%\)/)
    const brightness = brightnessMatch ? parseFloat(brightnessMatch[1]) / 100 : 1.0

    const effectiveRgb = {
        r: Math.min(255, Math.round(rgb.r * brightness)),
        g: Math.min(255, Math.round(rgb.g * brightness)),
        b: Math.min(255, Math.round(rgb.b * brightness)),
    }
    const effectiveHex = rgbToHex(effectiveRgb.r, effectiveRgb.g, effectiveRgb.b)
    const contrast = getHighContrastForBackground(effectiveHex, { iconBase: ICON_BASE })

    // Update normal-state icon variant, text color, and link color from effective background
    element.setAttribute('data-icon-set-variant', contrast.iconSet.variant)
    element.style.setProperty('--data-icon-set-variant', contrast.iconSet.variant)
    element.style.setProperty('--data-foreground-color', contrast.textColor)
    element.style.setProperty('--data-link-color', contrast.textColor)

    // Directly set filter on icon elements — CSS attribute selector approach is unreliable
    const iconFilter = contrast.iconSet.variant === 'white' ? 'invert(1)' : 'none'
    element.querySelectorAll('.back-icon, .url-icon, .img-icon').forEach(icon => {
        icon.style.filter = iconFilter
    })

    const isBizOrRDiv = element.classList.contains('biz-card-div') || element.classList.contains('biz-resume-div')
    if (!isBizOrRDiv) {
        element.style.color = contrast.textColor
    }
}

export function applySelectedStateColorsToElement(element) {
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

