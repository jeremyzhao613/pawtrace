const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Put your real DashScope API key here or in environment variable DASHSCOPE_API_KEY
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-23fd035cf9844c79a5814b368293f744';

const SYSTEM_PROMPTS = {
  c1: "You are Lily, a friendly student at XJTLU Taicang who owns a corgi named Mocha. You love easy walks, coffee near campus, and short English chat messages.",
  c2: "You are Eric, a slightly nerdy but kind owner of a Border Collie called Pixel. You enjoy talking about training, running routes and dog sports in short English messages.",
  c3: "You are Mia, a calm cat owner. Your Ragdoll cat is called Mochi, and you reply in warm, short, supportive English messages.",
  c4: "You are Leo, an energetic Husky owner named Kiko's human. You like planning dog meetups and group walks around Taicang campus."
};

const defaultPets = [
  {
    id: 'p1',
    name: 'Mocha',
    type: 'Dog',
    breed: 'Corgi',
    age: '2 years',
    gender: 'Male',
    avatar: 'https://design.gemcoder.com/staticResource/echoAiSystemImages/a0c9378b7607e96469333185e4376a53.png',
    traits: ['Friendly', 'Food-motivated', 'Short legs, fast heart'],
    health: 'Vaccinations up to date. Last vet check 2 months ago.',
    status: 'Always ready for a fetch session.'
  },
  {
    id: 'p2',
    name: 'Pixel',
    type: 'Dog',
    breed: 'Border Collie',
    age: '3 years',
    gender: 'Female',
    avatar: 'https://design.gemcoder.com/staticResource/echoAiSystemImages/1a98a231cfe964a18cdd5f3502fb32bc.png',
    traits: ['Smart', 'High energy', 'Ball addict'],
    health: 'Needs daily long walks. Joint check scheduled next month.',
    status: 'Learning trick combos every week.'
  },
  {
    id: 'p3',
    name: 'Mochi',
    type: 'Cat',
    breed: 'Ragdoll',
    age: '1 year',
    gender: 'Female',
    avatar: 'https://design.gemcoder.com/staticResource/echoAiSystemImages/df853968f0a77fd6b43aed0bb28513f2.png',
    traits: ['Quiet', 'Cuddly', 'Window watcher'],
    health: 'Indoor only, spayed, no known issues.',
    status: 'Prefers sunlit shelves and calm corners.'
  },
  {
    id: 'p4',
    name: 'Kiko',
    type: 'Dog',
    breed: 'Husky',
    age: '4 years',
    gender: 'Female',
    avatar: 'https://design.gemcoder.com/staticResource/echoAiSystemImages/a6892cab6a2e4de1a06ab5df18a4e3ec.png',
    traits: ['Pack leader', 'Snow lover'],
    health: 'Energetic and strong, needs long runs.',
    status: 'Dreaming about weekend meetups.'
  },
  {
    id: 'p5',
    name: 'Luna',
    type: 'Cat',
    breed: 'Siamese',
    age: '2 years',
    gender: 'Female',
    avatar: 'https://design.gemcoder.com/staticResource/echoAiSystemImages/bfca1d0d7df0f66b8d2d3b5fc973e99c.png',
    traits: ['Playful', 'Curious', 'Talkative'],
    health: 'Indoor only, loves puzzles.',
    status: 'Chasing laser dots when not napping.'
  }
];

// Set up LowDB file storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbAdapter = new JSONFile(path.join(dataDir, 'pawtrace-db.json'));
const db = new Low(dbAdapter, {
  pets: [],
  users: [],
  chatHistory: {},
  stickyNotes: [],
  settings: { nextPetId: 1 }
});

