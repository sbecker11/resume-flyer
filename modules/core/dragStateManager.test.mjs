import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dragStateManager } from './dragStateManager.mjs';

describe('dragStateManager', () => {
  beforeEach(() => {
    dragStateManager.isDragging = false;
    dragStateManager.pendingCalculations.clear();
    dragStateManager.listeners = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startDrag sets isDragging and notifies', () => {
    const listener = vi.fn();
    dragStateManager.addListener(listener);
    dragStateManager.startDrag('test');
    expect(dragStateManager.dragging).toBe(true);
    expect(listener).toHaveBeenCalledWith('dragStart', { source: 'test' });
  });
  it('endDrag clears isDragging when was dragging', () => {
    dragStateManager.startDrag('test');
    dragStateManager.endDrag('test');
    expect(dragStateManager.dragging).toBe(false);
  });
  it('endDrag no-op when not dragging', () => {
    dragStateManager.endDrag('test');
    expect(dragStateManager.dragging).toBe(false);
  });
  it('executeOrDefer runs immediately when not dragging', () => {
    const fn = vi.fn();
    const r = dragStateManager.executeOrDefer(fn, 'id');
    expect(r).toBe(true);
    expect(fn).toHaveBeenCalled();
  });
  it('executeOrDefer defers when dragging', () => {
    dragStateManager.startDrag('test');
    const fn = vi.fn();
    const r = dragStateManager.executeOrDefer(fn, 'id');
    expect(r).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    dragStateManager.endDrag('test');
    vi.advanceTimersByTime(60);
    expect(fn).toHaveBeenCalled();
  });
  it('addListener and removeListener', () => {
    const listener = vi.fn();
    dragStateManager.addListener(listener);
    dragStateManager.removeListener(listener);
    dragStateManager.startDrag('test');
    expect(listener).not.toHaveBeenCalled();
  });
  it('clearPending clears pending calculations', () => {
    dragStateManager.startDrag('test');
    dragStateManager.executeOrDefer(() => {}, 'x');
    dragStateManager.clearPending();
    expect(dragStateManager.pendingCalculations.size).toBe(0);
  });
});