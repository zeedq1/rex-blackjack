// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

const ALL_CHIPS = [
  { val: 1,     label: '1',   cls: 'chip-1',     sub: 'WHITE'  },
  { val: 10,    label: '10',  cls: 'chip-10',    sub: 'BLUE'   },
  { val: 50,    label: '50',  cls: 'chip-50',    sub: 'GREEN'  },
  { val: 100,   label: '100', cls: 'chip-100',   sub: 'RED'    },
  { val: 500,   label: '500', cls: 'chip-500',   sub: 'PURPLE' },
  { val: 1000,  label: '1K',  cls: 'chip-1000',  sub: 'GOLD'   },
  { val: 5000,  label: '5K',  cls: 'chip-5000',  sub: 'PINK'   },
  { val: 25000, label: '25K', cls: 'chip-25000', sub: 'CROWN'  },
];

// chip unlocks when balance >= threshold
const CHIP_UNLOCK = {
  1:     0,
  10:    0,
  50:    0,
  100:   500,
  500:   2500,
  1000:  5000,
  5000:  20000,
  25000: 75000,
};

// ─── STATE ──────────────────────────────────────────────────────────────────
let balance    = 2500;
let bet        = 0;
let deck       = [];
let playerHand = [];
let dealerHand = [];
let gamePhase  = 'betting'; // betting | playing | done
let history    = [];

// ─── DECK ───────────────────────────────────────────────────────────────────
function buildDeck() {
  const d = [];
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
  if (deck.length < 15) deck = shuffleDeck([...buildDeck(), ...buildDeck(), ...buildDeck()]);
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

  for (const chip of ALL_CHIPS) {
    const unlocked = balance >= CHIP_UNLOCK[chip.val];
    const div = document.createElement('div');
    div.className = `chip ${chip.cls}${unlocked ? '' : ' locked'}`;
    div.innerHTML = `<span class="chip-val">${chip.label}</span><span class="chip-sub">${chip.sub}</span>`;
    if (unlocked) div.onclick = () => addBet(chip.val);
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

// ─── DISPLAY ────────────────────────────────────────────────────────────────
function fmt(n) { return '$' + n.toLocaleString(); }

function updateBetDisplay() {
  document.getElementById('betDisplay').textContent = fmt(bet);
}

function updateBalanceDisplay() {
  document.getElementById('balanceDisplay').textContent = fmt(balance);
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
  for (const c of playerHand) pc.appendChild(cardEl(c));
  for (const c of dealerHand) dc.appendChild(cardEl(c));

  document.getElementById('playerScore').textContent = handValue(playerHand) || '-';
  const visible = dealerHand.filter(c => !c.hidden);
  document.getElementById('dealerScore').textContent = visible.length ? handValue(visible) : '-';
}

// ─── GAME LOGIC ─────────────────────────────────────────────────────────────
function deal() {
  if (bet === 0)       { flashMessage('Gotta bet something first.', 'lose'); return; }
  if (bet > balance)   { flashMessage('Bet exceeds balance.', 'lose'); return; }

  balance -= bet;
  updateBalanceDisplay();

  deck       = shuffleDeck([...buildDeck(), ...buildDeck(), ...buildDeck()]);
  playerHand = [drawCard(), drawCard()];
  dealerHand = [drawCard(), { ...drawCard(), hidden: true }];

  gamePhase = 'playing';
  setButtons('playing');
  renderHands();

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

// ─── CHEAT PANEL ────────────────────────────────────────────────────────────
const KONAMI    = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx   = 0;
let cheatActive = { forceWin: false, forceBlackjack: false };

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

function cheat_forceWin() {
  cheatActive.forceWin       = true;
  cheatActive.forceBlackjack = false;
  cheatFb('✓ Next hand forced WIN');
}

function cheat_forceBlackjack() {
  cheatActive.forceBlackjack = true;
  cheatActive.forceWin       = false;
  cheatFb('✓ Next hand forced BLACKJACK');
}

function cheat_dealerBust() {
  if (gamePhase !== 'playing') { cheatFb('No active hand.', '#f87171'); return; }
  dealerHand[1].hidden = false;
  while (handValue(dealerHand) <= 21) dealerHand.push({ suit: '♠', rank: 'K' });
  renderHands();
  endRound('win');
  cheatFb('✓ Dealer busted.');
  closeCheat();
}

function cheat_revealDealer() {
  if (dealerHand.length < 2) { cheatFb('No active hand.', '#f87171'); return; }
  dealerHand[1].hidden = false;
  renderHands();
  setTimeout(() => {
    if (gamePhase === 'playing') { dealerHand[1].hidden = true; renderHands(); }
  }, 3000);
  cheatFb('✓ Hole card revealed for 3s');
  closeCheat();
}

function cheat_clearHistory() {
  history = [];
  document.getElementById('historyRow').innerHTML = '';
  cheatFb('✓ History wiped clean.');
}

function cheat_reset() {
  balance     = 2500;
  bet         = 0;
  cheatActive = { forceWin: false, forceBlackjack: false };
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
    cheatActive.forceBlackjack = false;
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
    cheatActive.forceWin = false;
    gamePhase  = 'playing';
    setButtons('playing');
    document.getElementById('doubleBtn').disabled = balance < bet;
    renderHands();
    setMessage('Cheat active — you have 20. Hit or Stand?', 'info');
    return;
  }
  _origDeal();
};

// ─── INIT ───────────────────────────────────────────────────────────────────
updateBalanceDisplay();
updateBetDisplay();
setButtons('betting');
renderHands();
