/************************************************************
 * TAX404
 * Dynamic Debt Button Interaction Update
 *
 * Summary of Major Features & Recent Changes
 * ----------------------------------------------------------
 * - Dynamic debt adjustment buttons (NONE / OWE / COLLECT states)
 * - Outstanding debt category quick-clear via thumbnail trash
 * - Inactive player cards show passive debt summary (live updating)
 * - Active + passive debt summary bars live update on any change
 * - Endgame tax calculation with tie‑breaker logic
 * - Trash overlay hides on outside click / Escape
 * - Debt sheet navigation & per-category normalization
 * - Timer shared between main view & debt sheet
 * - (2025-09-27) Active card debt summary bar moved above "Normal Cards Donated"
 * - (2025-09-27) Live updating of passive debt summaries
 * - (2025-09-27) Clickable Tax Breaks Badge Tooltip (active card only)
 * - (2025-09-27 LATE PATCH) Unified interactive tooltip system
 * - (2025-09-28) Setup player cap: Max 7 players. Add Player button greys out at 7
 * - (2025-09-28 LATE) Endgame caps: Total Haggleoffs ≤ 100; Total Properties ≤ Property Stack + Players.
 * - (2025-09-28 LATE2) Endgame entry: free typing (no live clamp). Clamp only after pause (debounce) or blur.
 * - (2025-09-29) Landlord designation with teal styling when tie resolved by properties.
 * - (2025-09-30) AMT renamed to HMT everywhere.
 * - (2025-11-02) Outstanding Debts: Centered horizontal chips row (number-only), arrow buttons removed.
 * - (2025-11-02) Hide chips row when players ≤ 2.
 * - (2025-11-02 LATE) Mobile perf + UX:
 *    * Only update the active chip counts (no full chips rebuild) on category tweaks.
 *    * Do not auto-scroll chips row during adjustments.
 *    * Single pointer-based swipe handler (avoid duplicate touch+pointer).
 *    * Swiping the chips row does not change active selection; only tap/click does.
 ************************************************************/

const PLAYER_NAME_MAX = 10;
const MAX_PLAYERS = 7;
/* Endgame aggregate caps */
const MAX_TOTAL_COINS = 100; // Total Haggleoffs cap across all players

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

/* Debt Data */
const debtCategories = [
  "Haggie","Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles",
  "Mav","Clauseby","Buckley","Bugsy","Wiggy","Squeak","Beebo","Wally","Tillie","Moozy"
];
const debtCategoryGroups = {
  "Money": ["Haggie"],
  "Power Cards": ["Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles"],
  "Normal Cards": ["Mav","Clauseby","Buckley","Bugsy","Wiggy","Squeak","Beebo","Wally","Tillie","Moozy"]
};

/* Persistent collapse state */
let debtGroupCollapsed = {};
Object.keys(debtCategoryGroups).forEach(g => debtGroupCollapsed[g] = false);

let debts = [];
let totalAssetsForResults = 0;

/* Keydown listener guard */
let debtSheetKeydownBound = false;

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

