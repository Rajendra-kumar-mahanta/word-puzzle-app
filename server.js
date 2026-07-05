const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const cors = require('cors');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'development_word_puzzle_secret';
const MIN_GRID_SIZE = 10;
const MAX_GRID_SIZE = 15;
const MIN_WORDS = 3;
const MAX_WORDS = 24;

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PUZZLES_FILE = path.join(DATA_DIR, 'puzzles.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

const COLLECTIONS = {
  users: 'users',
  puzzles: 'puzzles',
  submissions: 'submissions'
};

const LOCAL_COLLECTIONS = {
  [COLLECTIONS.users]: { file: USERS_FILE, key: 'users' },
  [COLLECTIONS.puzzles]: { file: PUZZLES_FILE, key: 'puzzles' },
  [COLLECTIONS.submissions]: { file: SUBMISSIONS_FILE, key: 'submissions' }
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  }
}));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, { users: [] });
  if (!fs.existsSync(PUZZLES_FILE)) writeJson(PUZZLES_FILE, { puzzles: [] });
  if (!fs.existsSync(SUBMISSIONS_FILE)) writeJson(SUBMISSIONS_FILE, { submissions: [] });
}

function isHostedRuntime() {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
}

function firebaseConfigStatus() {
  const hasProjectId = Boolean(process.env.FIREBASE_PROJECT_ID);
  const hasClientEmail = Boolean(process.env.FIREBASE_CLIENT_EMAIL);
  const hasPrivateKey = Boolean(process.env.FIREBASE_PRIVATE_KEY);
  const hasBase64 = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  const hasWebApiKey = Boolean(firebaseWebApiKey());
  const splitVarsReady = hasProjectId && hasClientEmail && hasPrivateKey;

  return {
    hostedRuntime: isHostedRuntime(),
    localFallback: !isHostedRuntime() && !hasBase64 && !splitVarsReady,
    webApiKey: hasWebApiKey ? 'set' : 'missing',
    serviceAccount: hasBase64 ? 'base64' : splitVarsReady ? 'split-vars' : 'missing',
    projectId: hasProjectId ? 'set' : 'missing',
    clientEmail: hasClientEmail ? 'set' : 'missing',
    privateKey: hasPrivateKey ? 'set' : 'missing',
    base64ServiceAccount: hasBase64 ? 'set' : 'missing'
  };
}

function firebasePrivateKey() {
  return process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : '';
}

function firebaseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
    } catch (error) {
      throw httpError(500, 'FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded service account JSON.');
    }
  }

  const hasProjectId = Boolean(process.env.FIREBASE_PROJECT_ID);
  const hasClientEmail = Boolean(process.env.FIREBASE_CLIENT_EMAIL);
  const hasPrivateKey = Boolean(process.env.FIREBASE_PRIVATE_KEY);
  const hasAnySplitVar = hasProjectId || hasClientEmail || hasPrivateKey;

  if (hasProjectId && hasClientEmail && hasPrivateKey) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: firebasePrivateKey()
    };
  }

  if (hasAnySplitVar) {
    const missing = [
      ['FIREBASE_PROJECT_ID', hasProjectId],
      ['FIREBASE_CLIENT_EMAIL', hasClientEmail],
      ['FIREBASE_PRIVATE_KEY', hasPrivateKey]
    ]
      .filter(([, exists]) => !exists)
      .map(([key]) => key)
      .join(', ');
    throw httpError(500, `Firebase service account env vars are incomplete. Missing: ${missing}.`);
  }

  if (isHostedRuntime()) {
    throw httpError(500, 'Firebase service account env vars are missing in Vercel. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY, or add FIREBASE_SERVICE_ACCOUNT_BASE64.');
  }

  return null;
}

function getFirebaseAdmin() {
  const serviceAccount = firebaseServiceAccount();
  if (!serviceAccount) return null;

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  }

  return { auth: getAuth };
}

function getFirestore() {
  const serviceAccount = firebaseServiceAccount();
  if (!serviceAccount) return null;

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount)
    });
  }

  return getAdminFirestore();
}

function usingFirestore() {
  return Boolean(getFirestore());
}

function firebaseWebApiKey() {
  return process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || '';
}

