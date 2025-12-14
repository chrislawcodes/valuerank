# LLM Provider Rate Limits Research

> **Last Updated:** December 2025
> **Purpose:** Document public rate limits for each provider to inform parallelism settings

## Summary

| Provider | Recommended Parallel | RPM at Entry Tier | RPM at Higher Tiers | Action Required |
|----------|---------------------|-------------------|---------------------|-----------------|
| OpenAI | 40+ | ~500 | 5,000+ | Check account tier |
| Anthropic | 8-40 | ~50 | 1,000-4,000 | Upgrade to Tier 2+ |
| Google | 10-40 | 5-15 (free) | Higher (paid) | Enable billing |
| xAI | 40+ | 480 | 480 | None |
| DeepSeek | 40+ | No hard cap | No hard cap | None |
| Mistral | 10-40 | ~60 | Higher | Check workspace |

## Provider Details

### OpenAI

**Rate Limit Structure:** RPM (requests/min), TPM (tokens/min), RPD (requests/day)

| Tier | Requirement | GPT-4o RPM | GPT-4o-mini RPM | TPM |
|------|-------------|------------|-----------------|-----|
| Free | None | ~10/day cap | Limited | Very low |
| Tier 1 | $5 payment | ~500 | ~500 | 30K |
| Tier 2 | $50 spent | ~500 | ~500 | 60K |
| Tier 3 | $100 spent | 5,000 | 5,000 | 200K |
| Tier 4 | $250 spent | 10,000 | 10,000 | 300K+ |
| Tier 5 | $1,000 spent | 10,000+ | 10,000+ | 10M+ |

**Notes:**
- Limits enforced per-second (60 RPM = 1 RPS burst limit)
- Check your tier at: https://platform.openai.com/account/limits
- Automatic tier upgrades based on spend history

**Can run 40+ parallel:** Yes, at Tier 2+

---

### Anthropic (Claude)

**Rate Limit Structure:** RPM, ITPM (input tokens/min), OTPM (output tokens/min)

| Tier | Requirement | RPM | Input TPM | Output TPM |
|------|-------------|-----|-----------|------------|
| Free | None | ~50 | 20K | 4K |
| Build 1 | $5 deposit | ~50 | 40K | 8K |
| Build 2 | $40 + 7 days | ~1,000 | 80K | 16K |
| Build 3 | $200 + 7 days | ~2,000 | 160K | 32K |
| Build 4 | $400 + 14 days | ~4,000 | 320K | 64K |
| Custom | Contact sales | Negotiated | Negotiated | Negotiated |

**Notes:**
- Opus 4.x limits are shared across Opus 4, 4.1, and 4.5
- Sonnet 4.x limits are shared across Sonnet 4 and 4.5
- Token bucket algorithm allows some bursting
- 1M context requests (>200K tokens) have separate limits

**Can run 40+ parallel:** Only at Tier 2+ (requires $40 deposit and 7-day wait)

---

### Google (Gemini)

**Rate Limit Structure:** RPM, TPM, RPD (requests/day)

| Tier | Model | RPM | TPM | RPD |
|------|-------|-----|-----|-----|
| Free | Gemini 2.5 Pro | 5 | 250K | 100 |
| Free | Gemini 2.5 Flash | 10 | 250K | 250 |
| Free | Gemini 2.5 Flash-Lite | 15 | 250K | 1,000 |
| Paid Tier 1 | All models | Higher | Higher | Higher |
| Paid Tier 2 | All models | Much higher | Much higher | Much higher |

**Notes:**
- Free tier adjusted December 2025 (more restrictive)
- Paid Tier 1 activates immediately upon billing setup
- Tier 2 requires $250 spend + 30 days
- Check limits at: https://aistudio.google.com/usage
- Quotas reset at midnight Pacific time

**Can run 40+ parallel:** Not on free tier. Paid tier required.

---

### xAI (Grok)

**Rate Limit Structure:** RPM, TPM

