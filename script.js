// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const CHIP_VALUES = [
  1, 5, 10, 25, 50, 100, 250, 500,
  1000, 2500, 5000, 10000, 25000, 50000,
  100000, 250000, 500000, 1000000, 2500000,
  5000000, 10000000, 25000000, 50000000,
  100000000, 250000000, 500000000, 1000000000,
  2500000000, 5000000000, 10000000000, 25000000000,
  50000000000, 100000000000, 250000000000,
  500000000000, 1000000000000
];

function formatChipLabel(value) {
  if (value >= 1e12) return `${value / 1e12}T`;
  if (value >= 1e9) return `${value / 1e9}B`;
  if (value >= 1e6) return `${value / 1e6}M`;
  if (value >= 1e3) return `${value / 1e3}K`;
  return String(value);
}

function moneyWords(value) {
  value = Math.floor(Number(value) || 0);
  if (value === 0) return 'Zero dollars';

  const ones = ['','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
    'seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

  function underThousand(n) {
    let out = '';
    if (n >= 100) {
      out += ones[Math.floor(n / 100)] + ' hundred';
      n %= 100;
      if (n) out += ' ';
    }
    if (n >= 20) {
      out += tens[Math.floor(n / 10)];
      n %= 10;
      if (n) out += '-' + ones[n];
    } else if (n > 0) {
      out += ones[n];
    }
    return out;
  }

  const scales = [[1e12,'trillion'],[1e9,'billion'],[1e6,'million'],[1e3,'thousand'],[1,'']];
  let remaining = value;
  const parts = [];

  for (const [scale, name] of scales) {
    if (remaining >= scale) {
      const amount = Math.floor(remaining / scale);
      remaining %= scale;
      parts.push(underThousand(amount) + (name ? ' ' + name : ''));
    }
  }
  return parts.join(' ') + ' dollars';
}

function buildChipList(maxMoney = Infinity) {
  const values = CHIP_VALUES.filter(v => v <= Math.max(1, maxMoney));
  if (!values.length) values.push(1);

  return values.map((val, i) => ({
    val,
    label: formatChipLabel(val),
    cls: `chip-dynamic-${i}`,
    sub: val >= 1e9 ? 'REX' : 'CHIP'
  }));
}

let ALL_CHIPS = buildChipList(balance || Infinity);

// chip unlocks when balance >= threshold
const CHIP_UNLOCK = {
  1: 0, 10: 0, 50: 0, 100: 500, 500: 2500, 1000: 5000, 5000: 20000, 25000: 75000,
  100000: 250000, 500000: 750000, 1000000: 2500000, 5000000: 7500000,
  10000000: 15000000, 50000000: 75000000, 100000000: 150000000,
  500000000: 750000000, 1000000000: 2500000000, 5000000000: 7500000000,
  10000000000: 15000000000, 50000000000: 75000000000, 100000000000: 100000000000
};

// ─── STATE ──────────────────────────────────────────────────────────────────
let balance    = 2500;
let bet        = 0;
let lastBet    = 0;
let deck       = [];
let playerHand = [];
let dealerHand = [];
let gamePhase  = 'betting'; // betting | playing | done
let history    = [];
let deckCount  = 3;
let autoSettings = { autoPlay: false, autoLastBet: true, basicStrategy: true, rounds: 0 };
let autoPlayRunning = false;
let autoPlayRoundsLeft = 0;

// ─── DECK ───────────────────────────────────────────────────────────────────
function buildDeck() {
  const d = [];
  for (let n = 0; n < deckCount; n++)
    for (const s of SUITS)
    for (const r of RANKS)
      d.push({ suit: s, rank: r });
  return d;
}

function shuffleDeck(d) {
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function drawCard() {
  if (deck.length < Math.max(15, 10 * deckCount)) deck = shuffleDeck(Array.from({length: deckCount}, () => buildDeck()).flat());
  return deck.pop();
}

// ─── SCORING ────────────────────────────────────────────────────────────────
function handValue(hand) {
  let val = 0, aces = 0;
  for (const c of hand) {
    if (c.hidden) continue;
    if (c.rank === 'A') { aces++; val += 11; }
    else if (['J','Q','K'].includes(c.rank)) val += 10;
    else val += parseInt(c.rank);
  }
  while (val > 21 && aces > 0) { val -= 10; aces--; }
  return val;
}

function isBust(hand)       { return handValue(hand) > 21; }
function isBlackjack(hand)  { return hand.length === 2 && handValue(hand) === 21; }

// ─── CHIP UI ────────────────────────────────────────────────────────────────
function renderChips() {
  const row = document.getElementById('chipsRow');
  row.innerHTML = '';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-danger clear-bet-btn';
  clearBtn.textContent = 'Clear Bet';
  clearBtn.onclick = clearBet;
  row.appendChild(clearBtn);

  const allInBtn = document.createElement('button');
  allInBtn.className = 'btn btn-all-in clear-bet-btn';
  allInBtn.textContent = 'ALL IN';
  allInBtn.onclick = allIn;
  row.appendChild(allInBtn);

  for (const chip of ALL_CHIPS) {
    const unlocked = balance >= CHIP_UNLOCK[chip.val];
    const canAfford = unlocked && bet + chip.val <= balance;
    const div = document.createElement('div');
    div.className = `chip ${chip.cls}${canAfford ? '' : ' locked'}`;
    div.innerHTML = `<span class="chip-val">${chip.label}</span><span class="chip-sub">${chip.sub}</span>`;
      <small>${moneyWords(chip.val)}</small>
    if (canAfford) div.onclick = () => addBet(chip.val);
    row.appendChild(div);
  }
}

function addBet(amount) {
  if (gamePhase !== 'betting') return;
  if (bet + amount > balance) { flashMessage('Not enough balance!', 'lose'); return; }
  bet += amount;
  updateBetDisplay();
}

function clearBet() {
  if (gamePhase !== 'betting') return;
  bet = 0;
  updateBetDisplay();
}

function allIn() {
  if (gamePhase !== 'betting') return;
  if (balance <= 0) {
    flashMessage('No balance left to go all in!', 'lose');
    return;
  }

  bet = balance;
  updateBetDisplay();

  if (animationsEnabled) {
    const el = document.getElementById('betDisplay');
    if (el) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
  }

  flashMessage(`ALL IN — ${fmt(bet)} on the table!`, 'info');
}

function toggleAutoAllIn() {
  autoAllInEnabled = !autoAllInEnabled;
  const toggle = document.getElementById('autoAllInToggle');
  if (toggle) toggle.classList.toggle('active', autoAllInEnabled);

  if (autoAllInEnabled && gamePhase === 'betting' && balance > 0) {
    allIn();
  }
}

function applyAutoBet() {
  if (gamePhase !== 'betting' || balance <= 0) return;

  if (autoAllInEnabled) {
    allIn();
    return;
  }

  if (typeof autoLastBetEnabled !== 'undefined' && autoLastBetEnabled && lastBet > 0) {
    bet = Math.min(lastBet, balance);
    updateBetDisplay();
  }
}

// ─── DISPLAY ────────────────────────────────────────────────────────────────
function fmt(n) { return '$' + n.toLocaleString(); }

function updateBetDisplay() {
  const el = document.getElementById('betDisplay');
  el.textContent = fmt(bet);
  if (animationsEnabled) {
    el.classList.remove('chip-added');
    void el.offsetWidth;
    el.classList.add('chip-added');
  }
}

function updateBalanceDisplay() {
  const el = document.getElementById('balanceDisplay');
  const old = Number(el.dataset.value || balance);
  el.textContent = fmt(balance);
  el.dataset.value = balance;

  if (animationsEnabled && old !== balance) {
    el.classList.remove(balance > old ? 'drop' : 'bump');
    void el.offsetWidth;
    el.classList.add(balance > old ? 'bump' : 'drop');
  }
  renderChips();
}

function setMessage(msg, cls = 'info') {
  const bar = document.getElementById('messageBar');
  bar.textContent = msg;
  bar.className = `message-bar ${cls}`;
}

function flashMessage(msg, cls) { setMessage(msg, cls); }

function setButtons(phase) {
  document.getElementById('dealBtn').disabled   = phase !== 'betting';
  document.getElementById('hitBtn').disabled    = phase !== 'playing';
  document.getElementById('standBtn').disabled  = phase !== 'playing';
  document.getElementById('doubleBtn').disabled = phase !== 'playing';
  const autoBtn = document.getElementById('autoPlayBtn');
  if (autoBtn) { autoBtn.textContent = autoPlayRunning ? 'Stop Auto' : 'Auto Play'; autoBtn.classList.toggle('running', autoPlayRunning); }
}

// ─── CARD RENDERING ─────────────────────────────────────────────────────────
function cardEl(card) {
  if (card.hidden) {
    const el = document.createElement('div');
    el.className = 'card back';
    return el;
  }
  const isRed = card.suit === '♥' || card.suit === '♦';
  const el = document.createElement('div');
  el.className = `card ${isRed ? 'red' : 'black'}`;
  el.innerHTML = `
    <div><span class="rank">${card.rank}</span><br><span class="suit">${card.suit}</span></div>
    <span class="suit-center">${card.suit}</span>
    <div class="card-bottom"><span class="rank">${card.rank}</span><br><span class="suit">${card.suit}</span></div>
  `;
  return el;
}

function renderHands() {
  const pc = document.getElementById('playerCards');
  const dc = document.getElementById('dealerCards');
  pc.innerHTML = '';
  dc.innerHTML = '';
  for (const c of playerHand) {
    const el = cardEl(c);
    if (animationsEnabled) el.classList.add('deal-in');
    pc.appendChild(el);
  }
  for (const c of dealerHand) {
    const el = cardEl(c);
    if (animationsEnabled) el.classList.add('deal-in');
    dc.appendChild(el);
  }

  document.getElementById('playerScore').textContent = handValue(playerHand) || '-';
  const visible = dealerHand.filter(c => !c.hidden);
  document.getElementById('dealerScore').textContent = visible.length ? handValue(visible) : '-';
}

// ─── GAME LOGIC ─────────────────────────────────────────────────────────────
function deal() {
  if (bet === 0)       { flashMessage('Gotta bet something first.', 'lose'); return; }
  if (bet > balance)   { flashMessage('Bet exceeds balance.', 'lose'); return; }

  lastBet = bet;
  balance -= bet;
  updateBalanceDisplay();

  deck       = shuffleDeck(Array.from({length: deckCount}, () => buildDeck()).flat());
  playerHand = [drawCard(), drawCard()];
  dealerHand = [drawCard(), { ...drawCard(), hidden: true }];

  gamePhase = 'playing';
  setButtons('playing');
  renderHands();
syncCheatToggles();

  document.getElementById('doubleBtn').disabled = balance < bet;

  if (isBlackjack(playerHand)) {
    dealerHand[1].hidden = false;
    renderHands();
    endRound(isBlackjack(dealerHand) ? 'push' : 'blackjack');
    return;
  }

  setMessage('Hit or Stand?', 'info');
}

function hit() {
  if (gamePhase !== 'playing') return;
  playerHand.push(drawCard());
  document.getElementById('doubleBtn').disabled = true;
  renderHands();
  if (isBust(playerHand)) {
    document.getElementById('playerCards').classList.add('shake');
    setTimeout(() => document.getElementById('playerCards').classList.remove('shake'), 400);
    dealerHand[1].hidden = false;
    renderHands();
    endRound('bust');
  }
}

function stand() {
  if (gamePhase !== 'playing') return;
  dealerHand[1].hidden = false;
  renderHands();
  if (animationsEnabled) {
    const cards = document.getElementById('dealerCards').children;
    if (cards[1]) cards[1].classList.add('flip-in');
  }
  dealerPlay();
}

function doubleDown() {
  if (gamePhase !== 'playing') return;
  if (balance < bet) { flashMessage("Can't afford double!", 'lose'); return; }
  balance -= bet;
  bet     *= 2;
  updateBetDisplay();
  updateBalanceDisplay();
  playerHand.push(drawCard());
  renderHands();
  if (isBust(playerHand)) {
    dealerHand[1].hidden = false;
    renderHands();
    endRound('bust');
    return;
  }
  dealerHand[1].hidden = false;
  renderHands();
  dealerPlay();
}

function dealerPlay() {
  function step() {
    if (handValue(dealerHand) < 17) {
      dealerHand.push(drawCard());
      renderHands();
      setTimeout(step, 400);
    } else {
      resolveRound();
    }
  }
  setTimeout(step, 400);
}

function resolveRound() {
  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);
  if (isBust(dealerHand))  endRound('win');
  else if (pv > dv)        endRound('win');
  else if (pv < dv)        endRound('lose');
  else                     endRound('push');
}

function endRound(result) {
  gamePhase = 'done';
  setButtons('done');

  let payout = 0, msg = '', cls = 'info', histLabel = '';

  switch (result) {
    case 'blackjack':
      payout    = Math.floor(bet * 2.5);
      msg       = `BLACKJACK! You win ${fmt(payout - bet)}`;
      cls       = 'blackjack';
      histLabel = 'BJ';
      break;
    case 'win':
      payout    = bet * 2;
      msg       = `You win ${fmt(bet)}!`;
      cls       = 'win';
      histLabel = 'W';
      break;
    case 'push':
      payout    = bet;
      msg       = 'Push — bet returned.';
      cls       = 'push';
      histLabel = 'P';
      break;
    case 'bust':
      msg       = `Bust! You lose ${fmt(bet)}.`;
      cls       = 'lose';
      histLabel = 'L';
      break;
    case 'lose':
      msg       = `Dealer wins. You lose ${fmt(bet)}.`;
      cls       = 'lose';
      histLabel = 'L';
      break;
  }

  balance += payout;
  updateBalanceDisplay();
  setMessage(msg, cls);
  addHistory(histLabel);

  if (balance === 0) {
    setTimeout(() => {
      setMessage('Busted out. Reloading with $2,500...', 'lose');
      setTimeout(() => {
        balance = 2500; bet = 0;
        updateBalanceDisplay(); updateBetDisplay(); resetRound();
      }, 2500);
    }, 1200);
    return;
  }

  setTimeout(() => { bet = 0; updateBetDisplay(); resetRound(); }, 1800);
}

function resetRound() {
  gamePhase  = 'betting';
  playerHand = [];
  dealerHand = [];
  setButtons('betting');
  renderHands();
  document.getElementById('playerScore').textContent = '-';
  document.getElementById('dealerScore').textContent = '-';
  setMessage('Place your bet to start.', 'info');
}

// ─── HISTORY ────────────────────────────────────────────────────────────────
function addHistory(label) {
  history.unshift(label);
  if (history.length > 40) history.pop();
  const row = document.getElementById('historyRow');
  row.innerHTML = '';
  for (const h of history) {
    const dot = document.createElement('div');
    dot.className = `history-dot ${h}`;
    dot.textContent = h;
    row.appendChild(dot);
  }
}

// ─── SETTINGS + AUTO PLAY ───────────────────────────────────────────────────
function openSettings() {
  document.getElementById('settingsOverlay').classList.add('open');
  syncSettingsUI();
}
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('open'); }
function syncSettingsUI() {
  const map = { autoPlay: 'autoPlaySetting', autoLastBet: 'autoLastBetSetting', basicStrategy: 'basicStrategySetting' };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', !!autoSettings[key]);
  }
  const decks = document.getElementById('deckCountSetting');
  const rounds = document.getElementById('autoRoundsSetting');
  if (decks) decks.value = String(deckCount);
  if (rounds) rounds.value = String(autoSettings.rounds);
}
function toggleSetting(key) {
  if (!(key in autoSettings) || key === 'rounds') return;
  autoSettings[key] = !autoSettings[key];
  if (key === 'autoPlay' && autoSettings[key]) {
    autoPlayStart();
  } else if (key === 'autoPlay' && !autoSettings[key]) {
    stopAutoPlay();
  }
  syncSettingsUI();
  const fb = document.getElementById('settingsFeedback');
  if (fb) fb.textContent = `${key === 'autoLastBet' ? 'Auto last bet' : key === 'basicStrategy' ? 'Best choice' : 'Auto play'} ${autoSettings[key] ? 'enabled' : 'disabled'}.`;
}
function changeDeckCount(value) {
  deckCount = Math.max(1, Math.min(8, Number(value) || 3));
  deck = [];
  const fb = document.getElementById('settingsFeedback');
  if (fb) fb.textContent = `Using ${deckCount} deck${deckCount === 1 ? '' : 's'}.`;
}

