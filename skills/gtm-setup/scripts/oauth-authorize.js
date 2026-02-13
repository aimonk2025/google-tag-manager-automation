// OAuth authorization flow
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/tagmanager.edit.containers'];
const TOKEN_PATH = path.join(process.cwd(), 'gtm-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'gtm-credentials.json');

// Check credentials file exists
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('✗ gtm-credentials.json not found');
  console.error('→ Download OAuth credentials from Google Cloud Console first');
  process.exit(1);
}

// Load credentials
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('\n=== GTM API Authorization ===\n');
console.log('Open this URL in your browser to authorize:\n');
console.log(authUrl);
console.log('\nAfter authorization, copy the full redirect URL from your browser.\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Paste the redirect URL here: ', (redirectUrl) => {
  rl.close();

  // Extract code from URL
  try {
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');

    if (!code) {
      console.error('✗ No authorization code found in URL');
      process.exit(1);
    }

    // Exchange code for token
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('✗ Error retrieving access token:', err);
        process.exit(1);
      }

      // Save token
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
      console.log('\n✓ Token saved to', TOKEN_PATH);
      console.log('\n=== Authorization Complete ===\n');
      console.log('You can now use the GTM API.');
      console.log('\nIMPORTANT: Add gtm-token.json to .gitignore\n');
    });
  } catch (error) {
    console.error('✗ Invalid URL format:', error.message);
    process.exit(1);
  }
});
