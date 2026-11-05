/**
 * Optional project URLs on a biz card (GitHub repository and GitHub Pages).
 * Either field may be absent. Résumé text and HTML both use the same two shapes.
 */

const GITHUB_REPO_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/gi
const GITHUB_PAGES_RE = /(?:https?:\/\/)?([\w.-]+)\.github\.io\/([\w.-]+)\/?/gi

/**
 * @param {string} source plain text or HTML
 * @returns {{ githubRepoUrl: string, githubPagesUrl: string }}
 */
export function projectUrlsFromHtml(source) {
    const text = String(source || '')
    let githubRepoUrl = ''
    let githubPagesUrl = ''
    for (const match of text.matchAll(GITHUB_REPO_RE)) {
        const owner = match[1]
        const repo = match[2].replace(/\.git$/i, '')
        if (!owner || !repo || repo === 'github.io') continue
        githubRepoUrl = `https://github.com/${owner}/${repo}`
        break
    }
    for (const match of text.matchAll(GITHUB_PAGES_RE)) {
        githubPagesUrl = `https://${match[1]}.github.io/${match[2]}/`
        break
    }
    return { githubRepoUrl, githubPagesUrl }
}

/** Same extractor for résumé description text. */
export function projectUrlsFromText(text) {
    return projectUrlsFromHtml(text)
}

/**
 * Explicit job fields win. Otherwise the URLs are read from Description / description.
 * @param {object} [job]
 * @returns {{ githubRepoUrl: string, githubPagesUrl: string }}
 */
export function resolveProjectUrls(job) {
    const fromText = projectUrlsFromText(job?.Description || job?.description || '')
    const githubRepoUrl = String(job?.githubRepoUrl || '').trim() || fromText.githubRepoUrl
    const githubPagesUrl = String(job?.githubPagesUrl || '').trim() || fromText.githubPagesUrl
    return { githubRepoUrl, githubPagesUrl }
}
