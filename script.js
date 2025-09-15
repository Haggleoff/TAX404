let players = [];
let currentPlayerIndex = 0;
let timerInterval = null;
let timeLeft = 60;
let timerRunningState = true;
let disallowedNormalCards = [];

const debtCategories = [
  "Haggie", "Stomp&Bray", "Lawffy", "Finnley", "Hoobert", "Droolski", "Vinnie", "Twiggles", "Mav", "Clauseby", "Buckley", "Bugsy", "Wiggy", "Squeak", "Beebo", "Wally", "Tillie", "Moozy"
];
function getImageName(name) {
  return `Characters/${name.toLowerCase().replace(/&/g, "-").replace(/ /g, "-")}.png`;
}
let debts = [];

let lastTouch = 0;
document.addEventListener('touchend', function(e) {
  if (
    e.target.closest('button') ||
    e.target.closest('.styled-btn') ||
    e.target.closest('.card-btn') ||
    e.target.closest('.donate-btn-shape')
  ) {
    const now = new Date().getTime();
    if (now - lastTouch <= 350) {
      e.preventDefault();
    }
    lastTouch = now;
  }
}, { passive: false });

document.getElementById("playerForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const entered = [...this.querySelectorAll("input[name='playerName']")].filter(input => input.value.trim());
  if (entered.length < 2) {
    customPopup("You’ll need at least two capitalists to get crushed. Multiplayer only!");
    return;
  }
  players = entered.map(input => ({
    name: input.value.trim(),
    streaks: 0,
    powerCards: 0,
    progress: 0,
    coins: 0,
    properties: 0,
    tax: 0
  }));
  disallowedNormalCards = Array(players.length).fill(0);
  debts = Array(players.length).fill().map((_, i) =>
    Array(players.length).fill().map((_, j) => {
      let obj = {};
      debtCategories.forEach(cat => obj[cat] = 0);
      return obj;
    })
  );
  document.getElementById("playerSetupBox").style.display = "none";
  const n = players.length;
  let setupMsg = `<span style="font-family: 'Roboto', sans-serif; color: #f1f1f1;">Reloading this page will reset your progress.</span><br><br>`;
  setupMsg += `<span style="font-family: 'Roboto', sans-serif; color: #f1f1f1;">
      After each player receives 1 free starting property during Setup,
    </span><br>
    <span class="player-name" style="color: #d4af7f;">Property Stack size: ${n + 1}</span>`;
  customPopup(setupMsg, function() {
    showPlayerCards();
  }, true, "Yes", "No", true);
});

function calculateOutstandingDebts(playerIdx) {
  let totalDebts = 0;
  for (let i = 0; i < players.length; i++) {
    if (i === playerIdx) continue;
    totalDebts += debtCategories.reduce((sum, cat) => sum + (debts[playerIdx][i][cat] || 0), 0);
  }
  return totalDebts;
}

function showPlayerCards() {
  let cards = '';
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    // Calculate outstanding debts for this player
    const outstandingDebts = calculateOutstandingDebts(i);
    cards += `
      <div class="player-card${i === currentPlayerIndex ? ' active' : ''}" data-index="${i}">
        <div class="player-card-inner">
          <div class="player-card-name">${player.name}</div>
          <div class="player-card-timer" id="playerTimer" ${i === currentPlayerIndex ? 'style="cursor:pointer;"' : ''}>
            ${i === currentPlayerIndex ? timeLeft : ""}
          </div>
          <div class="player-card-progress">${renderCardProgress(player.progress)}</div>
          <div class="player-card-breaks">
            <span>Tax Breaks Earned:</span>
            <span class="player-card-breaks-num">${player.streaks + player.powerCards}</span>
          </div>
          <div style="margin: 0.5rem 0; font-size:1rem; color:#dc143c; font-family:'Lilita One',cursive;">
            Outstanding Debts: <span style="font-weight:bold;">${outstandingDebts}</span>
          </div>
          <div class="player-card-actions">
            <button class="card-btn donate-btn" onclick="donateAction(${i})">Log</button>
          </div>
        </div>
      </div>
    `;
  }
  document.getElementById("mainGameContainer").innerHTML = `
    <div class="player-cards-scroll-container">
      <div class="player-cards-row" id="playerCardsRow">${cards}</div>
    </div>
    <div style="text-align:center; margin: 2rem auto 0 auto;">
      <button id="endgameTaxesBtn" class="styled-btn" onclick="showEndgame()">Endgame Taxes</button>
    </div>
  `;
  scrollToActiveCard();
  setupScrollToSetActivePlayer();
  setupPlayerCardClickHandler();
  setupTimerClickHandler();
  if (timerInterval) clearInterval(timerInterval);
  timeLeft = 60;
  timerRunningState = true;
  startTimer();
  updatePopupTimerDisplay();
}

