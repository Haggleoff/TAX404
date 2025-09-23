/************************************************************
 * TAX404
 * Notes (recent updates relevant to badge issue):
 * - Tax Breaks badge resized to match timer area
 * - Circular text now uses textLength to prevent truncation
 * - Badge ring no longer re-renders on each adjustment (avoids rotation reset)
 * - Full phrase: "TAX BREAKS EARNED TAX BREAKS EARNED" (period removed)
 ************************************************************/

let players = [];
let currentPlayerIndex = 0;

let timerInterval = null;
let timeLeft = 60;
let timerRunningState = true;

let disallowedNormalCards = [];
let lastPlayerNames = [];

const debtCategories = [
  "Haggie","Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles",
  "Mav","Clauseby","Buckley","Bugsy","Wiggy","Squeak","Beebo","Wally","Tillie","Moozy"
];

const debtCategoryGroups = {
  "Money": ["Haggie"],
  "Power Cards": ["Stomp&Bray","Lawffy","Finnley","Hoobert","Droolski","Vinnie","Twiggles"],
  "Normal Cards": ["Mav","Clauseby","Buckley","Bugsy","Wiggy","Squeak","Beebo","Wally","Tillie","Moozy"]
};

/* debts[payer][payee][cat] */
let debts = [];

let normalDonated=0, powerDonated=0, tempProgress=0;
let suppressScrollSelect = false;
let pendingAdvance = null;

/* Utility helpers */
function getImageName(name){
  return `Characters/${name.toLowerCase().replace(/&/g,"-").replace(/ /g,"-")}.png`;
}
function sumYouOwe(a,b){
  return debtCategories.reduce((s,c)=>s+(debts[a][b][c]||0),0);
}
function sumTheyOwe(a,b){
  return debtCategories.reduce((s,c)=>s+(debts[b][a][c]||0),0);
}
function aggregateTotals(idx){
  let owe=0, collect=0;
  for(let i=0;i<players.length;i++){
    if(i===idx) continue;
    owe += sumYouOwe(idx,i);
    collect += sumTheyOwe(idx,i);
  }
  return { owe, collect, net: collect - owe };
}
function normalizeCategory(a,b,cat){
  const you=debts[a][b][cat]||0;
  const they=debts[b][a][cat]||0;
  if(you>0 && they>0){
    if(you===they){
      debts[a][b][cat]=0; debts[b][a][cat]=0;
    } else if(you>they){
      debts[a][b][cat]=you-they; debts[b][a][cat]=0;
    } else {
      debts[b][a][cat]=they-you; debts[a][b][cat]=0;
    }
  }
}
function normalizePair(a,b){ debtCategories.forEach(cat=>normalizeCategory(a,b,cat)); }
function clearCat(a,b,cat){ debts[a][b][cat]=0; debts[b][a][cat]=0; }
function categoryPlus(a,b,cat){
  let you=debts[a][b][cat]||0;
  let they=debts[b][a][cat]||0;
  if(you>0){
    you--; if(you===0) clearCat(a,b,cat); else { debts[a][b][cat]=you; debts[b][a][cat]=0; }
  } else {
    they++; debts[b][a][cat]=they; debts[a][b][cat]=0;
  }
  normalizeCategory(a,b,cat);
}
function categoryMinus(a,b,cat){
  let you=debts[a][b][cat]||0;
  let they=debts[b][a][cat]||0;
  if(they>0){
    they--; if(they===0) clearCat(a,b,cat); else { debts[b][a][cat]=they; debts[a][b][cat]=0; }
  } else {
    you++; debts[a][b][cat]=you; debts[b][a][cat]=0;
  }
  normalizeCategory(a,b,cat);
}
function clearAllDebtsBetween(a,b){
  debtCategories.forEach(cat=>{
    debts[a][b][cat]=0;
    debts[b][a][cat]=0;
  });
}

/* Player Cards */
function resetDonationState(){
  normalDonated=0; powerDonated=0;
  tempProgress = players[currentPlayerIndex]? players[currentPlayerIndex].progress:0;
}
function renderCardProgress(p){
  return `<div class="player-card-progress-bar">${
    p>0? Array(p).fill('<div class="donate-block"></div>').join(''):''
  }</div>`;
}

function showPlayerCards(){
  resetDonationState();
  let html='';
  for(let i=0;i<players.length;i++){
    const p=players[i];
    const { owe, collect } = aggregateTotals(i);
    html+=`
      <div class="player-card${i===currentPlayerIndex?' active':''}" data-index="${i}">
        <div class="player-card-inner">
          <div class="player-card-name">${p.name}</div>
          <div class="player-card-timer" id="playerTimer" ${i===currentPlayerIndex?'style="cursor:pointer;"':''}>
            ${i===currentPlayerIndex? timeLeft : ''}
          </div>
          <div class="player-card-progress">${renderCardProgress(p.progress)}</div>
          <div class="player-card-breaks">
            <span>Tax Breaks Earned</span>
            <span class="breaks-badge player-card-breaks-num">${p.streaks + p.powerCards}</span>
          </div>
            <div class="player-card-debts">
            <span>Debt Owed: <span style="color:#dc143c;font-weight:bold;">${owe}</span></span>
            <span>Collect Debt: <span style="color:#19a43c;font-weight:bold;">${collect}</span></span>
          </div>
          ${i===currentPlayerIndex?'<div class="player-card-hint">Select</div>':''}
        </div>
      </div>`;
  }
  document.getElementById('mainGameContainer').innerHTML=`
    <div class="player-cards-scroll-container">
      <div class="player-cards-row" id="playerCardsRow">${html}</div>
    </div>
    <div style="text-align:center;margin:2rem auto 0;">
      <button id="endgameTaxesBtn" class="styled-btn" onclick="showEndgame()">Endgame Taxes</button>
    </div>`;

  setPlayerRowEdgePadding();
  const row = document.getElementById('playerCardsRow');

  if(pendingAdvance && row){
    const fromIdx = pendingAdvance.from;
    const toIdx = pendingAdvance.to;
    const fromCard = row.querySelector(`.player-card[data-index="${fromIdx}"]`);
    const toCard = row.querySelector(`.player-card[data-index="${toIdx}"]`);
    if(fromCard && toCard && fromIdx !== toIdx){
      const rr=row.getBoundingClientRect();
      const fr=fromCard.getBoundingClientRect();
      const desiredFromLeft = row.scrollLeft + (fr.left+fr.width/2) - (rr.left+rr.width/2);
      const prevBehavior=row.style.scrollBehavior;
      row.style.scrollBehavior='auto';
      row.scrollLeft = desiredFromLeft;
      requestAnimationFrame(()=>{
        const tr=toCard.getBoundingClientRect();
        const desiredToLeft = row.scrollLeft + (tr.left+tr.width/2) - (rr.left+rr.width/2);
        row.style.scrollBehavior='smooth';
        row.scrollTo({ left: desiredToLeft });
        setTimeout(()=>{ row.style.scrollBehavior=prevBehavior; },500);
      });
    } else {
      scrollToActiveCard();
    }
  } else {
    scrollToActiveCard();
  }

  setupCardScrollSync();
  setupPlayerCardClicks();
  bindTimerClick();
  if(timerInterval) clearInterval(timerInterval);
  timeLeft=60; timerRunningState=true;
  startTimer();
  updateTimerDisplays();
  pendingAdvance = null;
}

