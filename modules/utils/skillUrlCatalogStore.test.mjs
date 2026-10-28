import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readSharedSkillUrlCatalog, upsertSharedSkillUrl } from './skillUrlCatalogStore.mjs'

const dirs = []

async function tempDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-urls-'))
    dirs.push(dir)
    return dir
}

afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('skillUrlCatalogStore', () => {
    it('shares one file across two writers and mirrors a static copy', async () => {
        const dir = await tempDir()
        const filePath = path.join(dir, 'shared', 'skill-urls.json')
        const mirrorPath = path.join(dir, 'parsed_resumes', 'skill-urls.json')

        await upsertSharedSkillUrl({
            key: 'cnn',
            url: 'https://example.com/cnn',
            updatedAt: '2024-01-01T00:00:00.000Z',
            filePath,
            mirrorPath,
        })
        await upsertSharedSkillUrl({
            key: 'vue',
            url: 'https://vuejs.org',
            updatedAt: '2024-02-01T00:00:00.000Z',
            filePath,
            mirrorPath,
        })
        await upsertSharedSkillUrl({
            key: 'cnn',
            url: 'https://older.example',
            updatedAt: '2020-01-01T00:00:00.000Z',
            filePath,
            mirrorPath,
        })

        const catalog = await readSharedSkillUrlCatalog(filePath)
        expect(catalog.entries.cnn.url).toBe('https://example.com/cnn')
        expect(catalog.entries.vue.url).toBe('https://vuejs.org')

        const mirror = JSON.parse(await fs.readFile(mirrorPath, 'utf-8'))
        expect(mirror.entries.vue.url).toBe('https://vuejs.org')
        expect(mirror.entries.cnn.url).toBe('https://example.com/cnn')
    })
})
