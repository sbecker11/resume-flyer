import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { setRect, withSetup } from './testHost.mjs';

const store = reactive({
    bullsEye: { x: 0, y: 0, isVisible: true },
    focalPoint: { x: 0, y: 0, mode: 'FOLLOWING', isVisible: true },
    orientation: 'scene-left',
    scenePercentage: 50,
});
const actions = {
    setBullsEye: vi.fn((x, y) => { store.bullsEye.x = x; store.bullsEye.y = y; }),
};
vi.mock('../stores/appStore.mjs', () => ({ useAppStore: () => ({ store, actions, computed: {} }) }));

const { useBullsEye } = await import('./useBullsEyeVue3.mjs');
const { provideAppContext, BULLS_EYE_KEY } = await import('./useAppContext.mjs');

const flush = () => new Promise((r) => setTimeout(r, 0));

let mounted;
let context;

function mountBullsEye() {
    mounted = withSetup(() => useBullsEye(), { parentSetup: () => provideAppContext() });
    context = mounted.parent;
    return mounted.result;
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    store.bullsEye.x = 0;
    store.bullsEye.y = 0;
    store.bullsEye.isVisible = true;
    store.orientation = 'scene-left';
    store.scenePercentage = 50;
    actions.setBullsEye.mockClear();
    window.resumeFlyer = undefined;
});

afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('useBullsEye', () => {
    it('registers itself with the app context and on window.resumeFlyer when mounted', () => {
        const be = mountBullsEye();
        const registered = context.getDependency(BULLS_EYE_KEY);
        expect(registered.recenter).toBe(be.recenter);
        expect(be.isReady.value).toBe(false);
        expect(window.resumeFlyer.bullsEye.isReady()).toBe(false);
        expect(window.resumeFlyer.bullsEye.getPosition()).toEqual({ x: 0, y: 0 });
    });

    it('centres itself on the scene container once both elements are known and announces the move', async () => {
        const be = mountBullsEye();
        const moved = vi.fn();
        const recentered = vi.fn();
        window.addEventListener('bulls-eye-moved', moved);
        window.addEventListener('bullseye-recentered', recentered);
        try {
            const el = document.createElement('div');
            const scene = setRect(document.createElement('div'), { left: 100, top: 50, width: 800, height: 600 });
            be.setBullsEyeElement(el);
            expect(actions.setBullsEye).not.toHaveBeenCalled();
            be.setSceneContainerElement(scene);
            expect(actions.setBullsEye).toHaveBeenCalledWith(500, 350);
            expect(be.position.value).toEqual({ x: 500, y: 350 });
            expect(be.isReady.value).toBe(true);
            expect(moved.mock.calls[0][0].detail.position).toEqual({ x: 500, y: 350 });
            expect(recentered).toHaveBeenCalledTimes(1);

            // The DOM element follows the store (deep watch).
            await nextTick();
            expect(el.style.left).toBe('500px');
            expect(el.style.top).toBe('350px');
            expect(el.style.position).toBe('fixed');
            expect(el.style.pointerEvents).toBe('none');
            expect(el.style.visibility).toBe('visible');

            // Setting the elements in the other order also centres.
            mounted.unmount();
            actions.setBullsEye.mockClear();
            const be2 = mountBullsEye();
            be2.setSceneContainerElement(scene);
            be2.setBullsEyeElement(el);
            expect(actions.setBullsEye).toHaveBeenCalledTimes(1);
        } finally {
            window.removeEventListener('bulls-eye-moved', moved);
            window.removeEventListener('bullseye-recentered', recentered);
        }
    });

    it('setPosition and setVisible update the store and element', async () => {
        const be = mountBullsEye();
        const el = document.createElement('div');
        be.setBullsEyeElement(el);
        be.setPosition(12, 34, 'test');
        expect(be.x.value).toBe(12);
        expect(be.y.value).toBe(34);
        expect(window.resumeFlyer.bullsEye.getPosition()).toEqual({ x: 12, y: 34 });
        be.setVisible(false);
        expect(be.isVisible.value).toBe(false);
        expect(el.style.visibility).toBe('hidden');
        be.setVisible(true);
        expect(el.style.visibility).toBe('visible');
    });

    it('recenters after resize, resize-handle, layout, and scene-percentage changes', async () => {
        vi.useFakeTimers();
        const be = mountBullsEye();
        const scene = setRect(document.createElement('div'), { left: 0, top: 0, width: 400, height: 200 });
        be.setBullsEyeElement(document.createElement('div'));
        be.setSceneContainerElement(scene);
        actions.setBullsEye.mockClear();

        setRect(scene, { left: 0, top: 0, width: 600, height: 200 });
        window.dispatchEvent(new Event('resize'));
        await nextTick();
        expect(actions.setBullsEye).toHaveBeenLastCalledWith(300, 100);

        setRect(scene, { left: 0, top: 0, width: 800, height: 200 });
        window.dispatchEvent(new Event('resize-handle-changed'));
        await nextTick();
        expect(actions.setBullsEye).toHaveBeenLastCalledWith(400, 100);

        setRect(scene, { left: 0, top: 0, width: 1000, height: 200 });
        window.dispatchEvent(new Event('layout-orientation-changed'));
        vi.advanceTimersByTime(100);
        expect(actions.setBullsEye).toHaveBeenLastCalledWith(500, 100);

        setRect(scene, { left: 0, top: 0, width: 1200, height: 200 });
        store.orientation = 'scene-right';
        await nextTick();
        vi.advanceTimersByTime(100);
        expect(actions.setBullsEye).toHaveBeenLastCalledWith(600, 100);

        setRect(scene, { left: 0, top: 0, width: 1400, height: 200 });
        store.scenePercentage = 60;
        await nextTick();
        await nextTick();
        expect(actions.setBullsEye).toHaveBeenLastCalledWith(700, 100);

        window.resumeFlyer.bullsEye.recenter();
        expect(actions.setBullsEye).toHaveBeenCalledTimes(6);
    });

    it('skips centring without elements and stops listening after unmount', async () => {
        const be = mountBullsEye();
        be.recenter();
        expect(actions.setBullsEye).not.toHaveBeenCalled();
        const scene = setRect(document.createElement('div'), { left: 0, top: 0, width: 400, height: 200 });
        be.setBullsEyeElement(document.createElement('div'));
        be.setSceneContainerElement(scene);
        actions.setBullsEye.mockClear();
        mounted.unmount();
        mounted = null;
        window.dispatchEvent(new Event('resize'));
        await nextTick();
        await flush();
        expect(actions.setBullsEye).not.toHaveBeenCalled();
    });
});