function renderCardProgress(progress) {
  return `<div class="player-card-progress-bar">
    ${progress > 0 ? Array(progress).fill('<div style="width: 20px; height: 30px; background-color: #d4af7f; margin: 0 2px; border-radius: 5px;"></div>').join('') : ''}
  </div>`;
}

function setupTimerClickHandler() {
  setTimeout(() => {
    const timerDiv = document.querySelector('.player-card.active .player-card-timer');
    if (timerDiv) {
      timerDiv.onclick = function() {
        handleTimerClick();
      }
    }
    const calcTimerDiv = document.getElementById('calculatorTimerDisplay');
    if (calcTimerDiv) {
      calcTimerDiv.style.cursor = 'pointer';
      calcTimerDiv.onclick = function() {
        handleTimerClick();
      }
    }
  }, 0);
}

function handleTimerClick() {
  if (timeLeft === 0) {
    timeLeft = 60;
    timerRunningState = true;
    updatePopupTimerDisplay();
    startTimer();
  } else {
    timerRunningState = !timerRunningState;
    if (timerRunningState) startTimer();
    else if (timerInterval) clearInterval(timerInterval);
  }
  updatePopupTimerDisplay();
}

function setupPlayerCardClickHandler() {
  setTimeout(() => {
    const row = document.getElementById("playerCardsRow");
    if (!row) return;
    const cards = Array.from(row.querySelectorAll('.player-card'));
    cards.forEach((card, i) => {
      card.onclick = function(e) {
        if (e.target.closest('.card-btn')) return;
        if (currentPlayerIndex === i) return;
        currentPlayerIndex = i;
        if (timerInterval) clearInterval(timerInterval);
        timeLeft = 60;
        timerRunningState = true;
        cards.forEach((c, idx) => c.classList.toggle('active', idx === i));
        scrollToActiveCard();
        startTimer();
        updatePopupTimerDisplay();
        setupTimerClickHandler();
      };
    });
  }, 0);
}

function setupScrollToSetActivePlayer() {
  setTimeout(() => {
    const row = document.getElementById("playerCardsRow");
    if (!row) return;
    let scrollTimeout = null;
    row.onscroll = function() {
      let cards = Array.from(row.querySelectorAll('.player-card'));
      let rowRect = row.getBoundingClientRect();
      let center = rowRect.left + rowRect.width / 2;
      let minDist = Infinity, minIndex = 0;
      cards.forEach((card, i) => {
        let cardRect = card.getBoundingClientRect();
        let cardCenter = cardRect.left + cardRect.width / 2;
        let dist = Math.abs(center - cardCenter);
        if (dist < minDist) {
          minDist = dist;
          minIndex = i;
        }
      });
      if (minIndex !== currentPlayerIndex) {
        currentPlayerIndex = minIndex;
        if (timerInterval) clearInterval(timerInterval);
        timeLeft = 60;
        timerRunningState = true;
        startTimer();
        cards.forEach((c, idx) => c.classList.toggle('active', idx === minIndex));
        updatePopupTimerDisplay();
        setupTimerClickHandler();
      }
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const activeCard = cards[currentPlayerIndex];
        if (activeCard && row) {
          const rowRect = row.getBoundingClientRect();
          const activeRect = activeCard.getBoundingClientRect();
          const scrollLeft = row.scrollLeft +
            (activeRect.left + activeRect.width / 2) -
            (rowRect.left + rowRect.width / 2);
          row.scrollTo({ left: scrollLeft, behavior: "smooth" });
        }
      }, 200);
    };
  }, 0);
}

function scrollToActiveCard() {
  setTimeout(() => {
    const row = document.getElementById("playerCardsRow");
    const active = row.querySelector(".player-card.active");
    if (active && row) {
      const rowRect = row.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const scrollLeft = row.scrollLeft +
        (activeRect.left + activeRect.width / 2) -
        (rowRect.left + rowRect.width / 2);
      row.scrollTo({
        left: scrollLeft,
        behavior: "smooth"
      });
    }
  }, 0);
}

function prevPlayer() {
  currentPlayerIndex = (currentPlayerIndex - 1 + players.length) % players.length;
  showPlayerCards();
}

function nextPlayer() {
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  showPlayerCards();
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (timerRunningState && timeLeft > 0) {
      timeLeft--;
      updatePopupTimerDisplay();
      updateCalculatorTimerDisplay();
      if (timeLeft <= 0) {
        timerRunningState = false;
      }
    }
  }, 1000);
}

function updatePopupTimerDisplay() {
  const timerDivs = document.querySelectorAll("#playerTimer");
  timerDivs.forEach((div, i) => {
    if (i === currentPlayerIndex) div.innerText = timeLeft;
    else div.innerText = "";
  });
  updateCalculatorTimerDisplay();
  setupTimerClickHandler();
}

function updateCalculatorTimerDisplay() {
  const calcTimer = document.getElementById('calculatorTimerDisplay');
  if (calcTimer) {
    calcTimer.innerText = timeLeft;
  }
}

