import { describe, it, expect, vi, beforeEach } from 'vitest';

const providedMap = new Map();
vi.mock('vue', () => ({
  provide: (k, v) => {
    providedMap.set(k, v);
  },
  inject: (k, defaultValue) => (providedMap.has(k) ? providedMap.get(k) : defaultValue),
  ref: (v) => ({ value: v }),
  reactive: (o) => o,
  computed: (fn) => ({ value: fn() }),
}));

beforeEach(() => {
  providedMap.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('useAppContext', () => {
  it('provideAppContext returns appContext and methods', async () => {
    const {
      provideAppContext,
      APP_CONTEXT_KEY,
      useFocalPointDI,
      useSelectionManagerDI,
    } = await import('./useAppContext.mjs');
    const api = provideAppContext();
    expect(api.appContext).toBeDefined();
    expect(api.appContext.isInitialized).toBe(false);
    expect(api.appContext.dependencies).toBeInstanceOf(Map);
    expect(typeof api.registerDependency).toBe('function');
    expect(typeof api.getDependency).toBe('function');
    expect(typeof api.initialize).toBe('function');
  });

  it('useAppContext returns context when provided', async () => {
    const { provideAppContext, useAppContext } = await import('./useAppContext.mjs');
    provideAppContext();
    const context = useAppContext();
    expect(context).toBeDefined();
    expect(context.isInitialized).toBe(false);
  });

  it('useAppContext throws when not provided', async () => {
    const { useAppContext } = await import('./useAppContext.mjs');
    providedMap.clear();
    expect(() => useAppContext()).toThrow('useAppContext must be used within a component');
  });

  it('registerDependency and getDependency round-trip', async () => {
    const { provideAppContext } = await import('./useAppContext.mjs');
    const { registerDependency, getDependency } = provideAppContext();
    const key = Symbol('TestKey');
    const instance = { id: 1 };
    registerDependency(key, instance);
    expect(getDependency(key)).toBe(instance);
  });

  it('getDependency throws when key not registered', async () => {
    const { provideAppContext } = await import('./useAppContext.mjs');
    const { getDependency } = provideAppContext();
    const key = Symbol('Missing');
    expect(() => getDependency(key)).toThrow('Dependency not found');
  });

  it('initialize sets isInitialized', async () => {
    const { provideAppContext, useAppContext } = await import('./useAppContext.mjs');
    const api = provideAppContext();
    api.initialize();
    expect(api.appContext.isInitialized).toBe(true);
  });

  it('useFocalPointDI returns default when not provided', async () => {
    const { useFocalPointDI } = await import('./useAppContext.mjs');
    expect(useFocalPointDI()).toBe(null);
  });

  it('provideDependency and injectDependencies', async () => {
    const {
      provideAppContext,
      provideDependency,
      injectDependencies,
      FOCAL_POINT_KEY,
      BULLS_EYE_KEY,
    } = await import('./useAppContext.mjs');
    provideAppContext();
    const fp = { name: 'focalPoint' };
    const be = { name: 'bullsEye' };
    provideDependency(FOCAL_POINT_KEY, fp);
    provideDependency(BULLS_EYE_KEY, be);
    const deps = injectDependencies([FOCAL_POINT_KEY, BULLS_EYE_KEY]);
    expect(deps['FocalPoint']).toBe(fp);
    expect(deps['BullsEye']).toBe(be);
  });
});
