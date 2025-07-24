import { ref, onMounted, watch, computed, getCurrentInstance } from 'vue';
import { AppState, saveState, initializeState } from '@/modules/core/stateManager.mjs';
import * as colorUtils from '@/modules/utils/colorUtils.mjs';

const PALETTE_DIR = './static_content/colorPalettes/';
const MANIFEST_ENDPOINT = '/api/palette-manifest';

// --- Reactive State ---
// This state is shared across all components that use this composable
const colorPalettes = ref({});
const orderedPaletteNames = ref([]);
const filenameToNameMap = ref({});
const isLoading = ref(true);
let resolveReady;
export const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
// Initialize from the global state, but allow it to be updated locally
const currentPaletteFilename = ref(null);

// --- The Composable Function ---
export function useColorPalette() {

    async function loadPalettes() {
        if (!isLoading.value) return; // Don't reload if already loaded
        
        try {
            // First, ensure the application state is loaded.
            await initializeState();
            
            // Now it's safe to access AppState.
            currentPaletteFilename.value = AppState.colorPalette;
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Initialized currentPaletteFilename from AppState.colorPalette: ${AppState.colorPalette}`);

            const response = await fetch(MANIFEST_ENDPOINT);
            if (!response.ok) throw new Error('Failed to fetch palette manifest');
            const manifestData = await response.json();

            const tempLoadedColorPalettes = {};
            const tempFilenameToNameMap = {};
            const tempOrderedNames = [];

            for (const filename of manifestData) {
                const filePath = PALETTE_DIR + filename;
                const paletteResponse = await fetch(filePath);
                const paletteData = await paletteResponse.json();

                if (paletteData && paletteData.name && Array.isArray(paletteData.colors)) {
                    tempLoadedColorPalettes[paletteData.name] = paletteData.colors;
                    tempFilenameToNameMap[filename] = paletteData.name;
                    tempOrderedNames.push(paletteData.name);
                }
            }
            
            colorPalettes.value = tempLoadedColorPalettes;
            filenameToNameMap.value = tempFilenameToNameMap;
            orderedPaletteNames.value = tempOrderedNames;
            // Assign colorPalettes to AppState.color.palettes after loading
            if (!AppState.color) AppState.color = {};
            AppState.color.palettes = tempLoadedColorPalettes;
            
            if (!currentPaletteFilename.value && Object.keys(tempFilenameToNameMap).length > 0) {
                currentPaletteFilename.value = Object.keys(tempFilenameToNameMap)[0];
            }

        } catch (error) {
            window.CONSOLE_LOG_IGNORE("Failed to load color palettes:", error);
            // Handle error case, maybe set a default palette
        } finally {
            isLoading.value = false;
            if (resolveReady) resolveReady();
        }
    }

    // Check if we're inside a Vue component instance
    const instance = getCurrentInstance();
    
    // Load palettes only once when the app starts (only if inside a Vue component)
    if (instance) {
        onMounted(loadPalettes);
    } else {
        // If called outside a component, load immediately
        loadPalettes();
    }

    function setCurrentPalette(filename) {
        if (filename && filenameToNameMap.value[filename]) {
            const previousFilename = currentPaletteFilename.value;
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] setCurrentPalette called: ${previousFilename} → ${filename}`);
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] AppState.colorPalette: ${AppState.colorPalette}`);
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] currentPaletteFilename.value: ${currentPaletteFilename.value}`);
            
            // Check if AppState and reactive state are in sync
            if (AppState.colorPalette !== currentPaletteFilename.value) {
                console.warn(`[ColorPalette] State mismatch detected! AppState: ${AppState.colorPalette}, reactive: ${currentPaletteFilename.value}`);
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] User selected ${filename}, proceeding with user choice`);
            }
            
            // Only proceed if actually changing to a different palette from what user selected
            if (currentPaletteFilename.value === filename && AppState.colorPalette === filename) {
                window.CONSOLE_LOG_IGNORE(`[ColorPalette] No change needed - already using ${filename}`);
                return;
            }
            
            currentPaletteFilename.value = filename;
            AppState.colorPalette = filename;
            saveState(AppState);
            
            // Dispatch event for components that need to respond to palette changes
            const paletteName = filenameToNameMap.value[filename];
            window.dispatchEvent(new CustomEvent('color-palette-changed', {
                detail: { 
                    filename: filename,
                    paletteName: paletteName,
                    previousFilename: previousFilename
                }
            }));
            
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Palette changed from ${previousFilename} to ${filename} (${paletteName}), event dispatched`);
        } else {
            console.warn(`[ColorPalette] setCurrentPalette called with invalid filename: ${filename}`);
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
        if (selectedFactor !== undefined) {
            AppState.theme.brightnessFactorSelected = selectedFactor;
        }
        if (hoveredFactor !== undefined) {
            AppState.theme.brightnessFactorHovered = hoveredFactor;
        }
        saveState(AppState);
        
        // Reapply palette to all elements to update their data attributes
        const elements = document.querySelectorAll('[data-color-index]');
        for (const element of elements) {
            await applyPaletteToElement(element);
        }
        
        // Apply palette to ALL rDivs and cDivs (including clones) regardless of data-color-index
        const allRDivs = document.querySelectorAll('.biz-resume-div');
        for (const rDiv of allRDivs) {
            if (rDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(rDiv);
            }
        }
        
        const allCDivs = document.querySelectorAll('.biz-card-div');
        for (const cDiv of allCDivs) {
            if (cDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(cDiv);
            }
        }
    }

    // Function to update border settings
    async function updateBorderSettings(newBorderSettings) {
        if (newBorderSettings) {
            AppState.theme.borderSettings = newBorderSettings;
            saveState(AppState);
        }
        
        // Reapply palette to all elements to update their data attributes
        const elements = document.querySelectorAll('[data-color-index]');
        for (const element of elements) {
            await applyPaletteToElement(element);
        }
        
        // Apply palette to ALL rDivs and cDivs (including clones) regardless of data-color-index
        const allRDivs = document.querySelectorAll('.biz-resume-div');
        for (const rDiv of allRDivs) {
            if (rDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(rDiv);
            }
        }
        
        const allCDivs = document.querySelectorAll('.biz-card-div');
        for (const cDiv of allCDivs) {
            if (cDiv.hasAttribute('data-color-index')) {
                await applyPaletteToElement(cDiv);
            }
        }
    }

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

    // Use a data-attribute for the palette color index, assuming it's set on the element
    const paletteColorIndexAttr = element.getAttribute('data-color-index');

    // If the attribute is not set or is not a valid number,
    // this element has not been configured for color theming
    if (paletteColorIndexAttr === null || isNaN(parseInt(paletteColorIndexAttr, 10))) 
        return;
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

    // If the palette is not found or is empty, throw an Error
    const colorPalette = AppState.color.palettes[paletteName];
    if (!colorPalette) throw new Error(`Color palette not found for name: ${paletteName}`);

    // Calculate base colors
    const backgroundColor = colorPalette[paletteColorIndex % colorPalette.length];
    const foregroundColor = colorUtils.getContrastingColor(backgroundColor);

    // Get brightness factors from global state
    const brightnessFactorSelected = AppState.theme.brightnessFactorSelected || 2.0;
    const brightnessFactorHovered = AppState.theme.brightnessFactorHovered || 1.5;

    // Calculate selected state colors (with brightness filter applied)
    const selectedBackgroundColor = colorUtils.adjustBrightness(backgroundColor, brightnessFactorSelected);
    const selectedForegroundColor = colorUtils.getContrastingColor(selectedBackgroundColor);

    // Calculate hovered state colors (with brightness filter applied)
    const hoveredBackgroundColor = colorUtils.adjustBrightness(backgroundColor, brightnessFactorHovered);
    const hoveredForegroundColor = colorUtils.getContrastingColor(hoveredBackgroundColor);

    const borderRadius = AppState.theme?.borderRadius || '25px';

    // Get global border and padding settings from AppState (with defaults)
    const borderSettings = AppState.theme?.borderSettings || {
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

    // apply resume div border override settings if the element is a resume div
    if ( element.classList.contains('biz-resume-div') ) {
        const rDivBorderOverrideSettings = AppState.theme?.rDivBorderOverrideSettings;
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
    element.setAttribute('data-foreground-color-selected', selectedForegroundColor);
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
    element.style.setProperty('--data-foreground-color-selected', selectedForegroundColor);
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


    // Don't apply inline styles - let CSS variables handle the styling
    // The normal state will be applied when needed by the state system
}

// --- Global Watcher ---
// This watcher runs once and handles applying the color theme to the document
watch(currentPaletteFilename, async (newFilename) => {
    if (!newFilename) return;
    
    const paletteName = filenameToNameMap.value[newFilename];
    const colorPalette = colorPalettes.value[paletteName];

    // Wait for both filename mapping and palette data to be loaded
    if (!paletteName || !colorPalette || colorPalette.length === 0) return;

    // Apply document-level styles
    const root = document.documentElement;
    let darkestColor = colorPalette.reduce((darkest, current) => {
        return colorUtils.getPerceivedBrightness(current) < colorUtils.getPerceivedBrightness(darkest) ? current : darkest;
    }, colorPalette[0]);

    const darkHex = darkestColor || "#333333";
    let rgb = colorUtils.get_RGB_from_Hex(darkHex);
    let hsv = colorUtils.get_HSV_from_RGB(rgb);

    let darkerHsv = {...hsv};
    darkerHsv.v *= 0.45; // Much darker for more dramatic contrast
    darkerHsv.s *= 0.3; // Much less saturated for less vibrant look
    const darkerRgb = colorUtils.get_RGB_from_HSV(darkerHsv);

    let darkestHsv = {...hsv};
    darkestHsv.v *= 0.15; // Much darker for more dramatic atmospheric perspective
    darkestHsv.s *= 0.2; // Much less saturated for less vibrant look
    const darkestRgb = colorUtils.get_RGB_from_HSV(darkestHsv);

    const darkerRgba = `rgba(${darkerRgb.r}, ${darkerRgb.g}, ${darkerRgb.b}, 1.0)`;
    const darkestRgba = `rgba(${darkestRgb.r}, ${darkestRgb.g}, ${darkestRgb.b}, 1.0)`;

    root.style.setProperty('--background-light', darkerRgba);
    root.style.setProperty('--background-dark', darkestRgba);

    // Update elements with data-color-index
    const elements = document.querySelectorAll('[data-color-index]');
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
    
    // Apply palette to ALL rDivs and cDivs (including clones) regardless of data-color-index
    const allRDivs = document.querySelectorAll('.biz-resume-div');
    window.CONSOLE_LOG_IGNORE(`[ColorPalette] Found ${allRDivs.length} rDivs to check for color updates`);
    for (const rDiv of allRDivs) {
        if (rDiv.hasAttribute('data-color-index')) {
            window.CONSOLE_LOG_IGNORE(`[ColorPalette] Updating rDiv ${rDiv.id} with color index ${rDiv.getAttribute('data-color-index')}`);
            await applyPaletteToElement(rDiv);
        }
    }
    
    const allCDivs = document.querySelectorAll('.biz-card-div');
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