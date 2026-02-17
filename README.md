# Google Tag Manager Automation Skills

A comprehensive GTM automation toolkit for Claude Code that streamlines analytics implementation from audit to reporting.

## Overview

7 specialized skills that guide you through the complete GTM implementation lifecycle:

| Skill | Purpose |
|-------|---------|
| **gtm-analytics-audit** | Scan codebase for trackable elements and assess analytics readiness |
| **gtm-dom-standardization** | Standardize IDs and CSS classes for clean analytics tracking |
| **gtm-strategy** | Plan tracking strategy with business context and event taxonomy |
| **gtm-setup** | Configure GTM API access with OAuth credentials |
| **gtm-implementation** | Implement dataLayer events and create GTM configs via API |
| **gtm-testing** | Validate tracking with automated Playwright tests and manual tiers |
| **gtm-reporting** | Generate documentation and analyze reporting impact |

## Installation

### Option 1: npx (recommended)

```bash
# Install all 7 skills
npx skills add aimonk2025/google-tag-manager-automation

# Install specific skills only
npx skills add aimonk2025/google-tag-manager-automation --skill gtm-analytics-audit gtm-strategy

# List available skills before installing
npx skills add aimonk2025/google-tag-manager-automation --list
```

Skills are installed into your `~/.claude/skills/` directory and available across all your projects.

### Option 2: Manual copy

```bash
git clone https://github.com/aimonk2025/google-tag-manager-automation.git

# Copy skills to your personal Claude skills directory
cp -r google-tag-manager-automation/skills/* ~/.claude/skills/

# Or copy to a specific project only
mkdir -p your-project/.claude/skills
cp -r google-tag-manager-automation/skills/* your-project/.claude/skills/
```

## Usage

Invoke skills directly or let Claude load them automatically when relevant:

```
/gtm-analytics-audit
/gtm-dom-standardization
/gtm-strategy
/gtm-setup
/gtm-implementation
/gtm-testing
/gtm-reporting
```

Or use natural language:

```
"Audit my site for tracking opportunities"
"Standardize DOM for GTM tracking"
"Create a tracking plan for my SaaS"
"Set up GTM API access"
"Implement the tracking plan"
"Test my GTM events"
"Generate documentation for stakeholders"
```

## Skill Workflow

The skills are designed to run in sequence, with each skill's output feeding the next:

```
1. gtm-analytics-audit       Scan codebase, identify trackable elements
         |                   Output: audit-report.json
         v
2. gtm-dom-standardization   Standardize IDs/classes for tracking
         |                   Output: modified source files
         v
3. gtm-strategy              Plan events, parameters, priorities
         |                   Output: gtm-tracking-plan.json
         v
4. gtm-setup                 Configure GTM API credentials
         |                   Output: gtm-credentials.json, gtm-token.json, gtm-config.json
         v
5. gtm-implementation        Add dataLayer events + create GTM configs via API
         |                   Output: modified source files, GTM container version
         v
6. gtm-testing               Validate across 4 tiers (Playwright + manual)
         |                   Output: test results
         v
7. gtm-reporting             Generate docs and stakeholder summaries
                             Output: docs/ folder with 5 documentation files
```

> Skills do not share context automatically. Each skill starts fresh. The output files (audit-report.json, gtm-tracking-plan.json, etc.) are how context passes between skills - Claude reads these files when the next skill runs.

## Skill Details

### gtm-analytics-audit

Conducts a comprehensive analytics audit of your codebase:

- Detects framework (React, Next.js, Vue)
- Scans for clickable elements (buttons, links, forms, media)
- Categorizes elements by purpose (CTA, navigation, form, media, outbound)
- Analyzes existing tracking implementation and coverage
- Generates `audit-report.json` with findings and recommendations

**Trigger phrases**: "audit my analytics", "scan for trackable elements", "what can I track"

### gtm-dom-standardization

Standardizes DOM identifiers across the codebase:

- Applies consistent ID naming: `{category}_{location}_{descriptor}`
- Adds analytics classes: `js-track js-{category} js-{action} js-{location}`
- Preserves all existing visual styling classes
- Framework-aware (className for React/Next.js, :class for Vue)

**Trigger phrases**: "standardize analytics classes", "prepare DOM for GTM", "clean up tracking IDs"

### gtm-strategy

Creates strategic tracking plans:

- Proactively scans codebase before asking questions
- Maps discovered elements to GA4 events with parameters
- Prioritizes events (P0/P1/P2) based on business impact
- Asks business context questions to validate tracking decisions
- Generates `gtm-tracking-plan.json`

**Trigger phrases**: "plan GTM tracking", "what should I track", "create tracking plan"

### gtm-setup

Automates GTM API configuration:

- Installs googleapis package
- Guides OAuth credential creation step-by-step
- Handles token management and .gitignore updates
- Validates API connection and permissions

**Trigger phrases**: "set up GTM API", "configure GTM access", "get GTM credentials"

### gtm-implementation

Implements complete tracking end-to-end:

- Adds `dataLayer.push()` calls to components (reads from gtm-tracking-plan.json)
- Creates GTM Data Layer Variables, Custom Event Triggers, and GA4 Event Tags via API
- Creates a new versioned GTM container
- Framework-specific patterns (Next.js App Router requires 'use client', Vue uses @click)

