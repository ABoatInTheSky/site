const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

const COLORS = {
  bg: "#020617",
  panel: "rgba(15, 23, 42, 0.92)",
  panelBorder: "rgba(148, 163, 184, 0.2)",
  text: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#38bdf8",
  accentDark: "#082f49",
  green: "#22c55e",
  red: "#ef4444",
  yellow: "#facc15",
  blueFlash: "#38bdf8",
  button: "rgba(148, 163, 184, 0.12)",
  buttonHover: "rgba(148, 163, 184, 0.2)"
};

const TEST_COUNT_OPTIONS = [1, 2, 3, 5, 10, 20];

const SPEED_OPTIONS = [
  { label: "Slow", min: 15, max: 20 },
  { label: "Less Slow", min: 8, max: 15 },
  { label: "Normal", min: 3, max: 10 },
  { label: "Fast", min: 1, max: 4 },
  { label: "Super Fast", min: 0.1, max: 3 },
  { label: "Random", min: 0.1, max: 10 }
];

const CLICK_MODE_OPTIONS = [
  { label: "Click Anywhere", value: "anywhere" },
  { label: "Click Specific Area", value: "target" }
];

const state = {
  screen: "menu",
  selectedTestCountIndex: 3,
  selectedSpeedIndex: 2,
  selectedClickModeIndex: 0,
  currentTest: 0,
  results: [],
  falseStarts: 0,
  waitTimeSeconds: 0,
  readyTimeMs: 0,
  intermissionUntilMs: 0,
  buttonRects: [],
  targetRect: null,
  pointerDown: false,
  hoverX: -1000,
  hoverY: -1000
};

function roundToHundredths(value) {
  return Math.round(value * 100) / 100;
}

