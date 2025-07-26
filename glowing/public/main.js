document.addEventListener('DOMContentLoaded', () => {
  // Check if hCaptcha is completed
  if (!localStorage.getItem('hcaptcha-completed')) {
    window.location.href = '/glowing/capcha.html';
    return;
  }

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
