import { describe, it, expect } from 'vitest';
import { applyOutlineFromHeading } from './applyOutlineFromHeading.mjs';

describe('applyOutlineFromHeading', () => {
  it('extracts tag from employer and strips it', () => {
    const job = applyOutlineFromHeading({ employer: '[1.2.1] Adobe / Data Analytics', role: 'Dev' });
    expect(job.outlineIndex).toBe('1.2.1');
    expect(job.employer).toBe('Adobe / Data Analytics');
    expect(job.outlineKind).toBeUndefined();
  });

  it('marks section labels without dates or body', () => {
    const job = applyOutlineFromHeading({ employer: '[1.1] Spexture Portfolio Projects' });
    expect(job.outlineIndex).toBe('1.1');
    expect(job.outlineKind).toBe('section');
    expect(job.employer).toBe('Spexture Portfolio Projects');
  });

  it('leaves jobs without tags unchanged', () => {
    const job = applyOutlineFromHeading({ employer: 'Adobe', start: '2025-03', end: '2025-07' });
    expect(job.outlineIndex).toBeUndefined();
    expect(job.employer).toBe('Adobe');
  });
});
