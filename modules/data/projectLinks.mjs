/**
 * GitHub project and GitHub Pages links for portfolio biz cards.
 *
 * Source: workspace-linkedin-profile/linkedin-projects.html (Projects.json),
 * mirrored by each project's public LinkedIn "Projects" entry (ReadMe / RunMe).
 * A card gets a link only when that page lists one. Client jobs and education
 * rows are left alone.
 *
 * sushi-rag-mcp-server is the résumé employer; the projects page points that
 * work at github.com/sbecker11/sushi-rag-app.
 */

const PROJECTS = [
    {
        keys: ['resume-parser'],
        githubUrl: 'https://github.com/sbecker11/resume-parser',
    },
    {
        keys: ['color-palette-maker'],
        githubUrl: 'https://github.com/sbecker11/color-palette-maker',
        pagesUrl: 'https://sbecker11.github.io/color-palette-maker/',
    },
    {
        keys: ['resume-flyer'],
        githubUrl: 'https://github.com/sbecker11/resume-flyer',
        pagesUrl: 'https://sbecker11.github.io/resume-flyer/',
    },
    {
        keys: ['sushi-rag-mcp-server', 'sushi-rag-app'],
        githubUrl: 'https://github.com/sbecker11/sushi-rag-app',
    },
    {
        keys: ['ecommerce-semantic-search'],
        githubUrl: 'https://github.com/sbecker11/ecommerce-semantic-search',
    },
    {
        keys: ['linkage-engine'],
        githubUrl: 'https://github.com/sbecker11/linkage-engine',
        pagesUrl: 'https://sbecker11.github.io/linkage-engine/',
    },
    {
        keys: ['healthcare-agentic-snowflake-rag'],
        githubUrl: 'https://github.com/sbecker11/healthcare-agentic-snowflake-rag',
    },
    {
        keys: ['recruiting-automation'],
        githubUrl: 'https://github.com/sbecker11/recruiting-automation',
    },
]

const HTTPS_URL = /^https:\/\/[^\s]+$/

function assertHttps(url, label) {
    if (!HTTPS_URL.test(url)) {
        throw new Error(`[projectLinks] ${label} must be an https URL`)
    }
}

const BY_SLUG = new Map()
for (const project of PROJECTS) {
    if (project.githubUrl) assertHttps(project.githubUrl, project.keys[0] + ' githubUrl')
    if (project.pagesUrl) assertHttps(project.pagesUrl, project.keys[0] + ' pagesUrl')
    if (!project.githubUrl && !project.pagesUrl) {
        throw new Error(`[projectLinks] ${project.keys.join(',')} has no URLs`)
    }
    for (const key of project.keys) {
        if (BY_SLUG.has(key)) {
            throw new Error(`[projectLinks] Duplicate project slug "${key}"`)
        }
        BY_SLUG.set(key, project)
    }
}

/** Normalize an employer or role into a project slug. */
export function projectSlug(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/portfolio project:\s*/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

/**
 * @param {{ employer?: string, role?: string } | null | undefined} job
 * @returns {{ githubUrl: string, pagesUrl: string } | null}
 */
export function projectLinksForJob(job) {
    if (!job || typeof job !== 'object') return null
    const slugs = [projectSlug(job.employer), projectSlug(job.role)]
    for (const slug of slugs) {
        const project = slug ? BY_SLUG.get(slug) : null
        if (!project) continue
        return {
            githubUrl: project.githubUrl || '',
            pagesUrl: project.pagesUrl || '',
        }
    }
    return null
}

/** True when the event target is a biz-card GitHub / GitHub Pages anchor. */
export function isBizCardProjectLinkTarget(target) {
    if (!target || typeof target.closest !== 'function') return false
    return Boolean(target.closest('a.biz-card-project-link'))
}

/**
 * Let the anchor open its own window (target=_blank) and keep the card click
 * from selecting or clearing the job. Returns true when the click was consumed.
 * @param {Event | undefined | null} event
 */
export function ignoreProjectLinkClick(event) {
    if (!isBizCardProjectLinkTarget(event?.target)) return false
    event.stopPropagation()
    if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
    }
    return true
}