| Model | RPM | TPM | Context |
|-------|-----|-----|---------|
| Grok 4 | 480 | 2M | 256K |
| Grok 4 Fast | 480 | 4M | 2M |
| Grok 3 | 480 | 2M | 131K |
| Grok 3 Mini Fast | 480 | 4M | 131K |

**Notes:**
- Very generous limits compared to competitors
- Check your team limits at: https://console.x.ai
- Headers include `x-ratelimit-remaining-requests`

**Can run 40+ parallel:** Yes, easily. 480 RPM is very generous.

---

### DeepSeek

**Rate Limit Structure:** No explicit limits

**Policy:** DeepSeek does NOT enforce hard rate limits. Instead:
- High load causes responses to slow down (not reject)
- HTTP connections stay open with keep-alive signals
- Requests timeout after 30 minutes if still processing

**Practical Limits:**
- Theoretically unlimited parallel requests
- Effective throughput limited by response latency under load
- During peak hours, expect slower responses

**Notes:**
- Best to implement client-side concurrency control
- Monitor response latency as your "soft limit" indicator
- Dynamic throttling based on real-time traffic

**Can run 40+ parallel:** Yes, but expect latency increases under load.

---

### Mistral

**Rate Limit Structure:** RPS (requests/second), TPM, monthly tokens

| Tier | RPS | TPM | Monthly Tokens |
|------|-----|-----|----------------|
| Free | ~1 | 500K | 1M |
| Paid (varies) | Higher | Higher | Higher |
| Azure-hosted | ~17 | 200K | N/A |

**Notes:**
- Free tier intended for evaluation only
- Limits set at workspace level
- Check limits at: https://admin.mistral.ai/plateforme/limits
- Contact support for production increases

**Can run 40+ parallel:** Not on free tier. Paid tier required.

---

## Current System Settings

Located in database `llm_providers` table:

| Provider | max_parallel_requests | requests_per_minute |
|----------|----------------------|---------------------|
| OpenAI | 8 | 60 |
| Anthropic | 8 | 40 |
| Google | 8 | 30 |
| xAI | 8 | 30 |
| DeepSeek | 8 | 30 |
| Mistral | 8 | 30 |

## Recommended Changes

### Conservative (current tier unknown)
Keep current settings. Safe for all tiers.

### Aggressive (confirmed higher tiers)

```sql
-- OpenAI (if Tier 3+)
UPDATE llm_providers SET max_parallel_requests = 50, requests_per_minute = 300
WHERE name = 'openai';

-- Anthropic (if Tier 2+)
UPDATE llm_providers SET max_parallel_requests = 40, requests_per_minute = 200
WHERE name = 'anthropic';

-- xAI (safe for all)
UPDATE llm_providers SET max_parallel_requests = 50, requests_per_minute = 400
WHERE name = 'xai';

-- DeepSeek (safe, but monitor latency)
UPDATE llm_providers SET max_parallel_requests = 50, requests_per_minute = 300
WHERE name = 'deepseek';

-- Google (if paid tier)
UPDATE llm_providers SET max_parallel_requests = 30, requests_per_minute = 150
WHERE name = 'google';

-- Mistral (if paid tier)
UPDATE llm_providers SET max_parallel_requests = 20, requests_per_minute = 100
WHERE name = 'mistral';
```

## Action Items

- [ ] Check OpenAI account tier at platform.openai.com
- [ ] Check Anthropic account tier in Claude Console
- [ ] Enable billing on Google Cloud for Gemini
- [ ] Check Mistral workspace limits
- [ ] Update provider settings based on confirmed tiers
- [ ] Implement adaptive rate limiting based on 429 responses

## References

- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)
- [Anthropic Rate Limits](https://docs.claude.com/en/api/rate-limits)
- [Google Gemini Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [xAI Consumption Limits](https://docs.x.ai/docs/key-information/consumption-and-rate-limits)
- [DeepSeek Rate Limits](https://api-docs.deepseek.com/quick_start/rate_limit)
- [Mistral Rate Limits](https://docs.mistral.ai/deployment/ai-studio/tier)
