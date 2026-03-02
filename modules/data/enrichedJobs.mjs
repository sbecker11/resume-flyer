/**
 * Enriched jobs data: merges static_content/jobs/jobs.mjs with static_content/skills/skills.mjs
 * so each job has references and job-skills for bizCards and skillCards.
 *
 * - references: array of "<a href=\"url\">[SkillName]</a>" for parseDescriptionToBullets
 * - job-skills: object of skill names mentioned in Description that exist in skills (for "Technologies & Skills" section)
 */

import { jobs as rawJobs } from '../../static_content/jobs/jobs.mjs';
import { skills } from '../../static_content/skills/skills.mjs';

const BRACKET_REGEX = /\[([^\]]+)\]/g;

/**
 * Extract unique [bracket] terms from a description that exist in the skills map.
 * @param {string} description - Job description text
 * @param {Record<string, { url?: string, img?: string }>} skillsMap - skills object
 * @returns {{ refs: string[], jobSkills: Record<string, string> }}
 */
function enrichJobFromDescription(description, skillsMap) {
  const refs = [];
  const jobSkills = {};
  if (!description || typeof description !== 'string') return { refs, jobSkills };

  let match;
  const seen = new Set();
  while ((match = BRACKET_REGEX.exec(description)) !== null) {
    const name = match[1].trim();
    if (!name || seen.has(name)) continue;
    const skill = skillsMap[name];
    if (!skill) continue;
    seen.add(name);
    const url = skill.url && skill.url.trim() ? skill.url : '#';
    refs.push(`<a href="${url}">[${name}]</a>`);
    jobSkills[name] = name;
  }
  return { refs, jobSkills };
}

/**
 * Enriched jobs array: each job has references and 'job-skills' from skills.mjs.
 * @type {Array<object & { references: string[], 'job-skills': Record<string, string> }>}
 */
export const jobs = rawJobs.map((job) => {
  const { refs, jobSkills } = enrichJobFromDescription(job.Description, skills);
  return {
    ...job,
    references: refs,
    'job-skills': jobSkills,
  };
});

/** Skills map for lookups (url, img per skill name). */
export { skills };

/**
 * Return enriched jobs (for code that expects getJobsData from jobs.mjs).
 * @returns {typeof jobs}
 */
export function getJobsData() {
  return jobs;
}
