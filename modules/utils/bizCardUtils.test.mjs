import { describe, it, expect } from 'vitest';
import {
  createBizCardDivId,
  createBizCardDetailsDivId,
  createBizCardDetailsDivClass,
  indexElementsByJobNumber,
} from './bizCardUtils.mjs';

describe('bizCardUtils', () => {
  it('createBizCardDivId returns expected id', () => {
    expect(createBizCardDivId(1)).toBe('biz-card-div-1');
    expect(createBizCardDivId(42)).toBe('biz-card-div-42');
  });
  it('createBizCardDetailsDivId returns expected id', () => {
    expect(createBizCardDetailsDivId(1)).toBe('biz-card-details-div-1');
  });
  it('createBizCardDetailsDivClass returns fixed class', () => {
    expect(createBizCardDetailsDivClass()).toBe('biz-card-details-div');
  });

  it('indexElementsByJobNumber keys by data-job-number', () => {
    const a = { getAttribute: (n) => (n === 'data-job-number' ? '0' : null) };
    const b = { getAttribute: (n) => (n === 'data-job-number' ? '2' : null) };
    const byJob = indexElementsByJobNumber([a, b]);
    expect(byJob[0]).toBe(a);
    expect(byJob[1]).toBeUndefined();
    expect(byJob[2]).toBe(b);
  });
});
