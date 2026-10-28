/**
 * Dated snapshots of derived resume files taken before a reparse or a restore.
 * The original .docx/.pdf stays in the resume folder. History lives in
 * `<resume>/.reparse-history/<backupId>/` and is not committed.
 */
import fs from 'fs/promises';
import path from 'path';

export const REPARSE_BACKUP_DIRNAME = '.reparse-backup';
export const REPARSE_HISTORY_DIRNAME = '.reparse-history';
const MANIFEST_NAME = 'manifest.json';

/**
 * @param {Date} date
 * @returns {string}
 */
export function backupIdFromDate(date) {
    return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * @param {string} id
 * @returns {string}
 */
export function assertBackupId(id) {
    const s = String(id || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?$/.test(s)) {
        const err = new Error('Invalid backup id.');
        err.statusCode = 400;
        throw err;
    }
    return s;
}

function isOriginalDoc(name) {
    const lower = String(name || '').toLowerCase();
    return lower.endsWith('.pdf') || lower.endsWith('.docx');
}

/**
 * Move derived files aside so a reparse can rewrite the folder.
 * Keeps the original document and any existing history.
 * @param {string} dir
 * @param {string} keepDocName
 * @returns {Promise<string>} backup directory
 */
export async function stashDerivedFilesForReparse(dir, keepDocName) {
    const backupDir = path.join(dir, REPARSE_BACKUP_DIRNAME);
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.mkdir(backupDir, { recursive: true });
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (
            ent.name === keepDocName
            || ent.name === REPARSE_BACKUP_DIRNAME
            || ent.name === REPARSE_HISTORY_DIRNAME
        ) continue;
        await fs.rename(path.join(dir, ent.name), path.join(backupDir, ent.name));
    }
    return backupDir;
}

/**
 * Put a failed reparse's stash back. History folders are left in place.
 * @param {string} dir
 * @param {string} backupDir
 */
export async function restoreReparseBackup(dir, backupDir) {
    if (!backupDir) return;
    try {
        await fs.access(backupDir);
    } catch {
        return;
    }
    const current = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of current) {
        if (ent.name === REPARSE_BACKUP_DIRNAME || ent.name === REPARSE_HISTORY_DIRNAME) continue;
        if (isOriginalDoc(ent.name)) continue;
        await fs.rm(path.join(dir, ent.name), { recursive: true, force: true });
    }
    const backed = await fs.readdir(backupDir, { withFileTypes: true });
    for (const ent of backed) {
        await fs.rename(path.join(backupDir, ent.name), path.join(dir, ent.name));
    }
    await fs.rm(backupDir, { recursive: true, force: true });
}

/**
 * Keep a successful reparse's stash as a dated history entry.
 * @param {string} dir
 * @param {string} backupDir
 * @param {{ reason?: string, createdAt?: Date }} [opts]
 * @returns {Promise<{ id: string, createdAt: string, reason: string } | null>}
 */
export async function archiveReparseBackup(dir, backupDir, opts = {}) {
    if (!backupDir) return null;
    try {
        await fs.access(backupDir);
    } catch {
        return null;
    }
    const createdAt = opts.createdAt instanceof Date ? opts.createdAt : new Date();
    const reason = opts.reason || 'reparse';
    const historyRoot = path.join(dir, REPARSE_HISTORY_DIRNAME);
    await fs.mkdir(historyRoot, { recursive: true });
    let id = backupIdFromDate(createdAt);
    let dest = path.join(historyRoot, id);
    let n = 2;
    while (true) {
        try {
            await fs.access(dest);
            id = `${backupIdFromDate(createdAt)}-${n}`;
            n += 1;
            dest = path.join(historyRoot, id);
        } catch {
            break;
        }
    }
    await fs.rename(backupDir, dest);
    const manifest = { id, createdAt: createdAt.toISOString(), reason };
    await fs.writeFile(path.join(dest, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
    return manifest;
}

/**
 * @param {string} dir
 * @returns {Promise<Array<{ id: string, createdAt: string, reason: string }>>}
 */
export async function listReparseHistory(dir) {
    const historyRoot = path.join(dir, REPARSE_HISTORY_DIRNAME);
    let entries;
    try {
        entries = await fs.readdir(historyRoot, { withFileTypes: true });
    } catch (error) {
        if (error && error.code === 'ENOENT') return [];
        throw error;
    }
    const out = [];
    for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        try {
            assertBackupId(ent.name);
        } catch {
            continue;
        }
        let manifest = null;
        try {
            manifest = JSON.parse(await fs.readFile(path.join(historyRoot, ent.name, MANIFEST_NAME), 'utf-8'));
        } catch (error) {
            if (!error || error.code !== 'ENOENT') throw error;
        }
        out.push({
            id: ent.name,
            createdAt: manifest?.createdAt || ent.name,
            reason: manifest?.reason || 'reparse',
        });
    }
    out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return out;
}

/**
 * Copy one history entry back over the current derived files.
 * The current derived files are archived first so the restore can be undone.
 * @param {string} dir
 * @param {string} backupId
 */
export async function restoreReparseHistoryEntry(dir, backupId) {
    const id = assertBackupId(backupId);
    const source = path.join(dir, REPARSE_HISTORY_DIRNAME, id);
    try {
        await fs.access(source);
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            const missing = new Error(`Backup "${id}" was not found.`);
            missing.statusCode = 404;
            throw missing;
        }
        throw error;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const doc = entries.find((ent) => ent.isFile() && isOriginalDoc(ent.name));
    const staged = await stashDerivedFilesForReparse(dir, doc ? doc.name : '');
    await archiveReparseBackup(dir, staged, { reason: 'before-restore' });
    const backed = await fs.readdir(source, { withFileTypes: true });
    for (const ent of backed) {
        if (ent.name === MANIFEST_NAME) continue;
        await fs.cp(path.join(source, ent.name), path.join(dir, ent.name), { recursive: true });
    }
    return { id };
}
