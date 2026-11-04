import { describe, it, expect, vi } from 'vitest';
import {
  checkResumeDataConsistency,
  fixResumeDataConsistency,
  findSkillUrlOrphans,
  groupFindingsBySeverity,
  hasBlockingFindings,
  rebuildEnrichedJobs,
  resolveSkillKeyOrNull,
  computeSkillJobIds,
  FIXABLE_CODES,
} from './resumeDataConsistency.mjs';

function baseData() {
  const skills = {
    'vue-js': { name: 'Vue.js', url: 'https://vuejs.org/', img: '', categoryIDs: ['frontend'], jobIDs: [0] },
    python: { name: 'Python', url: 'https://python.org/', img: '', categoryIDs: ['language'], jobIDs: [1, 2] },
    Bash: { name: 'Bash', url: '', img: '', categoryIDs: [], jobIDs: [2] },
  };
  const jobs = [
    { employer: 'Acme', role: 'Dev', start: '01/2020', end: '12/2020', Description: '• Built a [Vue.js] app', skillIDs: ['vue-js'] },
    { employer: 'Beta', role: 'Eng', start: '01/2021', end: '12/2021', Description: '• Wrote [Python] tooling', skillIDs: ['python'] },
  ];
  const education = {
    0: { index: 0, degree: 'BS', institution: 'State U', start: '2010/01', end: '2014/01', description: '', skillIDs: ['Bash', 'python'] },
  };
  const categories = {
    frontend: { name: 'Frontend', skillIDs: ['vue-js'] },
    language: { name: 'Language', skillIDs: ['python'] },
  };
  const rebuilt = rebuildEnrichedJobs({ jobs, skills, education });
  if (!rebuilt.ok) throw rebuilt.error;
  return { skills, jobs, education, categories, enrichedJobs: rebuilt.rows };
}

const codes = (findings) => findings.map((f) => f.code);
const byCode = (findings, code) => findings.filter((f) => f.code === code);

describe('resumeDataConsistency: helpers', () => {
  it('resolveSkillKeyOrNull resolves exact key, display name, case-insensitive key, and returns null otherwise', () => {
    const { skills } = baseData();
    expect(resolveSkillKeyOrNull('vue-js', skills)).toBe('vue-js');
    expect(resolveSkillKeyOrNull('Vue.js', skills)).toBe('vue-js');
    expect(resolveSkillKeyOrNull('PYTHON', skills)).toBe('python');
    expect(resolveSkillKeyOrNull('bash', skills)).toBe('Bash');
    expect(resolveSkillKeyOrNull('Rust', skills)).toBeNull();
    expect(resolveSkillKeyOrNull('', skills)).toBeNull();
    expect(resolveSkillKeyOrNull(null, skills)).toBeNull();
  });

  it('computeSkillJobIds indexes merged rows (jobs then education) by canonical key', () => {
    const { skills, jobs, education } = baseData();
    const merged = [...jobs, { skillIDs: ['Bash', 'Python'], educationKey: '0' }];
    const map = computeSkillJobIds(merged, skills);
    expect(map.get('vue-js')).toEqual([0]);
    expect(map.get('python')).toEqual([1, 2]);
    expect(map.get('Bash')).toEqual([2]);
    expect(education[0].skillIDs).toContain('Bash');
  });

  it('groupFindingsBySeverity / hasBlockingFindings treat info as non-blocking', () => {
    const findings = [
      { code: 'a', severity: 'info', message: '', where: '' },
      { code: 'b', severity: 'warning', message: '', where: '' },
    ];
    const groups = groupFindingsBySeverity(findings);
    expect(groups.info).toHaveLength(1);
    expect(groups.warning).toHaveLength(1);
    expect(groups.error).toHaveLength(0);
    expect(hasBlockingFindings(findings)).toBe(true);
    expect(hasBlockingFindings([findings[0]])).toBe(false);
  });

  it('rebuildEnrichedJobs reports failure instead of throwing on an unresolved bracket', () => {
    const { skills, education } = baseData();
    const res = rebuildEnrichedJobs({ jobs: [{ Description: '[Nope]' }], skills, education });
    expect(res.ok).toBe(false);
    expect(res.error.message).toMatch(/Unresolved bracketed term/);
  });
});

