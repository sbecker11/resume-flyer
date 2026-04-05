import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isSceneCardRootElement,
  isVisibleSceneCardRoot,
  listVisibleSceneCardRoots,
  compareSceneCardsTopLeft,
} from './sceneCardVisibility.mjs';

/** Create a minimal fake Element with classList and nodeType */
function makeEl(classes = [], opts = {}) {
  const el = {
    nodeType: Node.ELEMENT_NODE,
    classList: {
      _set: new Set(classes),
      contains(c) { return this._set.has(c); },
      add(c) { this._set.add(c); },
    },
    querySelectorAll: opts.querySelectorAll ?? (() => []),
    querySelector: opts.querySelector ?? (() => null),
    getBoundingClientRect: opts.getBoundingClientRect ?? (() => ({ top: 0, left: 0, bottom: 0, right: 0 })),
    ...opts,
  };
  return el;
}

describe('isSceneCardRootElement', () => {
  it('returns false for null', () => {
    expect(isSceneCardRootElement(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSceneCardRootElement(undefined)).toBe(false);
  });

  it('returns false for non-element nodeType', () => {
    const el = makeEl(['biz-card-div']);
    el.nodeType = 3; // TEXT_NODE
    expect(isSceneCardRootElement(el)).toBe(false);
  });

  it('returns true for biz-card-div', () => {
    expect(isSceneCardRootElement(makeEl(['biz-card-div']))).toBe(true);
  });

  it('returns true for skill-card-div', () => {
    expect(isSceneCardRootElement(makeEl(['skill-card-div']))).toBe(true);
  });

  it('returns false for unrelated class', () => {
    expect(isSceneCardRootElement(makeEl(['some-other-div']))).toBe(false);
  });
});

describe('isVisibleSceneCardRoot', () => {
  let origGetComputedStyle;

  beforeEach(() => {
    origGetComputedStyle = global.getComputedStyle;
    global.getComputedStyle = vi.fn(() => ({ display: 'block' }));
  });

  afterEach(() => {
    global.getComputedStyle = origGetComputedStyle;
  });

  it('returns false for non-card element', () => {
    expect(isVisibleSceneCardRoot(makeEl(['other']))).toBe(false);
  });

  it('returns false when force-hidden-for-clone', () => {
    expect(isVisibleSceneCardRoot(makeEl(['biz-card-div', 'force-hidden-for-clone']))).toBe(false);
  });

  it('returns false when clone-hidden', () => {
    expect(isVisibleSceneCardRoot(makeEl(['biz-card-div', 'clone-hidden']))).toBe(false);
  });

  it('returns false when display is none', () => {
    global.getComputedStyle = vi.fn(() => ({ display: 'none' }));
    expect(isVisibleSceneCardRoot(makeEl(['biz-card-div']))).toBe(false);
  });

  it('returns true for visible biz-card-div', () => {
    expect(isVisibleSceneCardRoot(makeEl(['biz-card-div']))).toBe(true);
  });

  it('returns true for visible skill-card-div', () => {
    expect(isVisibleSceneCardRoot(makeEl(['skill-card-div']))).toBe(true);
  });
});

describe('listVisibleSceneCardRoots', () => {
  let origGetComputedStyle;

  beforeEach(() => {
    origGetComputedStyle = global.getComputedStyle;
    global.getComputedStyle = vi.fn(() => ({ display: 'block' }));
  });

  afterEach(() => {
    global.getComputedStyle = origGetComputedStyle;
  });

  it('returns [] when no root and no document', () => {
    const origDoc = global.document;
    global.document = undefined;
    expect(listVisibleSceneCardRoots(null)).toEqual([]);
    global.document = origDoc;
  });

  it('returns [] when root has no matching elements', () => {
    const root = makeEl([], {
      querySelectorAll: () => [],
    });
    expect(listVisibleSceneCardRoots(root)).toEqual([]);
  });

  it('filters out non-visible cards', () => {
    const visible = makeEl(['biz-card-div']);
    const hidden = makeEl(['biz-card-div', 'force-hidden-for-clone']);
    const root = makeEl([], {
      querySelectorAll: () => [visible, hidden],
    });
    const result = listVisibleSceneCardRoots(root);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(visible);
  });

  it('includes visible skill-card-div', () => {
    const card = makeEl(['skill-card-div']);
    const root = makeEl([], {
      querySelectorAll: () => [card],
    });
    expect(listVisibleSceneCardRoots(root)).toHaveLength(1);
  });
});

describe('compareSceneCardsTopLeft', () => {
  function cardAt(top, left) {
    return makeEl(['biz-card-div'], {
      getBoundingClientRect: () => ({ top, left, bottom: top + 100, right: left + 100 }),
    });
  }

  it('sorts top before bottom (negative = a first)', () => {
    const a = cardAt(10, 0);
    const b = cardAt(50, 0);
    expect(compareSceneCardsTopLeft(a, b)).toBeLessThan(0);
    expect(compareSceneCardsTopLeft(b, a)).toBeGreaterThan(0);
  });

  it('sorts left before right when tops are equal', () => {
    const a = cardAt(10, 5);
    const b = cardAt(10, 50);
    expect(compareSceneCardsTopLeft(a, b)).toBeLessThan(0);
    expect(compareSceneCardsTopLeft(b, a)).toBeGreaterThan(0);
  });

  it('returns 0 for same position', () => {
    const a = cardAt(10, 10);
    const b = cardAt(10, 10);
    expect(compareSceneCardsTopLeft(a, b)).toBe(0);
  });

  it('treats tops within 1px as equal (uses left to break tie)', () => {
    const a = cardAt(10.4, 5);
    const b = cardAt(10.9, 50);
    // |dy| = 0.5 <= 1, so falls through to left comparison
    expect(compareSceneCardsTopLeft(a, b)).toBeLessThan(0);
  });
});