function shouldUseFirebaseAuth() {
  return isHostedRuntime() || Boolean(firebaseWebApiKey() || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_PRIVATE_KEY);
}

function ensureFirebaseAuthReady() {
  firebaseServiceAccount();
  if (!firebaseWebApiKey()) {
    throw httpError(500, 'Firebase web API key is missing. Add FIREBASE_WEB_API_KEY in Vercel.');
  }
}

async function firebaseAuthRequest(action, body) {
  const apiKey = firebaseWebApiKey();
  if (!apiKey) {
    throw httpError(500, 'Firebase web API key is missing. Add FIREBASE_WEB_API_KEY in Vercel.');
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${action}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code = data.error && data.error.message ? data.error.message : 'FIREBASE_AUTH_FAILED';
    throw httpError(firebaseAuthStatus(code), firebaseAuthMessage(code));
  }

  return data;
}

function firebaseAuthStatus(code) {
  const statuses = {
    EMAIL_EXISTS: 409,
    EMAIL_NOT_FOUND: 401,
    INVALID_PASSWORD: 401,
    INVALID_LOGIN_CREDENTIALS: 401,
    USER_DISABLED: 403,
    WEAK_PASSWORD: 400,
    INVALID_EMAIL: 400
  };
  return statuses[code] || 400;
}

function firebaseAuthMessage(code) {
  const messages = {
    EMAIL_EXISTS: 'This email already has an account.',
    EMAIL_NOT_FOUND: 'Invalid email or password.',
    INVALID_PASSWORD: 'Invalid email or password.',
    INVALID_LOGIN_CREDENTIALS: 'Invalid email or password.',
    USER_DISABLED: 'This account is disabled.',
    WEAK_PASSWORD: 'Password must be at least 6 characters.',
    INVALID_EMAIL: 'Enter a valid email address.'
  };
  return messages[code] || code.replace(/_/g, ' ').toLowerCase();
}