describe('checkResumeDataConsistency', () => {
  it('throws on invalid skills or jobs input', () => {
    expect(() => checkResumeDataConsistency({ skills: null, jobs: [] })).toThrow(/skills must be/);
    expect(() => checkResumeDataConsistency({ skills: [], jobs: [] })).toThrow(/skills must be/);
    expect(() => checkResumeDataConsistency({ skills: {}, jobs: null })).toThrow(/jobs must be/);
  });

  it('returns no findings for a consistent fixture', () => {
    const data = baseData();
    const findings = checkResumeDataConsistency({
      ...data,
      skillUrls: { entries: { 'vue-js': { url: 'https://vuejs.org/', updatedAt: '2026-01-01T00:00:00Z' } } },
      index: { resumes: [{ id: 'r1', jobCount: 2, skillCount: 3 }] },
      resumeId: 'r1',
    });
    expect(findings).toEqual([]);
  });

  it('accepts jobs as a jobID-keyed object', () => {
    const data = baseData();
    const jobsObj = { 0: data.jobs[0], 1: { ...data.jobs[1], skillIDs: ['Python'] } };
    const findings = checkResumeDataConsistency({ skills: data.skills, jobs: jobsObj, education: data.education });
    const f = byCode(findings, 'skill-id-not-key');
    expect(f).toHaveLength(1);
    expect(f[0].where).toBe('jobs.json["1"].skillIDs[0]');
  });

  it('flags skillIDs that are display names (with resolved key) and unknown ids', () => {
    const data = baseData();
    data.jobs[0].skillIDs = ['Vue.js', 'Rust'];
    const findings = checkResumeDataConsistency(data);
    const notKey = byCode(findings, 'skill-id-not-key');
    expect(notKey).toHaveLength(1);
    expect(notKey[0]).toMatchObject({
      severity: 'warning',
      where: 'jobs.json[0].skillIDs[0]',
      details: { skillID: 'Vue.js', resolvedKey: 'vue-js' },
    });
    const unknown = byCode(findings, 'skill-id-unknown');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ severity: 'error', where: 'jobs.json[0].skillIDs[1]' });
  });

  it('flags non-array skillIDs', () => {
    const data = baseData();
    data.jobs[0].skillIDs = 'vue-js';
    const findings = checkResumeDataConsistency(data);
    expect(byCode(findings, 'skill-ids-not-array')).toHaveLength(1);
  });

  it('flags duplicate skillIDs within a job, including key/name pairs', () => {
    const data = baseData();
    data.jobs[0].skillIDs = ['vue-js', 'Vue.js', 'vue-js'];
    const findings = checkResumeDataConsistency(data);
    const dups = byCode(findings, 'skill-id-duplicate');
    expect(dups).toHaveLength(2);
    expect(dups[0].where).toBe('jobs.json[0].skillIDs[1]');
    expect(dups[1].where).toBe('jobs.json[0].skillIDs[2]');
  });

  it('flags [Bracketed] tokens that resolve to no skill but ignores content-index tags', () => {
    const data = baseData();
    data.jobs[1].Description = '[1.2.3] Beta • Used [Python] and [Kubernetes] and [kubernetes]';
    const findings = checkResumeDataConsistency({ skills: data.skills, jobs: data.jobs });
    const unresolved = byCode(findings, 'bracket-unresolved');
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({ severity: 'error', where: 'jobs.json[1].Description', details: { label: 'Kubernetes' } });
  });

  it('flags a [Bracket] whose skill is not in the job skillIDs as blocking (skillIDs is the source of truth)', () => {
    const data = baseData();
    data.jobs[1].Description = '• Wrote [Python] tooling on a [Vue.js] UI, twice [vue.js]';
    const findings = checkResumeDataConsistency({ skills: data.skills, jobs: data.jobs });
    const notLinked = byCode(findings, 'bracket-not-linked');
    expect(notLinked).toHaveLength(1);
    expect(notLinked[0]).toMatchObject({
      severity: 'error', where: 'jobs.json[1].Description', details: { label: 'Vue.js', resolvedKey: 'vue-js' },
    });
    expect(hasBlockingFindings(findings)).toBe(true);
    // Linking by display name counts: the id resolves to the same key.
    data.jobs[1].skillIDs = ['python', 'Vue.js'];
    expect(byCode(checkResumeDataConsistency({ skills: data.skills, jobs: data.jobs }), 'bracket-not-linked')).toEqual([]);
  });

  it('reports derived-data drift as errors, not warnings', () => {
    const data = baseData();
    data.skills['vue-js'].jobIDs = [1];
    data.skills.Bash.jobIDs = [7, '2'];
    data.categories.language.skillIDs = ['python', 'nope'];
    const stale = JSON.parse(JSON.stringify(data.enrichedJobs));
    stale[0]['job-skills'] = {};
    const findings = checkResumeDataConsistency({ ...data, enrichedJobs: stale });
    const severities = Object.fromEntries(findings.map((f) => [f.code, f.severity]));
    expect(severities).toMatchObject({
      'skill-jobids-missing': 'error',
      'skill-jobids-extraneous': 'error',
      'skill-jobids-out-of-range': 'error',
      'skill-jobids-malformed': 'error',
      'category-skill-unknown': 'error',
      'enriched-jobs-stale': 'error',
    });
  });

  it('reads lowercase description field too', () => {
    const data = baseData();
    const jobs = [{ employer: 'X', description: '[Nope]' }];
    const findings = checkResumeDataConsistency({ skills: data.skills, jobs });
    expect(byCode(findings, 'bracket-unresolved')).toHaveLength(1);
  });

  it('checks education skillIDs using education.json keys in the where path', () => {
    const data = baseData();
    data.education[0].skillIDs = ['Bash', 'Python', 'Nope'];
    const findings = checkResumeDataConsistency(data);
    expect(byCode(findings, 'skill-id-not-key')[0].where).toBe('education.json["0"].skillIDs[1]');
    expect(byCode(findings, 'skill-id-unknown')[0].where).toBe('education.json["0"].skillIDs[2]');
  });

  it('flags skill.jobIDs missing / extraneous / out-of-range / malformed', () => {
    const data = baseData();
    data.skills['vue-js'].jobIDs = [1];
    data.skills.python.jobIDs = [2, 1];
    data.skills.Bash.jobIDs = [2, 7, '2'];
    const findings = checkResumeDataConsistency(data);

    const missing = byCode(findings, 'skill-jobids-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ where: 'skills.json["vue-js"].jobIDs', details: { missing: [0], expected: [0] } });
    expect(missing[0].message).toContain('#0 (Acme)');

    const extraneous = byCode(findings, 'skill-jobids-extraneous');
    expect(extraneous).toHaveLength(1);
    expect(extraneous[0]).toMatchObject({ where: 'skills.json["vue-js"].jobIDs', details: { extraneous: [1] } });

    const malformed = byCode(findings, 'skill-jobids-malformed');
    expect(malformed.map((f) => f.where)).toEqual(['skills.json["python"].jobIDs', 'skills.json["Bash"].jobIDs']);
    expect(malformed[0].message).toMatch(/not sorted and unique/);
    expect(malformed[1].details.malformed).toEqual(['2']);

    const range = byCode(findings, 'skill-jobids-out-of-range');
    expect(range).toHaveLength(1);
    expect(range[0]).toMatchObject({ where: 'skills.json["Bash"].jobIDs', details: { outOfRange: [7] } });
    expect(range[0].message).toContain('2 jobs + 1 education');
  });

  it('flags a non-array jobIDs field and a non-object skill entry', () => {
    const data = baseData();
    data.skills.Bash.jobIDs = 'x';
    data.skills.broken = null;
    const findings = checkResumeDataConsistency(data);
    expect(byCode(findings, 'skill-jobids-malformed')[0].where).toBe('skills.json["Bash"].jobIDs');
    expect(byCode(findings, 'skill-entry-invalid')[0].where).toBe('skills.json["broken"]');
  });

  it('treats a missing jobIDs field as empty', () => {
    const data = baseData();
    delete data.skills['vue-js'].jobIDs;
    const findings = checkResumeDataConsistency(data);
    expect(byCode(findings, 'skill-jobids-missing')).toHaveLength(1);
  });

  it('flags duplicate skill display names', () => {
    const data = baseData();
    data.skills['python-3'] = { name: 'python', jobIDs: [] };
    const findings = checkResumeDataConsistency(data);
    const dup = byCode(findings, 'skill-name-duplicate');
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ where: 'skills.json["python-3"].name', details: { otherKey: 'python' } });
  });

  it('flags categoryIDs <-> categories mismatches in both directions', () => {
    const data = baseData();
    data.skills['vue-js'].categoryIDs = ['frontend', 'ghost'];
    data.categories.frontend.skillIDs = [];
    data.categories.language.skillIDs = ['python', 'Python', 'vue-js', 'nope'];
    const findings = checkResumeDataConsistency(data);

    expect(byCode(findings, 'skill-category-missing-category')[0]).toMatchObject({
      severity: 'error', where: 'skills.json["vue-js"].categoryIDs[1]', details: { categoryID: 'ghost' },
    });
    expect(byCode(findings, 'skill-category-not-listed')[0]).toMatchObject({
      where: 'skills.json["vue-js"].categoryIDs[0]', details: { categoryID: 'frontend' },
    });
    expect(byCode(findings, 'category-skill-not-key')[0]).toMatchObject({
      where: 'categories.json["language"].skillIDs[1]', details: { skillID: 'Python', resolvedKey: 'python' },
    });
    expect(byCode(findings, 'category-skill-duplicate')[0].where).toBe('categories.json["language"].skillIDs[1]');
    expect(byCode(findings, 'category-skill-not-declared')[0]).toMatchObject({
      where: 'categories.json["language"].skillIDs[2]', details: { resolvedKey: 'vue-js', categoryID: 'language' },
    });
    expect(byCode(findings, 'category-skill-unknown')[0]).toMatchObject({
      where: 'categories.json["language"].skillIDs[3]', details: { skillID: 'nope' },
    });
  });

  it('flags malformed categories structures', () => {
    const data = baseData();
    expect(codes(checkResumeDataConsistency({ ...data, categories: [] }))).toContain('categories-invalid');
    data.categories.frontend = null;
    data.categories.language.skillIDs = 'python';
    data.skills.Bash.categoryIDs = 'x';
    const findings = checkResumeDataConsistency(data);
    expect(codes(findings)).toEqual(expect.arrayContaining(['category-invalid', 'category-skill-malformed', 'skill-category-malformed']));
    const listless = checkResumeDataConsistency({ ...baseData(), categories: { frontend: { name: 'F' }, language: { name: 'L' } } });
    expect(codes(listless)).toEqual(['skill-category-not-listed', 'skill-category-not-listed']);
  });

  it('skips the category checks when categories is not supplied', () => {
    const data = baseData();
    data.skills['vue-js'].categoryIDs = ['ghost'];
    expect(checkResumeDataConsistency({ skills: data.skills, jobs: data.jobs, education: data.education })).toEqual([]);
  });

  it('flags stale, missing, non-array and unbuildable enriched-jobs', () => {
    const data = baseData();
    const stale = JSON.parse(JSON.stringify(data.enrichedJobs));
    stale[0]['job-skills'] = {};
    const staleFindings = byCode(checkResumeDataConsistency({ ...data, enrichedJobs: stale }), 'enriched-jobs-stale');
    expect(staleFindings).toHaveLength(1);
    expect(staleFindings[0].details).toMatchObject({ staleRows: [0], fileRows: 3, rebuiltRows: 3 });

    expect(codes(checkResumeDataConsistency({ ...data, enrichedJobs: data.enrichedJobs.slice(0, 2) }))).toContain('enriched-jobs-stale');
    const missing = byCode(checkResumeDataConsistency({ ...data, enrichedJobs: null }), 'enriched-jobs-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe('info');
    expect(codes(checkResumeDataConsistency({ ...data, enrichedJobs: {} }))).toContain('enriched-jobs-stale');

    const { enrichedJobs, ...noEnriched } = data;
    expect(codes(checkResumeDataConsistency(noEnriched))).not.toContain('enriched-jobs-stale');

    data.jobs[0].Description = '[Ghost]';
    const f = byCode(checkResumeDataConsistency(data), 'enriched-jobs-unbuildable');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('error');
  });

  it('ignores durationMonths differences in enriched-jobs', () => {
    const data = baseData();
    const copy = JSON.parse(JSON.stringify(data.enrichedJobs));
    copy[0].durationMonths = 999;
    expect(checkResumeDataConsistency({ ...data, enrichedJobs: copy })).toEqual([]);
  });

  it('reports skill-urls orphans and url mismatches as informational', () => {
    const data = baseData();
    const skillUrls = {
      entries: {
        'Vue.js': { url: 'https://vuejs.org/guide/', updatedAt: '2026-01-01T00:00:00Z' },
        Bash: { url: 'https://gnu.org/software/bash/', updatedAt: '2026-01-01T00:00:00Z' },
        Rust: { url: 'https://rust-lang.org/', updatedAt: '2026-01-01T00:00:00Z' },
      },
    };
    const findings = checkResumeDataConsistency({ ...data, skillUrls });
    expect(findings.every((f) => f.severity === 'info')).toBe(true);
    expect(byCode(findings, 'skill-url-mismatch')[0]).toMatchObject({
      where: 'skill-urls.json.entries["Vue.js"]',
      details: { resolvedKey: 'vue-js', catalogUrl: 'https://vuejs.org/guide/', skillUrl: 'https://vuejs.org/' },
    });
    expect(byCode(findings, 'skill-url-orphan')[0].details).toEqual({ slug: 'Rust' });
    expect(hasBlockingFindings(findings)).toBe(false);
  });

  it('reports index count mismatches and missing index entries as informational', () => {
    const data = baseData();
    const index = { resumes: [{ id: 'r1', jobCount: 5, skillCount: 1 }] };
    const findings = checkResumeDataConsistency({ ...data, index, resumeId: 'r1' });
    const mism = byCode(findings, 'index-count-mismatch');
    expect(mism).toHaveLength(2);
    expect(mism[0].details).toEqual({ field: 'jobCount', indexed: 5, actual: 2 });
    expect(mism[1].details).toEqual({ field: 'skillCount', indexed: 1, actual: 3 });
    expect(codes(checkResumeDataConsistency({ ...data, index, resumeId: 'other' }))).toEqual(['index-missing-resume']);
    expect(checkResumeDataConsistency({ ...data, index })).toEqual([]);
  });

  it('findSkillUrlOrphans checks across several skills maps', () => {
    const a = { python: { name: 'Python' } };
    const b = { Bash: { name: 'Bash' } };
    const out = findSkillUrlOrphans({ entries: { Python: { url: 'x' }, bash: { url: 'y' }, Rust: { url: 'z' } } }, [a, b]);
    expect(out.map((f) => f.details.slug)).toEqual(['Rust']);
    expect(out[0].severity).toBe('info');
  });
});

