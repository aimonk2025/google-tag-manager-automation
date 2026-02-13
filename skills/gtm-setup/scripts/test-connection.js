// Test GTM API connection
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(process.cwd(), 'gtm-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'gtm-credentials.json');
const CONFIG_PATH = path.join(process.cwd(), 'gtm-config.json');

// Check files exist
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('✗ gtm-credentials.json not found');
  process.exit(1);
}

if (!fs.existsSync(TOKEN_PATH)) {
  console.error('✗ gtm-token.json not found. Run oauth-authorize.js first.');
  process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('✗ gtm-config.json not found');
  process.exit(1);
}

// Load files
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

// Create OAuth client
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(token);

// Create GTM client
const tagmanager = google.tagmanager({ version: 'v2', auth: oAuth2Client });

console.log('\n=== Testing GTM API Connection ===\n');
console.log(`Account ID: ${config.accountId}`);
console.log(`Container ID: ${config.containerPublicId}\n`);

// Test API call
const path_url = `accounts/${config.accountId}/containers/${config.containerId}`;

tagmanager.accounts.containers.get({ path: path_url })
  .then(response => {
    console.log('✓ Connection successful!\n');
    console.log('Container details:');
    console.log(`  Name: ${response.data.name}`);
    console.log(`  Public ID: ${response.data.publicId}`);
    console.log(`  Usage Context: ${response.data.usageContext.join(', ')}\n`);
    console.log('=== Setup Verified ===\n');
    console.log('Ready to use GTM API!\n');
  })
  .catch(error => {
    console.error('✗ Connection failed\n');

    if (error.code === 401) {
      console.error('Error: Unauthorized (401)');
      console.error('→ Token may be expired. Run oauth-authorize.js again.\n');
    } else if (error.code === 403) {
      console.error('Error: Forbidden (403)');
      console.error('→ Check that GTM API is enabled in Google Cloud Console.\n');
    } else if (error.code === 404) {
      console.error('Error: Not Found (404)');
      console.error('→ Check account ID and container ID in gtm-config.json.\n');
    } else {
      console.error('Error:', error.message, '\n');
    }

    process.exit(1);
  });