async function listCollection(collectionName) {
  const firestore = getFirestore();
  if (firestore) {
    const snapshot = await firestore.collection(collectionName).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  const local = LOCAL_COLLECTIONS[collectionName];
  const data = readJson(local.file, { [local.key]: [] });
  return Array.isArray(data[local.key]) ? data[local.key] : [];
}

async function getDocument(collectionName, id) {
  const firestore = getFirestore();
  if (firestore) {
    const doc = await firestore.collection(collectionName).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  const rows = await listCollection(collectionName);
  return rows.find((entry) => entry.id === id) || null;
}

async function saveDocument(collectionName, id, data) {
  const firestore = getFirestore();
  const row = { ...data, id };

  if (firestore) {
    await firestore.collection(collectionName).doc(id).set(row, { merge: true });
    return row;
  }

  const local = LOCAL_COLLECTIONS[collectionName];
  const db = readJson(local.file, { [local.key]: [] });
  const rows = Array.isArray(db[local.key]) ? db[local.key] : [];
  const index = rows.findIndex((entry) => entry.id === id);
  if (index >= 0) rows[index] = { ...rows[index], ...row };
  else rows.push(row);
  db[local.key] = rows;
  writeJson(local.file, db);
  return row;
}

function createId(prefix = '') {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}${time}${random}`;
}

function submissionId(puzzleId, rollNo) {
  const safeRollNo = String(rollNo || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `sub_${puzzleId}_${safeRollNo}`;
}

function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function normalizeWord(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z]/g, '');
}

function cleanText(value = '', maxLength = 400) {
  return String(value).trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const forwardedProtocol = req.headers['x-forwarded-proto'];
  const protocol = forwardedProtocol ? String(forwardedProtocol).split(',')[0] : req.protocol;
  return `${protocol}://${req.get('host')}`;
}

function bearerToken(req) {
  const authHeader = req.headers.authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

function createLocalAuthResponse(user) {
  const payload = { id: user.id, name: user.name, email: user.email };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  return { token, user: payload };
}

async function authenticate(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Please sign in again.' });

  try {
    const firebase = getFirebaseAdmin();
    if (firebase) {
      const decoded = await firebase.auth().verifyIdToken(token);
      const profile = await getDocument(COLLECTIONS.users, decoded.uid);
      req.user = {
        id: decoded.uid,
        name: profile ? profile.name : (decoded.name || decoded.email || 'Teacher'),
        email: profile ? profile.email : (decoded.email || '')
      };
      return next();
    }

    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Please sign in again.' });
  }
}

function getPuzzleWords(puzzle) {
  if (!Array.isArray(puzzle.words)) return [];

  return puzzle.words
    .map((entry) => {
      if (typeof entry === 'string') {
        const text = normalizeWord(entry);
        return {
          text,
          description: puzzle.description || '',
          cells: findWordCells(puzzle.grid, text)
        };
      }

      const text = normalizeWord(entry.text || entry.word || '');
      return {
        text,
        description: entry.description || puzzle.description || '',
        cells: Array.isArray(entry.cells) ? entry.cells : findWordCells(puzzle.grid, text)
      };
    })
    .filter((entry) => entry.text.length > 0);
}

function publicPuzzle(puzzle) {
  const words = getPuzzleWords(puzzle);
  return {
    id: puzzle.id,
    title: puzzle.title,
    overview: puzzle.overview || puzzle.description || '',
    mode: puzzle.mode || 'hard',
    active: puzzle.active !== false,
    creatorName: puzzle.creatorName,
    createdAt: puzzle.createdAt,
    size: puzzle.size || getGridSizeFromGrid(puzzle.grid),
    grid: puzzle.grid,
    wordCount: words.length
  };
}

async function puzzleForCreator(puzzle, req) {
  const words = getPuzzleWords(puzzle);
  const relativeUrl = puzzle.url || `/play.html?id=${puzzle.id}`;
  const playUrl = `${publicBaseUrl(req)}${relativeUrl}`;
  const submissions = await listCollection(COLLECTIONS.submissions);
  const players = submissions.filter((entry) => entry.puzzleId === puzzle.id);
  const completed = players.filter((entry) => entry.score >= words.length && words.length > 0).length;
  const leaderboard = await serializeLeaderboard(puzzle.id);

  return {
    id: puzzle.id,
    title: puzzle.title,
    overview: puzzle.overview || puzzle.description || '',
    mode: puzzle.mode || 'hard',
    active: puzzle.active !== false,
    createdAt: puzzle.createdAt,
    size: puzzle.size || getGridSizeFromGrid(puzzle.grid),
    wordCount: words.length,
    words: words.map((word) => ({ text: word.text, description: word.description })),
    playerCount: players.length,
    completedCount: completed,
    topLeaderboard: leaderboard.slice(0, 3),
    leaderboard,
    playUrl,
    url: relativeUrl,
    qrData: puzzle.qrData || ''
  };
}

function getGridSizeFromGrid(grid) {
  return Array.isArray(grid) && grid.length ? grid.length : MIN_GRID_SIZE;
}

function prepareWordEntries(rawEntries) {
  const source = Array.isArray(rawEntries) ? rawEntries : [];
  const seen = new Set();
  const entries = [];
  const errors = [];

  source.forEach((entry, index) => {
    const rawWord = cleanText(typeof entry === 'string' ? entry : entry.word || entry.text || '', 80);
    const word = normalizeWord(rawWord);
    const description = typeof entry === 'string' ? '' : cleanText(entry.description || '', 700);
    const rowNumber = index + 1;

    if (!rawWord && !description) return;

    if (!rawWord || !description) {
      errors.push(`Row ${rowNumber} needs both a word and description.`);
      return;
    }

    if (word.length < 2 || word.length > MAX_GRID_SIZE) {
      errors.push(`Row ${rowNumber} word must be 2 to 15 letters after removing spaces and symbols.`);
      return;
    }

    if (seen.has(word)) {
      errors.push(`Duplicate word "${word}" is not allowed.`);
      return;
    }

    seen.add(word);
    entries.push({ text: word, description });
  });

  return { entries, errors };
}

function normalizeMode(value) {
  if (value === 'easy' || value === 'normal') return 'easy';
  if (value === 'moderate') return 'moderate';
  return 'hard';
}

function calculateGridSize(entries) {
  const longestWord = entries.reduce((longest, entry) => Math.max(longest, entry.text.length), MIN_GRID_SIZE);
  const totalLetters = entries.reduce((total, entry) => total + entry.text.length, 0);
  const densitySize = Math.ceil(Math.sqrt(totalLetters * 2));
  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, longestWord, densitySize));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createEmptyGrid(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ''));
}

