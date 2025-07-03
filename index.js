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
app.use('/:targetUrl(*)', async (req, res) => {
  try {
    const targetUrl = req.params.targetUrl;
    
    // Validate URL
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'URL must start with http:// or https://',
        example: `${req.protocol}://${req.get('host')}/https://api.example.com`
      });
    }

    // Create proxy options
    const proxyOptions = {
      target: targetUrl,
      changeOrigin: true,
      followRedirects: true,
      secure: true,
      timeout: 30000,
      pathRewrite: {
        [`^/${targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`]: ''
      },
      onProxyReq: (proxyReq, req, res) => {
        // Forward the original request body for POST/PUT requests
        if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        // Ensure CORS headers are set
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.header('Access-Control-Allow-Headers', '*');
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(500).json({
          error: 'Proxy Error',
          message: err.message,
          target: targetUrl
        });
      }
    };

    // Create and use proxy middleware
    const proxy = createProxyMiddleware(proxyOptions);
    
    // Modify the request URL to just the target
    req.url = req.url.replace(`/${targetUrl}`, '') || '/';
    
    proxy(req, res);
    
  } catch (error) {
    console.error('Request error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
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
