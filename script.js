/************************************************************
 * TAX404
 * - Player name length limit & equal setup buttons
 * - Centered player cards & badge for Tax Breaks
 * - Simplified wording (Owe / Collect)
 * - Hardened popup system (prevents null errors)
 * - Enhanced Final Results (winner ribbons, rank bars)
 * - AMT only shown if applied
 ************************************************************/

let players = [];
let currentPlayerIndex = 0;

let timerInterval = null;
let timeLeft = 60;
let timerRunningState = true;

let disallowedNormalCards = [];

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
          <div class="player-card-actions">
            <button class="card-btn styled-btn" onclick="donateAction(${i})">Log</button>
          </div>
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
  scrollToActiveCard();
  setupCardScrollSync();
  setupPlayerCardClicks();
  bindTimerClick();
  if(timerInterval) clearInterval(timerInterval);
  timeLeft=60; timerRunningState=true;
  startTimer();
  updateTimerDisplays();
}

/* Debt Overview */
function buildDebtOverview(){
  if(players.length<2) return "";
  const { owe, collect, net } = aggregateTotals(currentPlayerIndex);
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
      <span class="ds-net">Net: ${net>0? '+'+net : net}</span>
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
  const net=theyOwe-youOwe;
  const mutual= youOwe>0 && theyOwe>0;
  const netLine = net>0? `<span style="color:#19a43c;">+${net}</span>` :
                 net<0? `<span style="color:#dc143c;">${net}</span>` :
                 (youOwe===0 && theyOwe===0? '<span style="color:#777;">0 (No Debts)</span>' :
                   '<span style="color:#d4af7f;">0 (Offset across categories)</span>');
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
  return `
    <div class="debt-sheet-header">
      <div class="debt-sheet-grip"></div>
      <h3 class="debt-sheet-title">${players[a].name} ↔ ${players[b].name}</h3>
      <div class="debt-sheet-netline" data-pair-status style="font-size:1rem;">
        You Owe <span style="color:#dc143c;">${youOwe}</span> | They Owe You <span style="color:#19a43c;">${theyOwe}</span>
      </div>
      ${mutual? '<div class="mutual-indicator" style="font-size:1rem;">Mutual Debts Active (different categories)</div>':''}
      <div class="debt-sheet-netline" data-pair-net style="font-size:1rem;">Net: ${netLine}</div>
    </div>
    <div class="debt-cat-groups">${groups}</div>
    <div class="debt-sheet-footer">
      <button class="debt-footer-btn danger" id="clearAllPairBtn">Clear All</button>
      <button class="debt-footer-btn primary" id="closeSheetBtn">Done</button>
    </div>`;
}
function attachDebtSheetEvents(otherIdx){
  const a=currentPlayerIndex;
  const sheet=document.getElementById('debtSheet');
  sheet.querySelector('#closeSheetBtn').onclick=closeDebtSheet;
  sheet.querySelector('#clearAllPairBtn').onclick=()=>{
    customPopup(
      `Clear all debts between <span class="player-name">${players[a].name}</span> and <span class="player-name">${players[otherIdx].name}</span>?`,
      yes=>{
        if(yes){
          clearAllDebtsBetween(a,otherIdx);
            refreshAllCategoryRows();
            updatePairHeader(a,otherIdx);
            refreshOverviewOnly();
        }
      },
      true,"Yes","No",false
    );
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
  document.getElementById('debtSheetOverlay').addEventListener('click', e=>{
    if(e.target.id==='debtSheetOverlay') closeDebtSheet();
  }, { once:true });
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
  const net=theyOwe-youOwe;
  const status=document.querySelector('[data-pair-status]');
  if(status){
    status.innerHTML=`You Owe <span style="color:#dc143c;">${youOwe}</span> | They Owe You <span style="color:#19a43c;">${theyOwe}</span>`;
  }
  const mutual= youOwe>0 && theyOwe>0;
  const existing=document.querySelector('.mutual-indicator');
  if(mutual && !existing){
    status.insertAdjacentHTML('afterend','<div class="mutual-indicator" style="font-size:1rem;">Mutual Debts Active (different categories)</div>');
  } else if(!mutual && existing){
    existing.remove();
  }
  const netEl=document.querySelector('[data-pair-net]');
  if(netEl){
    netEl.innerHTML=`Net: ${
      net>0? '<span style="color:#19a43c;">+'+net+'</span>' :
      net<0? '<span style="color:#dc143c;">'+net+'</span>' :
      (youOwe===0 && theyOwe===0? '<span style="color:#777;">0 (No Debts)</span>' :
        '<span style="color:#d4af7f;">0 (Offset across categories)</span>')
    }`;
  }
}
function refreshOverviewOnly(){
  const container=document.getElementById('mainGameContainer');
  if(!container)return;
  const summary=container.querySelector('.debt-summary-bar');
  const row=container.querySelector('#debtOtherPlayersRow');
  if(!summary||!row) return;
  const { owe, collect, net } = aggregateTotals(currentPlayerIndex);
  summary.innerHTML=`
    <span class="ds-owe">You Owe: ${owe}</span>
    <span class="ds-collect">You Collect: ${collect}</span>
    <span class="ds-net">Net: ${net>0? '+'+net : net}</span>`;
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
  function updateDisplay(){
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

    const debtOverview=buildDebtOverview();
    const timerHtml=`<div id="calculatorTimerWrapper"><span id="calculatorTimerDisplay" class="player-card-timer">${timeLeft}</span></div>`;

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
      <div class="calculatorBox">
        ${timerHtml}
        <h2 class="player-name" style="margin-top:0.2rem;">${p.name}'s Turn</h2>

        <span class="donate-label">Normal Cards Donated</span>
        <div class="donate-row">
          <button id="minusNormal" class="btn-round alt">-</button>
          <div class="normal-cards-container">
            ${blocks}
          </div>
          <button id="plusNormal" class="btn-round">+</button>
        </div>

        <span class="streak-helper">Each streak (5 cards) = 1 Tax Break</span>

        <span class="donate-label" style="margin-top:0.9rem;">Power Cards or Cash Donated</span>
        <div class="donate-row">
          <button id="minusPower" class="btn-round alt">-</button>
          <div class="power-circle-container">
            <div class="power-circle${powerDonated===0?' zero':''}">${powerDonated}</div>
          </div>
            <button id="plusPower" class="btn-round">+</button>
        </div>

        <div class="player-card-breaks" style="margin:0.55rem 0 0.6rem;">
          <span>Tax Breaks Earned</span>
          <span class="breaks-badge" id="taxBreaksPreview">${breaksPreview}</span>
        </div>

        ${debtOverview}

        <div class="donation-actions">
          ${confirmBtns}
        </div>
      </div>`;

    const minusN=document.getElementById('minusNormal');
    const plusN=document.getElementById('plusNormal');
    const minusP=document.getElementById('minusPower');
    const plusP=document.getElementById('plusPower');

    minusN.disabled = normalDonated===0;
    plusN.disabled = (normalDonated+tempProgress)>=20;
    minusP.disabled = powerDonated===0;
    plusP.disabled = powerDonated>=20;

    plusN.onclick=()=>{ if(normalDonated+tempProgress<20){ normalDonated++; updateDisplay(); } };
    minusN.onclick=()=>{ if(normalDonated>0){ normalDonated--; updateDisplay(); } };
    plusP.onclick=()=>{ if(powerDonated<20){ powerDonated++; updateDisplay(); } };
    minusP.onclick=()=>{ if(powerDonated>0){ powerDonated--; updateDisplay(); } };

    const confirm=document.getElementById('confirmDonationBtn');
    confirm.onclick=()=>{
      if(normalDonated===0 && powerDonated===0) nextPlayer();
      else finalizeDonations(normalDonated,powerDonated);
    };
    const charity=document.getElementById('tookCharityBtn');
    if(charity) charity.onclick=()=>tookCharityAction(currentPlayerIndex);

    attachMiniDebtHandlers();
    updateTimerDisplays();
    bindTimerClick();
  }
  updateDisplay();
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
  currentPlayerIndex=(currentPlayerIndex+1)%players.length;
  showPlayerCards();
}

/* Timer */
function bindTimerClick(){
  setTimeout(()=>{
    const t=document.querySelector('.player-card.active .player-card-timer');
    if(t) t.onclick=handleTimerClick;
    const calc=document.getElementById('calculatorTimerDisplay');
    if(calc) calc.onclick=handleTimerClick;
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
}

/* Card Interaction / Scroll */
function setupPlayerCardClicks(){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow'); if(!row)return;
    const cards=[...row.querySelectorAll('.player-card')];
    cards.forEach((card,i)=>{
      card.onclick=e=>{
        if(e.target.closest('.card-btn')) return;
        if(i===currentPlayerIndex) return;
        currentPlayerIndex=i;
        resetDonationState();
        if(timerInterval) clearInterval(timerInterval);
        timeLeft=60; timerRunningState=true;
        cards.forEach((c,idx)=>c.classList.toggle('active',idx===i));
        scrollToActiveCard();
        startTimer();
        updateTimerDisplays();
        bindTimerClick();
      };
    });
  },0);
}
function setupCardScrollSync(){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow'); if(!row)return;
    let st=null;
    row.onscroll=function(){
      const cards=[...row.querySelectorAll('.player-card')];
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
        cards.forEach((c,i2)=>c.classList.toggle('active',i2===idx));
        updateTimerDisplays();
        bindTimerClick();
      }
      if(st) clearTimeout(st);
      st=setTimeout(()=>scrollToActiveCard(),180);
    };
  },0);
}
function scrollToActiveCard(){
  setTimeout(()=>{
    const row=document.getElementById('playerCardsRow');
    const active=row?row.querySelector('.player-card.active'):null;
    if(active&&row){
      const rr=row.getBoundingClientRect();
      const ar=active.getBoundingClientRect();
      const left=row.scrollLeft + (ar.left+ar.width/2)-(rr.left+rr.width/2);
      row.scrollTo({left,behavior:'smooth'});
    }
  },0);
}
window.addEventListener('orientationchange', ()=> setTimeout(scrollToActiveCard, 400));

/* Outstanding Debts Gate */
function showEndgame(){
  const debtData = collectOutstandingDebtors();
  if(debtData.debtors.length===0){
    loadEndgame();
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
function showOutstandingDebtsPopup(data){
  const overlay=document.getElementById('customPopupOverlay');
  const msg=document.getElementById('customPopupMessage');
  const btnBox=document.getElementById('customPopupButtons');
  const content = `
    <h2 class="lilita" style="color:var(--color-accent); margin:0 0 0.6rem;">Outstanding Debts</h2>
    <p style="font-size:1rem; line-height:1.35; margin:0 0 0.8rem;">
      There are outstanding debts that need to be settled before filing taxes:
    </p>
    <div class="outstanding-wrapper">
      ${data.debtors.map(d=>{
        const debtorName=players[d.debtorIndex].name;
        return `
          <div class="debtor-block" data-debtor="${d.debtorIndex}">
            <label class="debtor-header">
              <input type="checkbox" data-debtor-check="${d.debtorIndex}">
              <span>${debtorName} (Total Owed: ${d.totalOwed})</span>
            </label>
            <div class="debtor-debts">
              ${d.details.map(det=>{
                const payeeName=players[det.payeeIndex].name;
                return `
                  <div style="margin-bottom:0.35rem;">
                    <strong>→ Owes <span class="to">${payeeName}</span> : ${det.total}</strong><br>
                    ${det.categories.map(c=>`<span class="cat">${c.cat}</span>: ${c.amt}`).join(', ')}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
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
  const checkboxes=[...msg.querySelectorAll('[data-debtor-check]')];
  function updateProceed(){
    const allChecked = checkboxes.every(cb=>cb.checked);
    proceed.disabled = !allChecked;
  }
  checkboxes.forEach(cb=>cb.addEventListener('change', updateProceed));
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
      if(coins>=34 && coins<=39){
        pl.tax=Math.floor(coins*0.03);
        pl.amtApplied=true; pl.amtPercent='3%';
      } else if(coins>=40){
        pl.tax=Math.floor(coins*0.05);
        pl.amtApplied=true; pl.amtPercent='5%';
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

  const topNet=maxNet>0?maxNet:1;
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
    const fillPct = Math.min(100, (netIncome/topNet)*100).toFixed(2);
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
          <div class="rank-bar-fill ${tie?'tie':''}" style="width:${fillPct}%"></div>
        </div>
        <div class="final-result-stats">
          <div>Tax: <span style="color:#d4af7f;">${p.tax}</span>${p.amtApplied?` <span style="color:#dc143c;font-size:.78rem;background:#3a1d1d;padding:.15rem .45rem;border-radius:6px;letter-spacing:.5px;margin-left:.35rem;">AMT ${p.amtPercent}</span>`:''}</div>
          <div>Net Income: <span style="color:#d4af7f;">${netIncome}</span></div>
          <div>Audit Risk: <span style="color:#d4af7f;">${getAuditRiskLevel(p)}</span></div>
          <em style="color:#d4af7f;font-style:italic;">${message}</em>
        </div>
        <div class="final-result-net">Net Share: ${fillPct}% of Top</div>
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

/* Detailed breakdown (no AMT block unless applied) */
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
function exitToSetup(){ backToNameInput(); }
function backToNameInput(){
  players=[]; debts=[]; disallowedNormalCards=[];
  currentPlayerIndex=0;
  if(timerInterval) clearInterval(timerInterval);
  timerRunningState=true; timeLeft=60;
  document.getElementById('playerSetupBox').style.display='block';
  document.getElementById('mainGameContainer').innerHTML='';
}

/* ------------ Robust Popup System ------------ */
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
    if(!document.getElementById('customPopupYes')){
      const btnBox=overlay.querySelector('#customPopupButtons') || (()=> {
        const b=document.createElement('div');
        b.id='customPopupButtons';
        b.style.cssText='display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;margin-top:0.9rem;';
        overlay.querySelector('#customPopupBox')?.appendChild(b);
        return b;
      })();
      const yes=document.createElement('button');
      yes.id='customPopupYes'; yes.className='styled-btn'; yes.textContent='OK';
      btnBox.appendChild(yes);
    }
    if(!document.getElementById('customPopupNo')){
      const btnBox=overlay.querySelector('#customPopupButtons');
      const no=document.createElement('button');
      no.id='customPopupNo'; no.className='btn-neutral styled-btn'; no.textContent='No';
      btnBox.appendChild(no);
    }
  }
}

function customPopup(message, callback, isHtml=false, yesText="Yes", noText="No", okOnly=false){
  ensurePopupElements();
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
  let names=[...e.target.querySelectorAll("input[name='playerName']")]
    .map(i=>i.value.trim());

  if(names.some(n=>n.length>10)){
    customPopup("Player names must be 10 characters or fewer. Please shorten the long names.");
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