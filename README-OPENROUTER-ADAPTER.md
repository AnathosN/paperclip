# OpenRouter Adapter for Paperclip v2026.428.0

Paperclip v2026.428.0 compatibility port of the OpenRouter adapter.

Based on: https://github.com/talhamahmood666/paperclip-adapter-openrouter
Original author: Talha Mahmood
Original license: MIT

Verified locally: OpenRouter adapter appears in UI, environment check passes, issue comment OK is posted, issue status changes from in_progress to done.

Observed test: openrouter/openai/o4-mini, succeeded, approx. 11s, approx. USD 0.0048.

Limitations: transcript parser is temporarily neutralized; server execute was simplified to direct OpenRouter Chat Completions; original tool-calling/hiring/approval tools are not fully ported yet.

Runtime note: set OPENROUTER_API_KEY and use PAPERCLIP_API_URL=http://localhost:3100 when the adapter runs inside the Paperclip container.
