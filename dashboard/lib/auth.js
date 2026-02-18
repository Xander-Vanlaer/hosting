const bcrypt = require('bcrypt');

// Hardcoded users (in production, use database)
const users = new Map();

// Initialize admin user from environment
async function initializeUsers() {
  const username = process.env.DASHBOARD_USER || 'admin';
  const password = process.env.DASHBOARD_PASSWORD || 'admin';
  const hashedPassword = await bcrypt.hash(password, 10);
  users.set(username, hashedPassword);
  console.log(`Dashboard user initialized: ${username}`);
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Authentication required' });
}

// Validate credentials
async function validateCredentials(username, password) {
  const hashedPassword = users.get(username);
  if (!hashedPassword) {
    return false;
  }
  return await bcrypt.compare(password, hashedPassword);
}

module.exports = {
  initializeUsers,
  requireAuth,
  validateCredentials
};