/* Direct increment/decrement for new UI */
function incrementOwe(a,b,cat){ debts[a][b][cat]=(debts[a][b][cat]||0)+1; debts[b][a][cat]=0; }
function decrementOwe(a,b,cat){
  const cur=debts[a][b][cat]||0;
  if(cur>0) debts[a][b][cat]=cur-1;
}
function incrementCollect(a,b,cat){ debts[b][a][cat]=(debts[b][a][cat]||0)+1; debts[a][b][cat]=0; }
function decrementCollect(a,b,cat){
  const cur=debts[b][a][cat]||0;
  if(cur>0) debts[b][a][cat]=cur-1;
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
    if(i<gold) blocks+='<div class="donate-block"></div>';
    else if(i<gold+gray) blocks+='<div class="donate-block" style="background:#d9d9d9;box-shadow:inset 0 0 0 2px #aaa;"></div>';
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
      ${
        interactive
          ? `<div class="tb-tooltip" role="tooltip" id="taxBreaksTooltip" aria-hidden="true">
               Total Tax Breaks Earned.<br>
               This lowers your taxes owed at the end of the game.
             </div>`
          : ''
      }
    </div>`;
}

/* ---------- Debt Summary Bars ---------- */
function buildDebtSummaryBar(idx=currentPlayerIndex, { interactive=true } = {}){
  const { owe, collect } = aggregateTotals(idx);
  if(interactive){
    return `
      <div class="debt-summary-bar" id="debtSummaryBar" role="button" tabindex="0" aria-label="View & adjust detailed debts">
        <span class="ds-owe">You Owe: ${owe}</span>
        <span class="ds-collect">You Collect: ${collect}</span>
      </div>`;
  } else {
    return `
      <div class="debt-summary-bar passive" aria-label="Outstanding debts summary (view only)">
        <span class="ds-owe">You Owe: ${owe}</span>
        <span class="ds-collect">You Collect: ${collect}</span>
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
        <h3 class="turn-player-name">${p.name}</h3>
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
        <h3 class="turn-player-name">${p.name}</h3>
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
        <button type="button" id="tookCharityBtn" class="donation-btn" data-variant="secondary" aria-pressed="false">Took from Charity</button>
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
  const charityBtn = cardElem.querySelector('#tookCharityBtn');
  lockElementBox(charityBtn);
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
  if(plusP)  plusP.disabled  = disabled || powerDonated>=20;

  [minusN,plusN,minusP,plusP].forEach(el=>{
    if(!el) return;
    el.style.visibility = tookCharityThisTurn ? 'hidden':'visible';
  });

  if(charity){
    lockElementBox(charity);
    charity.setAttribute('aria-pressed', tookCharityThisTurn? 'true':'false');
    charity.classList.toggle('danger', tookCharityThisTurn);
    charity.textContent='Took from Charity';

    // Show the "Took from Charity" button ONLY when the user hasn't entered any donation values this turn.
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
  if(plusP)  plusP.onclick =()=>{ if(!plusP.disabled && powerDonated<20){ powerDonated++; updateDonationDynamic(); } };
  if(charity) charity.onclick=()=>{ tookCharityThisTurn=!tookCharityThisTurn; updateDonationButtonsState(); };
}
function updateDonationDynamic(){
  const activeCard=document.querySelector('.player-card.active')||document;
  const { blocks, breaksPreview } = computeDonationVisuals();
  const blocksContainer=activeCard.querySelector('#normalCardsContainer');
  if(blocksContainer) blocksContainer.innerHTML=blocks;
  const powerCircle=activeCard.querySelector('#powerCircle');
  if(powerCircle){
    powerCircle.textContent=powerDonated;
    powerCircle.classList.toggle('zero', powerDonated===0);
  }
  const badgeVal=activeCard.querySelector('#taxBreaksValue');
  const badge=activeCard.querySelector('#taxBreaksBadge');
  if(badgeVal){
    const cur=parseInt(badgeVal.textContent||'0',10);
    if(badge && breaksPreview>cur){
      badge.classList.remove('earned'); void badge.offsetWidth; badge.classList.add('earned');
      setTimeout(()=>badge && badge.classList.remove('earned'),800);
    }
    badgeVal.textContent=breaksPreview;
  }
  updateDonationButtonsState();
  refreshOverviewOnly();
}

/* ---------- Unified Tooltip System (Tax Breaks + Info Icon) ---------- */
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

    if(shift!==0){
      const baseTranslate = tooltip.classList.contains('flip')
        ? 'translate(-50%,-10px)'
        : 'translate(-50%,4px)';
      tooltip.style.transform = baseTranslate.replace('-50%', `calc(-50% + ${shift}px)`);
    } else {
      tooltip.style.transform = tooltip.classList.contains('flip')
        ? 'translate(-50%,-10px)'
        : 'translate(-50%,4px)';
    }
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
    if(t){ t.setAttribute('aria-hidden','true'); }
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
        e.preventDefault();
        toggle(tr);
      } else if(e.key==='Escape'){
        close(tr);
      }
    });
  });

  function outsideHandler(e){
    if(openTrigger && !openTrigger.contains(e.target)){
      close(openTrigger);
    }
  }
  function escHandler(e){
    if(e.key==='Escape' && openTrigger){
      close(openTrigger);
    }
  }
  document.addEventListener('click', outsideHandler, { capture:true });
  document.addEventListener('keydown', escHandler);

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
  const activeCard=document.querySelector('.player-card.active');
  if(activeCard) lockElementBox(activeCard.querySelector('#tookCharityBtn'));
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

/* ---------- Debt summary refresh (ACTIVE + PASSIVE LIVE UPDATE) ---------- */
function refreshOverviewOnly(){
  const bar=document.getElementById('debtSummaryBar');
  if(bar){
    const { owe, collect } = aggregateTotals(currentPlayerIndex);
    const oweSpan=bar.querySelector('.ds-owe');
    const collectSpan=bar.querySelector('.ds-collect');
    if(oweSpan) oweSpan.textContent=`You Owe: ${owe}`;
    if(collectSpan) collectSpan.textContent=`You Collect: ${collect}`;
  }

  document.querySelectorAll('.player-card').forEach(card=>{
    const idx = parseInt(card.dataset.index,10);
    if(isNaN(idx)) return;
    if(idx === currentPlayerIndex) return;
    const passiveBar = card.querySelector('.debt-summary-bar.passive');
    if(passiveBar){
      const { owe, collect } = aggregateTotals(idx);
      const oweSpan = passiveBar.querySelector('.ds-owe');
      const collectSpan = passiveBar.querySelector('.ds-collect');
      if(oweSpan) oweSpan.textContent=`You Owe: ${owe}`;
      if(collectSpan) collectSpan.textContent=`You Collect: ${collect}`;
    }
  });
}

/* ---------- Debt sheet ---------- */
let openDebtPlayerIndex=null;

/* Build quick-switch chips row (no O/C letters; numbers only; centered). Hidden if ≤2 players. */
function buildDebtChipsRow(a, selectedIdx){
  if (players.length <= 2) return '';
  let chips='';
  for(let i=0;i<players.length;i++){
    if(i===a) continue;
    const owe = sumYouOwe(a,i);
    const collect = sumTheyOwe(a,i);
    const total = owe + collect;
    const active = i===selectedIdx ? ' active' : '';
    const dim = total===0 ? ' dim' : '';
    const name = players[i].name;
    chips += `
      <button type="button" class="debt-chip${active}${dim}" data-index="${i}" aria-label="${name}: You owe ${owe}, They owe you ${collect}">
        <div class="name">${name}</div>
        <div class="debts"><span class="owe">${owe}</span><span class="collect">${collect}</span></div>
      </button>`;
  }
  return `<div class="debt-chip-row" id="debtChipRow">${chips}</div>`;
}

