# Getting Started with GTM Automation

A quick guide to automate Google Tag Manager implementation in your project.

## Installation

```bash
# Clone the plugin
git clone https://github.com/aimonk2025/google-tag-manager-automation.git

# Copy skills to your project
cp -r google-tag-manager-automation/skills your-project/.claude/
```

## Quick Start Scenarios

### Scenario 1: "I have no tracking and want to add it"

Start from the beginning:

```
1. "Run gtm-analytics-audit"     - Scans your codebase for trackable elements
2. "Run gtm-dom-standardization" - Cleans up IDs and classes for tracking
3. "Run gtm-strategy"            - Creates a tracking plan
4. "Run gtm-setup"               - Configures GTM API access
5. "Run gtm-implementation"      - Adds dataLayer events and GTM tags
6. "Run gtm-testing"             - Validates everything works
7. "Run gtm-reporting"           - Generates documentation
```

### Scenario 2: "I have GTM set up but need to add tracking"

Skip the setup steps:

```
1. "Run gtm-analytics-audit"     - Find what needs tracking
2. "Run gtm-strategy"            - Plan your events
3. "Run gtm-implementation"      - Add the tracking code
4. "Run gtm-testing"             - Validate it works
```

### Scenario 3: "I just need to audit my current tracking"

Run a single skill:

```
"Run gtm-analytics-audit"
```

### Scenario 4: "I need to document existing tracking"

```
"Run gtm-reporting"
```

### Scenario 5: "My DOM is messy and needs cleanup for analytics"

```
1. "Run gtm-analytics-audit"     - Identify elements
2. "Run gtm-dom-standardization" - Apply consistent naming
```

## Skill Reference

| Skill | What It Does | When to Use |
|-------|--------------|-------------|
| gtm-analytics-audit | Scans for buttons, links, forms | First step for any project |
| gtm-dom-standardization | Standardizes IDs and classes | When element naming is inconsistent |
| gtm-strategy | Creates tracking plan with priorities | Before implementing tracking |
| gtm-setup | Configures GTM API credentials | When you need API access |
| gtm-implementation | Adds dataLayer code and GTM tags | Ready to implement tracking |
| gtm-testing | Validates in console, GTM Preview, GA4 | After implementation |
| gtm-reporting | Generates docs and summaries | Final step or for documentation |

## Example Commands

```
"Run gtm-analytics-audit on my codebase"
"Help me with gtm-strategy for my SaaS app"
"Use gtm-implementation to track my signup form"
"Run gtm-testing to validate my tracking"
```

## Supported Frameworks

- Next.js (App Router and Pages Router)
- React
- Vue
- Vanilla JavaScript/HTML

## Requirements

- Claude Code CLI
- Node.js project
- Google Cloud project with GTM API enabled (for gtm-setup)
- GTM container access