/* Debt Overview */
function buildDebtOverview(){
  if(players.length<2) return "";
  const { owe, collect } = aggregateTotals(currentPlayerIndex);
  let minis='';
  for(let i=0;i<players.length;i++){
    if(i===currentPlayerIndex) continue;
    minis+=`
      <div class="debt-mini-player" data-player="${i}">
        <div class="dmp-name">${players[i].name}</div>
        <div class="dmp-line">
          <span class="dmp-owe-val">Owe:${sumYouOwe(currentPlayerIndex,i)}</span>
          <span class="dmp-collect-val">Collect:${sumTheyOwe(currentPlayerIndex,i)}</span>
        </div>
        <div class="dmp-hint">Tap to adjust</div>
      </div>`;
  }
  return `
    <div class="debt-summary-bar">
      <span class="ds-owe">You Owe: ${owe}</span>
      <span class="ds-collect">You Collect: ${collect}</span>
    </div>
    <div class="debt-other-players-row" id="debtOtherPlayersRow">${minis}</div>`;
}
let openDebtPlayerIndex=null;
function attachMiniDebtHandlers(){
  const row=document.getElementById('debtOtherPlayersRow');
  if(!row) return;
  row.querySelectorAll('.debt-mini-player').forEach(el=>{
    el.addEventListener('click',()=>{
      const idx=parseInt(el.getAttribute('data-player'));
      openDebtSheet(idx);
    });
  });
}
function openDebtSheet(otherIdx){
  normalizePair(currentPlayerIndex,otherIdx);
  openDebtPlayerIndex=otherIdx;
  const overlay=document.getElementById('debtSheetOverlay');
  const sheet=document.getElementById('debtSheet');
  sheet.innerHTML=renderDebtSheet(otherIdx);
  overlay.style.display='flex';
  document.body.classList.add('modal-open');
  requestAnimationFrame(()=>sheet.classList.add('open'));
  attachDebtSheetEvents(otherIdx);
  highlightMini(otherIdx);
  updateTimerDisplays();
  bindTimerClick();
}
function closeDebtSheet(){
  const overlay=document.getElementById('debtSheetOverlay');
  const sheet=document.getElementById('debtSheet');
  sheet.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(()=>{ overlay.style.display='none'; sheet.innerHTML=''; },380);
  openDebtPlayerIndex=null;
  refreshOverviewOnly();
}
function highlightMini(idx){
  document.querySelectorAll('.debt-mini-player').forEach(el=>{
    el.classList.toggle('active', parseInt(el.getAttribute('data-player'))===idx);
  });
}
function renderDebtSheet(otherIdx){
  const a=currentPlayerIndex, b=otherIdx;
  const youOwe=sumYouOwe(a,b);
  const theyOwe=sumTheyOwe(a,b);

  let groups='';
  Object.entries(debtCategoryGroups).forEach(([groupName,cats])=>{
    let rows='';
    cats.forEach(cat=>{
      normalizeCategory(a,b,cat);
      const you=debts[a][b][cat]||0;
      const they=debts[b][a][cat]||0;
      const dirLabel = you>0
        ? '<span style="color:#dc143c;">Owe</span>'
        : they>0
          ? '<span style="color:#19a43c;">Collect</span>'
          : '<span style="color:#777;">None</span>';
      rows+=`
        <div class="debt-category-row" data-cat="${cat}">
          <img class="debt-cat-icon" src="${getImageName(cat)}" alt="${cat}">
            <div class="debt-cat-info">
              <div class="debt-cat-name">${cat}</div>
              <div class="debt-cat-stats">
                <span data-dir="${cat}" class="pill pill-status">${dirLabel}</span>
                <span data-amt="${cat}" class="pill pill-amt">${you>0? you : they>0? they : 0}</span>
              </div>
            </div>
          <div class="debt-cat-adjust">
            <button class="debt-adjust-small-btn minus" data-action="minus" data-cat="${cat}">&minus;</button>
            <button class="debt-adjust-small-btn" data-action="plus" data-cat="${cat}">&plus;</button>
          </div>
        </div>`;
    });
    groups+=`
      <div class="debt-group-block">
        <div class="debt-group-header">
          <h4>${groupName}</h4>
          <button class="debt-group-toggle" data-group="${groupName}" aria-expanded="true">Hide</button>
        </div>
        <div class="debt-category-list" data-group-list="${groupName}" style="max-height:999px;opacity:1;">
          ${rows}
        </div>
      </div>`;
  });

  const navNeeded = players.length>2;

  return `
    <div class="debt-sheet-header">
      <div class="debt-sheet-grip"></div>
      <div id="debtSheetTimerWrapper"><span id="debtSheetTimerDisplay" class="player-card-timer">${timeLeft}</span></div>
      <h3 class="debt-sheet-title lilita" style="font-size:1.1rem;color:#d9d9d9;">Outstanding Debts</h3>
    </div>
    <div class="debt-cat-groups">${groups}</div>
    <div class="debt-pair-bottom-summary" id="debtPairSummaryBottom">
      <div class="debt-pair-nav">
        <button class="debt-pair-nav-btn" id="debtPairPrevBtn" ${navNeeded?'':'disabled'} aria-label="Previous Player">&#8249;</button>
        <div class="debt-pair-title" data-pair-title>
          <span class="active-player">${players[a].name}</span> ↔ <span class="other-player">${players[b].name}</span>
        </div>
        <button class="debt-pair-nav-btn" id="debtPairNextBtn" ${navNeeded?'':'disabled'} aria-label="Next Player">&#8250;</button>
      </div>
      <div class="debt-sheet-netline" data-pair-status style="font-size:1rem;">
        You Owe <span style="color:#dc143c;">${youOwe}</span> | They Owe You <span style="color:#19a43c;">${theyOwe}</span>
      </div>
    </div>
    <div class="debt-sheet-footer">
      <button class="debt-footer-btn danger" id="clearAllPairBtn">Clear All</button>
      <button class="debt-footer-btn primary" id="closeSheetBtn">Done</button>
    </div>
  `;
}
function attachDebtSheetEvents(otherIdx){
  const a=currentPlayerIndex;
  const sheet=document.getElementById('debtSheet');
  if(!sheet) return;
  sheet.querySelector('#closeSheetBtn').onclick=closeDebtSheet;
  sheet.querySelector('#clearAllPairBtn').onclick=()=>{
    openClearDebtsOptions(a,otherIdx);
  };
  sheet.querySelectorAll('.debt-group-toggle').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const g=btn.getAttribute('data-group');
      const list=sheet.querySelector(`[data-group-list="${g}"]`);
      if(!list)return;
      const exp=btn.getAttribute('aria-expanded')==='true';
      if(exp){
        list.style.maxHeight='0px'; list.style.opacity='0';
        btn.setAttribute('aria-expanded','false'); btn.textContent='Show';
      } else {
        list.style.maxHeight='999px'; list.style.opacity='1';
        btn.setAttribute('aria-expanded','true'); btn.textContent='Hide';
      }
    });
  });
  sheet.querySelectorAll('.debt-adjust-small-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const cat=btn.getAttribute('data-cat');
      const action=btn.getAttribute('data-action');
      if(action==='plus') categoryPlus(a,otherIdx,cat);
      else categoryMinus(a,otherIdx,cat);
      refreshCategoryRow(cat);
      updatePairHeader(a,otherIdx);
      refreshOverviewOnly();
    });
  });

  const prevBtn=document.getElementById('debtPairPrevBtn');
  const nextBtn=document.getElementById('debtPairNextBtn');
  if(prevBtn) prevBtn.onclick=()=>navigateDebtPlayer(-1);
  if(nextBtn) nextBtn.onclick=()=>navigateDebtPlayer(1);

  // Swipe navigation
  let startX=0, startY=0, active=false;
  const start = (x,y)=>{ startX=x; startY=y; active=true; };
  const end = (x,y)=>{
    if(!active) return;
    const dx=x-startX, dy=y-startY;
    active=false;
    if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)){
      if(dx<0) navigateDebtPlayer(1);
      else navigateDebtPlayer(-1);
    }
  };
  sheet.addEventListener('touchstart',e=>{ if(e.touches.length===1) start(e.touches[0].clientX,e.touches[0].clientY); },{passive:true});
  sheet.addEventListener('touchend',e=>{ if(e.changedTouches.length===1) end(e.changedTouches[0].clientX,e.changedTouches[0].clientY); },{passive:true});
  sheet.addEventListener('pointerdown',e=>{ if(e.isPrimary) start(e.clientX,e.clientY); });
  sheet.addEventListener('pointerup',e=>{ if(e.isPrimary) end(e.clientX,e.clientY); });

  window.addEventListener('keydown', debtSheetKeyHandler);

  document.getElementById('debtSheetOverlay').addEventListener('click', e=>{
    if(e.target.id==='debtSheetOverlay') closeDebtSheet();
  }, { once:true });

  bindTimerClick();
}
function debtSheetKeyHandler(e){
  if(!document.getElementById('debtSheetOverlay')?.style.display || document.getElementById('debtSheetOverlay').style.display==='none') return;
  if(e.key==='ArrowLeft') { navigateDebtPlayer(-1); }
  else if(e.key==='ArrowRight') { navigateDebtPlayer(1); }
}
function navigateDebtPlayer(offset){
  if(players.length<=2) return;
  if(openDebtPlayerIndex==null) return;
  const others = players.map((_,i)=>i).filter(i=>i!==currentPlayerIndex);
  const currentPos = others.indexOf(openDebtPlayerIndex);
  if(currentPos===-1) return;
  const newPos = (currentPos + offset + others.length) % others.length;
  const newOther = others[newPos];
  openDebtPlayerIndex = newOther;
  const sheet=document.getElementById('debtSheet');
  if(sheet){
    sheet.innerHTML = renderDebtSheet(newOther);
    attachDebtSheetEvents(newOther);
    highlightMini(newOther);
    updateTimerDisplays();
  }
}
function openClearDebtsOptions(a,b){
  ensurePopupElements();
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const btnBox=document.getElementById('customPopupButtons');
  if(!overlay||!msg||!btnBox) return;
  overlay.style.zIndex='2100';
  msg.innerHTML=`
    <h2 class="lilita" style="color:var(--color-accent); margin:0 0 .55rem;">Clear Debts</h2>
    <p style="font-size:1rem;line-height:1.35;margin:0 0 .8rem;">
      Choose what to clear between <span class="player-name" style="color:var(--color-accent);">${players[a].name}</span> and
      <span class="player-name" style="color:var(--color-accent);">${players[b].name}</span>.
    </p>
  `;
  btnBox.innerHTML=`
    <button class="styled-btn" id="clearYouOweBtn" style="flex:1 1 220px;min-width:180px;">Clear What You Owe</button>
    <button class="styled-btn" id="clearTheyOweBtn" style="flex:1 1 220px;min-width:180px;">Clear What They Owe You</button>
    <button class="btn-danger styled-btn" id="clearBothSidesBtn" style="flex:1 1 220px;min-width:180px;">Clear Both Sides</button>
    <button class="btn-neutral styled-btn" id="cancelClearBtn" style="flex:1 1 220px;min-width:180px;">Cancel</button>
  `;
  overlay.style.display='flex';

  function closePopup(){
    overlay.style.display='none';
    overlay.style.zIndex='1200';
  }
  document.getElementById('clearYouOweBtn').onclick=()=>{
    debtCategories.forEach(cat=>debts[a][b][cat]=0);
    normalizePair(a,b); refreshAllCategoryRows(); updatePairHeader(a,b); refreshOverviewOnly(); closePopup();
  };
  document.getElementById('clearTheyOweBtn').onclick=()=>{
    debtCategories.forEach(cat=>debts[b][a][cat]=0);
    normalizePair(a,b); refreshAllCategoryRows(); updatePairHeader(a,b); refreshOverviewOnly(); closePopup();
  };
  document.getElementById('clearBothSidesBtn').onclick=()=>{
    clearAllDebtsBetween(a,b);
    refreshAllCategoryRows(); updatePairHeader(a,b); refreshOverviewOnly(); closePopup();
  };
  document.getElementById('cancelClearBtn').onclick=closePopup;
}

