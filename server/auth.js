const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const PASSWORD = process.env.CLIPBOARD_PASSWORD || 'admin';

console.log('Auth config loaded:', { PASSWORD, JWT_SECRET: JWT_SECRET.substring(0, 10) + '...' });

function verifyPassword(password) {
  console.log('Verifying password:', { received: password, expected: PASSWORD });
  if (password !== PASSWORD) {
    return null;
  }
  return jwt.sign({ auth: true }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

module.exports = { verifyPassword, verifyToken };