function basicStrategy(player, dealerUp) {
  const total = handValue(player);
  const soft = player.some(c => c.rank === 'A') && total <= 21 && player.reduce((a,c) => a + (c.rank === 'A' ? 11 : ['J','Q','K'].includes(c.rank) ? 10 : Number(c.rank)), 0) === total;
  const up = dealerUp === 'A' ? 11 : ['10','J','Q','K'].includes(dealerUp) ? 10 : Number(dealerUp);
  if (total >= 17) return 'stand';
  if (soft) {
    if (total <= 17) return 'hit';
    return 'stand';
  }
  if (total <= 11) return 'hit';
  if (total >= 13 && total <= 16) return up >= 7 ? 'hit' : 'stand';
  if (total === 12) return (up >= 4 && up <= 6) ? 'stand' : 'hit';
  return 'hit';
}

function autoChoose() {
  if (gamePhase !== 'playing') return;
  if (!autoSettings.basicStrategy) { stand(); return; }
  const dealerUp = dealerHand.find(c => !c.hidden)?.rank || '10';
  const choice = basicStrategy(playerHand, dealerUp);
  if (choice === 'hit') hit(); else stand();
}

function autoPlayStart() {
  if (autoPlayRunning) return;
  if (gamePhase !== 'betting') return;
  autoPlayRunning = true;
  autoPlayRoundsLeft = autoSettings.rounds;
  setButtons(gamePhase);
  runAutoRound();
}
function runAutoRound() {
  if (!autoPlayRunning) return;
  if (autoPlayRoundsLeft === 0 && autoSettings.rounds !== 0) { stopAutoPlay(); return; }
  if (gamePhase !== 'betting') { setTimeout(runAutoRound, 250); return; }
  if (autoSettings.autoLastBet && bet === 0) bet = Math.min(lastBet || 0, balance);
  if (bet === 0) {
    stopAutoPlay();
    setMessage('Auto Play stopped — no last bet is available.', 'lose');
    return;
  }
  if (bet > balance) {
    if (autoSettings.autoLastBet) bet = Math.min(lastBet || 0, balance);
    if (bet <= 0) { stopAutoPlay(); return; }
  }
  updateBetDisplay();
  deal();
  setTimeout(autoDecisionLoop, 650);
}
function autoDecisionLoop() {
  if (!autoPlayRunning) return;
  if (gamePhase === 'playing') {
    autoChoose();
    if (gamePhase === 'playing') setTimeout(autoDecisionLoop, 650);
  } else if (gamePhase === 'done') {
    if (autoSettings.rounds !== 0) autoPlayRoundsLeft--;
    setTimeout(runAutoRound, 2100);
  } else {
    setTimeout(runAutoRound, 250);
  }
}
function stopAutoPlay() {
  autoPlayRunning = false;
  autoSettings.autoPlay = false;
  syncSettingsUI();
  setButtons(gamePhase);
}
function toggleAutoPlay() {
  if (autoPlayRunning) { stopAutoPlay(); setMessage('Auto Play stopped.', 'info'); return; }
  autoSettings.autoPlay = true;
  syncSettingsUI();
  autoPlayStart();
}

