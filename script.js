/************************************************************
 * TAX404
 * Trade Bar Text Simplification Patch
 * (Removed "You" from "You Owe" / "You Collect" on player card
 *  outstanding debt trade button and aligned wording app-wide)
 *
 * Integrated user-supplied Endgame & Outstanding Debts code (2025-11-21).
 * - Functions showEndgame, collectOutstandingDebtors, showOutstandingDebtsPopup,
 *   getPropertyCap, clampCoins/Properties (+ debounced schedulers),
 *   loadEndgame, getTaxBracketMessage, getAuditRiskLevel,
 *   calculateFinalTaxes, openFinalDetailSheet, exitToSetup,
 *   restorePlayerNamesAndSetup already existed.
 * - Replaced originals with user-provided definitions (mostly identical).
 * - Kept QuickPad auto-close behavior when opening final detail sheet,
 *   and retained escapeHtml, popup, tooltip, donation logic.
 *
 * UPDATED (2025-11-21 POOF ANIMATION):
 * - Added visual "poof" of in-progress normal card streak blocks when
 *   Charity is selected and an active (partial) streak exists.
 *
 * UPDATED (2025-11-21 CLEAR DEBTS DIALOG TEXT REVISIONS):
 * - Clear Debts dialog button texts revised per user instructions.
 *
 * UPDATED (2025-11-21 QUICKPAD CLEAR BUTTON RENAME):
 * - QuickPad footer "Clear All" renamed to "Clear Debts".
 *
 * UPDATED (2025-11-21 CATEGORY THUMB CLEAR):
 * - Clicking category thumbnail toggles an X button overlay.
 * - X button clears that specific category debt (both directions).
 *
 * UPDATED (2025-11-21 HIDE X ON OUTSIDE CLICK):
 * - If user clicks anywhere outside a thumbnail (or its clear button),
 *   any visible X overlay is hidden.
 *
 * UPDATED (2025-11-21 CONDITIONAL CLEAR DEBTS BUTTON ENABLE):
 * - "Clear Debts" footer button in QuickPad is now disabled (greyed out)
 *   when there is NO debt (both directions zero) between the active player
 *   and the opponent column currently in focus (centered column).
 *   It becomes enabled only when at least one category has a non-zero debt.
 *
 * UPDATED (2025-11-21 THUMBNAIL CLICK ZERO-DEBT GUARD):
 * - If a category thumbnail is clicked and that category has zero net debt
 *   between the players, do NOT show the X overlay.
 *
 * UPDATED (2025-11-21 SCROLL ARROW INTRO):
 * - Added a translucent pulsing arrow indicating horizontal scroll hint
 *   for QuickPad when >2 players.
 *
 * UPDATED (2025-11-21 ARROWHEAD REVISION):
 * - Scroll hint changed to standalone thicker arrowhead (no circle, no tail).
 *
 * UPDATED (2025-11-21 ARROW SYMBOL REPLACEMENT):
 * - Scroll hint arrow uses ❯ character.
 *
 * UPDATED (2025-11-21 ARROW POSITION MOVE):
 * - Scroll hint arrow moved to the right side middle of the player column header box.
 *
 * UPDATED (2025-11-22 QUICKPAD HEADER DEBT BAR):
 * - QuickPad header debt bar now matches active player card visual intensity
 *   (non-dim) while remaining non-interactive (full width override).
 *
 * UPDATED (2025-11-22 POWER CARDS GROUP):
 * - Added hidden "Power Cards" group in QuickPad.
 * - Toggle button "Show/Hide Power Cards" added to column header.
 * - Toggling affects all opponent columns globally.
 * - Column height adjusts automatically.
 *
 * FIX (2025-11-22):
 * - Fixed syntax error in variable name `maxPropsAmong`.
 *
 * UPDATED (2025-11-22 REORDER POWER CARDS):
 * - Moved "Show/Hide Power Cards" button out of header to top of list.
 * - Reordered categories: Power Cards group now appears ABOVE Haggie when shown.
 *
 * UPDATED (2025-11-22 QUICKPAD HEADER SUBTITLE):
 * - Removed player name from title "Record Debts".
 * - Added subtitle line below title: "PlayerName ⇔ OpponentName".
 * - Opponent name updates dynamically based on focused column.
 ************************************************************/

const PLAYER_NAME_MAX = 10;
const MAX_PLAYERS = 7;
const MAX_TOTAL_COINS = 100;

let players = [];
let currentPlayerIndex = 0;

let timerInterval = null;
let timeLeft = 60;
let timerRunningState = true;

let disallowedNormalCards = [];
let lastPlayerNames = [];

let suppressScrollSelect = false;

let normalDonated = 0;
let powerDonated = 0;
let tempProgress = 0;
let tookCharityThisTurn = false;

/* Scroll Arrow Session State */
let quickPadArrowDismissed = false;

/* Debt Data */
// Original definition maintained for reference, but reordered in buildQuickPadContent
const debtCategoriesOriginal = [
  "Haggie","Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles",
  "Mav","Clauseby","Buckley","Bugsy","Wiggy","Squeak","Beebo","Wally","Tillie","Moozy"
];

const powerCardCategories = [
  "Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles"
];

/* 
   Reordered list logic:
   1. Power Cards
   2. Haggie (Money)
   3. Normal Cards
*/
function getReorderedCategories() {
  const others = debtCategoriesOriginal.filter(c => !powerCardCategories.includes(c) && c !== "Haggie");
  // Power Cards first, then Haggie, then others
  return [...powerCardCategories, "Haggie", ...others];
}

const debtCategories = getReorderedCategories(); // Use this for all logic now

const debtCategoryGroups = {
  "Money": ["Haggie"],
  "Power Cards": ["Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles"],
  "Normal Cards": ["Mav","Clauseby","Buckley","Bugsy","Wiggy","Squeak","Beebo","Wally","Tillie","Moozy"]
};
let debtGroupCollapsed = {};
Object.keys(debtCategoryGroups).forEach(g => debtGroupCollapsed[g] = false);

let debts = [];
let totalAssetsForResults = 0;
let showPowerCardsGroup = false;

function ensureSheetElements(){
  if(!document.getElementById('debtSheetOverlay')){
    const d=document.createElement('div');
    d.id='debtSheetOverlay';
    d.innerHTML='<div class="debt-sheet" id="debtSheet"></div>';
    document.body.appendChild(d);
  }
  if(!document.getElementById('finalDetailSheetOverlay')){
    const f=document.createElement('div');
    f.id='finalDetailSheetOverlay';
    f.className='dimOverlay';
    f.innerHTML='<div class="final-detail-sheet" id="finalDetailSheet"></div>';
    document.body.appendChild(f);
  }
  if(!document.getElementById('quickPadOverlay')){
    const q=document.createElement('div');
    q.id='quickPadOverlay';
    q.innerHTML='<div class="quick-pad" id="quickPad"></div>';
    document.body.appendChild(q);
  }
}
ensureSheetElements();

/* ---------- Utility ---------- */
function getImageName(name){
  return `Characters/${name.toLowerCase().replace(/&/g,"-").replace(/ /g,"-")}.png`;
}
function sumYouOwe(a,b){ return debtCategories.reduce((s,c)=>s+(debts[a][b][c]||0),0); }
function sumTheyOwe(a,b){ return debtCategories.reduce((s,c)=>s+(debts[b][a][c]||0),0); }
function aggregateTotals(idx){
  let owe=0, collect=0;
  for(let i=0;i<players.length;i++){
    if(i===idx) continue;
    owe += sumYouOwe(idx,i);
    collect += sumTheyOwe(idx,i);
  }
  return { owe, collect, net: collect - owe };
}

/* ---- Debt helpers ---- */
function normalizeCategory(a,b,cat){
  const you=debts[a][b][cat]||0;
  const they=debts[b][a][cat]||0;
  if(you>0 && they>0){
    if(you===they){ debts[a][b][cat]=0; debts[b][a][cat]=0; }
    else if(you>they){ debts[a][b][cat]=you-they; debts[b][a][cat]=0; }
    else { debts[b][a][cat]=they-you; debts[a][b][cat]=0; }
  }
}
function normalizePair(a,b){ debtCategories.forEach(cat=>normalizeCategory(a,b,cat)); }
function clearAllDebtsBetween(a,b){
  debtCategories.forEach(cat=>{
    debts[a][b][cat]=0; debts[b][a][cat]=0;
  });
}
function clearDirectional(a,b,direction){
  debtCategories.forEach(cat=>{
    if(direction==='a-b') debts[a][b][cat]=0;
    else debts[b][a][cat]=0;
  });
}
function clearSingleCategory(a,b,cat){
  debts[a][b][cat]=0;
  debts[b][a][cat]=0;
}

/* Net helpers */
function getNetDebtValue(a,b,cat){
  const youOwe = debts[a][b][cat]||0;
  const theyOwe = debts[b][a][cat]||0;
  if(youOwe>0) return -youOwe;
  if(theyOwe>0) return theyOwe;
  return 0;
}
function setNetDebtValue(a,b,cat,val){
  if(val===0){
    debts[a][b][cat]=0; debts[b][a][cat]=0;
  } else if(val>0){
    debts[b][a][cat]=val; debts[a][b][cat]=0;
  } else {
    debts[a][b][cat]=-val; debts[b][a][cat]=0;
  }
}

/* ---------- Donation visuals ---------- */
function resetDonationState(){
  normalDonated=0;
  powerDonated=0;
  tookCharityThisTurn=false;
  tempProgress = players[currentPlayerIndex] ? players[currentPlayerIndex].progress : 0;
}
function computeDonationVisuals(){
  const p=players[currentPlayerIndex] || { progress:0, streaks:0, powerCards:0 };
  const prev=tempProgress, donated=normalDonated;
  const total=prev+donated;
  const remainder=total%5;
  const blocksToShow=(remainder===0 && total>0)?5:remainder;

  let prevLeft=0;
  if(total>0){
    const prevUsed=Math.min(prev,total-blocksToShow);
    prevLeft=prev-prevUsed;
    if(prevLeft<0) prevLeft=0;
    if(blocksToShow<prevLeft) prevLeft=blocksToShow;
  }
  const gold=prevLeft, gray=Math.max(0,blocksToShow-gold);
  let blocks='';
  for(let i=0;i<5;i++){
    if(i<gold) blocks+='<div class="donate-block progress-prev"></div>';
    else if(i<gold+gray) blocks+='<div class="donate-block progress-new" style="background:#d9d9d9;box-shadow:inset 0 0 0 2px #aaa;"></div>';
    else blocks+='<div class="donate-block-empty"></div>';
  }
  const streaksThisTurn=Math.floor((prev+donated)/5);
  const breaksPreview=(p.streaks||0)+(p.powerCards||0)+powerDonated+streaksThisTurn;
  return { blocks, breaksPreview };
}

