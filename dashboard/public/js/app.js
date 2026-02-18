// API Base URL
const API_BASE = '/api';

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const usernameDisplay = document.getElementById('username-display');

// Check session on page load
checkSession();

// Login form handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showDashboard(username);
      loadMetrics();
      loadServices();
    } else {
      showLoginError(data.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    showLoginError('Network error. Please try again.');
  }
});

// Logout handler
logoutBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST'
    });
    showLogin();
  } catch (error) {
    console.error('Logout error:', error);
    showLogin();
  }
});

// Tab navigation
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    switchTab(tabName);
  });
});

// Check if user is already logged in
async function checkSession() {
  try {
    const response = await fetch(`${API_BASE}/auth/session`);
    const data = await response.json();
    
    if (data.authenticated) {
      showDashboard(data.username);
      loadMetrics();
      loadServices();
    } else {
      showLogin();
    }
  } catch (error) {
    console.error('Session check error:', error);
    showLogin();
  }
}

// Show login page
function showLogin() {
  loginPage.style.display = 'flex';
  dashboardPage.classList.remove('active');
  loginForm.reset();
  loginError.style.display = 'none';
}

// Show dashboard
function showDashboard(username) {
  loginPage.style.display = 'none';
  dashboardPage.classList.add('active');
  usernameDisplay.textContent = username;
}

// Show login error
function showLoginError(message) {
  loginError.textContent = message;
  loginError.style.display = 'block';
  setTimeout(() => {
    loginError.style.display = 'none';
  }, 5000);
}

// Switch tabs
function switchTab(tabName) {
  // Update nav tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`).classList.add('active');
  
  // Load data for specific tabs
  if (tabName === 'services') {
    loadServices();
  } else if (tabName === 'overview') {
    loadMetrics();
  }
}

// Load metrics
async function loadMetrics() {
  try {
    const response = await fetch(`${API_BASE}/metrics`);
    const data = await response.json();
    
    if (response.ok) {
      document.getElementById('total-containers').textContent = data.containers.total;
      document.getElementById('running-containers').textContent = data.containers.running;
      document.getElementById('stopped-containers').textContent = data.containers.stopped;
      document.getElementById('avg-cpu').textContent = data.resources.cpu + '%';
    } else {
      console.error('Failed to load metrics:', data);
    }
  } catch (error) {
    console.error('Error loading metrics:', error);
  }
}

// Show alert
function showAlert(elementId, message, type = 'success') {
  const alertEl = document.getElementById(elementId);
  alertEl.className = `alert alert-${type}`;
  alertEl.textContent = message;
  alertEl.style.display = 'block';
  
  setTimeout(() => {
    alertEl.style.display = 'none';
  }, 5000);
}

// Format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}
