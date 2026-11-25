# Costs

Model: Claude Sonnet 5.5 (`claude-sonnet-5-5`). Prices from https://platform.claude.com/docs/en/about-claude/pricing, read 2026-11-25, USD per million tokens (MTok):

| Base input | 5-min cache write | Cache read | Output |
|---|---|---|---|
| $2 | $2.50 (1 h: $4) | $0.10 | $10 |

Est. cost = (Input × 2 + Cache write × 4 + Cache read × 0.10 + Output × 10) / 1,000,000.

Numbers come from the usage records in the session log (`~/.claude/projects/.../*.jsonl`, main session and `subagents/`), one record per API request, de-duplicated by request id. A story row is its sub-agent plus the main-session requests between the story start and its end. `# Messages` counts API requests (assistant turns). Duration is wall-clock.

| Story | Duration | # Messages | Input tokens | Cache write | Cache read | Output tokens | Est. cost USD |
|-------|----------|------------|--------------|-------------|------------|---------------|---------------|
| Interview and plan (main session, incl. pricing sub-agent) | 47 min | 94 | 188 | 162,186 | 10,545,741 | 49,568 | $2.20 |
| S01 | 4 min | 25 | 50 | 88,519 | 1,891,966 | 16,094 | $0.70 |
| S02 | 2 min | 19 | 38 | 58,269 | 1,378,254 | 12,697 | $0.50 |
| S03 | 3 min | 20 | 40 | 64,464 | 1,460,666 | 16,515 | $0.57 |
| S04 | 3 min | 19 | 38 | 57,789 | 1,337,661 | 15,807 | $0.52 |
| S05 | 8 min | 36 | 72 | 105,676 | 3,393,624 | 28,562 | $1.05 |
| S06 | 6 min | 14 | 28 | 56,927 | 1,044,669 | 12,617 | $0.46 |
| S07 | 15 min | 38 | 76 | 127,038 | 3,928,429 | 38,335 | $1.28 |
| S08 | 8 min | 28 | 56 | 71,666 | 2,154,320 | 18,024 | $0.68 |
| S09 | 11 min | 25 | 52 | 89,696 | 2,370,870 | 21,119 | $0.81 |
| S10 | 12 min | 31 | 62 | 75,229 | 2,432,764 | 18,004 | $0.72 |
| S11 | 5 min | 27 | 54 | 86,233 | 2,335,041 | 22,187 | $0.80 |
| S12 | 2 min | 18 | 36 | 51,729 | 1,313,312 | 11,438 | $0.45 |
| S13 | 1 min | 11 | 22 | 36,960 | 827,741 | 6,823 | $0.30 |
| S14 | 2 min | 17 | 34 | 58,819 | 1,303,357 | 12,183 | $0.49 |
| S15 | 9 min | 64 | 134 | 129,335 | 7,268,268 | 33,180 | $1.58 |
| S16 | 3 min | 18 | 36 | 66,787 | 1,483,011 | 16,600 | $0.58 |
| S17 | 5 min | 24 | 48 | 70,611 | 1,944,762 | 18,416 | $0.66 |
| S18 | 6 min | 29 | 58 | 91,044 | 2,690,535 | 23,208 | $0.87 |
| S19 | 4 min | 18 | 36 | 63,298 | 1,438,493 | 10,478 | $0.50 |
| S20 | 3 min | 18 | 36 | 54,079 | 1,406,441 | 9,318 | $0.45 |
