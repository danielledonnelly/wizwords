/**
 * WizWords: turn-based wizard duel. Timer starts on first correct key; wrong key = miss.
 */

const SPELLS = [
  { id: "fireball", label: "fireball", base: 12, parMs: 2200 },
  { id: "zap", label: "zap", base: 8, parMs: 900 },
  { id: "ignite", label: "ignite", base: 10, parMs: 1400 },
  { id: "thunderstorm", label: "thunderstorm", base: 16, parMs: 3400 },
  { id: "tsunami", label: "tsunami", base: 14, parMs: 2800 },
  { id: "discombobulation", label: "discombobulation", base: 22, parMs: 5200 },
];

const MAX_HP = 100;
const FOE_NAMES = [
  "Rival Wizard",
  "Archmage Krex",
  "Sage Morrow",
  "Hexwright",
  "Figletar the Great",
  "Gorlof the Warlock",
  "Gandalf the Grey",
  "Merlin",
  "Geralt of Rivia",
  "Doctor Strange",
  "Elphaba",
];

// Rare foe bark after you hit (1%).
const FOE_TAUNT_ON_PLAYER_HIT = [
  "Curses!",
  "By the gods...",
  "Curse you and your wretched little fingers.",
];

// Rare foe bark after a foe spell lands (1%).
const FOE_TAUNT_ON_FOE_HIT = ["Take that!", "Begone!", "Silence, now."];

const els = {
  playerHp: document.getElementById("player-hp"),
  playerHpFill: document.getElementById("player-hp-fill"),
  foeHp: document.getElementById("foe-hp"),
  foeHpFill: document.getElementById("foe-hp-fill"),
  log: document.getElementById("battle-log"),
  spellList: document.getElementById("spell-list"),
  turnBanner: document.getElementById("turn-banner"),
  promptTarget: document.getElementById("prompt-target"),
  typedOverlay: document.getElementById("typed-overlay"),
  fakeCursor: document.getElementById("fake-cursor"),
  capture: document.getElementById("capture"),
  terminal: document.querySelector(".terminal"),
  hint: document.getElementById("hint"),
  gameStatus: document.getElementById("game-status"),
  foeLabel: document.getElementById("foe-label"),
};

let playerHp = MAX_HP;
let foeHp = MAX_HP;
let spellIndex = 0;
let phase = "player"; // 'player' | 'foe' | 'over'
let buffer = "";
let timerStart = null;
let lockedSpell = null;
let foeDisplayName = FOE_NAMES[0];
let isComposing = false;

function normSpellIndex(i) {
  const n = SPELLS.length;
  return ((i % n) + n) % n;
}

function spellAt(i) {
  return SPELLS[normSpellIndex(i)];
}

function damageForSpell(spell, elapsedMs) {
  const t = Math.max(elapsedMs, 1);
  const ratio = spell.parMs / t;
  const speedBonus = Math.floor(spell.base * Math.min(ratio, 2.2) * 0.85);
  return Math.max(1, spell.base + speedBonus);
}

function setHpBars() {
  els.playerHp.textContent = String(Math.max(0, playerHp));
  els.foeHp.textContent = String(Math.max(0, foeHp));
  els.playerHpFill.style.width = `${(Math.max(0, playerHp) / MAX_HP) * 100}%`;
  els.foeHpFill.style.width = `${(Math.max(0, foeHp) / MAX_HP) * 100}%`;
}

function logLine(text, kind) {
  const li = document.createElement("li");
  li.textContent = text;
  li.className = kind;
  els.log.appendChild(li);
  els.log.scrollTop = els.log.scrollHeight;
}

function maybeLogFoeTaunt(phrases, chance) {
  if (Math.random() >= chance) return;
  const line = phrases[Math.floor(Math.random() * phrases.length)];
  logLine(`${foeDisplayName} says "${line}"`, "foe");
}

function renderSpellChips() {
  els.spellList.innerHTML = "";
  const active = normSpellIndex(spellIndex);
  SPELLS.forEach((s, i) => {
    const chip = document.createElement("span");
    chip.className = "spell-chip" + (i === active ? " active" : "");
    chip.textContent = s.label;
    els.spellList.appendChild(chip);
  });
}

function currentSpell() {
  return spellAt(spellIndex);
}

function updateTurnUI() {
  els.terminal.classList.toggle("waiting", phase === "foe");
  els.terminal.classList.toggle("over", phase === "over");
  if (phase === "player") {
    els.turnBanner.textContent = "Your turn. Type the highlighted spell.";
    els.turnBanner.classList.remove("foe-turn");
    els.hint.textContent =
      "Type spells to cast them. The longer the word and the faster you type it, the more damage you will do. Use [ and ] to cycle spells. Beware, as clicking a wrong letter will result in a miss, ending your turn.";
  } else if (phase === "foe") {
    els.turnBanner.textContent = `${foeDisplayName}'s turn...`;
    els.turnBanner.classList.add("foe-turn");
  } else {
    if (playerHp > 0) {
      els.turnBanner.textContent = "You win.";
      els.turnBanner.classList.remove("foe-turn");
    } else {
      els.turnBanner.textContent = "You lose.";
      els.turnBanner.classList.add("foe-turn");
    }
    els.hint.textContent = "Press Enter for a new duel.";
  }
  renderSpellChips();
}

