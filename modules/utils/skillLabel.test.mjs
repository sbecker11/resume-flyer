import { describe, it, expect } from 'vitest';
import {
  skillIdDisplay,
  skillDisplayName,
  skillLabelText,
  skillLabelHtml,
  skillLabelForSlug,
  labelToSlug,
} from './skillLabel.mjs';

describe('skillLabel', () => {
  it('returns raw slug for id display', () => {
    expect(skillIdDisplay('vue-js')).toBe('vue-js');
    expect(skillIdDisplay(123)).toBe('123');
  });

  it('uses skill.name when present, otherwise falls back to slug', () => {
    expect(skillDisplayName('aws', { name: 'Amazon Web Services' })).toBe('Amazon Web Services');
    expect(skillDisplayName('aws', {})).toBe('aws');
    expect(skillDisplayName('aws', null)).toBe('aws');
  });

  it('builds plain text labels', () => {
    expect(skillLabelText('aws', { name: 'Amazon Web Services' })).toBe('<aws> Amazon Web Services');
    expect(skillLabelText('python', null)).toBe('<python> python');
  });

  it('builds escaped html labels', () => {
    const html = skillLabelHtml('a<ws>', { name: 'A&B "quote" <test>' });
    expect(html).toContain('&lt;a&lt;ws&gt;&gt;');
    expect(html).toContain('A&amp;B &quot;quote&quot; &lt;test&gt;');
    expect(html).toContain('class="skill-id-tag"');
  });

  it('resolves labels for slug from a skills map', () => {
    const skillsData = { aws: { name: 'Amazon Web Services' }, python: {} };
    expect(skillLabelForSlug('aws', skillsData)).toBe('Amazon Web Services');
    expect(skillLabelForSlug('python', skillsData)).toBe('python');
    expect(skillLabelForSlug('missing', skillsData)).toBe('missing');
  });

  it('maps display labels back to slugs (name first, then slug fallback)', () => {
    const skillsData = {
      'google-bigquery': { name: 'Google BigQuery' },
      hipaa: { name: 'HIPAA' },
    };
    expect(labelToSlug('google bigquery', skillsData)).toBe('google-bigquery');
    expect(labelToSlug('HIPAA', skillsData)).toBe('hipaa');
    expect(labelToSlug('google-bigquery', skillsData)).toBe('google-bigquery');
    expect(labelToSlug('missing', skillsData)).toBeNull();
    expect(labelToSlug('', skillsData)).toBeNull();
    expect(labelToSlug('x', null)).toBeNull();
  });
});
