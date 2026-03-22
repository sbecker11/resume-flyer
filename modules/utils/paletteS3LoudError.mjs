/**
 * Very visible console output when the palette catalog cannot be fetched from S3 or validated.
 * Use before rethrowing so operators cannot miss the failure.
 *
 * @param {string} context - Where it failed (e.g. module + operation).
 * @param {unknown} error - Thrown value or Error.
 */
export function complainLoudlyPaletteS3Failure(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';

    if (typeof console === 'undefined' || !console.error) {
        return;
    }

    const line = '='.repeat(78);
    const body = [
        '',
        line,
        '  FATAL: COLOR PALETTE CATALOG — CANNOT BE FETCHED FROM S3 (OR FAILED VALIDATION)',
        `  ${context}`,
        `  ${message}`,
        '  → Set .env: S3_COLOR_PALETTES_JSON_URL',
        '     or S3_IMAGES_BUCKET + AWS_REGION (or S3_REGION) + S3_PALETTES_JSONL_KEY',
        '  → See .env.example and color-palette-utils-ts/DEVELOPMENT.md',
        line,
        '',
    ].join('\n');

    console.error(body);

    try {
        console.error(
            '%c PALETTE S3 FAILED — APP CANNOT LOAD COLOR PALETTES ',
            'font-size:13px;font-weight:bold;color:#fff;background:#b00020;padding:6px 10px;border-radius:2px'
        );
    } catch {
        /* Safari / restricted consoles may reject format strings */
    }

    if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed('[palette-s3] Error object & stack');
        console.error(error);
        if (stack) {
            console.error(stack);
        }
        console.groupEnd();
    } else if (stack) {
        console.error(stack);
    }
}
