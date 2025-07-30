// Tycoon City Game Logic
const mapSize = 8;
let gameState = {
  money: 500,
  population: 0,
  happiness: 100,
  cityLevel: 1,
  tiles: Array(mapSize * mapSize).fill(null),
  events: [],
};

const tileTypes = {
  house: { cost: 100, pop: 5, happy: 2, emoji: '🏠' },
  shop: { cost: 500, pop: 0, happy: 5, emoji: '🏪' },
  park: { cost: 300, pop: 0, happy: 10, emoji: '🌳' },
  upgraded: { cost: 0, pop: 0, happy: 0, emoji: '🏙️' },
};

function updateStats() {
  document.getElementById('money').textContent = `$${gameState.money}`;
  document.getElementById('population').textContent = `Population: ${gameState.population}`;
  document.getElementById('happiness').textContent = `Happiness: ${gameState.happiness}%`;
}

function renderMap() {
  const map = document.getElementById('city-map');
  map.innerHTML = '';
  gameState.tiles.forEach((tile, i) => {
    const div = document.createElement('div');
    div.className = 'tile' + (tile ? ' ' + tile : '');
    div.textContent = tile ? tileTypes[tile].emoji : '';
    map.appendChild(div);
  });
}

function showEvent(msg) {
  const events = document.getElementById('events');
  events.textContent = msg;
  setTimeout(() => { events.textContent = ''; }, 3000);
}

function build(type) {
  const idx = gameState.tiles.findIndex(t => t === null);
  if (idx === -1) return showEvent('No empty tiles!');
  const info = tileTypes[type];
  if (gameState.money < info.cost) return showEvent('Not enough money!');
  gameState.money -= info.cost;
  gameState.tiles[idx] = type;
  gameState.population += info.pop;
  gameState.happiness = Math.min(100, gameState.happiness + info.happy);
  showEvent(`Built a ${type}!`);
  updateStats();
  renderMap();
}

function upgradeCity() {
  if (gameState.money < 2000) return showEvent('Not enough money to upgrade!');
  gameState.money -= 2000;
  gameState.cityLevel++;
  for (let i = 0; i < gameState.tiles.length; i++) {
    if (gameState.tiles[i] && gameState.tiles[i] !== 'upgraded') {
      gameState.tiles[i] = 'upgraded';
    }
  }
  gameState.happiness = Math.min(100, gameState.happiness + 20);
  showEvent('City upgraded! All buildings are now skyscrapers!');
  updateStats();
  renderMap();
}

function earnIncome() {
  let income = 10 * gameState.population + 50 * gameState.cityLevel;
  gameState.money += income;
  updateStats();
}

function saveGame() {
  localStorage.setItem('tycoonCitySave', JSON.stringify(gameState));
  showEvent('Game saved!');
}

function loadGame() {
  const save = localStorage.getItem('tycoonCitySave');
  if (save) {
    gameState = JSON.parse(save);
    updateStats();
    renderMap();
    showEvent('Game loaded!');
  } else {
    showEvent('No save found.');
  }
}

function showLeaderboard() {
  const modal = document.getElementById('leaderboard-modal');
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '';
  // Demo leaderboard
  const scores = [
    { name: 'You', score: gameState.money },
    { name: 'Alice', score: 12000 },
    { name: 'Bob', score: 9000 },
    { name: 'Eve', score: 7000 },
  ];
  scores.sort((a, b) => b.score - a.score);
  scores.forEach(s => {
    const li = document.createElement('li');
    li.textContent = `${s.name}: $${s.score}`;
    list.appendChild(li);
  });
  modal.classList.remove('hidden');
}

document.getElementById('build-house').onclick = () => build('house');
document.getElementById('build-shop').onclick = () => build('shop');
document.getElementById('build-park').onclick = () => build('park');
document.getElementById('upgrade-city').onclick = upgradeCity;
document.getElementById('save-btn').onclick = saveGame;
document.getElementById('load-btn').onclick = loadGame;
document.getElementById('leaderboard-btn').onclick = showLeaderboard;
document.getElementById('close-leaderboard').onclick = () => {
  document.getElementById('leaderboard-modal').classList.add('hidden');
};

updateStats();
renderMap();
setInterval(earnIncome, 3000);
