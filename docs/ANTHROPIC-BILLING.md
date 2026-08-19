# Anthropic billing for resume-flyer

resume-flyer uses **one Anthropic API account** (`ANTHROPIC_API_KEY` in `.env`) for:

| Feature | Model (default) | When |
|---------|-----------------|------|
| Skill **?** popups | `claude-haiku-4-5` (`ANTHROPIC_SKILL_INFO_MODEL`) | Each uncached slug |
| Resume upload / reparse | `claude-sonnet-4-6` (`ANTHROPIC_MODEL`) | resume-parser subprocess |

**Cursor Ultra is separate** — it does not fund these API calls.

## Setup

1. Copy `.env.example` → `.env`
2. Set `ANTHROPIC_API_KEY` from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
3. Optional: set `ANTHROPIC_MODEL` and `ANTHROPIC_SKILL_INFO_MODEL`
4. Restart the dev server (`npm run dev`)

You can remove `OPENAI_API_KEY` — skill lookups no longer use OpenAI.

For usage tracking, create an **Admin API key** (`sk-ant-admin...`) at [console.anthropic.com/settings/admin-keys](https://console.anthropic.com/settings/admin-keys) and set `ANTHROPIC_ADMIN_API_KEY`.

## Track usage

```bash
npm run anthropic-usage              # last 7 days
npm run anthropic-usage -- --days 31 # up to 31 days
ANTHROPIC_MONTHLY_ALERT_USD=50 npm run anthropic-usage
```

The script calls Anthropic’s [Usage & Cost Admin API](https://platform.claude.com/docs/en/manage-claude/usage-cost-api) and prints token totals and USD cost.

## Auto-reload (this is the auto-buy)

Anthropic API usage is **prepaid credits**. Skill **?** and resume-parser debit the Console credit balance tied to `ANTHROPIC_API_KEY`.

Configure auto-reload at [platform.claude.com/settings/billing](https://platform.claude.com/settings/billing) (same page as [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing)):

| Setting | Recommended for this app |
|---------|--------------------------|
| When credit balance reaches | **$5** |
| Bring credit balance back up to | **$25** |

That policy is enough for Haiku skill lookups plus occasional Sonnet reparses. Raise the target (e.g. $50) if you reparse full résumés often — a parse can spend several dollars in one run.

There is **no programmatic purchase API** from resume-flyer; Console auto-reload is the official top-up. Credits expire **one year** after purchase and are non-refundable.

Anthropic has **three different billing pools** — do not mix them up:

| Pool | Pays for | Auto-reload? |
|------|----------|--------------|
| **API credits** (`ANTHROPIC_API_KEY`) | resume-flyer skill **?** + resume-parser | **Yes** — Console Billing auto-reload ($5 → $25 above) |
| **Cursor Ultra** | IDE Agent / Composer | Cursor subscription — unrelated to API |
| **Extra usage credits** (claude.ai) | OAuth tools (some third-party apps) | Separate auto-reload at [claude.ai/settings/usage](https://claude.ai/settings/usage) — **not** used by this app |

Also useful:

1. **Payment method on file** on the same Console Billing page — required for auto-reload.
2. **`npm run anthropic-usage`** on a schedule with `ANTHROPIC_MONTHLY_ALERT_USD` — local warning when period cost is high (does not purchase credits).

### Suggested cron (optional)

```bash
# Weekly usage email substitute: log to file and alert on threshold
0 9 * * 1 cd /path/to/resume-flyer && ANTHROPIC_MONTHLY_ALERT_USD=40 npm run anthropic-usage >> ~/logs/anthropic-usage.log 2>&1
```

## Cost tips

- Skill definitions are **cached in memory** until server restart — repeat **?** clicks on the same skill are free.
- Skill lookups use **Haiku** by default (cheaper than Sonnet).
- Reparse is the expensive path (many Sonnet calls). Use only when the DOCX changed.
