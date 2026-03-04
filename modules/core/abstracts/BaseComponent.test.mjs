import { describe, it, expect } from 'vitest';
import { BaseComponent } from './BaseComponent.mjs';

describe('BaseComponent', () => {
  it('constructor sets name and isInitialized false', () => {
    const c = new BaseComponent('Test');
    expect(c.name).toBe('Test');
    expect(c.isInitialized).toBe(false);
  });
  it('initialize sets isInitialized true', () => {
    const c = new BaseComponent('Test');
    c.initialize();
    expect(c.isInitialized).toBe(true);
  });
  it('isReady returns false until initialized', () => {
    const c = new BaseComponent('Test');
    expect(c.isReady()).toBe(false);
    c.initialize();
    expect(c.isReady()).toBe(true);
  });
  it('getDependencies returns empty array', () => {
    const c = new BaseComponent('Test');
    expect(c.getDependencies()).toEqual([]);
  });
});
