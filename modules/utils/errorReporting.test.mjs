import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError } from './errorReporting.mjs';

describe('reportError', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('logs the context, the message, and the Error object', () => {
        const err = new Error('boom');
        reportError(err, '[Module] operation failed');
        expect(console.error).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith('[Module] operation failed: boom', err);
        expect(console.log).not.toHaveBeenCalled();
    });

    it('logs a Remedy line only when a remedy is given', () => {
        reportError(new Error('boom'), '[Module] failed', 'Reverting to previous value');
        expect(console.log).toHaveBeenCalledTimes(1);
        expect(console.log).toHaveBeenCalledWith('Remedy: Reverting to previous value');
    });

    it('stringifies non-Error values and omits the trailing object', () => {
        reportError('plain string failure', '[Module] failed');
        expect(console.error).toHaveBeenCalledWith('[Module] failed: plain string failure', '');
        reportError({ code: 42 });
        expect(console.error).toHaveBeenLastCalledWith('[object Object]', '');
    });

    it('omits the prefix when no context is passed', () => {
        const err = new Error('no context');
        reportError(err);
        expect(console.error).toHaveBeenCalledWith('no context', err);
    });
});
