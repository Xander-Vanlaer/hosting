const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

// Initialize Docker client
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// List all containers
async function listContainers() {
  try {
    const containers = await docker.listContainers({ all: true });
    return containers.map(container => ({
      id: container.Id,
      name: container.Names[0].replace('/', ''),
      image: container.Image,
      state: container.State,
      status: container.Status,
      created: container.Created,
      ports: container.Ports
    }));
  } catch (error) {
    console.error('Error listing containers:', error);
    throw error;
  }
}

// Get container stats
async function getContainerStats(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    
    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                     (stats.precpu_stats.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - 
                       (stats.precpu_stats.system_cpu_usage || 0);
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;
    
    // Calculate memory usage
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 0;
    const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;
    
    return {
      cpu: cpuPercent.toFixed(2),
      memory: {
        usage: (memoryUsage / 1024 / 1024).toFixed(2), // MB
        limit: (memoryLimit / 1024 / 1024).toFixed(2), // MB
        percent: memoryPercent.toFixed(2)
      },
      network: {
        rx: stats.networks?.eth0?.rx_bytes || 0,
        tx: stats.networks?.eth0?.tx_bytes || 0
      }
    };
  } catch (error) {
    console.error('Error getting container stats:', error);
    throw error;
  }
}

// Get container logs
async function getContainerLogs(containerId, tail = 100) {
  try {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: tail,
      timestamps: true
    });
    return logs.toString('utf-8');
  } catch (error) {
    console.error('Error getting container logs:', error);
    throw error;
  }
}

// Restart container
async function restartContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.restart();
    return { success: true, message: 'Container restarted successfully' };
  } catch (error) {
    console.error('Error restarting container:', error);
    throw error;
  }
}

// Stop container
async function stopContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.stop();
    return { success: true, message: 'Container stopped successfully' };
  } catch (error) {
    console.error('Error stopping container:', error);
    throw error;
  }
}

// Start container
async function startContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
    return { success: true, message: 'Container started successfully' };
  } catch (error) {
    console.error('Error starting container:', error);
    throw error;
  }
}

// Build image from Dockerfile
async function buildImage(contextPath, imageName, dockerfile = 'Dockerfile') {
  try {
    const stream = await docker.buildImage({
      context: contextPath,
      src: [dockerfile, '.']
    }, {
      t: imageName
    });
    
    return new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  } catch (error) {
    console.error('Error building image:', error);
    throw error;
  }
}

// Deploy container
async function deployContainer(config) {
  try {
    const container = await docker.createContainer({
      Image: config.image,
      name: config.name,
      Env: config.env || [],
      ExposedPorts: config.ports || {},
      HostConfig: {
        PortBindings: config.portBindings || {},
        Memory: config.memory || 536870912, // 512MB default
        CpuShares: config.cpu || 1024,
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      }
    });
    
    await container.start();
    return { 
      success: true, 
      containerId: container.id,
      message: 'Container deployed successfully' 
    };
  } catch (error) {
    console.error('Error deploying container:', error);
    throw error;
  }
}

// Remove container
async function removeContainer(containerId, force = false) {
  try {
    const container = docker.getContainer(containerId);
    await container.remove({ force });
    return { success: true, message: 'Container removed successfully' };
  } catch (error) {
    console.error('Error removing container:', error);
    throw error;
  }
}

module.exports = {
  listContainers,
  getContainerStats,
  getContainerLogs,
  restartContainer,
  stopContainer,
  startContainer,
  buildImage,
  deployContainer,
  removeContainer,
  docker
};
