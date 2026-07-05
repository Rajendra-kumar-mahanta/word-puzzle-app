const state = {
  token: localStorage.getItem('puzzle_token') || '',
  user: readStoredUser(),
  puzzles: [],
  currentPuzzle: null,
  puzzleLoadRequestId: 0
};

const elements = {
  authView: document.getElementById('auth-view'),
  dashboardView: document.getElementById('dashboard-view'),
  signedInUser: document.getElementById('signed-in-user'),
  logoutButton: document.getElementById('btn-logout'),
  loginTab: document.getElementById('tab-login'),
  registerTab: document.getElementById('tab-register'),
  forgotTab: document.getElementById('tab-forgot'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  forgotForm: document.getElementById('forgot-form'),
  authMessage: document.getElementById('auth-message'),
  navTabs: Array.from(document.querySelectorAll('.nav-tab')),
  dashboardPages: Array.from(document.querySelectorAll('.dashboard-page')),
  liveCount: document.getElementById('dashboard-live-count'),
  closedCount: document.getElementById('dashboard-closed-count'),
  playerCount: document.getElementById('dashboard-player-count'),
  livePuzzleList: document.getElementById('live-puzzle-list'),
  closedPuzzleList: document.getElementById('closed-puzzle-list'),
  puzzleMessage: document.getElementById('puzzle-message'),
  refreshPuzzlesButton: document.getElementById('btn-refresh-puzzles'),
  puzzleForm: document.getElementById('puzzle-form'),
  wordRows: document.getElementById('word-rows'),
  addWordButton: document.getElementById('btn-add-word'),
  createMessage: document.getElementById('create-message'),
  detailStatus: document.getElementById('detail-status'),
  detailTitle: document.getElementById('detail-title'),
  detailOverview: document.getElementById('detail-overview'),
  detailMeta: document.getElementById('detail-meta'),
  detailGrid: document.getElementById('detail-grid'),
  detailWordList: document.getElementById('detail-word-list'),
  detailQr: document.getElementById('detail-qr'),
  detailShareLink: document.getElementById('detail-share-link'),
  detailTopLeaderboard: document.getElementById('detail-top-leaderboard'),
  detailFullLeaderboard: document.getElementById('detail-full-leaderboard'),
  detailOpenLink: document.getElementById('detail-open-link'),
  detailCopyButton: document.getElementById('btn-detail-copy'),
  toggleActiveButton: document.getElementById('btn-toggle-active'),
  backHomeButton: document.getElementById('btn-back-home'),
  shareTitle: document.getElementById('share-title'),
  shareMeta: document.getElementById('share-meta'),
  shareQr: document.getElementById('share-qr'),
  shareLink: document.getElementById('share-link'),
  shareCopyButton: document.getElementById('btn-share-copy'),
  shareDetailButton: document.getElementById('btn-share-detail'),
  createAnotherButton: document.getElementById('btn-create-another')
};

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('puzzle_user') || 'null');
  } catch (error) {
    return null;
  }
}

function showMessage(element, message, tone = 'neutral') {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('success', 'error');
  if (tone === 'success') element.classList.add('success');
  if (tone === 'error') element.classList.add('error');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`/api${path}`, { cache: 'no-store', ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { error: (await response.text().catch(() => '')).slice(0, 180) };

  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }

  return data;
}

function setAuthMode(mode) {
  const login = mode === 'login';
  const register = mode === 'register';
  const forgot = mode === 'forgot';

  elements.loginTab.classList.toggle('active', login);
  elements.registerTab.classList.toggle('active', register);
  elements.forgotTab.classList.toggle('active', forgot);
  elements.loginForm.classList.toggle('hidden', !login);
  elements.registerForm.classList.toggle('hidden', !register);
  elements.forgotForm.classList.toggle('hidden', !forgot);
  showMessage(elements.authMessage, '');
}

function saveSession(data) {
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('puzzle_token', data.token);
  localStorage.setItem('puzzle_user', JSON.stringify(data.user));
}