// ─── CHEAT PANEL ────────────────────────────────────────────────────────────
const KONAMI    = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx   = 0;
let cheatActive = {
  forceWin: false,
  forceBlackjack: false,
  dealerBust: false,
  revealDealer: false
};
let animationsEnabled = true;
let autoAllInEnabled = false;

// Konami Code
document.addEventListener('keydown', e => {
  if (e.key === KONAMI[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI.length) { konamiIdx = 0; openCheat(); }
  } else {
    konamiIdx = 0;
  }
});

// Triple-click brand logo
let brandClicks = 0, brandTimer = null;
document.querySelector('.brand').addEventListener('click', () => {
  brandClicks++;
  clearTimeout(brandTimer);
  brandTimer = setTimeout(() => { brandClicks = 0; }, 700);
  if (brandClicks >= 3) { brandClicks = 0; openCheat(); }
});

function openCheat() {
  document.getElementById('cheatOverlay').classList.add('open');
  const panel = document.getElementById('cheatPanel');
  panel.classList.add('gold-flash');
  setTimeout(() => panel.classList.remove('gold-flash'), 700);
  cheatFb('');
}

function closeCheat() {
  document.getElementById('cheatOverlay').classList.remove('open');
}

document.getElementById('cheatOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('cheatOverlay')) closeCheat();
});