/* Lightweight: update ONLY the active chip counts to avoid full rebuilds while adjusting */
function updateActiveChipCounts(){
  const row = document.getElementById('debtChipRow');
  if(!row) return;
  const a = currentPlayerIndex;
  const b = openDebtPlayerIndex;
  if(b==null) return;
  const chip = row.querySelector(`.debt-chip[data-index="${b}"]`);
  if(!chip) return;
  const owe = sumYouOwe(a,b);
  const collect = sumTheyOwe(a,b);
  const total = owe + collect;
  const oweEl = chip.querySelector('.owe');
  const colEl = chip.querySelector('.collect');
  if(oweEl) oweEl.textContent = String(owe);
  if(colEl) colEl.textContent = String(collect);
  chip.classList.toggle('dim', total===0);
}

function scrollActiveChipIntoView(){
  const row = document.getElementById('debtChipRow');
  if(!row) return;
  const active = row.querySelector('.debt-chip.active');
  if(active) active.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
}

/* Ensure selected chip is visible without jarring scroll (instant, nearest) */
function ensureActiveChipVisibleInstant(){
  const row = document.getElementById('debtChipRow');
  if(!row) return;
  const active = row.querySelector('.debt-chip.active');
  if(!active) return;

  const margin = 8;
  const rowRect = row.getBoundingClientRect();
  const chipRect = active.getBoundingClientRect();
  const prevBehavior = row.style.scrollBehavior;
  row.style.scrollBehavior = 'auto';

  if(chipRect.left < rowRect.left + margin){
    // Scroll left just enough to bring it into view
    row.scrollLeft = active.offsetLeft - margin;
  } else if(chipRect.right > rowRect.right - margin){
    // Scroll right just enough to bring it into view
    row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) + margin;
  }

  row.style.scrollBehavior = prevBehavior;
}

function attachDebtBarHandler(){
  const bar=document.getElementById('debtSummaryBar');
  if(!bar) return;
  const openNext = ()=>{
    if(players.length<2) return;
    const nextIdx = (currentPlayerIndex + 1) % players.length;
    if(nextIdx !== currentPlayerIndex) openDebtSheet(nextIdx);
  };
  bar.onclick=(e)=>{ e.preventDefault(); openNext(); };
  bar.onkeydown=(e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openNext(); } };
}
function openDebtSheet(otherIdx){
  if(otherIdx==null) return;
  ensureSheetElements();
  normalizePair(currentPlayerIndex,otherIdx);
  openDebtPlayerIndex=otherIdx;
  const overlay=document.getElementById('debtSheetOverlay');
  const sheet=document.getElementById('debtSheet');
  sheet.innerHTML=renderDebtSheet(otherIdx);
  overlay.style.display='flex';
  document.body.classList.add('modal-open');
  requestAnimationFrame(()=>sheet.classList.add('open'));
  attachDebtSheetEvents(otherIdx);
  updateTimerDisplays(); bindTimerClick();
  refreshOverviewOnly();
}
function closeDebtSheet(){
  const overlay=document.getElementById('debtSheetOverlay');
  const sheet=document.getElementById('debtSheet');
  sheet.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(()=>{ overlay.style.display='none'; sheet.innerHTML=''; },380);
  openDebtPlayerIndex=null; refreshOverviewOnly();
}
function renderDebtSheet(otherIdx){
  const a=currentPlayerIndex,b=otherIdx;
  const youOwe=sumYouOwe(a,b), theyOwe=sumTheyOwe(a,b);
  const chipsRow = buildDebtChipsRow(a, b);

  let groups='';
  Object.entries(debtCategoryGroups).forEach(([group,cats])=>{
    const collapsed=!!debtGroupCollapsed[group];
    let rows='';
    cats.forEach(cat=>{
      normalizeCategory(a,b,cat);
      const you=debts[a][b][cat]||0;
      const they=debts[b][a][cat]||0;
      const status=you>0?'owe':they>0?'collect':'none';
      const amount=you>0?you:they>0?they:0;
      const label=status==='owe'?'Owe':status==='collect'?'Collect':'None';
      const hasDebt = amount>0;
      rows+=`
        <div class="debt-category-row" data-cat="${cat}">
          <div class="debt-cat-thumb" data-cat-thumb="${cat}" data-cat="${cat}" data-hasdebt="${hasDebt?'1':'0'}">
            <img class="debt-cat-icon" src="${getImageName(cat)}" alt="${cat}">
          </div>
            <div class="debt-cat-info">
              <div class="debt-cat-name">${cat}</div>
              <div class="debt-cat-stats">
                <span data-dir="${cat}" class="pill pill-status ${status}">${label}</span>
                <span data-amt="${cat}" class="pill pill-amt ${status}">${amount}</span>
              </div>
            </div>
          <div class="debt-cat-adjust" data-adjust="${cat}">
            <button type="button" class="debt-adjust-dyn-btn" data-btn="left" data-cat="${cat}" aria-label="Adjust ${cat} left"></button>
            <button type="button" class="debt-adjust-dyn-btn" data-btn="right" data-cat="${cat}" aria-label="Adjust ${cat} right"></button>
          </div>
        </div>`;
    });
    const listStyle=collapsed?'max-height:0;opacity:0;':'max-height:999px;opacity:1;';
    const toggleText=collapsed?'Show':'Hide';
    const ariaExpanded=collapsed?'false':'true';
    groups+=`
      <div class="debt-group-block">
        <div class="debt-group-header">
          <h4>${group}</h4>
          <button type="button" class="debt-group-toggle" data-group="${group}" aria-expanded="${ariaExpanded}">${toggleText}</button>
        </div>
        <div class="debt-category-list" data-group-list="${group}" style="${listStyle}">
          ${rows}
        </div>
      </div>`;
  });
  return `
    <div class="debt-sheet-header">
      <div class="debt-sheet-grip"></div>
      <span id="debtSheetTimerDisplay">${timeLeft}</span>
      <h3 class="debt-sheet-title lilita" style="font-size:1.1rem;color:#d9d9d9;">Outstanding Debts</h3>
    </div>
    <div class="debt-cat-groups">${groups}</div>
    <div class="debt-pair-bottom-summary">
      <div class="debt-pair-title" data-pair-title>
        <span class="active-player">${players[a].name}</span> ↔ <span class="other-player">${players[b].name}</span>
      </div>
      <div class="debt-sheet-netline" data-pair-status style="font-size:1rem;">
        You Owe <span style="color:#dc143c;">${youOwe}</span> | They Owe You <span style="color:#19a43c;">${theyOwe}</span>
      </div>
      ${chipsRow}
    </div>
    <div class="debt-sheet-footer">
      <button type="button" class="debt-footer-btn danger" id="clearAllPairBtn">Clear All</button>
      <button type="button" class="debt-footer-btn primary" id="closeSheetBtn">Done</button>
    </div>`;
}