function donateAction(playerIndex) {
  if (playerIndex !== currentPlayerIndex) return;
  loadCalculator();
}

function tookCharityAction(playerIndex) {
  if (playerIndex !== currentPlayerIndex) return;
  if (players[currentPlayerIndex].progress > 0) {
    disallowedNormalCards[currentPlayerIndex] += players[currentPlayerIndex].progress;
  }
  players[currentPlayerIndex].progress = 0;
  nextPlayer();
}

function loadCalculator() {
  const player = players[currentPlayerIndex];
  let normalDonated = 0;
  let powerDonated = 0;
  let tempProgress = player.progress;

  function updateDisplay() {
    let prev = tempProgress;
    let donated = normalDonated;
    let total = prev + donated;
    let remainder = total % 5;
    let blocksToShow = (remainder === 0 && total > 0) ? 5 : remainder;
    let prevLeft = 0;
    if (total > 0) {
      let prevUsed = Math.min(prev, total - blocksToShow);
      prevLeft = prev - prevUsed;
      if (prevLeft < 0) prevLeft = 0;
      if (blocksToShow < prevLeft) prevLeft = blocksToShow;
    }
    let gold = prevLeft;
    let gray = Math.max(0, blocksToShow - gold);
    let blocks = "";
    for (let i = 0; i < 5; i++) {
      if (i < gold) {
        blocks += `<div class="donate-block" style="background:#d4af7f;"></div>`;
      } else if (i < gold + gray) {
        blocks += `<div class="donate-block" style="background:#d9d9d9;"></div>`;
      } else {
        blocks += `<div class="donate-block donate-block-empty"></div>`;
      }
    }

    let streaksThisTurn = Math.floor(total / 5);
    let totalStreaksThisTurn = streaksThisTurn;
    let taxBreaksPreview = player.streaks + player.powerCards + powerDonated + totalStreaksThisTurn;

    let timerHtml = `
      <div id="calculatorTimerWrapper">
        <span id="calculatorTimerDisplay" class="player-card-timer" style="cursor:pointer;">${timeLeft}</span>
      </div>
    `;
    let buttonContainerStyle = "display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap;";
    let mainBtnStyle = "background:#d4af7f; color:#232323; min-width:110px; border-radius:8px; border:none; font-family:'Lilita One',cursive; font-size:1.05rem; font-weight:normal; cursor:pointer; padding:0.65rem 1.2rem;";
    let plusBtnStyle = "background:#d4af7f; color:#232323; border:none; border-radius:50%; width:32px; height:32px; font-size:1.3rem; cursor:pointer; font-family:'Lilita One',cursive; display:inline-flex; align-items:center; justify-content:center;";
    let minusBtnStyle = "background:#947c52; color:#fff; border:none; border-radius:50%; width:32px; height:32px; font-size:1.3rem; cursor:pointer; font-family:'Lilita One',cursive; display:inline-flex; align-items:center; justify-content:center;";
    let confirmButtonHtml = '';
    let tookCharityButtonHtml = `
      <button id="tookCharityBtn" style="${mainBtnStyle}">Took from Charity</button>
    `;
    if (normalDonated === 0 && powerDonated === 0) {
      confirmButtonHtml = `
        <button id="confirmDonationBtn" style="${mainBtnStyle}">No Donations</button>
        ${tookCharityButtonHtml}
      `;
    } else {
      confirmButtonHtml = `<button onclick="confirmTurnWithBlocks(${normalDonated},${powerDonated})" id="confirmDonationBtn" style="${mainBtnStyle}">Confirm</button>`;
    }

    let debtsGridHtml = '';
    if (players.length > 1) {
      debtsGridHtml += `<div style="margin-top:0.5rem;">
        <h3 class="lilita" style="color:#fff; font-size:1.28rem; margin-bottom:0.45rem; font-weight:normal;">Outstanding Debts</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:0.95rem;">`;
      for (let i = 0; i < players.length; i++) {
        if (i === currentPlayerIndex) continue;
        let totalDebts = debtCategories.reduce((sum, cat) => sum + (debts[currentPlayerIndex][i][cat] || 0), 0);
        debtsGridHtml += `
          <div class="debtsGridCell" data-debtor="${currentPlayerIndex}" data-creditor="${i}"
            style="background:#313131; border:3px solid #d4af7f60; border-radius:14px; box-shadow:0 4px 16px #0002, 0 0 8px #d4af7f18; padding:0.85rem 0.6rem; text-align:center; cursor:pointer; font-family:'Lilita One',cursive; font-weight:normal;">
            <div style="font-size:1.13rem; color:#d4af7f; margin-bottom:0.25rem;">${players[i].name}</div>
            <div style="font-size:1.28rem; color:#fff; margin-bottom:0.3rem;">
              <span style="font-family:'Roboto',sans-serif; font-size:1rem; color:#d4af7f;">Debts:</span>
              <span style="color:#dc143c; font-weight:normal;">${totalDebts}</span>
            </div>
          </div>
        `;
      }
      debtsGridHtml += `</div></div>`;
    }

    document.getElementById("mainGameContainer").innerHTML = `
      <div class="calculatorBox" style="text-align:center; position:relative;">
        ${timerHtml}
        <h2 class="player-name">${player.name}'s Turn</h2>
        <label>Normal Cards Donated</label>
        <div class="donate-row">
          <button class="donate-btn-shape" id="minusNormal" style="${minusBtnStyle}" ${normalDonated === 0 ? 'disabled' : ''}>-</button>
          <div class="donate-blocks-container">${blocks}</div>
          <button class="donate-btn-shape" id="plusNormal" style="${plusBtnStyle}" ${(normalDonated + tempProgress >= 20) ? 'disabled' : ''}>+</button>
        </div>
        <span class="streak-helper">Each streak (5 cards) is a Tax Break Earned</span>
        <label class="power-label">Power Cards or Cash Donated</label>
        <div class="donate-row">
          <button class="donate-btn-shape" id="minusPower" style="${minusBtnStyle}" ${powerDonated === 0 ? 'disabled' : ''}>-</button>
          <div class="power-circle-container">
            <div class="power-circle${powerDonated === 0 ? " zero" : ""}">${powerDonated}</div>
          </div>
          <button class="donate-btn-shape" id="plusPower" style="${plusBtnStyle}" ${powerDonated >= 20 ? 'disabled' : ''}>+</button>
        </div>
        <p class="player-card-breaks" style="text-align:center; margin-bottom:0.2rem;">Tax Breaks Earned: <span id="taxBreaksPreview">${taxBreaksPreview}</span></p>
        ${debtsGridHtml}
        <div style="${buttonContainerStyle}">
          ${confirmButtonHtml}
        </div>
      </div>
    `;

    updateCalculatorTimerDisplay();
    setupTimerClickHandler();

    document.getElementById("plusNormal").onclick = function() {
      if (normalDonated + tempProgress < 20) {
        normalDonated++;
        updateDisplay();
      }
    };
    document.getElementById("minusNormal").onclick = function() {
      if (normalDonated > 0) {
        normalDonated--;
        updateDisplay();
      }
    };
    document.getElementById("plusPower").onclick = function() {
      if (powerDonated < 20) {
        powerDonated++;
        updateDisplay();
      }
    };
    document.getElementById("minusPower").onclick = function() {
      if (powerDonated > 0) {
        powerDonated--;
        updateDisplay();
      }
    };
    document.getElementById("confirmDonationBtn").onclick = function() {
      if (normalDonated === 0 && powerDonated === 0) {
        nextPlayer();
      } else {
        confirmTurnWithBlocks(normalDonated, powerDonated);
      }
    };

    if (normalDonated === 0 && powerDonated === 0) {
      const tookCharityBtn = document.getElementById("tookCharityBtn");
      if (tookCharityBtn) {
        tookCharityBtn.onclick = function() {
          tookCharityAction(currentPlayerIndex);
        };
      }
    }

    document.querySelectorAll('.debtsGridCell').forEach(cell => {
      cell.onclick = function() {
        const debtorIdx = parseInt(cell.getAttribute("data-debtor"));
        const creditorIdx = parseInt(cell.getAttribute("data-creditor"));
        showDebtsPopup(debtorIdx, creditorIdx);
      };
    });
  }
  updateDisplay();
}

