import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { complainLoudlyPaletteS3Failure } from './paletteS3LoudError.mjs';

describe('complainLoudlyPaletteS3Failure', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prints the banner with context and message, then the error and stack in a group', () => {
        const err = new Error('S3 catalog HTTP 503');
        complainLoudlyPaletteS3Failure('[paletteCatalog] refresh', err);

        const banner = console.error.mock.calls[0][0];
        expect(banner).toContain('FATAL: COLOR PALETTE CATALOG');
        expect(banner).toContain('[paletteCatalog] refresh');
        expect(banner).toContain('S3 catalog HTTP 503');
        expect(banner).toContain('S3_COLOR_PALETTES_JSON_URL');

        expect(console.groupCollapsed).toHaveBeenCalledWith('[palette-s3] Error object & stack');
        expect(console.error).toHaveBeenCalledWith(err);
        expect(console.error).toHaveBeenCalledWith(err.stack);
        expect(console.groupEnd).toHaveBeenCalledTimes(1);
    });

    it('stringifies non-Error values and skips the stack', () => {
        complainLoudlyPaletteS3Failure('[ctx]', 'plain failure');
        expect(console.error.mock.calls[0][0]).toContain('plain failure');
        // Error object logged inside the group, but no stack line.
        expect(console.error).toHaveBeenCalledWith('plain failure');
        const stackCalls = console.error.mock.calls.filter(([arg]) => typeof arg === 'string' && /^Error:/.test(arg));
        expect(stackCalls).toHaveLength(0);
    });

    it('falls back to a bare stack line when groupCollapsed is unavailable', () => {
        const original = console.groupCollapsed;
        console.groupCollapsed = undefined;
        try {
            const err = new Error('no groups');
            complainLoudlyPaletteS3Failure('[ctx]', err);
            expect(console.error).toHaveBeenCalledWith(err.stack);
            expect(console.groupEnd).not.toHaveBeenCalled();
        } finally {
            console.groupCollapsed = original;
        }
    });

    it('survives a console that rejects %c format strings', () => {
        let calls = 0;
        console.error.mockImplementation((first) => {
            calls += 1;
            if (typeof first === 'string' && first.startsWith('%c')) throw new Error('format rejected');
        });
        expect(() => complainLoudlyPaletteS3Failure('[ctx]', new Error('x'))).not.toThrow();
        expect(calls).toBeGreaterThan(1);
    });

    it('does nothing when there is no console.error', () => {
        const original = console.error;
        console.error = undefined;
        try {
            expect(() => complainLoudlyPaletteS3Failure('[ctx]', new Error('x'))).not.toThrow();
        } finally {
            console.error = original;
        }
    });
});
