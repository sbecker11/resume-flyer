/**
 * Data-driven regression against the real indexed resume snapshot.
 *
 * jobs.json links "AI/ML" and "AI Agents" by display name while skills.json keys them
 * as "ai-ml" / "ai-agents". The Skill jobs tab and the Find-skill modal must count those
 * links (and the same months the scene skill card shows) instead of reporting zero.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSelectedSkillIdsForJob } from './jobSkillsSelection.mjs';
import { skillRowDisplayLabel } from './skillJobsMatrixLabels.mjs';
import { buildSkillSearchOptions } from '@/modules/utils/skillCardIdentity.mjs';
import { enrichJobsWithSkills } from '@/modules/data/enrichedJobs.mjs';
import { normalizeParserJobs, normalizeParserSkills } from '@/modules/data/parsedResumeAdapter.mjs';
import { mergeJobsWithEducation, toJobsArray } from '@/modules/data/mergeEducationIntoJobs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEXED_RESUME_DIR = path.resolve(__dirname, '../../parsed_resumes/shawn-becker-full-resume-indexed');
const haveIndexedResume = existsSync(path.join(INDEXED_RESUME_DIR, 'jobs.json'))
  && existsSync(path.join(INDEXED_RESUME_DIR, 'skills.json'));

function loadIndexedResume() {
  const read = (f) => JSON.parse(readFileSync(path.join(INDEXED_RESUME_DIR, f), 'utf8'));
  const skills = normalizeParserSkills(read('skills.json'));
  const eduPath = path.join(INDEXED_RESUME_DIR, 'education.json');
  const education = existsSync(eduPath) ? read('education.json') : {};
  // Same pipeline as resume-details-editor/api.getResumeData (Skill jobs tab + Find-skill modal).
  const jobs = enrichJobsWithSkills(mergeJobsWithEducation(toJobsArray(normalizeParserJobs(read('jobs.json'))), education), skills);
  return { skills, jobs };
}

/** Months the scene skill card sums: every job whose enriched job-skills holds the key. */
function sceneCardMonths(key, jobs) {
  let months = 0;
  for (const job of jobs) {
    if (!job['job-skills']?.[key]) continue;
    if (typeof job.durationMonths === 'number' && job.durationMonths > 0) months += job.durationMonths;
  }
  return months;
}

function skillCard(slug) {
  const el = document.createElement('div');
  el.id = `skill-card-div-${slug}`;
  el.className = 'skill-card-div';
  el.setAttribute('data-skill-name', slug);
  return el;
}

describe.skipIf(!haveIndexedResume)('indexed resume: display-name skillIDs count as linked', () => {
  const { skills, jobs } = haveIndexedResume ? loadIndexedResume() : { skills: {}, jobs: [] };

  it('has the fixture shape this regression depends on', () => {
    expect(skills['ai-ml']?.name).toBe('AI/ML');
    expect(skills['ai-agents']?.name).toBe('AI Agents');
    const resumeParser = jobs.find((j) => j.employer === 'resume-parser');
    expect(resumeParser).toBeTruthy();
    expect(resumeParser.skillIDs).toEqual(expect.arrayContaining(['AI/ML', 'AI Agents']));
  });

  it('resolves the resume-parser job to ai-ml and ai-agents', () => {
    const resumeParser = jobs.find((j) => j.employer === 'resume-parser');
    const ids = getSelectedSkillIdsForJob(resumeParser, skills);
    expect(ids.has('ai-ml')).toBe(true);
    expect(ids.has('ai-agents')).toBe(true);
    expect(ids.has('AI/ML')).toBe(false);
  });

  it('gives ai-ml and ai-agents the same non-zero months as the scene skill card', () => {
    const options = buildSkillSearchOptions([skillCard('ai-ml'), skillCard('ai-agents')], skills, null, jobs);
    for (const key of ['ai-ml', 'ai-agents']) {
      const expectedMonths = sceneCardMonths(key, jobs);
      expect(expectedMonths, `${key} scene months`).toBeGreaterThan(0);
      let jobCount = 0;
      for (const job of jobs) if (getSelectedSkillIdsForJob(job, skills).has(key)) jobCount += 1;
      expect(jobCount, `${key} linked jobs`).toBeGreaterThan(0);
      const expectedLabel = skillRowDisplayLabel(skills[key].name, jobCount, expectedMonths);
      expect(options.find((o) => o.slug === key).label).toBe(expectedLabel);
      expect(expectedLabel).not.toMatch(/\(0\)$/);
    }
  });
});