function refreshCategoryRow(cat){
  if(openDebtPlayerIndex==null) return;
  const a=currentPlayerIndex, b=openDebtPlayerIndex;
  normalizeCategory(a,b,cat);
  const you=debts[a][b][cat]||0;
  const they=debts[b][a][cat]||0;
  const dirSpan=document.querySelector(`[data-dir="${cat}"]`);
  const amtSpan=document.querySelector(`[data-amt="${cat}"]`);
  if(dirSpan){
    let lab;
    if(you>0) lab='<span style="color:#dc143c;">Owe</span>';
    else if(they>0) lab='<span style="color:#19a43c;">Collect</span>';
    else lab='<span style="color:#777;">None</span>';
    dirSpan.innerHTML=lab;
    dirSpan.classList.remove('value-pulse-red','value-pulse-green');
    void dirSpan.offsetWidth;
    if(you>0) dirSpan.classList.add('value-pulse-red');
    else if(they>0) dirSpan.classList.add('value-pulse-green');
  }
  if(amtSpan){
    amtSpan.textContent=`${you>0? you : they>0? they : 0}`;
    amtSpan.classList.remove('value-pulse-red','value-pulse-green');
    void amtSpan.offsetWidth;
    if(you>0) amtSpan.classList.add('value-pulse-red');
    else if(they>0) amtSpan.classList.add('value-pulse-green');
  }
}
function refreshAllCategoryRows(){
  if(openDebtPlayerIndex==null) return;
  debtCategories.forEach(cat=>refreshCategoryRow(cat));
}
function updatePairHeader(a,b){
  const youOwe=sumYouOwe(a,b);
  const theyOwe=sumTheyOwe(a,b);
  const status=document.querySelector('[data-pair-status]');
  if(status){
    status.innerHTML=`You Owe <span style="color:#dc143c;">${youOwe}</span> | They Owe You <span style="color:#19a43c;">${theyOwe}</span>`;
  }
  const titleEl=document.querySelector('[data-pair-title]');
  if(titleEl){
    titleEl.innerHTML = `<span class="active-player">${players[a].name}</span> ↔ <span class="other-player">${players[b].name}</span>`;
  }
}
function refreshOverviewOnly(){
  const container=document.getElementById('mainGameContainer');
  if(!container)return;
  const summary=container.querySelector('.debt-summary-bar');
  const row=container.querySelector('#debtOtherPlayersRow');
  if(!summary||!row) return;
  const { owe, collect } = aggregateTotals(currentPlayerIndex);
  summary.innerHTML=`
    <span class="ds-owe">You Owe: ${owe}</span>
    <span class="ds-collect">You Collect: ${collect}</span>`;
  let minis='';
  for(let i=0;i<players.length;i++){
    if(i===currentPlayerIndex) continue;
    minis+=`
      <div class="debt-mini-player${openDebtPlayerIndex===i?' active':''}" data-player="${i}">
        <div class="dmp-name">${players[i].name}</div>
        <div class="dmp-line">
          <span class="dmp-owe-val">Owe:${sumYouOwe(currentPlayerIndex,i)}</span>
          <span class="dmp-collect-val">Collect:${sumTheyOwe(currentPlayerIndex,i)}</span>
        </div>
        <div class="dmp-hint">Tap to adjust</div>
      </div>`;
  }
  row.innerHTML=minis;
  attachMiniDebtHandlers();
}

