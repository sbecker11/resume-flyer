/**
 * Minimal Anthropic Messages API client (fetch — no SDK dependency).
 */

import { getAnthropicApiKey } from './anthropicEnv.mjs';

/**
 * @param {{ system: string, user: string, maxTokens?: number, model: string, apiKey?: string }} opts
 * @returns {Promise<string>}
 */
export async function callAnthropicMessages({ system, user, maxTokens = 1024, model, apiKey }) {
    const key = (apiKey || getAnthropicApiKey()).trim();
    if (!key) {
        throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: user }],
        }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 400)}`);
    }
    const data = await response.json();
    const text = data.content?.find((block) => block.type === 'text')?.text?.trim() || '';
    if (!text) {
        throw new Error('Empty response from Anthropic');
    }
    return text;
}
