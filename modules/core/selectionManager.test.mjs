import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const mockSaveState = vi.fn();
const mockAppState = { selectedJobNumber: null, lastVisitedJobNumber: null };

vi.mock('./stateManager.mjs', () => ({
  AppState: mockAppState,
  saveState: (...args) => mockSaveState(...args),
}));

let selectionManager;

beforeAll(async () => {
  const m = await import('./selectionManager.mjs');
  selectionManager = m.selectionManager;
});

beforeEach(() => {
  mockSaveState.mockClear();
  mockAppState.selectedJobNumber = null;
  mockAppState.lastVisitedJobNumber = null;
  selectionManager.clearSelection('test-setup');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('selectionManager', () => {
  it('exports selectionManager instance', () => {
    expect(selectionManager).toBeDefined();
    expect(selectionManager.eventTarget).toBeInstanceOf(EventTarget);
    expect(selectionManager.selectedCard).toBe(null);
    expect(selectionManager.selectedJobNumber).toBe(null);
  });

  it('selectJobNumber sets selection and updates AppState', () => {
    selectionManager.selectJobNumber(0, 'test');
    expect(selectionManager.getSelectedJobNumber()).toBe(0);
    expect(selectionManager.selectedCard).toEqual({ type: 'biz', jobNumber: 0 });
    expect(mockAppState.selectedJobNumber).toBe(0);
    expect(mockSaveState).toHaveBeenCalled();
  });

  it('selectCard with invalid card does nothing', () => {
    selectionManager.selectCard(null, 'test');
    expect(selectionManager.selectedCard).toBe(null);
    selectionManager.selectCard({}, 'test');
    expect(selectionManager.selectedCard).toBe(null);
  });

  it('selectSkillCard sets skill card selection', () => {
    selectionManager.selectSkillCard('skill-1', 'test');
    expect(selectionManager.selectedCard).toEqual({ type: 'skill', skillCardId: 'skill-1' });
    expect(selectionManager.selectedJobNumber).toBe(null);
  });

  it('clearSelection resets state and dispatches events', () => {
    selectionManager.selectJobNumber(1, 'test');
    const events = [];
    selectionManager.eventTarget.addEventListener('selection-cleared', (e) => events.push(e));
    selectionManager.clearSelection('test');
    expect(selectionManager.selectedCard).toBe(null);
    expect(selectionManager.getSelectedJobNumber()).toBe(null);
    expect(mockAppState.selectedJobNumber).toBe(null);
    expect(events.length).toBe(1);
  });

  it('getJobDataByNumber returns null for null/undefined', () => {
    expect(selectionManager.getJobDataByNumber(null)).toBe(null);
    expect(selectionManager.getJobDataByNumber(undefined)).toBe(null);
  });

  it('setHoveredJobNumber sets hover and dispatches event', () => {
    const events = [];
    selectionManager.eventTarget.addEventListener('job-hovered', (e) => events.push(e.detail));
    selectionManager.setHoveredJobNumber(2);
    expect(selectionManager.hoveredJobNumber).toBe(2);
    expect(events).toEqual([{ jobNumber: 2 }]);
  });

  it('hoverJobNumber dispatches hoverChanged', () => {
    const events = [];
    selectionManager.eventTarget.addEventListener('hoverChanged', (e) => events.push(e.detail));
    selectionManager.hoverJobNumber(3, 'test');
    expect(selectionManager.hoveredJobNumber).toBe(3);
    expect(events).toEqual([{ hoveredJobNumber: 3, caller: 'test' }]);
  });
});