function showDebtsPopup(debtorIdx, creditorIdx) {
  const creditorName = players[creditorIdx].name;
  const plusBtnStyle = "background:#d4af7f; color:#232323; border:none; border-radius:50%; width:32px; height:32px; font-size:1.3rem; cursor:pointer; font-family:'Lilita One',cursive; display:inline-flex; align-items:center; justify-content:center;";
  const minusBtnStyle = "background:#947c52; color:#fff; border:none; border-radius:50%; width:32px; height:32px; font-size:1.3rem; cursor:pointer; font-family:'Lilita One',cursive; display:inline-flex; align-items:center; justify-content:center;";
  let popupHtml = `<h2 class="lilita" style="color:#d4af7f; font-weight:normal; margin-bottom:0.7rem;">Debts Owed to ${creditorName}</h2>`;

  popupHtml += `<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(115px,1fr)); gap:1rem; margin-bottom:1rem;">`;
  debtCategories.forEach(cat => {
    const imgSrc = getImageName(cat);
    const debtAmt = debts[debtorIdx][creditorIdx][cat] || 0;
    popupHtml += `
      <div style="position:relative; background:#232323; border-radius:12px; box-shadow:0 2px 8px #0002; padding:0.5rem;">
        <div style="position:relative;">
          <img src="${imgSrc}" alt="${cat}" style="width:84px; height:84px; object-fit:contain; border-radius:10px; background:#191919; box-shadow:0 1px 3px #0002;">
          <div style="position:absolute; left:12px; bottom:10px;">
            <button class="changeDebtBtn" data-cat="${cat}" data-delta="-1" data-debtor="${debtorIdx}" data-creditor="${creditorIdx}" style="${minusBtnStyle}">-</button>
          </div>
          <div style="position:absolute; right:12px; bottom:10px;">
            <button class="changeDebtBtn" data-cat="${cat}" data-delta="1" data-debtor="${debtorIdx}" data-creditor="${creditorIdx}" style="${plusBtnStyle}">+</button>
          </div>
        </div>
        <div style="display:flex; align-items:center; justify-content:center; font-family:'Lilita One',cursive; margin-top:0.3rem; color:#d4af7f; font-size:1rem;">
          <span style="flex:1; text-align:left;">${cat}</span>
          <span style="flex:none; margin-left:0.7em; font-weight:bold;">${debtAmt}</span>
        </div>
      </div>
    `;
  });

  popupHtml += `</div>
    <button id="closeDebtsPopupBtn" style="margin-top:0.2rem; background:#d4af7f; color:#232323; border-radius:8px; border:none; padding:0.65rem 1.2rem; font-family:'Lilita One',cursive; font-size:1.05rem; cursor:pointer;">Close</button>
  `;

  customHTMLPopupNoExtraCloseBtn(`<div></div>`, popupHtml, () => {
    document.getElementById("closeDebtsPopupBtn").onclick = () => {
      document.getElementById("customPopupOverlay").style.display = "none";
      loadCalculator();
    };
    document.querySelectorAll('.changeDebtBtn').forEach(btn => {
      btn.onclick = function(e) {
        const cat = btn.getAttribute('data-cat');
        const delta = parseInt(btn.getAttribute('data-delta'));
        const debtorIdx = parseInt(btn.getAttribute('data-debtor'));
        const creditorIdx = parseInt(btn.getAttribute('data-creditor'));
        debts[debtorIdx][creditorIdx][cat] = Math.max(0, (debts[debtorIdx][creditorIdx][cat] || 0) + delta);
        showDebtsPopup(debtorIdx, creditorIdx);
      };
    });
  });
}

