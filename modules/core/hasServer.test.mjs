import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('core/hasServer', () => {
  beforeEach(() => {
    vi.resetModules();
    if (typeof window !== 'undefined') {
      delete window.hasServer;
    }
  });

  it('returns true when origin is not github.io', async () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://127.0.0.1:5173' },
      configurable: true,
      writable: true,
    });
    const { hasServer } = await import('./hasServer.mjs');
    expect(hasServer()).toBe(true);
    expect(typeof window.hasServer).toBe('function');
  });

  it('returns false when origin is github.io', async () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://user.github.io' },
      configurable: true,
      writable: true,
    });
    const { hasServer } = await import('./hasServer.mjs');
    expect(hasServer()).toBe(false);
  });

  it('caches the first computed value', async () => {
    Object.defineProperty(window, 'location', {
      value: { origin: 'http://localhost:3000' },
      configurable: true,
      writable: true,
    });
    const { hasServer } = await import('./hasServer.mjs');
    expect(hasServer()).toBe(true);
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://user.github.io' },
      configurable: true,
      writable: true,
    });
    expect(hasServer()).toBe(true);
  });
});
