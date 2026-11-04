import { describe, it, expect } from 'vitest';
import {
  skillIdDisplay,
  skillDisplayName,
  skillLabelText,
  skillLabelHtml,
  skillLabelForSlug,
  labelToSlug,
  canonicalSkillKey,
  skillYearsExperienceLabel,
  skillYearsExperienceHtml,
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

  it('builds skill years experience labels for cards', () => {
    expect(skillYearsExperienceLabel(0)).toBe('');
    expect(skillYearsExperienceLabel(1)).toBe('(1 yr exp.)');
    expect(skillYearsExperienceLabel(3)).toBe('(3 yrs exp.)');
    expect(skillYearsExperienceHtml(2)).toBe('<span class="skill-card-years">(2 yrs exp.)</span>');
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

  it('resolves corporate-suffix variants to the base skill name', () => {
    const skillsData = {
      Apple: { name: 'Apple' },
      acme: { name: 'Acme' },
    };
    expect(labelToSlug('Apple Inc.', skillsData)).toBe('Apple');
    expect(labelToSlug('Apple Inc', skillsData)).toBe('Apple');
    expect(labelToSlug('Acme Corp.', skillsData)).toBe('acme');
    expect(labelToSlug('Acme LLC', skillsData)).toBe('acme');
    // Still unresolved when no base skill exists
    expect(labelToSlug('Kaplan Inc.', skillsData)).toBeNull();
  });

  describe('canonicalSkillKey', () => {
    const skillsData = {
      'express-js': { name: 'Express.js' },
      Vue: { name: 'Vue' },
      docx: { name: 'DOCX' },
    };

    it('returns a key unchanged (fast path)', () => {
      expect(canonicalSkillKey('express-js', skillsData)).toBe('express-js');
      expect(canonicalSkillKey('Vue', skillsData)).toBe('Vue');
    });

    it('maps a display name (any case) to its key', () => {
      expect(canonicalSkillKey('Express.js', skillsData)).toBe('express-js');
      expect(canonicalSkillKey('express.JS', skillsData)).toBe('express-js');
      expect(canonicalSkillKey('DOCX', skillsData)).toBe('docx');
      expect(canonicalSkillKey(' vue ', skillsData)).toBe('Vue');
    });

    it('resolves a name whose slug collapsed to one letter (C++ → "c") in any case', () => {
      const cpp = { c: { name: 'C++' } };
      expect(canonicalSkillKey('C++', cpp)).toBe('c');
      expect(canonicalSkillKey('c++', cpp)).toBe('c');
      expect(canonicalSkillKey('c', cpp)).toBe('c');
      expect(labelToSlug('c++', cpp)).toBe('c');
      expect(skillLabelForSlug(canonicalSkillKey('c++', cpp), cpp)).toBe('C++');
      expect(skillLabelText('c', cpp.c)).toBe('<c> C++');
    });

    it('returns the trimmed input when nothing matches, and empty for blank input', () => {
      expect(canonicalSkillKey('Unknown Thing', skillsData)).toBe('Unknown Thing');
      expect(canonicalSkillKey('  ', skillsData)).toBe('');
      expect(canonicalSkillKey(null, skillsData)).toBe('');
      expect(canonicalSkillKey('express-js', null)).toBe('express-js');
    });

    it('scans the skills map once per map, not once per display-name lookup', () => {
      const raw = {};
      for (let i = 0; i < 120; i++) raw[`skill-${i}`] = { name: `Skill Number ${i}` };
      let enumerations = 0;
      const skills = new Proxy(raw, {
        ownKeys(target) { enumerations += 1; return Reflect.ownKeys(target); },
      });

      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 120; i++) {
          expect(canonicalSkillKey(`skill number ${i}`, skills)).toBe(`skill-${i}`);
          expect(canonicalSkillKey(`SKILL-${i}`, skills)).toBe(`skill-${i}`);
        }
      }
      // Building the index enumerates the map twice (names, then keys); 720 resolved
      // lookups must not add a per-lookup scan on top of that.
      expect(enumerations).toBeLessThanOrEqual(2);
    });

    it('never returns a stale slug after the skills map is edited in place', () => {
      const skills = { 'vue-js': { name: 'Vue.js' }, docx: { name: 'DOCX' } };
      expect(canonicalSkillKey('vue.js', skills)).toBe('vue-js');
      expect(canonicalSkillKey('pdf', skills)).toBe('pdf');

      skills.pdf = { name: 'PDF' };
      expect(canonicalSkillKey('PDF', skills)).toBe('pdf');

      skills['vue-js'].name = 'Vue 3';
      expect(canonicalSkillKey('Vue 3', skills)).toBe('vue-js');
      expect(canonicalSkillKey('vue.js', skills)).toBe('vue.js');

      delete skills.docx;
      expect(canonicalSkillKey('DOCX', skills)).toBe('DOCX');
      expect(labelToSlug('docx', skills)).toBeNull();
    });
  });
});
