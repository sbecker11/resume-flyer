import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { setRect, withSetup } from './testHost.mjs';

const services = { bullsEye: null, focalPoint: null, debugFunctions: null };
vi.mock('../core/globalServices', () => ({
    useBullsEyeService: () => services.bullsEye,
    useFocalPointService: () => services.focalPoint,
    useDebugFunctions: () => services.debugFunctions,
}));
vi.mock('./useLayoutToggle.mjs', () => ({
    useLayoutToggle: () => ({ orientation: ref('scene-left') }),
}));
const rendering = { parallaxScaleAtMinZ: 1, parallaxScaleAtMaxZ: 1 };
vi.mock('../core/renderingConfig.mjs', () => ({ getRendering: () => rendering }));
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
vi.mock('../utils/logger.mjs', () => ({ logger }));

const { useParallaxEnhanced } = await import('./useParallaxVue3Enhanced.mjs');

/**
 * Scene fixture: bulls-eye centred at x=500, focal point centred at x=400, scene view left edge at 100.
 * → bullsEyeCenterXSceneView = 400, dh = (500-400)*0.9 = 90.
 */
function mountScene({ withCards = true } = {}) {
    document.body.innerHTML = '';
    const scene = setRect(document.createElement('div'), { left: 100, top: 0, width: 800, height: 600 });
    scene.id = 'scene-container';
    const plane = document.createElement('div');
    plane.id = 'scene-plane';
    scene.appendChild(plane);
    const bullsEye = setRect(document.createElement('div'), { left: 490, top: 290, width: 20, height: 20 });
    bullsEye.id = 'bulls-eye';
    const focal = setRect(document.createElement('div'), { left: 395, top: 295, width: 10, height: 10 });
    focal.id = 'focal-point';
    document.body.append(scene, bullsEye, focal);
    const cards = {};
    if (withCards) {
        cards.near = card(plane, 'biz-card-div-0', 'biz-card-div', 1);
        cards.far = card(plane, 'biz-card-div-1', 'biz-card-div', 14);
        cards.mid = card(plane, 'skill-card-div-a', 'skill-card-div', 7.5);
    }
    return { scene, plane, bullsEye, focal, cards };
}

function card(plane, id, cls, sceneZ) {
    const el = document.createElement('div');
    el.id = id;
    el.className = cls;
    if (sceneZ != null) el.setAttribute('data-sceneZ', String(sceneZ));
    el.style.left = '123px';
    el.style.top = '45px';
    plane.appendChild(el);
    return el;
}

function translateXOf(el) {
    const m = /translateX\(([-\d.]+)px\)/.exec(el.style.transform || '');
    return m ? parseFloat(m[1]) : null;
}

function translateYOf(el) {
    const m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform || '');
    return m ? parseFloat(m[1]) : null;
}

let mounted;

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 1; });
    services.bullsEye = null;
    services.focalPoint = null;
    services.debugFunctions = null;
    rendering.parallaxScaleAtMinZ = 1;
    rendering.parallaxScaleAtMaxZ = 1;
    logger.warn.mockClear();
    logger.error.mockClear();
});

afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('useParallaxEnhanced', () => {
    it('initializes on mount, exposes position getters globally, and tears down on unmount', () => {
        document.body.innerHTML = '';
        mounted = withSetup(() => useParallaxEnhanced());
        const p = mounted.result;
        expect(p.isInitialized.value).toBe(true);
        expect(window.getBullsEyePosition).toBe(p.getBullsEyePosition);
        expect(window.getFocalPointPosition).toBe(p.getFocalPointPosition);
        expect(p.checkServices()).toEqual({
            'bullsEye service': false, 'focalPoint service': false, 'debugFunctions service': false, 'bullsEye ready': false,
        });
        expect(p.stats.value.initialized).toBe(true);
        mounted.unmount();
        mounted = null;
        expect(p.isInitialized.value).toBe(false);
        expect(p.stats.value.renderCount).toBe(0);
    });

    it('does nothing until the scene container, plane, and at least one card exist', () => {
        document.body.innerHTML = '';
        mounted = withSetup(() => useParallaxEnhanced());
        const p = mounted.result;
        p.renderAllCDivs();
        expect(p.stats.value.renderCount).toBe(1);

        const { plane } = mountScene({ withCards: false });
        window.dispatchEvent(new Event('focal-point-changed'));
        expect(plane.querySelectorAll('[style*="transform"]')).toHaveLength(0);

        const late = card(plane, 'biz-card-div-9', 'biz-card-div', 1);
        window.dispatchEvent(new Event('focal-point-changed'));
        expect(translateXOf(late)).not.toBeNull();
    });

    it('projects X from the bulls-eye and focal point, scaled by depth, without touching layout', () => {
        const { cards } = mountScene();
        mounted = withSetup(() => useParallaxEnhanced());
        const { near, far, mid } = cards;
        // near (Z=1): 400 + 90 * 0.9 = 481; far (Z=14): 400 + 90 * 0 = 400; mid (Z=7.5): 400 + 90 * 0.45 = 440.5
        expect(translateXOf(near)).toBeCloseTo(481, 6);
        expect(translateXOf(far)).toBeCloseTo(400, 6);
        expect(translateXOf(mid)).toBeCloseTo(440.5, 6);
        expect(near.style.transform).toContain('translateY(0px)');
        // Scene is static: only the transform changes.
        expect(near.style.left).toBe('123px');
        expect(near.style.top).toBe('45px');
    });

    it('projects Y from the bulls-eye and focal point, scaled by depth, same as X', () => {
        const { cards, focal } = mountScene();
        // Move the focal point 40px above the bulls-eye's Y (300) → dv = (300 - 260) * 0.9 = 36.
        setRect(focal, { left: 395, top: 255, width: 10, height: 10 });
        mounted = withSetup(() => useParallaxEnhanced());
        const { near, far, mid } = cards;
        // near (Z=1): 36 * 0.9 = 32.4; far (Z=14): 36 * 0 = 0; mid (Z=7.5): 36 * 0.45 = 16.2.
        expect(translateYOf(near)).toBeCloseTo(32.4, 6);
        expect(translateYOf(far)).toBeCloseTo(0, 6);
        expect(translateYOf(mid)).toBeCloseTo(16.2, 6);
        // Scene is static: only the transform changes, not the card's anchored top/left.
        expect(near.style.top).toBe('45px');
        expect(near.style.left).toBe('123px');
    });

    it('re-renders on focal-point, bulls-eye, scene-width, and resize events, skipping unchanged frames', () => {
        const { cards, focal } = mountScene();
        mounted = withSetup(() => useParallaxEnhanced());
        const { near } = cards;
        expect(translateXOf(near)).toBeCloseTo(481, 6);

        // Same inputs → cached, so a manual reset is not overwritten.
        near.style.transform = '';
        window.dispatchEvent(new Event('focal-point-changed'));
        expect(near.style.transform).toBe('');

        // Focal point moves 100px left → dh doubles.
        setRect(focal, { left: 295, top: 295, width: 10, height: 10 });
        window.dispatchEvent(new Event('bulls-eye-moved'));
        expect(translateXOf(near)).toBeCloseTo(400 + 180 * 0.9, 6);

        near.style.transform = '';
        window.dispatchEvent(new Event('scene-width-changed'));
        expect(near.style.transform).toBe('');
        window.dispatchEvent(new CustomEvent('parallax-force-refresh'));
        expect(translateXOf(near)).toBeCloseTo(562, 6);

        setRect(focal, { left: 395, top: 295, width: 10, height: 10 });
        window.dispatchEvent(new Event('resize'));
        expect(translateXOf(near)).toBeCloseTo(481, 6);

        setRect(focal, { left: 295, top: 295, width: 10, height: 10 });
        window.dispatchEvent(new Event('scene-plane-ready'));
        expect(translateXOf(near)).toBeCloseTo(562, 6);
    });

    it('applies the user parallax scale from 3D settings on top of the depth ramp', () => {
        rendering.parallaxScaleAtMinZ = 2;
        rendering.parallaxScaleAtMaxZ = 0.5;
        const { cards } = mountScene();
        mounted = withSetup(() => useParallaxEnhanced());
        // near: base 0.9 × user 2 = 1.8 → 400 + 90 * 1.8 = 562
        expect(translateXOf(cards.near)).toBeCloseTo(562, 6);
        expect(translateXOf(cards.far)).toBeCloseTo(400, 6);
    });

    it('renders only the visible instance of a card: original xor its clone', () => {
        const { plane } = mountScene({ withCards: false });
        const original = card(plane, 'biz-card-div-3', 'biz-card-div hasClone', 1);
        const clone = card(plane, 'biz-card-div-3-clone', 'biz-card-div', 1);
        const hiddenClone = card(plane, 'biz-card-div-4-clone', 'biz-card-div clone-hidden', 1);
        const forcedHidden = card(plane, 'biz-card-div-5', 'biz-card-div force-hidden-for-clone', 1);
        const listingCleared = card(plane, 'biz-card-div-6', 'biz-card-div scene-hidden-for-listing-clear', 1);
        const noZ = card(plane, 'biz-card-div-7', 'biz-card-div', null);
        const outOfRange = card(plane, 'biz-card-div-8', 'biz-card-div', 42);
        const plain = card(plane, 'biz-card-div-9', 'biz-card-div', 1);
        mounted = withSetup(() => useParallaxEnhanced());

        expect(original.style.transform).toBe('');
        expect(translateXOf(clone)).toBeCloseTo(481, 6);
        expect(hiddenClone.style.transform).toBe('');
        expect(forcedHidden.style.transform).toBe('');
        expect(listingCleared.style.transform).toBe('');
        expect(noZ.style.transform).toBe('');
        expect(outOfRange.style.transform).toBe('');
        expect(translateXOf(plain)).toBeCloseTo(481, 6);

        // Swapping which instance is visible changes the fingerprint and re-renders even with the same dh.
        original.classList.remove('hasClone');
        clone.classList.add('clone-hidden');
        window.dispatchEvent(new Event('focal-point-changed'));
        expect(translateXOf(original)).toBeCloseTo(481, 6);
    });

    it('falls back from the focal-point element to the service, then to the viewport centre', () => {
        const { focal, cards } = mountScene();
        focal.style.visibility = 'hidden';
        services.focalPoint = { position: ref({ x: 300, y: 300 }) };
        mounted = withSetup(() => useParallaxEnhanced());
        expect(mounted.result.getFocalPointPosition()).toEqual({ x: 300, y: 300 });
        expect(translateXOf(cards.near)).toBeCloseTo(400 + 200 * 0.9 * 0.9, 6);

        services.focalPoint = { getPosition: () => ({ x: 450, y: 0 }) };
        mounted.unmount();
        mounted = withSetup(() => useParallaxEnhanced());
        expect(mounted.result.getFocalPointPosition()).toEqual({ x: 450, y: 0 });

        services.focalPoint = null;
        focal.remove();
        mounted.unmount();
        mounted = withSetup(() => useParallaxEnhanced());
        expect(mounted.result.getFocalPointPosition()).toEqual({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    });

    it('falls back from the bulls-eye element to the service or debug functions', () => {
        document.body.innerHTML = '';
        services.bullsEye = { getPosition: () => ({ x: 7, y: 8 }), isReady: () => true };
        services.debugFunctions = { getViewportOrigin: () => ({ x: 1, y: 2 }), getBullsEyePosition: () => ({ x: 9, y: 9 }) };
        mounted = withSetup(() => useParallaxEnhanced());
        expect(mounted.result.getBullsEyePosition()).toEqual({ x: 7, y: 8 });
        expect(mounted.result.getViewportOrigin()).toEqual({ x: 1, y: 2 });
        expect(mounted.result.checkServices()['bullsEye ready']).toBe(true);

        services.bullsEye = null;
        mounted.unmount();
        mounted = withSetup(() => useParallaxEnhanced());
        expect(mounted.result.getBullsEyePosition()).toEqual({ x: 9, y: 9 });
        services.debugFunctions = null;
        mounted.unmount();
        mounted = withSetup(() => useParallaxEnhanced());
        expect(mounted.result.getBullsEyePosition()).toEqual({ x: 0, y: 0 });
        expect(mounted.result.getViewportOrigin()).toEqual({ x: 0, y: 0 });
    });

    it('logs and rethrows a render failure', () => {
        const { bullsEye } = mountScene();
        mounted = withSetup(() => useParallaxEnhanced());
        bullsEye.getBoundingClientRect = () => { throw new Error('layout exploded'); };
        expect(() => mounted.result.renderAllCDivs()).toThrow('layout exploded');
        expect(logger.error).toHaveBeenCalledWith('[ParallaxEnhanced] Render error:', expect.any(Error));
    });

    it('warns when a render takes longer than a frame', () => {
        mountScene();
        let t = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => { t += 20; return t; });
        mounted = withSetup(() => useParallaxEnhanced());
        mounted.result.renderAllCDivs();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Slow render'));
        expect(mounted.result.stats.value.lastRenderTime).toBeGreaterThan(16);
    });
});