describe('fixResumeDataConsistency', () => {
  it('throws on invalid input', () => {
    expect(() => fixResumeDataConsistency({ skills: null, jobs: [] })).toThrow(/skills must be/);
    expect(() => fixResumeDataConsistency({ skills: {}, jobs: 'x' })).toThrow(/jobs must be/);
  });

  it('is a no-op on consistent data and does not mutate inputs', () => {
    const data = baseData();
    const snapshot = JSON.stringify(data);
    const fixed = fixResumeDataConsistency(data);
    expect(fixed.applied).toEqual([]);
    expect(JSON.stringify(data)).toBe(snapshot);
    expect(fixed.skills).toEqual(data.skills);
    expect(fixed.skills).not.toBe(data.skills);
  });

  it('canonicalizes and dedupes skillIDs in jobs and education, keeping unknown ids', () => {
    const data = baseData();
    data.jobs[0].skillIDs = ['Vue.js', 'vue-js', 'Rust'];
    data.education[0].skillIDs = ['bash', 'Python', 'python'];
    const fixed = fixResumeDataConsistency(data);
    expect(fixed.jobs[0].skillIDs).toEqual(['vue-js', 'Rust']);
    expect(fixed.education[0].skillIDs).toEqual(['Bash', 'python']);
    expect(data.jobs[0].skillIDs).toEqual(['Vue.js', 'vue-js', 'Rust']);
    const applied = fixed.applied.filter((a) => a.code === 'skill-ids-canonicalized');
    expect(applied.map((a) => a.where)).toEqual(['jobs.json[0].skillIDs', 'education.json["0"].skillIDs']);
    expect(applied[0].message).toContain('"Vue.js" → "vue-js"');
    expect(applied[0].message).toContain('dropped duplicate "vue-js"');
  });

  it('handles jobs stored as a jobID-keyed object', () => {
    const data = baseData();
    const jobsObj = { 0: data.jobs[0], 1: { ...data.jobs[1], skillIDs: ['Python'] } };
    const fixed = fixResumeDataConsistency({ skills: data.skills, jobs: jobsObj, education: data.education });
    expect(fixed.jobs[1].skillIDs).toEqual(['python']);
    expect(fixed.applied[0].where).toBe('jobs.json["1"].skillIDs');
    expect(Array.isArray(fixed.jobs)).toBe(false);
  });

  it('recomputes every skill.jobIDs from references as sorted unique ints', () => {
    const data = baseData();
    data.skills['vue-js'].jobIDs = [1, 1, '0'];
    data.skills.python.jobIDs = [2, 1];
    delete data.skills.Bash.jobIDs;
    data.jobs[1].skillIDs = ['Python', 'vue-js'];
    const fixed = fixResumeDataConsistency(data);
    expect(fixed.skills['vue-js'].jobIDs).toEqual([0, 1]);
    expect(fixed.skills.python.jobIDs).toEqual([1, 2]);
    expect(fixed.skills.Bash.jobIDs).toEqual([2]);
    const recomputed = fixed.applied.filter((a) => a.code === 'skill-jobids-recomputed');
    expect(recomputed.map((a) => a.where)).toEqual([
      'skills.json["vue-js"].jobIDs',
      'skills.json["python"].jobIDs',
      'skills.json["Bash"].jobIDs',
    ]);
    expect(recomputed[2].message).toBe('jobIDs undefined → [2]');
  });

  it('canonicalizes category skillIDs, drops dangling keys, and syncs categoryIDs<->categories additively', () => {
    const data = baseData();
    data.categories.language.skillIDs = ['Python', 'python', 'ghost-skill', 'Bash'];
    data.skills['vue-js'].categoryIDs = ['frontend', 'language', 'no-such-category'];
    delete data.skills.Bash.categoryIDs;
    const fixed = fixResumeDataConsistency(data);

    expect(fixed.categories.language.skillIDs).toEqual(['python', 'Bash', 'vue-js']);
    expect(fixed.skills.Bash.categoryIDs).toEqual(['language']);
    expect(fixed.skills['vue-js'].categoryIDs).toEqual(['frontend', 'language', 'no-such-category']);
    expect(fixed.categories['no-such-category']).toBeUndefined();

    const appliedCodes = fixed.applied.map((a) => a.code);
    expect(appliedCodes).toEqual(expect.arrayContaining([
      'category-skill-ids-canonicalized', 'category-skill-added', 'skill-category-added',
    ]));
    const canon = fixed.applied.find((a) => a.code === 'category-skill-ids-canonicalized');
    expect(canon.message).toContain('dropped dangling "ghost-skill"');
    expect(canon.message).toContain('dropped duplicate "python"');

    expect(checkResumeDataConsistency({ ...fixed }).map((f) => f.code)).toEqual(['skill-category-missing-category']);
  });

  it('creates a category skillIDs list when a skill declares membership in a list-less category', () => {
    const data = baseData();
    data.categories.misc = { name: 'Misc' };
    data.skills.Bash.categoryIDs = ['misc'];
    const fixed = fixResumeDataConsistency(data);
    expect(fixed.categories.misc.skillIDs).toEqual(['Bash']);
  });

  it('re-bakes enriched-jobs when primary data changed and leaves it when it is already fresh', () => {
    const data = baseData();
    data.jobs[0].skillIDs = ['Vue.js'];
    data.enrichedJobs = rebuildEnrichedJobs(data).rows;
    expect(data.enrichedJobs[0].skillIDs).toEqual(['Vue.js']);
    const fixed = fixResumeDataConsistency(data);
    expect(fixed.applied.map((a) => a.code)).toContain('enriched-jobs-rebaked');
    expect(fixed.enrichedJobs[0].skillIDs).toEqual(['vue-js']);
    expect(checkResumeDataConsistency(fixed)).toEqual([]);

    const fresh = fixResumeDataConsistency(baseData());
    expect(fresh.applied).toEqual([]);
  });

  it('bakes enriched-jobs when the file was missing', () => {
    const { enrichedJobs, ...data } = baseData();
    const fixed = fixResumeDataConsistency(data);
    expect(fixed.applied.map((a) => a.code)).toEqual(['enriched-jobs-rebaked']);
    expect(fixed.enrichedJobs).toHaveLength(3);
  });

  it('reports and keeps enriched-jobs unchanged when enrichment cannot run', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const data = baseData();
      data.jobs[0].Description = '[Ghost]';
      const fixed = fixResumeDataConsistency(data);
      expect(fixed.enrichedJobs).toEqual(data.enrichedJobs);
      expect(fixed.applied.map((a) => a.code)).not.toContain('enriched-jobs-rebaked');
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot re-bake enriched-jobs'), expect.anything());
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Remedy:'));
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('never changes names, urls, or descriptions', () => {
    const data = baseData();
    data.jobs[0].skillIDs = ['Vue.js'];
    data.skills['vue-js'].name = 'Vue.js';
    data.categories.language.skillIDs = ['Python'];
    const fixed = fixResumeDataConsistency(data);
    for (const key of Object.keys(data.skills)) {
      expect(fixed.skills[key].name).toBe(data.skills[key].name);
      expect(fixed.skills[key].url).toBe(data.skills[key].url);
    }
    fixed.jobs.forEach((job, i) => expect(job.Description).toBe(data.jobs[i].Description));
  });

  it('every fixable check code is resolved by the fixer on a drifted fixture', () => {
    const data = baseData();
    data.jobs[0].skillIDs = ['Vue.js', 'vue-js'];
    data.skills['vue-js'].jobIDs = [3, 1];
    data.skills.python.jobIDs = [];
    data.categories.language.skillIDs = ['Python', 'ghost', 'vue-js'];
    data.skills.Bash.categoryIDs = ['frontend'];
    data.enrichedJobs = null;
    const before = new Set(checkResumeDataConsistency(data).map((f) => f.code));
    for (const code of before) expect(FIXABLE_CODES.has(code)).toBe(true);
    const fixed = fixResumeDataConsistency(data);
    expect(checkResumeDataConsistency(fixed)).toEqual([]);
  });
});