/* Dynamic button state updater */
function updateCategoryControls(cat){
  const a=currentPlayerIndex, b=openDebtPlayerIndex;
  if(b==null) return;
  const you=debts[a][b][cat]||0;
  const they=debts[b][a][cat]||0;
  const status=you>0?'owe':they>0?'collect':'none';

  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  const adjust=sheet.querySelector(`.debt-cat-adjust[data-adjust="${cat}"]`);
  if(!adjust) return;
  const left=adjust.querySelector('[data-btn="left"]');
  const right=adjust.querySelector('[data-btn="right"]');

  [left,right].forEach(btn=>{
    if(!btn) return;
    btn.className='debt-adjust-dyn-btn';
    btn.textContent='';
    btn.removeAttribute('data-action');
  });

  if(status==='none'){
    if(left){
      left.classList.add('debt-adjust-init-owe');
      left.setAttribute('aria-label',`Start owing ${cat}`);
      left.dataset.action='start-owe';
    }
    if(right){
      right.classList.add('debt-adjust-init-collect');
      right.setAttribute('aria-label',`Start collecting ${cat}`);
      right.dataset.action='start-collect';
    }
  } else if(status==='owe'){
    if(left){
      left.classList.add('debt-adjust-owe');
      left.textContent='+';
      left.setAttribute('aria-label',`Increase amount you owe for ${cat}`);
      left.dataset.action='inc-owe';
    }
    if(right){
      right.classList.add('debt-adjust-owe');
      right.textContent='−';
      right.setAttribute('aria-label',`Decrease amount you owe for ${cat}`);
      right.dataset.action='dec-owe';
    }
  } else {
    if(left){
      left.classList.add('debt-adjust-collect');
      left.textContent='−';
      left.setAttribute('aria-label',`Decrease amount they owe you for ${cat}`);
      left.dataset.action='dec-collect';
    }
    if(right){
      right.classList.add('debt-adjust-collect');
      right.textContent='+';
      right.setAttribute('aria-label',`Increase amount they owe you for ${cat}`);
      right.dataset.action='inc-collect';
    }
  }
}

function refreshCategoryRow(cat){
  const a=currentPlayerIndex, b=openDebtPlayerIndex;
  if(b==null) return;
  normalizeCategory(a,b,cat);
  const you=debts[a][b][cat]||0;
  const they=debts[b][a][cat]||0;
  const status=you>0?'owe':they>0?'collect':'none';
  const amount=you>0?you:they>0?they:0;
  const label=status==='owe'?'Owe':status==='collect'?'Collect':'None';

  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  const row=sheet.querySelector(`.debt-category-row[data-cat="${cat}"]`);
  if(!row) return;
  const statusEl=row.querySelector(`[data-dir="${cat}"]`);
  const amtEl=row.querySelector(`[data-amt="${cat}"]`);
  if(!amtEl || !statusEl) return;

  const prevAmount=parseInt(amtEl.textContent||'0',10);

  statusEl.className=`pill pill-status ${status}`;
  statusEl.textContent=label;
  amtEl.className=`pill pill-amt ${status}`;
  amtEl.textContent=amount;

  const thumb = row.querySelector(`.debt-cat-thumb[data-cat="${cat}"]`);
  if(thumb){
    thumb.dataset.hasdebt = amount>0 ? '1':'0';
    if(amount===0){
      thumb.classList.remove('show-trash');
      const tb=thumb.querySelector('.debt-cat-trash-btn');
      if(tb) tb.remove();
    }
  }

  if(amount>prevAmount && status!=='none'){
    const pulseClass = status==='collect' ? 'value-pulse-green' : 'value-pulse-red';
    [amtEl,statusEl].forEach(el=>{
      el.classList.remove('value-pulse-green','value-pulse-red');
      void el.offsetWidth;
      el.classList.add(pulseClass);
      setTimeout(()=>el.classList.remove(pulseClass),700);
    });
  }
  updateCategoryControls(cat);

  // Performance: only update the active chip’s numbers; do not rebuild or auto-scroll.
  updateActiveChipCounts();
}

