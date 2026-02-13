# Google Tag Manager Automation Plugin

A comprehensive GTM automation toolkit for Claude Code that streamlines analytics implementation from audit to reporting.

## Overview

This plugin provides 7 specialized skills that guide you through the complete GTM implementation lifecycle:

| Skill | Purpose |
|-------|---------|
| **gtm-analytics-audit** | Scan codebase for trackable elements and assess analytics readiness |
| **gtm-dom-standardization** | Standardize IDs and CSS classes for clean analytics tracking |
| **gtm-strategy** | Plan tracking strategy with business context and event taxonomy |
| **gtm-setup** | Configure GTM API access with OAuth credentials |
| **gtm-implementation** | Implement dataLayer events and create GTM configs via API |
| **gtm-testing** | Validate tracking across browser console, GTM Preview, and GA4 DebugView |
| **gtm-reporting** | Generate documentation and analyze reporting impact |

## Installation

### Option 1: Clone and Add to Workspace

1. Clone the repository:
```bash
git clone https://github.com/aimonk2025/google-tag-manager-automation.git
```

2. Copy the `skills` folder to your project's `.claude` directory:
```bash
# Navigate to your project
cd your-project

# Create .claude directory if it doesn't exist
mkdir -p .claude

# Copy the skills
cp -r path/to/google-tag-manager-automation/skills .claude/
```

Your project structure should look like:
```
your-project/
├── .claude/
│   └── skills/
│       ├── gtm-analytics-audit/
│       ├── gtm-dom-standardization/
│       ├── gtm-strategy/
│       ├── gtm-setup/
│       ├── gtm-implementation/
│       ├── gtm-testing/
│       └── gtm-reporting/
├── src/
└── ...
```

### Option 2: Claude Plugin Marketplace

```bash
/plugin marketplace add aimonk2025/google-tag-manager-automation
```

### Option 3: Local Plugin Directory

```bash
claude --plugin-dir "path/to/google-tag-manager-automation"
```

## Usage

Once installed, invoke skills by name when working with Claude Code:

```
"Run gtm-analytics-audit on my codebase"
"Help me standardize DOM for analytics"
"Create a GTM tracking strategy"
"Set up GTM API access"
"Implement tracking for my CTAs"
"Test my GTM implementation"
"Generate tracking documentation"
```

## Skill Workflow

The skills are designed to be used in sequence:

```
1. gtm-analytics-audit     Scan codebase, identify trackable elements
         |
         v
2. gtm-dom-standardization Standardize IDs/classes for tracking
         |
         v
3. gtm-strategy            Plan events, parameters, priorities
         |
         v
4. gtm-setup               Configure GTM API credentials
         |
         v
5. gtm-implementation      Add dataLayer events + create GTM configs
         |
         v
6. gtm-testing             Validate across 3 tiers
         |
         v
7. gtm-reporting           Generate docs and stakeholder summaries
```

## Skill Details

### gtm-analytics-audit

Conducts a comprehensive analytics audit of your codebase:

- Detects framework (React, Next.js, Vue)
- Scans for clickable elements (buttons, links, forms)
- Categorizes elements by purpose (CTA, navigation, form, media)
- Analyzes existing tracking implementation
- Generates `audit-report.json` with findings

**Trigger phrases**: "audit my analytics", "scan for trackable elements", "what can I track"

### gtm-dom-standardization

Standardizes DOM identifiers for analytics:

- Applies consistent ID naming: `{category}_{location}_{descriptor}`
- Adds analytics classes: `js-track js-{category} js-{action} js-{location}`
- Preserves existing visual styling classes
- Framework-aware (className for React, :class for Vue)

**Trigger phrases**: "standardize analytics classes", "prepare DOM for GTM", "clean up tracking IDs"

### gtm-strategy

Creates strategic tracking plans:

- Proactively scans codebase before asking questions
- Maps elements to events with parameters
- Prioritizes events (P0/P1/P2) based on business impact
- Generates `gtm-tracking-plan.json`

**Trigger phrases**: "plan GTM tracking", "what should I track", "create tracking plan"

