/**
 * Shared writer for the per-resume JSON files (jobs.json, skills.json, education.json,
 * categories.json, meta.json, enriched-jobs.json).
 *
 * The resume-parser emits ensure_ascii JSON ("\u2022", "\u00e9") with a trailing newline.
 * A plain JSON.stringify write turns every escape into raw UTF-8 and drops the newline,
 * which shows up as dozens of unrelated diff lines after a one-field edit. This module
 * keeps each file in the convention it already uses.
 */
import fs from 'fs/promises';
import { atomicWriteWithLock } from '../utils/atomicFileUtils.mjs';
import { reportError } from '../utils/errorReporting.mjs';

const UNICODE_ESCAPE = /\\u[0-9a-fA-F]{4}/;

/**
 * True when the text already encodes non-ASCII as \uXXXX escapes.
 * @param {unknown} text
 */
export function usesUnicodeEscapes(text) {
    return typeof text === 'string' && UNICODE_ESCAPE.test(text);
}

/**
 * Escape every code unit outside printable ASCII the way Python's json.dumps(ensure_ascii=True)
 * does (lowercase hex; astral characters become two surrogate escapes).
 * @param {string} json
 */
export function escapeNonAscii(json) {
    return json.replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * Serialize `value` as 2-space JSON that ends in exactly one newline and matches the
 * escape style of `existingText` (escaped when the current file is escaped, raw otherwise).
 * @param {unknown} value
 * @param {string} [existingText=''] current file contents, '' for a new file
 * @returns {string}
 */
export function formatResumeJson(value, existingText = '') {
    const json = JSON.stringify(value, null, 2);
    if (json === undefined) throw new Error('[resumeJsonFile] value is not JSON-serializable');
    return `${usesUnicodeEscapes(existingText) ? escapeNonAscii(json) : json}\n`;
}

/**
 * @param {string} filePath
 * @returns {Promise<string|null>} current text, null when the file does not exist
 */
async function readExistingText(filePath) {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        reportError(err, `[resumeJsonFile] Failed to read ${filePath} before writing it`);
        throw err;
    }
}

/**
 * Atomically write `value` to `filePath`, preserving the file's existing escape style.
 * A missing file is written in raw UTF-8.
 * @param {string} filePath
 * @param {unknown} value
 */
export async function writeResumeJson(filePath, value) {
    const existingText = await readExistingText(filePath);
    await atomicWriteWithLock(filePath, formatResumeJson(value, existingText ?? ''));
}

/**
 * Like writeResumeJson, but skips the write when the file already holds the same JSON data
 * (compared structurally, so whitespace, escape style, or a missing trailing newline do not
 * count as a change). An unparseable existing file is overwritten.
 * @param {string} filePath
 * @param {unknown} value
 * @returns {Promise<boolean>} true when the file was written
 */
export async function writeResumeJsonIfChanged(filePath, value) {
    const existingText = await readExistingText(filePath);
    if (existingText != null) {
        let same = false;
        try {
            same = JSON.stringify(JSON.parse(existingText)) === JSON.stringify(value);
        } catch (err) {
            reportError(err, `[resumeJsonFile] ${filePath} is not valid JSON`, 'Overwriting it with the new value');
        }
        if (same) return false;
    }
    await atomicWriteWithLock(filePath, formatResumeJson(value, existingText ?? ''));
    return true;
}
