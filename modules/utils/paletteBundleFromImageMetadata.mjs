/**
 * Build the app palette bundle from static_content/color_palettes.jsonl (one JSON object per line).
 * Each line may include paletteName, colorPalette (hex strings), optional backgroundSwatchIndex, imagePublicUrl.
 *
 * @param {string} rawFileContents - Full file text
 * @returns {{ version: 2, palettes: Array<{ name: string, colors: string[], backgroundSwatchIndex?: number, imagePublicUrl?: string }> }}
 */
export function parsePaletteBundleFromImageMetadataJsonl(rawFileContents) {
    /** @type {Map<string, { name: string, colors: string[], backgroundSwatchIndex?: number, imagePublicUrl?: string }>} */
    const byName = new Map();
    let lineNo = 0;
    for (const line of rawFileContents.split(/\r?\n/)) {
        lineNo += 1;
        const trimmed = line.trim();
        if (!trimmed) continue;
        let row;
        try {
            row = JSON.parse(trimmed);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`color_palettes.jsonl line ${lineNo}: invalid JSON (${msg})`);
        }
        const name = typeof row.paletteName === 'string' ? row.paletteName.trim() : '';
        if (!name) continue;
        const colors = row.colorPalette;
        if (!Array.isArray(colors) || colors.length === 0) continue;
        const normalizedColors = colors.map((c) => String(c).trim()).filter(Boolean);
        if (normalizedColors.length === 0) continue;

        /** @type {{ name: string, colors: string[], backgroundSwatchIndex?: number, imagePublicUrl?: string }} */
        const entry = { name, colors: normalizedColors };
        if (typeof row.imagePublicUrl === 'string' && row.imagePublicUrl.trim()) {
            entry.imagePublicUrl = row.imagePublicUrl.trim();
        }
        if (typeof row.backgroundSwatchIndex === 'number' && Number.isFinite(row.backgroundSwatchIndex)) {
            entry.backgroundSwatchIndex = Math.trunc(row.backgroundSwatchIndex);
        }
        byName.set(name, entry);
    }
    const palettes = [...byName.values()];
    if (palettes.length === 0) {
        throw new Error(
            'No valid palettes in color_palettes.jsonl (need paletteName + non-empty colorPalette per line)'
        );
    }
    return { version: 2, palettes };
}