/* ---------- Tax breaks badge ---------- */
function buildTaxBreaksBadge(value, interactive=false){
  const interactiveAttrs = interactive
    ? `data-interactive="1" tabindex="0" role="button" aria-haspopup="dialog" aria-expanded="false"`
    : '';
  return `
    <div class="tax-breaks-badge inline${interactive?' has-tooltip':''}" id="taxBreaksBadge" ${interactiveAttrs} aria-label="Tax Breaks Earned">
      <svg viewBox="0 0 100 100" class="tb-svg" role="img" focusable="false">
        <defs><path id="tbCirclePath" d="M50,10 a40,40 0 1,1 -0.01,0" /></defs>
        <text class="tb-text">
          <textPath href="#tbCirclePath" startOffset="50%" textLength="251" lengthAdjust="spacingAndGlyphs">
            TAX BREAKS EARNED TAX BREAKS EARNED
          </textPath>
        </text>
      </svg>
      <div class="tb-value" id="taxBreaksValue">${value}</div>
      ${ interactive ? `<div class="tb-tooltip" role="tooltip" id="taxBreaksTooltip" aria-hidden="true">
               Total Tax Breaks Earned.<br>
               This lowers your taxes owed at the end of the game.
             </div>` : '' }
    </div>`;
}

/* ---------- Debt Summary Bars ---------- */
function buildDebtSummaryBar(idx=currentPlayerIndex, { interactive=true, idOverride=null } = {}){
  const { owe, collect } = aggregateTotals(idx);
  const labelOwe = `Owe: ${owe}`;
  const labelCollect = `Collect: ${collect}`;
  const idAttr = idOverride ? ` id="${idOverride}"` : (interactive ? ' id="debtSummaryBar"' : '');
  if(interactive){
    return `
      <div class="debt-summary-bar debt-trade-bar"${idAttr} role="button" tabindex="0" aria-label="Adjust outstanding debts this turn">
        <div class="trade-seg seg-owe"><span class="ds-owe">${labelOwe}</span></div>
        <div class="trade-seg seg-collect"><span class="ds-collect">${labelCollect}</span></div>
      </div>`;
  } else {
    return `
      <div class="debt-summary-bar debt-trade-bar passive"${idAttr} aria-label="Outstanding debts summary (view only)">
        <div class="trade-seg seg-owe"><span class="ds-owe">${labelOwe}</span></div>
        <div class="trade-seg seg-collect"><span class="ds-collect">${labelCollect}</span></div>
      </div>`;
  }
}

/* ---------- Player card sections ---------- */
function buildInactiveNormalProgress(p){
  const remainder = p.progress || 0;
  let blocks='';
  for(let i=0;i<5;i++){
    blocks += i<remainder ? '<div class="donate-block"></div>' : '<div class="donate-block-empty"></div>';
  }
  return `<div class="normal-cards-container inactive-progress">${blocks}</div>`;
}
function buildInactiveCardSection(p, index){
  const breaksTotal = (p.streaks||0) + (p.powerCards||0);
  const debtBar = buildDebtSummaryBar(index,{interactive:false});
  return `
    <div class="donation-section inactive">
      <div class="turn-header">
        ${buildTaxBreaksBadge(breaksTotal,false)}
        <h3 class="turn-player-name">${escapeHtml(p.name)}</h3>
        <div class="turn-player-timer placeholder">00</div>
      </div>
      ${debtBar}
      <div class="inactive-progress-label">Normal Cards Progress</div>
      <div class="donate-row static-row">
        ${buildInactiveNormalProgress(p)}
      </div>
    </div>
  `;
}
function buildActiveCardSection(p){
  const { blocks, breaksPreview } = computeDonationVisuals();
  return `
    <div class="donation-section">
      <div class="turn-header">
        ${buildTaxBreaksBadge(breaksPreview,true)}
        <h3 class="turn-player-name">${escapeHtml(p.name)}</h3>
        <div class="turn-player-timer" id="playerTimer">${timeLeft}</div>
      </div>
      ${buildDebtSummaryBar(currentPlayerIndex,{interactive:true})}
      <div class="donate-label-inline">
        Normal Cards Donated
        <span class="info-icon has-tooltip" id="normalCardsInfo"
              data-interactive="1" tabindex="0" role="button"
              aria-haspopup="dialog" aria-expanded="false"
              aria-label="Normal Cards Donation Info">
          ⓘ
          <div class="tb-tooltip" role="tooltip" aria-hidden="true">
            Each streak (5 cards) = 1 Tax Break
          </div>
        </span>
      </div>
      <div class="donate-row buttons-row">
        <button type="button" id="minusNormal" class="btn-round alt" aria-label="Decrease normal donations">-</button>
        <div class="normal-cards-container" id="normalCardsContainer">${blocks}</div>
        <button type="button" id="plusNormal" class="btn-round" aria-label="Increase normal donations">+</button>
      </div>
      <div class="donate-label-inline" style="margin-top:0;">Power Cards or Haggies Donated</div>
      <div class="donate-row buttons-row" style="margin-bottom:0.4rem;">
        <button type="button" id="minusPower" class="btn-round alt" aria-label="Decrease power donations">-</button>
        <div class="power-circle-container">
          <div class="power-circle${powerDonated===0?' zero':''}" id="powerCircle">${powerDonated}</div>
        </div>
        <button type="button" id="plusPower" class="btn-round" aria-label="Increase power donations">+</button>
      </div>
      <div class="donation-actions" id="donationActionButtons" style="display:flex;justify-content:center;margin-top:.2rem;">
        <button type="button" id="tookCharityBtn" class="donation-btn" data-variant="primary" aria-pressed="false">Took from Charity</button>
      </div>
    </div>`;
}

/* ---------- Commit current player's donations ---------- */
function commitActivePlayerTurn(){
  const i=currentPlayerIndex;
  const p=players[i];
  if(!p) return;

  if(tookCharityThisTurn){
    if(p.progress>0) disallowedNormalCards[i]+=p.progress;
    p.progress=0;
  } else {
    const total=(p.progress||0)+normalDonated;
    const streaks=Math.floor(total/5);
    p.streaks=(p.streaks||0)+streaks;
    p.progress=total%5;
    p.powerCards=(p.powerCards||0)+powerDonated;
  }

  normalDonated=0;
  powerDonated=0;
  tookCharityThisTurn=false;
  tempProgress=p.progress;
  closeQuickPad();
}

/* ---------- Layout / Scroll ---------- */
function lockElementBox(el){
  if(!el || el.dataset.lockedSize) return;
  const w=el.offsetWidth, h=el.offsetHeight;
  el.style.boxSizing='border-box';
  el.style.width=w+'px';
  el.style.height=h+'px';
  el.dataset.lockedSize='1';
}
function setPlayerRowEdgePadding(){
  const row=document.getElementById('playerCardsRow');
  if(!row) return;
  const first=row.querySelector('.player-card'); if(!first) return;
  const pad=Math.max(16,(row.clientWidth/2)-(first.offsetWidth/2));
  row.style.paddingLeft=pad+'px';
  row.style.paddingRight=pad+'px';
}
function scrollToActiveCard(instant=false){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow');
    const active=row?row.querySelector('.player-card.active'):null;
    if(active && row){
      const rr=row.getBoundingClientRect(), ar=active.getBoundingClientRect();
      const left=row.scrollLeft + (ar.left+ar.width/2)-(rr.left+rr.width/2);
      if(instant){
        const prev=row.style.scrollBehavior;
        row.style.scrollBehavior='auto';
        row.scrollTo({left});
        requestAnimationFrame(()=>row.style.scrollBehavior=prev);
      } else row.scrollTo({left,behavior:'smooth'});
    }
  },0);
}

/* ---------- Switching active card ---------- */
function applyActiveToCard(cardElem, playerIndex){
  currentPlayerIndex = playerIndex;
  resetDonationState();
  cardElem.classList.add('active');
  const inner=cardElem.querySelector('.player-card-inner');
  if(inner) inner.innerHTML = buildActiveCardSection(players[playerIndex]);
  bindTimerClick();
  attachDebtBarHandler();
  bindDonationControls();
  initInteractiveTooltips();
  updateDonationButtonsState();
  refreshOverviewOnly();
  resetDonationTimer();
  lockElementBox(cardElem.querySelector('#tookCharityBtn'));
}
function applyInactiveToCard(cardElem, playerIndex){
  cardElem.classList.remove('active');
  const inner=cardElem.querySelector('.player-card-inner');
  if(inner) inner.innerHTML = buildInactiveCardSection(players[playerIndex], playerIndex);
}
function switchToIndex(nextIndex, center=false){
  if(nextIndex===currentPlayerIndex) return;
  commitActivePlayerTurn();
  const row=document.getElementById('playerCardsRow');
  if(!row) return;
  const cards=[...row.querySelectorAll('.player-card')];
  const oldCard=cards[currentPlayerIndex];
  const newCard=cards[nextIndex];
  if(oldCard) applyInactiveToCard(oldCard,currentPlayerIndex);
  if(newCard) applyActiveToCard(newCard,nextIndex);
  if(center) scrollToActiveCard(false);
}

