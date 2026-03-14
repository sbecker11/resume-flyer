/**
 * Enrichment only: merges raw jobs with skills so each job has references and job-skills.
 * Jobs and skills are loaded via the resume API; this module does not import static files.
 *
 * - references: array of "<a href=\"url\">[SkillName]</a>" for parseDescriptionToBullets
 * - job-skills: object of skill names mentioned in Description that exist in skills
 */

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
 * Enrich raw jobs with references and job-skills using the skills map.
 * Expects jobs as array and skills as name-keyed map (server normalizes parser output via parsedResumeAdapter).
 * Also merges explicitly assigned job.skillIDs (saved via JobSkillEditor) into job-skills.
 * @param {Array<object>} rawJobs - Jobs from API (normalized to array; may be legacy array or parser jobID dict)
 * @param {Record<string, { url?: string, img?: string }>} skills - Skills from API (name-keyed; may be legacy or normalized from parser skillID dict)
 * @returns {Array<object & { references: string[], 'job-skills': Record<string, string> }>}
 */
export function enrichJobsWithSkills(rawJobs, skills) {
  if (!Array.isArray(rawJobs)) return [];
  const skillsMap = skills && typeof skills === 'object' ? skills : {};
  return rawJobs.map((job) => {
    const { refs, jobSkills } = enrichJobFromDescription(job.Description, skillsMap);
    // Merge explicitly assigned skillIDs (from JobSkillEditor) that aren't already in jobSkills
    if (Array.isArray(job.skillIDs)) {
      for (const sid of job.skillIDs) {
        if (!jobSkills[sid] && skillsMap[sid]) {
          jobSkills[sid] = sid;
        }
      }
    }
    return {
      ...job,
      references: refs,
      'job-skills': jobSkills,
    };
  });
}
