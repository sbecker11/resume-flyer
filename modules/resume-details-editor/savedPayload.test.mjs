import { describe, expect, it } from 'vitest';
import {
  SAVED_KIND,
  REFRESH_ACTION,
  RELOAD_KINDS,
  skillMerged,
  skillRenamed,
  removedSkill,
  clearAllJobSkillLinks,
  jobsMutated,
  jobFieldsSaved,
  reparsed,
  restored,
  metaSaved,
  otherSectionsSaved,
  educationSaved,
  sessionOnly,
  jobSkills,
  hasSavedKind,
  isSessionOnlySave,
  isJobSkillsPayload,
  needsResumeListRefetch,
  resumeRefreshAction,
} from './savedPayload.mjs';

describe('savedPayload factories', () => {
  it.each([
    [skillMerged, { skillMerged: true }],
    [skillRenamed, { skillRenamed: true }],
    [removedSkill, { removedSkill: true }],
    [clearAllJobSkillLinks, { clearAllJobSkillLinks: true }],
    [jobsMutated, { jobsMutated: true }],
    [jobFieldsSaved, { jobFieldsSaved: true }],
    [reparsed, { reparsed: true }],
    [restored, { restored: true }],
    [metaSaved, { metaSaved: true }],
    [otherSectionsSaved, { otherSectionsSaved: true }],
    [educationSaved, { educationSaved: true }],
    [sessionOnly, { sessionOnly: true }],
  ])('%o keeps the historical flag shape and is frozen', (factory, expected) => {
    const payload = factory();
    expect(payload).toEqual(expected);
    expect(Object.isFrozen(payload)).toBe(true);
  });

  it('every SAVED_KIND flag has a factory and RELOAD_KINDS only names known kinds', () => {
    const kinds = Object.values(SAVED_KIND);
    for (const kind of RELOAD_KINDS) expect(kinds).toContain(kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(Object.isFrozen(SAVED_KIND)).toBe(true);
    expect(Object.isFrozen(REFRESH_ACTION)).toBe(true);
    expect(Object.isFrozen(RELOAD_KINDS)).toBe(true);
  });

  it('jobSkills builds the per-job payload with a copied skillIDs array', () => {
    const skillIDs = ['vue', 'kafka'];
    const payload = jobSkills({ jobIndex: 2, skillIDs, jobSkills: { vue: 'Vue', kafka: 'Kafka' } });
    expect(payload).toEqual({ jobIndex: 2, skillIDs: ['vue', 'kafka'], jobSkills: { vue: 'Vue', kafka: 'Kafka' } });
    expect(payload.skillIDs).not.toBe(skillIDs);
    expect(payload).not.toHaveProperty('sessionOnly');
  });

  it('jobSkills defaults jobSkills to null and marks sessionOnly when asked', () => {
    expect(jobSkills({ jobIndex: 0, skillIDs: [] })).toEqual({ jobIndex: 0, skillIDs: [], jobSkills: null });
    expect(jobSkills({ jobIndex: 0, skillIDs: ['a'], sessionOnly: true }))
      .toEqual({ jobIndex: 0, skillIDs: ['a'], jobSkills: null, sessionOnly: true });
  });

  it('jobSkills fails fast on malformed input', () => {
    expect(() => jobSkills()).toThrow(TypeError);
    expect(() => jobSkills({ jobIndex: -1, skillIDs: [] })).toThrow(/jobIndex/);
    expect(() => jobSkills({ jobIndex: '1', skillIDs: [] })).toThrow(/jobIndex/);
    expect(() => jobSkills({ jobIndex: 1.5, skillIDs: [] })).toThrow(/jobIndex/);
    expect(() => jobSkills({ jobIndex: 1, skillIDs: 'vue' })).toThrow(/skillIDs/);
    expect(() => jobSkills({ jobIndex: 1, skillIDs: [], jobSkills: 'Vue' })).toThrow(/jobSkills/);
  });
});

describe('savedPayload predicates', () => {
  it('hasSavedKind requires a strict true flag on an object', () => {
    expect(hasSavedKind({ metaSaved: true }, SAVED_KIND.META_SAVED)).toBe(true);
    expect(hasSavedKind({ metaSaved: 1 }, SAVED_KIND.META_SAVED)).toBe(false);
    expect(hasSavedKind({ metaSaved: 'true' }, SAVED_KIND.META_SAVED)).toBe(false);
    expect(hasSavedKind(null, SAVED_KIND.META_SAVED)).toBe(false);
    expect(hasSavedKind(undefined, SAVED_KIND.META_SAVED)).toBe(false);
    expect(hasSavedKind('metaSaved', SAVED_KIND.META_SAVED)).toBe(false);
  });

  it('isSessionOnlySave', () => {
    expect(isSessionOnlySave(sessionOnly())).toBe(true);
    expect(isSessionOnlySave(jobSkills({ jobIndex: 0, skillIDs: [], sessionOnly: true }))).toBe(true);
    expect(isSessionOnlySave(jobSkills({ jobIndex: 0, skillIDs: [] }))).toBe(false);
    expect(isSessionOnlySave(undefined)).toBe(false);
  });

  it('isJobSkillsPayload', () => {
    expect(isJobSkillsPayload({ jobIndex: 0 })).toBe(true);
    expect(isJobSkillsPayload({ jobIndex: null })).toBe(false);
    expect(isJobSkillsPayload({})).toBe(false);
    expect(isJobSkillsPayload(null)).toBe(false);
  });

  it('needsResumeListRefetch is true only for metaSaved', () => {
    expect(needsResumeListRefetch(metaSaved())).toBe(true);
    expect(needsResumeListRefetch({ metaSaved: true, reparsed: true })).toBe(true);
    expect(needsResumeListRefetch(otherSectionsSaved())).toBe(false);
    expect(needsResumeListRefetch(educationSaved())).toBe(false);
    expect(needsResumeListRefetch(undefined)).toBe(false);
  });
});

describe('resumeRefreshAction', () => {
  it.each([
    ['skillMerged', skillMerged()],
    ['skillRenamed', skillRenamed()],
    ['removedSkill', removedSkill()],
    ['clearAllJobSkillLinks', clearAllJobSkillLinks()],
    ['jobsMutated', jobsMutated()],
    ['reparsed', reparsed()],
    ['restored', restored()],
  ])('%s → reload', (_name, payload) => {
    expect(resumeRefreshAction(payload)).toBe(REFRESH_ACTION.RELOAD);
    expect(resumeRefreshAction(payload)).toBe('reload');
  });

  it('every RELOAD_KINDS flag → reload', () => {
    for (const kind of RELOAD_KINDS) {
      expect(resumeRefreshAction({ [kind]: true })).toBe('reload');
    }
  });

  it('metaSaved → refetch-list, but still reload when combined with a reload kind', () => {
    expect(resumeRefreshAction(metaSaved())).toBe('refetch-list');
    expect(resumeRefreshAction({ metaSaved: true, restored: true })).toBe('reload');
    expect(resumeRefreshAction({ metaSaved: true, reparsed: true })).toBe('reload');
    expect(needsResumeListRefetch({ metaSaved: true, reparsed: true })).toBe(true);
  });

  it('per-job skill payload → patch-job (server-backed and session-only)', () => {
    expect(resumeRefreshAction(jobSkills({ jobIndex: 0, skillIDs: ['vue'], jobSkills: { vue: 'Vue' } }))).toBe('patch-job');
    expect(resumeRefreshAction(jobSkills({ jobIndex: 3, skillIDs: [], sessionOnly: true }))).toBe('patch-job');
    expect(resumeRefreshAction({ jobIndex: 1, skillIDs: ['a'] })).toBe('patch-job');
  });

  it('reload kinds win over a per-job payload', () => {
    expect(resumeRefreshAction({ jobIndex: 0, skillIDs: [], skillMerged: true })).toBe('reload');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty object', {}],
    ['string', 'saved'],
    ['number', 1],
    ['jobFieldsSaved', jobFieldsSaved()],
    ['otherSectionsSaved', otherSectionsSaved()],
    ['educationSaved', educationSaved()],
    ['sessionOnly', sessionOnly()],
    ['false flags', { skillMerged: false, metaSaved: false, jobIndex: null }],
    ['truthy non-boolean flag', { skillMerged: 1 }],
  ])('%s → none', (_name, payload) => {
    expect(resumeRefreshAction(payload)).toBe(REFRESH_ACTION.NONE);
  });
});
