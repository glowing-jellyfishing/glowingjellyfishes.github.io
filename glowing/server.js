const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.static('public'));

app.get('/api/games', (req, res) => {
  res.json([
    { name: "Obby Rush", description: "Dodge obstacles and race your friends!" },
    { name: "Tycoon City", description: "Build your business empire!" },
    { name: "Survival Madness", description: "Can you last the night?" }
  ]);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
