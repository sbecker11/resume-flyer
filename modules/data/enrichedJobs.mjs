/**
 * Enrichment only: merges raw jobs with skills so each job has references and job-skills.
 * Jobs and skills are loaded via the resume API; this module does not import static files.
 *
 * - references: array of "<a href=\"url\">[SkillName]</a>" for parseDescriptionToBullets
 * - job-skills: object of skill names mentioned in Description that exist in skills
 */

import { ResumeJob } from './ResumeJob.mjs';
import { skillsObjectToResumeSkills } from './ResumeSkill.mjs';

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

  // Map lowercased skill keys to their canonical keys in skillsMap
  const skillKeyByLower = new Map(
    Object.entries(skillsMap).map(([k]) => [String(k).toLowerCase(), k])
  );

  // Track lowercased skill keys so we can dedupe across bracket/unbracketed matches.
  const seenLower = new Set();

  let match;
  while ((match = BRACKET_REGEX.exec(description)) !== null) {
    const rawName = match[1].trim();
    if (!rawName) continue;

    const skillKey = skillKeyByLower.get(rawName.toLowerCase());
    if (!skillKey) continue;
    const canonicalLower = String(skillKey).toLowerCase();
    if (seenLower.has(canonicalLower)) continue;

    const skill = skillsMap[skillKey];
    const url = skill.url && skill.url.trim() ? skill.url : '#';
    refs.push(`<a href="${url}">[${skillKey}]</a>`);
    jobSkills[skillKey] = skillKey;
    seenLower.add(canonicalLower);
  }

  // Also detect skill occurrences without requiring [brackets], so a term in the
  // description like "CocaCola Corp" can still be identified.
  const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const makeBoundedRegex = (term) => {
    const escaped = escapeRegex(term);
    // Match term when it isn't embedded in a longer alphanumeric token.
    // Boundaries only apply to the edges; multi-word phrases are supported.
    return new RegExp(`(^|[^A-Za-z0-9])(${escaped})(?=[^A-Za-z0-9]|$)`, 'i');
  };

  for (const [skillKey, skill] of Object.entries(skillsMap)) {
    if (!skillKey) continue;
    const canonicalLower = String(skillKey).toLowerCase();
    if (seenLower.has(canonicalLower)) continue;

    const bounded = makeBoundedRegex(skillKey);
    if (!bounded.test(description)) continue;

    const url = skill.url && skill.url.trim() ? skill.url : '#';
    refs.push(`<a href="${url}">[${skillKey}]</a>`);
    jobSkills[skillKey] = skillKey;
    seenLower.add(canonicalLower);
  }
  return { refs, jobSkills };
}

/**
 * Enrich raw jobs with references and job-skills using the skills map.
 * Expects jobs as array and skills as name-keyed map (server normalizes parser output via parsedResumeAdapter).
 * Also merges explicitly assigned job.skillIDs (saved via JobSkillEditor) into job-skills.
 * Returns {@link ResumeJob} instances (work + education rows) for a single extensible type.
 * @param {Array<object>} rawJobs - Jobs from API (normalized to array; may be legacy array or parser jobID dict)
 * @param {Record<string, { url?: string, img?: string }>} skills - Skills from API (name-keyed; may be legacy or normalized from parser skillID dict)
 * @returns {import('./ResumeJob.mjs').ResumeJob[]}
 */
export function enrichJobsWithSkills(rawJobs, skills) {
  if (!Array.isArray(rawJobs)) return [];
  const skillsById = skillsObjectToResumeSkills(skills && typeof skills === 'object' ? skills : {});
  const skillsMap = Object.fromEntries(
    Object.entries(skillsById).map(([k, v]) => [k, { url: v.url, img: v.img }])
  );
  return rawJobs.map((job) => {
    const rj = ResumeJob.fromPlainObject(job);
    const { refs, jobSkills } = enrichJobFromDescription(rj.Description, skillsMap);
    if (Array.isArray(rj.skillIDs)) {
      for (const sid of rj.skillIDs) {
        if (!jobSkills[sid] && skillsMap[sid]) {
          jobSkills[sid] = sid;
        }
      }
    }
    rj.references = refs;
    rj['job-skills'] = jobSkills;
    return rj;
  });
}