function renderPrompt() {
  const sp = lockedSpell || currentSpell();
  if (phase === "player" && playerHp > 0 && foeHp > 0) {
    els.promptTarget.innerHTML = `Cast: <em>${sp.label}</em>`;
  } else {
    els.promptTarget.textContent = "";
  }
  els.typedOverlay.textContent = "";
  const target = sp.label;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    const expected = target[i];
    const span = document.createElement("span");
    span.textContent = ch;
    span.className = ch === expected ? "ok" : "bad";
    els.typedOverlay.appendChild(span);
  }
  els.fakeCursor.style.visibility = phase === "player" && playerHp > 0 && foeHp > 0 ? "visible" : "hidden";
}

function resetTypingState() {
  buffer = "";
  timerStart = null;
  lockedSpell = null;
  els.capture.value = "";
}

function focusCapture() {
  if (phase === "player" && playerHp > 0 && foeHp > 0) {
    els.capture.focus();
  }
}

function endGame(won) {
  phase = "over";
  els.gameStatus.textContent = won ? "You win." : "You lose.";
  updateTurnUI();
  renderPrompt();
}

function startFoeTurn() {
  phase = "foe";
  resetTypingState();
  updateTurnUI();
  renderPrompt();

  const spell = SPELLS[Math.floor(Math.random() * SPELLS.length)];
  const fakeMs = spell.parMs * (0.55 + Math.random() * 0.95);
  const dmg = damageForSpell(spell, fakeMs);

  window.setTimeout(() => {
    if (phase !== "foe") return;
    playerHp = Math.max(0, playerHp - dmg);
    logLine(
      `${foeDisplayName} casts ${spell.label} (${Math.round(fakeMs)}ms), ${dmg} damage.`,
      "foe"
    );
    maybeLogFoeTaunt(FOE_TAUNT_ON_FOE_HIT, 0.01);
    setHpBars();
    if (playerHp <= 0) {
      endGame(false);
      return;
    }
    phase = "player";
    resetTypingState();
    updateTurnUI();
    renderPrompt();
    focusCapture();
  }, 900 + Math.random() * 700);
}

function resolvePlayerHit(spell, elapsedMs) {
  const dmg = damageForSpell(spell, elapsedMs);
  foeHp = Math.max(0, foeHp - dmg);
  logLine(
    `You cast ${spell.label} in ${Math.round(elapsedMs)}ms, ${dmg} damage.`,
    "you"
  );
  maybeLogFoeTaunt(FOE_TAUNT_ON_PLAYER_HIT, 0.01);
  setHpBars();
  spellIndex++;
  resetTypingState();
  if (foeHp <= 0) {
    endGame(true);
    return;
  }
  startFoeTurn();
}

function resolvePlayerMiss(reason) {
  logLine(reason, "you");
  resetTypingState();
  startFoeTurn();
}

function onInput() {
  if (phase !== "player" || playerHp <= 0 || foeHp <= 0 || isComposing) return;

  const spell = currentSpell();
  const target = spell.label;
  let raw = els.capture.value.toLowerCase().replace(/[^a-z]/g, "");
  if (raw !== els.capture.value) {
    els.capture.value = raw;
  }

  if (raw.length === 0) {
    buffer = "";
    timerStart = null;
    lockedSpell = null;
    renderPrompt();
    return;
  }

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== target[i]) {
      els.capture.value = "";
      buffer = "";
      const hadStarted = timerStart !== null;
      timerStart = null;
      lockedSpell = null;
      renderPrompt();
      resolvePlayerMiss(
        i === 0
          ? "First letter wrong. Miss."
          : hadStarted
            ? `Wrong letter mid-cast (${spell.label}). Miss.`
            : "Wrong letter. Miss."
      );
      return;
    }
  }

  buffer = raw;
  if (buffer.length >= 1 && timerStart === null) {
    lockedSpell = spell;
    timerStart = performance.now();
  }

  renderPrompt();

  if (buffer.length === target.length) {
    const elapsed = performance.now() - timerStart;
    const castSpell = lockedSpell || spell;
    els.capture.value = "";
    buffer = "";
    timerStart = null;
    lockedSpell = null;
    renderPrompt();
    resolvePlayerHit(castSpell, elapsed);
  }
}

function cycleSpell(delta) {
  if (phase !== "player" || buffer.length > 0) return;
  spellIndex += delta;
  renderSpellChips();
  renderPrompt();
}

function newDuel() {
  els.log.innerHTML = "";
  playerHp = MAX_HP;
  foeHp = MAX_HP;
  spellIndex = 0;
  phase = "player";
  foeDisplayName = FOE_NAMES[Math.floor(Math.random() * FOE_NAMES.length)];
  els.foeLabel.textContent = foeDisplayName;
  resetTypingState();
  setHpBars();
  els.gameStatus.textContent = "";
  logLine(`A duel begins against ${foeDisplayName}.`, "system");
  updateTurnUI();
  renderPrompt();
  focusCapture();
}
els.capture.addEventListener("compositionstart", () => {
  isComposing = true;
});

els.capture.addEventListener("compositionend", () => {
  isComposing = false;
  onInput();
});
els.capture.addEventListener("input", onInput);

els.capture.addEventListener("keydown", (e) => {
  if (e.key === "[" ) {
    e.preventDefault();
    cycleSpell(-1);
  } else if (e.key === "]") {
    e.preventDefault();
    cycleSpell(1);
  }
});

document.addEventListener("keydown", (e) => {
  if (phase === "over" && e.key === "Enter") {
    e.preventDefault();
    newDuel();
  }
}, true);

document.addEventListener("keydown", (e) => {
  if (phase !== "player") return;
  if (document.activeElement !== els.capture && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
    els.capture.focus();
  }
});

els.terminal.addEventListener("click", () => {
  focusCapture();
});

newDuel();
