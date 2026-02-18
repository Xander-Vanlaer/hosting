// Load and display services/containers
let cachedServices = [];

async function loadServices() {
    const servicesGrid = document.getElementById('services-grid');
    servicesGrid.innerHTML = '<div class="spinner"></div>';
    
    try {
        const response = await fetch('/api/services', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Session expired. Please log in again.');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const services = await response.json();
        cachedServices = services; // Cache services for event handlers
        
        if (!Array.isArray(services) || services.length === 0) {
            servicesGrid.innerHTML = '<p style="text-align: center; padding: 2rem; color: #666;">No services found</p>';
            return;
        }
        
        servicesGrid.innerHTML = services.map((service, index) => `
            <div class="service-card" data-service-id="${escapeHtml(service.id)}" data-service-name="${escapeHtml(service.name || service.id.substring(0, 12))}" data-service-index="${index}">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">${escapeHtml(service.name || service.id.substring(0, 12))}</h3>
                    <span class="service-status ${service.state === 'running' ? 'status-running' : 'status-stopped'}">
                        ${service.state || 'unknown'}
                    </span>
                </div>
                <p><strong>Image:</strong> ${escapeHtml(service.image || 'N/A')}</p>
                <p><strong>Status:</strong> ${escapeHtml(service.status || 'N/A')}</p>
                <p><strong>ID:</strong> <code>${escapeHtml(service.id ? service.id.substring(0, 12) : 'N/A')}</code></p>
                ${service.state === 'running' ? `
                    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                        <button class="btn btn-secondary" data-action="viewLogs" data-index="${index}">
                            📋 View Logs
                        </button>
                        <button class="btn btn-warning" data-action="restartService" data-index="${index}">
                            🔄 Restart
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');
        
        // Add event listeners to action buttons
        attachServiceEventListeners();
        
    } catch (error) {
        console.error('Error loading services:', error);
        servicesGrid.innerHTML = `
            <div style="padding: 2rem; text-align: center;">
                <p class="error" style="color: #d32f2f; margin-bottom: 1rem;">
                    ❌ Failed to load services: ${escapeHtml(error.message)}
                </p>
                <button class="btn btn-primary" id="retryLoadServices">🔄 Try Again</button>
            </div>
        `;
        
        // Attach retry event listener
        const retryBtn = document.getElementById('retryLoadServices');
        if (retryBtn) {
            retryBtn.addEventListener('click', loadServices);
        }
    }
}

// Attach event listeners to service action buttons
function attachServiceEventListeners() {
    const buttons = document.querySelectorAll('[data-action]');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const action = this.getAttribute('data-action');
            const index = parseInt(this.getAttribute('data-index'));
            const service = cachedServices[index];
            
            if (!service) return;
            
            if (action === 'viewLogs') {
                viewLogs(service.id, service.name || service.id.substring(0, 12));
            } else if (action === 'restartService') {
                restartService(service.id, service.name || service.id.substring(0, 12));
            }
        });
    });
}

// Helper function to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// View container logs
async function viewLogs(serviceId, serviceName) {
    const modal = document.getElementById('logsModal');
    const title = document.getElementById('logsTitle');
    const content = document.getElementById('logsContent');
    
    title.textContent = `Logs: ${serviceName}`;
    content.innerHTML = '<div class="spinner"></div><p style="text-align: center;">Loading logs...</p>';
    modal.style.display = 'flex';
    
    try {
        const response = await fetch(`/api/services/${serviceId}/logs?tail=100`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const logs = data.logs || 'No logs available';
        
        content.innerHTML = `<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(logs)}</pre>`;
    } catch (error) {
        content.innerHTML = `<p class="error">Failed to load logs: ${escapeHtml(error.message)}</p>`;
    }
}

// Close logs modal
function closeLogsModal() {
    document.getElementById('logsModal').style.display = 'none';
}

// Restart a service
async function restartService(serviceId, serviceName) {
    if (!confirm(`Are you sure you want to restart "${serviceName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/services/${serviceId}/restart`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        alert(`✅ Service "${serviceName}" is restarting...`);
        
        // Reload services after a short delay
        setTimeout(() => loadServices(), 2000);
    } catch (error) {
        alert(`❌ Failed to restart service: ${error.message}`);
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('logsModal');
    if (event.target === modal) {
        closeLogsModal();
    }
};