function customHTMLPopupNoExtraCloseBtn(message, html, callback) {
  const overlay = document.getElementById("customPopupOverlay");
  const msg = document.getElementById("customPopupMessage");
  const yesBtn = document.getElementById("customPopupYes");
  const noBtn = document.getElementById("customPopupNo");

  msg.innerHTML = `${message}<br>${html}`;
  msg.style.maxHeight = "75vh";
  msg.style.overflowY = "auto";

  overlay.style.display = "flex";
  yesBtn.style.display = "none";
  noBtn.style.display = "none";

  if (typeof callback === "function") callback();
}

function confirmTurnWithBlocks(normalDonated, powerDonated) {
  const p = players[currentPlayerIndex];
  let totalProgress = p.progress + normalDonated;
  let completedStreaks = Math.floor(totalProgress / 5);
  p.streaks += completedStreaks;
  p.progress = totalProgress % 5;
  p.powerCards += powerDonated;
  nextPlayer();
}

function showEndgame() {
  customPopup("Is the game over? Ready for final taxes?", function(confirm) {
    if (confirm) {
      loadEndgame();
    } else {
      showPlayerCards();
    }
  });
}

function loadEndgame() {
  if (timerInterval) clearInterval(timerInterval);
  timerRunningState = false;
  let blocks = players.map((p, i) => `
    <div class="endgame-card">
      <div class="final-result-card-inner">
        <div class="final-result-name player-name">${p.name}</div>
        <div class="sideInputs">
          <input type="number" id="coins_${i}" min="0" step="1" placeholder="Haggleoffs">
          <input type="number" id="props_${i}" min="1" step="1" placeholder="Properties">
        </div>
      </div>
    </div>
  `).join("");

  document.getElementById("mainGameContainer").innerHTML = `
    <div class="calculatorBox">
      <h2 class="lilita" style="color: #d4af7f;">Endgame</h2>
      <p style="text-align:center;">Enter each player’s Haggleoffs and Properties.</p>
      <div class="endgame-cards-container">
        ${blocks}
      </div>
      <button onclick="calculateFinalTaxes()">Calculate Taxes</button>
      <div id="finalSummary" style="display:none;"></div>
    </div>
  `;
}

function getTaxBracketMessage(coins, properties) {
  if (coins <= 6 && properties > 3) return "Broke on paper, rich in acres.";
  if (coins <= 6) return "Enjoy tax-free poverty.";
  if (coins <= 14) return "The poor get crushed.";
  if (coins <= 24) return "The middle class gets squeezed.";
  if (coins <= 39) return "The rich barely feel it.";
  return "Wealth scales, burden doesn’t.";
}

