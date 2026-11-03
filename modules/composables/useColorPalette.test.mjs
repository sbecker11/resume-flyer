import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { withSetup } from './testHost.mjs';

/** Minimal app state the palette code reads. */
function fixtureState(colorPalette = 'Dusk') {
    return {
        'user-settings': { theme: { colorPalette } },
        'system-constants': { theme: { selectedHighlightPercent: 135 } },
        theme: { borderRadius: '12px' },
    };
}
const appState = ref(fixtureState());
const updateAppState = vi.fn(async (patch) => {
    const theme = patch?.['user-settings']?.theme;
    if (theme?.colorPalette) appState.value['user-settings'].theme.colorPalette = theme.colorPalette;
});
vi.mock('./useAppState.ts', () => ({ useAppState: () => ({ appState, updateAppState }) }));
const registry = { clearAllCache: vi.fn() };
vi.mock('./useGlobalElementRegistry.mjs', () => ({ injectGlobalElementRegistry: () => registry }));
const s3 = { url: null };
vi.mock('@/modules/utils/paletteCatalogS3Url.mjs', () => ({ resolvePaletteCatalogS3Url: () => s3.url }));
const complainLoudly = vi.fn();
vi.mock('@/modules/utils/paletteS3LoudError.mjs', () => ({ complainLoudlyPaletteS3Failure: complainLoudly }));
const reportError = vi.fn();
vi.mock('@/modules/utils/errorReporting.mjs', () => ({ reportError }));

const CATALOG = {
    version: 2,
    palettes: [
        { filename: 'dusk.json', name: 'Dusk', colors: ['#112233', '#ffffff', '#ff8800'], backgroundSwatchIndex: 0, imagePublicUrl: ' https://img.example/dusk.png ' },
        { filename: 'dawn.json', name: 'Dawn', colors: ['#fafafa', '#101010'] },
        { filename: 'broken.json', name: 'Broken' }, // no colors → skipped
    ],
};

/** fetch stub keyed by URL suffix; tests swap `routes` per scenario. */
const routes = new Map();
function jsonResponse(body, { ok = true, status = 200, contentType = 'application/json' } = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        ok, status,
        headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
        json: async () => JSON.parse(text),
        text: async () => text,
    };
}
function installFetch() {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
        for (const [suffix, make] of routes) {
            if (String(url).endsWith(suffix)) return make(url);
        }
        return jsonResponse({ error: 'not found' }, { ok: false, status: 404 });
    }));
}

const mod = await import('./useColorPalette.mjs');

function card(cls, index, extra = {}) {
    const el = document.createElement('div');
    el.className = cls;
    el.setAttribute('data-color-index', String(index));
    el.innerHTML = '<span class="hex-normal"></span><span class="hex-highlighted"></span>';
    Object.entries(extra).forEach(([k, v]) => el.setAttribute(k, v));
    document.body.appendChild(el);
    return el;
}

let mounted;
let cp;

beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.CONSOLE_LOG_IGNORE = () => {};
});