function updatePairHeader(a,b){
  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  const youOwe=sumYouOwe(a,b), theyOwe=sumTheyOwe(a,b);
  const netLine=sheet.querySelector('[data-pair-status]');
  if(netLine){
    netLine.innerHTML=`You Owe <span style="color:#dc143c;">${youOwe}</span> | They Owe You <span style="color:#19a43c;">${theyOwe}</span>`;
  }
  // Do not rebuild chips row here; keep it lightweight.
}

/* Helper: hide all active trash overlays */
function hideAllTrashOverlays(){
  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  sheet.querySelectorAll('.debt-cat-thumb.show-trash').forEach(t=>{
    t.classList.remove('show-trash');
    const btn=t.querySelector('.debt-cat-trash-btn');
    if(btn) btn.remove();
  });
}

/* --- Single delegated handler (prevents multi-binding) --- */
function handleDebtAdjustClick(e){
  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;

  const withinThumb = e.target.closest('.debt-cat-thumb');
  const withinTrash = e.target.closest('.debt-cat-trash-btn');

  if(!withinThumb && !withinTrash){
    if(sheet.querySelector('.debt-cat-thumb.show-trash')){
      hideAllTrashOverlays();
    }
  }

  const trashBtn = e.target.closest('.debt-cat-trash-btn');
  if(trashBtn){
    const thumb = trashBtn.parentElement;
    const cat = thumb?.dataset.cat;
    if(cat){
      const a=currentPlayerIndex;
      const b=openDebtPlayerIndex;
      if(b!=null){
        clearSingleCategory(a,b,cat);
        refreshCategoryRow(cat);
        updatePairHeader(a,b);
        refreshOverviewOnly();
      }
    }
    hideAllTrashOverlays();
    return;
  }

  const thumb = e.target.closest('.debt-cat-thumb');
  if(thumb && sheet.contains(thumb)){
    if(thumb.dataset.hasdebt==='1'){
      if(thumb.classList.contains('show-trash')){
        thumb.classList.remove('show-trash');
        const btn=thumb.querySelector('.debt-cat-trash-btn');
        if(btn) btn.remove();
      } else {
        hideAllTrashOverlays();
        if(!thumb.querySelector('.debt-cat-trash-btn')){
          const btn=document.createElement('button');
            btn.type='button';
            btn.className='debt-cat-trash-btn';
            btn.setAttribute('aria-label','Clear this category debt');
            btn.innerHTML='🗑️';
            thumb.appendChild(btn);
        }
        thumb.classList.add('show-trash');
      }
    }
    return;
  }

  const btn = e.target.closest('.debt-adjust-dyn-btn');
  if(!btn) return;
  if(!sheet || !sheet.contains(btn)) return;
  const cat=btn.dataset.cat;
  const action=btn.dataset.action;
  if(!cat || !action) return;
  const a=currentPlayerIndex;
  const b=openDebtPlayerIndex;
  if(b==null) return;

  if(action==='start-owe' || action==='inc-owe'){
    incrementOwe(a,b,cat);
  } else if(action==='start-collect' || action==='inc-collect'){
    incrementCollect(a,b,cat);
  } else if(action==='dec-owe'){
    decrementOwe(a,b,cat);
  } else if(action==='dec-collect'){
    decrementCollect(a,b,cat);
  }

  if((debts[a][b][cat]||0)===0 && (debts[b][a][cat]||0)===0){
    debts[a][b][cat]=0;
    debts[b][a][cat]=0;
  }
  refreshCategoryRow(cat);
  updatePairHeader(a,b);
  refreshOverviewOnly();
}

