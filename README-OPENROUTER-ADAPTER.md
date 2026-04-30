# OpenRouter Adapter for Paperclip v2026.428.0

This branch integrates an OpenRouter adapter into Paperclip v2026.428.0 as an in-tree workspace adapter.

## Origin and attribution

This work is based on the MIT-licensed adapter originally published here:

https://github.com/talhamahmood666/paperclip-adapter-openrouter

Original author: Talha Mahmood  
Original license: MIT

The adapter was adapted for the Paperclip v2026.428.0 monorepo build and tested in a Docker-based Paperclip installation.

## Current status

Verified working:

- OpenRouter adapter appears in the Paperclip UI.
- OpenRouter environment check passes.
- Paperclip issues are read correctly.
- Issue instructions are prioritized over wake/session context.
- Agent comments are posted through Paperclip tools.
- Issue status updates work.
- Transcript entries render in the run viewer.
- Token usage and cost are returned to Paperclip.
- OpenRouter function/tool calling works.
- Sub-issues can be created.
- Approvals can be created.
- Hiring approval flow works; after human approval, the new agent is created.

## Verified tools

The following tools were tested successfully:

- get_issue
- list_comments
- list_issues
- list_agents
- add_comment
- update_issue_status
- create_sub_issue
- request_approval
- hire_agent via approval

## Tested model

The main smoke tests used:

openai/o4-mini

Paperclip may display this in the run header as:

openrouter/openai/o4-mini

Inside the adapter and OpenRouter request, the normalized model is:

openai/o4-mini

## Runtime configuration

Required environment variable:

OPENROUTER_API_KEY

Recommended when the adapter runs inside the same Paperclip container:

PAPERCLIP_API_URL=http://localhost:3100

This avoids internal hostname allowlist issues when the adapter calls the Paperclip API.

## Build

From the Paperclip repository root:

pnpm install
pnpm -r build
docker build -t paperclip-openrouter-test:2026.428.0 .

## Production note

This branch is currently a Paperclip monorepo integration, not a standalone npm package or drop-in external adapter.

For production use, build Paperclip from this branch and deploy the resulting Docker image with:

- OPENROUTER_API_KEY set
- PAPERCLIP_AGENT_JWT_SECRET set
- PAPERCLIP_API_URL=http://localhost:3100
- existing production DATABASE_URL
- existing production PAPERCLIP_HOME volume

## Known limitations

- This is not yet packaged as a standalone Paperclip external adapter.
- Generic arbitrary approval payloads are supported, but common smoke-test fields are exposed explicitly as payload_test and payload_source to improve model reliability.
- Further hardening is recommended before upstream PR submission, especially around type coverage, automated tests, and model-specific tool-call behavior.
