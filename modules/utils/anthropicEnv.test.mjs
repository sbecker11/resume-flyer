import { describe, it, expect } from 'vitest';
import { getParserSpawnEnv, getSkillInfoModel, PARSER_STRIP_ENV_KEYS } from './anthropicEnv.mjs';

describe('anthropicEnv', () => {
    it('getParserSpawnEnv strips OpenAI and forwards Anthropic', () => {
        const env = getParserSpawnEnv({
            PATH: '/usr/bin',
            OPENAI_API_KEY: 'sk-openai',
            ANTHROPIC_API_KEY: 'sk-ant-test',
            ANTHROPIC_MODEL: 'claude-sonnet-4-6',
            LLM_PROVIDER: 'anthropic',
        });
        expect(env.OPENAI_API_KEY).toBeUndefined();
        expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
        expect(env.ANTHROPIC_MODEL).toBe('claude-sonnet-4-6');
        expect(env.LLM_PROVIDER).toBe('anthropic');
        expect(env.PATH).toBe('/usr/bin');
    });

    it('defaults LLM_PROVIDER when Anthropic key present', () => {
        const env = getParserSpawnEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });
        expect(env.LLM_PROVIDER).toBe('anthropic');
    });

    it('getSkillInfoModel defaults to haiku', () => {
        expect(getSkillInfoModel({})).toBe('claude-haiku-4-5');
        expect(getSkillInfoModel({ ANTHROPIC_SKILL_INFO_MODEL: 'claude-opus-4-6' })).toBe('claude-opus-4-6');
    });

    it('PARSER_STRIP_ENV_KEYS includes OPENAI_API_KEY', () => {
        expect(PARSER_STRIP_ENV_KEYS).toContain('OPENAI_API_KEY');
    });
});