/* Donations */
function donateAction(i){ if(i===currentPlayerIndex) loadCalculator(); }

function loadCalculator(){
  let calculatorInitialized = false;
  let previousBreaksPreview = null;

  function buildTaxBreaksBadge(breaksPreview){
    /* Path radius 40 => circumference ~251 — we set textLength to 251 so full phrase fits */
    return `
      <div class="tax-breaks-badge" id="taxBreaksBadge" aria-label="Tax Breaks Earned">
        <svg viewBox="0 0 100 100" class="tb-svg" role="img" focusable="false">
          <defs>
            <path id="tbCirclePath" d="M50,10 a40,40 0 1,1 -0.01,0" />
          </defs>
          <text class="tb-text">
            <textPath href="#tbCirclePath" startOffset="50%" textLength="251" lengthAdjust="spacingAndGlyphs">
              TAX BREAKS EARNED TAX BREAKS EARNED
            </textPath>
          </text>
        </svg>
        <div class="tb-value" id="taxBreaksValue">${breaksPreview}</div>
      </div>`;
  }

  function computeDonationVisuals(){
    const p=players[currentPlayerIndex];
    const prev=tempProgress;
    const donated=normalDonated;
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
      else if(i<gold+gray) blocks+='<div class="donate-block" style="background:#d9d9d9; box-shadow:inset 0 0 0 2px #aaa;"></div>';
      else blocks+='<div class="donate-block-empty"></div>';
    }
    const streaksThisTurn=Math.floor(total/5);
    const breaksPreview=p.streaks + p.powerCards + powerDonated + streaksThisTurn;
    return { blocks, breaksPreview, streaksThisTurn };
  }

  function initialRender(){
    const { blocks, breaksPreview } = computeDonationVisuals();
    const p=players[currentPlayerIndex];
    const debtOverview=buildDebtOverview();
    const timerHtml=`<div id="calculatorTimerWrapper"><span id="calculatorTimerDisplay" class="player-card-timer">${timeLeft}</span></div>`;
    const badgeHtml = buildTaxBreaksBadge(breaksPreview);

    let confirmBtns;
    if(normalDonated===0 && powerDonated===0){
      confirmBtns = `
        <button id="confirmDonationBtn" class="donation-btn" data-variant="primary">No Donations</button>
        <button id="tookCharityBtn" class="donation-btn" data-variant="secondary">Took from Charity</button>
      `;
    } else {
      confirmBtns = `<button id="confirmDonationBtn" class="donation-btn" data-variant="primary">Confirm</button>`;
    }

    document.getElementById('mainGameContainer').innerHTML=`
      <div class="calculatorBox" id="donationCalculatorBox">
        ${badgeHtml}
        ${timerHtml}
        <h2 class="player-name" style="margin-top:1.05rem;">${p.name}'s Turn</h2>

        <span class="donate-label">Normal Cards Donated</span>
        <div class="donate-row">
          <button id="minusNormal" class="btn-round alt">-</button>
          <div class="normal-cards-container" id="normalCardsContainer">
            ${blocks}
          </div>
          <button id="plusNormal" class="btn-round">+</button>
        </div>

        <span class="streak-helper">Each streak (5 cards) = 1 Tax Break</span>

        <span class="donate-label" style="margin-top:0.9rem;">Power Cards or Cash Donated</span>
        <div class="donate-row">
          <button id="minusPower" class="btn-round alt">-</button>
          <div class="power-circle-container">
            <div class="power-circle${powerDonated===0?' zero':''}" id="powerCircle">${powerDonated}</div>
          </div>
          <button id="plusPower" class="btn-round">+</button>
        </div>

        ${debtOverview}

        <div class="donation-actions" id="donationActionButtons">
          ${confirmBtns}
        </div>
      </div>`;

    calculatorInitialized = true;
    previousBreaksPreview = breaksPreview;
    bindDonationControls();
    attachMiniDebtHandlers();
    updateTimerDisplays();
    bindTimerClick();
  }

  function bindDonationControls(){
    const minusN=document.getElementById('minusNormal');
    const plusN=document.getElementById('plusNormal');
    const minusP=document.getElementById('minusPower');
    const plusP=document.getElementById('plusPower');
    const confirm=document.getElementById('confirmDonationBtn');
    const charity=document.getElementById('tookCharityBtn');

    if(minusN) minusN.onclick=()=>{ if(normalDonated>0){ normalDonated--; updateDynamic(); } };
    if(plusN) plusN.onclick=()=>{ if(normalDonated+tempProgress<20){ normalDonated++; updateDynamic(); } };
    if(minusP) minusP.onclick=()=>{ if(powerDonated>0){ powerDonated--; updateDynamic(); } };
    if(plusP) plusP.onclick=()=>{ if(powerDonated<20){ powerDonated++; updateDynamic(); } };

    if(confirm) confirm.onclick=()=>{
      if(normalDonated===0 && powerDonated===0) nextPlayer();
      else finalizeDonations(normalDonated,powerDonated);
    };
    if(charity) charity.onclick=()=>tookCharityAction(currentPlayerIndex);
  }

  function updateButtonsState(){
    const minusN=document.getElementById('minusNormal');
    const plusN=document.getElementById('plusNormal');
    const minusP=document.getElementById('minusPower');
    const plusP=document.getElementById('plusPower');
    if(minusN) minusN.disabled = normalDonated===0;
    if(plusN) plusN.disabled = (normalDonated+tempProgress)>=20;
    if(minusP) minusP.disabled = powerDonated===0;
    if(plusP) plusP.disabled = powerDonated>=20;

    const actionBox=document.getElementById('donationActionButtons');
    if(actionBox){
      const existingConfirm=document.getElementById('confirmDonationBtn');
      const existingCharity=document.getElementById('tookCharityBtn');
      if(normalDonated===0 && powerDonated===0){
        if(!existingCharity){
          actionBox.innerHTML=`
            <button id="confirmDonationBtn" class="donation-btn" data-variant="primary">No Donations</button>
            <button id="tookCharityBtn" class="donation-btn" data-variant="secondary">Took from Charity</button>`;
          bindDonationControls();
        }
      } else {
        if(!existingConfirm || existingCharity){
          actionBox.innerHTML=`<button id="confirmDonationBtn" class="donation-btn" data-variant="primary">Confirm</button>`;
          bindDonationControls();
        }
      }
    }
  }

  function updateDynamic(){
    if(!calculatorInitialized){
      initialRender();
      return;
    }
    const { blocks, breaksPreview } = computeDonationVisuals();

    const blocksContainer=document.getElementById('normalCardsContainer');
    if(blocksContainer) blocksContainer.innerHTML=blocks;

    const powerCircle=document.getElementById('powerCircle');
    if(powerCircle){
      powerCircle.textContent=powerDonated;
      powerCircle.classList.toggle('zero', powerDonated===0);
    }

    const badgeValue=document.getElementById('taxBreaksValue');
    const badge=document.getElementById('taxBreaksBadge');
    if(badgeValue){
      const currentVal=parseInt(badgeValue.textContent||'0',10);
      if(breaksPreview>currentVal && badge){
        badge.classList.remove('earned');
        void badge.offsetWidth;
        badge.classList.add('earned');
        setTimeout(()=>badge && badge.classList.remove('earned'), 900);
      }
      badgeValue.textContent=breaksPreview;
    }

    previousBreaksPreview = breaksPreview;
    updateButtonsState();
  }

  initialRender();
  updateButtonsState();
}

