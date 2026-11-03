import { describe, it, expect } from 'vitest';
import {
  filterDescriptionBracketsToSkillSelection,
  getSelectedSkillIdsForJob,
} from './jobSkillsSelection.mjs';

describe('jobSkillsSelection', () => {
  const map = {
    Python: { name: 'Python' },
    AWS: { name: 'AWS' },
  };

  describe('filterDescriptionBracketsToSkillSelection', () => {
    it('removes brackets for skills not in the selection set', () => {
      const d = 'Built with [Python] and [AWS].';
      const out = filterDescriptionBracketsToSkillSelection(d, new Set(['Python']), map);
      expect(out).toMatch(/\[Python\]/);
      expect(out).not.toMatch(/\[AWS\]/);
    });

    it('keeps brackets that do not resolve to a skill key', () => {
      const d = 'See [not-a-skill] and [Python].';
      const out = filterDescriptionBracketsToSkillSelection(d, new Set(), map);
      expect(out).toContain('[not-a-skill]');
      expect(out).not.toContain('[Python]');
    });
  });

  describe('getSelectedSkillIdsForJob', () => {
    const slugMap = {
      'ai-ml': { name: 'AI/ML' },
      'ai-agents': { name: 'AI Agents' },
      python: { name: 'Python' },
    };

    it('resolves display-name skillIDs to the canonical key', () => {
      const job = { skillIDs: ['AI Agents', 'AI/ML', 'python'], Description: '' };
      const ids = getSelectedSkillIdsForJob(job, slugMap);
      expect([...ids].sort()).toEqual(['ai-agents', 'ai-ml', 'python']);
      expect(ids.has('AI/ML')).toBe(false);
    });

    it('does not double-count a skill listed by name and by bracket', () => {
      const job = { skillIDs: ['AI/ML'], Description: 'Shipped [AI/ML] features in [Python].' };
      expect([...getSelectedSkillIdsForJob(job, slugMap)].sort()).toEqual(['ai-ml', 'python']);
    });

    it('keeps an id that matches no skill as typed and skips blanks', () => {
      const job = { skillIDs: ['Not A Skill', '', '  '], Description: '' };
      expect([...getSelectedSkillIdsForJob(job, slugMap)]).toEqual(['Not A Skill']);
    });
  });

  describe('getSelectedSkillIdsForJob + filter round-trip', () => {
    it('after filtering to empty selection, job has no description-linked skills', () => {
      const job = { skillIDs: [], Description: 'Used [Python].' };
      const before = getSelectedSkillIdsForJob(job, map);
      expect(before.has('Python')).toBe(true);
      const desc2 = filterDescriptionBracketsToSkillSelection(job.Description, new Set(), map);
      const after = getSelectedSkillIdsForJob({ ...job, Description: desc2 }, map);
      expect(after.has('Python')).toBe(false);
    });
  });
});
