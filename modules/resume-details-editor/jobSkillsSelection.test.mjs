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