function cheatFb(msg, color = '#4ade80') {
  const el = document.getElementById('cheatFeedback');
  el.style.color  = color;
  el.textContent  = msg;
}

function cheat_addMoney(amount) {
  balance += amount;
  updateBalanceDisplay();
  cheatFb(`✓ Added ${fmt(amount)} — Balance: ${fmt(balance)}`);
}

function cheat_setMoney(amount) {
  balance = amount;
  updateBalanceDisplay();
  cheatFb(`✓ Balance set to ${fmt(amount)}`);
}

function cheat_customAdd() {
  const val = parseInt(document.getElementById('cheatAmountInput').value);
  if (!val || val < 1) { cheatFb('Enter a valid amount.', '#f87171'); return; }
  balance += val;
  updateBalanceDisplay();
  cheatFb(`✓ Added ${fmt(val)} — Balance: ${fmt(balance)}`);
  document.getElementById('cheatAmountInput').value = '';
}

function syncCheatToggles() {
  const map = {
    forceWin: 'forceWinToggle',
    forceBlackjack: 'forceBlackjackToggle',
    dealerBust: 'dealerBustToggle',
    revealDealer: 'revealToggle'
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', !!cheatActive[key]);
  }
}

function toggleCheat(type) {
  if (!(type in cheatActive)) return;

  // Force-win and force-blackjack are mutually exclusive.
  if (type === 'forceWin' && !cheatActive.forceWin) cheatActive.forceBlackjack = false;
  if (type === 'forceBlackjack' && !cheatActive.forceBlackjack) cheatActive.forceWin = false;

  cheatActive[type] = !cheatActive[type];
  syncCheatToggles();

  const labels = {
    forceWin: 'FORCE WIN',
    forceBlackjack: 'FORCE BLACKJACK',
    dealerBust: 'DEALER BUST',
    revealDealer: 'REVEAL HOLE CARD'
  };
  cheatFb(`${cheatActive[type] ? '✓ Enabled' : '✓ Disabled'} ${labels[type]}`);
}

