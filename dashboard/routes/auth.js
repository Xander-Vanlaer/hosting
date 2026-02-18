const express = require('express');
const router = express.Router();
const { validateCredentials } = require('../lib/auth');

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const isValid = await validateCredentials(username, password);
    
    if (isValid) {
      req.session.authenticated = true;
      req.session.username = username;
      res.json({ success: true, message: 'Logged in successfully' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check session
router.get('/session', (req, res) => {
  if (req.session && req.session.authenticated) {
    res.json({ 
      authenticated: true, 
      username: req.session.username 
    });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
