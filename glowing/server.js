const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middleware to support clean URLs
app.use((req, res, next) => {
  if (!req.url.includes('.') && req.url !== '/') {
    req.url += '.html';
  }
  next();
});

// ✅ Serve static files from /public
app.use(express.static('public'));

// ✅ Sample API route
app.get('/api/games', (req, res) => {
  res.json([
    { name: "Obby Rush", description: "Dodge obstacles and race your friends!" },
    { name: "Tycoon City", description: "Build your business empire!" },
    { name: "Survival Madness", description: "Can you last the night?" }
  ]);
});

// ✅ Custom 404 page
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ✅ Start the server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
