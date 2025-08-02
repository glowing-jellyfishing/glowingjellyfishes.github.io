// --- GitHub Webhook Receiver & Events API ---
const WEBHOOK_EVENTS_FILE = path.join(__dirname, 'webhook-events.json');
function loadWebhookEvents() {
  try { return JSON.parse(fs.readFileSync(WEBHOOK_EVENTS_FILE)); } catch { return []; }
}
function saveWebhookEvents(events) {
  fs.writeFileSync(WEBHOOK_EVENTS_FILE, JSON.stringify(events.slice(-50), null, 2));
}

// Endpoint to receive GitHub webhook POSTs
app.post('/api/github-webhook', express.json({ limit: '2mb' }), (req, res) => {
  // Optionally validate secret here
  const eventType = req.headers['x-github-event'] || 'unknown';
  const repo = req.body.repository && req.body.repository.full_name ? req.body.repository.full_name : 'unknown';
  const payload = req.body;
  const event = {
    type: eventType,
    repo,
    time: Date.now(),
    payload
  };
  let events = loadWebhookEvents();
  events.push(event);
  saveWebhookEvents(events);
  res.json({ success: true });
});

// Endpoint to serve recent webhook events to frontend
app.get('/api/github-webhook-events', (req, res) => {
  const events = loadWebhookEvents();
  res.json(events.slice(-20).reverse());
});
const express = require('express');
const app = express();
// Glow Chat: in-memory messages (demo)
let glowChatMessages = [];
app.get('/api/glow-chat/messages', (req, res) => {
  res.json(glowChatMessages.slice(-50)); // last 50 messages
});
app.post('/api/glow-chat/messages', (req, res) => {
  const session = getSession(req);
  let user = 'Guest';
  if (session) {
    let users = loadUsers();
    const u = users.find(u => u.id === session.userId);
    if (u) user = u.username;
  }
  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim()) return res.json({ error: 'Empty message.' });
  const msg = { user, text: text.trim(), time: Date.now() };
  glowChatMessages.push(msg);
  if (glowChatMessages.length > 1000) glowChatMessages = glowChatMessages.slice(-1000);
  res.json({ success: true });
});

const fs = require('fs');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const csrf = require('lusca').csrf;
const multer = require('multer');
const dayjs = require('dayjs');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const requestIp = require('request-ip');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;

const PORT = 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.use(csrf());
app.use(passport.initialize());
app.use(passport.session());

// Simple analytics tracking
const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
function loadAnalytics() {
  try { return JSON.parse(fs.readFileSync(ANALYTICS_FILE)); } catch { return {}; }
}
function saveAnalytics(data) {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
}
function trackEvent(type) {
  const today = dayjs().format('YYYY-MM-DD');
  let analytics = loadAnalytics();
  if (!analytics[today]) analytics[today] = { logins: 0, signups: 0, redeems: 0 };
  analytics[today][type] = (analytics[today][type] || 0) + 1;
  saveAnalytics(analytics);
}

// Set bio (admin moderation)
app.post('/api/admin/set-bio', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let users = loadUsers();
  const { id, bio } = req.body;
  const user = users.find(u => u.id === id);
  if (!user) return res.json({ error: 'User not found.' });
  user.bio = bio;
  saveUsers(users);
  res.json({ success: true });
});