function attachDebtSheetEvents(otherIdx, suppressInitialChipScroll){
  const a=currentPlayerIndex;
  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  sheet.querySelector('#closeSheetBtn').onclick=closeDebtSheet;
  sheet.querySelector('#clearAllPairBtn').onclick=()=>openClearDebtsOptions(a,otherIdx);

  /* Chips row click-to-jump with swipe/scroll guard */
  const chipRow = sheet.querySelector('#debtChipRow');
  if(chipRow){
    let startX=0, startY=0, moved=false;

    const setScrolling = (on)=>{
      if(on){
        chipRow.dataset.scrolling = '1';
        chipRow.classList.add('scrolling');
      } else {
        chipRow.dataset.scrolling = '0';
        chipRow.classList.remove('scrolling');
      }
    };

    chipRow.addEventListener('pointerdown', (e)=>{
      startX=e.clientX; startY=e.clientY; moved=false;
      setScrolling(false);
    }, {passive:true});

    chipRow.addEventListener('pointermove', (e)=>{
      if(e.buttons!==1) return;
      const dx=Math.abs(e.clientX-startX);
      const dy=Math.abs(e.clientY-startY);
      if(!moved && (dx>6 || dy>6)){
        moved=true;
        setScrolling(true); // indicate this is a scroll, not a tap
      }
    }, {passive:true});

    chipRow.addEventListener('pointerup', ()=>{
      // End of gesture; remove 'scrolling' flag shortly to avoid accidental clicks
      setTimeout(()=>setScrolling(false), 30);
    }, {passive:true});

    chipRow.addEventListener('click', (e)=>{
      if(chipRow.dataset.scrolling === '1'){ return; } // ignore clicks after a swipe
      const chip = e.target.closest('.debt-chip');
      if(!chip) return;
      const idx = parseInt(chip.dataset.index, 10);
      if(isNaN(idx) || idx===openDebtPlayerIndex) return;

      // Preserve current horizontal scroll position before rebuild
      const prevScrollLeft = chipRow.scrollLeft;

      openDebtPlayerIndex = idx;
      sheet.innerHTML = renderDebtSheet(openDebtPlayerIndex);
      attachDebtSheetEvents(openDebtPlayerIndex, true); // suppress initial centering on selection
      updateTimerDisplays();
      refreshOverviewOnly();

      // Restore previous scroll to avoid jumping, then ensure the active chip is visible (instant)
      const newRow = document.getElementById('debtChipRow');
      if(newRow){
        const prevBehavior = newRow.style.scrollBehavior;
        newRow.style.scrollBehavior = 'auto';
        newRow.scrollLeft = prevScrollLeft;
        newRow.style.scrollBehavior = prevBehavior;
      }
      ensureActiveChipVisibleInstant();
    });
  }

  sheet.querySelectorAll('.debt-group-toggle').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const g=btn.dataset.group;
      const list=sheet.querySelector(`[data-group-list="${g}"]`);
      if(!list) return;
      const expanded=btn.getAttribute('aria-expanded')==='true';
      if(expanded){
        list.style.maxHeight='0px';
        list.style.opacity='0';
        btn.setAttribute('aria-expanded','false');
        btn.textContent='Show';
        debtGroupCollapsed[g]=true;
      } else {
        list.style.maxHeight='999px';
        list.style.opacity='1';
        btn.setAttribute('aria-expanded','true');
        btn.textContent='Hide';
        debtGroupCollapsed[g]=false;
      }
    });
  });

  debtCategories.forEach(cat=>updateCategoryControls(cat));

  if(!sheet.dataset.adjustHandlerBound){
    sheet.addEventListener('click', handleDebtAdjustClick);
    sheet.dataset.adjustHandlerBound='1';
  }

  // Sheet-level swipe navigation using pointer events (ignore swipes that start on the chips row)
  let startX=0,startY=0,swipeActive=false, swipeStartedOnChips=false;
  sheet.addEventListener('pointerdown', (e)=>{
    // Ignore if gesture starts on the chips row
    swipeStartedOnChips = !!e.target.closest('#debtChipRow');
    startX=e.clientX; startY=e.clientY; swipeActive=true;
  });
  sheet.addEventListener('pointerup', (e)=>{
    if(!swipeActive){ return; }
    swipeActive=false;
    if(swipeStartedOnChips){ return; } // do not navigate if swipe began on chips
    const dx=e.clientX-startX, dy=e.clientY-startY;
    if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)){
      if(dx<0) navigateDebtPlayer(1); else navigateDebtPlayer(-1);
    }
  });

  if(!debtSheetKeydownBound){
    window.addEventListener('keydown', debtSheetKeyHandler);
    debtSheetKeydownBound = true;
  }

  document.getElementById('debtSheetOverlay').addEventListener('click', e=>{
    if(e.target.id==='debtSheetOverlay') closeDebtSheet();
  }, { once:true });
  bindTimerClick();

  // Keep the active chip in view on first open/render unless suppressed (e.g., from selection)
  if(!suppressInitialChipScroll){
    scrollActiveChipIntoView();
  }
}

function debtSheetKeyHandler(e){
  if(document.getElementById('debtSheetOverlay')?.style.display!=='flex') return;
  if(e.key==='ArrowLeft') navigateDebtPlayer(-1);
  else if(e.key==='ArrowRight') navigateDebtPlayer(1);
  else if(e.key==='Escape'){
    const sheet=document.getElementById('debtSheet');
    if(sheet && sheet.querySelector('.debt-cat-thumb.show-trash')){
      hideAllTrashOverlays();
    } else {
      closeDebtSheet();
    }
  }
}

function navigateDebtPlayer(offset){
  if(players.length<=2 || openDebtPlayerIndex==null) return;
  const others=players.map((_,i)=>i).filter(i=>i!==currentPlayerIndex);
  const pos=others.indexOf(openDebtPlayerIndex);
  if(pos===-1) return;
  openDebtPlayerIndex = others[(pos+offset+others.length)%others.length];
  const sheet=document.getElementById('debtSheet');
  if(sheet){
    sheet.innerHTML=renderDebtSheet(openDebtPlayerIndex);
    attachDebtSheetEvents(openDebtPlayerIndex);
    updateTimerDisplays();
    refreshOverviewOnly();
    scrollActiveChipIntoView();
  }
}

