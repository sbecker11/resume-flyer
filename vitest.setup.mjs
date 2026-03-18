// Global setup for Vitest: provide browser-like globals used by modules
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    CONSOLE_LOG_IGNORE: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    getComputedStyle: () => ({}),
    document: typeof document !== 'undefined' ? document : {},
  };
}
if (typeof globalThis.window.CONSOLE_LOG_IGNORE !== 'function') {
  globalThis.window.CONSOLE_LOG_IGNORE = () => {};
}
// So hasServer() returns true in tests (server branch); unit tests exercise API path
if (globalThis.window) {
  globalThis.window.location = {
    ...(globalThis.window.location || {}),
    origin: 'http://localhost',
    pathname: '/',
  };
}

// mathUtils.test_mathutils() and isNumericArray use these without importing (assumed global in app)
import * as utils from './modules/utils/utils.mjs';
globalThis.isNumericString = utils.isNumericString;
globalThis.abs = utils.abs;
globalThis.abs_diff = utils.abs_diff;
globalThis.min = utils.min;
globalThis.max = utils.max;
globalThis.max3 = utils.max3;
globalThis.clamp = utils.clamp;
globalThis.clampInt = utils.clampInt;
