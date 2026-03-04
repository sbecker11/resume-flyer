import { describe, it, expect, beforeEach } from 'vitest';
import { initPhases } from './InitializationPhases.mjs';

describe('InitializationPhases', () => {
  beforeEach(() => {
    // Reset phases for isolation (singleton state)
    ['CORE_READY', 'SERVICES_READY', 'CONTROLLERS_READY', 'DOM_READY'].forEach((p) => {
      if (initPhases.phases[p]) initPhases.phases[p] = false;
    });
  });

  it('isPhaseReady returns false initially', () => {
    expect(initPhases.isPhaseReady('CORE_READY')).toBe(false);
  });
  it('markPhaseComplete sets phase and notifies', () => {
    let notified = false;
    initPhases.subscribers['CORE_READY'] = [() => { notified = true; }];
    initPhases.markPhaseComplete('CORE_READY');
    expect(initPhases.isPhaseReady('CORE_READY')).toBe(true);
    expect(notified).toBe(true);
  });
  it('markPhaseComplete throws for unknown phase', () => {
    expect(() => initPhases.markPhaseComplete('UNKNOWN')).toThrow(/Unknown phase/);
  });
  it('requirePhase throws if not ready', () => {
    expect(() => initPhases.requirePhase('CORE_READY', 'test')).toThrow(/FAIL FAST/);
  });
  it('requirePhase does not throw when ready', () => {
    initPhases.markPhaseComplete('CORE_READY');
    expect(() => initPhases.requirePhase('CORE_READY', 'test')).not.toThrow();
  });
  it('waitForPhase resolves when already ready', async () => {
    initPhases.markPhaseComplete('SERVICES_READY');
    await expect(initPhases.waitForPhase('SERVICES_READY')).resolves.toBeUndefined();
  });
  it('waitForPhase resolves when phase completes', async () => {
    const p = initPhases.waitForPhase('DOM_READY');
    initPhases.markPhaseComplete('DOM_READY');
    await expect(p).resolves.toBeUndefined();
  });
  it('getStatus returns copy of phases', () => {
    const status = initPhases.getStatus();
    expect(status).toHaveProperty('CORE_READY');
    expect(status).toHaveProperty('DOM_READY');
  });
});