function clearSession() {
  state.token = '';
  state.user = null;
  state.puzzles = [];
  state.currentPuzzle = null;
  state.puzzleLoadRequestId += 1;
  localStorage.removeItem('puzzle_token');
  localStorage.removeItem('puzzle_user');
  updateDashboardSummary([]);
}

function showAuth() {
  elements.authView.classList.remove('hidden');
  elements.dashboardView.classList.add('hidden');
  elements.signedInUser.classList.add('hidden');
  elements.logoutButton.classList.add('hidden');
  setAuthMode('login');
}

function showDashboard() {
  elements.authView.classList.add('hidden');
  elements.dashboardView.classList.remove('hidden');
  elements.signedInUser.textContent = state.user ? state.user.name : '';
  elements.signedInUser.classList.remove('hidden');
  elements.logoutButton.classList.remove('hidden');
  showPage('home-page');
  loadPuzzles();
}

function showPage(pageId) {
  elements.dashboardPages.forEach((page) => {
    page.classList.toggle('hidden', page.id !== pageId);
  });

  elements.navTabs.forEach((button) => {
    button.classList.toggle('active', button.dataset.page === pageId);
  });

  if (pageId === 'home-page') renderHome();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function createInput({ label, value = '', placeholder = '', maxLength = 200, role = '' }) {
  const wrapper = document.createElement('div');
  const inputLabel = document.createElement('label');
  inputLabel.textContent = label;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (role === 'word') input.autocapitalize = 'characters';
  if (role) input.dataset.role = role;
  input.setAttribute('aria-label', label);

  wrapper.append(inputLabel, input);
  return { wrapper, input };
}

function addWordRow(word = '', description = '') {
  const row = document.createElement('div');
  row.className = 'word-row-editor';

  const wordField = createInput({ label: 'Word', value: word, placeholder: 'MATRIX', maxLength: 15, role: 'word' });
  const descriptionField = createInput({
    label: 'Description',
    value: description,
    placeholder: 'Meaning shown after a correct match',
    maxLength: 700,
    role: 'description'
  });

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'danger-button compact';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    row.remove();
    updateRemoveButtons();
  });

  row.append(wordField.wrapper, descriptionField.wrapper, removeButton);
  elements.wordRows.appendChild(row);
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const rows = Array.from(elements.wordRows.querySelectorAll('.word-row-editor'));
  rows.forEach((row) => {
    const button = row.querySelector('button');
    button.disabled = rows.length <= 3;
  });
}

function resetPuzzleForm() {
  elements.puzzleForm.reset();
  elements.wordRows.innerHTML = '';
  for (let index = 0; index < 3; index += 1) addWordRow();
}

function collectPuzzleForm() {
  const rows = Array.from(elements.wordRows.querySelectorAll('.word-row-editor'));
  const rawEntries = rows.map((row) => {
    const wordInput = row.querySelector('input[data-role="word"]');
    const descriptionInput = row.querySelector('input[data-role="description"]');
    return {
      word: wordInput ? wordInput.value.trim() : '',
      description: descriptionInput ? descriptionInput.value.trim() : ''
    };
  });
  const entries = rawEntries.filter((entry) => entry.word && entry.description);
  const incompleteRows = rawEntries.filter((entry) => (entry.word && !entry.description) || (!entry.word && entry.description));

  return {
    title: document.getElementById('puzzle-title').value.trim(),
    overview: document.getElementById('puzzle-overview').value.trim(),
    mode: document.querySelector('input[name="puzzle-mode"]:checked').value,
    entries,
    incompleteRows
  };
}

function formatMode(mode) {
  if (mode === 'easy' || mode === 'normal') return 'Easy';
  if (mode === 'moderate') return 'Moderate';
  return 'Hard';
}

