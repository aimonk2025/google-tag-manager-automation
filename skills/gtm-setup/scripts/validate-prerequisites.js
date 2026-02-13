// Validate existing setup files
const fs = require('fs');
const path = require('path');

const files = {
  'package.json': { required: true, description: 'Node.js project' },
  'gtm-credentials.json': { required: false, description: 'OAuth credentials' },
  'gtm-token.json': { required: false, description: 'Access token' },
  'gtm-config.json': { required: false, description: 'GTM configuration' }
};

console.log('Validating prerequisites...\n');

let allValid = true;
let setupStatus = {
  credentials: false,
  token: false,
  config: false
};

for (const [filename, config] of Object.entries(files)) {
  const exists = fs.existsSync(path.join(process.cwd(), filename));

  if (filename === 'gtm-credentials.json' && exists) setupStatus.credentials = true;
  if (filename === 'gtm-token.json' && exists) setupStatus.token = true;
  if (filename === 'gtm-config.json' && exists) setupStatus.config = true;

  const status = exists ? '✓' : (config.required ? '✗' : '○');
  console.log(`${status} ${filename} - ${config.description}`);

  if (config.required && !exists) {
    allValid = false;
  }
}

console.log('\nSetup status:');
if (setupStatus.credentials && setupStatus.token && setupStatus.config) {
  console.log('✓ Complete setup detected');
  console.log('→ Run test-connection.js to validate');
} else if (setupStatus.credentials || setupStatus.token || setupStatus.config) {
  console.log('○ Partial setup detected');
  if (!setupStatus.credentials) console.log('  Missing: OAuth credentials');
  if (!setupStatus.token) console.log('  Missing: Access token');
  if (!setupStatus.config) console.log('  Missing: GTM configuration');
} else {
  console.log('○ No setup detected');
  console.log('→ Start from Phase 3 (Google Cloud setup)');
}

process.exit(allValid ? 0 : 1);