function finalizeDonations(n,pw){
  const p=players[currentPlayerIndex];
  const total=p.progress + n;
  const streaks=Math.floor(total/5);
  p.streaks+=streaks;
  p.progress=total%5;
  p.powerCards+=pw;
  nextPlayer();
}
function tookCharityAction(i){
  if(i!==currentPlayerIndex)return;
  if(players[i].progress>0){
    disallowedNormalCards[i]+=players[i].progress;
  }
  players[i].progress=0;
  nextPlayer();
}
function nextPlayer(){
  const from = currentPlayerIndex;
  currentPlayerIndex=(currentPlayerIndex+1)%players.length;
  pendingAdvance = { from, to: currentPlayerIndex };
  showPlayerCards();
}

/* Timer */
function bindTimerClick(){
  setTimeout(()=>{
    const playerCardTimer=document.querySelector('.player-card.active .player-card-timer');
    if(playerCardTimer) playerCardTimer.onclick=handleTimerClick;
    const calc=document.getElementById('calculatorTimerDisplay');
    if(calc) calc.onclick=handleTimerClick;
    const sheetTimer=document.getElementById('debtSheetTimerDisplay');
    if(sheetTimer) sheetTimer.onclick=handleTimerClick;
  },0);
}
function handleTimerClick(){
  if(timeLeft===0){
    timeLeft=60; timerRunningState=true; updateTimerDisplays(); startTimer();
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
  document.querySelectorAll('#playerTimer').forEach((el,i)=> el.textContent = i===currentPlayerIndex? timeLeft : '');
  const calc=document.getElementById('calculatorTimerDisplay');
  if(calc) calc.textContent=timeLeft;
  const sheetTimer=document.getElementById('debtSheetTimerDisplay');
  if(sheetTimer) sheetTimer.textContent=timeLeft;
}

/* Card Interaction / Scroll */
function setPlayerRowEdgePadding(){
  const row = document.getElementById('playerCardsRow');
  if(!row) return;
  const firstCard = row.querySelector('.player-card');
  if(!firstCard) return;
  const cardWidth = firstCard.offsetWidth;
  const rowWidth = row.clientWidth;
  let pad = (rowWidth / 2) - (cardWidth / 2);
  if(pad < 16) pad = 16;
  row.style.paddingLeft = pad + 'px';
  row.style.paddingRight = pad + 'px';
}
function setupPlayerCardClicks(){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow'); if(!row)return;
    const cards=[...row.querySelectorAll('.player-card')];
    cards.forEach((card,i)=>{
      card.onclick=e=>{
        if(i===currentPlayerIndex){
          if(!e.target.closest('.player-card-timer')) loadCalculator();
          return;
        }
        if(e.target.closest('.player-card-timer')) return;
        suppressScrollSelect = true;
        currentPlayerIndex=i;
        resetDonationState();
        if(timerInterval) clearInterval(timerInterval);
        timeLeft=60; timerRunningState=true;
        cards.forEach((c,idx)=>c.classList.toggle('active',idx===i));
        cards.forEach((c,idx)=>{
          const hint=c.querySelector('.player-card-hint');
          if(hint) hint.remove();
          if(idx===currentPlayerIndex){
            const inner=c.querySelector('.player-card-inner');
            if(inner){
              const hintDiv=document.createElement('div');
              hintDiv.className='player-card-hint';
              hintDiv.textContent='Select';
              inner.appendChild(hintDiv);
            }
          }
        });
        scrollToActiveCard(true);
        startTimer();
        updateTimerDisplays();
        bindTimerClick();
        setPlayerRowEdgePadding();
        setTimeout(()=>{ suppressScrollSelect=false; },450);
      };
    });
  },0);
}
function setupCardScrollSync(){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow'); if(!row)return;
    let st=null;
    row.onscroll=function(){
      if(suppressScrollSelect) return;
      const cards=[...row.querySelectorAll('.player-card')];
      if(cards.length===0) return;
      const rr=row.getBoundingClientRect();
      const center=rr.left+rr.width/2;
      let min=Infinity, idx=0;
      cards.forEach((c,i)=>{
        const r=c.getBoundingClientRect();
        const d=Math.abs(center-(r.left+r.width/2));
        if(d<min){min=d;idx=i;}
      });
      if(idx!==currentPlayerIndex){
        currentPlayerIndex=idx;
        resetDonationState();
        if(timerInterval) clearInterval(timerInterval);
        timeLeft=60; timerRunningState=true; startTimer();
        cards.forEach((c,i2)=>{
          c.classList.toggle('active',i2===idx);
          const hint=c.querySelector('.player-card-hint');
          if(hint) hint.remove();
          if(i2===idx){
            const inner=c.querySelector('.player-card-inner');
            if(inner){
              const hintDiv=document.createElement('div');
              hintDiv.className='player-card-hint';
              hintDiv.textContent='Select';
              inner.appendChild(hintDiv);
            }
          }
        });
        updateTimerDisplays();
        bindTimerClick();
      }
      if(st) clearTimeout(st);
      st=setTimeout(()=>scrollToActiveCard(true),180);
    };
  },0);
}
function scrollToActiveCard(instant=false){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow');
    const active=row?row.querySelector('.player-card.active'):null;
    if(active&&row){
      const rr=row.getBoundingClientRect();
      const ar=active.getBoundingClientRect();
      const left=row.scrollLeft + (ar.left+ar.width/2)-(rr.left+rr.width/2);
      if(instant){
        const prevBehavior=row.style.scrollBehavior;
        row.style.scrollBehavior='auto';
        row.scrollTo({left});
        requestAnimationFrame(()=>{ row.style.scrollBehavior=prevBehavior; });
      } else {
        row.scrollTo({left,behavior:'smooth'});
      }
    }
  },0);
}
window.addEventListener('orientationchange', ()=> {
  setTimeout(()=>{
    setPlayerRowEdgePadding();
    scrollToActiveCard(true);
  }, 400);
});
function debounce(fn, wait=120){
  let t;
  return (...args)=>{
    clearTimeout(t);
    t=setTimeout(()=>fn(...args), wait);
  };
}
window.addEventListener('resize', debounce(()=>{
  setPlayerRowEdgePadding();
  scrollToActiveCard(true);
},150));