function formatWordNames(words = []) {
  return words.map((word) => (typeof word === 'string' ? word : word.text)).join(', ');
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveSession(data);
    showMessage(elements.authMessage, 'Signed in.', 'success');
    showDashboard();
  } catch (error) {
    showMessage(elements.authMessage, error.message, 'error');
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    saveSession(data);
    showMessage(elements.authMessage, 'Account created.', 'success');
    showDashboard();
  } catch (error) {
    showMessage(elements.authMessage, error.message, 'error');
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();

  try {
    const data = await api('/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    showMessage(elements.authMessage, data.message || 'Password reset request received.', 'success');
  } catch (error) {
    showMessage(elements.authMessage, error.message, 'error');
  }
}

async function handleCreatePuzzle(event) {
  event.preventDefault();
  const payload = collectPuzzleForm();

  if (payload.entries.length < 3) {
    showMessage(elements.createMessage, 'Add at least 3 words with descriptions.', 'error');
    return;
  }

  if (payload.incompleteRows.length > 0) {
    showMessage(elements.createMessage, 'Every filled word row needs both a word and description.', 'error');
    return;
  }

  try {
    elements.puzzleForm.querySelector('button[type="submit"]').disabled = true;
    showMessage(elements.createMessage, 'Creating puzzle...');
    const data = await api('/puzzles', {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        overview: payload.overview,
        mode: payload.mode,
        entries: payload.entries
      })
    });

    showMessage(elements.createMessage, `Puzzle created with ${data.puzzle.wordCount} words: ${formatWordNames(data.puzzle.words)}.`, 'success');
    upsertPuzzle(data.puzzle);
    resetPuzzleForm();
    renderSharePage(data.puzzle);
    showPage('share-page');
    await loadPuzzles();
  } catch (error) {
    showMessage(elements.createMessage, error.message, 'error');
  } finally {
    elements.puzzleForm.querySelector('button[type="submit"]').disabled = false;
  }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

async function loadPuzzles() {
  if (!state.token) return;

  const requestId = ++state.puzzleLoadRequestId;

  try {
    const data = await api('/puzzles');
    if (requestId !== state.puzzleLoadRequestId) return;
    state.puzzles = data.puzzles;
    updateDashboardSummary(data.puzzles);
    renderHome();
  } catch (error) {
    if (requestId !== state.puzzleLoadRequestId) return;
    renderEmptyList(elements.livePuzzleList, error.message);
    renderEmptyList(elements.closedPuzzleList, '');
  }
}

function upsertPuzzle(puzzle) {
  if (!puzzle) return;
  const nextPuzzles = state.puzzles.filter((entry) => entry.id !== puzzle.id);
  nextPuzzles.unshift(puzzle);
  nextPuzzles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  state.puzzles = nextPuzzles;
  updateDashboardSummary(state.puzzles);
  renderHome();
}

function updateDashboardSummary(puzzles = state.puzzles) {
  const live = puzzles.filter((puzzle) => puzzle.active !== false).length;
  const closed = puzzles.length - live;
  const players = puzzles.reduce((sum, puzzle) => sum + (Number(puzzle.playerCount) || 0), 0);

  elements.liveCount.textContent = String(live);
  elements.closedCount.textContent = String(closed);
  elements.playerCount.textContent = String(players);
}

function renderHome() {
  if (!elements.livePuzzleList || !elements.closedPuzzleList) return;
  renderPuzzleCards(elements.livePuzzleList, state.puzzles.filter((puzzle) => puzzle.active !== false), 'No live puzzles right now.');
  renderPuzzleCards(elements.closedPuzzleList, state.puzzles.filter((puzzle) => puzzle.active === false), 'No closed puzzles yet.');
}

function renderEmptyList(container, message) {
  container.innerHTML = '';
  if (!message) return;
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = message;
  container.appendChild(empty);
}