// Leaderboard endpoint
app.get('/api/leaderboard', (req, res) => {
  let users = loadUsers();
  // Ensure achievements field exists
  users.forEach(u => { if (!u.achievements) u.achievements = []; });
  // Sort by glows descending
  users.sort((a, b) => b.glows - a.glows);
  // Return top 20
  res.json(users.slice(0, 20).map(u => ({ username: u.username, glows: u.glows, achievements: u.achievements || [] })));
});

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
  let { username, password, birthday, gender, invite } = req.body;
  if (!username || !password || !birthday || !gender) return res.json({ error: 'All fields required.' });
  let users = loadUsers();
  if (users.find(u => u.username === username)) return res.json({ error: 'Username already taken.' });
  const hash = await bcrypt.hash(password, 10);
  let avatar = '';
  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const newPath = path.resolve(AVATAR_DIR, req.file.filename + ext);
    if (!newPath.startsWith(path.resolve(AVATAR_DIR))) {
      return res.status(400).json({ error: 'Invalid file path.' });
    }
    // Ensure the uploaded file path is within the expected upload directory
    const uploadDir = path.resolve('uploads'); // Change 'uploads' if your multer dest is different
    const filePathResolved = path.resolve(req.file.path);
    if (!filePathResolved.startsWith(uploadDir)) {
      return res.status(400).json({ error: 'Invalid upload file path.' });
    }
    fs.renameSync(filePathResolved, newPath);
    avatar = 'avatars/' + path.basename(newPath);
  }
  const id = genUserId();
  const inviteCode = crypto.randomBytes(6).toString('hex');
  let referrals = 0;
  if (invite) {
    const inviter = users.find(u => u.inviteCode === invite);
    if (inviter) {
      inviter.referrals = (inviter.referrals || 0) + 1;
      referrals = inviter.referrals;
      saveUsers(users);
    }
  }
  const user = {
    id,
    username,
    password: hash,
    birthday,
    gender,
    avatar,
    glows: 0,
    stars: 0,
    followers: [],
    bio: '',
    createdAt: Date.now(),
    banned: false,
    inviteCode,
    referrals
  };
  users.push(user);
  saveUsers(users);
  log('User signed up:', username);
  res.json({ success: true, message: 'Signup successful! Please login.' });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  trackEvent('logins');
  trackEvent('signups');
  const { username, password } = req.body;
  let users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.json({ error: 'Invalid credentials.' });
  if (user.banned) return res.json({ error: 'You are banned.' });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: 'Invalid credentials.' });
  const token = createSession(user.id);
  res.cookie('session', token, { httpOnly: true });
  if (!user.achievements) user.achievements = [];
  if (!user.achievements.includes('First Login')) {
    user.achievements.push('First Login');
    saveUsers(users);
  }
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
  const queryId = req.query.userId;
  let user = queryId ? users.find(u => u.id === queryId) : users.find(u => u.id === session.userId);
  if (!user) return res.json({ success: false });
  res.json({
    success: true,
    id: user.id,
    username: user.username,
    bio: user.bio,
    glows: user.glows,
    stars: user.stars || 0,
    followers: user.followers.length,
    avatar: user.avatar,
    createdAt: user.createdAt,
    inviteCode: user.inviteCode,
    referrals: user.referrals || 0,
    isOwner: user.id === session.userId
  });
// Buy stars (premium currency, demo)
app.post('/api/buy-stars', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ error: 'Not logged in.' });
  let users = loadUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) return res.json({ error: 'Not found.' });
  user.stars = (user.stars || 0) + 10;
  saveUsers(users);
  res.json({ success: true, stars: user.stars, message: 'Purchased 10 stars (demo)!' });
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
  const follower = users.find(u => u.id === session.userId);
  if (!follower) return res.json({ error: 'Not found.' });
  const { userId } = req.body;
  if (!userId || userId === follower.id) return res.json({ error: 'Invalid user to follow.' });
  const target = users.find(u => u.id === userId);
  if (!target) return res.json({ error: 'User not found.' });
  if (!target.followers) target.followers = [];
  if (target.followers.includes(follower.id)) return res.json({ error: 'Already following.' });
  target.followers.push(follower.id);
  saveUsers(users);
  res.json({ success: true, message: 'Followed!', followers: target.followers.length });
});

// Redeem endpoint
const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 redeem requests per windowMs
  message: { error: 'Too many redeem attempts, please try again later.' }
});
app.post('/api/redeem', redeemLimiter, (req, res) => {
  trackEvent('redeems');
// Admin analytics endpoint
app.get('/api/admin/analytics', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  let analytics = loadAnalytics();
  const dates = Object.keys(analytics).sort();
  res.json({
    dates,
    logins: dates.map(d => analytics[d].logins),
    signups: dates.map(d => analytics[d].signups),
    redeems: dates.map(d => analytics[d].redeems)
  });
});
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
  if (!user.achievements) user.achievements = [];
  if (!user.achievements.includes('First Redeem')) {
    user.achievements.push('First Redeem');
  }
  redeemCodes.splice(idx, 1);
  fs.writeFileSync('redeem-codes.json', JSON.stringify(redeemCodes, null, 2));
  saveUsers(users);
  log('User', user.username, 'redeemed code', code, 'for', value, 'glows');
  res.json({ success: true, message: `Redeemed for ${value} glows!` });
});


// GitHub OAuth setup
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  let users = loadUsers();
  const user = users.find(u => u.id === id);
  done(null, user || null);
});

passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
  let users = loadUsers();
  let user = users.find(u => u.githubId === profile.id);
  if (!user) {
    // Create new user if not exists
    user = {
      id: genUserId(),
      username: profile.username || profile.displayName || 'github_' + profile.id,
      githubId: profile.id,
      avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : '',
      glows: 0,
      stars: 0,
      followers: [],
      bio: profile._json.bio || '',
      createdAt: Date.now(),
      banned: false,
      inviteCode: crypto.randomBytes(6).toString('hex'),
      referrals: 0
    };
    users.push(user);
    saveUsers(users);
  }
  return done(null, user);
}));

app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', {
  failureRedirect: '/login.html',
  session: true
}), (req, res) => {
  // Successful login, set session cookie
  res.cookie('session', createSession(req.user.id), { httpOnly: true });
  res.redirect('/profile.html');
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
