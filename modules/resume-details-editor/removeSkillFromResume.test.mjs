import { describe, expect, it } from 'vitest';
import { removeSkillFromResumeData } from './removeSkillFromResume.mjs';

describe('removeSkillFromResumeData', () => {
  it('removes the skill, display-name skillIDs, brackets, and education links; categories are left for commitResume', () => {
    const jobs = [
      {
        employer: 'resume-flyer',
        skillIDs: ['Vite', 'vue-3', 'vite'],
        Description: 'A [Vue 3] + [Vite] SPA, also [vite].',
      },
      {
        employer: 'other',
        skillIDs: ['python'],
        Description: 'Uses [Python] and [Java 21].',
      },
    ];
    const skills = {
      vite: { name: 'Vite', jobIDs: [0] },
      'vue-3': { name: 'Vue 3', jobIDs: [0] },
      python: { name: 'Python', jobIDs: [1] },
      'java-21': { name: 'Java 21', jobIDs: [] },
    };
    const education = {
      0: { institution: 'MIT', skillIDs: ['Vite', 'Computer Vision'], description: 'Studied [Vite].' },
    };
    const categories = {
      frontend: { name: 'Frontend', skillIDs: ['vite', 'vue-3', 'Vite'] },
    };

    const result = removeSkillFromResumeData({ jobs, skills, education, key: 'vite' });

    expect(result).toEqual({ ok: true, key: 'vite', name: 'Vite', descriptionFixes: 2 });
    expect(skills.vite).toBeUndefined();
    expect(skills['vue-3']).toBeDefined();
    expect(jobs[0].skillIDs).toEqual(['vue-3']);
    expect(jobs[0].Description).toBe('A [Vue 3] + Vite SPA, also vite.');
    expect(jobs[1].skillIDs).toEqual(['python']);
    expect(jobs[1].Description).toBe('Uses [Python] and [Java 21].');
    expect(education[0].skillIDs).toEqual(['Computer Vision']);
    expect(education[0].description).toBe('Studied Vite.');
    expect(categories.frontend.skillIDs).toEqual(['vite', 'vue-3', 'Vite']);
  });

  describe('bracket unwrapping keeps the prose intact', () => {
    const makeSkills = () => ({
      'c-plus-plus': { name: 'C++', jobIDs: [0] },
      other: { name: 'Other', jobIDs: [0] },
    });

    it('unwraps a mid-sentence token without touching surrounding spacing', () => {
      const skills = makeSkills();
      const jobs = [{ skillIDs: ['C++'], Description: 'built in [C++] for X' }];
      const result = removeSkillFromResumeData({ jobs, skills, key: 'C++' });
      expect(result).toEqual({ ok: true, key: 'c-plus-plus', name: 'C++', descriptionFixes: 1 });
      expect(jobs[0].Description).toBe('built in C++ for X');
    });

    it('unwraps a token at the start and at the end of the string', () => {
      const skills = makeSkills();
      const jobs = [{ skillIDs: ['C++'], Description: '[C++] daemon, later ported from [C++]' }];
      removeSkillFromResumeData({ jobs, skills, key: 'C++' });
      expect(jobs[0].Description).toBe('C++ daemon, later ported from C++');
    });

    it('unwraps a token adjacent to punctuation', () => {
      const skills = makeSkills();
      const jobs = [{ skillIDs: ['C++'], Description: 'Packet parser ([C++]), tuned for [C++].' }];
      removeSkillFromResumeData({ jobs, skills, key: 'C++' });
      expect(jobs[0].Description).toBe('Packet parser (C++), tuned for C++.');
    });

    it('leaves unrelated [Other] tokens and whitespace untouched', () => {
      const skills = makeSkills();
      const jobs = [{ skillIDs: ['C++', 'other'], Description: '• [Other]  and [C++]\n\n\n• trailing [Other]  ' }];
      removeSkillFromResumeData({ jobs, skills, key: 'C++' });
      expect(jobs[0].Description).toBe('• [Other]  and C++\n\n\n• trailing [Other]  ');
      expect(jobs[0].skillIDs).toEqual(['other']);
      expect(skills.other).toBeDefined();
    });

    it('reports zero description fixes when the removed skill has no bracket references', () => {
      const skills = makeSkills();
      const jobs = [{ skillIDs: ['C++'], Description: 'Mentions [Other] only.' }];
      const result = removeSkillFromResumeData({ jobs, skills, key: 'C++' });
      expect(result.descriptionFixes).toBe(0);
      expect(jobs[0].Description).toBe('Mentions [Other] only.');
    });

    it('unwraps education description fields the same way', () => {
      const skills = makeSkills();
      const education = { 0: { institution: 'MIT', skillIDs: ['C++'], description: 'Thesis code in [C++].' } };
      const result = removeSkillFromResumeData({ jobs: [], skills, education, key: 'C++' });
      expect(result.descriptionFixes).toBe(1);
      expect(education[0].description).toBe('Thesis code in C++.');
      expect(education[0].skillIDs).toEqual([]);
    });
  });

  it('resolves a display name to the skill slug', () => {
    const skills = { vite: { name: 'Vite', jobIDs: [] } };
    const jobs = [{ skillIDs: ['Vite'], Description: 'Built with [Vite].' }];
    const result = removeSkillFromResumeData({ jobs, skills, key: 'Vite' });
    expect(result.ok).toBe(true);
    expect(result.key).toBe('vite');
    expect(skills.vite).toBeUndefined();
    expect(jobs[0].skillIDs).toEqual([]);
    expect(jobs[0].Description).toBe('Built with Vite.');
  });

  it('reports a missing skill', () => {
    const skills = { python: { name: 'Python' } };
    const result = removeSkillFromResumeData({ jobs: [], skills, key: 'kubernetes' });
    expect(result).toEqual({ ok: false, error: 'Skill "kubernetes" not found.' });
    expect(skills.python).toBeDefined();
  });
});
