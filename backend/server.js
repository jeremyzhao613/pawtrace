const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: Put your real DashScope API key here or in environment variable DASHSCOPE_API_KEY
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 15000);
const MONITOR_MAX = Number(process.env.MONITOR_MAX || 500);

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
    avatar: '/assets/1.png',
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
    avatar: '/assets/2.png',
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
    avatar: '/assets/3.png',
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
    avatar: '/assets/4.png',
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
    avatar: '/assets/5.png',
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
  ensureMonitoring();
  await db.write();
}

const metrics = {
  startedAt: Date.now(),
  requests: 0,
  routes: {}
};

function trimList(list = [], max = MONITOR_MAX) {
  if (!Array.isArray(list)) return [];
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

const publicPath = path.join(__dirname, '..', 'frontend');
const assetsPath = path.join(__dirname, '..', 'assets');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(compression());
app.set('etag', 'strong');

const staticOpts = {
  maxAge: NODE_ENV === 'production' ? '12h' : 0,
  etag: true
};
app.use(express.static(publicPath, staticOpts));
if (fs.existsSync(assetsPath)) {
  app.use('/assets', express.static(assetsPath, staticOpts));
}

// lightweight latency / status monitor
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    metrics.requests += 1;
    const key = req.path.split('?')[0] || '/';
    if (!metrics.routes[key]) {
      metrics.routes[key] = { count: 0, sumMs: 0, maxMs: 0, status: {} };
    }
    const routeStat = metrics.routes[key];
    routeStat.count += 1;
    routeStat.sumMs += durationMs;
    routeStat.maxMs = Math.max(routeStat.maxMs, durationMs);
    routeStat.status[res.statusCode] = (routeStat.status[res.statusCode] || 0) + 1;
    if (durationMs > 1200) {
      console.warn(`[slow] ${req.method} ${key} ${durationMs.toFixed(1)}ms`);
    }
  });
  next();
});

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

function ensureMonitoring() {
  db.data.monitoring = db.data.monitoring || {
    userProfiles: [],
    petProfiles: [],
    purchases: [],
    chatLogs: []
  };
  return db.data.monitoring;
}

function recordChatForMonitoring(contactId, messages = [], reply = '') {
  const monitoring = ensureMonitoring();
  monitoring.chatLogs = monitoring.chatLogs || [];
  monitoring.chatLogs.push({
    id: `chat-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    contactId,
    messages,
    reply,
    capturedAt: new Date().toISOString()
  });
  monitoring.chatLogs = trimList(monitoring.chatLogs);
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

function buildGeminiAdvicePrompt(service = 'health', context = '', profile = {}, pets = []) {
  const owner = profile.displayName || 'Owner';
  const petLine = profile.mainPetName ? `Pet: ${profile.mainPetName} (${profile.mainPetType || 'Pet'})` : '';
  const notes = profile.mainPetNotes ? `Notes: ${profile.mainPetNotes}` : '';
  const extraPets = Array.isArray(pets) && pets.length
    ? `Other pets: ${pets.slice(0, 3).map(p => `${p.name || p.type || 'Pet'} (${p.type || p.breed || ''})`).join('; ')}`
    : '';
  const baseContext = [petLine, notes, extraPets].filter(Boolean).join('\n');
  switch (service) {
    case 'behavior':
      return `
You are a pet behavior specialist. Analyze the behavior and share positive reinforcement drills.
Owner: ${owner}
${baseContext}
User context: "${context || 'No extra details provided'}"

Respond in Markdown:
### 🧠 Psychological Analysis
### 🐕 Training Tips
### 🏠 Environmental Changes
### 🗓️ Practice Routine
`;
    case 'diet':
      return `
You are a pet nutritionist. Suggest balanced diet and hydration tips.
Owner: ${owner}
${baseContext}
User context: "${context || 'No extra details provided'}"

Respond in Markdown:
### 🥩 Recommended Nutrition
### 🥣 Daily Meal Plan (Morning/Evening)
### 🚫 Foods to Avoid
### 💧 Hydration & Supplements
`;
    case 'health':
    default:
      return `
You are a veterinary assistant. Provide a general health checklist and preventive care.
Owner: ${owner}
${baseContext}
User context: "${context || 'No extra details provided'}"

Respond in Markdown:
### 📋 Health Checklist
### 💉 Vaccination & Care Status
### 🚩 Flags to Watch
### 🩺 Next Steps
`;
  }
}

function buildQwenAdviceMessages(service = 'health', context = '', profile = {}, pets = []) {
  const system = 'You are a concise, friendly pet assistant. Reply in Markdown with clear sections and short bullets.';
  const prompt = buildGeminiAdvicePrompt(service, context, profile, pets);
  return [
    { role: 'system', content: system },
    { role: 'user', content: prompt }
  ];
}

async function callQwen(messages = []) {
  if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_DASHSCOPE_API_KEY_HERE') {
    throw new Error('DASHSCOPE_API_KEY missing');
  }
  const payload = { model: 'qwen-plus', messages };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const response = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }
  );
  clearTimeout(timer);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Qwen API error');
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content;
}

async function callQwenVision({ imageBase64, mimeType, prompt }) {
  if (!DASHSCOPE_API_KEY || DASHSCOPE_API_KEY === 'YOUR_DASHSCOPE_API_KEY_HERE') {
    throw new Error('DASHSCOPE_API_KEY missing');
  }
  const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`;
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt }
      ]
    }
  ];
  const payload = { model: 'qwen-vl-plus', messages };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const response = await fetch(
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }
  );
  clearTimeout(timer);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Qwen-VL API error');
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content;
}

