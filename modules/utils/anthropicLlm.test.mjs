import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callAnthropicMessages } from './anthropicLlm.mjs';

function mockFetchOnce(response) {
    global.fetch = vi.fn().mockResolvedValue(response);
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    };
}

describe('callAnthropicMessages', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.ANTHROPIC_API_KEY;

    afterEach(() => {
        global.fetch = originalFetch;
        process.env.ANTHROPIC_API_KEY = originalKey;
        vi.restoreAllMocks();
    });

    it('throws when no API key is configured (explicit or env)', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        await expect(
            callAnthropicMessages({ system: 's', user: 'u', model: 'claude-haiku-4-5' })
        ).rejects.toThrow('ANTHROPIC_API_KEY not configured');
    });

    it('sends the expected request and returns the text block on success', async () => {
        mockFetchOnce(jsonResponse(200, { content: [{ type: 'text', text: '  hello world  ' }] }));

        const result = await callAnthropicMessages({
            system: 'be terse',
            user: 'ping',
            model: 'claude-haiku-4-5',
            apiKey: 'sk-ant-test-key',
        });

        expect(result).toBe('hello world');
        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.anthropic.com/v1/messages',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'x-api-key': 'sk-ant-test-key',
                    'anthropic-version': '2023-06-01',
                }),
            })
        );
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body).toMatchObject({
            model: 'claude-haiku-4-5',
            max_tokens: 1024,
            system: 'be terse',
            messages: [{ role: 'user', content: 'ping' }],
        });
    });

    it('respects a custom maxTokens value', async () => {
        mockFetchOnce(jsonResponse(200, { content: [{ type: 'text', text: 'ok' }] }));
        await callAnthropicMessages({ system: 's', user: 'u', model: 'm', apiKey: 'k', maxTokens: 64 });
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(64);
    });

    it('picks the first text-type content block, ignoring others', async () => {
        mockFetchOnce(
            jsonResponse(200, {
                content: [
                    { type: 'tool_use', text: 'ignore me' },
                    { type: 'text', text: 'the real answer' },
                ],
            })
        );
        const result = await callAnthropicMessages({ system: 's', user: 'u', model: 'm', apiKey: 'k' });
        expect(result).toBe('the real answer');
    });

    it('throws with status and truncated body on a non-ok response', async () => {
        mockFetchOnce(jsonResponse(429, { error: { message: 'rate limited' } }));
        await expect(
            callAnthropicMessages({ system: 's', user: 'u', model: 'm', apiKey: 'k' })
        ).rejects.toThrow(/Anthropic API error 429/);
    });

    it('throws when the response has no text content', async () => {
        mockFetchOnce(jsonResponse(200, { content: [] }));
        await expect(
            callAnthropicMessages({ system: 's', user: 'u', model: 'm', apiKey: 'k' })
        ).rejects.toThrow('Empty response from Anthropic');
    });

    it('falls back to env ANTHROPIC_API_KEY when apiKey is not passed', async () => {
        process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';
        mockFetchOnce(jsonResponse(200, { content: [{ type: 'text', text: 'via env' }] }));
        const result = await callAnthropicMessages({ system: 's', user: 'u', model: 'm' });
        expect(result).toBe('via env');
        expect(global.fetch.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-from-env');
    });
});
