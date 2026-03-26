"use strict";

const STORAGE_KEY = "poker_session";

// ── State ─────────────────────────────────────────────────────────────────────
// { buy_in_amount: number, players: [{ id, name, buy_in_count, current_chips }] }
let state = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  state = null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  n = Number(n);
  const cls  = n > 0 ? "pos" : n < 0 ? "neg" : "zero";
  const sign = n > 0 ? "+" : "";
  return `<span class="${cls}">${sign}${n.toFixed(2)}</span>`;
}

function fmtPlain(n) {
  return Number(n).toFixed(2);
}

function nextId() {
  return state.players.length
    ? Math.max(...state.players.map((p) => p.id)) + 1
    : 1;
}

// ── Screens ───────────────────────────────────────────────────────────────────
function showSetup() {
  document.getElementById("setup-screen").classList.remove("hidden");
  document.getElementById("game-screen").classList.add("hidden");
}

function showGame() {
  document.getElementById("setup-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
  document.getElementById("header-buyin").textContent =
    "Buy-in: " + fmtPlain(state.buy_in_amount);
  renderPlayerCards();
}

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "settle") renderSummary();
  });
});

// ── Setup screen ──────────────────────────────────────────────────────────────
const buyinInput  = document.getElementById("setup-buyin");
const countInput  = document.getElementById("setup-count");
const namesDiv    = document.getElementById("setup-names");
const nameInputs  = document.getElementById("name-inputs");
const btnGenerate = document.getElementById("btn-generate-names");
const btnStart    = document.getElementById("btn-start-game");

btnGenerate.addEventListener("click", () => {
  const count = parseInt(countInput.value);
  if (!count || count < 2 || count > 20) {
    alert("Enter a valid number of players (2–20).");
    return;
  }
  if (!buyinInput.value || parseFloat(buyinInput.value) <= 0) {
    alert("Enter a valid buy-in amount.");
    buyinInput.focus();
    return;
  }

  nameInputs.innerHTML = Array.from({ length: count })
    .map(
      (_, i) => `
      <div class="name-input-row">
        <span class="num">${i + 1}</span>
        <input type="text" class="player-name-input" placeholder="Player ${i + 1}" maxlength="30" />
      </div>`
    )
    .join("");

  namesDiv.classList.remove("hidden");
  btnStart.classList.remove("hidden");
  btnGenerate.textContent = "Update Names";
  nameInputs.querySelector("input").focus();
});

btnStart.addEventListener("click", () => {
  const buy_in_amount = parseFloat(buyinInput.value);
  if (!buy_in_amount || buy_in_amount < 1) {
    alert("Buy-in must be at least 1.");
    buyinInput.focus();
    return;
  }

  const nameEls = document.querySelectorAll(".player-name-input");
  const names   = Array.from(nameEls).map((el, i) => el.value.trim() || `Player ${i + 1}`);

  const lower = names.map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) {
    alert("Player names must be unique.");
    return;
  }

  // Confirm before locking in — buy-in cannot change mid-game
  if (!confirm(`Start game with buy-in of ${fmtPlain(buy_in_amount)} for ${names.length} players?\n\nThe buy-in amount cannot be changed once the game starts.`)) return;

  state = {
    buy_in_amount: round2(buy_in_amount),
    players: names.map((name, i) => ({
      id: i + 1,
      name,
      buy_in_count: 1,
      current_chips: round2(buy_in_amount),
    })),
  };

  saveState();
  showGame();
});

// Enter key moves between name inputs
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const inputs = Array.from(document.querySelectorAll(".player-name-input"));
  const idx = inputs.indexOf(document.activeElement);
  if (idx === -1) return;
  if (idx < inputs.length - 1) inputs[idx + 1].focus();
  else btnStart.click();
});

// ── Game tab ──────────────────────────────────────────────────────────────────
function playerCard(p) {
  const invested  = p.buy_in_count * state.buy_in_amount;
  const net       = round2(p.current_chips - invested);
  const netClass  = net > 0 ? "net-pos" : net < 0 ? "net-neg" : "";
  const netLabel  = net > 0 ? `+${fmtPlain(net)}` : fmtPlain(net);
  const initial   = escHtml(p.name.charAt(0).toUpperCase());
  return `
  <div class="player-card" id="pcard-${p.id}">
    <div class="player-card-header">
      <div class="player-avatar">${initial}</div>
      <div class="player-info">
        <div class="player-name">${escHtml(p.name)}</div>
        <div class="player-meta">
          <span class="meta-pill">&#127183; <strong>${p.buy_in_count}</strong> buy-in${p.buy_in_count > 1 ? "s" : ""}</span>
          <span class="meta-pill">&#128176; <strong>${fmtPlain(invested)}</strong> invested</span>
          <span class="meta-pill ${netClass}" id="net-pill-${p.id}">Net: <strong>${netLabel}</strong></span>
        </div>
      </div>
      <button class="btn-rebuy" onclick="doRebuy(${p.id})">+ Rebuy</button>
    </div>
    <div class="chips-row">
      <label>Current chips</label>
      <input
        type="number"
        min="0"
        step="any"
        value="${p.current_chips}"
        id="chips-${p.id}"
        onchange="saveChips(${p.id})"
        onblur="saveChips(${p.id})"
      />
    </div>
  </div>`;
}

