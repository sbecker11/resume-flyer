import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withSetup } from './testHost.mjs';

/** Which panel the pointer is over; tests flip this to route keys. */
const pointer = { panel: 'scene', chevronContext: false, resumeHovered: false, x: 10, y: 10 };
const panel = {
    installPanelPointerTracking: vi.fn(),
    beginKeyboardNavigationPanel: vi.fn(() => pointer.panel),
    endKeyboardNavigationPanel: vi.fn(),
    scrollSelectedResumeListingIntoView: vi.fn(),
    focusResumePanelScrollport: vi.fn(),
    focusScenePanelScrollport: vi.fn(),
    isSceneKeyboardChevronContext: vi.fn(() => pointer.chevronContext),
    isResumeViewHovered: vi.fn(() => pointer.resumeHovered),
    isPointerInsideResumeView: vi.fn(() => pointer.panel === 'resume'),
    getLastPointerPosition: vi.fn(() => ({ clientX: pointer.x, clientY: pointer.y })),
};
vi.mock('../utils/panelKeyboardScroll.mjs', () => panel);
const scene = {
    notifySceneKeyboardChevron: vi.fn(),
    notifySceneKeyboardChevronEnd: vi.fn(),
    notifySceneScrollToEdge: vi.fn(),
    notifySceneScrollByPage: vi.fn(),
};
vi.mock('./useSceneAutoScroll.mjs', () => scene);
const reportError = vi.fn();
vi.mock('../utils/errorReporting.mjs', () => ({ reportError }));

const { useKeyboardNavigation } = await import('./useKeyboardNavigation.mjs');

const listController = { goToPreviousResumeItem: vi.fn(), goToNextResumeItem: vi.fn() };

function key(type, k, init = {}) {
    const ev = new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(ev);
    return ev;
}
const down = (k, init) => key('keydown', k, init);
const up = (k, init) => key('keyup', k, init);

let mounted;

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 1; });
    Object.values(panel).forEach((fn) => fn.mockClear?.());
    Object.values(scene).forEach((fn) => fn.mockClear());
    listController.goToPreviousResumeItem.mockClear();
    listController.goToNextResumeItem.mockClear();
    reportError.mockClear();
    pointer.panel = 'scene';
    pointer.chevronContext = false;
    pointer.resumeHovered = false;
    document.body.innerHTML = '';
    document.body.focus?.();
    window.resumeFlyer = { resumeListController: listController };
    mounted = withSetup(() => useKeyboardNavigation());
});