/* ---------- Donation controls ---------- */
function updateDonationButtonsState(){
  const activeCard=document.querySelector('.player-card.active')||document;
  const minusN=activeCard.querySelector('#minusNormal');
  const plusN =activeCard.querySelector('#plusNormal');
  const minusP=activeCard.querySelector('#minusPower');
  const plusP =activeCard.querySelector('#plusPower');
  const charity=activeCard.querySelector('#tookCharityBtn');

  const disabled=tookCharityThisTurn;
  if(minusN) minusN.disabled = disabled || normalDonated===0;
  if(plusN)  plusN.disabled  = disabled || (normalDonated+tempProgress)>=20;
  if(minusP) minusP.disabled = disabled || powerDonated===0;
  if(plusP) plusP.disabled  = disabled || powerDonated>=20;

  [minusN,plusN,minusP,plusP].forEach(el=>{
    if(!el) return;
    el.style.visibility = tookCharityThisTurn ? 'hidden':'visible';
  });

  if(charity){
    lockElementBox(charity);
    charity.setAttribute('aria-pressed', tookCharityThisTurn? 'true':'false');
    charity.classList.toggle('danger', tookCharityThisTurn);
    charity.textContent='Took from Charity';

    const hasDonationEntry = (normalDonated > 0) || (powerDonated > 0);
    charity.style.visibility = hasDonationEntry ? 'hidden' : 'visible';
    charity.style.pointerEvents = hasDonationEntry ? 'none' : 'auto';
    charity.setAttribute('aria-hidden', hasDonationEntry ? 'true' : 'false');
  }
}
function bindDonationControls(){
  const activeCard=document.querySelector('.player-card.active')||document;
  const minusN=activeCard.querySelector('#minusNormal');
  const plusN =activeCard.querySelector('#plusNormal');
  const minusP=activeCard.querySelector('#minusPower');
  const plusP =activeCard.querySelector('#plusPower');
  const charity=activeCard.querySelector('#tookCharityBtn');

  if(minusN) minusN.onclick=()=>{ if(!minusN.disabled && normalDonated>0){ normalDonated--; updateDonationDynamic(); } };
  if(plusN)  plusN.onclick =()=>{ if(!plusN.disabled && (normalDonated+tempProgress)<20){ normalDonated++; updateDonationDynamic(); } };
  if(minusP) minusP.onclick=()=>{ if(!minusP.disabled && powerDonated>0){ powerDonated--; updateDonationDynamic(); } };
  if(plusP) plusP.onclick =()=>{ if(!plusP.disabled && powerDonated<20){ powerDonated++; updateDonationDynamic(); } };

  if(charity) charity.onclick=()=>{
    const wasCharity = tookCharityThisTurn;
    tookCharityThisTurn=!tookCharityThisTurn;

    if(!wasCharity && tookCharityThisTurn && tempProgress > 0){
      const container = activeCard.querySelector('#normalCardsContainer');
      if(container){
        const prevBlocks = container.querySelectorAll('.progress-prev');
        prevBlocks.forEach(b=>b.classList.add('poof-out'));
        setTimeout(()=>{
          if(tookCharityThisTurn){
            container.innerHTML = '<div class="donate-block-empty"></div>'.repeat(5);
          }
        },460);
      }
    } else if(wasCharity && !tookCharityThisTurn){
      updateDonationDynamic();
    }

    updateDonationButtonsState();
  };
}
function updateDonationDynamic(){
  const activeCard=document.querySelector('.player-card.active')||document;
  const { blocks, breaksPreview } = computeDonationVisuals();
  const blocksContainer=activeCard.querySelector('#normalCardsContainer');
  if(blocksContainer && !tookCharityThisTurn){
    blocksContainer.innerHTML=blocks;
  } else if(blocksContainer && tookCharityThisTurn){
    blocksContainer.innerHTML='<div class="donate-block-empty"></div>'.repeat(5);
  }
  const powerCircle=activeCard.querySelector('#powerCircle');
  if(powerCircle){
    powerCircle.textContent=powerDonated;
    powerCircle.classList.toggle('zero', powerDonated===0);
  }
  const badgeVal=activeCard.querySelector('#taxBreaksValue');
  const badge=activeCard.querySelector('#taxBreaksBadge');
  if(badgeVal){
    const cur=parseInt(badgeVal.textContent||'0',10);
    if(badge && breaksPreview>cur && !tookCharityThisTurn){
      badge.classList.remove('earned'); void badge.offsetWidth; badge.classList.add('earned');
      setTimeout(()=>badge && badge.classList.remove('earned'),800);
    }
    badgeVal.textContent= tookCharityThisTurn ? ((players[currentPlayerIndex].streaks||0)+(players[currentPlayerIndex].powerCards||0)+powerDonated) : breaksPreview;
  }
  updateDonationButtonsState();
  refreshOverviewOnly();
}

/* ---------- Tooltip System ---------- */
function positionTooltip(trigger, tooltip){
  if(!trigger || !tooltip) return;
  tooltip.classList.remove('flip');
  tooltip.style.left='50%';
  tooltip.style.top='100%';
  tooltip.style.bottom='auto';
  tooltip.style.transform='translate(-50%,4px)';

  requestAnimationFrame(()=>{
    const margin=8;
    const tRect=trigger.getBoundingClientRect();
    const ttRect=tooltip.getBoundingClientRect();
    let shift=0;
    if(ttRect.left < margin) shift = margin - ttRect.left;
    else if(ttRect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - ttRect.right;

    const spaceBelow = window.innerHeight - tRect.bottom;
    const needed = ttRect.height + 18;
    let flipped=false;
    if(spaceBelow < needed){
      tooltip.classList.add('flip');
      tooltip.style.top='auto';
      tooltip.style.bottom='100%';
      flipped=true;
    }
    const ttRect2=tooltip.getBoundingClientRect();
    if(flipped && ttRect2.top < margin){
      tooltip.classList.remove('flip');
      tooltip.style.top='100%';
      tooltip.style.bottom='auto';
    }
    const translateBase = tooltip.classList.contains('flip') ? 'translate(-50%,-10px)' : 'translate(-50%,4px)';
    tooltip.style.transform = shift!==0 ? translateBase.replace('-50%', `calc(-50% + ${shift}px)`) : translateBase;
  });
}

function initInteractiveTooltips(){
  document.querySelectorAll('.tb-open').forEach(el=>{
    el.classList.remove('tb-open');
    el.setAttribute('aria-expanded','false');
    const tt=el.querySelector('.tb-tooltip');
    if(tt) tt.setAttribute('aria-hidden','true');
  });

  const activeScope = document.querySelector('.player-card.active');
  if(!activeScope) return;
  const triggers = activeScope.querySelectorAll('[data-interactive="1"].has-tooltip');
  let openTrigger = null;

  function close(trigger){
    if(!trigger) return;
    trigger.classList.remove('tb-open');
    trigger.setAttribute('aria-expanded','false');
    const t=trigger.querySelector('.tb-tooltip');
    if(t) t.setAttribute('aria-hidden','true');
    if(openTrigger===trigger) openTrigger=null;
  }
  function open(trigger){
    if(openTrigger && openTrigger!==trigger) close(openTrigger);
    const t=trigger.querySelector('.tb-tooltip');
    if(!t) return;
    trigger.classList.add('tb-open');
    trigger.setAttribute('aria-expanded','true');
    t.setAttribute('aria-hidden','false');
    positionTooltip(trigger,t);
    openTrigger=trigger;
  }
  function toggle(trigger){
    if(trigger.classList.contains('tb-open')) close(trigger); else open(trigger);
  }

  triggers.forEach(tr=>{
    tr.addEventListener('click', e=>{
      e.stopPropagation();
      toggle(tr);
    });
    tr.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' '){
        e.preventDefault(); toggle(tr);
      } else if(e.key==='Escape'){
        close(tr);
      }
    });
  });

  document.addEventListener('click', e=>{
    if(openTrigger && !openTrigger.contains(e.target)) close(openTrigger);
  }, { capture:true });

  document.addEventListener('keydown', e=>{
    if(e.key==='Escape' && openTrigger) close(openTrigger);
  });

  window.addEventListener('resize', ()=>{
    if(openTrigger){
      const t=openTrigger.querySelector('.tb-tooltip');
      if(t) positionTooltip(openTrigger,t);
    }
  }, { passive:true });
}

/* ---------- Render cards ---------- */
function showPlayerCards(){
  ensureSheetElements();
  resetDonationState();
  let html='';
  for(let i=0;i<players.length;i++){
    const p=players[i];
    const section = i===currentPlayerIndex ? buildActiveCardSection(p) : buildInactiveCardSection(p,i);
    html+=`
      <div class="player-card${i===currentPlayerIndex?' active':''}" data-index="${i}">
        <div class="player-card-inner">${section}</div>
      </div>`;
  }
  const mc=document.getElementById('mainGameContainer');
  if(mc){
    mc.innerHTML=`
      <div class="player-cards-scroll-container">
        <div class="player-cards-row" id="playerCardsRow">${html}</div>
      </div>
      <div style="text-align:center;margin:1.2rem auto 0;">
        <button type="button" id="endgameTaxesBtn" class="styled-btn" onclick="showEndgame()">Endgame Taxes</button>
      </div>`;
  }
  setPlayerRowEdgePadding();
  scrollToActiveCard(true);
  setupCardScrollSync();
  setupPlayerCardClicks();
  bindTimerClick();
  attachDebtBarHandler();
  bindDonationControls();
  initInteractiveTooltips();
  updateDonationButtonsState();
  refreshOverviewOnly();
  resetDonationTimer();
  lockElementBox(document.querySelector('.player-card.active #tookCharityBtn'));
}

/* ---------- Scroll & click selection ---------- */
function setupPlayerCardClicks(){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow'); if(!row) return;
    [...row.querySelectorAll('.player-card')].forEach((card,i)=>{
      card.onclick=()=>{
        if(i===currentPlayerIndex) return;
        suppressScrollSelect=true;
        switchToIndex(i,true);
        setTimeout(()=>suppressScrollSelect=false,250);
      };
    });
  },0);
}
function setupCardScrollSync(){
  let raf=null;
  const detect=()=>{
    const row=document.getElementById('playerCardsRow'); if(!row) return;
    if(suppressScrollSelect) return;
    const cards=[...row.querySelectorAll('.player-card')];
    if(!cards.length) return;
    const rr=row.getBoundingClientRect();
    const center=rr.left+rr.width/2;
    let min=Infinity, idx=currentPlayerIndex;
    cards.forEach((c,i)=>{
      const r=c.getBoundingClientRect();
      const d=Math.abs(center-(r.left+r.width/2));
      if(d<min){ min=d; idx=i; }
    });
    if(idx!==currentPlayerIndex) switchToIndex(idx,false);
  };
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow'); if(!row) return;
    row.addEventListener('scroll',()=>{
      if(raf) cancelAnimationFrame(raf);
      raf=requestAnimationFrame(detect);
    },{passive:true});
  },0);
}

/* ---------- Debt summary refresh ---------- */
function refreshOverviewOnly(){
  const bar=document.getElementById('debtSummaryBar');
  if(bar){
    const { owe, collect } = aggregateTotals(currentPlayerIndex);
    const oweSpan=bar.querySelector('.ds-owe');
    const collectSpan=bar.querySelector('.ds-collect');
    if(oweSpan) oweSpan.textContent=`Owe: ${owe}`;
    if(collectSpan) collectSpan.textContent=`Collect: ${collect}`;
  }

  document.querySelectorAll('.player-card').forEach(card=>{
    const idx = parseInt(card.dataset.index,10);
    if(isNaN(idx) || idx === currentPlayerIndex) return;
    const passiveBar = card.querySelector('.debt-summary-bar.passive');
    if(passiveBar){
      const { owe, collect } = aggregateTotals(idx);
      const oweSpan = passiveBar.querySelector('.ds-owe');
      const collectSpan = passiveBar.querySelector('.ds-collect');
      if(oweSpan) oweSpan.textContent=`Owe: ${owe}`;
      if(collectSpan) collectSpan.textContent=`Collect: ${collect}`;
    }
  });

  updateQuickPadTotals();
}

