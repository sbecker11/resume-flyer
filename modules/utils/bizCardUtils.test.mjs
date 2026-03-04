import { describe, it, expect } from 'vitest';
import {
  createBizCardDivId,
  createBizCardDetailsDivId,
  createBizCardDetailsDivClass,
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
});
