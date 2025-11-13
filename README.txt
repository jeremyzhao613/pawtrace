PawTrace Web App (Taicang · Pixel Style)

Folder structure:
- frontend/index.html   → the complete SPA (login, map, pets, AI chat, profile)
- backend/server.js     → Node.js backend that proxies chat to Tongyi Qianwen
- backend/package.json  → dependencies for the backend

HOW TO RUN (recommended):
1. Put your Taicang campus map image as:
   frontend/taicang-map.png
   (Or rename your own file to this name.)

2. Configure your DashScope API key:
   Option A (recommended):
     On macOS / Linux terminal:
       export DASHSCOPE_API_KEY="sk-xxx_your_real_key_here"
   Option B:
     Open backend/server.js and replace:
       'YOUR_DASHSCOPE_API_KEY_HERE'
     with your real key (only for local testing, never commit this).

3. Install backend dependencies:
   cd backend
   npm install

4. Start the backend (which also serves the frontend):
   npm start

5. Open in browser:
   http://localhost:3000

FEATURES:
- Login / register (stored in browser localStorage)
- Pixel-style orange UI inspired by your PawTrace brand
- Virtual Taicang campus map with clickable markers
- Multi-pet management (add / edit name / delete)
- Multiple AI-simulated owners in the chat list
- Chat window calls /api/chat → Qwen (via your backend)
- Profile page bound to the logged-in user

This is a front-end prototype + minimal backend, ready to be deployed
to any Node-capable server or used in local demos.
