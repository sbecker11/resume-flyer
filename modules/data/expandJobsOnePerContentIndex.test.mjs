import { describe, it, expect } from 'vitest';
import {
  expandJobsOnePerContentIndex,
  parseContentIndexHeading,
} from './expandJobsOnePerContentIndex.mjs';

describe('parseContentIndexHeading', () => {
  it('parses paren dates and em-dash description', () => {
    const parsed = parseContentIndexHeading(
      '1.2.1',
      '• Adobe (03/2025 – 07/2025) — Built admin tools.'
    );
    expect(parsed.employer).toBe('Adobe');
    expect(parsed.start).toBe('03/2025');
    expect(parsed.end).toBe('07/2025');
    expect(parsed.Description).toContain('admin tools');
  });

  it('parses trailing dates without parens', () => {
    const parsed = parseContentIndexHeading(
      '1.2.2',
      'Fannie Mae 02/2024 – 07/2024 — Built dbt models.'
    );
    expect(parsed.employer).toBe('Fannie Mae');
    expect(parsed.start).toBe('02/2024');
    expect(parsed.end).toBe('07/2024');
  });
});

describe('expandJobsOnePerContentIndex', () => {
  it('is a no-op when descriptions have no content-index tags', () => {
    const jobs = [{ employer: 'Acme', Description: '• Built [Python] tools.' }];
    expect(expandJobsOnePerContentIndex(jobs)).toBe(jobs);
  });

  it('expands each tagged line into its own job and does not copy parent dates', () => {
    const jobs = [
      {
        employer: 'Spexture (Independent Consulting)',
        outlineIndex: '1',
        start: '11/2019',
        end: 'CURRENT_DATE',
        Description:
          '• Consulting blurb.\n' +
          '• [1.1.1] resume-parser — Agentic [DOCX] parser\n' +
          '• [1.2.1] Adobe (03/2025 – 07/2025) — Built admin tools.',
      },
      {
        employer: 'SeniorLink (now Careforth)',
        outlineIndex: '2',
        start: '06/2017',
        end: '11/2019',
        Description: '• PySpark on EMR.',
      },
    ];
    const out = expandJobsOnePerContentIndex(jobs);
    const byIdx = Object.fromEntries(out.map((j) => [j.outlineIndex, j]));
    expect(out.map((j) => j.outlineIndex)).toEqual(['1', '1.1', '1.1.1', '1.2', '1.2.1', '2']);
    expect(byIdx['1.1'].outlineKind).toBe('section');
    expect(byIdx['1.1'].employer).toBe('Spexture Portfolio Projects');
    expect(byIdx['1.1.1'].employer).toBe('resume-parser');
    expect(byIdx['1.1.1'].start).toBe('');
    expect(byIdx['1.1.1'].end).toBe('');
    expect(byIdx['1.1.1'].Description).toContain('DOCX');
    expect(byIdx['1.2.1'].employer).toBe('Adobe');
    expect(byIdx['1.2.1'].start).toBe('03/2025');
    expect(byIdx['1'].start).toBe('11/2019');
    expect(byIdx['1'].Description).toContain('Consulting blurb');
    expect(byIdx['1'].Description).not.toMatch(/\[1\.1\.1\]/);
  });
});