function renderPlayerCards() {
  document.getElementById("player-cards").innerHTML =
    state.players.map(playerCard).join("");
}

function updatePlayerCard(player) {
  const card = document.getElementById("pcard-" + player.id);
  if (!card) return;
  const invested = player.buy_in_count * state.buy_in_amount;
  const net      = round2(player.current_chips - invested);
  const netClass = net > 0 ? "net-pos" : net < 0 ? "net-neg" : "";
  const netLabel = net > 0 ? `+${fmtPlain(net)}` : fmtPlain(net);

  card.querySelector(".player-meta").innerHTML = `
    <span class="meta-pill">&#127183; <strong>${player.buy_in_count}</strong> buy-in${player.buy_in_count > 1 ? "s" : ""}</span>
    <span class="meta-pill">&#128176; <strong>${fmtPlain(invested)}</strong> invested</span>
    <span class="meta-pill ${netClass}">Net: <strong>${netLabel}</strong></span>
  `;

  const chipsInput = document.getElementById("chips-" + player.id);
  if (document.activeElement !== chipsInput) {
    chipsInput.value = player.current_chips;
  }
}

function doRebuy(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const cost = fmtPlain(state.buy_in_amount);
  if (!confirm(`Add a rebuy for ${player.name}?\nThis will add ${cost} to their total investment.`)) return;
  player.buy_in_count += 1;
  saveState();
  updatePlayerCard(player);
}

function saveChips(playerId) {
  const input  = document.getElementById("chips-" + playerId);
  const chips  = parseFloat(input.value);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;

  if (isNaN(chips) || chips < 0) {
    input.value = player.current_chips;
    return;
  }

  player.current_chips = chips;
  saveState();
  updatePlayerCard(player);
}

// ── Reset ─────────────────────────────────────────────────────────────────────
document.getElementById("btn-reset").addEventListener("click", () => {
  if (!confirm("End the session and reset everything?")) return;
  clearState();
  buyinInput.value = "";
  countInput.value = "";
  namesDiv.classList.add("hidden");
  btnStart.classList.add("hidden");
  btnGenerate.textContent = "Set Player Names";
  showSetup();
});

// ── Settle tab ────────────────────────────────────────────────────────────────
function calcSettlement() {
  const buy_in = state.buy_in_amount;

  const details = state.players.map((p) => {
    const invested = p.buy_in_count * buy_in;
    const net      = round2(p.current_chips - invested);
    return { name: p.name, buy_in_count: p.buy_in_count, invested, current_chips: p.current_chips, net };
  });

  const creditors = details
    .filter((d) => d.net > 0.005)
    .map((d) => [d.name, d.net])
    .sort((a, b) => b[1] - a[1]);

  const debtors = details
    .filter((d) => d.net < -0.005)
    .map((d) => [d.name, -d.net])
    .sort((a, b) => b[1] - a[1]);

  const transactions = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const [creditor, credit] = creditors[ci];
    const [debtor,   debt  ] = debtors[di];
    const amount = round2(Math.min(credit, debt));
    transactions.push({ from: debtor, to: creditor, amount });
    creditors[ci][1] = round2(credit - amount);
    debtors[di][1]   = round2(debt   - amount);
    if (creditors[ci][1] < 0.005) ci++;
    if (debtors[di][1]   < 0.005) di++;
  }

  return { details, transactions };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function renderSummary() {
  const { details, transactions } = calcSettlement();

  // Details table
  const tbody  = document.getElementById("details-body");
  const sorted = [...details].sort((a, b) => b.net - a.net);
  tbody.innerHTML = sorted
    .map(
      (d) => `
      <tr>
        <td>${escHtml(d.name)}</td>
        <td>${d.buy_in_count}</td>
        <td>${fmtPlain(d.invested)}</td>
        <td>${fmtPlain(d.current_chips)}</td>
        <td>${fmt(d.net)}</td>
      </tr>`
    )
    .join("");

  // Transactions
  const ul = document.getElementById("transactions-list");
  if (!transactions.length) {
    ul.innerHTML = '<li class="empty">All square!</li>';
    return;
  }
  ul.innerHTML = transactions
    .map(
      (t) => `
      <li>
        <div class="txn-item">
          <span class="txn-from">${escHtml(t.from)}</span>
          <span class="txn-arrow">&#8594;</span>
          <span class="txn-to">${escHtml(t.to)}</span>
          <span class="txn-amt">${fmtPlain(t.amount)}</span>
        </div>
      </li>`
    )
    .join("");
}

document.getElementById("btn-refresh-settle").addEventListener("click", renderSummary);

// ── Init ──────────────────────────────────────────────────────────────────────
state = loadState();
if (state) showGame();
else showSetup();