function calculateFinalTaxes() {
  const summary = document.getElementById("finalSummary");
  summary.style.display = "none";
  summary.innerHTML = "";

  for (let i = 0; i < players.length; i++) {
    const coinsVal = document.getElementById(`coins_${i}`).value.trim();
    const propsVal = document.getElementById(`props_${i}`).value.trim();
    if (!/^\d+$/.test(coinsVal) || !/^\d+$/.test(propsVal)) {
      customPopup("Use only whole non-negative numbers.");
      return;
    }
  }

  for (let i = 0; i < players.length; i++) {
    const coinsVal = document.getElementById(`coins_${i}`).value.trim();
    const propsVal = document.getElementById(`props_${i}`).value.trim();

    players[i].coins = Number(coinsVal);
    players[i].properties = Math.max(1, Number(propsVal));

    const p = players[i];
    const bracketTax = p.coins <= 6 ? 0 : p.coins <= 14 ? 3 : p.coins <= 24 ? 5 : p.coins <= 39 ? 8 : 10;
    const propertyTax = p.coins > 6 ? p.properties * (p.properties >= 4 ? 2 : 1) : 0;
    let grossTax = bracketTax + propertyTax;
    let capTax = Math.floor(p.coins * 0.54);
    let baseTax = grossTax < capTax ? grossTax : capTax;
    const postBreakTax = Math.max(0, baseTax - (p.streaks + p.powerCards));
    p.tax = Math.min(postBreakTax, p.coins);
    if (p.tax === 0) {
      if (p.coins >= 34 && p.coins <= 39) {
        p.tax = Math.floor(p.coins * 0.03);
      } else if (p.coins >= 40) {
        p.tax = Math.floor(p.coins * 0.05);
      }
    }
  }

  const netWorths = players.map(p => p.coins - p.tax);
  const maxCoins = Math.max(...netWorths);
  const contenders = players.filter(p => (p.coins - p.tax) === maxCoins);

  let winnerHtml = "";
  if (contenders.length === 1) {
    winnerHtml = `<div class="final-results-winner"><span class="player-name">${contenders[0].name}</span> wins with ${maxCoins} Haggleoffs!</div>`;
  } else {
    const maxProps = Math.max(...contenders.map(p => p.properties));
    const tied = contenders.filter(p => p.properties === maxProps);
    if (tied.length === 1) {
      winnerHtml = `<div class="final-results-winner"><span class="player-name">${tied[0].name}</span> wins by owning more properties!</div>`;
    } else {
      const names = tied.map(p => `<span class="player-name">${p.name}</span>`).join(", ");
      winnerHtml = `<div class="final-results-winner"><span style="color:#d4af7f;">There are no winners—just shareholders.</span><br>Tied players: ${names}</div>`;
    }
  }

  let cardsHtml = "";
  players.forEach((p, i) => {
    const coinsVal = p.coins;
    const propsVal = p.properties;
    const bracketTax = coinsVal <= 6 ? 0 : coinsVal <= 14 ? 3 : coinsVal <= 24 ? 5 : coinsVal <= 39 ? 8 : 10;
    const propertyTax = coinsVal > 6 ? propsVal * (propsVal >= 4 ? 2 : 1) : 0;
    let grossTax = bracketTax + propertyTax;
    let capTax = Math.floor(coinsVal * 0.54);
    let baseTax = grossTax < capTax ? grossTax : capTax;
    const breaks = p.streaks + p.powerCards;
    const postBreakTax = Math.max(0, baseTax - breaks);
    let displayTax = Math.min(postBreakTax, coinsVal);

    let amtApplied = false;
    let amtValue = 0;
    let amtPercentString = "";
    if (displayTax === 0) {
      if (coinsVal >= 34 && coinsVal <= 39) {
        amtApplied = true;
        amtValue = Math.floor(coinsVal * 0.03);
        amtPercentString = "3%";
        displayTax = amtValue;
      } else if (coinsVal >= 40) {
        amtApplied = true;
        amtValue = Math.floor(coinsVal * 0.05);
        amtPercentString = "5%";
        displayTax = amtValue;
      }
    }

    const avoided = Math.max(0, baseTax - displayTax);
    const beforeRate = coinsVal ? Math.round((baseTax / coinsVal) * 100) : 0;
    const afterRate = coinsVal ? Math.round((displayTax / coinsVal) * 100) : 0;
    const netIncome = coinsVal - displayTax;

    cardsHtml += `
      <div class="final-result-card">
        <div class="final-result-card-inner">
          <div class="final-result-name player-name">${p.name}</div>
          <div class="final-result-content">
            ${amtApplied ? `<span style="color:#dc143c;">AMT Triggered</span><br>` : ""}
            Coins: <span>${coinsVal}</span>, Properties: <span>${propsVal}</span><br>
            Gross Tax: ${baseTax}<br>
            <span style="color:#d4af7f;">Effective Rate: ${beforeRate}% → ${afterRate}%</span><br>
            Tax Avoided: ${avoided}<br>
            ${amtApplied ? `<span style="color:#dc143c;">AMT: ${amtValue} (${amtPercentString})</span><br>` : ""}
            <span style="color:#d4af7f;">Tax Owed: ${displayTax}</span><br>
            <span style="color:#d4af7f;">Net Income: ${netIncome}</span><br>
            Audit Risk: ${getAuditRiskLevel(p)}<br>
            <em style="color:#d4af7f;">${getTaxBracketMessage(coinsVal, propsVal)}</em><br>
            <a href="#" onclick="showTaxBreakdown(${i}); return false;" style="color:#f1f1f1; text-decoration:underline; font-style:italic;">More Info</a>
          </div>
        </div>
      </div>
    `;
  });

  summary.style.display = "block";
  summary.innerHTML = `
    <h3 style="margin-bottom:0.6rem;">Final Results</h3>
    ${winnerHtml}
    <div class="final-results-cards-container">
      ${cardsHtml}
    </div>
    <button onclick="exitToSetup()" class="styled-btn" style="max-width:180px; margin:1.1rem auto 0 auto; display:block;">EXIT</button>
  `;

  setTimeout(() => {
    const summaryEl = document.getElementById("finalSummary");
    if (summaryEl) summaryEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof confetti === "function") {
      confetti({
        particleCount: 120,
        spread: 90,
        origin: { y: 0.2 }
      });
    }
  }, 80);
}

