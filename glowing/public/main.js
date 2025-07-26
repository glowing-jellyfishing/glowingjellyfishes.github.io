document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/games')
    .then(res => res.json())
    .then(data => {
      const container = document.getElementById('game-list');
      data.forEach(game => {
        const div = document.createElement('div');
        div.className = 'game-card';
        div.innerHTML = `<h3>${game.name}</h3><p>${game.description}</p>`;
        container.appendChild(div);
      });
    });
});
