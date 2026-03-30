const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

const MODES = [
  { key: "easy", label: "Easy", cols: 4, rows: 3 },
  { key: "medium", label: "Medium", cols: 5, rows: 4 },
  { key: "hard", label: "Hard", cols: 6, rows: 5 },
  { key: "insane", label: "Insane", cols: 8, rows: 7 },
  { key: "no", label: "No", cols: 9, rows: 10 }
];

const EMOJIS = [
  "🐸", "🦆", "😀", "😎", "🤖", "👾", "🔥", "⭐", "🌈", "⚡",
  "🍉", "🍓", "🍔", "🍟", "🍕", "🧃", "🎮", "🎲", "🎯", "🎵",
  "🚀", "🛸", "🚗", "🚕", "🚁", "⛵", "🌙", "☀️", "☁️", "🌧️",
  "🌸", "🌵", "🌴", "🍄", "🐱", "🐶", "🐼", "🦊", "🐙", "🐢",
  "🦋", "🐝", "🐠", "🦖", "🦕", "💎", "🔮", "🧠", "🎈", "🧩",
  "🎁", "📦", "💡", "🕹️", "🛹", "🎨", "📷", "💻", "⌛", "🪐",
  "🧸", "🎀", "🥝", "🍇", "🍒", "🥑", "🌽", "🥕", "🥥", "🍋",
  "🦀", "🦐", "🦑", "🪼", "🐬", "🦩", "🦚", "🐇", "🦔", "🐿️",
  "🧙", "🛡️", "🗝️", "📀", "🎹", "🎻", "🪙", "🪄", "🧪", "🛰️"
];

const STORAGE_KEY = "emojiMemoryMatchBestScores";

const state = {
  currentMode: MODES[0],
  tiles: [],
  firstSelection: null,
  secondSelection: null,
  resolvingPair: false,
  matchesFound: 0,
  moves: 0,
  gameWon: false,
  hoverTarget: null,
  started: false,
  timerSeconds: 0,
  timerRunning: false,
  lastFrameTime: performance.now(),
  bestScores: loadBestScores()
};

const ui = {
  modeButtons: [],
  restartButton: null,
  startButton: null
};

function loadBestScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveBestScores() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bestScores));
  } catch (error) {
    // ignore
  }
}

function getBestScore(modeKey) {
  return state.bestScores[modeKey] || null;
}

function updateBestScoreIfNeeded() {
  if (!state.currentMode) {
    return;
  }

  const modeKey = state.currentMode.key;
  const currentScore = {
    moves: state.moves,
    time: Math.floor(state.timerSeconds)
  };

  const existing = getBestScore(modeKey);

  if (
    !existing ||
    currentScore.moves < existing.moves ||
    (currentScore.moves === existing.moves && currentScore.time < existing.time)
  ) {
    state.bestScores[modeKey] = currentScore;
    saveBestScores();
  }
}

