import { describe, it, expect } from 'vitest';
import { educationJobDisplayNameFromParts } from './educationJobDisplayName.mjs';

describe('educationJobDisplayNameFromParts', () => {
  it('parses MIT PhD example', () => {
    const employer = 'MIT, Massachusetts Institute of Technology, Cambridge, MA';
    const title =
      'PhD, Media Arts & Sciences — Computer Vision / Video Coding / Computer Graphics';
    expect(educationJobDisplayNameFromParts(employer, title)).toBe(
      'MIT, PhD, Media Arts & Sciences'
    );
  });

  it('parses BYU MS example', () => {
    const employer = 'BYU, Brigham Young University, Provo, UT';
    const title = 'MS, Computer Science — Medical Imaging / Computer Graphics';
    expect(educationJobDisplayNameFromParts(employer, title)).toBe(
      'BYU, MS, Computer Science'
    );
  });

  it('parses BYU BS example without specialization dash', () => {
    const employer = 'BYU, Brigham Young University';
    const title = 'BS, Design Engineering Technology';
    expect(educationJobDisplayNameFromParts(employer, title)).toBe(
      'BYU, BS, Design Engineering Technology'
    );
  });

  it('returns short institution when title empty', () => {
    expect(educationJobDisplayNameFromParts('Stanford, Stanford University', '')).toBe(
      'Stanford'
    );
  });

  it('handles title without comma (degree only)', () => {
    expect(educationJobDisplayNameFromParts('X', 'Certificate')).toBe('X, Certificate');
  });
});