function fillEmptyCells(grid, size) {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
    }
  }
}

function canPlaceWord(grid, word, startRow, startCol, direction, size) {
  for (let index = 0; index < word.length; index += 1) {
    const row = startRow + direction.row * index;
    const col = startCol + direction.col * index;
    if (row < 0 || col < 0 || row >= size || col >= size) return false;
    if (grid[row][col] && grid[row][col] !== word[index]) return false;
  }
  return true;
}

function getPlacementDirections(mode) {
  if (mode === 'easy') {
    return [{ row: 0, col: 1 }];
  }

  if (mode === 'moderate') {
    return [
      { row: 0, col: 1 },
      { row: 1, col: 0 }
    ];
  }

  return [
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
    { row: 1, col: -1 },
    { row: 0, col: -1 },
    { row: -1, col: 0 },
    { row: -1, col: -1 },
    { row: -1, col: 1 }
  ];
}

function placeWord(grid, entry, mode, size) {
  const directions = shuffle(getPlacementDirections(mode));

  for (let attempt = 0; attempt < 900; attempt += 1) {
    const direction = directions[attempt % directions.length];
    const minRow = direction.row < 0 ? entry.text.length - 1 : 0;
    const maxRow = direction.row > 0 ? size - entry.text.length : size - 1;
    const minCol = direction.col < 0 ? entry.text.length - 1 : 0;
    const maxCol = direction.col > 0 ? size - entry.text.length : size - 1;

    if (minRow > maxRow || minCol > maxCol) continue;

    const startRow = randomInt(minRow, maxRow);
    const startCol = randomInt(minCol, maxCol);

    if (!canPlaceWord(grid, entry.text, startRow, startCol, direction, size)) continue;

    const cells = [];
    for (let index = 0; index < entry.text.length; index += 1) {
      const row = startRow + direction.row * index;
      const col = startCol + direction.col * index;
      grid[row][col] = entry.text[index];
      cells.push({ row, col });
    }

    return { ...entry, cells, direction };
  }

  return null;
}

function generatePuzzleGrid(entries, mode, size) {
  const sortedEntries = [...entries].sort((a, b) => b.text.length - a.text.length);

  for (let fullAttempt = 0; fullAttempt < 60; fullAttempt += 1) {
    const grid = createEmptyGrid(size);
    const placed = [];
    let failed = false;

    for (const entry of sortedEntries) {
      const result = placeWord(grid, entry, mode, size);
      if (!result) {
        failed = true;
        break;
      }
      placed.push(result);
    }

    if (!failed) {
      fillEmptyCells(grid, size);
      const originalOrder = entries.map((entry) => placed.find((word) => word.text === entry.text));
      return { grid, words: originalOrder };
    }
  }

  return null;
}

function findWordCells(grid, word) {
  if (!Array.isArray(grid) || !word) return [];
  const directions = [
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: 1 },
    { row: 1, col: -1 },
    { row: 0, col: -1 },
    { row: -1, col: 0 },
    { row: -1, col: -1 },
    { row: -1, col: 1 }
  ];

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      for (const direction of directions) {
        const cells = [];
        let match = true;

        for (let index = 0; index < word.length; index += 1) {
          const nextRow = row + direction.row * index;
          const nextCol = col + direction.col * index;
          if (
            nextRow < 0 ||
            nextCol < 0 ||
            nextRow >= grid.length ||
            nextCol >= grid[nextRow].length ||
            grid[nextRow][nextCol] !== word[index]
          ) {
            match = false;
            break;
          }
          cells.push({ row: nextRow, col: nextCol });
        }

        if (match) return cells;
      }
    }
  }

  return [];
}

async function findPuzzle(puzzleId) {
  const puzzles = await listCollection(COLLECTIONS.puzzles);
  return puzzles.find((puzzle) => puzzle.id === puzzleId);
}

