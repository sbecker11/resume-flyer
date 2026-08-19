import { describe, it, expect } from 'vitest';
import {
  parseOutlineIndex,
  normalizeOutlineIndex,
  isValidOutlineIndex,
  compareOutlineIndex,
  outlineNestDepth,
  parentOutlineIndex,
  extractContentIndexTag,
  formatContentIndexTag,
  formatContentIndexHeading,
  stripDisplayedOutlineIndex,
  outlineIndexOf,
  displayJobHeading,
  jobsHaveOutlineIndex,
} from './outlineIndex.mjs';

describe('parseOutlineIndex', () => {
  it('parses dotted numeric paths', () => {
    expect(parseOutlineIndex('1')).toEqual([1]);
    expect(parseOutlineIndex('1.1.10')).toEqual([1, 1, 10]);
    expect(parseOutlineIndex(' 5.2 ')).toEqual([5, 2]);
  });

  it('returns null for missing or invalid', () => {
    expect(parseOutlineIndex('')).toBeNull();
    expect(parseOutlineIndex(null)).toBeNull();
    expect(parseOutlineIndex('1.a')).toBeNull();
    expect(parseOutlineIndex('1.')).toBeNull();
  });
});

describe('normalizeOutlineIndex / isValidOutlineIndex', () => {
  it('canonicalizes valid values', () => {
    expect(normalizeOutlineIndex(' 1.02.3 ')).toBe('1.2.3');
    expect(isValidOutlineIndex('1.2.3')).toBe(true);
  });

  it('treats blank as valid (optional field)', () => {
    expect(isValidOutlineIndex('')).toBe(true);
    expect(isValidOutlineIndex('   ')).toBe(true);
    expect(normalizeOutlineIndex('')).toBe('');
  });

  it('rejects invalid non-empty values', () => {
    expect(isValidOutlineIndex('1.2.')).toBe(false);
    expect(isValidOutlineIndex('one')).toBe(false);
  });
});

describe('compareOutlineIndex', () => {
  it('orders parent before children and numeric segments', () => {
    expect(compareOutlineIndex('1', '1.1')).toBeLessThan(0);
    expect(compareOutlineIndex('1.1', '1.2')).toBeLessThan(0);
    expect(compareOutlineIndex('1.1.9', '1.1.10')).toBeLessThan(0);
    expect(compareOutlineIndex('1.2', '2')).toBeLessThan(0);
  });

  it('sorts missing after valid', () => {
    expect(compareOutlineIndex('', '1')).toBeGreaterThan(0);
    expect(compareOutlineIndex('1', '')).toBeLessThan(0);
    expect(compareOutlineIndex('', null)).toBe(0);
  });
});

describe('outlineNestDepth', () => {
  it('uses segment count minus one', () => {
    expect(outlineNestDepth('1')).toBe(0);
    expect(outlineNestDepth('1.1')).toBe(1);
    expect(outlineNestDepth('1.1.3')).toBe(2);
    expect(outlineNestDepth('')).toBe(0);
  });
});

describe('stripDisplayedOutlineIndex', () => {
  it('strips leading dotted tokens, not bare integers', () => {
    expect(stripDisplayedOutlineIndex('1. Spexture (Independent Consulting)')).toBe(
      'Spexture (Independent Consulting)'
    );
    expect(stripDisplayedOutlineIndex('1.1. Spexture Portfolio Projects')).toBe(
      'Spexture Portfolio Projects'
    );
    expect(stripDisplayedOutlineIndex('[1.1.1] resume-parser')).toBe('resume-parser');
    expect(stripDisplayedOutlineIndex('1.1.1 • resume-parser')).toBe('1 • resume-parser');
    expect(stripDisplayedOutlineIndex('3 yrs PySpark on AWS EMR')).toBe(
      '3 yrs PySpark on AWS EMR'
    );
    expect(stripDisplayedOutlineIndex('Portfolio Projects')).toBe('Portfolio Projects');
  });

  it('strips [1.1.3] content-index tags from headings', () => {
    expect(extractContentIndexTag('[1.1.10] recruiting-pipeline')).toEqual({
      index: '1.1.10',
      rest: 'recruiting-pipeline',
    });
    expect(formatContentIndexTag('1.1.3')).toBe('[1.1.3]');
    expect(formatContentIndexHeading('1.2.1', 'Adobe / Data Analytics')).toBe(
      '[1.2.1] Adobe / Data Analytics'
    );
    expect(formatContentIndexHeading('1.2.1', '[9] Adobe / Data Analytics')).toBe(
      '[1.2.1] Adobe / Data Analytics'
    );
    expect(stripDisplayedOutlineIndex('[1.2.1] Adobe / Data Analytics')).toBe(
      'Adobe / Data Analytics'
    );
  });
});

describe('outlineIndexOf / displayJobHeading', () => {
  it('reads the heading tag when outlineIndex is absent', () => {
    const job = { employer: '[1.2.3] Cigna' };
    expect(outlineIndexOf(job)).toBe('1.2.3');
    expect(displayJobHeading(job)).toBe('Cigna');
  });

  it('prefers the outlineIndex field', () => {
    expect(outlineIndexOf({ outlineIndex: '5.1', employer: '[9] MSC' })).toBe('5.1');
  });
});

describe('jobsHaveOutlineIndex', () => {
  it('detects field or heading tag', () => {
    expect(jobsHaveOutlineIndex([{ employer: 'A' }])).toBe(false);
    expect(jobsHaveOutlineIndex([{ outlineIndex: '1' }, { employer: 'A' }])).toBe(true);
    expect(jobsHaveOutlineIndex([{ employer: '[1.1] Portfolio Projects' }])).toBe(true);
    expect(jobsHaveOutlineIndex(null)).toBe(false);
  });
});
