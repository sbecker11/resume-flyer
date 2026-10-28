/**
 * On-disk shared skill URL catalog.
 * Every resume-flyer app on this machine reads and writes the same file
 * (default ~/.resume-flyer/skill-urls.json, override with SKILL_URLS_FILE)
 * and mirrors a copy into parsed_resumes/skill-urls.json for static hosting.
 */
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { withFileLock } from './atomicFileUtils.mjs'
import { reportError } from './errorReporting.mjs'
import { normalizeCatalog, upsertEntry } from './skillUrlCatalog.mjs'

export function defaultSkillUrlsPath() {
    if (process.env.SKILL_URLS_FILE) return path.resolve(process.env.SKILL_URLS_FILE)
    return path.join(os.homedir(), '.resume-flyer', 'skill-urls.json')
}

export function skillUrlsMirrorPath(parsedResumesDir) {
    return path.join(parsedResumesDir, 'skill-urls.json')
}

async function readCatalog(filePath) {
    try {
        const text = await fs.readFile(filePath, 'utf-8')
        return normalizeCatalog(JSON.parse(text))
    } catch (error) {
        if (error && error.code === 'ENOENT') return { entries: {} }
        throw error
    }
}

async function writeCatalog(filePath, catalog) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmp = `${filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(normalizeCatalog(catalog), null, 2), 'utf-8')
    await fs.rename(tmp, filePath)
}

/**
 * @param {string} [filePath]
 */
export async function readSharedSkillUrlCatalog(filePath = defaultSkillUrlsPath()) {
    return readCatalog(filePath)
}

/**
 * Merge one slug into the shared catalog and mirror it for static hosts.
 * @param {{ key: string, url: string, updatedAt?: string, filePath?: string, mirrorPath?: string }} opts
 */
export async function upsertSharedSkillUrl({
    key,
    url,
    updatedAt,
    filePath = defaultSkillUrlsPath(),
    mirrorPath,
}) {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    return withFileLock(filePath, async () => {
        const current = await readCatalog(filePath)
        const next = upsertEntry(current, key, url, updatedAt)
        await writeCatalog(filePath, next)
        if (mirrorPath && path.resolve(mirrorPath) !== path.resolve(filePath)) {
            try {
                await writeCatalog(mirrorPath, next)
            } catch (error) {
                reportError(
                    error,
                    '[skillUrlCatalogStore] Failed to mirror skill-urls.json',
                    'Shared catalog was saved; the repo mirror was not updated'
                )
            }
        }
        return next
    })
}