/* ---------- QuickPad ---------- */
let quickPadOpen=false;

function attachDebtBarHandler(){
  const bar=document.getElementById('debtSummaryBar');
  if(!bar) return;
  const openPad = ()=>{
    if(players.length<2) return;
    openQuickPad();
  };
  bar.onclick=(e)=>{ e.preventDefault(); openPad(); };
  bar.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openPad(); } };
}

function openQuickPad(){
  if(quickPadOpen) return;
  ensureSheetElements();
  buildQuickPadContent();
  const overlay=document.getElementById('quickPadOverlay');
  const pad=document.getElementById('quickPad');
  overlay.style.display='flex';
  document.body.classList.add('modal-open');
  requestAnimationFrame(()=>pad.classList.add('open'));
  quickPadOpen=true;
  maybeAddScrollHintArrow();
  bindQuickPadEvents();
  bindTimerClick();
  updateTimerDisplays();
  updateQuickPadTotals();
  updateClearDebtsButtonState();
  updateQuickPadSubtitle(); // Initial update
}

function closeQuickPad(){
  if(!quickPadOpen) return;
  const overlay=document.getElementById('quickPadOverlay');
  const pad=document.getElementById('quickPad');
  pad.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(()=>{
    overlay.style.display='none';
    pad.innerHTML='';
    quickPadOpen=false;
  },380);
}

function togglePowerCardsGroup(){
  showPowerCardsGroup = !showPowerCardsGroup;
  const pad = document.getElementById('quickPad');
  if(!pad) return;
  
  // Toggle visibility of all power card rows
  const powerRows = pad.querySelectorAll('.qp-cat-row.is-power-card');
  powerRows.forEach(row => {
    row.style.display = showPowerCardsGroup ? 'grid' : 'none';
  });

  // Update all toggle buttons text
  const buttons = pad.querySelectorAll('.qp-toggle-btn');
  buttons.forEach(btn => {
    btn.textContent = showPowerCardsGroup ? "Hide Power Cards" : "Show Power Cards";
  });
}
if(typeof window!=='undefined') window.togglePowerCardsGroup=togglePowerCardsGroup;

function buildQuickPadContent(){
  const pad=document.getElementById('quickPad');
  if(!pad) return;
  const activeIdx=currentPlayerIndex;

  let columnsHtml='';
  for(let i=0;i<players.length;i++){
    if(i===activeIdx) continue;
    normalizePair(activeIdx,i);
    const owe = sumYouOwe(activeIdx,i);
    const collect = sumTheyOwe(activeIdx,i);

    let catRows='';
    debtCategories.forEach(cat=>{
      normalizeCategory(activeIdx,i,cat);
      const net=getNetDebtValue(activeIdx,i,cat);
      const stateClass = net>0?'positive': net<0?'negative':'neutral';
      const displayVal = net===0?'—': (net>0?`+${net}`:`${net}`);
      
      const isPower = powerCardCategories.includes(cat);
      const powerClass = isPower ? ' is-power-card' : '';
      const displayStyle = (isPower && !showPowerCardsGroup) ? 'style="display:none;"' : '';

      catRows += `
        <div class="qp-cat-row ${stateClass}${powerClass}" ${displayStyle} data-opponent="${i}" data-cat="${cat}">
          <div class="qp-icon" data-opponent="${i}" data-cat="${escapeHtml(cat)}">
            <img src="${getImageName(cat)}" alt="${escapeHtml(cat)}">
            <button type="button" class="qp-clear-btn" aria-label="Clear debt for ${escapeHtml(cat)}" tabindex="-1">✕</button>
          </div>
          <div class="qp-name">${escapeHtml(cat)}</div>
          <div class="qp-value" data-value>${displayVal}</div>
          <div class="qp-actions">
            <button type="button" class="qp-btn qp-owe" data-action="owe" aria-label="Increase amount you owe for ${escapeHtml(cat)}" data-opponent="${i}" data-cat="${cat}">▼</button>
            <button type="button" class="qp-btn qp-collect" data-action="collect" aria-label="Increase amount they owe you for ${escapeHtml(cat)}" data-opponent="${i}" data-cat="${cat}">▲</button>
          </div>
        </div>`;
    });

    const btnText = showPowerCardsGroup ? "Hide Power Cards" : "Show Power Cards";

    columnsHtml += `
      <div class="qp-column" data-opponent="${i}">
        <div class="qp-column-header">
          <h4 class="qp-opponent-name">${escapeHtml(players[i].name)}</h4>
          <div class="qp-summary-line">
            <span class="owe">Owe: ${owe}</span> | <span class="collect">Collect: ${collect}</span>
          </div>
        </div>
        <div class="qp-category-list">
          <button class="qp-toggle-btn" onclick="togglePowerCardsGroup()">${btnText}</button>
          ${catRows}
        </div>
      </div>`;
  }

  const columnsClass = players.length === 2 ? 'quick-pad-columns single-opponent' : 'quick-pad-columns';
  const debtBarHeader = buildDebtSummaryBar(activeIdx,{interactive:false,idOverride:'quickPadDebtBar'});

  pad.innerHTML=`
    <div class="quick-pad-header">
      <div class="quick-pad-grip"></div>
      <h3 class="quick-pad-title">Record Debts</h3>
      <div class="quick-pad-subtitle" id="quickPadSubtitle"></div>
      <div class="quick-pad-timer" id="quickPadTimerDisplay" aria-label="Turn Timer (click to pause / resume)">${timeLeft}</div>
      ${debtBarHeader}
    </div>
    <div class="${columnsClass}" id="quickPadColumns">${columnsHtml}</div>
    <div class="quick-pad-footer">
      <button type="button" class="debt-footer-btn danger" id="quickPadClearBtn">Clear Debts</button>
      <button type="button" class="debt-footer-btn primary" id="quickPadDoneBtn">Done</button>
    </div>
  `;
}

/* Scroll hint arrow creation (moved inside first column header) */
function maybeAddScrollHintArrow(){
  if(players.length <= 2) return;
  if(quickPadArrowDismissed) return;
  if(document.getElementById('quickPadScrollArrow')) return;
  const header = document.querySelector('#quickPadColumns .qp-column-header');
  if(!header) return;
  const arrow=document.createElement('div');
  arrow.id='quickPadScrollArrow';
  arrow.className='quick-pad-scroll-arrow';
  arrow.setAttribute('aria-hidden','true');
  header.appendChild(arrow);
}

/* ---------- Debt existence helper ---------- */
function hasAnyDebtBetween(a,b){
  if(a==null || b==null) return false;
  for(const cat of debtCategories){
    if((debts[a][b][cat]||0)>0 || (debts[b][a][cat]||0)>0) return true;
  }
  return false;
}

/* ---------- Clear Debts footer button state ---------- */
function updateClearDebtsButtonState(){
  if(!quickPadOpen) return;
  const btn=document.getElementById('quickPadClearBtn');
  if(!btn) return;
  const opponentIndex=getFocusedQuickPadOpponent();
  if(opponentIndex==null){
    btn.disabled=true;
    return;
  }
  const active=currentPlayerIndex;
  btn.disabled = !hasAnyDebtBetween(active,opponentIndex);
}

/* ---------- Dynamic Subtitle Update ---------- */
function updateQuickPadSubtitle(){
  const sub = document.getElementById('quickPadSubtitle');
  if(!sub) return;
  const opponentIndex = getFocusedQuickPadOpponent();
  const activeName = players[currentPlayerIndex].name;
  const oppName = (opponentIndex !== null && players[opponentIndex]) ? players[opponentIndex].name : "...";
  sub.textContent = `${activeName} ❮ ❯ ${oppName}`;
}

function bindQuickPadEvents(){
  const pad=document.getElementById('quickPad');
  if(!pad) return;
  const overlay=document.getElementById('quickPadOverlay');

  pad.querySelector('#quickPadDoneBtn').onclick=()=>{
    closeQuickPad();
    refreshOverviewOnly();
  };
  pad.querySelector('#quickPadClearBtn').onclick=showClearDebtsDialog;

  overlay.addEventListener('click', e=>{
    if(e.target.id==='quickPadOverlay'){ closeQuickPad(); }
  });

  pad.addEventListener('click', handleQuickPadClick);
  window.addEventListener('keydown', quickPadKeyHandler);

  const columns=document.getElementById('quickPadColumns');
  if(columns){
    let scrollRAF=null;
    columns.addEventListener('scroll', ()=>{
      if(scrollRAF) cancelAnimationFrame(scrollRAF);
      scrollRAF=requestAnimationFrame(()=>{
        updateClearDebtsButtonState();
        updateQuickPadSubtitle();
        const arrow=document.getElementById('quickPadScrollArrow');
        if(arrow && !quickPadArrowDismissed && columns.scrollLeft>0){
            arrow.classList.add('hide');
            quickPadArrowDismissed=true;
            setTimeout(()=>arrow && arrow.remove(),600);
        }
      });
    }, { passive:true });
  }
}

let lastQuickPadOpponent=null;