**Trigger phrases**: "implement GTM tracking", "add dataLayer events", "create GTM tags"

### gtm-testing

Validates tracking implementation across 4 tiers:

- **Tier 0 (Automated)**: Playwright headless tests - runs without opening a browser
- **Tier 1 (Manual)**: Browser console dataLayer verification
- **Tier 2 (Manual)**: GTM Preview mode - confirms tags fire
- **Tier 3 (Manual)**: GA4 DebugView - confirms events reach GA4

Always starts with Tier 0. Falls back to manual tiers for GTM container and GA4 validation.

**Trigger phrases**: "test GTM tracking", "validate dataLayer", "debug GTM", "run automated tracking tests"

### gtm-reporting

Generates documentation and impact analysis:

- Technical event schema documentation
- Implementation summary
- GA4 report configurations and dashboard specs
- Remarketing audience definitions
- Executive summary (non-technical, ROI-focused) for stakeholders

**Trigger phrases**: "document GTM implementation", "what reports can I build", "create stakeholder summary"

## Naming Conventions

### Element IDs

```
{category}_{location}_{descriptor}

cta_hero_get_started
nav_header_pricing
form_footer_newsletter
video_hero_product_demo
outbound_footer_twitter
```

### CSS Classes

```
js-track js-{category} js-{action} js-{location}

js-track js-cta js-click js-hero
js-track js-nav js-click js-header
js-track js-form js-submit js-footer
js-track js-media js-play js-hero
```

## File Structure

```
google-tag-manager-automation/
└── skills/
    ├── gtm-analytics-audit/
    │   ├── SKILL.md
    │   ├── examples/
    │   │   └── sample.md
    │   └── references/
    │       └── naming-conventions.md
    ├── gtm-dom-standardization/
    │   ├── SKILL.md
    │   ├── examples/
    │   │   └── sample.md
    │   └── references/
    │       └── element-patterns.md
    ├── gtm-strategy/
    │   ├── SKILL.md
    │   ├── template.md
    │   └── examples/
    │       └── sample.md
    ├── gtm-setup/
    │   ├── SKILL.md
    │   ├── examples/
    │   │   └── sample.md
    │   ├── scripts/
    │   │   ├── install-googleapis.js
    │   │   ├── oauth-authorize.js
    │   │   ├── test-connection.js
    │   │   └── validate-prerequisites.js
    │   └── references/
    │       └── google-cloud-setup.md
    ├── gtm-implementation/
    │   ├── SKILL.md
    │   ├── template.md
    │   ├── examples/
    │   │   └── sample.md
    │   ├── references/
    │   │   ├── datalayer-patterns.md
    │   │   └── event-taxonomies.md
    │   └── assets/templates/
    │       └── saas.json
    ├── gtm-testing/
    │   ├── SKILL.md
    │   └── examples/
    │       └── sample.md
    └── gtm-reporting/
        ├── SKILL.md
        ├── template.md
        └── examples/
            └── sample.md
```

## Supported Platforms

| Platform | Support | Notes |
|---------|---------|-------|
| Next.js (App Router) | Full | All 7 skills |
| Next.js (Pages Router) | Full | All 7 skills |
| React | Full | All 7 skills |
| Vue 3 | Full | All 7 skills |
| Vanilla JS / HTML | Full | All 7 skills |
| Shopify (custom theme) | Partial | gtm-strategy, gtm-setup, gtm-testing, gtm-reporting work fully. gtm-dom-standardization and gtm-implementation expect JSX/TSX syntax |
| WordPress (custom theme) | Partial | Same as Shopify - API and strategy skills work; code-writing skills need manual adaptation for PHP/Liquid templates |

## Requirements

- Claude Code CLI
- Node.js project (for gtm-setup and gtm-testing with Playwright)
- Google Cloud project with Tag Manager API enabled (for API-based implementation)
- GTM container access

## Output Files

| File | Generated By | Purpose |
|------|--------------|---------|
| `audit-report.json` | gtm-analytics-audit | Audit findings and recommendations |
| `gtm-tracking-plan.json` | gtm-strategy | Machine-readable event specifications |
| `gtm-credentials.json` | gtm-setup | OAuth client credentials |
| `gtm-token.json` | gtm-setup | Access/refresh tokens (add to .gitignore) |
| `gtm-config.json` | gtm-setup | GTM account and container IDs |
| `scripts/test-tracking.js` | gtm-testing | Playwright automated test script |
| `docs/event-schema.md` | gtm-reporting | Technical event parameter reference |
| `docs/implementation-summary.md` | gtm-reporting | Technical implementation notes |
| `docs/reporting-capabilities.md` | gtm-reporting | GA4 reports and dashboard specs |
| `docs/audience-definitions.md` | gtm-reporting | Remarketing audience criteria |
| `docs/executive-summary.md` | gtm-reporting | Non-technical stakeholder summary |

## Security Notes

- `gtm-token.json` is automatically added to `.gitignore` by gtm-setup - it contains sensitive tokens
- `gtm-credentials.json` contains your OAuth client secret - do not commit to public repos
- Tokens expire after 1 hour but auto-refresh via googleapis

## License

MIT

## Author

aimonk2025