/* Outstanding Debts Gate */
function showEndgame(){
  const debtData = collectOutstandingDebtors();
  if(debtData.debtors.length===0){
    // New confirmation popup when there are no outstanding debts
    customPopup(
      "Did the bank run out of money? Proceed to file taxes.",
      (proceed)=>{
        if(proceed) loadEndgame();
      },
      false,
      "Yes",
      "No"
    );
  } else {
    showOutstandingDebtsPopup(debtData);
  }
}
function collectOutstandingDebtors(){
  const debtorsMap = new Map();
  for(let a=0;a<players.length;a++){
    for(let b=0;b<players.length;b++){
      if(a===b) continue;
      let total=0;
      const cats=[];
      debtCategories.forEach(cat=>{
        const amt=debts[a][b][cat]||0;
        if(amt>0){
          total+=amt;
          cats.push({cat, amt});
        }
      });
      if(total>0){
        if(!debtorsMap.has(a)){
            debtorsMap.set(a,{ debtorIndex:a, totalOwed:0, details:[] });
        }
        const entry=debtorsMap.get(a);
        entry.totalOwed += total;
        entry.details.push({ payeeIndex:b, total, categories:cats });
      }
    }
  }
  return { debtors:[...debtorsMap.values()] };
}

/* Outstanding Debts Popup (selectable) */
function showOutstandingDebtsPopup(data){
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const btnBox=document.getElementById('customPopupButtons');

  const instruction = `
    <p style="font-size:1rem; line-height:1.35; margin:0 0 0.8rem;">
      Did the bank run out of money? Before filing taxes, check each box to confirm that all outstanding debts have been settled.
    </p>
  `;

  const blocks = data.debtors.map(d=>{
    const debtorName = players[d.debtorIndex].name;
    const lines = d.details.map(det=>{
      const payeeName = players[det.payeeIndex].name;
      return `<div style="margin-bottom:0.35rem;">→ Owes <span class="to">${payeeName}</span>: ${det.total}</div>`;
    }).join('');
    return `
      <div class="debtor-block" data-debtor="${d.debtorIndex}" tabindex="0" role="button" aria-pressed="false">
        <div class="debtor-header">
          <span>${debtorName} (Total Owed: ${d.totalOwed})</span>
        </div>
        <div class="debtor-debts">
          ${lines}
        </div>
        <div class="debtor-select-hint">Tap to select</div>
      </div>
    `;
  }).join('');

  const content = `
    <h2 class="lilita" style="color:var(--color-accent); margin:0 0 0.6rem;">Outstanding Debts</h2>
    ${instruction}
    <div class="outstanding-wrapper">
      ${blocks}
    </div>
  `;
  msg.innerHTML = content;

  btnBox.innerHTML = `
    <button id="outstandingProceedBtn" class="styled-btn" disabled>Proceed to Filing</button>
    <button id="outstandingCancelBtn" class="btn-neutral styled-btn">Cancel</button>
  `;

  overlay.style.display='flex';

  const proceed=document.getElementById('outstandingProceedBtn');
  const cancel=document.getElementById('outstandingCancelBtn');
  const debtorBlocks=[...msg.querySelectorAll('.debtor-block')];

  function updateProceed(){
    const allSelected = debtorBlocks.every(el=>el.classList.contains('selected'));
    proceed.disabled = !allSelected;
  }
  function toggleSelection(el){
    el.classList.toggle('selected');
    const pressed = el.classList.contains('selected');
    el.setAttribute('aria-pressed', pressed?'true':'false');
    updateProceed();
  }
  debtorBlocks.forEach(el=>{
    el.addEventListener('click', ()=>toggleSelection(el));
    el.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' ') { e.preventDefault(); toggleSelection(el); }
    });
  });
  updateProceed();
  proceed.onclick=()=>{ overlay.style.display='none'; loadEndgame(); };
  cancel.onclick=()=>{ overlay.style.display='none'; };
}

