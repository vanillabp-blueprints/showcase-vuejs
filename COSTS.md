# Costs

Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`). Prices from https://platform.claude.com/docs/en/about-claude/pricing, read 2026-11-25, USD per million tokens (MTok):

| Base input | 5-min cache write | Cache read | Output |
|---|---|---|---|
| $2 | $2.50 | $0.10 | $10 |

Est. cost = (Input × 2 + Cache write × 2.50 + Cache read × 0.10 + Output × 10) / 1,000,000. Cache writes are counted at the 5-minute price.

The harness does not show the main session's token counters to the agent. Sub-agents report one total (`subagent_tokens`) only. Where a column says `n/a`, the number was not available and no value is invented.

| Story | Duration | # Messages | Input tokens | Cache write | Cache read | Output tokens | Est. cost USD |
|-------|----------|------------|--------------|-------------|------------|---------------|---------------|
| Interview and plan (no story, main session) | ~35 min | ~150 | n/a | n/a | n/a | n/a | n/a |
