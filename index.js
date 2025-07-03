const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['*'],
  credentials: false
}));

// Parse JSON bodies
app.use(express.json());

// Home route with usage instructions
app.get('/', (req, res) => {
  res.json({
    message: 'CORS Proxy Server',
    usage: {
      description: 'Add your target URL after the base URL',
      examples: [
        `${req.protocol}://${req.get('host')}/https://api.github.com/users/octocat`,
        `${req.protocol}://${req.get('host')}/https://httpbin.org/json`,
        `${req.protocol}://${req.get('host')}/https://jsonplaceholder.typicode.com/posts/1`
      ],
      methods: 'Supports GET, POST, PUT, DELETE, PATCH',
      cors: 'CORS headers automatically added to all responses'
    }
  });
});

// Proxy route - handles all HTTP methods
app.use('/*', async (req, res) => {
  try {
    // Get the full URL from the path (everything after the first slash)
    const fullPath = req.url.slice(1); // Remove leading slash
    
    // Validate URL
    if (!fullPath.startsWith('http://') && !fullPath.startsWith('https://')) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'URL must start with http:// or https://',
        example: `${req.protocol}://${req.get('host')}/https://api.example.com`,
        received: fullPath
      });
    }

    console.log('Proxying request to:', fullPath);
    
    // For audio files and other binary content, we need to handle this differently
    // than using http-proxy-middleware which can corrupt binary data
    
    const targetUrl = new URL(fullPath);
    
    // Create headers for the upstream request
    const upstreamHeaders = {
      ...req.headers,
      host: targetUrl.host,
      // Remove headers that might cause issues
      'x-forwarded-for': undefined,
      'x-forwarded-proto': undefined,
      'x-forwarded-host': undefined,
      'x-real-ip': undefined,
      'cf-connecting-ip': undefined,
      'cf-ray': undefined,
      'cf-visitor': undefined,
      'cf-ipcountry': undefined,
    };
    
    // Clean up undefined headers
    Object.keys(upstreamHeaders).forEach(key => {
      if (upstreamHeaders[key] === undefined) {
        delete upstreamHeaders[key];
      }
    });

    // Make the request to the target URL
    const response = await fetch(fullPath, {
      method: req.method,
      headers: upstreamHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'follow'
    });

    // Set CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', '*');
    
    // Copy response headers from upstream
    response.headers.forEach((value, key) => {
      // Skip headers that might cause issues
      if (!['content-encoding', 'transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        res.header(key, value);
      }
    });

    // Set the response status
    res.status(response.status);

    // For binary content (like audio files), we need to handle the response as a stream
    if (response.body) {
      const reader = response.body.getReader();
      
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch (error) {
          console.error('Stream error:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error', message: error.message });
          }
        }
      };
      
      pump();
    } else {
      res.end();
    }
    
  } catch (error) {
    console.error('Request error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy Error',
        message: error.message,
        url: req.url
      });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`CORS Proxy Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
