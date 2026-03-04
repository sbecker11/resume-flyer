import { describe, it, expect, beforeEach } from 'vitest';
import { on, emit, off } from './eventBus.mjs';

beforeEach(() => {
  if (globalThis.window) globalThis.window.CONSOLE_LOG_IGNORE = () => {};
});

describe('core/eventBus', () => {
  it('on and emit call listener', () => {
    let received;
    const cb = (data) => { received = data; };
    on('test', cb);
    emit('test', { x: 1 });
    expect(received).toEqual({ x: 1 });
    off('test', cb);
  });

  it('off removes listener', () => {
    let count = 0;
    const cb = () => { count++; };
    on('ev', cb);
    emit('ev');
    expect(count).toBe(1);
    off('ev', cb);
    emit('ev');
    expect(count).toBe(1);
  });

  it('emit with no listeners does not throw', () => {
    emit('nonexistent');
  });

  it('listener that throws is caught', () => {
    on('err', () => { throw new Error('oops'); });
    emit('err');
    off('err', () => {});
  });
});