function formatMilliseconds(ms) {
  return `${ms.toFixed(0)} ms`;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function getSelectedSpeed() {
  return SPEED_OPTIONS[state.selectedSpeedIndex];
}

function getSelectedTestCount() {
  return TEST_COUNT_OPTIONS[state.selectedTestCountIndex];
}

function getSelectedClickMode() {
  return CLICK_MODE_OPTIONS[state.selectedClickModeIndex].value;
}

function makeButton(x, y, width, height, label, onClick, isPrimary = false, isSelected = false) {
  state.buttonRects.push({
    x,
    y,
    width,
    height,
    label,
    onClick,
    isPrimary,
    isSelected
  });
}

function pointInRect(x, y, rect) {
  return x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height;
}

function getPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function startRun() {
  state.results = [];
  state.falseStarts = 0;
  state.currentTest = 0;
  scheduleNextTest();
}

function scheduleNextTest() {
  const speed = getSelectedSpeed();
  const waitTime = roundToHundredths(randomRange(speed.min, speed.max));

  state.waitTimeSeconds = waitTime;
  state.readyTimeMs = performance.now() + waitTime * 1000;
  state.screen = "waiting";
  state.targetRect = null;
}

function beginReadyState() {
  state.screen = "ready";

  if (getSelectedClickMode() === "target") {
    const targetWidth = 380;
    const targetHeight = 240;
    const margin = 120;

    const x = randomRange(margin, CANVAS_WIDTH - margin - targetWidth);
    const y = randomRange(margin, CANVAS_HEIGHT - margin - targetHeight);

    state.targetRect = {
      x,
      y,
      width: targetWidth,
      height: targetHeight
    };
  } else {
    state.targetRect = null;
  }
}

function registerReaction() {
  const reactionMs = performance.now() - state.readyTimeMs;
  state.results.push(reactionMs);
  state.currentTest += 1;

  if (state.currentTest >= getSelectedTestCount()) {
    state.screen = "results";
    state.targetRect = null;
    return;
  }

  state.screen = "clicked";
  state.intermissionUntilMs = performance.now() + 850;
  state.targetRect = null;
}

function registerFalseStart() {
  state.falseStarts += 1;
  scheduleNextTest();
}

function restartToMenu() {
  state.screen = "menu";
  state.results = [];
  state.falseStarts = 0;
  state.currentTest = 0;
  state.targetRect = null;
}

function update(deltaTime) {
  const now = performance.now();

  if (state.screen === "waiting" && now >= state.readyTimeMs) {
    beginReadyState();
  }

  if (state.screen === "clicked" && now >= state.intermissionUntilMs) {
    scheduleNextTest();
  }
}

function drawBackground() {
  ctx.fillStyle = state.screen === "ready" ? COLORS.blueFlash : COLORS.bg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawPanel(x, y, width, height) {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, width, height);
}

function drawText(text, x, y, size, color = COLORS.text, align = "left", baseline = "alphabetic", weight = "400") {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Arial`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function drawButton(button) {
  const hovered = pointInRect(state.hoverX, state.hoverY, button);
  const fill = button.isPrimary
    ? COLORS.accent
    : hovered || button.isSelected
      ? COLORS.buttonHover
      : COLORS.button;

  ctx.fillStyle = fill;
  ctx.fillRect(button.x, button.y, button.width, button.height);

  ctx.strokeStyle = button.isSelected ? COLORS.accent : COLORS.panelBorder;
  ctx.lineWidth = button.isSelected ? 4 : 2;
  ctx.strokeRect(button.x, button.y, button.width, button.height);

  drawText(
    button.label,
    button.x + button.width / 2,
    button.y + button.height / 2,
    30,
    button.isPrimary ? COLORS.accentDark : COLORS.text,
    "center",
    "middle",
    "700"
  );
}

function drawMenu() {
  drawPanel(100, 50, 1720, 980);

  drawText("Reaction Time Test", CANVAS_WIDTH / 2, 135, 88, COLORS.text, "center", "middle", "700");
  drawText("Choose your settings", CANVAS_WIDTH / 2, 210, 34, COLORS.muted, "center", "middle", "400");

  const leftX = 185;
  const rightX = 995;
  const sectionTop = 305;

  const testButtonWidth = 190;
  const testButtonHeight = 86;
  const testGapX = 26;
  const testGapY = 26;

  const speedButtonWidth = 520;
  const speedButtonHeight = 72;
  const speedGapY = 20;

  drawText("Number of Tests", leftX, sectionTop - 34, 38, COLORS.text, "left", "bottom", "700");

  for (let i = 0; i < TEST_COUNT_OPTIONS.length; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = leftX + col * (testButtonWidth + testGapX);
    const y = sectionTop + row * (testButtonHeight + testGapY);

    makeButton(
      x,
      y,
      testButtonWidth,
      testButtonHeight,
      `${TEST_COUNT_OPTIONS[i]}`,
      () => {
        state.selectedTestCountIndex = i;
      },
      false,
      state.selectedTestCountIndex === i
    );
  }

  drawText("Speed", rightX, sectionTop - 34, 38, COLORS.text, "left", "bottom", "700");

  for (let i = 0; i < SPEED_OPTIONS.length; i += 1) {
    const x = rightX;
    const y = sectionTop + i * (speedButtonHeight + speedGapY);

    makeButton(
      x,
      y,
      speedButtonWidth,
      speedButtonHeight,
      `${SPEED_OPTIONS[i].label} (${SPEED_OPTIONS[i].min}-${SPEED_OPTIONS[i].max}s)`,
      () => {
        state.selectedSpeedIndex = i;
      },
      false,
      state.selectedSpeedIndex === i
    );
  }

  const clickModeY = 760;
  drawText("Click Mode", leftX, clickModeY - 34, 38, COLORS.text, "left", "bottom", "700");

  for (let i = 0; i < CLICK_MODE_OPTIONS.length; i += 1) {
    makeButton(
      leftX + i * (350 + 30),
      clickModeY,
      350,
      88,
      CLICK_MODE_OPTIONS[i].label,
      () => {
        state.selectedClickModeIndex = i;
      },
      false,
      state.selectedClickModeIndex === i
    );
  }

  const summaryText = `Tests: ${getSelectedTestCount()}   •   Speed: ${getSelectedSpeed().label}   •   Mode: ${CLICK_MODE_OPTIONS[state.selectedClickModeIndex].label}`;
  drawText(summaryText, CANVAS_WIDTH / 2, 900, 32, COLORS.muted, "center", "middle", "400");

  makeButton(
    CANVAS_WIDTH / 2 - 190,
    940,
    380,
    76,
    "Start",
    startRun,
    true,
    false
  );
}

function drawWaiting() {
  drawText(
    `Test ${state.currentTest + 1} / ${getSelectedTestCount()}`,
    CANVAS_WIDTH / 2,
    120,
    34,
    COLORS.muted,
    "center",
    "middle",
    "700"
  );

  drawText("Wait for blue...", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, 92, COLORS.text, "center", "middle", "700");

  if (getSelectedClickMode() === "target") {
    drawText(
      "When blue appears, click the target area",
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 70,
      34,
      COLORS.muted,
      "center",
      "middle",
      "400"
    );
  } else {
    drawText(
      "When blue appears, click anywhere",
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2 + 70,
      34,
      COLORS.muted,
      "center",
      "middle",
      "400"
    );
  }

  drawText(
    `False starts: ${state.falseStarts}`,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT - 90,
    28,
    COLORS.yellow,
    "center",
    "middle",
    "700"
  );
}

function drawReady() {
  drawText(
    `Test ${state.currentTest + 1} / ${getSelectedTestCount()}`,
    CANVAS_WIDTH / 2,
    120,
    34,
    "#06243d",
    "center",
    "middle",
    "700"
  );

  if (getSelectedClickMode() === "target" && state.targetRect) {
    ctx.fillStyle = "rgba(2, 6, 23, 0.25)";
    ctx.fillRect(state.targetRect.x, state.targetRect.y, state.targetRect.width, state.targetRect.height);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.strokeRect(state.targetRect.x, state.targetRect.y, state.targetRect.width, state.targetRect.height);

    drawText(
      "CLICK HERE",
      state.targetRect.x + state.targetRect.width / 2,
      state.targetRect.y + state.targetRect.height / 2,
      44,
      "#ffffff",
      "center",
      "middle",
      "700"
    );
  } else {
    drawText("CLICK!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 140, "#ffffff", "center", "middle", "700");
  }
}

function drawClicked() {
  const latest = state.results[state.results.length - 1];

  drawText("Nice", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80, 100, COLORS.green, "center", "middle", "700");
  drawText(formatMilliseconds(latest), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30, 76, COLORS.text, "center", "middle", "700");
  drawText("Next test coming up...", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 120, 30, COLORS.muted, "center", "middle", "400");
}

function drawResults() {
  drawPanel(160, 80, 1600, 920);

  drawText("Results", CANVAS_WIDTH / 2, 155, 92, COLORS.text, "center", "middle", "700");

  const avg = average(state.results);
  drawText(`Average: ${formatMilliseconds(avg)}`, CANVAS_WIDTH / 2, 245, 42, COLORS.accent, "center", "middle", "700");
  drawText(`False starts: ${state.falseStarts}`, CANVAS_WIDTH / 2, 295, 28, COLORS.yellow, "center", "middle", "700");

  const resultsLeft = 320;
  const resultsTop = 390;
  const resultsPerColumn = 10;
  const columnWidth = 620;
  const rowHeight = 54;

  for (let i = 0; i < state.results.length; i += 1) {
    const col = Math.floor(i / resultsPerColumn);
    const row = i % resultsPerColumn;
    const x = resultsLeft + col * columnWidth;
    const y = resultsTop + row * rowHeight;

    drawText(`Test ${i + 1}`, x, y, 30, COLORS.text, "left", "middle", "700");
    drawText(formatMilliseconds(state.results[i]), x + 230, y, 30, COLORS.muted, "left", "middle", "400");
  }

  makeButton(
    CANVAS_WIDTH / 2 - 180,
    900,
    360,
    82,
    "Restart",
    restartToMenu,
    true,
    false
  );
}

function drawFalseStartOverlay() {
  drawPanel(CANVAS_WIDTH / 2 - 330, CANVAS_HEIGHT / 2 - 110, 660, 220);
  drawText("Too early!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20, 64, COLORS.red, "center", "middle", "700");
  drawText("Wait for blue, then click.", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50, 30, COLORS.muted, "center", "middle", "400");
}

function draw() {
  state.buttonRects = [];
  drawBackground();

  if (state.screen === "menu") {
    drawMenu();
  } else if (state.screen === "waiting") {
    drawWaiting();
  } else if (state.screen === "ready") {
    drawReady();
  } else if (state.screen === "clicked") {
    drawClicked();
  } else if (state.screen === "results") {
    drawResults();
  }

  for (const button of state.buttonRects) {
    drawButton(button);
  }
}

function handleCanvasPress(x, y) {
  for (let i = state.buttonRects.length - 1; i >= 0; i -= 1) {
    if (pointInRect(x, y, state.buttonRects[i])) {
      state.buttonRects[i].onClick();
      return;
    }
  }

  if (state.screen === "waiting") {
    state.screen = "waiting";
    draw();
    drawFalseStartOverlay();
    registerFalseStart();
    return;
  }

  if (state.screen === "ready") {
    if (getSelectedClickMode() === "target") {
      if (state.targetRect && pointInRect(x, y, state.targetRect)) {
        registerReaction();
      }
    } else {
      registerReaction();
    }
  }
}

canvas.addEventListener("pointerdown", (event) => {
  const pos = getPointerPosition(event);
  state.pointerDown = true;
  handleCanvasPress(pos.x, pos.y);
});

canvas.addEventListener("pointerup", () => {
  state.pointerDown = false;
});

canvas.addEventListener("pointermove", (event) => {
  const pos = getPointerPosition(event);
  state.hoverX = pos.x;
  state.hoverY = pos.y;
});

canvas.addEventListener("pointerleave", () => {
  state.hoverX = -1000;
  state.hoverY = -1000;
  state.pointerDown = false;
});

let lastTime = performance.now();

function gameLoop(now) {
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  update(deltaTime);
  draw();

  requestAnimationFrame(gameLoop);
}

draw();
requestAnimationFrame(gameLoop);