/* ---------- QuickPad click handler ---------- */
function handleQuickPadClick(e){
  const pad=document.getElementById('quickPad');
  if(!pad) return;

  if(!e.target.closest('.qp-icon') && !e.target.closest('.qp-clear-btn')){
    pad.querySelectorAll('.qp-icon.show-clear').forEach(ic=>ic.classList.remove('show-clear'));
  }

  /* Clear button */
  const clearBtn=e.target.closest('.qp-clear-btn');
  if(clearBtn){
    const icon=clearBtn.closest('.qp-icon');
    if(icon){
      const opponentIndex=parseInt(icon.dataset.opponent,10);
      const catRaw=icon.dataset.cat;
      const rowRef=icon.closest('.qp-cat-row');
      const cat=rowRef? rowRef.dataset.cat : catRaw;
      if(!isNaN(opponentIndex) && cat){
        clearSingleCategory(currentPlayerIndex, opponentIndex, cat);
        updateQuickPadRow(opponentIndex, cat);
        updateQuickPadColumnSummary(opponentIndex);
        updateQuickPadTotals();
        refreshOverviewOnly();
        icon.classList.remove('show-clear');
        updateClearDebtsButtonState();
      }
    }
    return;
  }

  /* Thumbnail toggle */
  const thumb=e.target.closest('.qp-icon');
  if(thumb){
    const opponentIndex=parseInt(thumb.dataset.opponent,10);
    const catRaw=thumb.dataset.cat;
    const rowRef=thumb.closest('.qp-cat-row');
    const cat=rowRef? rowRef.dataset.cat : catRaw;
    if(!isNaN(opponentIndex) && cat){
      const net=getNetDebtValue(currentPlayerIndex,opponentIndex,cat);
      if(net===0){
        thumb.classList.remove('show-clear');
        updateClearDebtsButtonState();
        return;
      }
    }
    if(thumb.classList.contains('show-clear')){
      thumb.classList.remove('show-clear');
    } else {
      pad.querySelectorAll('.qp-icon.show-clear').forEach(ic=>ic.classList.remove('show-clear'));
      thumb.classList.add('show-clear');
    }
    updateClearDebtsButtonState();
    return;
  }

  /* Adjust buttons */
  const btn=e.target.closest('.qp-btn');
  if(!btn) {
    updateClearDebtsButtonState();
    return;
  }
  const opponentIndex=parseInt(btn.dataset.opponent,10);
  const cat=btn.dataset.cat;
  const action=btn.dataset.action;
  if(isNaN(opponentIndex) || !cat || !action) {
    updateClearDebtsButtonState();
    return;
  }

  lastQuickPadOpponent=opponentIndex;
  const a=currentPlayerIndex;
  const b=opponentIndex;
  let net=getNetDebtValue(a,b,cat);

  if(action==='owe') net--;
  else if(action==='collect') net++;

  setNetDebtValue(a,b,cat,net);
  normalizeCategory(a,b,cat);
  updateQuickPadRow(b,cat);
  updateQuickPadColumnSummary(b);
  updateQuickPadTotals();
  refreshOverviewOnly();
  updateClearDebtsButtonState();
}

function quickPadKeyHandler(e){
  if(!quickPadOpen) return;
  if(e.key==='Escape') closeQuickPad();
}

function updateQuickPadRow(opponentIndex, cat){
  const pad=document.getElementById('quickPad');
  if(!pad) return;
  const row=pad.querySelector(`.qp-cat-row[data-opponent="${opponentIndex}"][data-cat="${cat}"]`);
  if(!row) return;
  const valEl=row.querySelector('[data-value]');
  const net=getNetDebtValue(currentPlayerIndex,opponentIndex,cat);
  const prevRaw=(valEl.textContent||'0').replace(/[^\d-]/g,'');
  const prev = prevRaw==='' ? 0 : parseInt(prevRaw,10);
  const displayVal = net===0?'—': (net>0?`+${net}`:`${net}`);
  valEl.textContent=displayVal;
  row.classList.remove('positive','negative','neutral','pulse-green','pulse-red');
  if(net>0){
    row.classList.add('positive');
    if(net>prev) { row.classList.add('pulse-green'); setTimeout(()=>row.classList.remove('pulse-green'),700); }
  } else if(net<0){
    row.classList.add('negative');
    if(net<prev) { row.classList.add('pulse-red'); setTimeout(()=>row.classList.remove('pulse-red'),700); }
  } else {
    row.classList.add('neutral');
    const icon=row.querySelector('.qp-icon');
    if(icon) icon.classList.remove('show-clear');
  }
  updateClearDebtsButtonState();
}

function rebuildQuickPadColumn(opponentIndex){
  const pad=document.getElementById('quickPad');
  if(!pad) return;
  const col=pad.querySelector(`.qp-column[data-opponent="${opponentIndex}"]`);
  if(!col) return;
  normalizePair(currentPlayerIndex,opponentIndex);
  const owe=sumYouOwe(currentPlayerIndex,opponentIndex);
  const collect=sumTheyOwe(currentPlayerIndex,opponentIndex);
  const headerSummary=col.querySelector('.qp-summary-line');
  if(headerSummary){
    headerSummary.innerHTML=`<span class="owe">Owe: ${owe}</span> | <span class="collect">Collect: ${collect}</span>`;
  }
  
  // Update button text in header just in case re-render lost state (though we rebuild innerHTML partly)
  // Actually rebuildQuickPadColumn only updates rows and header summary usually?
  // In this code block, we are just updating specific parts. 
  // If we re-rendered the whole column HTML, we'd need to check showPowerCardsGroup.
  // Current implementation updates rows individually below.
  
  debtCategories.forEach(cat=>updateQuickPadRow(opponentIndex,cat));
  updateClearDebtsButtonState();
}

function updateQuickPadColumnSummary(opponentIndex){
  const pad=document.getElementById('quickPad');
  if(!pad) return;
  const col=pad.querySelector(`.qp-column[data-opponent="${opponentIndex}"]`);
  if(!col) return;
  const owe=sumYouOwe(currentPlayerIndex,opponentIndex);
  const collect=sumTheyOwe(currentPlayerIndex,opponentIndex);
  const headerSummary=col.querySelector('.qp-summary-line');
  if(headerSummary){
    headerSummary.innerHTML=`<span class="owe">Owe: ${owe}</span> | <span class="collect">Collect: ${collect}</span>`;
  }
  updateClearDebtsButtonState();
}
function updateQuickPadTotals(){
  if(!quickPadOpen) return;
  const bar=document.getElementById('quickPadDebtBar');
  if(!bar) return;
  const { owe, collect } = aggregateTotals(currentPlayerIndex);
  const oweSpan=bar.querySelector('.ds-owe');
  const collectSpan=bar.querySelector('.ds-collect');
  if(oweSpan) oweSpan.textContent=`Owe: ${owe}`;
  if(collectSpan) collectSpan.textContent=`Collect: ${collect}`;
  updateClearDebtsButtonState();
}

/* ---------- Clear Debts Dialog ---------- */
function getFocusedQuickPadOpponent(){
  const container=document.getElementById('quickPadColumns');
  if(!container) return null;
  const cols=[...container.querySelectorAll('.qp-column')];
  if(!cols.length) return null;
  const cr=container.getBoundingClientRect();
  const center=cr.left+cr.width/2;
  let best=null, min=Infinity;
  cols.forEach(col=>{
    const r=col.getBoundingClientRect();
    const c=r.left+r.width/2;
    const d=Math.abs(center-c);
    if(d<min){ min=d; best=col; }
  });
  if(!best) return null;
  return parseInt(best.dataset.opponent,10);
}
function showClearDebtsDialog(){
  const opponentIndex=getFocusedQuickPadOpponent();
  if(opponentIndex==null){
    customPopup("No opponent column detected.");
    return;
  }
  if(!hasAnyDebtBetween(currentPlayerIndex, opponentIndex)){
    return;
  }
  ensurePopupElements();
  const overlay=document.getElementById('customPopupOverlay');
  overlay.style.zIndex='2000';
  const msg=document.getElementById('customPopupMessage');
  const btnBox=document.getElementById('customPopupButtons');
  const activeName=players[currentPlayerIndex].name;
  const oppName=players[opponentIndex].name;
  msg.innerHTML=`
    <h2 class="lilita" style="color:var(--color-accent);margin:0 0 .6rem;">Clear Debts</h2>
  `;
  btnBox.innerHTML=`
    <button type="button" id="cddBothBtn"
      style="flex:1 1 100%;font-size:1.02rem;padding:0.7rem 1.2rem;border-radius:14px;
             background:var(--color-accent);color:#232323;border:2px solid var(--color-accent);
             box-shadow:var(--shadow-sm);font-family:var(--font-display);letter-spacing:.3px;cursor:pointer;">
      Between ${escapeHtml(activeName)} and ${escapeHtml(oppName)}
    </button>
    <button type="button" id="cddOppOwesBtn"
      style="flex:1 1 100%;font-size:1.02rem;padding:0.7rem 1.2rem;border-radius:14px;
             background:#1f5e30;color:#e9ffe9;border:2px solid #2f7d46;
             box-shadow:var(--shadow-sm);font-family:var(--font-display);letter-spacing:.3px;cursor:pointer;">
      ${escapeHtml(activeName)} collects from ${escapeHtml(oppName)}
    </button>
    <button type="button" id="cddYouOweBtn"
      style="flex:1 1 100%;font-size:1.02rem;padding:0.7rem 1.2rem;border-radius:14px;
             background:#5a2525;color:#f5dede;border:2px solid #862d2d;
             box-shadow:var(--shadow-sm);font-family:var(--font-display);letter-spacing:.3px;cursor:pointer;">
      ${escapeHtml(activeName)} owes ${escapeHtml(oppName)}
    </button>
    <button type="button" id="cddCancelBtn"
      style="flex:1 1 100%;font-size:1.02rem;padding:0.7rem 1.2rem;border-radius:14px;
             background:#313131;color:#f1f1f1;border:2px solid #3a3a3a;
             box-shadow:var(--shadow-sm);font-family:var(--font-display);letter-spacing:.3px;cursor:pointer;">
      Cancel
    </button>
  `;
  overlay.style.display='flex';
  document.getElementById('cddBothBtn').onclick=()=>{
    clearAllDebtsBetween(currentPlayerIndex,opponentIndex);
    rebuildQuickPadColumn(opponentIndex);
    refreshOverviewOnly(); updateQuickPadTotals();
    overlay.style.display='none';
  };
  document.getElementById('cddOppOwesBtn').onclick=()=>{
    clearDirectional(currentPlayerIndex,opponentIndex,'b-a');
    rebuildQuickPadColumn(opponentIndex);
    refreshOverviewOnly(); updateQuickPadTotals();
    overlay.style.display='none';
  };
  document.getElementById('cddYouOweBtn').onclick=()=>{
    clearDirectional(currentPlayerIndex,opponentIndex,'a-b');
    rebuildQuickPadColumn(opponentIndex);
    refreshOverviewOnly(); updateQuickPadTotals();
    overlay.style.display='none';
  };
  document.getElementById('cddCancelBtn').onclick=()=>{ overlay.style.display='none'; };
}

