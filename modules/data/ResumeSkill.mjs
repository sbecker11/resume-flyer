/**
 * Skill entry from resume skills.json / API (extensible for future fields).
 */
export class ResumeSkill {
  /**
   * @param {string} id - Canonical key in the skills map
   * @param {Record<string, unknown>} [data]
   */
  constructor(id, data = {}) {
    this.id = String(id);
    this.name = data.name != null ? String(data.name) : this.id;
    this.url = data.url != null ? String(data.url) : '';
    this.img = data.img != null ? String(data.img) : '';
    Object.assign(this, data);
    this.id = String(id);
  }

  /**
   * @param {string} id
   * @param {unknown} raw
   * @returns {ResumeSkill}
   */
  static fromPlain(id, raw) {
    if (raw instanceof ResumeSkill) return raw;
    const o = raw && typeof raw === 'object' ? raw : {};
    return new ResumeSkill(id, o);
  }

  /** Plain record for JSON / APIs */
  toPlainObject() {
    const { id, name, url, img, ...rest } = this;
    return { id, name, url, img, ...rest };
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} skills
 * @returns {Record<string, ResumeSkill>}
 */
export function skillsObjectToResumeSkills(skills) {
  if (!skills || typeof skills !== 'object') return {};
  /** @type {Record<string, ResumeSkill>} */
  const out = {};
  for (const [k, v] of Object.entries(skills)) {
    out[k] = ResumeSkill.fromPlain(k, v);
  }
  return out;
}