function showTaxBreakdown(playerIndex) {
  const p = players[playerIndex];
  const bracketTax = p.coins <= 6 ? 0 : p.coins <= 14 ? 3 : p.coins <= 24 ? 5 : p.coins <= 39 ? 8 : 10;
  const propertyTax = p.coins > 6 ? p.properties * (p.properties >= 4 ? 2 : 1) : 0;
  let grossTax = bracketTax + propertyTax;
  let capTax = Math.floor(p.coins * 0.54);
  let baseTax = grossTax < capTax ? grossTax : capTax;
  const breaks = p.streaks + p.powerCards;
  const postBreakTax = Math.max(0, baseTax - breaks);
  let tax = Math.min(postBreakTax, p.coins);

  let amtApplied = false;
  let amtValue = 0;
  let amtPercentString = "";
  let amtExplanation = "";
  if (tax === 0) {
    if (p.coins >= 34 && p.coins <= 39) {
      amtApplied = true;
      amtValue = Math.floor(p.coins * 0.03);
      amtPercentString = "3%";
      tax = amtValue;
      amtExplanation = "<i>The Alternative Minimum Tax is a penalty imposed on wealthy taxpayers who reduced their tax bill to zero—because even loopholes have limits.</i>";
    } else if (p.coins >= 40) {
      amtApplied = true;
      amtValue = Math.floor(p.coins * 0.05);
      amtPercentString = "5%";
      tax = amtValue;
      amtExplanation = "<i>The Alternative Minimum Tax is a penalty imposed on wealthy taxpayers who reduced their tax bill to zero—because even loopholes have limits.</i>";
    }
  }

  const avoided = Math.max(0, baseTax - tax);
  const beforeRate = p.coins ? Math.round((baseTax / p.coins) * 100) : 0;
  const afterRate = p.coins ? Math.round((tax / p.coins) * 100) : 0;
  const netIncome = p.coins - tax;

  let streaksEarned = p.streaks;
  let donationsDetails = `
    <ul style="text-align:left;">
      <li>Normal Cards Donated: ${p.streaks * 5 + p.progress}</li>
      <li>Streaks Earned: ${streaksEarned}</li>
      <li>Power Cards or Cash Donated: ${p.powerCards}</li>
      <li><span style="color:#d4af7f;">Total Tax Breaks Earned:</span> <span style="color:#d4af7f;">${breaks}</span></li>
    </ul>
  `;

  let breakdownHTML = `
    <div style="text-align:left;">
      <span class="player-name">${p.name}</span><br>
      <strong>Income (Haggleoffs):</strong> ${p.coins}<br>
      <strong>Properties:</strong> ${p.properties}<br>
      <strong>Donations:</strong> ${donationsDetails}
      <hr>
      <strong>Bracket Tax:</strong> ${bracketTax}<br>
      <strong>Property Tax:</strong> ${propertyTax} (${p.properties >= 4 ? "2 per property" : p.coins > 6 ? "1 per property" : "0"})
      <br>
      <strong style="color:#d4af7f;">Gross Tax:</strong> <span style="color:#d4af7f;">${grossTax}</span><br>
      <strong>Maximum Tax Ceiling:</strong> ${capTax}<br>
      <span style="font-size:0.98em; color:#888;"><i>A built-in cap that ensures your tax never exceeds 54% of your gross income.</i></span><br>
      <strong>Base Tax Applied:</strong> ${baseTax}<br>
      <strong>Deductions from Donations:</strong> ${breaks} (Tax Breaks)<br>
      <strong>Tax after Deductions:</strong> ${Math.max(0, baseTax - breaks)}<br>
      ${amtApplied ? `<strong style="color:#dc143c;">AMT Applied:</strong> ${amtValue} (${amtPercentString})<br><span style="font-size:0.99em; color:#dc143c;">${amtExplanation}</span><br>` : ""}
      <strong style="color:#d4af7f;">Tax Owed:</strong> <span style="color:#d4af7f;">${tax}</span><br>
      <strong style="color:#d4af7f;">Net Income:</strong> <span style="color:#d4af7f;">${netIncome}</span><br>
      <strong>Effective Rate Before Deductions:</strong> ${beforeRate}%<br>
      <strong>Effective Rate After Deductions:</strong> ${afterRate}%<br>
      <strong style="color:#d4af7f;">Tax Avoided:</strong> <span style="color:#d4af7f;">${avoided}</span><br>
      <strong>Audit Risk:</strong> ${getAuditRiskLevel(p)}<br>
      <hr>
      <em style="color:#d4af7f;">${getTaxBracketMessage(p.coins, p.properties)}</em>
    </div>
  `;

  customHTMLPopup(
    `<h2 class="lilita" style="color:#d4af7f; font-weight:normal;">Tax Overview Statement</h2>`,
    breakdownHTML,
    () => {
      const closeBtn = document.getElementById("customCloseBtn");
      if (closeBtn) {
        closeBtn.onclick = () => {
          document.getElementById("customPopupOverlay").style.display = "none";
          calculateFinalTaxes();
        };
      }
    }
  );
}

