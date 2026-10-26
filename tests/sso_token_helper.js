// Helper to mint valid SSO tokens for testing
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

function mintSsoToken(phone, name, secret) {
  const now = Date.now();
  const payload = {
    phone: phone,
    name: name || 'Test User',
    iat: now,
    exp: now + 60000, // 60 seconds validity
    nonce: uuidv4(),
    src: 'toolkit'
  };
  
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(b64, 'utf8').digest('hex');
  return `${b64}.${sig}`;
}

// Generate a random unused 10-digit phone starting with 9
function generateRandomPhone() {
  return '9' + Math.floor(Math.random() * 900000000 + 100000000).toString();
}

module.exports = { mintSsoToken, generateRandomPhone };
