# Google Cloud Console Setup Guide

Step-by-step instructions for setting up OAuth credentials for GTM API access.

## Prerequisites

- Google account with access to Google Tag Manager
- GTM container already created

## Step 1: Create or Select Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click project dropdown in top navigation bar
3. Click "NEW PROJECT"
4. Enter project name: "GTM Automation" (or your preference)
5. Click "CREATE"
6. Wait for project creation (30-60 seconds)
7. Select the new project from the dropdown

**Direct link**: https://console.cloud.google.com/projectcreate

## Step 2: Enable Google Tag Manager API

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Tag Manager API"
3. Click on "Google Tag Manager API" in results
4. Click "ENABLE" button
5. Wait for API to be enabled (10-20 seconds)
6. You should see "API enabled" confirmation

**Direct link**: https://console.cloud.google.com/apis/library/tagmanager.googleapis.com

**Important**: Make sure you're in the correct project (check top navigation bar)

## Step 3: Create OAuth 2.0 Credentials

### 3.1: Access Credentials Page

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "CREATE CREDENTIALS" button at top
3. Select "OAuth client ID" from dropdown

**Direct link**: https://console.cloud.google.com/apis/credentials

### 3.2: Configure OAuth Consent Screen (First Time Only)

If prompted to configure consent screen:

1. Click "CONFIGURE CONSENT SCREEN"
2. Select "External" user type
3. Click "CREATE"

Fill in required fields:
- **App name**: GTM Automation Script
- **User support email**: (your email)
- **Developer contact email**: (your email)

Click "SAVE AND CONTINUE" through all steps (Scopes, Test users, Summary)

### 3.3: Create OAuth Client ID

1. Back at "Create OAuth client ID" screen
2. **Application type**: Select "Desktop app" (IMPORTANT!)
3. **Name**: GTM Automation Script
4. Click "CREATE"

### 3.4: Download Credentials

1. A dialog appears: "OAuth client created"
2. Click "DOWNLOAD JSON" button
3. Save file to your computer (default name: `client_secret_XXX.json`)

**Alternative**:
- Find your credential in the list on Credentials page
- Click download icon (⬇) on the right
- Save JSON file

## Step 4: Save Credentials in Your Project

### Option A: Rename and Move File

1. Rename downloaded file to `gtm-credentials.json`
2. Move to your project root directory

### Option B: Copy Content

1. Open downloaded JSON file in text editor
2. Copy entire contents
3. Create `gtm-credentials.json` in project root
4. Paste contents and save

### Verify File Structure

The `gtm-credentials.json` should look like:

```json
{
  "installed": {
    "client_id": "XXXXX.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "XXXXX",
    "redirect_uris": ["http://localhost"]
  }
}
```

**Key fields to verify**:
- `client_id`: Should end with `.apps.googleusercontent.com`
- `client_secret`: Random string
- `redirect_uris`: Should include `http://localhost` for Desktop app

## Step 5: Get GTM Account and Container IDs

### 5.1: Find Account ID

1. Go to [Google Tag Manager](https://tagmanager.google.com/)
2. Click "Admin" in top navigation
3. Account ID is shown at top of left column (10-digit number)
4. Example: `1234567890`

### 5.2: Find Container ID

1. In GTM Admin, select your container from list
2. Container ID shown at top (format: `GTM-XXXXXX`)
3. Example: `GTM-ABC1234`

### 5.3: Extract Numeric Container ID

The API requires numeric container ID, not the public ID:

**Method 1**: From container settings
1. Click on container name in GTM Admin
2. Container ID (numeric) shown under "Container ID"
3. Example: `12345678`

**Method 2**: From URL
1. Open container in GTM
2. Look at URL: `tagmanager.google.com/#/container/accounts/ACCOUNT_ID/containers/CONTAINER_ID/`
3. Last number is numeric container ID

## Step 6: Create GTM Configuration File

Create `gtm-config.json` in project root:

```json
{
  "accountId": "1234567890",
  "containerId": "12345678",
  "containerPublicId": "GTM-ABC1234",
  "workspaceId": "1"
}
```

**Field descriptions**:
- `accountId`: 10-digit account ID from Step 5.1
- `containerId`: Numeric container ID from Step 5.3
- `containerPublicId`: GTM-XXXXXX format from Step 5.2
- `workspaceId`: Usually "1" for default workspace

## Troubleshooting

### Issue: "OAuth consent screen not configured"

**Solution**: Complete Step 3.2 to configure consent screen

### Issue: "Invalid redirect URI"

**Cause**: Wrong application type selected

**Solution**:
1. Delete the credential
2. Create new credential with "Desktop app" type (NOT "Web application")

### Issue: "API not enabled"

**Solution**: Return to Step 2 and enable GTM API

### Issue: "Access denied"

**Cause**: Account doesn't have permission to GTM container

**Solution**:
1. Check you're signed in with correct Google account
2. Verify account has "Edit" or "Publish" access to GTM container
3. Container owner can grant access in GTM Admin > User Management

### Issue: "Project not found"

**Solution**: Ensure project is selected in top dropdown of Google Cloud Console

## Security Best Practices

### What to Commit to Git

**Safe to commit**:
- `gtm-credentials.json` (for Desktop app type - contains no secrets)
- `gtm-config.json` (just IDs, not sensitive)

**NEVER commit**:
- `gtm-token.json` (contains access tokens)

Add to `.gitignore`:
```
gtm-token.json
```

### Token Security

- Tokens expire after 1 hour
- Refresh token allows automatic renewal
- Revoke access anytime at: https://myaccount.google.com/permissions
- Look for "GTM Automation Script" in list

## Testing Setup

After completing all steps, test with:

```bash
node scripts/test-connection.js
```

Expected output:
```
=== Testing GTM API Connection ===

Account ID: 1234567890
Container ID: GTM-ABC1234

✓ Connection successful!

Container details:
  Name: My Website
  Public ID: GTM-ABC1234
  Usage Context: web

=== Setup Verified ===

Ready to use GTM API!
```

## Quick Reference Links

- **Create Project**: https://console.cloud.google.com/projectcreate
- **Enable GTM API**: https://console.cloud.google.com/apis/library/tagmanager.googleapis.com
- **Create Credentials**: https://console.cloud.google.com/apis/credentials
- **Google Tag Manager**: https://tagmanager.google.com/
- **Revoke Access**: https://myaccount.google.com/permissions

## FAQ

**Q: Do I need a billing account?**
A: No. GTM API is free. No billing required.

**Q: Can multiple people use the same credentials?**
A: Yes. Share `gtm-credentials.json`. Each person needs their own token (`gtm-token.json`).

**Q: Can I use this for multiple GTM containers?**
A: Yes. Create separate `gtm-config.json` files or use different project directories.

**Q: What permissions does this request?**
A: `tagmanager.edit.containers` - Read and write access to GTM containers.

**Q: Can I limit access to specific containers?**
A: No. OAuth grants access to all containers the user can access. Control access by using a Google account with limited GTM permissions.

**Q: How long does setup take?**
A: 5-10 minutes for first-time setup. Mostly clicking through Google Cloud Console.

**Q: What if I already have a Google Cloud project?**
A: You can reuse it. Just enable GTM API and create new OAuth credentials.
