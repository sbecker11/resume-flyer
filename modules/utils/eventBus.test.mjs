import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEmit = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();
vi.mock('mitt', () => ({
  default: () => ({ on: mockOn, off: mockOff, emit: mockEmit }),
}));

beforeEach(() => {
  mockEmit.mockClear();
  mockOn.mockClear();
  mockOff.mockClear();
});

describe('utils/eventBus', () => {
  it('exports eventBus with on, off, emit', async () => {
    const { eventBus } = await import('./eventBus.mjs');
    expect(eventBus).toBeDefined();
    expect(typeof eventBus.on).toBe('function');
    expect(typeof eventBus.off).toBe('function');
    expect(typeof eventBus.emit).toBe('function');
  });
  it('eventBus.emit calls through', async () => {
    const { eventBus } = await import('./eventBus.mjs');
    eventBus.emit('test', { x: 1 });
    expect(mockEmit).toHaveBeenCalledWith('test', { x: 1 });
  });
});