/* ---------- Timer ---------- */
function bindTimerClick(){
  setTimeout(()=>{
    const t=document.querySelector('.player-card.active #playerTimer');
    if(t) t.onclick=handleTimerClick;
    const quickPadTimer=document.getElementById('quickPadTimerDisplay');
    if(quickPadTimer) quickPadTimer.onclick=handleTimerClick;
    const sheetTimer=document.getElementById('debtSheetTimerDisplay');
    if(sheetTimer) sheetTimer.onclick=handleTimerClick;
  },0);
}
function handleTimerClick(){
  if(timeLeft===0){
    timeLeft=60; timerRunningState=true; startTimer();
  } else {
    timerRunningState=!timerRunningState;
    if(timerRunningState) startTimer(); else if(timerInterval) clearInterval(timerInterval);
  }
  updateTimerDisplays();
}
function startTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    if(timerRunningState && timeLeft>0){
      timeLeft--;
      updateTimerDisplays();
      if(timeLeft<=0) timerRunningState=false;
    }
  },1000);
}
function updateTimerDisplays(){
  const activeTimer=document.querySelector('.player-card.active #playerTimer');
  if(activeTimer) activeTimer.textContent=timeLeft;
  const quickPadTimer=document.getElementById('quickPadTimerDisplay');
  if(quickPadTimer) quickPadTimer.textContent=timeLeft;
  const sheetTimer=document.getElementById('debtSheetTimerDisplay');
  if(sheetTimer) sheetTimer.textContent=timeLeft;
}
function resetDonationTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timeLeft=60;
  timerRunningState=true;
  startTimer();
  updateTimerDisplays();
}
if(typeof window!=='undefined') window.resetDonationTimer=resetDonationTimer;

/* =========================================================
   Endgame & Outstanding Debts
   ========================================================= */
function showEndgame(){
  commitActivePlayerTurn();
  const data = collectOutstandingDebtors();
  if(data.debtors.length === 0){
    customPopup("Did the bank run out of money? Proceed to file taxes.",
      p => { if(p) loadEndgame(); }, false, "Yes", "No");
  } else {
    showOutstandingDebtsPopup(data);
  }
}

function collectOutstandingDebtors(){
  const map = new Map();
  for(let a=0; a<players.length; a++){
    for(let b=0; b<players.length; b++){
      if(a===b) continue;
      let total = 0;
      const cats = [];
      debtCategories.forEach(cat=>{
        const amt = debts[a][b][cat] || 0;
        if(amt > 0){
          total += amt;
          cats.push({ cat, amt });
        }
      });
      if(total > 0){
        if(!map.has(a)) map.set(a,{ debtorIndex:a, totalOwed:0, details:[] });
        const entry = map.get(a);
        entry.totalOwed += total;
        entry.details.push({ payeeIndex:b, total, categories:cats });
      }
    }
  }
  return { debtors: [...map.values()] };
}

function showOutstandingDebtsPopup(data){
  ensurePopupElements();
  const overlay = document.getElementById('customPopupOverlay');
  const msg     = document.getElementById('customPopupMessage');
  const btns    = document.getElementById('customPopupButtons');

  const instruction = `<p style="font-size:1rem; line-height:1.3; margin:0 0 .75rem;">Did the bank run out of money? Before filing taxes, settle these outstanding debts. Check all boxes to continue.</p>`;
  const blocks = data.debtors.map(d=>{
    const debtor = players[d.debtorIndex].name;
    const lines = d.details.map(det=>`<div style="margin-bottom:0.3rem;">→ Owes <span style="color:#d4af7f;">${escapeHtml(players[det.payeeIndex].name)}</span>: ${det.total}</div>`).join('');
    return `
      <div class="debtor-block" data-debtor="${d.debtorIndex}" tabindex="0" aria-pressed="false">
        <div class="debtor-header">
          <input type="checkbox" class="debtor-checkbox" aria-label="Confirm ${escapeHtml(debtor)} settled">
          <span>${escapeHtml(debtor)} (Total Owed: ${d.totalOwed})</span>
        </div>
        <div class="debtor-debts">${lines}</div>
        <div class="debtor-select-hint">Tap or check to confirm</div>
      </div>`;
  }).join('');

  msg.innerHTML = `
    <h2 class="lilita" style="color:var(--color-accent);margin:0 0 .55rem;">Outstanding Debts</h2>
    ${instruction}
    <div class="outstanding-wrapper">${blocks}</div>`;
  btns.innerHTML = `
    <button type="button" id="outstandingProceedBtn" class="styled-btn" disabled>Proceed to Filing</button>
    <button type="button" id="outstandingCancelBtn" class="btn-neutral styled-btn">Cancel</button>`;
  overlay.style.display='flex';

  const proceed = document.getElementById('outstandingProceedBtn');
  const cancel  = document.getElementById('outstandingCancelBtn');
  const debtorBlocks = [...msg.querySelectorAll('.debtor-block')];

  function updateProceed(){
    proceed.disabled = !debtorBlocks.every(el => el.querySelector('.debtor-checkbox')?.checked);
  }
  function toggle(el){
    const cb = el.querySelector('.debtor-checkbox');
    cb.checked = !cb.checked;
    el.classList.toggle('selected', cb.checked);
    el.setAttribute('aria-pressed', cb.checked ? 'true':'false');
    updateProceed();
  }

  debtorBlocks.forEach(el=>{
    const cb=el.querySelector('.debtor-checkbox');
    el.addEventListener('click', e=>{
      if(e.target === cb){
        el.classList.toggle('selected', cb.checked);
      } else {
        toggle(el);
      }
      updateProceed();
    });
    el.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' '){
        e.preventDefault();
        toggle(el);
      }
    });
  });

  updateProceed();
  proceed.onclick = ()=>{ overlay.style.display='none'; loadEndgame(); };
  cancel.onclick  = ()=>{ overlay.style.display='none'; };
}

/* ---------- Endgame Input Cap Helpers ---------- */
function getPropertyCap(){
  return (players.length + 1) + players.length;
}

let coinsClampTimers = [];
let propsClampTimers = [];
const CLAMP_DELAY = 800;

function clampCoins(index){
  const changed = document.getElementById(`coins_${index}`);
  if(!changed) return;
  let raw = changed.value.trim();
  if(raw===''){ return; }
  let val = parseInt(raw,10);
  if(isNaN(val) || val<0) val=0;

  let sumOthers=0;
  for(let i=0;i<players.length;i++){
    if(i===index) continue;
    const el=document.getElementById(`coins_${i}`);
    if(!el) continue;
    let v=parseInt(el.value,10);
    if(isNaN(v)||v<0) v=0;
    sumOthers+=v;
  }
  const remaining = MAX_TOTAL_COINS - sumOthers;
  if(remaining<=0) val=0;
  else if(val>remaining) val=remaining;

  changed.value=String(val);
}

function clampProperties(index){
  const cap = getPropertyCap();
  const changed=document.getElementById(`props_${index}`);
  if(!changed) return;
  let raw=changed.value.trim();
  if(raw===''){ return; }
  let val=parseInt(raw,10);
  if(isNaN(val)) val=0;

  let sumOthers=0;
  for(let i=0;i<players.length;i++){
    if(i===index) continue;
    const el=document.getElementById(`props_${i}`);
    if(!el) continue;
    let v=parseInt(el.value,10);
    if(isNaN(v)||v<1) v=1;
    sumOthers+=v;
  }
  let remaining = cap - sumOthers;
  if(remaining < 1){
    val = 1;
  } else {
    if(val < 1) val = 1;
    if(val > remaining) val = remaining;
  }
  changed.value=String(val);
}

function scheduleClampCoins(i){
  if(coinsClampTimers[i]) clearTimeout(coinsClampTimers[i]);
  coinsClampTimers[i]=setTimeout(()=>clampCoins(i), CLAMP_DELAY);
}
function scheduleClampProps(i){
  if(propsClampTimers[i]) clearTimeout(propsClampTimers[i]);
  propsClampTimers[i]=setTimeout(()=>clampProperties(i), CLAMP_DELAY);
}

function resolvePlayerIndex(p){
  const idx = players.indexOf(p);
  if(idx !== -1) return idx;
  return players.findIndex(pp => pp && p && pp.name === p.name);
}

/* ---------- Load Endgame Input Screen ---------- */
function loadEndgame(){
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=false;
  coinsClampTimers=[]; propsClampTimers=[];
  const cards = players.map((p,i)=>`
    <div class="endgame-card" style="background:#303030;border:2px solid #3a3a3a;border-radius:14px;padding:0.85rem 0.7rem;min-width:240px;">
      <div class="final-result-card-inner">
        <div class="final-result-name player-name" style="margin-bottom:0.55rem;">${escapeHtml(p.name)}</div>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="coins_${i}" placeholder="Haggleoffs" aria-label="${escapeHtml(p.name)} Haggleoffs">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="props_${i}" placeholder="Properties (min 1)" aria-label="${escapeHtml(p.name)} Properties">
        </div>
      </div>
    </div>`).join('');

  document.getElementById('mainGameContainer').innerHTML=`
    <div class="calculatorBox">
      <h2 class="lilita" style="margin-top:0;">Endgame</h2>
      <p style="font-size:1rem;margin-top:-0.2rem;">Enter each player’s Haggleoffs and Properties.</p>
      <div style="display:flex;gap:1rem;overflow-x:auto;padding:0.4rem 0.25rem;">${cards}</div>
      <button type="button" class="styled-btn" onclick="calculateFinalTaxes()">Calculate Taxes</button>
      <div id="finalSummary" style="display:none;"></div>
    </div>`;

  players.forEach((_,i)=>{
    const coinsEl=document.getElementById(`coins_${i}`);
    const propsEl=document.getElementById(`props_${i}`);

    if(coinsEl){
      coinsEl.addEventListener('input',()=>{
        const pos=coinsEl.selectionStart;
        coinsEl.value=coinsEl.value.replace(/\D+/g,'');
        try{ coinsEl.setSelectionRange(pos,pos);}catch(e){}
        scheduleClampCoins(i);
      });
      coinsEl.addEventListener('blur',()=>clampCoins(i));
    }
    if(propsEl){
      propsEl.addEventListener('input',()=>{
        const pos=propsEl.selectionStart;
        propsEl.value=propsEl.value.replace(/\D+/g,'');
        try{ propsEl.setSelectionRange(pos,pos);}catch(e){}
        scheduleClampProps(i);
      });
      propsEl.addEventListener('blur',()=>clampProperties(i));
    }
  });
}

/* ---------- Tax Helpers ---------- */
function getTaxBracketMessage(coins,props){
  if(coins<=6 && props>3) return "Broke on paper, rich in acres.";
  if(coins<=6) return "Enjoy tax-free poverty.";
  if(coins<=14) return "The poor get crushed.";
  if(coins<=24) return "The middle class gets squeezed.";
  if(coins<=39) return "The rich barely feel it.";
  return "Wealth scales, burden doesn’t.";
}

function getAuditRiskLevel(p){
  const breaks = (p.streaks||0)+(p.powerCards||0);
  const income = p.coins || 1;
  const ratio = breaks/income;
  if(ratio>=1) return "Board Review Pending";
  if(ratio>=0.5) return "High";
  if(ratio>=0.3) return "Moderate";
  return "Low";
}

