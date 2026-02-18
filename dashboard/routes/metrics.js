const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const dockerLib = require('../lib/docker');

// Get overall metrics
router.get('/', requireAuth, async (req, res) => {
  try {
    const containers = await dockerLib.listContainers();
    
    // Get stats for running containers
    const runningContainers = containers.filter(c => c.state === 'running');
    const statsPromises = runningContainers.map(c => 
      dockerLib.getContainerStats(c.id).catch(err => null)
    );
    const stats = await Promise.all(statsPromises);
    
    // Calculate aggregated metrics
    let totalCpu = 0;
    let totalMemoryUsage = 0;
    let totalMemoryLimit = 0;
    let validStats = 0;
    
    stats.forEach(stat => {
      if (stat) {
        totalCpu += parseFloat(stat.cpu);
        totalMemoryUsage += parseFloat(stat.memory.usage);
        totalMemoryLimit += parseFloat(stat.memory.limit);
        validStats++;
      }
    });
    
    const metrics = {
      containers: {
        total: containers.length,
        running: runningContainers.length,
        stopped: containers.filter(c => c.state === 'exited').length
      },
      resources: {
        cpu: validStats > 0 ? (totalCpu / validStats).toFixed(2) : 0,
        memory: {
          usage: totalMemoryUsage.toFixed(2),
          limit: totalMemoryLimit.toFixed(2),
          percent: totalMemoryLimit > 0 ? 
            ((totalMemoryUsage / totalMemoryLimit) * 100).toFixed(2) : 0
        }
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

module.exports = router;