afterEach(() => {
    mounted?.unmount();
    mounted = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('useKeyboardNavigation', () => {
    it('installs pointer tracking on mount and reports controller availability', () => {
        expect(panel.installPanelPointerTracking).toHaveBeenCalled();
        expect(mounted.result.isServiceAvailable()).toBe(true);
        expect(mounted.result.resumeListController).toBe(listController);
        window.resumeFlyer = undefined;
        expect(mounted.result.isServiceAvailable()).toBe(false);
    });

    describe('scene panel', () => {
        it('↑/↓ start continuous chevron autoscroll and release ends it', () => {
            const ev = down('ArrowDown');
            expect(ev.defaultPrevented).toBe(true);
            expect(scene.notifySceneKeyboardChevron).toHaveBeenCalledWith('down');
            expect(panel.focusScenePanelScrollport).toHaveBeenCalled();
            expect(listController.goToNextResumeItem).not.toHaveBeenCalled();

            // Second arrow while held switches direction; releasing one keeps the other going.
            down('ArrowUp');
            expect(scene.notifySceneKeyboardChevron).toHaveBeenLastCalledWith('up');
            up('ArrowUp');
            expect(scene.notifySceneKeyboardChevron).toHaveBeenLastCalledWith('down');
            expect(scene.notifySceneKeyboardChevronEnd).not.toHaveBeenCalled();
            up('ArrowDown');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledTimes(1);

            // Keyboard-nav panel state ends after the 600ms grace period.
            expect(panel.endKeyboardNavigationPanel).not.toHaveBeenCalled();
            vi.advanceTimersByTime(600);
            expect(panel.endKeyboardNavigationPanel).toHaveBeenCalledTimes(1);
        });

        it('Page Up/Down scroll one viewport and hand off to the pointer band on release', () => {
            down('PageDown');
            expect(scene.notifySceneScrollByPage).toHaveBeenCalledWith('down');
            up('PageDown');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledWith({ handOffToPointer: true });

            down('PageUp');
            expect(scene.notifySceneScrollByPage).toHaveBeenLastCalledWith('up');
            up('PageUp');
        });

        it('Home/End and Option+↑/↓ jump to the edges', () => {
            down('Home');
            expect(scene.notifySceneScrollToEdge).toHaveBeenCalledWith('top');
            up('Home');
            down('End');
            expect(scene.notifySceneScrollToEdge).toHaveBeenLastCalledWith('bottom');
            up('End');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledTimes(2);

            const ev = down('ArrowDown', { altKey: true });
            expect(ev.defaultPrevented).toBe(true);
            expect(scene.notifySceneScrollToEdge).toHaveBeenLastCalledWith('bottom');
            down('ArrowUp', { altKey: true });
            expect(scene.notifySceneScrollToEdge).toHaveBeenLastCalledWith('top');
            up('Alt');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledTimes(3);

            // Releasing the arrow that was used with Option also ends the edge scroll.
            down('ArrowUp', { altKey: true });
            up('ArrowUp');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledTimes(4);
        });

        it('releasing Page/Home/End while an arrow is still held resumes the arrow autoscroll', () => {
            down('ArrowDown');
            down('PageDown');
            scene.notifySceneKeyboardChevron.mockClear();
            up('PageDown');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledWith({ handOffToPointer: false });
            expect(scene.notifySceneKeyboardChevron).toHaveBeenCalledWith('down');
            up('ArrowDown');
        });

        it('Option+arrow over the resume panel does nothing, and window blur releases everything', () => {
            pointer.panel = 'resume';
            down('ArrowDown', { altKey: true });
            expect(scene.notifySceneScrollToEdge).not.toHaveBeenCalled();

            pointer.panel = 'scene';
            down('ArrowDown');
            window.dispatchEvent(new Event('blur'));
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledTimes(1);
            // Nothing held any more, so the next release is a no-op.
            up('ArrowDown');
            expect(scene.notifySceneKeyboardChevronEnd).toHaveBeenCalledTimes(1);
        });

        it('reports and rethrows when a scene scroll action fails', () => {
            scene.notifySceneScrollToEdge.mockImplementationOnce(() => { throw new Error('edge failed'); });
            const ev = new KeyboardEvent('keydown', { key: 'End', cancelable: true });
            expect(() => mounted.result.handleKeyDown(ev)).toThrow('edge failed');
            expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[KeyboardNavigation] Scene keyboard scroll failed');
            up('End');
        });
    });

    describe('resume panel', () => {
        beforeEach(() => { pointer.panel = 'resume'; });

        it('↑/↓ step the resume list selection and scroll it into view', () => {
            down('ArrowDown');
            expect(listController.goToNextResumeItem).toHaveBeenCalledTimes(1);
            expect(panel.scrollSelectedResumeListingIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
            expect(panel.focusResumePanelScrollport).toHaveBeenCalled();
            down('ArrowUp');
            expect(listController.goToPreviousResumeItem).toHaveBeenCalledTimes(1);
            expect(scene.notifySceneKeyboardChevron).not.toHaveBeenCalled();
            // Page keys do nothing in the resume panel.
            down('PageDown');
            expect(scene.notifySceneScrollByPage).not.toHaveBeenCalled();
            up('ArrowDown');
            up('ArrowUp');
        });

        it('warns when the resume list controller is missing', () => {
            window.resumeFlyer = undefined;
            down('ArrowDown');
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Resume list controller not available'));
        });

        it('reports and rethrows when list navigation fails', () => {
            listController.goToNextResumeItem.mockImplementationOnce(() => { throw new Error('nav failed'); });
            const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
            expect(() => mounted.result.handleKeyDown(ev)).toThrow('nav failed');
            expect(reportError).toHaveBeenCalledWith(expect.any(Error), '[KeyboardNavigation] Arrow key navigation failed');
        });
    });

    describe('focus guards', () => {
        function focusEl(html) {
            document.body.innerHTML = html;
            const el = document.body.querySelector('[data-focus]');
            el.focus();
            expect(document.activeElement).toBe(el);
            return el;
        }

        it('leaves typing contexts and menus alone', () => {
            focusEl('<input data-focus>');
            expect(down('ArrowDown').defaultPrevented).toBe(false);
            focusEl('<div class="dropdown-menu"><button data-focus>x</button></div>');
            expect(down('ArrowDown').defaultPrevented).toBe(false);
            focusEl('<div contenteditable="true" data-focus tabindex="0">x</div>');
            expect(down('ArrowDown').defaultPrevented).toBe(false);
            focusEl('<button data-focus>x</button>');
            expect(down('ArrowDown').defaultPrevented).toBe(false);
            expect(scene.notifySceneKeyboardChevron).not.toHaveBeenCalled();
        });

        it('still scrolls from the panel scrollports and from buttons inside the active panel', () => {
            focusEl('<div id="scene-content" data-focus tabindex="0"></div>');
            expect(down('ArrowDown').defaultPrevented).toBe(true);
            up('ArrowDown');

            pointer.chevronContext = true;
            focusEl('<div id="scene-container"><button data-focus>▲</button></div>');
            expect(down('ArrowDown').defaultPrevented).toBe(true);
            up('ArrowDown');
            pointer.chevronContext = false;

            pointer.panel = 'resume';
            pointer.resumeHovered = true;
            focusEl('<div id="resume-container"><button data-focus>sort</button></div>');
            expect(down('ArrowDown').defaultPrevented).toBe(true);
            expect(listController.goToNextResumeItem).toHaveBeenCalled();
            up('ArrowDown');
        });

        it('ignores keys that are not scroll keys', () => {
            expect(down('a').defaultPrevented).toBe(false);
            up('a');
            expect(panel.beginKeyboardNavigationPanel).not.toHaveBeenCalled();
        });
    });

    it('stops listening after unmount', () => {
        mounted.unmount();
        mounted = null;
        down('ArrowDown');
        expect(scene.notifySceneKeyboardChevron).not.toHaveBeenCalled();
    });
});