/* ---------- Final Results + Detail Sheet ---------- */
function calculateFinalTaxes(){
  const summary=document.getElementById('finalSummary');
  summary.style.display='none'; summary.innerHTML='';

  for(let i=0;i<players.length;i++){
    const c=document.getElementById(`coins_${i}`);
    const pr=document.getElementById(`props_${i}`);
    if(!c || !pr || !/^\d+$/.test(c.value.trim()) || !/^\d+$/.test(pr.value.trim())){
      customPopup("Use only whole non-negative numbers.");
      return;
    }
  }

  const totalCoins = players.reduce((s,_,i)=>{
    const el=document.getElementById(`coins_${i}`);
    return s + (el && /^\d+$/.test(el.value)? parseInt(el.value,10):0);
  },0);
  if(totalCoins > MAX_TOTAL_COINS){
    customPopup(`Total Haggleoffs cannot exceed ${MAX_TOTAL_COINS}.`);
    return;
  }

  const propCap = getPropertyCap();
  const totalProps = players.reduce((s,_,i)=>{
    const el=document.getElementById(`props_${i}`);
    let v = el && /^\d+$/.test(el.value)? parseInt(el.value,10):0;
    if(v < 1) v = 1;
    return s + v;
  },0);
  if(totalProps > propCap){
    customPopup(`Total Properties cannot exceed ${propCap} (Property Stack + Players).`);
    return;
  }

  players.forEach((pl,i)=>{
    const coins=+document.getElementById(`coins_${i}`).value.trim();
    const propsRaw=+document.getElementById(`props_${i}`).value.trim();
    const props = Math.max(1, propsRaw);
    pl.coins=coins; pl.properties=props;

    const bracketTax=coins<=6?0: coins<=14?3: coins<=24?5: coins<=39?8:10;
    const propertyTax=coins>6? pl.properties*(pl.properties>=4?2:1):0;
    const gross=bracketTax+propertyTax;
    const cap=Math.floor(coins*0.54);
    const capped=Math.min(gross,cap);

    const breaks=(pl.streaks||0)+(pl.powerCards||0);
    const taxBaseBeforeHMT = Math.max(0,capped - breaks);
    let taxBase = taxBaseBeforeHMT;

    pl.hmtApplied=false;
    pl.hmtPercent='';
    pl.hmtExplanation='';

    if(taxBase===0){
      if(coins>=40){
        taxBase=Math.floor(coins*0.10);
        pl.hmtApplied=true; pl.hmtPercent='10%';
        pl.hmtExplanation='Deductions reduced capped tax to zero; income ≥ 40 triggers 10% HMT.';
      } else if(coins>=30){
        taxBase=Math.floor(coins*0.05);
        pl.hmtApplied=true; pl.hmtPercent='5%';
        pl.hmtExplanation='Deductions reduced capped tax to zero; income 30–39 triggers 5% HMT.';
      }
    }

    pl.tax=Math.min(taxBase, coins);

    pl.bracketTax = bracketTax;
    pl.propertyTax = propertyTax;
    pl.grossTax = gross;
    pl.taxCeiling = cap;
    pl.cappedTax = capped;
    pl.breaks = breaks;
    pl.baseBeforeHMT = taxBaseBeforeHMT;
    pl.taxAvoidedCeiling = Math.max(0, gross - capped);
    pl.taxAvoidedDeductions = Math.max(0, capped - taxBaseBeforeHMT);
    pl.finalEffectiveRate = coins? (pl.tax/coins)*100 : 0;
    pl.preDeductionEffectiveRate = coins? (capped/coins)*100 : 0;
  });

  const nets=players.map(p=>p.coins-p.tax);
  const maxNet=Math.max(...nets);

  const primaryCandidates = players.filter(p => (p.coins - p.tax) === maxNet);
  const propTieBreakUsed = primaryCandidates.length > 1;
  let winners;
  if(primaryCandidates.length > 1){
    const maxPropsAmong = Math.max(...primaryCandidates.map(p=>p.properties));
    const propFiltered = primaryCandidates.filter(p=>p.properties === maxPropsAmong);
    winners = propFiltered;
  } else {
    winners = primaryCandidates;
  }

  const landlordMode = propTieBreakUsed && winners.length === 1;

  totalAssetsForResults=players.reduce((s,p)=>s+p.coins+p.properties,0)||1;
  players.forEach(p=>{
    p.netSharePercent = ((p.coins+p.properties)/totalAssetsForResults)*100;
  });

  const sorted=[...players].sort((a,b)=>{
    const netDiff = (b.coins - b.tax) - (a.coins - a.tax);
    if(netDiff!==0) return netDiff;
    const propDiff = b.properties - a.properties;
    if(propDiff!==0) return propDiff;
    return 0;
  });

  const ribbon = winners.length===1
    ? (landlordMode
        ? `<div class="fr2-ribbon landlord"><span class="emoji">🏆</span><span>${escapeHtml(winners[0].name)} Landlord</span></div>`
        : `<div class="fr2-ribbon"><span class="emoji">🏆</span><span>${escapeHtml(winners[0].name)} Wins!</span></div>`)
    : `<div class="fr2-ribbon co"><span class="emoji">🏆</span><span>${winners.map(w=>escapeHtml(w.name)).join(', ')} Shareholders</span></div>`;

  let cards='';
  sorted.forEach((p)=>{
    const net=p.coins-p.tax;
    const eff=p.coins?Math.round((p.tax/p.coins)*100):0;
    const breaks=(p.streaks||0)+(p.powerCards||0);
    const share=p.netSharePercent;
    const barPct=Math.min(100,share);
    const isWinner = winners.some(w => w === p || (w && p && w.name === p.name));
    const tie = winners.length > 1;
    const msg=getTaxBracketMessage(p.coins,p.properties);

    const winnerClass = isWinner ? (landlordMode ? 'landlord' : 'winner') : '';
    const badgeLabel = isWinner ? (landlordMode ? 'LANDLORD' : (tie ? 'SHAREHOLDER' : 'WINNER')) : '';
    const idxForMore = players.indexOf(p);

    cards+=`
      <div class="fr2-card ${winnerClass}">
        ${isWinner?`<div class="fr2-badge">${badgeLabel}</div>`:''}
        <div class="fr2-name">${escapeHtml(p.name)}</div>
        <div class="fr2-pillrow">
          <span class="fr2-pill">Income <span class="num">${p.coins}</span></span>
          <span class="fr2-pill">Props <span class="num">${p.properties}</span></span>
          <span class="fr2-pill">Rate <span class="num">${eff}%</span></span>
        </div>
        <div class="fr2-pillrow">
          <span class="fr2-pill deductions">Deductions <span class="num">${breaks}</span></span>
        </div>
        <div class="fr2-bar"><div class="fill${tie?' tie':''}" style="width:${barPct}%"></div></div>
        <div class="fr2-lines">
          <div class="fr2-line fr2-tax-line">
            <span class="label">Tax:</span>
            <span class="value">${p.tax}</span>
            ${p.hmtApplied ? `<span class="fr2-hmt-pill ${p.hmtPercent==='5%'?'p5':'p10'}" tabindex="0" role="button" data-tip="HMT stands for &quot;Haggie Minimum Tax”. It is a penalty tax only on the rich and wealthy who have reduced their tax bill to zero-because even loopholes have limits!">HMT ${p.hmtPercent}</span>` : ''}
          </div>
          <div class="fr2-line"><span class="label">Net Income:</span> <span class="value">${net}</span></div>
          <div class="fr2-line"><span class="label">Audit Risk:</span> <span class="value">${getAuditRiskLevel(p)}</span></div>
        </div>
        <div class="fr2-quote">${msg}</div>
        <div class="fr2-netshare">Net Share: ${Math.round(barPct)}%</div>
        <a href="#" class="fr2-more" onclick="showTaxBreakdown(${idxForMore}); return false;">More Info</a>
      </div>`;
  });

  summary.style.display='block';
  summary.innerHTML=`
    <div class="fr2-wrapper">
      ${ribbon}
      <div class="fr2-grid">${cards}</div>
      <button type="button" onclick="exitToSetup()" class="styled-btn" style="max-width:220px;margin:.65rem auto 0;display:block;">EXIT</button>
    </div>`;
}

function showTaxBreakdown(i){ openFinalDetailSheet(i); }