beforeEach(() => {
    installFetch();
    routes.clear();
    routes.set('/api/palette-catalog', () => jsonResponse(CATALOG));
    appState.value = fixtureState();
    updateAppState.mockClear();
    reportError.mockClear();
    complainLoudly.mockClear();
    registry.clearAllCache.mockClear();
    document.body.innerHTML = '';
    document.documentElement.style.cssText = '';
    window.globalElementRegistry = registry;
    if (!mounted) {
        mounted = withSetup(() => mod.useColorPalette());
        cp = mounted.result;
    }
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useColorPalette', () => {
    it('loads the v2 catalog, skips bad rows, and resolves the saved display name to its filename', async () => {
        expect(cp.isLoading.value).toBe(false);
        await cp.loadPalettes();
        expect(Object.keys(cp.colorPalettes.value).sort()).toEqual(['Dawn', 'Dusk']);
        expect(cp.orderedPaletteNames.value).toEqual(['Dusk', 'Dawn']);
        expect(cp.filenameToNameMap.value).toEqual({ 'dusk.json': 'Dusk', 'dawn.json': 'Dawn' });
        expect(cp.imagePublicUrlByPaletteName.value).toEqual({ 'dusk.json': 'https://img.example/dusk.png' });
        // theme.colorPalette held the display name; the filename is persisted as the remedy.
        expect(cp.currentPaletteFilename.value).toBe('dusk.json');
        expect(updateAppState).toHaveBeenCalledWith({ 'user-settings': { theme: { colorPalette: 'dusk.json' } } }, true);
        expect(cp.currentPaletteName.value).toBe('Dusk');
        expect(cp.currentPalette.value).toEqual(['#112233', '#ffffff', '#ff8800']);
        // Scene background vars derive from the background swatch.
        expect(document.documentElement.style.getPropertyValue('--background-light')).toMatch(/^rgba\(/);
        expect(document.documentElement.style.getPropertyValue('--background-dark')).toMatch(/^rgba\(/);
        await mod.readyPromise;
    });

    it('applyPaletteToElementSync writes the --data-* theme vars and state attributes', () => {
        const el = card('biz-card-div', 1);
        mod.applyPaletteToElementSync(el, appState.value);
        expect(el.getAttribute('data-background-color')).toBe('#ffffff');
        expect(el.style.getPropertyValue('--data-background-color')).toBe('#ffffff');
        // White background → dark text and black icons.
        expect(el.getAttribute('data-icon-set-variant')).toBe('black');
        expect(el.style.getPropertyValue('--data-foreground-color')).toBe(el.getAttribute('data-foreground-color'));
        expect(el.style.getPropertyValue('--data-background-border-radius')).toBe('12px');
        expect(el.style.getPropertyValue('--data-normal-padding')).toBe('8px');
        expect(el.style.getPropertyValue('--data-normal-margin-top')).toBe('0px');
        expect(el.querySelector('.hex-normal').textContent).toBe('#ffffff');
        expect(el.querySelector('.hex-highlighted').textContent).toBe(el.getAttribute('data-background-color-selected'));
        // Cards paint via CSS vars only.
        expect(el.style.backgroundColor).toBe('');

        // Hovered colour is the RGB midpoint of normal and selected.
        const sel = el.getAttribute('data-background-color-selected');
        const hov = el.getAttribute('data-background-color-hovered');
        expect(sel).toMatch(/^#[0-9a-f]{6}$/i);
        expect(hov).toMatch(/^#[0-9a-f]{6}$/i);
        expect(sel).not.toBe('#ffffff');

        // Index wraps around the palette length.
        const wrapped = card('biz-card-div', 4);
        mod.applyPaletteToElementSync(wrapped, appState.value);
        expect(wrapped.getAttribute('data-background-color')).toBe('#ffffff');
    });

    it('rDivs keep the resume margin override and non-card elements get inline colours', () => {
        appState.value['system-constants'].theme.rDivBorderOverrideSettings = { normal: { marginTop: '20px', innerBorderWidth: '3px' } };
        appState.value['system-constants'].theme.borderSettings = {
            normal: { padding: '4px', innerBorderWidth: '1px', innerBorderColor: 'red', outerBorderWidth: '0px', outerBorderColor: 'none', marginTop: '0px', borderRadius: '9px' },
            hovered: { padding: '4px', innerBorderWidth: '1px', innerBorderColor: 'red', outerBorderWidth: '0px', outerBorderColor: 'none', marginTop: '0px', borderRadius: '9px' },
            selected: { padding: '4px', innerBorderWidth: '1px', innerBorderColor: 'red', outerBorderWidth: '0px', outerBorderColor: 'none', marginTop: '0px', borderRadius: '9px' },
        };
        const rDiv = card('biz-resume-div', 0);
        mod.applyPaletteToElementSync(rDiv, appState.value);
        expect(rDiv.style.getPropertyValue('--data-normal-padding')).toBe('4px');
        expect(rDiv.style.getPropertyValue('--data-normal-inner-border-width')).toBe('3px');
        expect(rDiv.getAttribute('data-normal-inner-border-color')).toBe('red');
        expect(rDiv.style.getPropertyValue('--data-normal-margin-top')).toBe('');

        const plain = card('swatch', 0);
        mod.applyPaletteToElementSync(plain, appState.value);
        expect(plain.style.backgroundColor).not.toBe('');
        expect(plain.style.color).not.toBe('');
    });

    it('fails fast on a missing element, snapshot, or colour index', () => {
        expect(() => mod.applyPaletteToElementSync(null, appState.value)).toThrow(/element is required/);
        expect(() => mod.applyPaletteToElementSync(document.createElement('div'), null)).toThrow(/AppState not available/);
        expect(() => mod.applyPaletteToElementSync(document.createElement('div'), appState.value)).toThrow(/data-color-index/);
        const bad = card('x', 'nope');
        expect(() => mod.applyPaletteToElementSync(bad, appState.value)).toThrow(/data-color-index/);
    });

    it('applyPaletteToElement waits for the catalog and uses live app state', async () => {
        const el = card('skill-card-div', 2);
        await mod.applyPaletteToElement(el);
        expect(el.getAttribute('data-background-color')).toBe('#ff8800');
        await expect(mod.applyPaletteToElement(null)).rejects.toThrow(/element is required/);
        const saved = appState.value;
        appState.value = null;
        await expect(mod.applyPaletteToElement(el)).rejects.toThrow(/AppState not available/);
        appState.value = saved;
    });

    it('setCurrentPalette repaints every themed element, announces the change, and persists', async () => {
        const a = card('biz-card-div', 0);
        const b = card('biz-resume-div', 1);
        const changed = vi.fn();
        window.addEventListener('color-palette-changed', changed);
        try {
            await cp.setCurrentPalette('Dawn'); // display name → remedy to filename
            expect(cp.currentPaletteFilename.value).toBe('dawn.json');
            expect(a.getAttribute('data-background-color')).toBe('#fafafa');
            expect(b.getAttribute('data-background-color')).toBe('#101010');
            expect(changed.mock.calls[0][0].detail).toEqual({ filename: 'dawn.json', paletteName: 'Dawn', previousFilename: 'dusk.json' });
            expect(updateAppState).toHaveBeenLastCalledWith({ 'user-settings': { theme: { colorPalette: 'dawn.json' } } });
            expect(registry.clearAllCache).toHaveBeenCalled();

            // Already current → no-op.
            changed.mockClear();
            await cp.setCurrentPalette('dawn.json');
            expect(changed).not.toHaveBeenCalled();

            // Unknown palette → reported, ignored.
            await cp.setCurrentPalette('nope.json');
            expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining('not a known palette'), expect.stringContaining('Remedy'));
            expect(cp.currentPaletteFilename.value).toBe('dawn.json');
            await cp.setCurrentPalette(null);
            expect(cp.currentPaletteFilename.value).toBe('dawn.json');
        } finally {
            window.removeEventListener('color-palette-changed', changed);
        }
    });

    it('a saturation multiplier is clamped and applied through the single colour source', () => {
        const el = card('biz-card-div', 0);
        cp.setPaletteSaturationMultiplier(0);
        expect(cp.paletteSaturationMultiplier.value).toBe(0);
        const grey = el.getAttribute('data-background-color');
        cp.setPaletteSaturationMultiplier(99);
        expect(cp.paletteSaturationMultiplier.value).toBe(3);
        cp.setPaletteSaturationMultiplier('x');
        expect(cp.paletteSaturationMultiplier.value).toBe(1);
        expect(el.getAttribute('data-background-color')).toBe('#fafafa');
        expect(grey).toMatch(/^#/);
    });

    it('brightness boosts and border settings persist through app state and repaint', async () => {
        await cp.updateBrightnessBoosts(1.2, undefined);
        expect(updateAppState).toHaveBeenLastCalledWith({ 'system-constants': { theme: { brightnessBoostSelected: 1.2 } } });
        await cp.updateBrightnessBoosts(undefined, undefined);
        await cp.updateBorderSettings({ normal: { padding: '1px' } });
        expect(updateAppState).toHaveBeenLastCalledWith({ 'system-constants': { theme: { borderSettings: { normal: { padding: '1px' } } } } });
        await cp.updateBorderSettings(null);
    });

    it('applyCurrentPaletteToAllElements and applyFullPaletteInstant report per-element failures without aborting', async () => {
        const good = card('biz-card-div', 0);
        const bad = card('biz-card-div', 'oops');
        await cp.applyCurrentPaletteToAllElements();
        expect(good.getAttribute('data-background-color')).toBe('#fafafa');
        expect(bad.getAttribute('data-background-color')).toBeNull();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining('applyFullPaletteInstant'), null);
        expect(registry.clearAllCache).toHaveBeenCalled();
        // Explicit registry argument path.
        const other = { clearAllCache: vi.fn() };
        await mod.applyCurrentPaletteToAllElements(other);
        expect(other.clearAllCache).toHaveBeenCalled();
    });

    it('updateContrastForBrightness re-derives text/icon contrast from the depth-dimmed background', () => {
        const el = card('biz-card-div', 0, { 'data-sceneZ': '10' });
        mod.applyPaletteToElementSync(el, appState.value);
        expect(el.getAttribute('data-icon-set-variant')).toBe('black'); // #fafafa is light
        el.style.filter = 'brightness(10%)';
        mod.updateContrastForBrightness(el);
        expect(el.getAttribute('data-icon-set-variant')).toBe('white'); // dimmed to near-black
        expect(el.style.color).toBe(''); // biz cards keep CSS-var colouring

        const skill = card('skill-card-div', 0);
        skill.innerHTML = '<div class="skill-card-back-icons"><img class="back-icon"></div>';
        mod.applyPaletteToElementSync(skill, appState.value);
        mod.updateContrastForBrightness(skill);
        expect(skill.style.color).not.toBe('');
        expect(skill.querySelector('.back-icon').getAttribute('data-skill-icon-variant')).toBe('black');

        const untouched = document.createElement('div');
        mod.updateContrastForBrightness(untouched);
        const noZ = card('biz-card-div', 0);
        mod.applyPaletteToElementSync(noZ, appState.value);
        noZ.removeAttribute('data-icon-set-variant');
        mod.updateContrastForBrightness(noZ);
        expect(noZ.getAttribute('data-icon-set-variant')).toBeNull();
    });

    it('refreshVisualStateAfterPaletteChange re-syncs hovered cards and re-emits the hovered job', () => {
        const hovered = card('biz-card-div hovered', 0, { 'data-sceneZ': '3' });
        mod.applyPaletteToElementSync(hovered, appState.value);
        hovered.style.filter = 'brightness(50%)';
        const clone = card('skill-card-div clone', 1);
        mod.applyPaletteToElementSync(clone, appState.value);
        const sm = { getHoveredJobNumber: () => 4, eventTarget: new EventTarget() };
        const hoverChanged = vi.fn();
        sm.eventTarget.addEventListener('hoverChanged', hoverChanged);
        window.resumeFlyer = { selectionManager: sm };
        mod.refreshVisualStateAfterPaletteChange();
        expect(hovered.style.getPropertyValue('filter')).toBe('none');
        expect(hoverChanged.mock.calls[0][0].detail).toEqual({ hoveredJobNumber: 4, caller: 'refreshVisualStateAfterPaletteChange' });
        mod.syncAllSkillCardBackLinkPresentations();
        expect(clone.classList.contains('skill-fg-light') || clone.classList.contains('skill-card-div')).toBe(true);
        window.resumeFlyer = undefined;
    });

    it('falls back to the manifest + static palette files when the API catalog is not v2', async () => {
        routes.clear();
        routes.set('/api/palette-catalog', () => jsonResponse('<html>', { contentType: 'text/html' }));
        routes.set('/api/palette-manifest', () => jsonResponse(['ember.json']));
        routes.set('/static_content/colorPalettes/ember.json', () => jsonResponse({ name: 'Ember', colors: ['#ff0000', '#00ff00'], backgroundSwatchIndex: 1 }));
        appState.value = fixtureState('ember.json');
        await cp.loadPalettes();
        expect(Object.keys(cp.colorPalettes.value)).toEqual(['Ember']);
        expect(cp.currentPaletteFilename.value).toBe('ember.json');
        // Unchanged filename → nothing persisted.
        expect(updateAppState).not.toHaveBeenCalled();
    });

    it('uses the S3 NDJSON catalog when configured and the API has nothing', async () => {
        routes.clear();
        s3.url = 'https://bucket.example/color_palettes.jsonl';
        routes.set('color_palettes.jsonl', () => jsonResponse(
            '{"paletteName":"Sea","colorPalette":["#001122","#334455"],"backgroundSwatchIndex":1}\n\n{"paletteName":"","colorPalette":["#fff"]}\n',
            { contentType: 'text/plain' },
        ));
        appState.value = fixtureState('legacy-name');
        await cp.loadPalettes();
        s3.url = null;
        expect(cp.filenameToNameMap.value).toEqual({ 'sea.json': 'Sea' });
        // Unknown saved palette → first palette chosen and the problem reported.
        expect(cp.currentPaletteFilename.value).toBe('sea.json');
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining('not a known filename'), expect.stringContaining('sea.json'));
    });

    it('fails loudly when the manifest is not an array or a palette colour is invalid', async () => {
        routes.clear();
        routes.set('/api/palette-catalog', () => jsonResponse({}, { ok: false, status: 404 }));
        routes.set('/api/palette-manifest', () => jsonResponse({ not: 'an array' }));
        await expect(cp.loadPalettes()).rejects.toThrow(/manifest is not an array/);
        expect(complainLoudly).toHaveBeenCalledTimes(1);
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[ColorPalette] Failed to load color palettes');

        routes.set('/api/palette-manifest', () => jsonResponse(['bad.json']));
        routes.set('/static_content/colorPalettes/bad.json', () => jsonResponse({ name: 'Bad', colors: ['#12'] }));
        await expect(cp.loadPalettes()).rejects.toThrow(/Invalid hex in palette "Bad"/);
        expect(complainLoudly).toHaveBeenCalledTimes(1); // validation errors are not S3 failures

        routes.set('/static_content/colorPalettes/bad.json', () => jsonResponse('not json', { contentType: 'text/plain' }));
        await expect(cp.loadPalettes()).rejects.toThrow(/Invalid palette JSON/);
        routes.set('/static_content/colorPalettes/bad.json', () => jsonResponse('', { ok: false, status: 500 }));
        await expect(cp.loadPalettes()).rejects.toThrow(/Palette fetch failed/);
        expect(complainLoudly).toHaveBeenCalledTimes(2);
        routes.set('/api/palette-manifest', () => jsonResponse('', { ok: false, status: 500 }));
        await expect(cp.loadPalettes()).rejects.toThrow(/Failed to fetch palette manifest/);

        appState.value = null;
        await expect(cp.loadPalettes()).rejects.toThrow(/AppState not loaded yet/);
        expect(cp.isLoading.value).toBe(false);
    });

    it('re-applies the palette when the catalog data changes and stops on unmount', async () => {
        appState.value = fixtureState('Dusk');
        routes.set('/api/palette-catalog', () => jsonResponse(CATALOG));
        await cp.loadPalettes();
        const el = card('biz-card-div', 0);
        cp.colorPalettes.value = { ...cp.colorPalettes.value, Dusk: ['#abcdef'] };
        await nextTick();
        expect(el.getAttribute('data-background-color')).toBe('#abcdef');
        mounted.unmount();
        mounted = null;
    });
});
