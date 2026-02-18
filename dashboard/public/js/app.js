// Login form handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showDashboard(username);
      // Small delay to ensure session cookie is set
      await new Promise(resolve => setTimeout(resolve, 100));
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
