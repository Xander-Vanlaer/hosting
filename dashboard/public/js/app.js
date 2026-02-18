// Load services
async function loadServices() {
  try {
    const response = await fetch(`${API_BASE}/services`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.error('Unauthorized - redirecting to login');
        showLogin();
        return;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Services loaded:', data);
    // The services are handled by services.js
  } catch (error) {
    console.error('Error loading services:', error);
  }
}