/* Inline clear debts popup */
function openInlineClearDebts(a,b){
  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  sheet.querySelector('.debt-inline-confirm-backdrop')?.remove();

  const backdrop=document.createElement('div');
  backdrop.className='debt-inline-confirm-backdrop';
  backdrop.setAttribute('role','dialog');
  backdrop.setAttribute('aria-modal','true');

  const nameA=players[a]?.name||'Player A';
  const nameB=players[b]?.name||'Player B';

  backdrop.innerHTML=`
    <div class="debt-inline-confirm" tabindex="-1">
      <h4>Clear Debts</h4>
      <p>Select what you would like to clear between <span style="color:var(--color-accent);">${nameA}</span> and <span style="color:var(--color-accent);">${nameB}</span>.</p>
      <div class="confirm-btns">
        <button type="button" class="styled-btn" data-action="both">Clear ALL Debts (Both Directions)</button>
        <button type="button" class="donation-btn danger" style="background:#5a2525;" data-action="a-b">${nameA} Owes ${nameB}</button>
        <button type="button" class="donation-btn danger" style="background:#1f5e30;border:2px solid #2f7d46;color:#e9ffe9;" data-action="b-a">${nameB} Owes ${nameA}</button>
        <button type="button" class="btn-neutral styled-btn" data-action="cancel">Cancel</button>
      </div>
    </div>`;

  sheet.appendChild(backdrop);

  const focusTarget=backdrop.querySelector('.debt-inline-confirm');
  if(focusTarget) focusTarget.focus();

  function close(){ backdrop.remove(); }

  backdrop.addEventListener('click',e=>{
    if(e.target===backdrop) close();
  });

  backdrop.querySelectorAll('button[data-action]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const action=btn.dataset.action;
      if(action==='both'){
        clearAllDebtsBetween(a,b);
        rebuildDebtSheet(b);
      } else if(action==='a-b'){
        clearDirectional(a,b,'a-b');
        rebuildDebtSheet(b);
      } else if(action==='b-a'){
        clearDirectional(a,b,'b-a');
        rebuildDebtSheet(b);
      }
      if(action!=='cancel') refreshOverviewOnly();
      close();
    });
  });

  const escHandler=(ev)=>{
    if(ev.key==='Escape'){ close(); window.removeEventListener('keydown',escHandler); }
  };
  window.addEventListener('keydown',escHandler);
}

function openClearDebtsOptions(a,b){
  openInlineClearDebts(a,b);
}

function rebuildDebtSheet(otherIdx){
  const sheet=document.getElementById('debtSheet');
  if(sheet){
    sheet.innerHTML=renderDebtSheet(otherIdx);
    attachDebtSheetEvents(otherIdx);
    updateTimerDisplays();
    refreshOverviewOnly();
    scrollActiveChipIntoView();
  }
}

/* ---------- Timer ---------- */
function bindTimerClick(){
  setTimeout(()=>{
    const t=document.querySelector('.player-card.active #playerTimer');
    if(t) t.onclick=handleTimerClick;
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

/* ---------- Endgame & Outstanding Debts ---------- */
function showEndgame(){
  commitActivePlayerTurn();
  const data=collectOutstandingDebtors();
  if(data.debtors.length===0){
    customPopup("Did the bank run out of money? Proceed to file taxes.",p=>{ if(p) loadEndgame(); },false,"Yes","No");
  } else {
    showOutstandingDebtsPopup(data);
  }
}
function collectOutstandingDebtors(){
  const map=new Map();
  for(let a=0;a<players.length;a++){
    for(let b=0;b<players.length;b++){
      if(a===b) continue;
      let total=0; const cats=[];
      debtCategories.forEach(cat=>{
        const amt=debts[a][b][cat]||0;
        if(amt>0){ total+=amt; cats.push({cat,amt}); }
      });
      if(total>0){
        if(!map.has(a)) map.set(a,{debtorIndex:a,totalOwed:0,details:[]});
        const entry=map.get(a);
        entry.totalOwed+=total;
        entry.details.push({payeeIndex:b,total,categories:cats});
      }
    }
  }
  return { debtors:[...map.values()] };
}
function showOutstandingDebtsPopup(data){
  ensurePopupElements();
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const btns=document.getElementById('customPopupButtons');
  const instruction=`<p style="font-size:1rem; line-height:1.3; margin:0 0 .75rem;">Did the bank run out of money? Before filing taxes, settle these outstanding debts. Check all boxes to continue.</p>`;
  const blocks=data.debtors.map(d=>{
    const debtor=players[d.debtorIndex].name;
    const lines=d.details.map(det=>`<div style="margin-bottom:0.3rem;">→ Owes <span style="color:#d4af7f;">${players[det.payeeIndex].name}</span>: ${det.total}</div>`).join('');
    return `
      <div class="debtor-block" data-debtor="${d.debtorIndex}" tabindex="0" aria-pressed="false">
        <div class="debtor-header">
          <input type="checkbox" class="debtor-checkbox" aria-label="Confirm ${debtor} settled">
          <span>${debtor} (Total Owed: ${d.totalOwed})</span>
        </div>
        <div class="debtor-debts">${lines}</div>
        <div class="debtor-select-hint">Tap or check to confirm</div>
      </div>`;
  }).join('');
  msg.innerHTML=`
    <h2 class="lilita" style="color:var(--color-accent);margin:0 0 .55rem;">Outstanding Debts</h2>
    ${instruction}
    <div class="outstanding-wrapper">${blocks}</div>`;
  btns.innerHTML=`
    <button type="button" id="outstandingProceedBtn" class="styled-btn" disabled>Proceed to Filing</button>
    <button type="button" id="outstandingCancelBtn" class="btn-neutral styled-btn">Cancel</button>`;
  overlay.style.display='flex';
  const proceed=document.getElementById('outstandingProceedBtn');
  const cancel=document.getElementById('outstandingCancelBtn');
  const debtorBlocks=[...msg.querySelectorAll('.debtor-block')];
  function updateProceed(){ proceed.disabled = !debtorBlocks.every(el=>el.querySelector('.debtor-checkbox')?.checked); }
  function toggle(el){
    const cb=el.querySelector('.debtor-checkbox');
    cb.checked=!cb.checked;
    el.classList.toggle('selected',cb.checked);
    el.setAttribute('aria-pressed',cb.checked?'true':'false');
    updateProceed();
  }
  debtorBlocks.forEach(el=>{
    const cb=el.querySelector('.debtor-checkbox');
    el.addEventListener('click',e=>{
      if(e.target===cb){ el.classList.toggle('selected',cb.checked); }
      else toggle(el);
      updateProceed();
    });
    el.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(el); }
    });
  });
  updateProceed();
  proceed.onclick=()=>{ overlay.style.display='none'; loadEndgame(); };
  cancel.onclick=()=>{ overlay.style.display='none'; };
}

