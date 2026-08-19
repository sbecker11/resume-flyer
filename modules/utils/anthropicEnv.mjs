/**
 * Shared Anthropic env for resume-flyer server, CLI scripts, and resume-parser spawns.
 * Single ANTHROPIC_API_KEY in resume-flyer .env covers skill lookups + parser subprocesses.
 */

/** Env vars forwarded to resume-parser (Python). */
export const ANTHROPIC_PARSER_ENV_KEYS = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'LLM_PROVIDER',
];

/** Never pass OpenAI keys into resume-parser. */
export const PARSER_STRIP_ENV_KEYS = ['OPENAI_API_KEY'];

/**
 * @param {NodeJS.ProcessEnv} [parentEnv=process.env]
 * @returns {string}
 */
export function getAnthropicApiKey(parentEnv = process.env) {
    return (parentEnv.ANTHROPIC_API_KEY || '').trim();
}

/**
 * Model for skill ? popups — cheap/fast default; override with ANTHROPIC_SKILL_INFO_MODEL.
 * @param {NodeJS.ProcessEnv} [parentEnv=process.env]
 */
export function getSkillInfoModel(parentEnv = process.env) {
    return (parentEnv.ANTHROPIC_SKILL_INFO_MODEL || 'claude-haiku-4-5').trim();
}

/**
 * Env for resume-parser child processes: parent env minus OpenAI, plus Anthropic from parent.
 * @param {NodeJS.ProcessEnv} [parentEnv=process.env]
 * @returns {NodeJS.ProcessEnv}
 */
export function getParserSpawnEnv(parentEnv = process.env) {
    const result = { ...parentEnv };
    for (const key of PARSER_STRIP_ENV_KEYS) {
        delete result[key];
    }
    const apiKey = getAnthropicApiKey(parentEnv);
    if (apiKey) {
        result.ANTHROPIC_API_KEY = apiKey;
        result.LLM_PROVIDER = (parentEnv.LLM_PROVIDER || 'anthropic').trim();
        if (parentEnv.ANTHROPIC_MODEL) {
            result.ANTHROPIC_MODEL = parentEnv.ANTHROPIC_MODEL.trim();
        }
    }
    return result;
}
