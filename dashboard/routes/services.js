const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const dockerLib = require('../lib/docker');

// List all services/containers
router.get('/', requireAuth, async (req, res) => {
  try {
    const containers = await dockerLib.listContainers();
    res.json(containers);
  } catch (error) {
    console.error('Error listing services:', error);
    res.status(500).json({ error: 'Failed to list services' });
  }
});

// Get service stats
router.get('/:id/stats', requireAuth, async (req, res) => {
  try {
    const stats = await dockerLib.getContainerStats(req.params.id);
    res.json(stats);
  } catch (error) {
    console.error('Error getting service stats:', error);
    res.status(500).json({ error: 'Failed to get service stats' });
  }
});

// Get service logs
router.get('/:id/logs', requireAuth, async (req, res) => {
  try {
    const tail = parseInt(req.query.tail) || 100;
    const logs = await dockerLib.getContainerLogs(req.params.id, tail);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting service logs:', error);
    res.status(500).json({ error: 'Failed to get service logs' });
  }
});

// Restart service
router.post('/:id/restart', requireAuth, async (req, res) => {
  try {
    const result = await dockerLib.restartContainer(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error restarting service:', error);
    res.status(500).json({ error: 'Failed to restart service' });
  }
});

// Stop service
router.post('/:id/stop', requireAuth, async (req, res) => {
  try {
    const result = await dockerLib.stopContainer(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error stopping service:', error);
    res.status(500).json({ error: 'Failed to stop service' });
  }
});

// Start service
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const result = await dockerLib.startContainer(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error starting service:', error);
    res.status(500).json({ error: 'Failed to start service' });
  }
});

// Remove service
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const result = await dockerLib.removeContainer(req.params.id, force);
    res.json(result);
  } catch (error) {
    console.error('Error removing service:', error);
    res.status(500).json({ error: 'Failed to remove service' });
  }
});

module.exports = router;
