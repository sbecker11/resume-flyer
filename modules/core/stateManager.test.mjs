import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDefaultState,
  loadState,
  saveState,
  initializeState,
  AppState,
} from './stateManager.mjs';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  if (globalThis.window) globalThis.window.CONSOLE_LOG_IGNORE = () => {};
});

describe('stateManager', () => {
  describe('getDefaultState', () => {
    it('returns object with version and layout', () => {
      const state = getDefaultState();
      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('layout');
      expect(state.layout).toHaveProperty('orientation');
      expect(state.layout).toHaveProperty('scenePercentage');
    });
    it('returns theme with borderSettings', () => {
      const state = getDefaultState();
      expect(state).toHaveProperty('theme');
      expect(state.theme).toHaveProperty('borderSettings');
      expect(state.theme.borderSettings).toHaveProperty('normal');
    });
    it('returns constants with zIndex and cards', () => {
      const state = getDefaultState();
      expect(state).toHaveProperty('constants');
      expect(state.constants).toHaveProperty('zIndex');
      expect(state.constants).toHaveProperty('cards');
    });
  });

  describe('loadState', () => {
    it('returns default state when fetch 404', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const state = await loadState();
      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('layout');
    });
    it('returns default state when fetch fails', async () => {
      fetch.mockRejectedValueOnce(new Error('network'));
      const state = await loadState();
      expect(state).toHaveProperty('version');
      expect(state).toHaveProperty('layout');
    });
    it('returns default state when fetch returns non-404 error status', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const state = await loadState();
      expect(state).toHaveProperty('version');
    });
    it('returns merged state when fetch returns valid JSON', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1.2', layout: { orientation: 'scene-right' } }),
      });
      const state = await loadState();
      expect(state).toHaveProperty('layout');
      expect(state.layout.orientation).toBe('scene-right');
    });
    it('migrates 1.2 to 1.3 and merges with defaults', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: '1.2',
          theme: {
            borderSettings: { normal: { padding: '8px', innerBorderWidth: '1px', outerBorderWidth: '0px', outerBorderColor: 'transparent', borderRadius: '25px' }, hovered: {}, selected: {} },
            rDivBorderOverrideSettings: { normal: { padding: '8px', innerBorderWidth: '1px' }, hovered: {}, selected: {} },
          },
        }),
      });
      const state = await loadState();
      expect(state.version).toBe('1.3');
      expect(state.theme.borderSettings.hovered).toHaveProperty('padding');
      expect(state.theme.rDivBorderOverrideSettings.selected).toHaveProperty('padding');
    });
  });

  describe('saveState', () => {
    it('calls fetch with POST and JSON body', async () => {
      fetch.mockResolvedValueOnce({});
      const state = getDefaultState();
      await saveState(state);
      expect(fetch).toHaveBeenCalledWith('/api/state', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });
    it('throws when fetch fails', async () => {
      fetch.mockRejectedValueOnce(new Error('network'));
      const state = getDefaultState();
      await expect(saveState(state)).rejects.toThrow('network');
    });
  });

  describe('initializeState', () => {
    it('returns promise that resolves to state', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const p = initializeState();
      expect(p).toBeInstanceOf(Promise);
      const state = await p;
      expect(state).toHaveProperty('version');
    });
  });
});
