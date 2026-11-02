import { describe, expect, it } from 'vitest';
import { removeSkillFromResumeData } from './removeSkillFromResume.mjs';

describe('removeSkillFromResumeData', () => {
  it('removes the skill, display-name skillIDs, brackets, education, and category links', () => {
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

    const result = removeSkillFromResumeData({ jobs, skills, education, categories, key: 'vite' });

    expect(result).toEqual({ ok: true, key: 'vite', name: 'Vite', descriptionFixes: 2 });
    expect(skills.vite).toBeUndefined();
    expect(skills['vue-3']).toBeDefined();
    expect(jobs[0].skillIDs).toEqual(['vue-3']);
    expect(jobs[0].Description).toBe('A [Vue 3] + SPA, also .');
    expect(jobs[1].skillIDs).toEqual(['python']);
    expect(jobs[1].Description).toBe('Uses [Python] and [Java 21].');
    expect(education[0].skillIDs).toEqual(['Computer Vision']);
    expect(education[0].description).toBe('Studied .');
    expect(categories.frontend.skillIDs).toEqual(['vue-3']);
  });

  it('resolves a display name to the skill slug', () => {
    const skills = { vite: { name: 'Vite', jobIDs: [] } };
    const jobs = [{ skillIDs: ['Vite'], Description: 'Built with [Vite].' }];
    const result = removeSkillFromResumeData({ jobs, skills, key: 'Vite' });
    expect(result.ok).toBe(true);
    expect(result.key).toBe('vite');
    expect(skills.vite).toBeUndefined();
    expect(jobs[0].skillIDs).toEqual([]);
    expect(jobs[0].Description).toBe('Built with .');
  });

  it('reports a missing skill', () => {
    const skills = { python: { name: 'Python' } };
    const result = removeSkillFromResumeData({ jobs: [], skills, key: 'kubernetes' });
    expect(result).toEqual({ ok: false, error: 'Skill "kubernetes" not found.' });
    expect(skills.python).toBeDefined();
  });
});