function openFinalDetailSheet(i){
  ensureSheetElements();
  const p=players[i];
  if(!p) return;
  const overlay=document.getElementById('finalDetailSheetOverlay');
  const sheet=document.getElementById('finalDetailSheet');

  if(quickPadOpen) closeQuickPad();

  const net = p.coins - p.tax;
  const msg = getTaxBracketMessage(p.coins,p.properties);
  const audit = getAuditRiskLevel(p);
  const breaks = p.breaks ?? ((p.streaks||0)+(p.powerCards||0));
  const effBefore = p.preDeductionEffectiveRate || (p.coins? (p.cappedTax/p.coins*100):0);
  const effAfter = p.finalEffectiveRate || (p.coins? (p.tax/p.coins*100):0);
  const share = p.netSharePercent ?? ((p.coins+p.properties)/(totalAssetsForResults||1)*100);

  let propertyTaxExplanation='';
  if(p.coins<=6){
    propertyTaxExplanation='Income ≤ 6: no property tax.';
  } else if(p.properties>=4){
    propertyTaxExplanation=`${p.properties} properties @2 each (4+ property surcharge).`;
  } else {
    propertyTaxExplanation=`${p.properties} properties @1 each.`;
  }

  const lines = [
    { label:'Gross Income', val:p.coins },
    { label:'Properties', val:p.properties },
    { label:'Tax Breaks Earned', val:breaks },
    { label:'Earnings Bracket Tax', val:p.bracketTax },
    { label:'Property Tax', val:p.propertyTax, extra:propertyTaxExplanation },
    { label:'Gross Tax (Bracket + Property)', val:p.grossTax },
    { label:'Tax Ceiling (54% of Income)', val:p.taxCeiling },
    { label:'Tax Avoided (Ceiling)', val:p.taxAvoidedCeiling, color:'#19a43c' },
    { label:'Deductions Applied', val:breaks },
    { label:'Tax Avoided (Deductions)', val:p.taxAvoidedDeductions, color:'#19a43c' },
    ...(p.hmtApplied ? [{ label:`HMT Applied (${p.hmtPercent})`, val:p.tax, extra:p.hmtExplanation, color:'#dc143c' }] : []),
    { label:'Effective Rate Before Deductions', val: effBefore.toFixed(1)+'%' },
    { label:'Effective Rate After Deductions', val: effAfter.toFixed(1)+'%' },
    { label:'Final Taxes Owed', val:p.tax, color:'#dc143c' },
    { label:'Net Income', val:net, color:'#19a43c' },
    { label:'Audit Risk', val:audit },
    { label:'Net Share', val: Math.round(share) + '%' }
  ];

  const detailRows = lines.map(l=>{
    const valueColor = l.color || 'var(--color-accent)';
    return `
    <div class="detail-line" style="display:flex;justify-content:space-between;align-items:flex-start;gap:.8rem;padding:.4rem .55rem;border:1px solid #363636;border-radius:10px;background:#272727;">
      <div style="font-family:var(--font-display);letter-spacing:.4px;color:#e4e4e4;font-size:.85rem;line-height:1.2;">
        ${l.label}${l.extra?`<div style="margin-top:.25rem;font-size:.65rem;color:#bbb;letter-spacing:.3px;">${l.extra}</div>`:''}
      </div>
      <div style="font-family:var(--font-display);color:${valueColor};font-size:.9rem;white-space:nowrap;">${l.val}</div>
    </div>`;
  }).join('');

  sheet.innerHTML=`
    <div class="final-detail-sheet-header">
      <div class="final-detail-sheet-grip"></div>
      <h3 class="final-detail-sheet-title lilita" style="margin:.6rem 0 .2rem;font-size:1.25rem;">${escapeHtml(p.name)} – Detailed Filing</h3>
    </div>
    <div class="final-detail-body" style="padding:.25rem .15rem .5rem .15rem;display:flex;flex-direction:column;gap:.6rem;">
      <div class="section-block" style="display:flex;flex-direction:column;gap:.6rem;">
        ${detailRows}
      </div>
      <div class="message-block" style="margin-top:.2rem;padding:.65rem .7rem;border:1px solid #3a3a3a;border-radius:12px;background:#232323;">
        <div style="font-family:var(--font-display);font-size:1rem;color:#d4af7f;letter-spacing:.5px;">${msg}</div>
      </div>
    </div>
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:.4rem;">
      <button type="button" class="debt-footer-btn primary" style="flex:1 1 140px;" id="closeFinalDetailBtn">Done</button>
    </div>
  `;

  overlay.style.display='flex';
  document.body.classList.add('modal-open');
  requestAnimationFrame(()=>sheet.classList.add('open'));

  const close = ()=>{
    sheet.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(()=>{ overlay.style.display='none'; sheet.innerHTML=''; },380);
  };
  document.getElementById('closeFinalDetailBtn').onclick=close;
  overlay.addEventListener('click', e=>{
    if(e.target.id==='finalDetailSheetOverlay') close();
  }, { once:true });
  const escHandler=(e)=>{ if(e.key==='Escape'){ close(); window.removeEventListener('keydown',escHandler);} };
  window.addEventListener('keydown',escHandler);
}

/* ---------- Exit & reset after final results ---------- */
function exitToSetup(){
  lastPlayerNames=players.map(p=>p.name);
  players=[]; debts=[]; disallowedNormalCards=[];
  currentPlayerIndex=0;
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=true; timeLeft=60;
  closeQuickPad();
  const main=document.getElementById('mainGameContainer');
  if(main){
    main.innerHTML=`
      <div class="exit-screen-wrapper">
        <h2>Thank you for Haggleoffing...</h2>
        <p>Your mediocre filings slipped into the shredder before the Haggie Revenue Service could audit a single page. Haggleoff again?</p>
        <button type="button" id="playAgainBtn" class="styled-btn" style="max-width:240px;">Play Again</button>
      </div>`;
    document.getElementById('playAgainBtn').onclick=restorePlayerNamesAndSetup;
  }
}
function restorePlayerNamesAndSetup(){
  const setupBox=document.getElementById('playerSetupBox');
  const fields=document.getElementById('playerInputFields');
  if(!setupBox||!fields) return;
  fields.innerHTML='';
  const names=lastPlayerNames.length>=2? lastPlayerNames : ['Player 1','Player 2'];
  names.forEach((n,i)=>{
    if(i>=MAX_PLAYERS) return;
    const input=document.createElement('input');
    input.type='text'; input.name='playerName'; input.maxLength=PLAYER_NAME_MAX;
    input.placeholder=`Player ${i+1}${i<2?' (required)':''}`;
    input.required=i<2; input.value=n.slice(0,PLAYER_NAME_MAX);
    fields.appendChild(input);
  });
  while(fields.querySelectorAll('input').length<2){
    const idx=fields.querySelectorAll('input').length+1;
    const input=document.createElement('input');
    input.type='text'; input.name='playerName'; input.maxLength=PLAYER_NAME_MAX;
    input.placeholder=`Player ${idx} (required)`; input.required=true;
    fields.appendChild(input);
  }
  setupBox.style.display='block';
  document.getElementById('mainGameContainer').innerHTML='';
  updateAddPlayerButtonAppearance();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ---------- Popup system ---------- */
function ensurePopupElements(){
  let overlay=document.getElementById('customPopupOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='customPopupOverlay';
    overlay.className='dimOverlay';
    overlay.innerHTML=`
      <div class="popupBox" id="customPopupBox">
        <div id="customPopupMessage"></div>
        <div id="customPopupButtons" style="display:flex; gap:.6rem; flex-wrap:wrap; justify-content:center; margin-top:0.9rem;">
          <button type="button" id="customPopupYes" class="styled-btn">OK</button>
          <button type="button" id="customPopupNo" class="btn-neutral styled-btn">No</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
}
function resetStandardPopupButtons(){
  const btnBox=document.getElementById('customPopupButtons');
  if(btnBox){
    btnBox.innerHTML=`
      <button type="button" id="customPopupYes" class="styled-btn">OK</button>
      <button type="button" id="customPopupNo" class="btn-neutral styled-btn">No</button>`;
  }
}
function customPopup(message, callback, isHtml=false, yesText="Yes", noText="No", okOnly=false){
  ensurePopupElements();
  resetStandardPopupButtons();
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const yes=document.getElementById('customPopupYes');
  const no=document.getElementById('customPopupNo');
  msg.innerHTML=isHtml? message : message.replace(/\n/g,"<br>");
  overlay.style.display='flex';
  if(typeof callback!== 'function'){
    yes.textContent='OK'; no.style.display='none';
    yes.onclick=()=>overlay.style.display='none';
  } else if(okOnly){
    yes.textContent='OK'; no.style.display='none';
    yes.onclick=()=>{ overlay.style.display='none'; callback(); };
  } else {
    yes.textContent=yesText; no.textContent=noText; no.style.display='inline-block';
    yes.onclick=()=>{ overlay.style.display='none'; callback(true); };
    no.onclick=()=>{ overlay.style.display='none'; callback(false); };
  }
}

/* ---------- Setup form ---------- */
document.getElementById('playerForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  let names=[...e.target.querySelectorAll("input[name='playerName']")].map(i=>i.value.trim().slice(0,PLAYER_NAME_MAX));
  if(names.some(n=>n.length>PLAYER_NAME_MAX)){
    customPopup(`Player names must be ${PLAYER_NAME_MAX} characters or fewer.`);
    return;
  }
  names=names.filter(Boolean);
  if(names.length<2){ customPopup("At least two players required."); return; }
  if(names.length>MAX_PLAYERS){
    customPopup(`Maximum ${MAX_PLAYERS} players allowed.`);
    return;
  }
  players=names.map(n=>({ name:n, streaks:0, powerCards:0, progress:0, coins:0, properties:0, tax:0 }));
  disallowedNormalCards=Array(players.length).fill(0);
  debts=Array(players.length).fill(null).map(()=>Array(players.length).fill(null).map(()=>{
    const o={}; debtCategories.forEach(c=>o[c]=0); return o;
  }));
  lastPlayerNames=names.slice();
  document.getElementById('playerSetupBox').style.display='none';
  const msg=`<span style="font-family:'Roboto';color:#f1f1f1;font-size:1rem;">Reloading resets your progress.</span><br><br>
  <span style="font-family:'Roboto';color:#f1f1f1;font-size:1rem;">After each player is dealt 1 free property during the game setup, place at the center of the table </span>
  <span style="color:#d4af7f;font-size:1rem;">Property Stack size: ${players.length+1}</span>`;
  customPopup(msg, ()=>showPlayerCards(), true,"Yes","No", true);
});

/* ---------- Add Player helper ---------- */
function updateAddPlayerButtonAppearance(){
  const btn=document.getElementById('addPlayerBtn');
  if(!btn) return;
  const count = document.querySelectorAll('#playerInputFields input[name="playerName"]').length;
  if(count >= MAX_PLAYERS){
    btn.classList.add('add-player-maxed');
    btn.setAttribute('aria-disabled','true');
  } else {
    btn.classList.remove('add-player-maxed');
    btn.removeAttribute('aria-disabled');
  }
}

function addPlayerField(){
  const container = document.getElementById('playerInputFields');
  if(!container) return;
  const inputs = container.querySelectorAll('input[name="playerName"]');
  if(inputs.length >= MAX_PLAYERS){
    customPopup("Haggleoff's legal limit is 7 players. Unless y'all are planning to unionize.", null, false, "", "", true);
    updateAddPlayerButtonAppearance();
    return;
  }
  const nextIndex = inputs.length + 1;
  const input=document.createElement('input');
  input.type='text';
  input.name='playerName';
  input.maxLength=PLAYER_NAME_MAX;
  const required = nextIndex <= 2;
  input.placeholder = nextIndex <= 2 ? `Player ${nextIndex} (required)` : `Player ${nextIndex} (optional)`;
  input.required = required;
  container.appendChild(input);
  input.focus({preventScroll:false});
  updateAddPlayerButtonAppearance();
}
if(typeof window!=='undefined') window.addPlayerField=addPlayerField;

/* ---------- Escape HTML helper ---------- */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g,s=>{
    switch(s){
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return s;
    }
  });
}

/* ---------- Global helper ---------- */
window.dismissDisclaimer=function(){
  document.getElementById('disclaimerOverlay').style.display='none';
  document.getElementById('playerSetupBox').style.display='block';
  ensurePopupElements();
  ensureSheetElements();
  updateAddPlayerButtonAppearance();
};

/* Legacy placeholder */
function closeDebtSheet(){}

/* ---------- Expose key methods ---------- */
window.openQuickPad=openQuickPad;
window.showEndgame=showEndgame;
window.loadEndgame=loadEndgame;
window.calculateFinalTaxes=calculateFinalTaxes;
window.showTaxBreakdown=showTaxBreakdown;
window.exitToSetup=exitToSetup;
window.restorePlayerNamesAndSetup=restorePlayerNamesAndSetup;