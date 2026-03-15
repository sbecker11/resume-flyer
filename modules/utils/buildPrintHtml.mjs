/**
 * buildPrintHtml.mjs
 * Generates a printable HTML resume from live in-memory data.
 * Mirrors the structure and styling of the pre-rendered resume.html files.
 */

function formatDate(dateStr) {
    if (!dateStr || dateStr === 'CURRENT_DATE') return 'Present';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function linkify(text) {
    if (!text) return '';
    // Convert URLs to links
    const urlRe = /(https?:\/\/[^\s,<]+)/g;
    text = escapeHtml(text).replace(urlRe, '<a href="$1">$1</a>');
    // Convert email addresses to mailto links
    const emailRe = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    text = text.replace(emailRe, (m) => {
        if (text.includes(`href="${m}"`)) return m; // already linked
        return `<a href="mailto:${m}">${m}</a>`;
    });
    return text;
}

/** Strip [BracketedSkill] refs → plain text */
function stripBrackets(text) {
    return (text || '').replace(/\[([^\]]+)\]/g, '$1');
}

/** Split description string into bullet array */
function parseBullets(description) {
    if (!description) return [];
    return description.split('•').map(s => stripBrackets(s).trim()).filter(Boolean);
}

/** Build skills-by-category list from live skills + categories data */
function buildSkillsByCategory(skills, categories) {
    if (!categories || !skills) return [];
    // categories: object keyed by id, each has {name, skillIDs:[]}
    // skills: array of {name, categoryIDs:[], ...} OR object keyed by id/name
    const skillsById = {};
    if (Array.isArray(skills)) {
        skills.forEach(s => { if (s.id || s.name) skillsById[s.id || s.name] = s; });
    } else {
        Object.entries(skills).forEach(([k, v]) => { skillsById[k] = v; });
    }

    const result = [];
    const catEntries = Array.isArray(categories)
        ? categories
        : Object.values(categories);

    for (const cat of catEntries) {
        const catSkills = (cat.skillIDs || [])
            .map(sid => skillsById[sid])
            .filter(Boolean)
            .map(s => s.name || s);
        if (catSkills.length > 0) {
            result.push({ name: cat.name, skills: catSkills });
        }
    }
    return result;
}

/**
 * Build a complete printable HTML string from live resume data.
 *
 * @param {Array} jobs - Normalized live jobs array from useJobsDependency
 * @param {Object|Array} skills - Skills data from getResumeData
 * @param {Object|Array} categories - Categories data from getResumeData
 * @param {Object} otherSections - Data from /api/resumes/:id/other-sections
 * @returns {string} Complete HTML document string
 */
