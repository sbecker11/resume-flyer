import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getMonthDates,
  getIsoDateString,
  parseFlexibleDateString,
  parseJobTenureEndpoint,
  jobTenureMonthsInclusive,
  parseYearStr,
  parseMonthStr,
  parseISO8601,
  parseISO8601Strict,
  formatISO8601Basic,
  formatISO8601WithMillis,
  formatISO8601NoMillis,
  formatISO8601ShellAlias,
  formatISO8601WithTimezone,
  formatISO8601DateOnly,
  formatISO8601YearMonth,
  getMinMaxYears,
  getDateFromString,
  get_YYYY_MM_DD_DateFromString,
  getDateDifference,
  validateIs_YYYY_MM_DD_DateString,
  formatDateRange,
  test_dateUtils,
} from './dateUtils.mjs';

beforeEach(() => {
  if (globalThis.window) globalThis.window.CONSOLE_LOG_IGNORE = () => {};
});

describe('dateUtils', () => {
  describe('getMonthDates', () => {
    it('returns start and end for valid month', () => {
      const { start, end } = getMonthDates(2023, 6);
      expect(start.getFullYear()).toBe(2023);
      expect(start.getMonth()).toBe(5);
      expect(start.getDate()).toBe(1);
      expect(end.getDate()).toBe(30);
    });
    it('throws for invalid year', () => {
      expect(() => getMonthDates(99, 1)).toThrow(/Invalid year/);
      expect(() => getMonthDates(10000, 1)).toThrow(/Invalid year/);
    });
    it('throws for invalid month', () => {
      expect(() => getMonthDates(2023, 0)).toThrow(/Invalid month/);
      expect(() => getMonthDates(2023, 13)).toThrow(/Invalid month/);
    });
  });

  describe('getIsoDateString', () => {
    it('returns YYYY-MM-DD', () => {
      const d = new Date(Date.UTC(2023, 0, 15));
      expect(getIsoDateString(d)).toBe('2023-01-15');
    });
  });

  describe('parseFlexibleDateString', () => {
    it('parses YYYY-MM-DD', () => {
      const d = parseFlexibleDateString('2023-01-15');
      expect(d.getUTCFullYear()).toBe(2023);
      expect(d.getUTCMonth()).toBe(0);
      expect(d.getUTCDate()).toBe(15);
    });
    it('parses YYYY-MM', () => {
      const d = parseFlexibleDateString('2023-02');
      expect(d.getUTCFullYear()).toBe(2023);
      expect(d.getUTCMonth()).toBe(1);
      expect(d.getUTCDate()).toBe(1);
      expect(d.getFullYear()).toBe(2023);
      expect(d.getMonth()).toBe(1);
      expect(d.getDate()).toBe(1);
    });
    it('parses YYYY', () => {
      const d = parseFlexibleDateString('2024');
      expect(d.getUTCFullYear()).toBe(2024);
      expect(d.getUTCMonth()).toBe(0);
    });
    it('parses Present/Current', () => {
      const d = parseFlexibleDateString('Present');
      expect(d).toBeInstanceOf(Date);
      const d2 = parseFlexibleDateString('current');
      expect(d2).toBeInstanceOf(Date);
      parseFlexibleDateString('current_date');
    });
    it('throws for invalid or empty', () => {
      expect(() => parseFlexibleDateString('')).toThrow(/Invalid or empty/);
      expect(() => parseFlexibleDateString('   ')).toThrow();
      expect(() => parseFlexibleDateString('invalid-date')).toThrow();
    });
  });

  describe('parseJobTenureEndpoint', () => {
    it('returns null for empty when emptyMeansNow is false', () => {
      expect(parseJobTenureEndpoint('')).toBeNull();
      expect(parseJobTenureEndpoint(null)).toBeNull();
    });
    it('returns Date for empty when emptyMeansNow is true', () => {
      const d = parseJobTenureEndpoint('', { emptyMeansNow: true });
      expect(d).toBeInstanceOf(Date);
    });
    it('parses Present without throwing', () => {
      expect(parseJobTenureEndpoint('CURRENT_DATE')).toBeInstanceOf(Date);
    });
  });

  describe('jobTenureMonthsInclusive', () => {
    it('counts inclusive calendar months for YYYY-MM range', () => {
      expect(jobTenureMonthsInclusive('2020-01', '2020-03')).toBe(3);
    });
    it('returns 1 for same YYYY', () => {
      expect(jobTenureMonthsInclusive('2020', '2020')).toBe(1);
    });
    it('returns null without start', () => {
      expect(jobTenureMonthsInclusive('', '2020')).toBeNull();
    });
    it('treats blank end as now when clock fixed', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2021, 5, 15)));
      expect(jobTenureMonthsInclusive('2020-01', '')).toBe(18);
      vi.useRealTimers();
    });
    it('returns null when end before start', () => {
      expect(jobTenureMonthsInclusive('2021-01', '2020-01')).toBeNull();
    });
  });

  describe('parseYearStr', () => {
    it('parses 4-digit year', () => {
      expect(parseYearStr('2023')).toBe(2023);
    });
    it('throws for invalid', () => {
      expect(() => parseYearStr('')).toThrow();
      expect(() => parseYearStr('123')).toThrow();
    });
  });

  describe('parseMonthStr', () => {
    it('parses 2-digit month 01-12', () => {
      expect(parseMonthStr('01')).toBe(1);
      expect(parseMonthStr('12')).toBe(12);
    });
    it('throws for invalid', () => {
      expect(() => parseMonthStr('00')).toThrow();
      expect(() => parseMonthStr('13')).toThrow();
      expect(() => parseMonthStr('1')).toThrow();
    });
  });

  describe('parseISO8601', () => {
    it('parses valid ISO string', () => {
      const d = parseISO8601('2023-06-15T14:30:45Z');
      expect(d.getTime()).toBeDefined();
    });
    it('strips UTC suffix', () => {
      const d = parseISO8601('2023-06-15T14:30:45 UTC');
      expect(d.getTime()).toBeDefined();
    });
    it('throws for invalid', () => {
      expect(() => parseISO8601('')).toThrow();
      expect(() => parseISO8601(null)).toThrow();
    });
  });

  describe('parseISO8601Strict', () => {
    it('parses strict ISO format', () => {
      const d = parseISO8601Strict('2023-06-15T14:30:45Z');
      expect(d.getTime()).toBeDefined();
    });
    it('throws for invalid format', () => {
      expect(() => parseISO8601Strict('2023-06-15')).toThrow();
    });
  });

  describe('formatISO8601*', () => {
    const validDate = new Date(Date.UTC(2023, 0, 15, 12, 30, 45, 123));
    it('formatISO8601Basic', () => {
      expect(formatISO8601Basic(validDate)).toMatch(/2023-01-15/);
    });
    it('formatISO8601WithMillis', () => {
      expect(formatISO8601WithMillis(validDate)).toMatch(/2023-01-15/);
    });
    it('formatISO8601NoMillis', () => {
      expect(formatISO8601NoMillis(validDate)).toMatch(/Z$/);
      expect(formatISO8601NoMillis(validDate)).not.toMatch(/\.\d{3}Z$/);
    });
    it('formatISO8601ShellAlias', () => {
      expect(formatISO8601ShellAlias(validDate)).toMatch(/ UTC$/);
    });
    it('formatISO8601WithTimezone', () => {
      expect(formatISO8601WithTimezone(validDate)).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
    it('formatISO8601DateOnly', () => {
      expect(formatISO8601DateOnly(validDate)).toBe('2023-01-15');
    });
    it('formatISO8601YearMonth', () => {
      expect(formatISO8601YearMonth(validDate)).toBe('2023-01');
    });
    it('throw for invalid Date', () => {
      expect(() => formatISO8601Basic(new Date('invalid'))).toThrow();
      expect(() => formatISO8601Basic({})).toThrow();
    });
  });

  describe('getMinMaxYears', () => {
    it('returns current year for empty jobs', () => {
      const r = getMinMaxYears([]);
      expect(r.minYear).toBe(r.maxYear);
      expect(r.minYear).toBe(new Date().getFullYear());
    });
    it('returns min/max from jobs', () => {
      const r = getMinMaxYears([
        { start: '2020-06-15', end: '2021-06-15' },
        { start: '2022-06-15', end: '2023-06-15' },
      ]);
      expect(r.minYear).toBe(2020);
      expect(r.maxYear).toBe(2023);
    });
  });

  describe('getDateFromString', () => {
    it('parses YYYY-MM-DD and YYYY-MM', () => {
      const d1 = getDateFromString('2023-06-15');
      expect(d1.getFullYear()).toBe(2023);
      expect(d1.getMonth()).toBe(5);
      const d2 = getDateFromString('2023-06');
      expect(d2.getMonth()).toBe(5);
    });
    it('throws for invalid', () => {
      expect(() => getDateFromString('')).toThrow();
      expect(() => getDateFromString('2023-13-01')).toThrow();
    });
  });

  describe('get_YYYY_MM_DD_DateFromString', () => {
    it('parses valid strings', () => {
      const d = get_YYYY_MM_DD_DateFromString('2023-06-15');
      expect(d.getFullYear()).toBe(2023);
      get_YYYY_MM_DD_DateFromString('2023-06');
    });
    it('throws for invalid', () => {
      expect(() => get_YYYY_MM_DD_DateFromString('')).toThrow();
    });
  });

  describe('getDateDifference', () => {
    it('returns years months days', () => {
      const start = new Date(2020, 0, 15);
      const end = new Date(2023, 2, 20);
      const r = getDateDifference(start, end);
      expect(r.years).toBeDefined();
      expect(r.months).toBeDefined();
      expect(r.days).toBeDefined();
    });
    it('throws if end before start', () => {
      const start = new Date(2023, 0, 1);
      const end = new Date(2022, 0, 1);
      expect(() => getDateDifference(start, end)).toThrow(/End date must be after/);
    });
    it('throws for non-Date', () => {
      expect(() => getDateDifference('2020-01-01', new Date())).toThrow(/must be Date/);
    });
  });

  describe('validateIs_YYYY_MM_DD_DateString', () => {
    it('accepts YYYY-MM-DD and YYYY-MM', () => {
      expect(() => validateIs_YYYY_MM_DD_DateString('2023-06-15')).not.toThrow();
      expect(() => validateIs_YYYY_MM_DD_DateString('2023-06')).not.toThrow();
    });
    it('throws for invalid', () => {
      expect(() => validateIs_YYYY_MM_DD_DateString('')).toThrow();
      expect(() => validateIs_YYYY_MM_DD_DateString('2023-13-01')).toThrow();
    });
  });

  describe('formatDateRange', () => {
    it('formats range', () => {
      const s = formatDateRange('2022-01', '2023-06');
      expect(s).toMatch(/ - /);
    });
    it('handles CURRENT_DATE and Present', () => {
      const s = formatDateRange('2022-01', 'CURRENT_DATE');
      expect(s).toMatch(/Present| - /);
      formatDateRange('2022-01', 'Present');
    });
    it('handles lowercase current markers', () => {
      expect(formatDateRange('2022-01', 'current_date')).toContain('Present');
      expect(formatDateRange('2022-01', 'current')).toContain('Present');
    });
  });

  describe('test_dateUtils', () => {
    it('runs without throwing', () => {
      test_dateUtils();
    });
  });
});