/* ---------- Endgame Input Cap Helpers (DEBOUNCED) ---------- */
function getPropertyCap(){
  return (players.length + 1) + players.length; // 2n + 1
}

/* Timers for debounce clamping */
let coinsClampTimers = [];
let propsClampTimers = [];
const CLAMP_DELAY = 800; // ms after last keystroke

function clampCoins(index){
  const changed = document.getElementById(`coins_${index}`);
  if(!changed) return;
  let raw = changed.value.trim();
  if(raw===''){ return; } // allow empty until blur
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
  if(remaining<=0){
    val=0;
  } else if(val>remaining){
    val=remaining;
  }
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

/* Helper to resolve a player's index reliably after sorting/cloning */
function resolvePlayerIndex(p){
  const idx = players.indexOf(p);
  if(idx !== -1) return idx;
  return players.findIndex(pp => pp && p && pp.name === p.name);
}

function loadEndgame(){
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=false;
  coinsClampTimers=[]; propsClampTimers=[];
  const cards=players.map((p,i)=>`
    <div class="endgame-card" style="background:#303030;border:2px solid #3a3a3a;border-radius:14px;padding:0.85rem 0.7rem;min-width:240px;">
      <div class="final-result-card-inner">
        <div class="final-result-name player-name" style="margin-bottom:0.55rem;">${p.name}</div>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="coins_${i}" placeholder="Haggleoffs" aria-label="${p.name} Haggleoffs">
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="props_${i}" placeholder="Properties (min 1)" aria-label="${p.name} Properties">
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

function getTaxBracketMessage(coins,props){
  if(coins<=6 && props>3) return "Broke on paper, rich in acres.";
  if(coins<=6) return "Enjoy tax-free poverty.";
  if(coins<=14) return "The poor get crushed.";
  if(coins<=24) return "The middle class gets squeezed.";
  if(coins<=39) return "The rich barely feel it.";
  return "Wealth scales, burden doesn’t.";
}
function getAuditRiskLevel(p){
  const breaks=(p.streaks||0)+(p.powerCards||0);
  const income=p.coins||1;
  const ratio=breaks/income;
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

    // Haggleoff Minimum Tax (HMT)
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
        ? `<div class="fr2-ribbon landlord"><span class="emoji">🏆</span><span>${winners[0].name} Landlord</span></div>`
        : `<div class="fr2-ribbon"><span class="emoji">🏆</span><span>${winners[0].name} Wins!</span></div>`)
    : `<div class="fr2-ribbon co"><span class="emoji">🏆</span><span>${winners.map(w=>w.name).join(', ')} Shareholders</span></div>`;

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

    const winnerClass = isWinner
      ? (landlordMode ? 'landlord' : 'winner')
      : '';

    const badgeLabel = isWinner
      ? (landlordMode ? 'LANDLORD' : (tie ? 'SHAREHOLDER' : 'WINNER'))
      : '';

    const idxForMore = resolvePlayerIndex(p);

    cards+=`
      <div class="fr2-card ${winnerClass}">
        ${isWinner?`<div class="fr2-badge">${badgeLabel}</div>`:''}
        <div class="fr2-name">${p.name}</div>

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
  if(document.getElementById('debtSheetOverlay')?.style.display==='flex') closeDebtSheet();

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
      <h3 class="final-detail-sheet-title lilita" style="margin:.6rem 0 .2rem;font-size:1.25rem;">${p.name} – Detailed Filing</h3>
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

/* ---------- Exit & reset ---------- */
function exitToSetup(){
  lastPlayerNames=players.map(p=>p.name);
  players=[]; debts=[]; disallowedNormalCards=[];
  currentPlayerIndex=0;
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=true; timeLeft=60;
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

/* ---------- Add Player helper (with max cap & grey-out) ---------- */
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

/* ---------- Global helper ---------- */
window.dismissDisclaimer=function(){
  document.getElementById('disclaimerOverlay').style.display='none';
  document.getElementById('playerSetupBox').style.display='block';
  ensurePopupElements();
  ensureSheetElements();
  updateAddPlayerButtonAppearance();
};