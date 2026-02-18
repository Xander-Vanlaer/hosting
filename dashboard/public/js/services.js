// Load services/containers
async function loadServices() {
  const servicesGrid = document.getElementById('services-grid');
  servicesGrid.innerHTML = '<div class="spinner"></div>';
  
  try {
    const response = await fetch(`${API_BASE}/services`);
    const services = await response.json();
    
    if (response.ok) {
      if (services.length === 0) {
        servicesGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No containers found</p>';
        return;
      }
      
      servicesGrid.innerHTML = '';
      
      for (const service of services) {
        const card = await createServiceCard(service);
        servicesGrid.appendChild(card);
      }
    } else {
      servicesGrid.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Failed to load services</p>';
    }
  } catch (error) {
    console.error('Error loading services:', error);
    servicesGrid.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Error loading services</p>';
  }
}

// Create service card
async function createServiceCard(service) {
  const card = document.createElement('div');
  card.className = 'service-card';
  card.setAttribute('data-status', service.state);
  
  // Get stats for running containers
  let statsHtml = '';
  if (service.state === 'running') {
    try {
      const statsResponse = await fetch(`${API_BASE}/services/${service.id}/stats`);
      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        statsHtml = `
          <div class="service-metrics">
            <div class="metric">
              <span class="metric-label">CPU:</span>
              <span class="metric-value">${stats.cpu}%</span>
            </div>
            <div class="metric">
              <span class="metric-label">Memory:</span>
              <span class="metric-value">${stats.memory.usage} MB / ${stats.memory.limit} MB</span>
            </div>
            <div class="metric">
              <span class="metric-label">Network RX/TX:</span>
              <span class="metric-value">${formatBytes(stats.network.rx)} / ${formatBytes(stats.network.tx)}</span>
            </div>
          </div>
        `;
      }
    } catch (error) {
      console.error('Error getting stats for', service.name, error);
    }
  }
  
  // Determine status badge class
  const statusClass = service.state === 'running' ? 'running' : 
                      service.state === 'exited' ? 'exited' : 'created';
  
  // Create action buttons based on state
  let actionButtons = '';
  if (service.state === 'running') {
    actionButtons = `
      <button class="btn btn-secondary btn-small" onclick="restartService('${service.id}', '${service.name}')">Restart</button>
      <button class="btn btn-danger btn-small" onclick="stopService('${service.id}', '${service.name}')">Stop</button>
    `;
  } else if (service.state === 'exited') {
    actionButtons = `
      <button class="btn btn-success btn-small" onclick="startService('${service.id}', '${service.name}')">Start</button>
      <button class="btn btn-danger btn-small" onclick="removeService('${service.id}', '${service.name}')">Remove</button>
    `;
  } else {
    actionButtons = `
      <button class="btn btn-success btn-small" onclick="startService('${service.id}', '${service.name}')">Start</button>
    `;
  }
  
  card.innerHTML = `
    <div class="service-header">
      <h3>${service.name}</h3>
      <span class="status-badge ${statusClass}">${service.state}</span>
    </div>
    <div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 0.5rem;">
      ${service.image}
    </div>
    <div style="color: var(--text-secondary); font-size: 0.75rem;">
      ${service.status}
    </div>
    ${statsHtml}
    <div class="service-actions">
      ${actionButtons}
      <button class="btn btn-primary btn-small" onclick="viewLogs('${service.id}', '${service.name}')">Logs</button>
    </div>
  `;
  
  return card;
}

// Restart service
async function restartService(containerId, containerName) {
  if (!confirm(`Restart ${containerName}?`)) return;
  
  try {
    const response = await fetch(`${API_BASE}/services/${containerId}/restart`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      alert('Service restarted successfully');
      loadServices();
    } else {
      alert('Failed to restart service: ' + data.error);
    }
  } catch (error) {
    console.error('Error restarting service:', error);
    alert('Error restarting service');
  }
}

// Stop service
async function stopService(containerId, containerName) {
  if (!confirm(`Stop ${containerName}?`)) return;
  
  try {
    const response = await fetch(`${API_BASE}/services/${containerId}/stop`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      alert('Service stopped successfully');
      loadServices();
    } else {
      alert('Failed to stop service: ' + data.error);
    }
  } catch (error) {
    console.error('Error stopping service:', error);
    alert('Error stopping service');
  }
}

// Start service
async function startService(containerId, containerName) {
  if (!confirm(`Start ${containerName}?`)) return;
  
  try {
    const response = await fetch(`${API_BASE}/services/${containerId}/start`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      alert('Service started successfully');
      loadServices();
    } else {
      alert('Failed to start service: ' + data.error);
    }
  } catch (error) {
    console.error('Error starting service:', error);
    alert('Error starting service');
  }
}

// Remove service
async function removeService(containerId, containerName) {
  if (!confirm(`Remove ${containerName}? This action cannot be undone.`)) return;
  
  try {
    const response = await fetch(`${API_BASE}/services/${containerId}?force=true`, {
      method: 'DELETE'
    });
    const data = await response.json();
    
    if (response.ok) {
      alert('Service removed successfully');
      loadServices();
    } else {
      alert('Failed to remove service: ' + data.error);
    }
  } catch (error) {
    console.error('Error removing service:', error);
    alert('Error removing service');
  }
}

// View logs
async function viewLogs(containerId, containerName) {
  const modal = document.getElementById('logsModal');
  const logsTitle = document.getElementById('logsTitle');
  const logsContent = document.getElementById('logsContent');
  
  logsTitle.textContent = `Logs: ${containerName}`;
  logsContent.textContent = 'Loading logs...';
  modal.classList.add('active');
  
  try {
    const response = await fetch(`${API_BASE}/services/${containerId}/logs?tail=500`);
    const data = await response.json();
    
    if (response.ok) {
      logsContent.textContent = data.logs || 'No logs available';
    } else {
      logsContent.textContent = 'Failed to load logs: ' + data.error;
    }
  } catch (error) {
    console.error('Error loading logs:', error);
    logsContent.textContent = 'Error loading logs';
  }
}

// Close logs modal
function closeLogsModal() {
  document.getElementById('logsModal').classList.remove('active');
}

// Close modal on outside click
document.getElementById('logsModal').addEventListener('click', (e) => {
  if (e.target.id === 'logsModal') {
    closeLogsModal();
  }
});
