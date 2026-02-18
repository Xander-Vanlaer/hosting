// Deploy form handler
document.addEventListener('DOMContentLoaded', () => {
  const deployForm = document.getElementById('deployForm');
  const deployAlert = document.getElementById('deployAlert');

  if (deployForm) {
    deployForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Get form data
      const formData = new FormData();
      formData.append('appName', document.getElementById('appName').value);
      formData.append('runtime', document.getElementById('runtime').value);
      
      // Get file if uploaded
      const codeFile = document.getElementById('code').files[0];
      if (codeFile) {
        formData.append('code', codeFile);
      }
      
      formData.append('envVars', document.getElementById('envVars').value);
      formData.append('memory', document.getElementById('memory').value);
      formData.append('cpu', document.getElementById('cpu').value);

      try {
        // Show loading state
        const submitBtn = deployForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Deploying...';

        const response = await fetch('/api/deploy', {
          method: 'POST',
          credentials: 'include',
          body: formData
        });

        const data = await response.json();

        // Reset button
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;

        if (response.ok) {
          showAlert('success', `✅ ${data.message || 'Application deployed successfully!'}`);
          deployForm.reset();
        } else {
          showAlert('error', `❌ ${data.error || 'Deployment failed'}`);
        }
      } catch (error) {
        console.error('Deployment error:', error);
        const submitBtn = deployForm.querySelector('button[type="submit"]');
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Deploy Application';
        showAlert('error', `❌ Network error: ${error.message}`);
      }
    });
  }

  function showAlert(type, message) {
    // Validate type to prevent class injection
    const validTypes = ['success', 'error'];
    const alertType = validTypes.includes(type) ? type : 'error';
    
    deployAlert.className = `alert alert-${alertType}`;
    deployAlert.textContent = message;
    deployAlert.style.display = 'block';
    
    setTimeout(() => {
      deployAlert.style.display = 'none';
    }, 5000);
  }
});