function findOrCreatePlayer(submissions, puzzleId, rollNo, name) {
  const id = submissionId(puzzleId, rollNo);
  let player = submissions.find(
    (entry) => entry.puzzleId === puzzleId && entry.rollNo.toLowerCase() === rollNo.toLowerCase()
  );

  if (!player) {
    player = {
      id,
      puzzleId,
      rollNo,
      name,
      foundWords: [],
      score: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    submissions.push(player);
  } else {
    player.id = player.id || id;
    player.name = name;
    player.updatedAt = new Date().toISOString();
  }

  return player;
}

function getFoundDetails(puzzle, foundWords) {
  const words = getPuzzleWords(puzzle);
  return foundWords
    .map((word) => {
      const match = words.find((entry) => entry.text === word);
      if (!match) return null;
      return {
        word: match.text,
        description: match.description,
        cells: match.cells || []
      };
    })
    .filter(Boolean);
}

async function serializeLeaderboard(puzzleId, limit = 0) {
  const submissions = await listCollection(COLLECTIONS.submissions);
  const ranking = submissions
    .filter((entry) => entry.puzzleId === puzzleId)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    })
    .map((entry, index) => ({
      rank: index + 1,
      name: entry.name,
      rollNo: entry.rollNo,
      score: entry.score,
      foundCount: Array.isArray(entry.foundWords) ? entry.foundWords.length : 0,
      foundWords: Array.isArray(entry.foundWords) ? entry.foundWords : [],
      updatedAt: entry.updatedAt,
      completedAt: entry.completedAt || null
    }));

  return limit > 0 ? ranking.slice(0, limit) : ranking;
}

function isPuzzleOwner(puzzle, user) {
  return user && (puzzle.creatorId === user.id || puzzle.creator === user.id);
}

app.post(['/api/auth/register', '/api/register'], asyncHandler(async (req, res) => {
  const name = cleanText(req.body.name || '', 80);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (shouldUseFirebaseAuth()) {
    ensureFirebaseAuthReady();
    const authData = await firebaseAuthRequest('accounts:signUp', {
      email,
      password,
      returnSecureToken: true
    });
    let token = authData.idToken;

    try {
      const updated = await firebaseAuthRequest('accounts:update', {
        idToken: authData.idToken,
        displayName: name,
        returnSecureToken: true
      });
      token = updated.idToken || token;
    } catch (error) {
      // Profile display name is helpful but not required; Firestore stores the canonical teacher name.
    }

    const user = {
      id: authData.localId,
      name,
      email,
      createdAt: new Date().toISOString()
    };
    await saveDocument(COLLECTIONS.users, user.id, user);

    return res.status(201).json({
      message: 'Account created.',
      token,
      user
    });
  }

  const users = await listCollection(COLLECTIONS.users);
  if (users.some((user) => user.email === email)) {
    return res.status(409).json({ error: 'This email already has an account.' });
  }

  const user = {
    id: createId('user_'),
    name,
    email,
    password: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString()
  };

  await saveDocument(COLLECTIONS.users, user.id, user);

  return res.status(201).json({
    message: 'Account created.',
    ...createLocalAuthResponse(user)
  });
}));

app.post(['/api/auth/login', '/api/login'], asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (shouldUseFirebaseAuth()) {
    ensureFirebaseAuthReady();
    const authData = await firebaseAuthRequest('accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true
    });
    let user = await getDocument(COLLECTIONS.users, authData.localId);

    if (!user) {
      user = {
        id: authData.localId,
        name: authData.displayName || email.split('@')[0],
        email,
        createdAt: new Date().toISOString()
      };
      await saveDocument(COLLECTIONS.users, user.id, user);
    }

    return res.json({
      token: authData.idToken,
      user: { id: user.id, name: user.name, email: user.email }
    });
  }

  const users = await listCollection(COLLECTIONS.users);
  const user = users.find((entry) => entry.email === email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  return res.json(createLocalAuthResponse(user));
}));

app.get('/api/auth/me', authenticate, (req, res) => {
  return res.json({ user: req.user });
});

app.post('/api/reset-password', asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (shouldUseFirebaseAuth()) {
    ensureFirebaseAuthReady();
    await firebaseAuthRequest('accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email
    });
    return res.json({ message: 'Password reset email sent if this account exists.' });
  }

  return res.json({ message: 'Password reset is not connected to email in this local build.' });
}));

