// Basic translation logic
const translations = {
  en: { 'Welcome to Glowing Jellyfishing': 'Welcome to Glowing Jellyfishing' },
  es: { 'Welcome to Glowing Jellyfishing': 'Bienvenido a Glowing Jellyfishing' },
  fr: { 'Welcome to Glowing Jellyfishing': 'Bienvenue à Glowing Jellyfishing' },
  de: { 'Welcome to Glowing Jellyfishing': 'Willkommen bei Glowing Jellyfishing' }
};
const lang = localStorage.getItem('lang') || 'en';
document.querySelectorAll('h1, h2, h3, p, button, label').forEach(el => {
  if (translations[lang] && translations[lang][el.textContent]) {
    el.textContent = translations[lang][el.textContent];
  }
});
// Anti-cheat: block console tampering
Object.defineProperty(window, 'console', {
  get() {
    document.body.innerHTML = '<div class="form-container"><h2>Admin Login Required</h2><p>Console access is restricted. Please use the admin panel.</p></div>';
    throw new Error('Console access blocked by anti-cheat.');
  },
  configurable: false
});
document.addEventListener('DOMContentLoaded', () => {
  // Check if hCaptcha is completed
  if (!localStorage.getItem('hcaptcha-completed')) {
    window.location.href = '/capcha.html';
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