/* Endgame & Taxes */
function loadEndgame(){
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=false;
  const blocks=players.map((p,i)=>`
    <div class="endgame-card" style="background:#303030;border:2px solid #3a3a3a;border-radius:14px;padding:0.85rem 0.7rem;min-width:240px;">
      <div class="final-result-card-inner">
        <div class="final-result-name player-name" style="margin-bottom:0.55rem;">${p.name}</div>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <input type="number" id="coins_${i}" min="0" step="1" placeholder="Haggleoffs" style="font-size:1rem;">
          <input type="number" id="props_${i}" min="1" step="1" placeholder="Properties" style="font-size:1rem;">
        </div>
      </div>
    </div>`).join('');
  document.getElementById('mainGameContainer').innerHTML=`
    <div class="calculatorBox">
      <h2 class="lilita" style="margin-top:0;">Endgame</h2>
      <p style="font-size:1rem;margin-top:-0.2rem;">Enter each player’s Haggleoffs and Properties.</p>
      <div style="display:flex;gap:1rem;overflow-x:auto;padding:0.4rem 0.25rem;">${blocks}</div>
      <button class="styled-btn" onclick="calculateFinalTaxes()">Calculate Taxes</button>
      <div id="finalSummary" style="display:none;"></div>
    </div>`;
}
function getTaxBracketMessage(coins,props){
  if(coins<=6 && props>3) return "Broke on paper, rich in acres.";
  if(coins<=6) return "Enjoy tax-free poverty.";
  if(coins<=14) return "The poor get crushed.";
  if(coins<=24) return "The middle class gets squeezed.";
  if(coins<=39) return "The rich barely feel it.";
  return "Wealth scales, burden doesn’t.";
}
function calculateFinalTaxes(){
  const summary=document.getElementById('finalSummary');
  if(!summary){
    console.warn('finalSummary element missing.');
    return;
  }
  summary.style.display='none'; summary.innerHTML='';

  for(let i=0;i<players.length;i++){
    const coinsEl=document.getElementById(`coins_${i}`);
    const propsEl=document.getElementById(`props_${i}`);
    if(!coinsEl||!propsEl){
      customPopup("Internal form error: missing input fields.");
      return;
    }
    const c=coinsEl.value.trim();
    const p=propsEl.value.trim();
    if(!/^\d+$/.test(c)||!/^\d+$/.test(p)){
      customPopup("Use only whole non-negative numbers.");
      return;
    }
  }

  players.forEach((pl,i)=>{
    const coins=+document.getElementById(`coins_${i}`).value.trim();
    const props=+document.getElementById(`props_${i}`).value.trim();
    pl.coins=coins; pl.properties=Math.max(1,props);
    const bracketTax = coins<=6?0: coins<=14?3: coins<=24?5: coins<=39?8:10;
    const propertyTax = coins>6? pl.properties*(pl.properties>=4?2:1) : 0;
    const gross = bracketTax + propertyTax;
    const cap = Math.floor(coins*0.54);
    const base = Math.min(gross, cap);
    const breaks = pl.streaks + pl.powerCards;
    const postBase = Math.max(0, base - breaks);
    pl.tax = Math.min(postBase, coins);
    pl.amtApplied=false; pl.amtPercent='';
    if(pl.tax===0){
      if(coins>=30 && coins<=39){
        pl.tax = Math.floor(coins*0.05);
        pl.amtApplied=true; pl.amtPercent='5%';
      } else if (coins>=40){
        pl.tax = Math.floor(coins*0.10);
        pl.amtApplied=true; pl.amtPercent='10%';
      }
    }
  });

  const netIncomes=players.map(p=>p.coins-p.tax);
  const maxNet=Math.max(...netIncomes);
  const contenders=players.filter(p=>p.coins-p.tax===maxNet);

  let headerRibbon='';
  if(contenders.length===1){
    headerRibbon=`<div class="final-results-ribbon"><span class="emoji">🏆</span><span>${contenders[0].name} Wins!</span></div>`;
  } else {
    headerRibbon=`<div class="final-results-ribbon co"><span class="emoji">🤝</span><span>${contenders.map(c=>c.name).join(', ')} Tie</span></div>`;
  }

  const totalAssets = players.reduce((s,p)=> s + p.coins + p.properties, 0) || 1;
  const sortedIndices=[...players.keys()].sort((a,b)=>{
    const netA=players[a].coins-players[a].tax;
    const netB=players[b].coins-players[b].tax;
    if(netA===netB) return a-b;
    return netB-netA;
  });

  let cards='';
  sortedIndices.forEach(i=>{
    const p=players[i];
    const coins=p.coins;
    const props=p.properties;
    const breaks=p.streaks + p.powerCards;
    const netIncome=coins - p.tax;
    const effRate = coins? Math.round((p.tax/coins)*100):0;
    const isWinner = contenders.includes(p);
    const tie = contenders.length>1;

    const rawShare = ((coins + props) / totalAssets) * 100;
    const barPct = Math.min(100, rawShare);
    const displayPct = Math.round(barPct);

    const badgeSet = `
      <div class="final-card-badges">
        <span class="final-badge">Income <span class="value">${coins}</span></span>
        <span class="final-badge">Props <span class="value">${props}</span></span>
        <span class="final-badge">Rate <span class="value">${effRate}%</span></span>
        <span class="final-badge">Deductions <span class="value">${breaks}</span></span>
      </div>
    `;
    const message=getTaxBracketMessage(coins,props);
    cards+=`
      <div class="final-result-card ${isWinner ? (tie?'co-winner':'winner') : ''}">
        ${isWinner ? `<div class="final-card-winner-banner ${tie?'tie':''}">${tie?'CO-WINNER':'WINNER'}</div>` : ''}
        <div class="final-result-name">${p.name}</div>
        ${badgeSet}
        <div class="rank-bar-wrap">
          <div class="rank-bar-fill ${tie?'tie':''}" style="width:${barPct}%;"></div>
        </div>
        <div class="final-result-stats">
          <div>Tax: <span style="color:#d4af7f;">${p.tax}</span>${p.amtApplied?` <span style="color:#dc143c;font-size:.78rem;background:#3a1d1d;padding:.15rem .45rem;border-radius:6px;letter-spacing:.5px;margin-left:.35rem;">AMT ${p.amtPercent}</span>`:''}</div>
          <div>Net Income: <span style="color:#d4af7f;">${netIncome}</span></div>
          <div>Audit Risk: <span style="color:#d4af7f;">${getAuditRiskLevel(p)}</span></div>
          <em style="color:#d4af7f;font-style:italic;">${message}</em>
        </div>
        <div class="final-result-net">Net Share: ${displayPct}%</div>
        <a href="#" onclick="showTaxBreakdown(${i});return false;" style="color:#f1f1f1;text-decoration:underline;font-style:italic;margin-top:.4rem;text-align:center;display:block;">More Info</a>
      </div>`;
  });

  summary.style.display='block';
  summary.innerHTML=`
    <div class="final-results-wrapper">
      <div style="display:flex;justify-content:center;">${headerRibbon}</div>
      <div class="final-results-grid-scroll">
        <div class="final-results-grid">${cards}</div>
      </div>
      <button onclick="exitToSetup()" class="styled-btn" style="max-width:220px;margin:.4rem auto 0;display:block;">EXIT</button>
    </div>`;
  setTimeout(()=>{
    summary.scrollIntoView({behavior:'smooth'});
    if(typeof confetti==="function"){
      confetti({ particleCount:140, spread:95, origin:{ y:0.18 } });
    }
  },80);
}

/* Detailed breakdown */
function showTaxBreakdown(i){
  const p=players[i];
  const coins=p.coins;
  const props=p.properties;
  const bracketTax = coins<=6?0: coins<=14?3: coins<=24?5: coins<=39?8:10;
  const propertyTax = coins>6? props*(props>=4?2:1):0;
  const gross= bracketTax + propertyTax;
  const cap=Math.floor(coins*0.54);
  const base=Math.min(gross,cap);
  const breaks=p.streaks+p.powerCards;
  const postBase=Math.max(0, base-breaks);
  const amtApplied = p.amtApplied;
  const amtPercent = p.amtPercent;
  const tax=p.tax;
  const avoided=Math.max(0, base-tax);
  const beforeRate=coins? Math.round((base/coins)*100):0;
  const afterRate=coins? Math.round((tax/coins)*100):0;
  const netIncome=coins-tax;

  const overlay=document.getElementById('finalDetailSheetOverlay');
  const sheet=document.getElementById('finalDetailSheet');
  sheet.innerHTML=`
    <div class="final-detail-sheet-header">
      <div class="final-detail-sheet-grip"></div>
      <h3 class="final-detail-sheet-title" id="finalDetailSheetTitle" style="font-size:1.3rem;">${p.name} – Detailed Breakdown</h3>
    </div>
    <div class="final-detail-body">
      <div style="font-size:1rem;line-height:1.32;font-family:'Lilita One';letter-spacing:.4px;">
        <strong>Overview</strong><br>
        Income: ${coins}<br>
        Properties: ${props}<br>
        Tax Breaks (Streaks + Power): ${breaks}<br>
        Progress Remainder: ${p.progress}<br>
        <hr style="border:0;border-top:1px solid #444;margin:.55rem 0;">
        <strong>Computation</strong><br>
        Bracket Tax: ${bracketTax}<br>
        Property Tax: ${propertyTax} ${coins>6?`(${props>=4?'2 each (4+ props)':'1 each'})`:''}<br>
        Gross Tax: ${gross}<br>
        Ceiling (54% Income): ${cap}<br>
        Base Applied: ${base}<br>
        Breaks Applied: ${breaks}<br>
        Tax After Breaks: ${postBase}<br>
        ${amtApplied?`<span style="color:#dc143c;">AMT Applied: ${tax} (${amtPercent})</span><br>`:''}
        Tax Avoided: ${avoided}<br>
        Effective Rate Before: ${beforeRate}% | After: ${afterRate}%<br>
        <span style="color:#d4af7f;">Final Tax Owed: ${tax}</span><br>
        <span style="color:#d4af7f;">Net Income: ${netIncome}</span><br>
        Audit Risk: ${getAuditRiskLevel(p)}<br>
        <em style="color:#d4af7f;">${getTaxBracketMessage(coins,props)}</em>
      </div>
    </div>
    <div class="final-detail-footer">
      <button class="debt-footer-btn primary" id="closeFinalDetailBtn">Close</button>
    </div>`;
  overlay.style.display='flex';
  document.body.classList.add('modal-open');
  requestAnimationFrame(()=> sheet.classList.add('open'));
  overlay.addEventListener('click', e=>{
    if(e.target.id==='finalDetailSheetOverlay') closeFinalDetailSheet();
  }, { once:true });
  document.getElementById('closeFinalDetailBtn').onclick=closeFinalDetailSheet;
}
function closeFinalDetailSheet(){
  const overlay=document.getElementById('finalDetailSheetOverlay');
  const sheet=document.getElementById('finalDetailSheet');
  sheet.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(()=>{ overlay.style.display='none'; sheet.innerHTML=''; },380);
}
function getAuditRiskLevel(p){
  const breaks=p.streaks+p.powerCards;
  const income=p.coins||1;
  const ratio=breaks/income;
  if(ratio>=1) return "Board Review Pending";
  if(ratio>=0.5) return "High";
  if(ratio>=0.3) return "Moderate";
  return "Low";
}

