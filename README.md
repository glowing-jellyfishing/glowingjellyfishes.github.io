
# glowing-jellyfishing.github.io

Welcome to **Tycoon City** and the Glowing Jellyfishing platform! This project is a full-featured web app and game, featuring:

- **Tycoon City**: A city-building simulation game. Build houses, shops, parks, and upgrade your city. Manage money, population, and happiness. Save/load your progress and compete on the leaderboard!
- **User Authentication**: Sign up, log in, and manage your profile. Supports GitHub OAuth.
- **Profile System**: View and edit your profile, follow other users, and see stats.
- **Admin Panel & Dashboard**: Secure admin tools for user management, analytics, logs, and moderation.
- **Leaderboard**: Compete with other players and view top scores in Tycoon City.
- **Chat**: Discord-like chat system for users.
- **Anti-cheat & Analytics**: Basic anti-cheat and analytics for game and platform events.

## Getting Started

1. **Clone the repository**
2. **Install dependencies** (in the `glowing/` directory):
   ```bash
   cd glowing
   npm install
   ```
3. **Set up environment variables**: Copy `.env.example` to `.env` and fill in secrets (GitHub OAuth, admin password, etc).
4. **Run the server**:
   ```bash
   node server.js
   ```
5. **Open the app**: Visit `http://localhost:3000/` in your browser.

## Project Structure

- `glowing/public/tycoon-city/` — Tycoon City game (HTML, CSS, JS)
- `glowing/public/` — Main web app (auth, profile, admin, chat, etc)
- `glowing/server.js` — Node.js/Express backend
- `.env` — Secrets for OAuth, admin, etc

## Credits

Thanks to GitHub, Hcaptcha, Render, Betterstack, and all contributors.

## Status & Updates

- [Status Page](https://glowing-jellyfishing.betteruptime.com/)

---
Enjoy building your city and exploring the platform!
