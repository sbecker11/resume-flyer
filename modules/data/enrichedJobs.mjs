/**
 * Enrichment only: merges raw jobs with skills so each job has references and job-skills.
 * Jobs and skills are loaded via the resume API; this module does not import static files.
 *
 * - references: array of "<a href=\"url\">[SkillName]</a>" for parseDescriptionToBullets
 * - job-skills: object of skill slugs mentioned in Description that exist in skills
 * - durationMonths: inclusive calendar-month span start→end (blank end = today); not persisted
 */

import { ResumeJob } from './ResumeJob.mjs';
import { skillsObjectToResumeSkills } from './ResumeSkill.mjs';
import { jobTenureMonthsInclusive } from '../utils/dateUtils.mjs';
import { labelToSlug } from '../utils/skillLabel.mjs';
import { reportError } from '../utils/errorReporting.mjs';

const BRACKET_REGEX = /\[([^\]]+)\]/g;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a sorted list of { slug, name, regex } entries for unbracketed full-text scanning.
 * Sorted longest name first so "CI/CD Jenkins" is found before "CI/CD" or "Jenkins".
 * Each regex matches the skill name as a whole word/phrase (case-insensitive).
 *
 * @param {Record<string, { name?: string }>} skillsMap
 * @returns {{ slug: string, name: string, regex: RegExp }[]}
 */
function buildSkillNameMatchers(skillsMap) {
  return Object.entries(skillsMap)
    .filter(([, s]) => s?.name)
    .map(([slug, s]) => ({
      slug,
      name: s.name,
      // Word-boundary aware: name must not be embedded in a longer alphanumeric token
      regex: new RegExp(
        `(?<![A-Za-z0-9])${escapeRegex(s.name)}(?![A-Za-z0-9])`,
        'i'
      ),
    }))
    .sort((a, b) => b.name.length - a.name.length); // longest first
}

/**
 * Scan description text for skill names (unbracketed), longest-first so no shorter
 * name steals a match that belongs to a longer one.
 * Already-seen slugs (from bracket pass) are skipped.
 *
 * @param {string} description
 * @param {{ slug: string, name: string, regex: RegExp }[]} matchers
 * @param {Set<string>} seen  slugs already found (mutated in place)
 * @param {Record<string, string>} jobSkills  output map (mutated in place)
 */
function scanUnbracketedSkillNames(description, matchers, seen, jobSkills) {
  for (const { slug, regex } of matchers) {
    if (seen.has(slug)) continue;
    if (regex.test(description)) {
      seen.add(slug);
      jobSkills[slug] = slug;
    }
  }
}

/**
 * Extract skills from a description:
 *   1. [Bracketed] terms — resolved via exact skill.name match; unresolved → throw (fast-fail).
 *   2. Unbracketed skill names — scanned longest-first so no shorter name steals a longer match.
 *
 * @param {string} description
 * @param {Record<string, { name?: string, url?: string, img?: string }>} skillsMap
 * @param {{ slug: string, name: string, regex: RegExp }[]} matchers  pre-built, longest-first
 * @returns {{ refs: string[], jobSkills: Record<string, string> }}
 */
function enrichJobFromDescription(description, skillsMap, matchers) {
  const refs = [];
  const jobSkills = {};
  if (!description || typeof description !== 'string') return { refs, jobSkills };

  const seen = new Set();

  // Pass 1: bracketed terms (explicit, fast-fail on unresolved)
  BRACKET_REGEX.lastIndex = 0;
  let match;
  while ((match = BRACKET_REGEX.exec(description)) !== null) {
    const label = match[1].trim();
    if (!label) continue;
    const slug = labelToSlug(label, skillsMap);
    if (!slug) {
      throw new Error(
        `[enrichJobFromDescription] Unresolved bracketed term "[${label}]" — ` +
        `add a skill with name="${label}" to skills.json or fix the description`
      );
    }
    if (seen.has(slug)) continue;
    seen.add(slug);
    const skill = skillsMap[slug];
    const url = skill?.url?.trim() ? skill.url : '#';
    refs.push(`<a href="${url}">[${slug}]</a>`);
    jobSkills[slug] = slug;
  }

  // Pass 2: unbracketed skill names, longest-first
  scanUnbracketedSkillNames(description, matchers, seen, jobSkills);

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
  // Keep name in skillsMap so labelToSlug can resolve bracketed terms by skill.name
  const skillsMap = Object.fromEntries(
    Object.entries(skillsById).map(([k, v]) => [k, { name: v.name, url: v.url, img: v.img }])
  );
  // Build matchers once (sorted longest-first) and reuse across all jobs
  const matchers = buildSkillNameMatchers(skillsMap);
  return rawJobs.map((job) => {
    const rj = ResumeJob.fromPlainObject(job);
    const { refs, jobSkills } = enrichJobFromDescription(rj.Description, skillsMap, matchers);
    if (Array.isArray(rj.skillIDs)) {
      for (const sid of rj.skillIDs) {
        if (!jobSkills[sid] && skillsMap[sid]) {
          jobSkills[sid] = sid;
        }
      }
    }
    rj.references = refs;
    rj['job-skills'] = jobSkills;
    rj.durationMonths = jobTenureMonthsInclusive(rj.start, rj.end);
    return rj;
  });
}
