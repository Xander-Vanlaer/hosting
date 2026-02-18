const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const unzipper = require('unzipper');
const { requireAuth } = require('../lib/auth');
const dockerLib = require('../lib/docker');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = '/app/uploads';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        path.extname(file.originalname) === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

// Deploy new application
router.post('/', requireAuth, upload.single('code'), async (req, res) => {
  try {
    const { appName, runtime, envVars, replicas, memory, cpu } = req.body;
    
    // Validate input
    if (!appName || !runtime) {
      return res.status(400).json({ error: 'App name and runtime are required' });
    }
    
    // Create app directory
    const appDir = path.join('/app/uploads', appName);
    await fs.mkdir(appDir, { recursive: true });
    
    // Extract ZIP if uploaded
    if (req.file) {
      const zipPath = req.file.path;
      await fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: appDir }))
        .promise();
      
      // Clean up zip file
      await fs.unlink(zipPath);
    }
    
    // Get appropriate Dockerfile template
    const templatePath = path.join(__dirname, '..', 'templates', `${runtime}.Dockerfile`);
    let dockerfile = 'FROM node:18-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "index.js"]';
    
    try {
      dockerfile = await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      console.log(`Template not found for ${runtime}, using default`);
    }
    
    // Write Dockerfile
    await fs.writeFile(path.join(appDir, 'Dockerfile'), dockerfile);
    
    // Build image
    const imageName = `${appName}:latest`;
    console.log(`Building image: ${imageName}`);
    await dockerLib.buildImage(appDir, imageName, 'Dockerfile');
    
    // Parse environment variables
    const env = [];
    if (envVars) {
      const lines = envVars.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && trimmed.includes('=')) {
          env.push(trimmed);
        }
      });
    }
    
    // Deploy container
    const deployConfig = {
      name: appName,
      image: imageName,
      env: env,
      memory: parseInt(memory) || 512 * 1024 * 1024, // Default 512MB
      cpu: parseInt(cpu) || 1024
    };
    
    const result = await dockerLib.deployContainer(deployConfig);
    
    res.json({
      success: true,
      message: 'Application deployed successfully',
      containerId: result.containerId,
      appName: appName
    });
    
  } catch (error) {
    console.error('Deployment error:', error);
    res.status(500).json({ 
      error: 'Deployment failed', 
      details: error.message 
    });
  }
});

// Upload application files
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    res.json({
      success: true,
      filename: req.file.filename,
      size: req.file.size,
      path: req.file.path
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

module.exports = router;
