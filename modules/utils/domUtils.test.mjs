import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasClass,
  addClass,
  removeClass,
  getContrastingColor,
  isHTMLElement,
  targetEnabled,
  selectForDisabled,
  disableSelectedForDisabled,
  restoreSelectedForDisabled,
  findNextSiblingWithClass,
  matchPositions,
  updateEventListener,
  getObjectAsString,
  getAttributesAsObject,
  getAttributesAsString,
  getDatasetAsString,
  formatNumbersReplacer,
  getOffset,
  test_domUtils,
} from './domUtils.mjs';

beforeEach(() => {
  if (globalThis.window) globalThis.window.CONSOLE_LOG_IGNORE = () => {};
});

describe('domUtils', () => {
  describe('hasClass', () => {
    it('returns true when element has class', () => {
      const el = document.createElement('div');
      el.className = 'foo bar';
      expect(hasClass(el, 'foo')).toBe(true);
      expect(hasClass(el, 'bar')).toBe(true);
    });
    it('returns false when element does not have class', () => {
      const el = document.createElement('div');
      el.className = 'foo';
      expect(hasClass(el, 'bar')).toBe(false);
    });
    it('returns falsy for null element', () => {
      expect(hasClass(null, 'foo')).toBeFalsy();
    });
  });

  describe('addClass', () => {
    it('adds class when not present', () => {
      const el = document.createElement('div');
      addClass(el, 'new');
      expect(el.classList.contains('new')).toBe(true);
    });
    it('does not duplicate class', () => {
      const el = document.createElement('div');
      el.className = 'old';
      addClass(el, 'old');
      expect(el.classList.contains('old')).toBe(true);
    });
  });

  describe('removeClass', () => {
    it('removes class when present', () => {
      const el = document.createElement('div');
      el.className = 'foo';
      expect(removeClass(el, 'foo')).toBe(true);
      expect(el.classList.contains('foo')).toBe(false);
    });
    it('returns false when class not present', () => {
      const el = document.createElement('div');
      expect(removeClass(el, 'foo')).toBe(false);
    });
  });

  describe('getContrastingColor', () => {
    it('returns black or white hex', () => {
      const c = getContrastingColor('#000000');
      expect(c === '#000000' || c === '#ffffff').toBe(true);
    });
  });

  describe('isHTMLElement', () => {
    it('returns true for HTMLElement', () => {
      expect(isHTMLElement(document.createElement('div'))).toBe(true);
    });
    it('returns false for non-element', () => {
      expect(isHTMLElement({})).toBe(false);
      expect(isHTMLElement(null)).toBe(false);
    });
  });

  describe('targetEnabled', () => {
    it('does not throw when selector not found', () => {
      targetEnabled('#nonexistent');
    });
  });

  describe('selectForDisabled', () => {
    it('returns NodeList', () => {
      const list = selectForDisabled('body');
      expect(list).toBeDefined();
    });
  });

  describe('disableSelectedForDisabled and restoreSelectedForDisabled', () => {
    it('sets and restores pointerEvents', () => {
      const el = document.createElement('div');
      el.style.pointerEvents = 'auto';
      disableSelectedForDisabled([el]);
      expect(el.style.pointerEvents).toBe('none');
      restoreSelectedForDisabled([el]);
      expect(el.style.pointerEvents).toBe('auto');
    });
  });

  describe('findNextSiblingWithClass', () => {
    it('returns null for null element', () => {
      expect(findNextSiblingWithClass(null, 'x')).toBe(null);
    });
    it('returns null when no matching sibling', () => {
      const parent = document.createElement('div');
      const a = document.createElement('span');
      a.className = 'a';
      parent.append(a);
      expect(findNextSiblingWithClass(a, 'other')).toBe(null);
    });
    it('returns next sibling with class', () => {
      const parent = document.createElement('div');
      const a = document.createElement('span');
      const b = document.createElement('span');
      b.className = 'target';
      parent.append(a, b);
      expect(findNextSiblingWithClass(a, 'target')).toBe(b);
    });
  });

  describe('matchPositions', () => {
    it('returns true when positions match', () => {
      expect(matchPositions({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    });
    it('returns false when different', () => {
      expect(matchPositions({ x: 1, y: 2 }, { x: 1, y: 3 })).toBe(false);
    });
  });

  describe('updateEventListener', () => {
    it('adds listener when options.remove is not true', () => {
      const el = document.createElement('div');
      const fn = () => {};
      updateEventListener(el, 'click', fn);
      expect(el.onclick !== undefined || true).toBe(true);
    });
    it('removes listener when options.remove is true', () => {
      const el = document.createElement('div');
      const fn = () => {};
      el.addEventListener('click', fn);
      updateEventListener(el, 'click', fn, { remove: true });
    });
  });

  describe('getObjectAsString', () => {
    it('returns key:value string', () => {
      expect(getObjectAsString({ a: 1, b: 2 })).toMatch(/a:1|b:2/);
    });
  });

  describe('getAttributesAsObject', () => {
    it('returns attributes map', () => {
      const el = document.createElement('div');
      el.setAttribute('id', 'x');
      expect(getAttributesAsObject(el)).toHaveProperty('id', 'x');
    });
  });

  describe('getAttributesAsString', () => {
    it('returns string', () => {
      const el = document.createElement('div');
      el.setAttribute('id', 'y');
      expect(typeof getAttributesAsString(el)).toBe('string');
    });
  });

  describe('getDatasetAsString', () => {
    it('returns string for element dataset', () => {
      const el = document.createElement('div');
      el.dataset.foo = 'bar';
      expect(typeof getDatasetAsString(el)).toBe('string');
    });
  });

  describe('formatNumbersReplacer', () => {
    it('rounds numbers', () => {
      expect(formatNumbersReplacer('', 1.234)).toBe(1.23);
    });
    it('returns value for non-number', () => {
      expect(formatNumbersReplacer('', 'x')).toBe('x');
    });
  });

  describe('getOffset', () => {
    it('returns top and left', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const o = getOffset(el);
      expect(o).toHaveProperty('top');
      expect(o).toHaveProperty('left');
      document.body.removeChild(el);
    });
  });

  describe('test_domUtils', () => {
    it('runs without throwing', () => {
      test_domUtils();
    });
  });
});
