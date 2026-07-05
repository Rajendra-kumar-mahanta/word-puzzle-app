const state = {
  puzzle: null,
  player: null,
  foundWords: new Set()
};

const elements = {
  joinPanel: document.getElementById('join-panel'),
  joinForm: document.getElementById('join-form'),
  joinTitle: document.getElementById('join-title'),
  joinWordCount: document.getElementById('join-word-count'),
  joinMessage: document.getElementById('join-message'),
  playId: document.getElementById('play-id'),
  rollNo: document.getElementById('play-rollno'),
  name: document.getElementById('play-name'),
  gameLayout: document.getElementById('game-layout'),
  progress: document.getElementById('player-progress'),
  puzzleTitle: document.getElementById('puzzle-title'),
  puzzleMeta: document.getElementById('puzzle-meta'),
  wordCount: document.getElementById('word-count'),
  puzzleGrid: document.getElementById('puzzle-grid'),
  wordForm: document.getElementById('word-form'),
  wordInputs: document.getElementById('word-inputs'),
  playMessage: document.getElementById('play-message'),
  topThreePanel: document.getElementById('top-three-panel'),
  topThreeList: document.getElementById('top-three-list'),
  popup: document.getElementById('description-popup'),
  popupDescription: document.getElementById('popup-description'),
  closePopupButton: document.getElementById('btn-close-popup')
};

function queryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function showMessage(element, message, tone = 'neutral') {
  element.textContent = message;
  element.classList.remove('success', 'error');
  if (tone === 'success') element.classList.add('success');
  if (tone === 'error') element.classList.add('error');
}

function normalizeWord(value) {
  return value.toUpperCase().replace(/[^A-Z]/g, '');
}

function formatMode(mode) {
  if (mode === 'easy' || mode === 'normal') return 'Easy';
  if (mode === 'moderate') return 'Moderate';
  return 'Hard';
}

async function loadPuzzlePreview(id) {
  if (!id) return;

  try {
    const data = await api(`/puzzles/${encodeURIComponent(id)}`);
    state.puzzle = data.puzzle;
    elements.joinTitle.textContent = data.puzzle.title;
    elements.joinWordCount.textContent = `${formatMode(data.puzzle.mode)} | ${data.puzzle.size}x${data.puzzle.size} | ${data.puzzle.wordCount}`;
    elements.joinWordCount.classList.remove('hidden');
    showMessage(
      elements.joinMessage,
      data.puzzle.active === false ? 'This puzzle is closed and is not accepting replies.' : ''
    );
  } catch (error) {
    state.puzzle = null;
    elements.joinTitle.textContent = 'Join Puzzle';
    elements.joinWordCount.classList.add('hidden');
    showMessage(elements.joinMessage, error.message, 'error');
  }
}

async function joinPuzzle(event) {
  event.preventDefault();
  const id = elements.playId.value.trim();
  const rollNo = elements.rollNo.value.trim();
  const name = elements.name.value.trim();

  if (!id || !rollNo || !name) {
    showMessage(elements.joinMessage, 'Puzzle ID, roll number, and name are required.', 'error');
    return;
  }

  try {
    const data = await api(`/puzzles/${encodeURIComponent(id)}/join`, {
      method: 'POST',
      body: JSON.stringify({ rollNo, name })
    });

    state.puzzle = data.puzzle;
    state.player = data.player;
    state.foundWords = new Set(data.player.found.map((entry) => entry.word));
    renderGame(data.player.found);
    showMessage(elements.joinMessage, '');
  } catch (error) {
    showMessage(elements.joinMessage, error.message, 'error');
  }
}

function renderGame(foundEntries = []) {
  elements.joinPanel.classList.add('hidden');
  elements.gameLayout.classList.remove('hidden');
  elements.progress.classList.remove('hidden');
  elements.puzzleTitle.textContent = state.puzzle.title;
  elements.puzzleMeta.textContent = `Created by ${state.puzzle.creatorName} | ${formatMode(state.puzzle.mode)} mode`;
  elements.wordCount.textContent = `${state.puzzle.wordCount} words`;

  renderGrid(state.puzzle.grid);
  renderWordInputs(state.puzzle.wordCount);
  foundEntries.forEach((entry, index) => markWordFound(entry, index));
  updateProgress();
  if (isCompleted()) showTopThree();
}

function renderGrid(matrix) {
  elements.puzzleGrid.innerHTML = '';
  elements.puzzleGrid.style.gridTemplateColumns = `repeat(${matrix.length}, minmax(0, 1fr))`;

  matrix.forEach((row, rowIndex) => {
    row.forEach((letter, colIndex) => {
      const cell = document.createElement('div');
      cell.className = 'puzzle-cell';
      cell.textContent = letter;
      cell.dataset.row = rowIndex;
      cell.dataset.col = colIndex;
      elements.puzzleGrid.appendChild(cell);
    });
  });
}

function renderWordInputs(count) {
  elements.wordInputs.innerHTML = '';

  for (let index = 0; index < count; index += 1) {
    const row = document.createElement('div');
    row.className = 'answer-row';

    const number = document.createElement('span');
    number.className = 'answer-number';
    number.textContent = String(index + 1);

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.setAttribute('aria-label', `Found word ${index + 1}`);
    input.placeholder = 'Found word';

    row.append(number, input);
    elements.wordInputs.appendChild(row);
  }
}

