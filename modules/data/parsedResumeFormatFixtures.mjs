/**
 * Canonical fixtures conforming to docs/PARSED-RESUME-FORMAT.md.
 * Used for format conformance tests.
 */

/** Raw .mjs file content (export const format) */
export const FIXTURE_JOBS_MJS = `export const jobs = {
  "0": {
    "role": "Engineer",
    "employer": "Acme",
    "start": "2020-01-01",
    "end": "2022-01-01",
    "Description": "Built with [Python] and [AWS].",
    "skillIDs": ["python", "aws"]
  },
  "1": {
    "role": "Lead",
    "employer": "Beta",
    "start": "2022-01-01",
    "end": null,
    "Description": "Used [Python].",
    "skillIDs": ["python"]
  }
};`;

/** Raw .mjs file content */
export const FIXTURE_SKILLS_MJS = `export const skills = {
  "python": { "name": "Python", "url": "https://python.org", "img": "" },
  "aws": { "name": "AWS", "url": "https://aws.amazon.com", "img": "", "categoryIDs": ["cloud"], "jobIDs": [0, 1] }
};`;

/** Raw .mjs file content */
export const FIXTURE_CATEGORIES_MJS = `export const categories = {
  "cloud": { "name": "Cloud", "skillIDs": ["aws"] }
};`;

/** Raw .mjs file content */
export const FIXTURE_OTHER_SECTIONS_MJS = `export const otherSections = {
  "summary": "Professional summary",
  "title": "Software Engineer",
  "contact": { "name": "Jane Doe", "email": "jane@example.com", "phone": "+1-555-0100" },
  "certifications": [{ "name": "AWS Certified", "url": "https://aws.amazon.com/certification" }],
  "websites": [
    { "label": "LinkedIn", "url": "https://linkedin.com/in/janedoe" },
    { "label": "GitHub", "url": "https://github.com/janedoe" }
  ],
  "custom_sections": [{ "title": "Education", "subtitle": "2020", "description": "BS Computer Science" }]
};`;

/** Parsed jobs object (after parseMjsExport) - spec compliant */
export const FIXTURE_JOBS_PARSED = {
  '0': { role: 'Engineer', employer: 'Acme', start: '2020-01-01', end: '2022-01-01', Description: 'Built with [Python] and [AWS].', skillIDs: ['python', 'aws'] },
  '1': { role: 'Lead', employer: 'Beta', start: '2022-01-01', end: null, Description: 'Used [Python].', skillIDs: ['python'] }
};

/** Parsed skills object - spec compliant */
export const FIXTURE_SKILLS_PARSED = {
  python: { name: 'Python', url: 'https://python.org', img: '' },
  aws: { name: 'AWS', url: 'https://aws.amazon.com', img: '', categoryIDs: ['cloud'], jobIDs: [0, 1] }
};

/** Parsed categories object - spec compliant */
export const FIXTURE_CATEGORIES_PARSED = {
  cloud: { name: 'Cloud', skillIDs: ['aws'] }
};

/** Parsed otherSections object - spec compliant */
export const FIXTURE_OTHER_SECTIONS_PARSED = {
  summary: 'Professional summary',
  title: 'Software Engineer',
  contact: { name: 'Jane Doe', email: 'jane@example.com', phone: '+1-555-0100' },
  certifications: [{ name: 'AWS Certified', url: 'https://aws.amazon.com/certification' }],
  websites: [
    { label: 'LinkedIn', url: 'https://linkedin.com/in/janedoe' },
    { label: 'GitHub', url: 'https://github.com/janedoe' }
  ],
  custom_sections: [{ title: 'Education', subtitle: '2020', description: 'BS Computer Science' }]
};