/* Exit & Reset */
function exitToSetup(){
  lastPlayerNames = players.map(p=>p.name);
  players=[]; debts=[]; disallowedNormalCards=[];
  currentPlayerIndex=0;
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=true; timeLeft=60;
  const main=document.getElementById('mainGameContainer');
  if(main){
    main.innerHTML = `
      <div class="exit-screen-wrapper">
        <h2>Thank you for Haggleoffing...</h2>
        <p>Your mediocre filings slipped into the shredder before the Haggie Revenue Service could audit a single page. You’re welcome! Haggleoff again?</p>
        <button id="playAgainBtn" class="styled-btn" style="max-width:240px;">Play Again</button>
      </div>`;
    const btn=document.getElementById('playAgainBtn');
    if(btn) btn.onclick=()=>{ restorePlayerNamesAndSetup(); };
  }
}
function restorePlayerNamesAndSetup(){
  const setupBox=document.getElementById('playerSetupBox');
  const fieldsContainer=document.getElementById('playerInputFields');
  if(!setupBox||!fieldsContainer) return;
  fieldsContainer.innerHTML='';
  const names = lastPlayerNames.length>=2 ? lastPlayerNames : ['Player 1','Player 2'];
  names.forEach((name,idx)=>{
    const input=document.createElement('input');
    input.type='text';
    input.name='playerName';
    input.maxLength=20;
    input.placeholder = `Player ${idx+1}${idx<2?' (required)':''}`;
    input.required = idx<2;
    input.value=name;
    fieldsContainer.appendChild(input);
  });
  if(names.length<2){
    for(let i=names.length;i<2;i++){
      const input=document.createElement('input');
      input.type='text';
      input.name='playerName';
      input.maxLength=20;
      input.placeholder=`Player ${i+1} (required)`;
      input.required=true;
      fieldsContainer.appendChild(input);
    }
  }
  setupBox.style.display='block';
  document.getElementById('mainGameContainer').innerHTML='';
  window.scrollTo({ top:0, behavior:'smooth' });
}
function backToNameInput(){ restorePlayerNamesAndSetup(); }

/* Popup System */
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
          <button id="customPopupYes" class="styled-btn">OK</button>
          <button id="customPopupNo" class="btn-neutral styled-btn">No</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  } else {
    const btnBox=overlay.querySelector('#customPopupButtons');
    if(btnBox){
      if(!btnBox.querySelector('#customPopupYes') || !btnBox.querySelector('#customPopupNo') || btnBox.children.length>2){
        btnBox.innerHTML=`
          <button id="customPopupYes" class="styled-btn">OK</button>
          <button id="customPopupNo" class="btn-neutral styled-btn">No</button>`;
      }
    }
  }
}
function resetStandardPopupButtons(){
  const btnBox=document.getElementById('customPopupButtons');
  if(btnBox){
    btnBox.innerHTML=`
      <button id="customPopupYes" class="styled-btn">OK</button>
      <button id="customPopupNo" class="btn-neutral styled-btn">No</button>`;
  }
}
function customPopup(message, callback, isHtml=false, yesText="Yes", noText="No", okOnly=false){
  ensurePopupElements();
  resetStandardPopupButtons();
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const yesBtn=document.getElementById('customPopupYes');
  const noBtn=document.getElementById('customPopupNo');
  const btnBox=document.getElementById('customPopupButtons');
  if(!msg||!yesBtn||!noBtn||!btnBox){ console.warn('Popup elements missing.'); return; }

  msg.innerHTML=isHtml? message : message.replace(/\n/g,"<br>");
  btnBox.style.display='flex';
  yesBtn.style.display='inline-block';
  overlay.style.display='flex';

  if(typeof callback!=='function'){
    yesBtn.innerText='OK';
    noBtn.style.display='none';
    yesBtn.onclick=()=>overlay.style.display='none';
  } else if(okOnly){
    yesBtn.innerText='OK';
    noBtn.style.display='none';
    yesBtn.onclick=()=>{ overlay.style.display='none'; callback(); };
  } else {
    yesBtn.innerText=yesText;
    noBtn.innerText=noText;
    noBtn.style.display='inline-block';
    yesBtn.onclick=()=>{ overlay.style.display='none'; callback(true); };
    noBtn.onclick=()=>{ overlay.style.display='none'; callback(false); };
  }
}
function customHTMLPopup(message, html, callback){
  ensurePopupElements();
  resetStandardPopupButtons();
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const yesBtn=document.getElementById('customPopupYes');
  const noBtn=document.getElementById('customPopupNo');
  const btnBox=document.getElementById('customPopupButtons');
  if(!msg){ console.warn('Popup message element missing.'); return; }
  msg.innerHTML=`${message}<br>${html}`;
  if(yesBtn) yesBtn.style.display='none';
  if(noBtn) noBtn.style.display='none';
  if(btnBox) btnBox.style.display='none';
  overlay.style.display='flex';
  if(typeof callback==='function') callback();
}

/* Setup Form */
document.getElementById('playerForm').addEventListener('submit', e=>{
  e.preventDefault();
  let names=[...e.target.querySelectorAll("input[name='playerName']")].map(i=>i.value.trim());
  if(names.some(n=>n.length>20)){
    customPopup("Player names must be 20 characters or fewer. Please shorten the long names.");
    return;
  }
  names=names.filter(Boolean);
  if(names.length<2){
    customPopup("You’ll need at least two capitalists to get crushed. Multiplayer only!");
    return;
  }
  players=names.map(n=>({
    name:n, streaks:0, powerCards:0, progress:0,
    coins:0, properties:0, tax:0
  }));
  disallowedNormalCards=Array(players.length).fill(0);
  debts=Array(players.length).fill(null).map(()=>Array(players.length).fill(null).map(()=>{
    const o={}; debtCategories.forEach(c=>o[c]=0); return o;
  }));
  lastPlayerNames = names.slice();
  document.getElementById('playerSetupBox').style.display='none';
  const msg=`<span style="font-family:'Roboto';color:#f1f1f1;font-size:1rem;">Reloading resets your progress.</span><br><br>
  <span style="font-family:'Roboto';color:#f1f1f1;font-size:1rem;">After each player receives 1 free starting property during Setup,</span><br>
  <span class="player-name" style="color:#d4af7f;font-size:1rem;">Property Stack size: ${players.length+1}</span>`;
  customPopup(msg, ()=>{ showPlayerCards(); }, true,"Yes","No", true);
});

/* Global */
window.dismissDisclaimer=function(){
  document.getElementById('disclaimerOverlay').style.display='none';
  document.getElementById('playerSetupBox').style.display='block';
  ensurePopupElements();
};
ensurePopupElements();