function firstOpenInput() {
  return Array.from(elements.wordInputs.querySelectorAll('input')).find((input) => !input.disabled);
}

function markWordFound(entry, preferredIndex = -1) {
  const inputs = Array.from(elements.wordInputs.querySelectorAll('input'));
  let input = inputs[preferredIndex] && !inputs[preferredIndex].disabled ? inputs[preferredIndex] : null;
  if (!input) input = inputs.find((candidate) => !candidate.disabled && normalizeWord(candidate.value) === entry.word);
  if (!input) input = firstOpenInput();

  if (input) {
    input.value = entry.word;
    input.disabled = true;
    input.classList.remove('invalid');
    input.classList.add('found');
  }

  highlightCells(entry.cells || []);
}

function highlightCells(cells) {
  cells.forEach(({ row, col }) => {
    const cell = elements.puzzleGrid.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.add('highlight');
  });
}

async function submitWords(event) {
  event.preventDefault();
  if (!state.puzzle || !state.player) return;

  const inputs = Array.from(elements.wordInputs.querySelectorAll('input'));
  const candidates = inputs
    .filter((input) => !input.disabled && input.value.trim())
    .map((input) => ({ input, word: input.value.trim() }));

  if (!candidates.length) {
    showMessage(elements.playMessage, 'Enter a found word.', 'error');
    return;
  }

  const descriptions = [];
  let changed = false;

  for (const candidate of candidates) {
    try {
      const data = await api(`/puzzles/${encodeURIComponent(state.puzzle.id)}/words`, {
        method: 'POST',
        body: JSON.stringify({
          rollNo: state.player.rollNo,
          name: state.player.name,
          word: candidate.word
        })
      });

      if (data.valid) {
        state.foundWords.add(data.word);
        markWordFound({ word: data.word, cells: data.cells }, inputs.indexOf(candidate.input));
        descriptions.push({ word: data.word, description: data.description });
        changed = true;
      } else if (data.alreadyFound) {
        highlightCells(data.cells || []);
        candidate.input.classList.add('invalid');
        candidate.input.value = '';
        showMessage(elements.playMessage, data.message, 'error');
      } else {
        candidate.input.classList.add('invalid');
        showMessage(elements.playMessage, data.message, 'error');
      }

      if (data.progress && data.progress.completed) {
        renderTopThree(data.topLeaderboard || []);
      }
    } catch (error) {
      candidate.input.classList.add('invalid');
      showMessage(elements.playMessage, error.message, 'error');
    }
  }

  if (changed) {
    updateProgress();
    showDescriptions(descriptions);
    if (isCompleted()) {
      showMessage(elements.playMessage, 'Puzzle completed. Top 3 unlocked.', 'success');
      await showTopThree();
    } else {
      showMessage(elements.playMessage, 'Correct word found.', 'success');
    }
  }
}

function updateProgress() {
  const found = state.foundWords.size;
  const total = state.puzzle ? state.puzzle.wordCount : 0;
  elements.progress.textContent = `${found}/${total}`;
  elements.progress.classList.toggle('complete', total > 0 && found >= total);
}

function isCompleted() {
  return state.puzzle && state.foundWords.size >= state.puzzle.wordCount;
}

function showDescriptions(items) {
  const unique = items.filter((item, index, source) => source.findIndex((match) => match.word === item.word) === index);
  if (!unique.length) return;

  elements.popupDescription.innerHTML = '';
  unique.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'description-block';
    const word = document.createElement('strong');
    word.textContent = item.word;
    const description = document.createElement('p');
    description.textContent = item.description || 'No description provided.';
    block.append(word, description);
    elements.popupDescription.appendChild(block);
  });
  elements.popup.classList.remove('hidden');
}

async function showTopThree() {
  if (!state.puzzle) return;
  elements.topThreePanel.classList.remove('hidden');
  try {
    const data = await api(`/puzzles/${encodeURIComponent(state.puzzle.id)}/top-leaderboard`);
    renderTopThree(data.leaderboard);
  } catch (error) {
    console.warn(error.message);
  }
}

function renderTopThree(entries) {
  elements.topThreeList.innerHTML = '';

  if (!entries.length) {
    const item = document.createElement('li');
    item.textContent = 'No players yet.';
    elements.topThreeList.appendChild(item);
    return;
  }

  entries.slice(0, 3).forEach((entry) => {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `#${entry.rank} ${entry.name} (${entry.rollNo})`;
    const score = document.createElement('strong');
    score.textContent = `${entry.score} found`;
    item.append(name, score);
    elements.topThreeList.appendChild(item);
  });
}

elements.joinForm.addEventListener('submit', joinPuzzle);
elements.wordForm.addEventListener('submit', submitWords);
elements.closePopupButton.addEventListener('click', () => elements.popup.classList.add('hidden'));
elements.popup.addEventListener('click', (event) => {
  if (event.target === elements.popup) elements.popup.classList.add('hidden');
});
elements.playId.addEventListener('change', () => loadPuzzlePreview(elements.playId.value.trim()));

const initialId = queryParam('id');
if (initialId) {
  elements.playId.value = initialId;
  loadPuzzlePreview(initialId);
}
