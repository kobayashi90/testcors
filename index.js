const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse raw body for POST requests
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// Enable CORS for all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Home route - only match exact root
app.get('/', (req, res) => {
  res.json({
    message: 'CORS Proxy Server',
    usage: {
      description: 'Add your target URL after the base URL',
      examples: [
        `${req.protocol}://${req.get('host')}/https://api.github.com/users/octocat`,
        `${req.protocol}://${req.get('host')}/https://httpbin.org/json`,
        `${req.protocol}://${req.get('host')}/https://example.com/file.mp3`
      ],
      note: 'This proxy adds CORS headers to any request'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Proxy everything else - use a wildcard that captures everything
app.all('*', async (req, res) => {
  try {
    // Get the target URL from the request path
    let targetUrl = req.originalUrl || req.url;
    
    // Remove the leading slash
    if (targetUrl.startsWith('/')) {
      targetUrl = targetUrl.slice(1);
    }
    
    console.log('Request URL:', req.url);
    console.log('Original URL:', req.originalUrl);
    console.log('Target URL:', targetUrl);
    
    // Validate URL
    if (!targetUrl || !targetUrl.startsWith('http')) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'URL must start with http:// or https://',
        example: `${req.protocol}://${req.get('host')}/https://api.example.com`,
        received: targetUrl,
        debug: {
          url: req.url,
          originalUrl: req.originalUrl,
          method: req.method
        }
      });
    }

    // Prepare headers for the target request
    const targetHeaders = { ...req.headers };
    
    // Update the Host header to match the target domain
    try {
      const targetURL = new URL(targetUrl);
      targetHeaders.host = targetURL.host;
      targetHeaders.origin = `${targetURL.protocol}//${targetURL.host}`;
    } catch (err) {
      console.error('URL parsing error:', err);
      return res.status(400).json({
        error: 'Invalid URL format',
        message: 'Could not parse the provided URL',
        url: targetUrl
      });
    }
    
    // Remove problematic headers
    delete targetHeaders['x-forwarded-for'];
    delete targetHeaders['x-forwarded-proto'];
    delete targetHeaders['x-forwarded-host'];
    delete targetHeaders['x-real-ip'];
    delete targetHeaders['cf-connecting-ip'];
    delete targetHeaders['cf-ray'];
    delete targetHeaders['cf-visitor'];
    delete targetHeaders['cf-ipcountry'];

    console.log('Making request to:', targetUrl);
    
    // Make the request to the target URL
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: targetHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      redirect: 'follow'
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));

    // Set response status
    res.status(response.status);
    
    // Copy response headers (except problematic ones)
    for (const [key, value] of response.headers) {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'connection', 'keep-alive'].includes(lowerKey)) {
        res.header(key, value);
      }
    }

    // Handle the response body
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
        } catch (streamError) {
          console.error('Stream error:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error', message: streamError.message });
          }
        }
      };
      
      await pump();
    } else {
      res.end();
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Proxy Error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
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
