// Deploy form handler
const deployForm = document.getElementById('deployForm');

deployForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const submitBtn = deployForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Deploying...';
  submitBtn.disabled = true;
  
  try {
    const formData = new FormData();
    
    // Add form fields
    formData.append('appName', document.getElementById('appName').value);
    formData.append('runtime', document.getElementById('runtime').value);
    formData.append('envVars', document.getElementById('envVars').value);
    formData.append('memory', document.getElementById('memory').value);
    formData.append('cpu', document.getElementById('cpu').value);
    
    // Add file if selected
    const codeFile = document.getElementById('code').files[0];
    if (codeFile) {
      formData.append('code', codeFile);
    }
    
    const response = await fetch(`${API_BASE}/deploy`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showAlert('deployAlert', 'Application deployed successfully! Container ID: ' + data.containerId, 'success');
      deployForm.reset();
      
      // Switch to services tab after deployment
      setTimeout(() => {
        switchTab('services');
      }, 2000);
    } else {
      showAlert('deployAlert', 'Deployment failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Deployment error:', error);
    showAlert('deployAlert', 'Deployment failed: ' + error.message, 'error');
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

// File input preview
document.getElementById('code').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log('File selected:', file.name, formatBytes(file.size));
  }
});