function toggleAnimations() {
  animationsEnabled = !animationsEnabled;
  document.body.classList.toggle('no-animations', !animationsEnabled);
  const btn = document.getElementById('animationsToggle');
  if (btn) btn.classList.toggle('active', animationsEnabled);
  cheatFb(`${animationsEnabled ? '✓ Animations enabled' : '✓ Animations disabled'}`);
}

function cheat_forceWin() {
  cheatActive.forceWin = true;
  cheatActive.forceBlackjack = false;
  syncCheatToggles();
  cheatFb('✓ FORCE WIN enabled');
}

function cheat_forceBlackjack() {
  cheatActive.forceBlackjack = true;
  cheatActive.forceWin = false;
  syncCheatToggles();
  cheatFb('✓ FORCE BLACKJACK enabled');
}

function cheat_dealerBustNow() {
  if (gamePhase !== 'playing') return;
  if (dealerHand[1]) dealerHand[1].hidden = false;
  while (handValue(dealerHand) <= 21) dealerHand.push({ suit: '♠', rank: 'K' });
  renderHands();
  endRound('win');
}

function cheat_dealerBust() {
  cheatActive.dealerBust = !cheatActive.dealerBust;
  syncCheatToggles();
  cheatFb(`✓ Dealer bust ${cheatActive.dealerBust ? 'enabled' : 'disabled'}`);
}

