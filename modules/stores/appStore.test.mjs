import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateAppState = vi.fn().mockResolvedValue(undefined);

vi.mock('../composables/useAppState.ts', async () => {
  const vue = await import('vue');
  return {
    useAppState: () => ({
      appState: vue.ref({
        'user-settings': {
          layout: { orientation: 'scene-left', scenePercentage: 50 },
        },
      }),
      updateAppState: mockUpdateAppState,
    }),
  };
});

beforeEach(() => {
  mockUpdateAppState.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('appStore', () => {
  it('exports appStore with layout from useAppState', async () => {
    const { appStore } = await import('./appStore.mjs');
    expect(appStore.orientation).toBe('scene-left');
    expect(appStore.scenePercentage).toBe(50);
  });

  it('appStoreComputed.resumePercentage is 100 - scenePercentage', async () => {
    const { appStoreComputed } = await import('./appStore.mjs');
    expect(appStoreComputed.resumePercentage.value).toBe(50);
  });

  it('appStoreActions.setScenePercentage calls updateAppState', async () => {
    const { appStoreActions } = await import('./appStore.mjs');
    await appStoreActions.setScenePercentage(75);
    expect(mockUpdateAppState).toHaveBeenCalledWith({
      'user-settings': {
        layout: {
          scenePercentage: 75,
          resumePercentage: 25,
        },
      },
    });
  });

  it('appStoreActions.setOrientation calls updateAppState with immediate save', async () => {
    const { appStoreActions } = await import('./appStore.mjs');
    await appStoreActions.setOrientation('scene-right');
    expect(mockUpdateAppState).toHaveBeenCalledWith({
      'user-settings': {
        layout: { orientation: 'scene-right' },
      },
    }, true);
  });

  it('appStoreActions.toggleOrientation flips orientation', async () => {
    const { appStoreActions } = await import('./appStore.mjs');
    appStoreActions.toggleOrientation();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpdateAppState).toHaveBeenCalledWith({
      'user-settings': {
        layout: { orientation: 'scene-right' },
      },
    }, true);
  });

  it('appStoreActions.setSelectedJob and clearSelection update store', async () => {
    const { appStore, appStoreActions } = await import('./appStore.mjs');
    appStoreActions.setSelectedJob(3);
    expect(appStore.selectedJobNumber).toBe(3);
    appStoreActions.clearSelection();
    expect(appStore.selectedJobNumber).toBe(null);
    expect(appStore.hoveredJobNumber).toBe(null);
  });

  it('useAppStore returns store, computed, actions', async () => {
    const { useAppStore } = await import('./appStore.mjs');
    const { store, computed, actions } = useAppStore();
    expect(store).toBeDefined();
    expect(computed).toBeDefined();
    expect(actions).toBeDefined();
    expect(actions.setScenePercentage).toBeDefined();
  });
});