app.get('/api/pets', (_req, res) => {
  res.json({ pets: db.data.pets });
});

app.post('/api/pets', async (req, res) => {
  const payload = req.body || {};
  if (!payload.name) {
    return res.status(400).json({ error: 'Pet name is required' });
  }
  const petSprites = ['/assets/1.png','/assets/2.png','/assets/3.png','/assets/4.png','/assets/5.png','/assets/6.png'];
  const randomSprite = petSprites[Math.floor(Math.random() * petSprites.length)];
  const newPet = {
    id: `p${Date.now()}`,
    name: payload.name,
    type: payload.type || 'Pet',
    breed: payload.breed || 'Unknown',
    age: payload.age || 'Unknown',
    gender: payload.gender || 'Unknown',
    avatar: payload.avatar || randomSprite,
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

app.get('/api/monitor/metrics', (_req, res) => {
  const summary = Object.entries(metrics.routes).reduce((acc, [route, stat]) => {
    acc[route] = {
      count: stat.count,
      avgMs: stat.count ? Number(stat.sumMs / stat.count).toFixed(2) : '0',
      maxMs: Number(stat.maxMs).toFixed(2),
      status: stat.status
    };
    return acc;
  }, {});
  res.json({
    uptimeSeconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
    requests: metrics.requests,
    routes: summary
  });
});

app.post('/api/monitor/collect', async (req, res) => {
  const payload = req.body || {};
  const monitoring = ensureMonitoring();
  const capturedAt = new Date().toISOString();
  const metadata = (payload && typeof payload.metadata === 'object' && payload.metadata !== null)
    ? payload.metadata
    : {};
  const personalInfo = (payload && typeof payload.personalInfo === 'object' && payload.personalInfo !== null)
    ? payload.personalInfo
    : undefined;
  const captured = { userProfiles: 0, petProfiles: 0, purchases: 0 };

  if (payload.userProfile && typeof payload.userProfile === 'object') {
    monitoring.userProfiles = monitoring.userProfiles || [];
    monitoring.userProfiles.push({
      id: `profile-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      capturedAt,
      profile: payload.userProfile,
      ...(personalInfo ? { personalInfo } : {}),
      metadata
    });
    captured.userProfiles += 1;
  }

  const petPayload = Array.isArray(payload.pets)
    ? payload.pets.filter(p => p && typeof p === 'object')
    : [];
  if (petPayload.length) {
    monitoring.petProfiles = monitoring.petProfiles || [];
    petPayload.forEach(pet => {
      monitoring.petProfiles.push({
        id: `pet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        capturedAt,
        owner: payload?.userProfile?.username || personalInfo?.username || metadata.username || 'anonymous',
        pet,
        metadata
      });
    });
    captured.petProfiles += petPayload.length;
    monitoring.petProfiles = trimList(monitoring.petProfiles);
  }

  const shoppingPayload = Array.isArray(payload.shopping)
    ? payload.shopping.filter(item => item && typeof item === 'object')
    : [];
  if (shoppingPayload.length) {
    monitoring.purchases = monitoring.purchases || [];
    shoppingPayload.forEach(item => {
      monitoring.purchases.push({
        id: item.id || `purchase-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        capturedAt,
        purchase: item,
        metadata
      });
    });
    captured.purchases += shoppingPayload.length;
    monitoring.purchases = trimList(monitoring.purchases);
  }

  await db.write();

  res.json({
    success: true,
    captured,
    totals: {
      userProfiles: monitoring.userProfiles?.length || 0,
      petProfiles: monitoring.petProfiles?.length || 0,
      purchases: monitoring.purchases?.length || 0,
      chatLogs: monitoring.chatLogs?.length || 0
    }
  });
});

app.get('/api/monitor/overview', (_req, res) => {
  const monitoring = ensureMonitoring();
  res.json({
    capturedAt: new Date().toISOString(),
    summary: {
      userProfiles: monitoring.userProfiles?.length || 0,
      petProfiles: monitoring.petProfiles?.length || 0,
      purchases: monitoring.purchases?.length || 0,
      chatLogs: monitoring.chatLogs?.length || 0,
      contactsTracked: Object.keys(db.data.chatHistory || {}).length
    },
    monitoring,
    chatHistory: db.data.chatHistory || {},
    users: db.data.users || [],
    pets: db.data.pets || []
  });
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

app.post('/api/ai/qwen-advice', async (req, res) => {
  const { service, context, profile, pets } = req.body || {};
  if (!service || !['health', 'behavior', 'diet'].includes(service)) {
    return res.status(400).json({ error: 'service must be one of health | behavior | diet' });
  }
  const messages = buildQwenAdviceMessages(service, context, profile, pets);
  try {
    const result = await callQwen(messages);
    res.json({ result: result || 'Unable to generate advice. Please try again.' });
  } catch (err) {
    console.error('Qwen advice server error:', err);
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
});

app.post('/api/ai/gemini-advice', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is missing on the server.' });
  }
  const { service, context, profile, pets } = req.body || {};
  if (!service || !['health', 'behavior', 'diet'].includes(service)) {
    return res.status(400).json({ error: 'service must be one of health | behavior | diet' });
  }
  const prompt = buildGeminiAdvicePrompt(service, context, profile, pets);
  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );
    clearTimeout(timer);
    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini advice error:', errText);
      return res.status(500).json({ error: 'Gemini API error', detail: errText });
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n\n');
    res.json({ result: text || 'Unable to generate advice. Please try again.' });
  } catch (err) {
    console.error('Gemini advice server error:', err);
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
});

app.post('/api/ai/gemini-diagnosis', async (req, res) => {
  const { imageBase64, mimeType, symptoms } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }
  const prompt = `
You are an expert veterinary AI assistant named "PawTrace Health Engine".
Analyze the provided pet image and symptoms: "${symptoms || 'No symptoms given; do a general visual check.'}"
Provide a structured Markdown response:
### 🩺 Visual Analysis
### 🔍 Potential Causes
### ⚠️ Severity Assessment
### 💡 Recommended Actions
**Disclaimer:** You are an AI, not a licensed veterinarian. This is informational only.
`;
  try {
    // First try Qwen multimodal
    const qwenVisionResult = await callQwenVision({ imageBase64, mimeType, prompt });
    if (qwenVisionResult) return res.json({ result: qwenVisionResult });
  } catch (err) {
    console.error('Qwen-VL error:', err);
  }
  try {
    // Fallback to text-only Qwen advice
    const messages = buildQwenAdviceMessages(
      'health',
      `Symptoms: ${symptoms || 'not provided'}. Image attached but processed as text.`,
      {},
      []
    );
    const result = await callQwen(messages);
    return res.json({ result: result || 'AI could not analyze the image; please try again.' });
  } catch (err) {
    console.error('Diagnosis AI error:', err);
    return res.status(500).json({ error: 'AI service unavailable. Configure DASHSCOPE_API_KEY.', detail: String(err) });
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

  const normalizedMessages = messages
    .map(msg => ({
      role: msg?.role === 'assistant' ? 'assistant' : 'user',
      content: typeof msg?.content === 'string' ? msg.content.trim() : ''
    }))
    .filter(entry => entry.content);

  const sysPrompt = getSystemPrompt(contactId, contactProfile);
  const payload = {
    model: "qwen-plus",
    messages: [
      { role: "system", content: sysPrompt },
      ...normalizedMessages
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
    history.push(...normalizedMessages);
    history.push({ role: 'assistant', content: reply });
    recordChatForMonitoring(contactId, normalizedMessages, reply);
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