function formatTime(totalSeconds) {
  const seconds = Math.floor(totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function chooseRandomUniqueEmojis(count) {
  const pool = [...EMOJIS];
  shuffleArray(pool);
  return pool.slice(0, count);
}

function buildDeck(mode) {
  const totalTiles = mode.cols * mode.rows;
  const pairCount = totalTiles / 2;
  const selectedEmojis = chooseRandomUniqueEmojis(pairCount);
  const deck = [];

  for (const emoji of selectedEmojis) {
    deck.push(emoji, emoji);
  }

  shuffleArray(deck);
  return deck;
}

function createTilesForMode(mode, deck) {
  const boardArea = getBoardArea(mode);
  const gap = boardArea.gap;
  const tileWidth = (boardArea.width - gap * (mode.cols - 1)) / mode.cols;
  const tileHeight = (boardArea.height - gap * (mode.rows - 1)) / mode.rows;

  const tiles = [];

  for (let row = 0; row < mode.rows; row += 1) {
    for (let col = 0; col < mode.cols; col += 1) {
      const index = row * mode.cols + col;
      const x = boardArea.x + col * (tileWidth + gap);
      const y = boardArea.y + row * (tileHeight + gap);

      tiles.push({
        index,
        row,
        col,
        x,
        y,
        width: tileWidth,
        height: tileHeight,
        emoji: deck[index],
        revealed: false,
        matched: false,
        faceProgress: 0,
        targetFaceProgress: 0
      });
    }
  }

  return tiles;
}

function getBoardArea(mode) {
  const panelX = 80;
  const panelY = 180;
  const panelWidth = 1760;
  const panelHeight = 820;

  const padding = 34;
  const gap = mode.cols >= 8 || mode.rows >= 8 ? 14 : 18;

  const usableWidth = panelWidth - padding * 2;
  const usableHeight = panelHeight - padding * 2;

  const boardRatio = mode.cols / mode.rows;
  let boardWidth = usableWidth;
  let boardHeight = boardWidth / boardRatio;

  if (boardHeight > usableHeight) {
    boardHeight = usableHeight;
    boardWidth = boardHeight * boardRatio;
  }

  return {
    x: panelX + (panelWidth - boardWidth) / 2,
    y: panelY + (panelHeight - boardHeight) / 2,
    width: boardWidth,
    height: boardHeight,
    gap
  };
}

function layoutUi() {
  const topY = 52;
  const buttonHeight = 66;
  const gap = 18;
  const startX = 80;
  const widths = [160, 190, 150, 180, 120];

  ui.modeButtons = MODES.map((mode, index) => {
    let x = startX;
    for (let i = 0; i < index; i += 1) {
      x += widths[i] + gap;
    }

    return {
      type: "mode",
      modeKey: mode.key,
      label: mode.label,
      x,
      y: topY,
      width: widths[index],
      height: buttonHeight
    };
  });

  ui.restartButton = {
    type: "restart",
    x: CANVAS_WIDTH - 290,
    y: topY,
    width: 210,
    height: buttonHeight,
    label: "Restart"
  };

  ui.startButton = {
    type: "start",
    x: CANVAS_WIDTH - 290,
    y: topY,
    width: 210,
    height: buttonHeight,
    label: "Start Game"
  };
}

function resetTurnState() {
  state.firstSelection = null;
  state.secondSelection = null;
  state.resolvingPair = false;
}

function resetBoard(modeKey = state.currentMode.key) {
  const mode = MODES.find((entry) => entry.key === modeKey);
  if (!mode) {
    return;
  }

  const deck = buildDeck(mode);

  state.currentMode = mode;
  state.tiles = createTilesForMode(mode, deck);
  state.firstSelection = null;
  state.secondSelection = null;
  state.resolvingPair = false;
  state.matchesFound = 0;
  state.moves = 0;
  state.gameWon = false;
  state.timerSeconds = 0;
  state.timerRunning = false;
  state.started = false;
}

function beginGame() {
  if (state.started || state.gameWon) {
    return;
  }

  state.started = true;
  state.timerRunning = true;
}

function restartCurrentMode() {
  resetBoard(state.currentMode.key);
}

function setTileReveal(tile, revealed) {
  tile.revealed = revealed;
  tile.targetFaceProgress = revealed || tile.matched ? 1 : 0;
}

function syncMatchedTiles() {
  for (const tile of state.tiles) {
    if (tile.matched) {
      tile.targetFaceProgress = 1;
    }
  }
}

function updateTileAnimations(deltaTime) {
  const speed = 7.5;

  for (const tile of state.tiles) {
    const difference = tile.targetFaceProgress - tile.faceProgress;
    if (Math.abs(difference) < 0.001) {
      tile.faceProgress = tile.targetFaceProgress;
      continue;
    }

    tile.faceProgress += difference * Math.min(1, deltaTime * speed);
  }
}

function updateTimer(deltaTime) {
  if (state.timerRunning && state.started && !state.gameWon) {
    state.timerSeconds += deltaTime;
  }
}

function drawRoundedRect(x, y, width, height, radius, fillStyle, strokeStyle = null, lineWidth = 0) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fillStyle = fillStyle;
  ctx.fill();

  if (strokeStyle && lineWidth > 0) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawRoundedRectPath(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#020617");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawRoundedRect(40, 28, 1840, 1024, 28, "rgba(15, 23, 42, 0.55)", "rgba(148, 163, 184, 0.18)", 3);
  drawRoundedRect(80, 180, 1760, 820, 26, "rgba(17, 24, 39, 0.82)", "rgba(148, 163, 184, 0.12)", 3);
}

function drawButton(button, active = false, hover = false, primary = false) {
  let fill = "rgba(148, 163, 184, 0.14)";
  let stroke = "rgba(148, 163, 184, 0.22)";
  let textColor = "#e5e7eb";

  if (primary || active) {
    fill = "#38bdf8";
    stroke = "#7dd3fc";
    textColor = "#082f49";
  } else if (hover) {
    fill = "rgba(148, 163, 184, 0.22)";
  }

  drawRoundedRect(button.x, button.y, button.width, button.height, 999, fill, stroke, 3);

  ctx.fillStyle = textColor;
  ctx.font = "700 30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(button.label, button.x + button.width / 2, button.y + button.height / 2);
}

function drawHeader() {
  for (const button of ui.modeButtons) {
    drawButton(
      button,
      state.currentMode && state.currentMode.key === button.modeKey,
      state.hoverTarget === button.modeKey
    );
  }

  if (!state.started && !state.gameWon) {
    drawButton(
      ui.startButton,
      false,
      state.hoverTarget === "start",
      true
    );
  }

  if (state.started || state.gameWon) {
    drawButton(
      ui.restartButton,
      false,
      state.hoverTarget === "restart"
    );
  }
}

function drawStats() {
  const statsRightX = 1810;
  const statsY = 188;
  const lineGap = 52;

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 28px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";

  const modeText = state.currentMode ? state.currentMode.label : "None";
  const totalPairs = state.currentMode ? (state.currentMode.cols * state.currentMode.rows) / 2 : 0;
  const best = state.currentMode ? getBestScore(state.currentMode.key) : null;

  ctx.fillText(`Mode: ${modeText}`, statsRightX, statsY);
  ctx.fillText(`Moves: ${state.moves}`, statsRightX, statsY + lineGap);
  ctx.fillText(`Time: ${formatTime(state.timerSeconds)}`, statsRightX, statsY + lineGap * 2);
  ctx.fillText(`Pairs: ${state.matchesFound} / ${totalPairs}`, statsRightX, statsY + lineGap * 3);

  if (best) {
    ctx.fillText(`Best: ${best.moves} moves • ${formatTime(best.time)}`, statsRightX, statsY + lineGap * 4);
  } else {
    ctx.fillText("Best: None yet", statsRightX, statsY + lineGap * 4);
  }
}

function drawTile(tile) {
  const progress = tile.faceProgress;
  const clamped = Math.max(0, Math.min(1, progress));
  const widthScale = Math.abs(Math.cos((1 - clamped) * Math.PI));
  const visibleWidth = Math.max(6, tile.width * widthScale);
  const drawX = tile.x + (tile.width - visibleWidth) / 2;
  const radius = Math.min(visibleWidth, tile.height) * 0.16;

  const showingFront = clamped >= 0.5;
  let fill = "rgba(30, 41, 59, 0.95)";
  let stroke = "rgba(148, 163, 184, 0.15)";

  if (tile.matched) {
    fill = "rgba(56, 189, 248, 0.20)";
    stroke = "rgba(56, 189, 248, 0.55)";
  } else if (showingFront) {
    fill = "rgba(148, 163, 184, 0.14)";
    stroke = "rgba(148, 163, 184, 0.28)";
  } else if (state.hoverTarget === tile.index && !state.resolvingPair && !state.gameWon && state.started) {
    fill = "rgba(51, 65, 85, 0.98)";
    stroke = "rgba(148, 163, 184, 0.32)";
  }

  drawRoundedRect(drawX, tile.y, visibleWidth, tile.height, radius, fill, stroke, 3);

  ctx.save();
  drawRoundedRectPath(drawX, tile.y, visibleWidth, tile.height, radius);
  ctx.clip();

  if (showingFront) {
    const emojiFontSize = Math.floor(Math.min(tile.width, tile.height) * 0.42);
    ctx.font = `700 ${emojiFontSize}px Arial`;
    ctx.fillStyle = "#e5e7eb";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(tile.emoji, tile.x + tile.width / 2, tile.y + tile.height / 2 + emojiFontSize * 0.02);
  } else {
    ctx.fillStyle = "#38bdf8";
    ctx.font = `700 ${Math.floor(Math.min(tile.width, tile.height) * 0.22)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", tile.x + tile.width / 2, tile.y + tile.height / 2);
  }

  ctx.restore();
}

function drawTiles() {
  for (const tile of state.tiles) {
    drawTile(tile);
  }
}

function drawStartOverlay() {
  if (state.started) {
    return;
  }

  ctx.fillStyle = "rgba(2, 6, 23, 0.58)";
  ctx.fillRect(80, 180, 1760, 820);

  drawRoundedRect(560, 320, 800, 380, 30, "rgba(17, 24, 39, 0.97)", "rgba(56, 189, 248, 0.28)", 4);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 34px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("READY?", 960, 405);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "700 72px Arial";
  ctx.fillText("Start matching!", 960, 485);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 30px Arial";
  ctx.fillText(`Mode: ${state.currentMode.label}`, 960, 550);
  ctx.fillText("Pick a mode if you want, then press Start Game", 960, 600);
}

function drawWinOverlay() {
  if (!state.gameWon) {
    return;
  }

  ctx.fillStyle = "rgba(2, 6, 23, 0.62)";
  ctx.fillRect(80, 180, 1760, 820);

  drawRoundedRect(540, 300, 840, 400, 30, "rgba(17, 24, 39, 0.96)", "rgba(56, 189, 248, 0.28)", 4);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 34px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("YOU WIN", 960, 390);

  ctx.fillStyle = "#e5e7eb";
  ctx.font = "700 72px Arial";
  ctx.fillText("All matched!", 960, 470);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 32px Arial";
  ctx.fillText(`Moves: ${state.moves}`, 960, 540);
  ctx.fillText(`Time: ${formatTime(state.timerSeconds)}`, 960, 590);

  const best = getBestScore(state.currentMode.key);
  if (best) {
    ctx.fillText(`Best: ${best.moves} moves • ${formatTime(best.time)}`, 960, 640);
  }

  ctx.fillText("Press Restart or choose a mode to play again", 960, 690);
}

function pointInRect(px, py, rect) {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

function getCanvasPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  let clientX;
  let clientY;

  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function getHoveredThing(x, y) {
  for (const button of ui.modeButtons) {
    if (pointInRect(x, y, button)) {
      return button.modeKey;
    }
  }

  if ((state.started || state.gameWon) && pointInRect(x, y, ui.restartButton)) {
    return "restart";
  }

  if (!state.started && !state.gameWon && pointInRect(x, y, ui.startButton)) {
    return "start";
  }

  for (const tile of state.tiles) {
    if (pointInRect(x, y, tile)) {
      return tile.index;
    }
  }

  return null;
}

function handleBoardClick(tileIndex) {
  if (!state.started || state.resolvingPair || state.gameWon) {
    return;
  }

  const tile = state.tiles[tileIndex];
  if (!tile || tile.revealed || tile.matched) {
    return;
  }

  setTileReveal(tile, true);

  if (state.firstSelection === null) {
    state.firstSelection = tileIndex;
    return;
  }

  if (state.firstSelection === tileIndex) {
    return;
  }

  state.secondSelection = tileIndex;
  state.moves += 1;
  state.resolvingPair = true;

  const firstTile = state.tiles[state.firstSelection];
  const secondTile = state.tiles[state.secondSelection];

  if (firstTile.emoji === secondTile.emoji) {
    window.setTimeout(() => {
      firstTile.matched = true;
      secondTile.matched = true;
      syncMatchedTiles();

      state.matchesFound += 1;
      resetTurnState();

      const totalPairs = (state.currentMode.cols * state.currentMode.rows) / 2;
      if (state.matchesFound === totalPairs) {
        state.gameWon = true;
        state.timerRunning = false;
        updateBestScoreIfNeeded();
      }
    }, 320);
  } else {
    window.setTimeout(() => {
      setTileReveal(firstTile, false);
      setTileReveal(secondTile, false);
      resetTurnState();
    }, 850);
  }
}

function handlePointerMove(event) {
  const pos = getCanvasPointerPosition(event);
  state.hoverTarget = getHoveredThing(pos.x, pos.y);
}

function handlePointerLeave() {
  state.hoverTarget = null;
}

function handlePointerDown(event) {
  event.preventDefault();
  const pos = getCanvasPointerPosition(event);
  const target = getHoveredThing(pos.x, pos.y);

  if (target === "restart") {
    restartCurrentMode();
    return;
  }

  if (target === "start") {
    beginGame();
    return;
  }

  if (typeof target === "string") {
    resetBoard(target);
    return;
  }

  if (typeof target === "number") {
    handleBoardClick(target);
  }
}

function setupInput() {
  canvas.addEventListener("mousemove", handlePointerMove);
  canvas.addEventListener("mouseleave", handlePointerLeave);
  canvas.addEventListener("mousedown", handlePointerDown);
  canvas.addEventListener("touchstart", handlePointerDown, { passive: false });
}

function update(deltaTime) {
  updateTileAnimations(deltaTime);
  updateTimer(deltaTime);
}

function render() {
  drawBackground();
  drawHeader();
  drawStats();
  drawTiles();
  drawStartOverlay();
  drawWinOverlay();
}

function gameLoop(currentTime) {
  const deltaTime = Math.min(0.05, (currentTime - state.lastFrameTime) / 1000);
  state.lastFrameTime = currentTime;

  update(deltaTime);
  render();
  requestAnimationFrame(gameLoop);
}

function init() {
  layoutUi();
  resetBoard("easy");
  setupInput();
  requestAnimationFrame((time) => {
    state.lastFrameTime = time;
    gameLoop(time);
  });
}

init();