export function buildPrintHtml(jobs, skills, categories, otherSections) {
    const contact = otherSections?.contact || {};
    const title = otherSections?.title || '';
    const summary = otherSections?.summary || '';
    const certifications = otherSections?.certifications || [];
    const websites = otherSections?.websites || [];
    const otherSectionsList = otherSections?.other_sections || [];
    const skillsByCategory = buildSkillsByCategory(skills, categories);

    // --- Header ---
    const contactParts = [
        contact.email ? `<span><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></span>` : '',
        contact.phone ? `<span>${escapeHtml(contact.phone)}</span>` : '',
        contact.location ? `<span>${escapeHtml(contact.location)}</span>` : '',
        contact.linkedin ? `<span><a href="${escapeHtml(contact.linkedin)}">LinkedIn</a></span>` : '',
        contact.website ? `<span><a href="${escapeHtml(contact.website)}">Website</a></span>` : '',
    ].filter(Boolean).join('\n      ');

    // --- Summary ---
    const summaryHtml = summary ? `
  <section class="section">
    <h2 class="section-head">Summary</h2>
    <p class="summary">${escapeHtml(summary)}</p>
  </section>` : '';

    // --- Experience ---
    const jobsHtml = (jobs || []).map(job => {
        const bullets = parseBullets(job.Description || job.description || '');
        const bulletHtml = bullets.length > 0
            ? `<ul>${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('\n')}</ul>`
            : '';
        return `
    <div class="job">
      <div class="job-header">
        <span class="job-role">${escapeHtml(job.role || '')}</span>
        <span class="job-employer">${escapeHtml(job.employer || '')}</span>
        <span class="job-dates">${formatDate(job.start)} – ${formatDate(job.end)}</span>
      </div>
      <div class="job-desc">${bulletHtml}</div>
    </div>`;
    }).join('\n');

    // --- Skills by category ---
    const skillsHtml = skillsByCategory.length > 0 ? `
  <section class="section">
    <h2 class="section-head">Skills</h2>
    <ul class="skills-by-cat">
      ${skillsByCategory.map(cat =>
        `<li><span class="cat-name">${escapeHtml(cat.name)}:</span> ${cat.skills.map(escapeHtml).join(', ')}</li>`
    ).join('\n      ')}
    </ul>
  </section>` : '';

    // --- Certifications (supports { name, url?, description? } or legacy { name, issuer?, date? }) ---
    const certsHtml = certifications.length > 0 ? `
  <section class="section">
    <h2 class="section-head">Certifications</h2>
    ${certifications.map(c => {
        const namePart = c.url
            ? `<a href="${escapeHtml(c.url)}">${escapeHtml(c.name)}</a>`
            : escapeHtml(c.name);
        const extra = c.description ? linkify(c.description) : (c.issuer ? ` – ${escapeHtml(c.issuer)}` : '') + (c.date ? ` (${escapeHtml(c.date)})` : '');
        return `<div class="cert"><span class="cert-name">${namePart}</span>${extra ? ' – ' + extra : ''}</div>`;
    }).join('')}
  </section>` : '';

    // --- Websites (label, url, optional description) ---
    const websitesHtml = websites.length > 0 ? `
  <section class="section">
    <h2 class="section-head">Websites</h2>
    <ul class="websites-list">
      ${websites.map(w => `<li><a href="${escapeHtml(w.url)}">${escapeHtml(w.label || w.url)}</a>${w.description ? ` – ${escapeHtml(w.description)}` : ''}</li>`).join('')}
    </ul>
  </section>` : '';

    // --- Other sections (supports { title, content? } or { title, subtitle?, description? }) ---
    const otherHtml = otherSectionsList.map(sec => {
        const content = sec.content ?? [sec.subtitle, sec.description].filter(Boolean).join('\n');
        return `
  <section class="section">
    <h2 class="section-head">${escapeHtml(sec.title)}</h2>
    ${sec.subtitle ? `<h3 class="section-sub">${escapeHtml(sec.subtitle)}</h3>` : ''}
    <div class="other-section"><div class="content">${linkify(content)}</div></div>
  </section>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Resume – ${escapeHtml(contact.name || title)}</title>
  <style>
    :root { --text: #222; --muted: #555; --line: #ddd; --bg: #fff; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: var(--text); background: var(--bg); max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.4; }
    @media print { body { padding: 1rem; } }
    h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.25rem 0; }
    .title { font-size: 1rem; color: var(--muted); margin-bottom: 1rem; }
    .contact { font-size: 0.9rem; color: var(--muted); margin-bottom: 1.25rem; }
    .contact span + span::before { content: ' · '; }
    .section { margin-bottom: 1.25rem; }
    .section-head { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); border-bottom: 1px solid var(--line); padding-bottom: 0.25rem; margin-bottom: 0.5rem; }
    .job { margin-bottom: 1rem; }
    .job-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
    .job-role { font-weight: 700; }
    .job-employer { font-style: italic; }
    .job-dates { font-size: 0.9rem; color: var(--muted); }
    .job-desc { margin-top: 0.35rem; font-size: 0.95rem; }
    .job-desc ul { margin: 0.25rem 0 0 0; padding-left: 1.25rem; }
    .job-desc li { margin-bottom: 0.2rem; }
    .summary { white-space: pre-line; }
    .skills-by-cat { list-style: disc; padding-left: 1.25rem; font-size: 0.95rem; }
    .skills-by-cat li { margin-bottom: 0.35rem; }
    .skills-by-cat .cat-name { font-weight: 600; }
    .cert { margin-bottom: 0.35rem; }
    .cert-name { font-weight: 600; }
    .section-sub { font-size: 0.9rem; font-weight: 600; margin: 0 0 0.35rem 0; color: var(--text); }
    .websites-list { list-style: none; padding-left: 0; }
    .websites-list li { margin-bottom: 0.35rem; }
    .other-section .content { white-space: pre-line; font-size: 0.95rem; }
    a { color: #1967d2; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(contact.name || '')}</h1>
    <p class="title">${escapeHtml(title)}</p>
    <p class="contact">
      ${contactParts}
    </p>
  </header>
  ${summaryHtml}
  <section class="section">
    <h2 class="section-head">Experience</h2>
    ${jobsHtml}
  </section>
  ${skillsHtml}
  ${certsHtml}
  ${websitesHtml}
  ${otherHtml}
</body>
</html>`;
}