app.get('/api/puzzles', authenticate, asyncHandler(async (req, res) => {
  const dbPuzzles = await listCollection(COLLECTIONS.puzzles);
  const puzzles = await Promise.all(dbPuzzles
    .filter((puzzle) => puzzle.creator === req.user.id || puzzle.creatorId === req.user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((puzzle) => puzzleForCreator(puzzle, req)));

  return res.json({ puzzles });
}));

app.get('/api/creator/puzzles/:id', authenticate, asyncHandler(async (req, res) => {
  const puzzle = await findPuzzle(req.params.id);
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  if (!isPuzzleOwner(puzzle, req.user)) return res.status(403).json({ error: 'Only the puzzle creator can view this puzzle.' });
  return res.json({ puzzle: await puzzleForCreator(puzzle, req) });
}));

app.patch('/api/puzzles/:id/status', authenticate, asyncHandler(async (req, res) => {
  const puzzle = await findPuzzle(req.params.id);
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  if (!isPuzzleOwner(puzzle, req.user)) return res.status(403).json({ error: 'Only the puzzle creator can update this puzzle.' });

  const updatedPuzzle = {
    ...puzzle,
    active: req.body.active !== false,
    updatedAt: new Date().toISOString()
  };
  await saveDocument(COLLECTIONS.puzzles, updatedPuzzle.id, updatedPuzzle);

  return res.json({ puzzle: await puzzleForCreator(updatedPuzzle, req) });
}));

app.post(['/api/puzzles', '/api/create-puzzle'], authenticate, asyncHandler(async (req, res) => {
  const title = cleanText(req.body.title || '', 120);
  const overview = cleanText(req.body.overview || req.body.description || '', 700);
  const mode = normalizeMode(req.body.mode || req.body.difficulty);
  const prepared = prepareWordEntries(req.body.entries || req.body.words);
  const entries = prepared.entries;

  if (!title) return res.status(400).json({ error: 'Puzzle title is required.' });
  if (prepared.errors.length > 0) {
    return res.status(400).json({ error: prepared.errors[0], details: prepared.errors });
  }
  if (entries.length < MIN_WORDS) return res.status(400).json({ error: `Add at least ${MIN_WORDS} words.` });
  if (entries.length > MAX_WORDS) return res.status(400).json({ error: `Use ${MAX_WORDS} words or fewer.` });

  const size = calculateGridSize(entries);
  const generated = generatePuzzleGrid(entries, mode, size);
  if (!generated) {
    return res.status(400).json({
      error: 'The puzzle could not fit all words. Try fewer words, shorter words, or a harder mode.'
    });
  }

  const id = createId('puz_');
  const url = `/play.html?id=${encodeURIComponent(id)}`;
  const playUrl = `${publicBaseUrl(req)}${url}`;
  const qrData = await QRCode.toDataURL(playUrl, {
    margin: 1,
    width: 340,
    color: { dark: '#172033', light: '#ffffff' }
  });

  const puzzle = {
    id,
    title,
    overview,
    mode,
    active: true,
    size,
    creatorId: req.user.id,
    creator: req.user.id,
    creatorName: req.user.name,
    words: generated.words,
    grid: generated.grid,
    url,
    qrData,
    createdAt: new Date().toISOString()
  };

  await saveDocument(COLLECTIONS.puzzles, puzzle.id, puzzle);

  return res.status(201).json({
    puzzle: await puzzleForCreator(puzzle, req),
    publicPuzzle: publicPuzzle(puzzle)
  });
}));

app.get(['/api/puzzles/:id', '/api/puzzle/:id'], asyncHandler(async (req, res) => {
  const puzzle = await findPuzzle(req.params.id);
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  return res.json({ puzzle: publicPuzzle(puzzle) });
}));

app.post('/api/puzzles/:id/join', asyncHandler(async (req, res) => {
  const puzzle = await findPuzzle(req.params.id);
  const rollNo = cleanText(req.body.rollNo || '', 60);
  const name = cleanText(req.body.name || '', 80);

  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  if (puzzle.active === false) return res.status(403).json({ error: 'This puzzle is closed and is not accepting replies.' });
  if (!rollNo || !name) return res.status(400).json({ error: 'Roll number and name are required.' });

  const submissions = await listCollection(COLLECTIONS.submissions);
  const player = findOrCreatePlayer(submissions, puzzle.id, rollNo, name);
  await saveDocument(COLLECTIONS.submissions, player.id, player);

  return res.json({
    puzzle: publicPuzzle(puzzle),
    player: {
      name: player.name,
      rollNo: player.rollNo,
      score: player.score,
      found: getFoundDetails(puzzle, player.foundWords)
    }
  });
}));

app.post(['/api/puzzles/:id/words', '/api/submit-word'], asyncHandler(async (req, res) => {
  const puzzleId = req.params.id || req.body.id;
  const puzzle = await findPuzzle(puzzleId);
  const rollNo = cleanText(req.body.rollNo || '', 60);
  const name = cleanText(req.body.name || '', 80);
  const submittedWord = normalizeWord(req.body.word || '');

  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  if (puzzle.active === false) return res.status(403).json({ error: 'This puzzle is closed and is not accepting replies.' });
  if (!rollNo || !name || !submittedWord) {
    return res.status(400).json({ error: 'Roll number, name, and word are required.' });
  }

  const words = getPuzzleWords(puzzle);
  const match = words.find((entry) => entry.text === submittedWord);
  const submissions = await listCollection(COLLECTIONS.submissions);
  const player = findOrCreatePlayer(submissions, puzzle.id, rollNo, name);

  if (!match) {
    await saveDocument(COLLECTIONS.submissions, player.id, player);
    return res.json({
      valid: false,
      message: 'That word is not part of this puzzle.',
      score: player.score
    });
  }

  if (player.foundWords.includes(match.text)) {
    await saveDocument(COLLECTIONS.submissions, player.id, player);
    return res.json({
      valid: false,
      alreadyFound: true,
      message: 'This word is already found.',
      word: match.text,
      description: match.description,
      cells: match.cells || [],
      score: player.score
    });
  }

  player.foundWords.push(match.text);
  player.score = player.foundWords.length;
  player.updatedAt = new Date().toISOString();
  if (player.score === words.length) player.completedAt = new Date().toISOString();
  await saveDocument(COLLECTIONS.submissions, player.id, player);

  return res.json({
    valid: true,
    word: match.text,
    description: match.description,
    cells: match.cells || [],
    score: player.score,
    progress: {
      found: player.score,
      total: words.length,
      completed: player.score === words.length
    },
    topLeaderboard: player.score === words.length ? await serializeLeaderboard(puzzle.id, 3) : []
  });
}));

app.get('/api/puzzles/:id/leaderboard', authenticate, asyncHandler(async (req, res) => {
  const puzzle = await findPuzzle(req.params.id);
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  if (!isPuzzleOwner(puzzle, req.user)) return res.status(403).json({ error: 'Only the puzzle creator can view this leaderboard.' });
  return res.json({ leaderboard: await serializeLeaderboard(puzzle.id) });
}));

app.get(['/api/puzzles/:id/top-leaderboard', '/api/leaderboard/:id'], asyncHandler(async (req, res) => {
  const puzzle = await findPuzzle(req.params.id);
  if (!puzzle) return res.status(404).json({ error: 'Puzzle not found.' });
  return res.json({ leaderboard: await serializeLeaderboard(puzzle.id, 3) });
}));

app.get('/api/health', (req, res) => {
  const firebase = firebaseConfigStatus();
  let admin = 'not-configured';
  let adminError = '';

  try {
    admin = getFirestore() ? 'ready' : 'local-fallback';
  } catch (error) {
    admin = 'error';
    adminError = error.message;
  }

  res.json({
    ok: true,
    status: 'running',
    runtime: {
      node: process.version,
      vercel: process.env.VERCEL ? 'yes' : 'no',
      nodeEnv: process.env.NODE_ENV || 'unset'
    },
    firebase: {
      ...firebase,
      admin,
      adminError
    }
  });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  const statusCode = error.statusCode || error.status || 500;
  return res.status(statusCode).json({ error: error.message || 'Server error.' });
});

if (!isHostedRuntime() && !process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 && !process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_CLIENT_EMAIL && !process.env.FIREBASE_PRIVATE_KEY) {
  ensureDataFiles();
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Puzzle app running on http://localhost:${PORT}`);
  });
}

module.exports = app;
