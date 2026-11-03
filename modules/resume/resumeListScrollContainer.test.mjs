import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendedSkillDiv, mountResumeListDom } from './testFixtures.mjs';

const applyPaletteToElement = vi.fn(() => {});
vi.mock('../composables/useColorPalette.mjs', () => ({
    applyPaletteToElement,
    applyPaletteToElementSync: vi.fn(() => {}),
}));

const { ResumeListScrollContainer } = await import('./resumeListScrollContainer.mjs');

function makeItems(count) {
    return Array.from({ length: count }, (_, i) => {
        const el = document.createElement('div');
        el.className = 'biz-resume-div';
        el.id = `resume-${i}`;
        el.setAttribute('data-job-number', String(i));
        el.innerHTML = `<span id="inner-${i}">Job ${i}</span><span class="biz-details-list-index"></span>`;
        return el;
    });
}

let scrollport;
let holder;

beforeEach(() => {
    ({ scrollport, holder } = mountResumeListDom());
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    applyPaletteToElement.mockClear();
    window.resumeFlyer = undefined;
});

afterEach(() => {
    ResumeListScrollContainer.reset();
    vi.restoreAllMocks();
});

describe('ResumeListScrollContainer', () => {
    it('validates its elements and styles the scrollport', () => {
        expect(() => new ResumeListScrollContainer(null, holder)).toThrow(/Scrollport element/);
        expect(() => new ResumeListScrollContainer(scrollport, {})).toThrow(/Content element/);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        expect(sc.isInitialized()).toBe(false);
        expect(scrollport.classList.contains('resume-list-scroll-container')).toBe(true);
        expect(scrollport.style.overflowY).toBe('auto');
        expect(holder.style.display).toBe('flex');
        expect(() => sc.setItems('nope')).toThrow(/must be an array/);
        ResumeListScrollContainer.reset();
    });

    it('lays out head clones, originals, tail clones in order and tags them with scroll metadata', () => {
        const items = makeItems(3);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        expect(sc.isInitialized()).toBe(true);
        const children = Array.from(holder.children);
        expect(children).toHaveLength(9);
        expect(children.slice(0, 3).every((el) => el.classList.contains('head-clone'))).toBe(true);
        expect(children.slice(3, 6)).toEqual(items);
        expect(children.slice(6).every((el) => el.classList.contains('tail-clone'))).toBe(true);
        expect(items[1].dataset.scrollItemType).toBe('original');
        expect(items[1].dataset.scrollItemIndex).toBe('1');
        expect(items[1].style.flexShrink).toBe('0');
        expect(items[2].querySelector('.biz-details-list-index').textContent).toBe('5 / 9');
        expect(sc.getItemAtIndex(0)).toBe(items[0]);
        expect(sc.getItemAtIndex(9)).toBeNull();
    });

    it('renames clone ids so originals stay unique and applies the palette to each clone', () => {
        const items = makeItems(2);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        const head = holder.querySelector('.head-clone');
        const tail = holder.querySelector('.tail-clone');
        expect(head.id).toBe('resume-0-head-clone');
        expect(head.querySelector('[id]').id).toBe('inner-0-head-clone');
        expect(tail.id).toBe('resume-0-tail-clone');
        expect(head.dataset.cloneType).toBe('head');
        expect(tail.dataset.originalIndex).toBe('0');
        expect(head.classList.contains('resume-list-clone')).toBe(true);
        expect(applyPaletteToElement).toHaveBeenCalledTimes(4);
        expect(document.querySelectorAll('#resume-0')).toHaveLength(1);
    });

    it('rethrows when the palette cannot be applied to a clone', () => {
        applyPaletteToElement.mockImplementationOnce(() => { throw new Error('palette down'); });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const sc = new ResumeListScrollContainer(scrollport, holder);
        expect(() => sc.setItems(makeItems(1))).toThrow('palette down');
    });

    it('re-attaches the × handler on clones because cloneNode drops listeners', () => {
        const items = makeItems(1);
        const close = document.createElement('span');
        close.className = 'r-div-close';
        items[0].appendChild(close);
        const removeRDivFromListing = vi.fn();
        window.resumeFlyer = { resumeItemsController: { removeRDivFromListing } };

        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        const cloneClose = holder.querySelector('.head-clone .r-div-close');
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        cloneClose.dispatchEvent(ev);
        expect(removeRDivFromListing).toHaveBeenCalledWith(0);
        expect(ev.defaultPrevented).toBe(true);
    });

    it('does not throw when a clone × is clicked without the controller', () => {
        const items = makeItems(1);
        const close = document.createElement('span');
        close.className = 'r-div-close';
        items[0].appendChild(close);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        expect(() => holder.querySelector('.head-clone .r-div-close').click()).not.toThrow();
    });

    it('routes clone clicks to the items controller, skipping clicks on the ×', () => {
        const items = makeItems(1);
        const close = document.createElement('span');
        close.className = 'r-div-close';
        items[0].appendChild(close);
        const handleBizResumeDivClickEvent = vi.fn();
        const handleBizResumeDivKeydownEvent = vi.fn();
        window.resumeFlyer = {
            resumeItemsController: { handleBizResumeDivClickEvent, handleBizResumeDivKeydownEvent, removeRDivFromListing: vi.fn() },
        };
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        const clone = holder.querySelector('.head-clone');
        clone.click();
        expect(handleBizResumeDivClickEvent).toHaveBeenCalledWith(clone, expect.any(MouseEvent));
        clone.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(handleBizResumeDivKeydownEvent).toHaveBeenCalledWith(clone, expect.any(KeyboardEvent));
        handleBizResumeDivClickEvent.mockClear();
        clone.querySelector('.r-div-close').click();
        expect(handleBizResumeDivClickEvent).not.toHaveBeenCalled();
    });

    it('falls back to the selection manager when no items controller is registered', async () => {
        const { selectionManager } = await import('../core/selectionManager.mjs');
        const select = vi.spyOn(selectionManager, 'selectJobNumber').mockImplementation(() => {});
        const clear = vi.spyOn(selectionManager, 'clearSelection').mockImplementation(() => {});
        const selected = vi.spyOn(selectionManager, 'getSelectedJobNumber').mockReturnValue(null);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(makeItems(1));
        const clone = holder.querySelector('.head-clone');
        clone.click();
        expect(select).toHaveBeenCalledWith(0, expect.stringContaining('rDivCloneClick'));
        selected.mockReturnValue(0);
        clone.click();
        expect(clear).toHaveBeenCalled();
    });

    it('scrollToIndex wraps, reports the current job, and notifies onItemChange', () => {
        const items = makeItems(3);
        const onItemChange = vi.fn();
        const sc = new ResumeListScrollContainer(scrollport, holder, { onItemChange });
        sc.setItems(items);
        expect(sc.getCurrentIndex()).toBe(0);
        expect(sc.getCurrentlyVisibleJob()).toBe(0);

        sc.goToNext();
        expect(sc.getCurrentIndex()).toBe(1);
        expect(onItemChange).toHaveBeenLastCalledWith(1, items[1]);
        sc.goToPrevious();
        sc.goToPrevious();
        expect(sc.getCurrentIndex()).toBe(2);
        expect(sc.goToLast()).toBe(items[2]);
        expect(sc.goToFirst()).toBe(items[0]);
        expect(sc.scrollToJobNumber(2)).toBe(true);
        expect(sc.getCurrentItem()).toBe(items[2]);
        expect(sc.scrollToJobNumber(42)).toBe(false);
        expect(sc.scrollToBizResumeDiv(items[1])).toBe(true);
        expect(sc.scrollToBizResumeDiv(document.createElement('div'))).toBe(false);
        sc.scrollToItem(0);
        expect(sc.getCurrentIndex()).toBe(0);
    });

    it('rethrows an onItemChange failure', () => {
        const sc = new ResumeListScrollContainer(scrollport, holder, {
            onItemChange: () => { throw new Error('boom'); },
        });
        sc.setItems(makeItems(2));
        expect(() => sc.goToNext()).toThrow('boom');
    });

    it('ignores navigation when there are no items', () => {
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems([]);
        expect(() => sc.goToNext()).not.toThrow();
        expect(sc.getCurrentItem()).toBeNull();
        expect(sc.getCurrentlyVisibleJob()).toBeNull();
        expect(sc.goToFirst()).toBeUndefined();
    });

    it('keeps appended skill rows as footer items across setItems and dedupes by card id', () => {
        const items = makeItems(2);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        const skillA = appendedSkillDiv('skill-card-div-a');
        sc.appendFooterItem(skillA);
        expect(holder.lastElementChild).toBe(skillA);
        expect(skillA.querySelector('.biz-details-list-index')).toBeNull();

        // Replacing with a fresh node for the same card id swaps the old one out.
        const skillA2 = appendedSkillDiv('skill-card-div-a');
        sc.appendFooterItem(skillA2);
        expect(holder.contains(skillA)).toBe(false);
        expect(holder.lastElementChild).toBe(skillA2);
        sc.appendFooterItem(skillA2);
        sc.appendFooterItem(null);

        // Rebuilding with fewer originals keeps the footer after the jobs and their clones.
        sc.setItems([items[1]]);
        expect(holder.lastElementChild).toBe(skillA2);
        expect(holder.querySelectorAll('.appended-skill-resume-div')).toHaveLength(1);
        expect(holder.contains(items[0])).toBe(false);

        sc.clearFooterItems();
        expect(holder.contains(skillA2)).toBe(false);
        expect(holder.querySelectorAll('.appended-skill-resume-div')).toHaveLength(0);
    });

    it('repositions the scrollport when scrolled into the clone bands', () => {
        const items = makeItems(3);
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(items);
        // happy-dom reports zero layout, so pin the metrics.
        vi.spyOn(sc, '_calculateRepositionMetrics').mockReturnValue({ headHeight: 300, originalHeight: 300, tailHeight: 300 });
        Object.defineProperty(scrollport, 'scrollHeight', { value: 900, configurable: true });
        Object.defineProperty(scrollport, 'clientHeight', { value: 100, configurable: true });

        scrollport.scrollTop = 50;
        sc.checkScrollBoundaries();
        expect(scrollport.scrollTop).toBe(350);
        expect(sc.isRepositioning).toBe(true);
        // While repositioning, further boundary hits are ignored.
        scrollport.scrollTop = 10;
        sc._repositionToBottom();
        expect(scrollport.scrollTop).toBe(10);

        sc.isRepositioning = false;
        scrollport.scrollTop = 850;
        sc.checkScrollBoundaries();
        expect(scrollport.scrollTop).toBe(550);
    });

    it('estimates collection heights from offsetHeight or the default item height', () => {
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(makeItems(2));
        expect(sc.calculateOriginalContentHeight()).toBe(160);
        expect(sc.calculateHeadClonesHeight()).toBe(160);
        sc.setItems(makeItems(12));
        expect(sc.calculateOriginalContentHeight()).toBe(12 * 80);
        expect(sc.calculateTailClonesHeight()).toBe(10 * 80);
    });

    it('destroy clears state and the height helpers are no-ops', () => {
        const sc = new ResumeListScrollContainer(scrollport, holder);
        sc.setItems(makeItems(2));
        sc.recalculateHeights();
        sc.recalculateHeightsAfterPalette();
        sc.destroy();
        expect(sc.isInitialized()).toBe(false);
        expect(sc.originalItems).toEqual([]);
    });
});