async function initDb() {
  await db.read();
  db.data = db.data || {
    pets: defaultPets,
    users: [
      { id: 'u1', username: 'demo', displayName: 'Pet Lover', avatar: '', bio: 'Welcome to PawTrace!', campus: 'Taicang', contact: 'WeChat' },
      { id: 'u2', username: 'mila', displayName: 'Mila', avatar: '', bio: 'Cat person, art lover', campus: 'Shanghai', contact: 'Email' },
      { id: 'u3', username: 'rocky', displayName: 'Rocky', avatar: '', bio: 'Dog walker & plant dad', campus: 'Beijing', contact: 'Phone' },
      { id: 'u4', username: 'lily', displayName: 'Lily', avatar: '', bio: 'Event planner for pet meetups', campus: 'Taicang', contact: 'WeChat' }
    ],
    chatHistory: {},
    stickyNotes: [],
    settings: { nextPetId: 6 }
  };
  db.data.stickyNotes = db.data.stickyNotes || [];
  await db.write();
}

const publicPath = path.join(__dirname, '..', 'frontend');
const assetsPath = path.join(__dirname, '..', 'assets');

app.use(cors());
app.use(express.json());
app.use(express.static(publicPath));
if (fs.existsSync(assetsPath)) {
  app.use('/assets', express.static(assetsPath));
}

function getSystemPrompt(contactId, contactProfile) {
  let basePrompt = SYSTEM_PROMPTS[contactId] ||
    "You are a friendly pet owner chatting in short, simple English sentences about pets and campus life.";
  if (contactProfile) {
    basePrompt += `\nUse this profile info to stay consistent:\n${contactProfile}`;
  }
  return basePrompt;
}

function ensureHistory(contactId) {
  db.data.chatHistory[contactId] = db.data.chatHistory[contactId] || [];
  return db.data.chatHistory[contactId];
}

function buildPetPredictionPrompt(profile = {}) {
  const owner = profile.displayName || 'Pet owner';
  const starSign = profile.starSign || 'Unknown star sign';
  const petName = profile.petName || 'their pet';
  const petType = profile.petType || 'companion';
  const petBirthday = profile.petBirthday || 'Unknown birthday';
  const notes = profile.petNotes || 'No extra notes';
  return `${owner} is under the sign of ${starSign}. Main pet: ${petName} (${petType}), birthday: ${petBirthday}. Notes: ${notes}.
Share an upbeat, practical prediction (max 3 short sentences) about how ${petName} might behave this week and how the owner can support them on campus.`;
}

function getLocalPetPrediction(profile = {}) {
  const petName = profile.petName || 'Your pet';
  const starSign = profile.starSign ? `${profile.starSign} energy` : 'campus energy';
  const moods = [
    'will crave extra sunlight around the quad',
    'might ask for surprise snack breaks',
    'could bounce between zoomies and cuddle mode',
    'is likely to make a new friend near the café',
    'will pay close attention to your tone of voice',
  ];
  const focus = moods[Math.floor(Math.random() * moods.length)];
  return `${petName} ${focus} thanks to ${starSign}. Sprinkle in a longer walk and a familiar toy to keep them grounded.`;
}

app.get('/api/pets', (_req, res) => {
  res.json({ pets: db.data.pets });
});

app.post('/api/pets', async (req, res) => {
  const payload = req.body || {};
  if (!payload.name) {
    return res.status(400).json({ error: 'Pet name is required' });
  }
  const newPet = {
    id: `p${Date.now()}`,
    name: payload.name,
    type: payload.type || 'Pet',
    breed: payload.breed || 'Unknown',
    age: payload.age || 'Unknown',
    gender: payload.gender || 'Unknown',
    avatar: payload.avatar || 'https://design.gemcoder.com/staticResource/echoAiSystemImages/a0c9378b7607e96469333185e4376a53.png',
    traits: Array.isArray(payload.traits) ? payload.traits : (payload.traits || '').split(',').map(t => t.trim()).filter(Boolean),
    health: payload.health || 'No health notes yet.',
    status: payload.status || 'Just joined the crew.'
  };
  db.data.pets.push(newPet);
  await db.write();
  res.json({ pet: newPet });
});

app.delete('/api/pets/:id', async (req, res) => {
  const id = req.params.id;
  db.data.pets = db.data.pets.filter(p => p.id !== id);
  await db.write();
  res.json({ success: true });
});