function cheat_revealDealer() {
  cheatActive.revealDealer = !cheatActive.revealDealer;
  syncCheatToggles();
  if (gamePhase === 'playing' && dealerHand[1]) {
    dealerHand[1].hidden = !cheatActive.revealDealer;
    renderHands();
  }
  cheatFb(`✓ Hole card ${cheatActive.revealDealer ? 'revealed' : 'hidden'}`);
}

function cheat_clearHistory() {
  history = [];
  document.getElementById('historyRow').innerHTML = '';
  cheatFb('✓ History wiped clean.');
}

function cheat_reset() {
  balance     = 2500;
  bet         = 0;
  cheatActive = {
    forceWin: false,
    forceBlackjack: false,
    dealerBust: false,
    revealDealer: false
  };
  history     = [];
  document.getElementById('historyRow').innerHTML = '';
  updateBalanceDisplay();
  updateBetDisplay();
  if (gamePhase !== 'betting') {
    playerHand = []; dealerHand = [];
    gamePhase  = 'betting';
    setButtons('betting');
    renderHands();
  }
  syncCheatToggles();
  cheatFb('✓ Hard reset — back to $2,500');
}

// Patch deal() for force cheats
const _origDeal = deal;
deal = function () {
  if (cheatActive.forceBlackjack) {
    if (bet === 0) { flashMessage('Gotta bet something first.', 'lose'); return; }
    balance -= bet;
    updateBalanceDisplay();
    deck       = shuffleDeck([...buildDeck(), ...buildDeck()]);
    playerHand = [{ suit: '♠', rank: 'A' }, { suit: '♦', rank: 'K' }];
    dealerHand = [drawCard(), { ...drawCard(), hidden: true }];
    gamePhase  = 'playing';
    setButtons('playing');
    renderHands();
    dealerHand[1].hidden = false;
    renderHands();
    endRound(isBlackjack(dealerHand) ? 'push' : 'blackjack');
    return;
  }
  if (cheatActive.forceWin) {
    if (bet === 0) { flashMessage('Gotta bet something first.', 'lose'); return; }
    balance -= bet;
    updateBalanceDisplay();
    deck       = shuffleDeck([...buildDeck(), ...buildDeck()]);
    playerHand = [{ suit: '♥', rank: 'K' }, { suit: '♦', rank: 'Q' }];
    dealerHand = [{ suit: '♣', rank: '9' }, { ...{ suit: '♠', rank: '6' }, hidden: true }];
    gamePhase  = 'playing';
    setButtons('playing');
    document.getElementById('doubleBtn').disabled = balance < bet;
    renderHands();
    if (cheatActive.revealDealer && dealerHand[1]) {
      dealerHand[1].hidden = false;
      renderHands();
    }
    if (cheatActive.dealerBust) {
      setTimeout(() => {
        if (gamePhase === 'playing') {
          cheat_dealerBustNow();
        }
      }, 350);
    }
    setMessage('Cheat active — you have 20. Hit or Stand?', 'info');
    return;
  }
  _origDeal();

  if (cheatActive.revealDealer && dealerHand[1]) {
    dealerHand[1].hidden = false;
    renderHands();
  }
  if (cheatActive.dealerBust) {
    setTimeout(() => {
      if (gamePhase === 'playing') cheat_dealerBustNow();
    }, 350);
  }
};

// ─── INIT ───────────────────────────────────────────────────────────────────
updateBalanceDisplay();
updateBetDisplay();
setButtons('betting');
renderHands();
syncSettingsUI();
