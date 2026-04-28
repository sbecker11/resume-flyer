import { describe, it, expect } from 'vitest';
import { buildSkillSearchRegex, filterSkillsBySearchQuery } from './skillSearch.mjs';

describe('skillSearch', () => {
  const skills = [
    { id: 'aws-s3', name: 'AWS S3' },
    { id: 'gcp-bigquery', name: 'Google BigQuery' },
    { id: 'vue-js', name: 'Vue.js' },
  ];

  it('returns all skills for empty query', () => {
    expect(filterSkillsBySearchQuery(skills, '')).toEqual(skills);
  });

  it('supports regex alternation from raw query input', () => {
    const out = filterSkillsBySearchQuery(skills, 'aws|gcp');
    expect(out.map((s) => s.id)).toEqual(['aws-s3', 'gcp-bigquery']);
  });

  it('supports /pattern/flags syntax', () => {
    const out = filterSkillsBySearchQuery(skills, '/vue\\.js/i');
    expect(out.map((s) => s.id)).toEqual(['vue-js']);
  });

  it('matches skill id and skill name', () => {
    const byId = filterSkillsBySearchQuery(skills, 'bigquery');
    expect(byId.map((s) => s.id)).toEqual(['gcp-bigquery']);
  });

  it('falls back to literal search if regex is invalid', () => {
    const re = buildSkillSearchRegex('[');
    expect(re).toBeInstanceOf(RegExp);
    const out = filterSkillsBySearchQuery([{ id: '[abc]', name: 'broken regex input' }], '[');
    expect(out).toHaveLength(1);
  });
});