app.get('/api/chat/history/:contactId', (req, res) => {
  const history = ensureHistory(req.params.contactId);
  res.json({ history });
});

app.get('/api/status', (_req, res) => {
  res.json({
    ready: true,
    aiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    lastSync: new Date().toISOString()
  });
});

app.get('/api/users', (_req, res) => {
  res.json({ users: db.data.users });
});

app.get('/api/map-locations', (_req, res) => {
  res.json({
    spots: [
      { id: '1', name: 'Central Lawn', desc: 'Wide grass field...', link: 'https://taicang.edu/campus/central-lawn' },
      { id: '2', name: 'Orange Corner Café', desc: 'Pet-friendly café with outdoor seating.', link: 'https://taicang.edu/campus/orange-cafe' }
    ]
  });
});

app.get('/api/sticky-notes', (_req, res) => {
  res.json({ notes: db.data.stickyNotes || [] });
});

app.post('/api/sticky-notes', async (req, res) => {
  const text = (req.body?.text || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Note text is required' });
  }
  const note = {
    id: `note-${Date.now()}`,
    text,
    createdAt: new Date().toISOString()
  };
  db.data.stickyNotes = db.data.stickyNotes || [];
  db.data.stickyNotes.push(note);
  await db.write();
  res.json({ note });
});

app.delete('/api/sticky-notes/:id', async (req, res) => {
  const id = req.params.id;
  db.data.stickyNotes = (db.data.stickyNotes || []).filter(note => note.id !== id);
  await db.write();
  res.json({ success: true });
});

app.delete('/api/sticky-notes', async (_req, res) => {
  db.data.stickyNotes = [];
  await db.write();
  res.json({ success: true });
});

app.post('/api/pet-prediction', async (req, res) => {
  const profile = req.body?.profile || {};
  if (!profile.starSign && !profile.petName) {
    return res.json({ prediction: 'Share your star sign or main pet info to unlock predictions.' });
  }
  const fallback = getLocalPetPrediction(profile);
  if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_DASHSCOPE_API_KEY_HERE') {
    return res.json({ prediction: fallback, source: 'local' });
  }
  const payload = {
    model: 'qwen-plus',
    messages: [
      {
        role: 'system',
        content: 'You are an upbeat pet behavior astrologist for a campus pet community. Reply with at most 3 short sentences including one actionable tip.'
      },
      { role: 'user', content: buildPetPredictionPrompt(profile) }
    ]
  };
  try {
    const response = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );
    if (!response.ok) {
      const text = await response.text();
      console.error('Pet prediction error', text);
      return res.json({ prediction: fallback, source: 'local' });
    }
    const data = await response.json();
    const prediction = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : fallback;
    res.json({ prediction });
  } catch (err) {
    console.error('Pet prediction server error:', err);
    res.json({ prediction: fallback, source: 'local' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { contactId, messages, contactProfile } = req.body || {};
  if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_DASHSCOPE_API_KEY_HERE') {
    return res.status(500).json({
      error: 'Backend is not configured with a valid DASHSCOPE_API_KEY.'
    });
  }
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const sysPrompt = getSystemPrompt(contactId, contactProfile);
  const payload = {
    model: "qwen-plus",
    messages: [
      { role: "system", content: sysPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ]
  };

  try {
    const response = await fetch(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DASHSCOPE_API_KEY}`
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("DashScope error:", response.status, text);
      return res.status(500).json({ error: "DashScope API error", detail: text });
    }

    const data = await response.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content
      : "I could not generate a proper reply, but your backend is reachable.";

    const history = ensureHistory(contactId);
    history.push(...messages.map(m => ({ role: m.role, content: m.content })));
    history.push({ role: 'assistant', content: reply });
    await db.write();

    res.json({ reply });
  } catch (err) {
    console.error("Chat backend error:", err);
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
});

// For SPA: send index.html for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

(async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`PawTrace web app running at http://localhost:${PORT}`);
  });
})();
