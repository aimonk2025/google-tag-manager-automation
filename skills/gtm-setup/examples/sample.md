# GTM Setup - Example Output

This shows the expected output when you invoke `/gtm-setup` to configure GTM API access.

---

## Example Invocation

```
/gtm-setup
```

or naturally:

```
Set up GTM API access
Configure my GTM credentials
Help me install googleapis for GTM
```

---

## Example Console Output

```
=== GTM API Setup ===

--- Phase 1: Prerequisites Check ---
✓ Node.js v20.11.0 detected
✓ npm v10.2.4 detected
✓ package.json found at project root
✗ googleapis not installed

--- Phase 2: Installing googleapis ---
Running: npm install googleapis
✓ googleapis@144.0.0 installed

--- Phase 3: Google Cloud Project Setup ---

To set up OAuth credentials, follow these steps:

1. Go to: https://console.cloud.google.com
2. Create a new project (or select existing)
3. Enable the Tag Manager API:
   → APIs & Services > Library > Search "Tag Manager API" > Enable
4. Create OAuth credentials:
   → APIs & Services > Credentials > Create Credentials > OAuth 2.0 Client ID
   → Application type: Desktop app
   → Download the JSON file

Please paste your OAuth client credentials JSON content:
[User provides credentials JSON]

✓ Credentials saved to: gtm-credentials.json
✓ Added to .gitignore (never commit credentials)

--- Phase 4: GTM Account & Container ---

What is your GTM Account ID?
[User: 123456789]

What is your GTM Container ID?
[User: GTM-XXXXXXX]

✓ Config saved to: gtm-config.json

--- Phase 5: OAuth Authorization ---

Open this URL in your browser to authorize:
https://accounts.google.com/o/oauth2/auth?...

Paste the authorization code:
[User: 4/0AX4XfWh...]

✓ Tokens saved to: gtm-token.json
✓ Added to .gitignore

--- Phase 6: Connection Test ---
Testing GTM API connection...
✓ Connected to GTM Account: My Company (123456789)
✓ Container found: My Website (GTM-XXXXXXX)
✓ Permissions verified: read + write

=== Setup Complete ===
GTM API is configured and ready.
→ Next: Invoke gtm-implementation to start creating tags and triggers
```

---

## Files Created

| File | Purpose |
|------|---------|
| `gtm-credentials.json` | OAuth client credentials (never commit) |
| `gtm-token.json` | OAuth access/refresh tokens (never commit) |
| `gtm-config.json` | Account and container IDs (safe to commit) |

## Security Reminder

`gtm-credentials.json` and `gtm-token.json` are automatically added to `.gitignore`. Never commit these files to version control.