function renderPuzzleCards(container, puzzles, emptyMessage) {
  container.innerHTML = '';

  if (!puzzles.length) {
    renderEmptyList(container, emptyMessage);
    return;
  }

  puzzles.forEach((puzzle) => {
    const card = document.createElement('article');
    card.className = 'puzzle-card';

    const head = document.createElement('div');
    head.className = 'puzzle-card-head';

    const title = document.createElement('h3');
    title.textContent = puzzle.title;

    const status = document.createElement('span');
    status.className = `status-badge ${puzzle.active === false ? 'closed' : 'live'}`;
    status.textContent = puzzle.active === false ? 'Closed' : 'Live';

    head.append(title, status);

    const overview = document.createElement('p');
    overview.className = 'muted-line puzzle-overview';
    overview.textContent = puzzle.overview || 'No teacher note added.';

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const detailButton = document.createElement('button');
    detailButton.type = 'button';
    detailButton.className = 'primary-button small';
    detailButton.textContent = 'Details';
    detailButton.addEventListener('click', () => openPuzzleDetail(puzzle.id));

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = puzzle.active === false ? 'secondary-button small' : 'ghost-button small';
    toggleButton.textContent = puzzle.active === false ? 'Make live' : 'Close';
    toggleButton.addEventListener('click', () => updatePuzzleStatus(puzzle.id, puzzle.active === false));

    actions.append(detailButton, toggleButton);
    card.append(head, overview, createPuzzleMeta(puzzle), actions);
    container.appendChild(card);
  });
}

function createPuzzleMeta(puzzle) {
  const meta = document.createElement('div');
  meta.className = 'puzzle-meta-row';
  meta.append(
    createMetaChip(formatMode(puzzle.mode), `mode-${puzzle.mode || 'hard'}`),
    createMetaChip(`${puzzle.size || 10}x${puzzle.size || 10}`),
    createMetaChip(`${puzzle.wordCount} words`),
    createMetaChip(`${puzzle.playerCount} students`)
  );
  return meta;
}

function createMetaChip(text, extraClass = '') {
  const chip = document.createElement('span');
  chip.className = `meta-chip ${extraClass}`.trim();
  chip.textContent = text;
  return chip;
}

async function openPuzzleDetail(puzzleId) {
  try {
    showMessage(elements.puzzleMessage, '');
    const data = await api(`/creator/puzzles/${encodeURIComponent(puzzleId)}`);
    state.currentPuzzle = data.puzzle;
    renderPuzzleDetail(data.puzzle);
    showPage('detail-page');
  } catch (error) {
    showMessage(elements.puzzleMessage, error.message, 'error');
  }
}

function renderPuzzleDetail(puzzle) {
  elements.detailStatus.textContent = puzzle.active === false ? 'Closed puzzle' : 'Live puzzle';
  elements.detailTitle.textContent = puzzle.title;
  elements.detailOverview.textContent = puzzle.overview || 'No teacher note added.';
  elements.detailMeta.innerHTML = '';
  elements.detailMeta.append(...Array.from(createPuzzleMeta(puzzle).children));

  renderGrid(elements.detailGrid, puzzle.grid || []);
  renderWordDetailList(puzzle.words || []);
  renderDetailShare(puzzle);
  renderLeaderboard(elements.detailTopLeaderboard, puzzle.topLeaderboard || []);
  renderLeaderboard(elements.detailFullLeaderboard, puzzle.leaderboard || []);

  elements.detailOpenLink.href = puzzle.playUrl;
  elements.detailCopyButton.onclick = async () => {
    await copyText(puzzle.playUrl);
    showMessage(elements.puzzleMessage, 'Link copied.', 'success');
  };
  elements.toggleActiveButton.textContent = puzzle.active === false ? 'Reopen replies' : 'Close replies';
  elements.toggleActiveButton.className = puzzle.active === false ? 'secondary-button small' : 'ghost-button small';
}

function renderDetailShare(puzzle) {
  elements.detailQr.src = puzzle.qrData || '';
  elements.detailQr.classList.toggle('hidden', !puzzle.qrData);
  elements.detailShareLink.href = puzzle.playUrl;
  elements.detailShareLink.textContent = puzzle.playUrl;
}

function renderGrid(container, matrix) {
  container.innerHTML = '';
  container.style.gridTemplateColumns = `repeat(${matrix.length || 10}, minmax(0, 1fr))`;

  matrix.forEach((row) => {
    row.forEach((letter) => {
      const cell = document.createElement('div');
      cell.className = 'puzzle-cell';
      cell.textContent = letter;
      container.appendChild(cell);
    });
  });
}

