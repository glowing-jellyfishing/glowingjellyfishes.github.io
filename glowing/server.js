
const fs = require('fs');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const requestIp = require('request-ip');


const app = express();
app.set('trust proxy', 1);
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const USERS_FILE = path.join(__dirname, 'users.json');
const AVATAR_DIR = path.join(__dirname, 'public', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR);

// Logging
const log = (...args) => {
// Admin endpoints (simple password, for demo)
const ADMIN_PASSWORD = 'I@m1hacker';
function isAdmin(req) {
  return req.cookies.admin === ADMIN_PASSWORD;
}
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin', ADMIN_PASSWORD, { httpOnly: true });
    return res.json({ success: true });
  }
  res.json({ error: 'Invalid password.' });
});
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ success: true });
});
app.get('/api/admin/users', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let users = loadUsers();
  res.json(users.map(u => ({ id: u.id, username: u.username, banned: u.banned, glows: u.glows, createdAt: u.createdAt })));
});
app.post('/api/admin/ban', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let users = loadUsers();
  const { id, reason, duration } = req.body;
  const user = users.find(u => u.id === id);
  if (!user) return res.json({ error: 'User not found.' });
  user.banned = true;
  user.banReason = reason;
  user.banUntil = duration ? Date.now() + duration * 1000 : null;
  saveUsers(users);
  log('User banned:', user.username, 'Reason:', reason, 'Duration:', duration);
  res.json({ success: true });
});
app.post('/api/admin/unban', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let users = loadUsers();
  const { id } = req.body;
  const user = users.find(u => u.id === id);
  if (!user) return res.json({ error: 'User not found.' });
  user.banned = false;
  user.banReason = '';
  user.banUntil = null;
  saveUsers(users);
  log('User unbanned:', user.username);
  res.json({ success: true });
});
app.get('/api/admin/logs', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let logs = '';
  try { logs = fs.readFileSync('server.log', 'utf8'); } catch {}
  res.type('text/plain').send(logs);
});
app.get('/api/admin/codes', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  res.json(redeemCodes);
});
app.post('/api/admin/regen-codes', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  generateRedeemCodes();
  res.json({ success: true });
});
  const msg = `[${new Date().toISOString()}] ` + args.join(' ');
  fs.appendFileSync('server.log', msg + '\n');
  console.log(msg);
};

// Session management (simple, for demo)
const sessions = {};
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { userId, created: Date.now() };
  return token;
}
function getSession(req) {
  const token = req.cookies.session;
  if (token && sessions[token]) return sessions[token];
  return null;
}
function destroySession(req, res) {
  const token = req.cookies.session;
  if (token) delete sessions[token];
  res.clearCookie('session');
}

// Multer for avatar upload
const upload = multer({ dest: AVATAR_DIR });

// Helper: load/save users
function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE)); } catch { return []; }
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Helper: generate 8-digit user id
function genUserId() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Helper: generate redeem codes
function genRedeemCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 20; i++) {
    if (i > 0 && i % 5 === 0) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Redeem codes (in-memory, for demo; can be persisted)
let redeemCodes = [];
function generateRedeemCodes() {
  redeemCodes = [];
  for (let i = 0; i < 10; i++) {
    redeemCodes.push({ code: genRedeemCode(), value: Math.floor(Math.random()*100+1) });
  }
  fs.writeFileSync('redeem-codes.json', JSON.stringify(redeemCodes, null, 2));
  log('Generated redeem codes:', redeemCodes.map(c=>c.code).join(', '));
}
if (!fs.existsSync('redeem-codes.json')) generateRedeemCodes();
else redeemCodes = JSON.parse(fs.readFileSync('redeem-codes.json'));

// Signup endpoint
app.post('/api/signup', upload.single('avatar'), async (req, res) => {
  let { username, password, birthday, gender } = req.body;
  if (!username || !password || !birthday || !gender) return res.json({ error: 'All fields required.' });
  let users = loadUsers();
  if (users.find(u => u.username === username)) return res.json({ error: 'Username already taken.' });
  const hash = await bcrypt.hash(password, 10);
  let avatar = '';
  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const newPath = path.join(AVATAR_DIR, req.file.filename + ext);
    fs.renameSync(req.file.path, newPath);
    avatar = 'avatars/' + path.basename(newPath);
  }
  const id = genUserId();
  const user = {
    id,
    username,
    password: hash,
    birthday,
    gender,
    avatar,
    glows: 0,
    followers: [],
    bio: '',
    createdAt: Date.now(),
    banned: false
  };
  users.push(user);
  saveUsers(users);
  log('User signed up:', username);
  res.json({ success: true, message: 'Signup successful! Please login.' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  let users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.json({ error: 'Invalid credentials.' });
  if (user.banned) return res.json({ error: 'You are banned.' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: 'Invalid credentials.' });
  const token = createSession(user.id);
  res.cookie('session', token, { httpOnly: true });
  log('User logged in:', username);
  res.json({ success: true, message: 'Login successful!' });
});

// Session check
app.get('/api/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ loggedIn: false });
  let users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, username: user.username });
});

// Logout
app.post('/api/logout', (req, res) => {
  destroySession(req, res);
  res.json({ success: true });
});

// Profile endpoint
app.get('/api/profile', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ success: false });
  let users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.json({ success: false });
  res.json({
    success: true,
    username: user.username,
    bio: user.bio,
    glows: user.glows,
    followers: user.followers.length,
    avatar: user.avatar,
    createdAt: user.createdAt,
    isOwner: true
  });
});

// Update bio
app.post('/api/profile/bio', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ error: 'Not logged in.' });
  let users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.json({ error: 'Not found.' });
  user.bio = req.body.bio;
  saveUsers(users);
  res.json({ success: true });
});

// Follow endpoint (can only follow once)
app.post('/api/follow', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ error: 'Not logged in.' });
  let users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.json({ error: 'Not found.' });
  // For demo, can't follow self, and only one profile for now
  res.json({ message: 'Followed!' });
});

// Redeem endpoint
app.post('/api/redeem', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ error: 'Not logged in.' });
  let users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.json({ error: 'Not found.' });
  const { code } = req.body;
  const idx = redeemCodes.findIndex(c => c.code === code);
  if (idx === -1) return res.json({ error: 'Invalid code.' });
  const value = redeemCodes[idx].value;
  user.glows += value;
  redeemCodes.splice(idx, 1);
  fs.writeFileSync('redeem-codes.json', JSON.stringify(redeemCodes, null, 2));
  saveUsers(users);
  log('User', user.username, 'redeemed code', code, 'for', value, 'glows');
  res.json({ success: true, message: `Redeemed for ${value} glows!` });
});


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
app.get('/api/vpn-check', async (req, res) => {
  const ip = requestIp.getClientIp(req);
  if (!validator.isIP(ip)) {
    return res.status(400).json({ error: 'Invalid IP address' });
  }
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=proxy,hosting,query`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'VPN check failed' });
  }
});

// ✅ Custom 404 page
const notFoundLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests to non-existent routes, please try again later.' }
});
app.use(notFoundLimiter, (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ✅ Start the server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
