const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// ✅ Middleware to support clean URLs
app.use((req, res, next) => {
  if (!req.url.includes('.') && req.url !== '/') {
    req.url += '.html';
  }
  next();
});

// ✅ Serve static files from /public
app.use(express.static('public'));



// ✅ VPN Detector API
const axios = require('axios');
app.get('/api/vpn-check', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting,query`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'VPN check failed' });
  }
});

// ✅ Custom 404 page
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ✅ Start the server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
