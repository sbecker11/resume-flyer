import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const setDragMode = vi.fn();
const startAutoSave = vi.fn();
const updateAppState = vi.fn().mockResolvedValue(undefined);

vi.mock('./useAppState.ts', async () => {
  const vue = await import('vue');
  return {
    useAppState: () => ({
      appState: vue.ref(null),
      updateAppState,
      setDragMode,
      startAutoSave,
    }),
  };
});

vi.mock('./useLayoutToggle.mjs', async () => {
  const vue = await import('vue');
  return {
    useLayoutToggle: () => ({
      orientation: vue.ref('scene-left'),
    }),
  };
});

vi.mock('../stores/appStore.mjs', () => ({
  useAppStore: () => ({
    store: {},
    actions: {},
  }),
}));

import { dragStateManager } from '../core/dragStateManager.mjs';
import { useResizeHandle } from './useResizeHandle.mjs';

function mousedownOn(el) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe('useResizeHandle startDrag', () => {
  let startDrag;
  let isDragging;

  beforeEach(() => {
    document.body.innerHTML = '';
    if (dragStateManager.dragging) dragStateManager.endDrag('test-reset');
    setDragMode.mockClear();
    const handle = useResizeHandle();
    startDrag = handle.startDrag;
    isDragging = handle.isDragging;
    if (isDragging.value) {
      document.dispatchEvent(new MouseEvent('mouseup'));
    }
  });

  afterEach(() => {
    if (isDragging?.value) {
      document.dispatchEvent(new MouseEvent('mouseup'));
    }
    if (dragStateManager.dragging) dragStateManager.endDrag('test-cleanup');
    document.body.innerHTML = '';
  });

  it('does not start a column resize or preventDefault for mousedown inside the skill search overlay', () => {
    const overlay = document.createElement('div');
    overlay.className = 'skill-search-modal-overlay';
    const input = document.createElement('input');
    input.className = 'skill-search-input';
    overlay.appendChild(input);
    document.body.appendChild(overlay);

    const event = mousedownOn(input);
    startDrag(event);

    expect(event.defaultPrevented).toBe(false);
    expect(isDragging.value).toBe(false);
    expect(dragStateManager.dragging).toBe(false);
    expect(setDragMode).not.toHaveBeenCalled();
  });

  it('still starts a column resize for mousedown on the handle itself', () => {
    const handleEl = document.createElement('div');
    handleEl.id = 'resize-handle';
    document.body.appendChild(handleEl);

    const event = mousedownOn(handleEl);
    startDrag(event);

    expect(event.defaultPrevented).toBe(true);
    expect(isDragging.value).toBe(true);
    expect(dragStateManager.dragging).toBe(true);
    expect(setDragMode).toHaveBeenCalledWith(true);
  });
});
