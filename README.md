# Google Tag Manager Automation Engine

A local web application that runs AI-powered skills sequentially via the Claude Code CLI to guide developers through a complete Google Tag Manager implementation on any local codebase.

No API keys. No cloud. Runs entirely on your machine using your existing Claude Code subscription.

---

## What it does

Google Tag Manager Automation Engine walks you through a 6-step GTM instrumentation pipeline:

1. **Audit** - Scans your codebase for all trackable elements (buttons, links, forms, CTAs)
2. **Prepare Elements** - Adds consistent IDs and data attributes for reliable tracking
3. **Strategy** - Creates a prioritized event tracking plan (P0/P1/P2 events). Requires inline approval before Implementation unlocks.
4. **Implementation** - Adds dataLayer pushes and creates GTM tags, triggers, variables
5. **Testing** - Validates tracking across 3 tiers: code, dataLayer, and GTM
6. **Reporting** - Generates documentation and implementation summary

Each step runs Claude Code CLI as a subprocess with a specialized SKILL.md system prompt. Context from previous steps is automatically passed forward so Claude understands the full picture at each stage.

---

## Requirements

- [Claude Code CLI](https://claude.ai/code) installed and authenticated (`claude --version`)
- Node.js 20+
- **Mac/Linux:** [gtm-cli](https://github.com/owntag/gtm-cli) for GTM container operations (`npm install -g @owntag/gtm-cli`)
- **Windows:** A Google Cloud OAuth app (Client ID + Client Secret) for GTM API access via googleapis

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/aimonk2025/google-tag-manager-automation.git
cd google-tag-manager-automation

# Install all dependencies
npm run install:all

# Start the app
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## How it works

```
Browser (React + Vite :5173)
    |
    | HTTP + SSE
    v
Express Server (:4242)
    |
    | spawn subprocess
    v
claude --print --output-format stream-json --verbose --append-system-prompt <SKILL.md>
    |
    | reads/writes
    v
Your local codebase (any path you configure)
```

The frontend connects to the Express backend over a Vite proxy. When you click "Run" on any skill screen, the backend spawns the `claude` CLI with the relevant `SKILL.md` as a system prompt, streams the output back via Server-Sent Events, and saves the Claude session ID to SQLite so conversations can be resumed.

---

## GTM Authentication

### Mac / Linux
Uses `@owntag/gtm-cli`. Install it, then click "Login with Google" on the Setup page.

### Windows
`@owntag/gtm-cli` is not supported on Windows. Instead:

1. Create a Google Cloud OAuth app and note your Client ID and Client Secret
2. On the Setup page, enter your Client ID and Client Secret
3. Click "Login with Google" - Google opens in your browser
4. After signing in, Google redirects to `localhost:4242/api/gtm/oauth-callback?code=...`
5. Copy that full URL from your browser address bar and paste it into the field on the Setup page
6. Click Submit - tokens are saved to the local DB

Client ID and Client Secret are saved to the DB and pre-filled on every visit. You only need to enter them once. Tokens (access + refresh) are stored locally and reused automatically.

---

## Project Structure

```
google-tag-manager-automation/
├── app/                    Frontend (React 18 + Vite 5 + Tailwind CSS)
│   └── src/
│       ├── context/        SessionContext - shared state across all screens
│       ├── components/     Layout, ActivityFeed, modals, ApprovalPanel
│       ├── pages/          One file per screen
│       ├── hooks/          useSkillRun (SSE), useGtmStatus, useSessionHistory
│       ├── lib/            api.ts, utils.ts, constants.ts
│       └── types/          session.ts
├── server/                 Backend (Express 4 + Node.js + SQLite)
│   ├── src/
│   │   ├── routes/         session, skill, files, gtm
│   │   ├── execute.ts      Claude CLI subprocess spawner + SSE streamer
│   │   ├── session.ts      Session persistence (SQLite)
│   │   ├── crypto.ts       AES-256-GCM encryption (disabled by default)
│   │   └── db.ts           SQLite schema and connection
│   └── skills/             System prompts for each pipeline step
│       ├── gtm-analytics-audit/SKILL.md
│       ├── gtm-dom-standardization/SKILL.md
│       ├── gtm-strategy/SKILL.md
│       ├── gtm-implementation/SKILL.md
│       ├── gtm-testing/SKILL.md
│       └── gtm-reporting/SKILL.md
└── docs/                   Design system and reference docs
```

---

## Development

```bash
npm run dev          # Start both servers concurrently
npm run dev:server   # Backend only (port 4242)
npm run dev:app      # Frontend only (port 5173)
```

Backend API is at `http://localhost:4242/api`. Frontend proxies `/api` requests to the backend automatically.

---

## Session Persistence

Active session state is stored in SQLite (`gtm-engine.db`). Your session survives server restarts. The DB is git-ignored.

---

## Open Source

MIT License. Built for personal use and open sourced for the community.