function getAuditRiskLevel(player) {
  const breaks = player.streaks + player.powerCards;
  const income = player.coins || 1;
  const ratio = breaks / income;
  if (ratio >= 1) return "Board Review Pending";
  if (ratio >= 0.5) return "High";
  if (ratio >= 0.3) return "Moderate";
  return "Low";
}

function exitToSetup() {
  document.getElementById("mainGameContainer").innerHTML = `
    <div class="calculatorBox">
      <h2 class="lilita" style="color: #d4af7f;">Thank you for Haggleoffing...</h2>
      <button onclick="backToNameInput()">Enter New Players</button>
    </div>
  `;
}

function backToNameInput() {
  document.getElementById("playerSetupBox").style.display = "block";
  document.getElementById("mainGameContainer").innerHTML = "";
  players = [];
  disallowedNormalCards = [];
  currentPlayerIndex = 0;
  if (timerInterval) clearInterval(timerInterval);
  timerRunningState = true;
  timeLeft = 60;
}

function customPopup(message, callback, isHtml = false, yesText = "Yes", noText = "No", okOnly = false) {
  const overlay = document.getElementById("customPopupOverlay");
  const msg = document.getElementById("customPopupMessage");
  const yesBtn = document.getElementById("customPopupYes");
  const noBtn = document.getElementById("customPopupNo");

  if (isHtml) {
    msg.innerHTML = message;
  } else {
    msg.innerHTML = message.replace(/\n/g, "<br>");
  }
  msg.style.maxHeight = "75vh";
  msg.style.overflowY = "auto";

  overlay.style.display = "flex";

  if (typeof callback !== "function") {
    yesBtn.innerText = "OK";
    yesBtn.style.display = "inline-block";
    noBtn.style.display = "none";
    yesBtn.onclick = () => overlay.style.display = "none";
  } else if (okOnly) {
    yesBtn.innerText = "OK";
    yesBtn.style.display = "inline-block";
    noBtn.style.display = "none";
    yesBtn.onclick = () => {
      overlay.style.display = "none";
      callback();
    };
  } else {
    yesBtn.innerText = yesText;
    noBtn.innerText = noText;
    yesBtn.style.display = "inline-block";
    noBtn.style.display = "inline-block";
    yesBtn.onclick = () => {
      overlay.style.display = "none";
      callback(true);
    };
    noBtn.onclick = () => {
      overlay.style.display = "none";
      callback(false);
    };
  }
}

function customHTMLPopup(message, html, callback) {
  const overlay = document.getElementById("customPopupOverlay");
  const msg = document.getElementById("customPopupMessage");
  const yesBtn = document.getElementById("customPopupYes");
  const noBtn = document.getElementById("customPopupNo");

  msg.innerHTML = `${message}<br>${html}<br><br><button id="customCloseBtn">Close</button>`;
  msg.style.maxHeight = "75vh";
  msg.style.overflowY = "auto";

  overlay.style.display = "flex";
  yesBtn.style.display = "none";
  noBtn.style.display = "none";

  if (typeof callback === "function") callback();
}