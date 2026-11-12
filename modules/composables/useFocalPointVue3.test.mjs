import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import { setRect, withSetup } from './testHost.mjs';

const store = reactive({
    focalPoint: { x: 0, y: 0, mode: 'FOLLOWING', isVisible: true },
    bullsEye: { x: 0, y: 0, isVisible: true },
});
const actions = {
    setFocalPoint: vi.fn((x, y) => { store.focalPoint.x = x; store.focalPoint.y = y; }),
    setFocalPointMode: vi.fn((m) => { store.focalPoint.mode = m; }),
};
vi.mock('../stores/appStore.mjs', () => ({ useAppStore: () => ({ store, actions, computed: {} }) }));
const bullsEyeService = { current: null };
vi.mock('../core/globalServices', () => ({ useBullsEyeService: () => bullsEyeService.current }));
vi.mock('./useGlobalElementRegistry.mjs', () => ({
    injectGlobalElementRegistry: () => ({ getSceneContainer: () => document.getElementById('scene-container') }),
}));

const { useFocalPoint, FOCALPOINT_MODES } = await import('./useFocalPointVue3.mjs');
const { provideAppContext, FOCAL_POINT_KEY } = await import('./useAppContext.mjs');

/** Controllable rAF queue so easing steps can be driven one frame at a time. */
const rafQueue = new Map();
let rafId = 0;
function flushFrames(max = 1000) {
    let n = 0;
    while (rafQueue.size > 0 && n < max) {
        const [id, cb] = rafQueue.entries().next().value;
        rafQueue.delete(id);
        cb(performance.now());
        n++;
    }
    return n;
}
const settle = async () => { await nextTick(); await new Promise((r) => setTimeout(r, 0)); };

let mounted;
let context;
let scene;
let bullsEye;

function mountFocalPoint() {
    mounted = withSetup(() => useFocalPoint(), { parentSetup: () => provideAppContext() });
    context = mounted.parent;
    return mounted.result;
}

function mouseMove(x, y) {
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    rafQueue.clear();
    vi.stubGlobal('requestAnimationFrame', (cb) => { rafQueue.set(++rafId, cb); return rafId; });
    vi.stubGlobal('cancelAnimationFrame', (id) => { rafQueue.delete(id); });
    document.body.innerHTML = '';
    document.elementFromPoint = () => null;
    scene = setRect(document.createElement('div'), { left: 0, top: 0, width: 800, height: 600 });
    scene.id = 'scene-container';
    bullsEye = setRect(document.createElement('div'), { left: 390, top: 290, width: 20, height: 20 });
    bullsEye.id = 'bulls-eye';
    document.body.append(scene, bullsEye);
    store.focalPoint.x = 0;
    store.focalPoint.y = 0;
    store.focalPoint.mode = 'FOLLOWING';
    actions.setFocalPoint.mockClear();
    actions.setFocalPointMode.mockClear();
    bullsEyeService.current = null;
});

afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('useFocalPoint', () => {
    it('starts at the viewport centre, registers with the app context, and positions its element', async () => {
        const fp = mountFocalPoint();
        expect(fp.position.value).toEqual({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        expect(context.getDependency(FOCAL_POINT_KEY).cycleMode).toBe(fp.cycleMode);
        const el = document.createElement('div');
        fp.setFocalPointElement(el);
        expect(el.style.left).toBe(`${window.innerWidth / 2}px`);
        expect(el.style.position).toBe('fixed');
        expect(el.style.getPropertyValue('pointer-events')).toBe('none');
        expect(el.style.visibility).toBe('visible');

        fp.setPosition(-5, -9);
        await nextTick();
        expect(fp.position.value).toEqual({ x: 0, y: 0 });
        expect(el.style.visibility).toBe('hidden');
    });

    it('cycleMode walks FOLLOWING → DRAGGING → LOCKED → FOLLOWING through the store action', async () => {
        const fp = mountFocalPoint();
        expect(fp.isFollowing.value).toBe(true);
        fp.cycleMode();
        expect(actions.setFocalPointMode).toHaveBeenLastCalledWith(FOCALPOINT_MODES.DRAGGING);
        expect(fp.isDragging.value).toBe(true);
        fp.cycleMode();
        expect(fp.isLocked.value).toBe(true);
        fp.cycleMode();
        expect(fp.isFollowing.value).toBe(true);
        fp.mode.value = FOCALPOINT_MODES.LOCKED;
        expect(actions.setFocalPointMode).toHaveBeenLastCalledWith(FOCALPOINT_MODES.LOCKED);
    });

    it('DRAGGING: pointer motion inside the scene moves the focal point immediately, clamped to the scene', async () => {
        const fp = mountFocalPoint();
        fp.setFocalPointElement(document.createElement('div'));
        store.focalPoint.mode = FOCALPOINT_MODES.DRAGGING;
        await settle();

        mouseMove(200, 150);
        expect(fp.position.value).toEqual({ x: 200, y: 150 });
        // Clamped 30px inside the scene box.
        mouseMove(5, 5);
        expect(fp.position.value).toEqual({ x: 30, y: 30 });
        mouseMove(799, 599);
        expect(fp.position.value).toEqual({ x: 770, y: 570 });
        // setTarget is immediate in drag mode.
        fp.setTarget(100, 100);
        expect(fp.position.value).toEqual({ x: 100, y: 100 });
        expect(rafQueue.size).toBe(0);
    });

    it('FOLLOWING: pointer motion eases the focal point toward the cursor over several frames', async () => {
        const fp = mountFocalPoint();
        fp.setFocalPointElement(document.createElement('div'));
        await settle();
        fp.setPosition(100, 100);
        mouseMove(500, 100);
        // The mousemove is rAF-throttled: one frame schedules the easing, then easing frames follow.
        expect(rafQueue.size).toBe(1);
        flushFrames(1);
        const afterFirst = fp.position.value.x;
        expect(afterFirst).toBeGreaterThan(100);
        expect(afterFirst).toBeLessThan(500);
        flushFrames(1);
        expect(fp.position.value.x).toBeGreaterThan(afterFirst);
        flushFrames();
        expect(fp.position.value).toEqual({ x: 500, y: 100 });
    });

    it('LOCKED: follows bulls-eye-moved events with the snappier easing', async () => {
        const fp = mountFocalPoint();
        store.focalPoint.mode = FOCALPOINT_MODES.LOCKED;
        await settle();
        fp.setPosition(100, 100);
        window.dispatchEvent(new CustomEvent('bulls-eye-moved', { detail: { position: { x: 300, y: 300 } } }));
        // First easing step runs synchronously: 12% of the way.
        expect(fp.position.value.x).toBeCloseTo(124, 6);
        flushFrames();
        expect(fp.position.value).toEqual({ x: 300, y: 300 });

        // In FOLLOWING the same event is ignored.
        store.focalPoint.mode = FOCALPOINT_MODES.FOLLOWING;
        await settle();
        flushFrames();
        fp.setPosition(100, 100);
        window.dispatchEvent(new CustomEvent('bulls-eye-moved', { detail: { position: { x: 300, y: 300 } } }));
        expect(fp.position.value).toEqual({ x: 100, y: 100 });
    });

    it('switching to LOCKED glides home to the bulls-eye when the service says it is ready', async () => {
        bullsEyeService.current = { isReady: () => true };
        const fp = mountFocalPoint();
        await settle();
        fp.setPosition(100, 100);
        store.focalPoint.mode = FOCALPOINT_MODES.LOCKED;
        await settle();
        flushFrames();
        expect(fp.position.value).toEqual({ x: 400, y: 300 });
    });

    it('leaving the scene locks the focal point to the bulls-eye; re-entering restores the mode', async () => {
        const fp = mountFocalPoint();
        fp.setFocalPointElement(document.createElement('div'));
        await settle();
        const left = vi.fn();
        const entered = vi.fn();
        window.addEventListener('scene-view-pointer-left', left);
        window.addEventListener('scene-view-pointer-entered', entered);
        try {
            // First sample inside the scene: nothing happens.
            mouseMove(200, 200);
            flushFrames();
            expect(fp.mode.value).toBe(FOCALPOINT_MODES.FOLLOWING);
            expect(left).not.toHaveBeenCalled();

            // Pointer moves over the resume panel (outside the 800×600 scene box).
            mouseMove(900, 200);
            expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
            expect(actions.setFocalPointMode).not.toHaveBeenCalled(); // transient: not persisted
            expect(left).toHaveBeenCalledTimes(1);
            flushFrames();
            expect(fp.position.value).toEqual({ x: 400, y: 300 });

            // Back into the scene: FOLLOWING restored and the focal point glides to the pointer.
            mouseMove(600, 200);
            expect(fp.mode.value).toBe(FOCALPOINT_MODES.FOLLOWING);
            expect(entered.mock.calls[0][0].detail).toEqual({ clientX: 600, clientY: 200 });
            flushFrames();
            expect(fp.position.value).toEqual({ x: 600, y: 200 });
        } finally {
            window.removeEventListener('scene-view-pointer-left', left);
            window.removeEventListener('scene-view-pointer-entered', entered);
        }
    });

    it('leaving the scene in DRAGGING also locks to the bulls-eye; re-entering eases back to the pointer', async () => {
        const fp = mountFocalPoint();
        fp.setFocalPointElement(document.createElement('div'));
        store.focalPoint.mode = FOCALPOINT_MODES.DRAGGING;
        await settle();

        // First sample inside the scene: nothing happens.
        mouseMove(200, 200);
        flushFrames();
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.DRAGGING);
        expect(fp.position.value).toEqual({ x: 200, y: 200 });

        // Pointer moves over the resume panel (outside the 800×600 scene box).
        mouseMove(900, 200);
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
        expect(actions.setFocalPointMode).not.toHaveBeenCalled(); // transient: not persisted
        flushFrames();
        expect(fp.position.value).toEqual({ x: 400, y: 300 }); // bulls-eye centre

        // Back into the scene: DRAGGING restored and the focal point glides (not snaps) to the pointer.
        mouseMove(600, 250);
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.DRAGGING);
        flushFrames(1);
        // Mid-glide: between the bulls-eye and the pointer, not already there.
        expect(fp.position.value).not.toEqual({ x: 400, y: 300 });
        expect(fp.position.value).not.toEqual({ x: 600, y: 250 });
        flushFrames();
        expect(fp.position.value).toEqual({ x: 600, y: 250 });

        // Once the glide settles, DRAGGING's immediate mouse handler is live again.
        mouseMove(650, 260);
        expect(fp.position.value).toEqual({ x: 650, y: 260 });
    });

    it('a mode change while the pointer is outside the scene re-applies the lock', async () => {
        const fp = mountFocalPoint();
        await settle();
        mouseMove(200, 200);
        mouseMove(900, 200);
        flushFrames();
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
        // User toggles to DRAGGING from the resize handle while still outside.
        store.focalPoint.mode = FOCALPOINT_MODES.DRAGGING;
        await settle();
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
        // Document mouseleave while outside keeps it locked, no throw.
        document.dispatchEvent(new Event('mouseleave'));
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
    });

    it('document mouseleave from inside the scene pushes the mode and locks', async () => {
        const fp = mountFocalPoint();
        await settle();
        mouseMove(200, 200);
        document.dispatchEvent(new Event('mouseleave'));
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
        document.dispatchEvent(new MouseEvent('mouseenter', { clientX: 100, clientY: 100 }));
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.FOLLOWING);
    });

    it('waits for the scene container when it is not in the DOM yet', async () => {
        scene.remove();
        const fp = mountFocalPoint();
        await settle();
        mouseMove(900, 200);
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.FOLLOWING);
        document.body.appendChild(scene);
        window.dispatchEvent(new Event('scene-container-ready'));
        mouseMove(200, 200);
        mouseMove(900, 200);
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.LOCKED);
    });

    it('cleanup removes the pointer tracking and cancels in-flight easing', async () => {
        const fp = mountFocalPoint();
        fp.setFocalPointElement(document.createElement('div'));
        await settle();
        fp.setPosition(100, 100);
        fp.setTarget(500, 500);
        expect(rafQueue.size).toBeGreaterThan(0);
        mounted.unmount();
        mounted = null;
        expect(rafQueue.size).toBe(0);
        const before = fp.position.value;
        mouseMove(900, 200);
        flushFrames();
        expect(fp.position.value).toEqual(before);
        expect(fp.mode.value).toBe(FOCALPOINT_MODES.FOLLOWING);
    });
});