### gtm-setup

Automates GTM API configuration:

- Installs googleapis package
- Guides OAuth credential creation
- Handles token management
- Validates API connection

**Trigger phrases**: "set up GTM API", "configure GTM access", "get GTM credentials"

### gtm-implementation

Implements complete tracking:

- Adds `dataLayer.push()` calls to components
- Creates GTM variables, triggers, and tags via API
- Supports incremental updates
- Framework-specific patterns (Next.js, React, Vue)

**Trigger phrases**: "implement GTM tracking", "add dataLayer events", "create GTM tags"

### gtm-testing

Validates tracking implementation:

- **Tier 1**: Browser console (dataLayer verification)
- **Tier 2**: GTM Preview mode (tag firing)
- **Tier 3**: GA4 DebugView (end-to-end)

**Trigger phrases**: "test GTM tracking", "validate dataLayer", "debug GTM"

### gtm-reporting

Generates documentation and impact analysis:

- Technical event schema documentation
- Implementation summary
- GA4 report configurations
- Remarketing audience definitions
- Executive summary for stakeholders

**Trigger phrases**: "document GTM implementation", "what reports can I build", "create stakeholder summary"

## Naming Conventions

### Element IDs
```
{category}_{location}_{descriptor}

Examples:
cta_hero_get_started
nav_header_pricing
form_footer_newsletter
```

### CSS Classes
```
js-track js-{category} js-{action} js-{location}

Examples:
js-track js-cta js-click js-hero
js-track js-nav js-click js-header
js-track js-form js-submit js-footer
```

## File Structure

```
google-tag-manager-automation/
├── .claude-plugin/
│   └── plugin.json
└── skills/
    ├── gtm-analytics-audit/
    │   ├── SKILL.md
    │   └── references/
    │       └── naming-conventions.md
    ├── gtm-dom-standardization/
    │   ├── SKILL.md
    │   └── references/
    │       └── element-patterns.md
    ├── gtm-strategy/
    │   └── SKILL.md
    ├── gtm-setup/
    │   ├── SKILL.md
    │   ├── scripts/
    │   │   ├── install-googleapis.js
    │   │   ├── oauth-authorize.js
    │   │   ├── test-connection.js
    │   │   └── validate-prerequisites.js
    │   └── references/
    │       └── google-cloud-setup.md
    ├── gtm-implementation/
    │   ├── SKILL.md
    │   ├── references/
    │   │   ├── datalayer-patterns.md
    │   │   └── event-taxonomies.md
    │   └── assets/templates/
    │       └── saas.json
    ├── gtm-testing/
    │   └── SKILL.md
    └── gtm-reporting/
        └── SKILL.md
```

## Requirements

- Claude Code CLI
- Node.js project (for gtm-setup)
- Google Cloud project with GTM API enabled (for API-based implementation)
- GTM container access

## Supported Frameworks

- Next.js (App Router & Pages Router)
- React
- Vue
- Vanilla JavaScript/HTML

## Output Files

The skills generate several output files:

| File | Generated By | Purpose |
|------|--------------|---------|
| `audit-report.json` | gtm-analytics-audit | Audit findings |
| `gtm-tracking-plan.json` | gtm-strategy | Event specifications |
| `gtm-credentials.json` | gtm-setup | OAuth credentials |
| `gtm-token.json` | gtm-setup | Access token (gitignore!) |
| `gtm-config.json` | gtm-setup | GTM account/container config |
| `gtm-event-schema.md` | gtm-reporting | Technical documentation |
| `gtm-executive-summary.md` | gtm-reporting | Stakeholder summary |

## Security Notes

- Add `gtm-token.json` to `.gitignore` (contains sensitive tokens)
- OAuth credentials are for Desktop app type (safe to commit but not recommended)
- Tokens expire after 1 hour but auto-refresh via googleapis

## Contributing

Contributions welcome! Please submit issues and pull requests to:
https://github.com/aimonk2025/google-tag-manager-automation

## License

MIT

## Author

aimonk2025
