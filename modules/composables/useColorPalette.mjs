import { ref, watch, computed, getCurrentInstance } from 'vue';
import { useAppState } from './useAppState.ts';
import { parsePaletteJson, normalizePaletteColors, getHighContrastMono, getHighlightColor, getContrastIconSet, hexToRgb } from 'color-palette-utils-ts';
import { getPerceivedBrightness } from '@/modules/utils/paletteHelpers.mjs';
import { injectGlobalElementRegistry } from './useGlobalElementRegistry.mjs';

const PALETTE_DIR = './static_content/colorPalettes/';
const MANIFEST_ENDPOINT = '/api/palette-manifest';
/** Base path for contrast icons (url/back/img); must contain icons8-{url,back,img}-16-black.png. */
const ICON_BASE = '/static_content/icons';

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
            
            // Now it's safe to access appState.
            currentPaletteFilename.value = appState.value["user-settings"].theme.colorPalette;
            // console.log(`[ColorPalette] Initialized currentPaletteFilename from appState.colorPalette: ${appState.value.theme.colorPalette}`);

            const response = await fetch(MANIFEST_ENDPOINT);
            if (!response.ok) throw new Error('Failed to fetch palette manifest');
            const manifestData = await response.json();
            // console.log(`[ColorPalette] Loaded manifest with ${manifestData.length} palette files`);

            const tempLoadedColorPalettes = {};
            const tempBackgroundSwatchIndexByPalette = {};
            const tempFilenameToNameMap = {};
            const tempOrderedNames = [];

            for (const filename of manifestData) {
                try {
                    const filePath = PALETTE_DIR + filename;
                    const paletteResponse = await fetch(filePath);
                    if (!paletteResponse.ok) continue;
                    const raw = await paletteResponse.text();
                    const paletteData = parsePaletteJson(raw);
                    if (paletteData) {
                        normalizePaletteColors(paletteData.colors);
                        tempLoadedColorPalettes[paletteData.name] = paletteData.colors;
                        if (paletteData.backgroundSwatchIndex != null) {
                            tempBackgroundSwatchIndexByPalette[paletteData.name] = Math.max(0, Math.floor(paletteData.backgroundSwatchIndex)) % paletteData.colors.length;
                        }
                        tempFilenameToNameMap[filename] = paletteData.name;
                        tempOrderedNames.push(paletteData.name);
                    }
                } catch (err) {
                    // skip invalid or failed palette files
                }
            }
            
            colorPalettes.value = tempLoadedColorPalettes;
            backgroundSwatchIndexByPalette.value = tempBackgroundSwatchIndexByPalette;
            filenameToNameMap.value = tempFilenameToNameMap;
            orderedPaletteNames.value = tempOrderedNames;
            
            // console.log(`[ColorPalette] Successfully loaded ${tempOrderedNames.length} palettes:`, tempOrderedNames);
            // console.log(`[ColorPalette] Updated refs - orderedPaletteNames:`, orderedPaletteNames.value);
            // console.log(`[ColorPalette] Updated refs - filenameToNameMap:`, filenameToNameMap.value);
            
            // Note: We no longer store palettes in appState - they're loaded dynamically
            
            // IMPORTANT: Ensure colorPalette is set correctly in theme section
            if (!appState.value["user-settings"].theme.colorPalette && Object.keys(tempFilenameToNameMap).length > 0) {
                const firstFilename = Object.keys(tempFilenameToNameMap)[0];
                await updateAppState({
                    "user-settings": {
                        theme: {
                            colorPalette: firstFilename
                        }
                    }
                });
                // console.log(`[ColorPalette] Set theme.colorPalette to: ${firstFilename}`);
            }
            
            if (!currentPaletteFilename.value && Object.keys(tempFilenameToNameMap).length > 0) {
                currentPaletteFilename.value = Object.keys(tempFilenameToNameMap)[0];
                // console.log(`[ColorPalette] Set default palette to: ${currentPaletteFilename.value}`);
            }

        } catch (error) {
            console.error("[ColorPalette] Failed to load color palettes:", error);
            // Handle error case, maybe set a default palette
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
        
        if (filename && filenameToNameMap.value[filename]) {
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
            
        } else {
            // console.warn(`[ColorPalette] setCurrentPalette called with invalid filename: ${filename}`);
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Available palettes:`, Object.keys(filenameToNameMap.value));
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

        // Apply document-level styles using palette-utils-ts (LCH-based darkening). Each palette may use a different swatch as its background.
        const root = document.documentElement;
        const bgIndex = backgroundSwatchIndexByPalette.value[paletteName];
        const baseBackgroundHex = (bgIndex != null && colorPalette[bgIndex] != null)
            ? colorPalette[bgIndex]
            : colorPalette.reduce((darkest, current) => {
                return getPerceivedBrightness(current) < getPerceivedBrightness(darkest) ? current : darkest;
            }, colorPalette[0]);

        const darkHex = baseBackgroundHex || '#333333';
        const darkerHex = getHighlightColor(darkHex, { highlightPercent: 45 });
        const darkestHex = getHighlightColor(darkHex, { highlightPercent: 15 });
        const darkerRgb = hexToRgb(darkerHex) || { r: 51, g: 51, b: 51 };
        const darkestRgb = hexToRgb(darkestHex) || { r: 26, g: 26, b: 26 };

        root.style.setProperty('--background-light', `rgba(${darkerRgb.r}, ${darkerRgb.g}, ${darkerRgb.b}, 1.0)`);
        root.style.setProperty('--background-dark', `rgba(${darkestRgb.r}, ${darkestRgb.g}, ${darkestRgb.b}, 1.0)`);

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
    };
}

/**
 * Applies the current color palette to a specific HTML element.
 * Calculates and sets data attributes for all color states (normal, selected, hovered).
 * @param {HTMLElement} element The element to apply the palette colors to.
 */
export async function applyPaletteToElement(element) {
    if (!element) return;

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
        console.warn('No palette filename set, skipping palette application');
        return;
    }
    
    const paletteName = filenameToNameMap.value[currentPaletteFilename.value];
    if (!paletteName) {
        console.warn(`Palette name not found for filename: ${currentPaletteFilename.value}`);
        return;
    }

    // Get palette from the reactive colorPalettes (loaded dynamically, not stored in appState)
    const colorPalette = colorPalettes.value[paletteName];
    if (!colorPalette) {
        console.error(`[applyPaletteToElement] Color palette not found for name: ${paletteName}`);
        console.error(`[applyPaletteToElement] Available palettes:`, Object.keys(colorPalettes.value || {}));
        console.error(`[applyPaletteToElement] Requested palette name: ${paletteName}`);
        throw new Error(`Color palette not found for name: ${paletteName}`);
    }

    // Calculate base colors (palette-utils-ts: LCH-based highlight, high-contrast mono text)
    const backgroundColor = colorPalette[paletteColorIndex % colorPalette.length];
    const foregroundColor = getHighContrastMono(backgroundColor);

    const systemConstants = appState.value["system-constants"];
    const brightnessFactorSelected = systemConstants?.theme?.brightnessFactorSelected ?? 2.0;
    const brightnessFactorHovered = systemConstants?.theme?.brightnessFactorHovered ?? 1.5;
    const highlightPercentSelected = Math.round(brightnessFactorSelected * 100);
    const highlightPercentHovered = Math.round(brightnessFactorHovered * 100);

    const selectedBackgroundColor = getHighlightColor(backgroundColor, { highlightPercent: highlightPercentSelected });
    // Secondary colors for highlighted (selected): white on dark background, black on light (palette-utils)
    const highlightedTextColor = getHighContrastMono(selectedBackgroundColor);
    const highlightedIconSet = getContrastIconSet(selectedBackgroundColor, { iconBase: ICON_BASE }); /* usage: see docs/CONTRAST-ICONS-FLOCK-OF-POSTCARDS.md */

    const hoveredBackgroundColor = getHighlightColor(backgroundColor, { highlightPercent: highlightPercentHovered });
    const hoveredForegroundColor = getHighContrastMono(hoveredBackgroundColor);
    const hoveredIconSet = getContrastIconSet(hoveredBackgroundColor, { iconBase: ICON_BASE });

    const normalIconSet = getContrastIconSet(backgroundColor, { iconBase: ICON_BASE });

    const borderRadius = appState.value.theme?.borderRadius || '25px';

    // Get global border and padding settings from appState (with defaults) - create deep copy to avoid readonly proxy issues
    const defaultBorderSettings = {
        normal: {
            padding: '8px', // 8px padding + 2px border = 10px total, matching CSS expectations
            innerBorderWidth: '2px',
            innerBorderColor: 'white',
            outerBorderWidth: '0px',
            outerBorderColor: 'transparent',
            marginTop: '0px', // Top margin for vertical separation
            borderRadius: '25px'
        },
        hovered: {
            padding: '7px', // 7px padding + 3px border = 10px total, matching CSS expectations
            innerBorderWidth: '3px',
            innerBorderColor: 'rgba(255, 255, 255, 0.8)',
            outerBorderWidth: '0px',
            outerBorderColor: 'transparent',
            marginTop: '0px', // Top margin for vertical separation
            borderRadius: '25px'
        },
        selected: {
            padding: '6px', // 6px padding + 3px inner + 1px outer = 10px total
            innerBorderWidth: '3px',
            innerBorderColor: 'purple',
            outerBorderWidth: '1px',
            outerBorderColor: 'purple',
            marginTop: '0px', // Top margin for vertical separation
            borderRadius: '25px'
        }
    };

    // Create a deep copy to avoid readonly proxy issues
    // systemConstants already declared above - reuse it
    const borderSettings = systemConstants?.theme?.borderSettings ? {
        normal: { ...systemConstants.theme.borderSettings.normal },
        hovered: { ...systemConstants.theme.borderSettings.hovered },
        selected: { ...systemConstants.theme.borderSettings.selected }
    } : defaultBorderSettings;

    // BizCard (cDiv) and bizCardLineItem (rDiv) border styling must always be identical. rDiv uses override when set.
    if ( element.classList.contains('biz-resume-div') ) {
        const rDivBorderOverrideSettings = systemConstants?.theme?.rDivBorderOverrideSettings;
        if (rDivBorderOverrideSettings) {
            borderSettings.normal.padding = rDivBorderOverrideSettings.normal.padding;
            borderSettings.normal.innerBorderWidth = rDivBorderOverrideSettings.normal.innerBorderWidth;
            borderSettings.normal.marginTop = rDivBorderOverrideSettings.normal.marginTop;
            borderSettings.hovered.padding = rDivBorderOverrideSettings.hovered.padding;
            borderSettings.hovered.innerBorderWidth = rDivBorderOverrideSettings.hovered.innerBorderWidth;
            borderSettings.hovered.marginTop = rDivBorderOverrideSettings.hovered.marginTop;
            borderSettings.selected.padding = rDivBorderOverrideSettings.selected.padding;
            borderSettings.selected.innerBorderWidth = rDivBorderOverrideSettings.selected.innerBorderWidth;
            borderSettings.selected.marginTop = rDivBorderOverrideSettings.selected.marginTop;
        }
    }

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

    // Set border and padding attributes for normal, hovered, and selected modes
    element.setAttribute('data-normal-padding', borderSettings.normal.padding);
    element.setAttribute('data-normal-inner-border-width', borderSettings.normal.innerBorderWidth);
    element.setAttribute('data-normal-inner-border-color', borderSettings.normal.innerBorderColor);
    element.setAttribute('data-normal-outer-border-width', borderSettings.normal.outerBorderWidth);
    element.setAttribute('data-normal-outer-border-color', borderSettings.normal.outerBorderColor);
    element.setAttribute('data-normal-border-radius', borderSettings.normal.borderRadius);

    element.setAttribute('data-hovered-padding', borderSettings.hovered.padding);
    element.setAttribute('data-hovered-inner-border-width', borderSettings.hovered.innerBorderWidth);
    element.setAttribute('data-hovered-inner-border-color', borderSettings.hovered.innerBorderColor);
    element.setAttribute('data-hovered-outer-border-width', borderSettings.hovered.outerBorderWidth);
    element.setAttribute('data-hovered-outer-border-color', borderSettings.hovered.outerBorderColor);
    element.setAttribute('data-hovered-border-radius', borderSettings.hovered.borderRadius);

    element.setAttribute('data-selected-padding', borderSettings.selected.padding);
    element.setAttribute('data-selected-inner-border-width', borderSettings.selected.innerBorderWidth);
    element.setAttribute('data-selected-inner-border-color', borderSettings.selected.innerBorderColor);
    element.setAttribute('data-selected-outer-border-width', borderSettings.selected.outerBorderWidth);
    element.setAttribute('data-selected-outer-border-color', borderSettings.selected.outerBorderColor);

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
    element.style.setProperty('--data-icon-set-hovered-url', `url(${hoveredIconSet.url})`);
    element.style.setProperty('--data-icon-set-hovered-back', `url(${hoveredIconSet.back})`);
    element.style.setProperty('--data-icon-set-hovered-img', `url(${hoveredIconSet.img})`);
    element.style.setProperty('--data-icon-set-hovered-variant', hoveredIconSet.variant);
    element.style.setProperty('--data-background-color-hovered', hoveredBackgroundColor);
    element.style.setProperty('--data-foreground-color-hovered', hoveredForegroundColor);
    element.style.setProperty('--data-background-border-radius', borderRadius);

    // Set CSS custom properties for border and padding
    element.style.setProperty('--data-normal-padding', borderSettings.normal.padding);
    element.style.setProperty('--data-normal-inner-border-width', borderSettings.normal.innerBorderWidth);
    element.style.setProperty('--data-normal-inner-border-color', borderSettings.normal.innerBorderColor);
    element.style.setProperty('--data-normal-outer-border-width', borderSettings.normal.outerBorderWidth);
    element.style.setProperty('--data-normal-outer-border-color', borderSettings.normal.outerBorderColor);
    element.style.setProperty('--data-normal-margin-top', borderSettings.normal.marginTop);
    element.style.setProperty('--data-normal-border-radius', borderSettings.normal.borderRadius);

    element.style.setProperty('--data-hovered-padding', borderSettings.hovered.padding);
    element.style.setProperty('--data-hovered-inner-border-width', borderSettings.hovered.innerBorderWidth);
    element.style.setProperty('--data-hovered-inner-border-color', borderSettings.hovered.innerBorderColor);
    element.style.setProperty('--data-hovered-outer-border-width', borderSettings.hovered.outerBorderWidth);
    element.style.setProperty('--data-hovered-outer-border-color', borderSettings.hovered.outerBorderColor);
    element.style.setProperty('--data-hovered-margin-top', borderSettings.hovered.marginTop);
    element.style.setProperty('--data-hovered-border-radius', borderSettings.hovered.borderRadius);

    element.style.setProperty('--data-selected-padding', borderSettings.selected.padding);
    element.style.setProperty('--data-selected-inner-border-width', borderSettings.selected.innerBorderWidth);
    element.style.setProperty('--data-selected-inner-border-color', borderSettings.selected.innerBorderColor);
    element.style.setProperty('--data-selected-outer-border-width', borderSettings.selected.outerBorderWidth);
    element.style.setProperty('--data-selected-outer-border-color', borderSettings.selected.outerBorderColor);
    element.style.setProperty('--data-selected-margin-top', borderSettings.selected.marginTop);
    element.style.setProperty('--data-selected-border-radius', borderSettings.selected.borderRadius);


    // Apply inline styles directly to ensure they work
    element.style.backgroundColor = backgroundColor;
    element.style.color = foregroundColor;
    // The normal state will be applied when needed by the state system
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