function renderWordDetailList(words) {
  elements.detailWordList.innerHTML = '';

  if (!words.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No words recorded.';
    elements.detailWordList.appendChild(empty);
    return;
  }

  words.forEach((word) => {
    const block = document.createElement('div');
    block.className = 'word-detail-item';
    const title = document.createElement('strong');
    title.textContent = word.text;
    const description = document.createElement('p');
    description.textContent = word.description || 'No description provided.';
    block.append(title, description);
    elements.detailWordList.appendChild(block);
  });
}

function renderLeaderboard(container, entries) {
  container.innerHTML = '';

  if (!entries.length) {
    const item = document.createElement('li');
    item.textContent = 'No students yet.';
    container.appendChild(item);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `#${entry.rank} ${entry.name} (${entry.rollNo})`;
    const score = document.createElement('strong');
    score.textContent = `${entry.score} found`;
    item.append(name, score);
    container.appendChild(item);
  });
}

async function toggleCurrentPuzzleStatus() {
  if (!state.currentPuzzle) return;
  await updatePuzzleStatus(state.currentPuzzle.id, state.currentPuzzle.active === false, true);
}

async function updatePuzzleStatus(puzzleId, active, keepDetailOpen = false) {
  const previousPuzzle = state.currentPuzzle;

  try {
    const data = await api(`/puzzles/${encodeURIComponent(puzzleId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active })
    });
    state.currentPuzzle = data.puzzle;
    upsertPuzzle(data.puzzle);
    showMessage(elements.puzzleMessage, active ? 'Puzzle is live and accepting replies.' : 'Puzzle is closed for replies.', 'success');
    if (keepDetailOpen || (previousPuzzle && previousPuzzle.id === puzzleId && !document.getElementById('detail-page').classList.contains('hidden'))) {
      renderPuzzleDetail(data.puzzle);
      showPage('detail-page');
    }
  } catch (error) {
    showMessage(elements.puzzleMessage, error.message, 'error');
  }
}

function renderSharePage(puzzle) {
  state.currentPuzzle = puzzle;
  elements.shareTitle.textContent = puzzle.title;
  elements.shareMeta.textContent = `${formatMode(puzzle.mode)} | ${puzzle.size}x${puzzle.size} | ${puzzle.wordCount} words`;
  elements.shareQr.src = puzzle.qrData;
  elements.shareLink.href = puzzle.playUrl;
  elements.shareLink.textContent = puzzle.playUrl;
}

async function boot() {
  resetPuzzleForm();

  if (!state.token) {
    showAuth();
    return;
  }

  try {
    const data = await api('/auth/me');
    state.user = data.user;
    localStorage.setItem('puzzle_user', JSON.stringify(data.user));
    showDashboard();
  } catch (error) {
    showAuth();
  }
}

elements.loginTab.addEventListener('click', () => setAuthMode('login'));
elements.registerTab.addEventListener('click', () => setAuthMode('register'));
elements.forgotTab.addEventListener('click', () => setAuthMode('forgot'));
elements.loginForm.addEventListener('submit', handleLogin);
elements.registerForm.addEventListener('submit', handleRegister);
elements.forgotForm.addEventListener('submit', handleForgotPassword);
elements.logoutButton.addEventListener('click', () => {
  clearSession();
  showAuth();
});
elements.navTabs.forEach((button) => {
  button.addEventListener('click', () => showPage(button.dataset.page));
});
elements.puzzleForm.addEventListener('submit', handleCreatePuzzle);
elements.addWordButton.addEventListener('click', () => addWordRow());
elements.refreshPuzzlesButton.addEventListener('click', loadPuzzles);
elements.backHomeButton.addEventListener('click', () => showPage('home-page'));
elements.toggleActiveButton.addEventListener('click', toggleCurrentPuzzleStatus);
elements.shareCopyButton.addEventListener('click', async () => {
  if (!state.currentPuzzle) return;
  await copyText(state.currentPuzzle.playUrl);
  showMessage(elements.puzzleMessage, 'Link copied.', 'success');
});
elements.shareDetailButton.addEventListener('click', () => {
  if (state.currentPuzzle) openPuzzleDetail(state.currentPuzzle.id);
});
elements.createAnotherButton.addEventListener('click', () => showPage('create-page'));

boot();
