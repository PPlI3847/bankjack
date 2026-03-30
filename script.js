/* =========================================================
   JAVASCRIPT (코어 로직 & UI 렌더링)
   ========================================================= */

const START_VAL = 1590;
const ENTRY_FEE = 1590;
const MAX_INV = 250;
const HIT_COST = 5;
const WIN_TARGET = 6250;
const BK_LOAN = 3125;
const LOAN_RATE = 0.2;

const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

let UI = { view: 'LOGIN', modal: null, revealed: false, lastPhase: '', tempBet: 0, tempInv: 0 };
let myId = '';
let G = null;

// ── 이펙트 & 알림 ──
function triggerSparkle() {
  const el = document.getElementById('turn-sparkle');
  if (el) {
    el.classList.remove('active');
    void el.offsetWidth; // 리플로우 강제 (애니메이션 재시작)
    el.classList.add('active');
  }
}

function showToast(msg, isError = false) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.innerHTML = msg; 
  container.appendChild(toast);
  setTimeout(() => { if (container.contains(toast)) container.removeChild(toast); }, 3000);
}

// ── 칩 & 카드 렌더링 ──
function v2c(v){ v=Math.max(0,Math.round(v)); const c={k:0,b:0,g:0,r:0,w:0}; c.k=Math.floor(v/625);v%=625; c.b=Math.floor(v/125);v%=125; c.g=Math.floor(v/25);v%=25; c.r=Math.floor(v/5);v%=5; c.w=v; return c; }

function chipHTML(val, showN=true){ 
  if (val === 0) return `<span style="color:var(--dim); font-size:0.8rem;">(없음)</span>`;
  const c=v2c(val); let h='<div class="chips">'; 
  if(c.k)h+=`<span class="chip k">${c.k}</span>`; 
  if(c.b)h+=`<span class="chip b">${c.b}</span>`; 
  if(c.g)h+=`<span class="chip g">${c.g}</span>`; 
  if(c.r)h+=`<span class="chip r">${c.r}</span>`; 
  if(c.w)h+=`<span class="chip w">${c.w}</span>`; 
  if(showN)h+=`<span class="cv" style="font-weight:bold; color:var(--gold2); font-size:1rem; margin-left:5px;">${val.toLocaleString()}</span>`; 
  return h+'</div>'; 
}

// 클릭 가능한 배팅/투자용 칩 버튼 생성
function renderChipButtons(maxVal, stagedVal, isBet) {
  const remaining = maxVal - stagedVal;
  let h = '<div class="chips" style="justify-content:center; gap:12px; margin: 15px 0;">';
  const denoms = [ {k:'k', v:625}, {k:'b', v:125}, {k:'g', v:25}, {k:'r', v:5}, {k:'w', v:1} ];
  
  denoms.forEach(d => {
    const canAfford = remaining >= d.v;
    if (!isBet && d.v > 125) return; // 투자는 파란칩(125) 까지만 허용
    
    h += `<span class="chip ${d.k}" 
            style="cursor:${canAfford?'pointer':'not-allowed'}; opacity:${canAfford?1:0.3}; transform:scale(1.2); margin: 0 5px;" 
            onclick="${canAfford ? `stageChip(${d.v}, ${isBet})` : ''}">
            ${d.v}
          </span>`;
  });
  h += '</div>';
  return h;
}

// 카드 숫자에 맞게 중앙 문양 배열
function getCardCenter(c) {
  if (c.joker) return '<div class="card-center" style="font-size:2em">🃏</div>';
  if (['J','Q','K'].includes(c.r)) return `<div class="card-center" style="font-size:3em; font-weight:900; opacity:0.8; color:var(--dim);">${c.r}</div>`;
  if (c.r === 'A') return `<div class="card-center" style="font-size:2.5em;">${c.s}</div>`;
  
  const num = parseInt(c.r);
  let suits = '';
  const sz = num > 8 ? '1.2em' : num > 5 ? '1.5em' : '1.8em';
  for(let i=0; i<num; i++) suits += `<span style="font-size:${sz}">${c.s}</span>`;
  return `<div class="card-center">${suits}</div>`;
}

function cardHTML(c, hidden=false, extraClass=''){ 
  if(hidden) return `<div class="card back ${extraClass}"></div>`; 
  return `
    <div class="card ${c.red?'r':''} ${extraClass}">
      <span>${c.r}</span>
      ${getCardCenter(c)}
      <span>${c.r}</span>
    </div>`; 
}
function handHTML(hand, hidden=false, extraClass=''){ return `<div class="hand">${hand.map(c=>cardHTML(c, hidden, extraClass)).join('')}</div>`; }
function hv(hand){ let t=0,a=0,jk=0; for(const c of hand){ if(c.joker){t+=5;jk++;}else if(c.r==='A'){t+=11;a++;}else if('JQK'.includes(c.r))t+=10;else t+=parseInt(c.r); } while(t>21&&a>0){t-=10;a--;} while(t>21&&jk>0){t-=5;jk--;} return t; }
function lg(m,t=''){G.log.unshift({m,t});if(G.log.length>30)G.log.pop();}

// ── 계정 ──
function checkLogin() { const savedId = localStorage.getItem('bj_user_id'); if (savedId) { myId = savedId; UI.view = 'MENU'; } }
function doLogin() {
  const id = document.getElementById('loginId').value.trim();
  if (!id) return showToast('아이디를 입력해주세요.', true);
  localStorage.setItem('bj_user_id', id); myId = id; UI.view = 'MENU'; render();
}
function doLogout() { localStorage.removeItem('bj_user_id'); myId = ''; UI.view = 'LOGIN'; render(); }

// ── 게임 코어 로직 ──
function startBotGame() {
  initGame([myId, 'AI 딜러 봇']);
  G.players[1].isBot = true; 
  UI.view = 'GAME';
  showToast('AI 봇과의 대결을 시작합니다!');
  checkBotTurn(); render();
}

function initGame(names){ 
  G={players:names.map(n=>({name:n,chips:START_VAL,loan:0,hand:[],bet:0,inv:0,stayed:false,busted:false,bankrupt:false,roundWon:false,isBot:false})),deck:[],mc:null,pot:0,store:0,dealerI:0,order:[],curI:0,phase:'DEAL',turn:1,log:[],gameWinner:-1}; 
  startTurn(); 
}

function startTurn(){ 
  const alive=G.players.filter(p=>!p.bankrupt); 
  if(alive.length<2){G.phase='GAMEOVER';return;} 
  G.players.forEach(p=>{p.hand=[];p.bet=0;p.inv=0;p.stayed=false;p.busted=false;p.roundWon=false;}); 
  G.mc=null; UI.revealed=false; UI.modal=null; UI.lastPhase=''; UI.tempBet=0; UI.tempInv=0; G.order=[]; 
  for(let i=0;i<G.players.length;i++){ const idx=(G.dealerI+i)%G.players.length; if(!G.players[idx].bankrupt)G.order.push(idx); } 
  
  const d=[]; 
  for(const s of SUITS)for(const r of RANKS)d.push({r,s,red:s==='♥'||s==='♦'}); 
  d.push({r:'JKR',s:'🃏',joker:true},{r:'JKR',s:'🃏',joker:true}); d.sort(()=>Math.random()-0.5); G.deck=d; 
  
  for(const pi of G.order)G.players[pi].hand=[G.deck.pop(),G.deck.pop()]; 
  G.mc=G.deck.pop(); 
  lg(`── 턴 ${G.turn} 시작 ──`,'imp'); G.phase='BETTING'; G.curI=0; 
  triggerSparkle(); // 턴 시작 시 반짝임 효과
}

function curP(){return G.players[G.order[G.curI]];}

function doAction(action, payload) { executeAction(action, payload); render(); checkBotTurn(); }

function executeAction(action, payload) {
  const p=curP();
  if(action==='BET'){ p.bet=payload; p.chips-=payload; G.pot+=payload; lg(`${p.name}: ${payload} 베팅`); G.curI++; if(G.curI>=G.order.length){G.phase='INVESTMENT';G.curI=0;} }
  if(action==='INVEST'){ p.inv=payload; if(payload>0)p.chips-=payload; lg(`${p.name}: ${payload?payload+' 투자':'투자 안함'}`); G.curI++; if(G.curI>=G.order.length){G.phase='HITSTAY';G.curI=0;skipStayed();} }
  if(action==='HIT'){ p.chips-=HIT_COST; const c=G.deck.pop(); p.hand.push(c); const v=hv(p.hand); lg(`${p.name} 히트`); if(v>21){p.busted=true;p.stayed=true;lg(`${p.name} BUST!`,'bad');advHS();} }
  if(action==='STAY'){ p.stayed=true; lg(`${p.name} 스테이`); advHS(); }
  if(action==='NEXT_TURN'){ G.turn++; startTurn(); }
  if(action==='TAKE_LOAN'){ p.chips+=payload; p.loan+=payload; lg(`${p.name}: 대출 ${payload}`); UI.modal=null; }
  if(action==='REPAY'){ p.chips-=payload; p.loan-=payload; lg(`${p.name}: 상환 ${payload}`); UI.modal=null; }
}

function skipStayed(){ while(G.curI<G.order.length&&G.players[G.order[G.curI]].stayed)G.curI++; }
function advHS(){ G.curI++; skipStayed(); if(G.curI>=G.order.length)doShowdown(); }

function doShowdown(){ 
  G.phase='SHOWDOWN'; lg(`오픈: ${G.mc.r}${G.mc.s}`); triggerSparkle();
  
  const mult = (c => { if(c.joker)return 3; if(c.r==='A')return 2; if('JQK'.includes(c.r))return 1.5; const n=parseInt(c.r); if(n>=8&&n<=10)return 1; return 0.5; })(G.mc);
  G.order.forEach(pi => {
    const p=G.players[pi]; if(!p.inv)return;
    const back=Math.floor(p.inv*mult); p.chips+=back; lg(`${p.name} 투자 ${p.inv} → ${back}`);
  });

  G.order.forEach(pi => { const p=G.players[pi]; if(p.busted){ const half=Math.floor(p.chips/2); p.chips-=half; lg(`${p.name} 버스트! 절반 잃음`); } });
  G.order.forEach(pi => { const p=G.players[pi]; if(!p.busted&&hv(p.hand)===21){ p.chips+=625; lg(`${p.name} 블랙잭! 검은칩 1개 획득`); } });

  const alive=G.order.filter(pi=>!G.players[pi].busted); 
  if(alive.length){ 
    const best=Math.max(...alive.map(pi=>hv(G.players[pi].hand))); 
    const wins=alive.filter(pi=>hv(G.players[pi].hand)===best); 
    if(wins.length===1){ 
      G.players[wins[0]].chips+=G.pot+G.store; G.players[wins[0]].roundWon=true; G.pot=0; G.store=0; lg(`${G.players[wins[0]].name} 승리!`,'good'); 
    }else{ G.store+=G.pot; G.pot=0; lg(`무승부 (팟 이월)`,'imp'); } 
  }else{ G.store+=G.pot; G.pot=0; } 
}

// ── AI 봇 자동 액션 ──
function checkBotTurn() {
  if (!G) return;
  if (['BETTING', 'INVESTMENT', 'HITSTAY'].includes(G.phase)) {
    if (curP().isBot && !curP().stayed) setTimeout(executeBotAction, 1200); 
  }
}

function executeBotAction() {
  if (!G || !curP().isBot || G.phase === 'SHOWDOWN' || G.phase === 'GAMEOVER') return;
  const p = curP(); let action = '', payload = null;

  if (G.phase === 'BETTING') {
    const minB = G.curI === 0 ? 1 : G.players[G.order[0]].bet;
    let betAmt = minB; if (Math.random() < 0.4 && p.chips >= minB + 5) betAmt += 5;
    action = 'BET'; payload = betAmt;
  } else if (G.phase === 'INVESTMENT') {
    let invAmt = 0; if (Math.random() < 0.3 && p.chips >= 2) invAmt = 2;
    action = 'INVEST'; payload = invAmt;
  } else if (G.phase === 'HITSTAY') {
    const v = hv(p.hand);
    if (v < 16 && p.chips >= HIT_COST) action = 'HIT'; else action = 'STAY';
  }
  if (action) doAction(action, payload);
}

// ── UI 인터랙션 (칩 스테이징) ──
function stageChip(val, isBet) {
  const p = G.players[0];
  if (isBet) {
    if (UI.tempBet + val <= p.chips) UI.tempBet += val;
  } else {
    if (UI.tempInv + val <= Math.min(MAX_INV, p.chips)) UI.tempInv += val;
    else showToast(`투자 상한선(파란칩 2개=250)을 초과할 수 없습니다.`, true);
  }
  render();
}
function resetStaged(isBet) { if(isBet) UI.tempBet=0; else UI.tempInv=0; render(); }

// ── 화면 렌더링 ──
function goBack(to) { UI.view = to; G = null; render(); }

function render() {
  const app = document.getElementById('app');
  if (UI.view === 'LOGIN') return app.innerHTML = renderLogin();
  if (UI.view === 'MENU') return app.innerHTML = renderMenu();
  if (UI.view === 'GAME') {
    if (UI.modal === 'loan') return app.innerHTML = renderLoanModal();
    if (UI.modal === 'repay') return app.innerHTML = renderRepayModal();

    if (G && G.phase !== UI.lastPhase) {
      if (G.phase === 'BETTING') showToast('💰 베팅 단계입니다.<br><span style="font-size:0.8rem">하단의 칩을 눌러 금액을 쌓아 올리세요.</span>');
      if (G.phase === 'INVESTMENT') showToast('📈 투자 단계입니다.<br><span style="font-size:0.8rem">숨겨진 카드에 칩을 투자하세요 (짝수만 가능).</span>');
      if (G.phase === 'HITSTAY') showToast('🃏 베팅 완료!<br><span style="font-size:0.8rem">내 카드를 오픈하고 히트/스테이를 결정하세요.</span>');
      UI.lastPhase = G.phase;
    }
    app.innerHTML = renderGame();
  }
}

function renderLogin() {
  return `
    <h1>🃏 Blackjack with Bank</h1>
    <p class="sub">계정을 생성하거나 로그인하세요</p>
    <div class="panel gold" style="max-width:400px; margin: 0 auto;">
      <input type="text" id="loginId" placeholder="아이디 입력" autocomplete="off">
      <button class="btn gold" style="width:100%" onclick="doLogin()">시작하기</button>
    </div>
  `;
}

function renderMenu() {
  return `
    <div class="top-bar">
      <h2>${myId}님, 환영합니다!</h2>
      <button class="btn back" onclick="doLogout()">로그아웃</button>
    </div>
    <h1>🃏 Blackjack</h1>
    <div class="panel gold" style="max-width:400px; margin: 0 auto; text-align:center; padding: 40px 20px;">
      <h2 style="margin-bottom:20px;">AI 봇과의 1:1 진검승부</h2>
      <button class="btn gold pulse-btn" style="width:100%; font-size:1.2rem; padding:15px;" onclick="startBotGame()">게임 시작하기</button>
    </div>
  `;
}

function renderGame() {
  if (!G) return '';
  let me = G.players[0]; let bot = G.players[1];
  const isMeDealer = G.dealerI === 0; const isBotDealer = G.dealerI === 1;

  let h = `
    <div class="top-bar" style="margin-bottom:10px;">
      <button class="btn back" onclick="if(confirm('게임을 포기하고 나가시겠습니까?')) goBack('MENU')">← 나가기</button>
      <span style="color:var(--gold2); font-weight:bold;">vs AI 봇</span>
      <span style="color:var(--dim); font-size:0.9rem;">팟: ${G.pot}</span>
    </div>
  `;

  const botCur = G.order[G.curI]===1 && G.phase !== 'SHOWDOWN';
  const hideBotCards = G.phase !== 'SHOWDOWN';
  
  // 상단: 봇 영역
  h += `
    <div class="bot-area ${botCur ? 'hi' : ''}">
      <div style="display:flex; justify-content:center; align-items:center; gap:10px; margin-bottom:10px;">
        ${isBotDealer ? '<span class="chip-dealer">딜러</span>' : ''}
        <div style="font-weight:bold; color:var(--cream); font-size:1.2rem;">
          ${bot.name} ${botCur ? '<span class="pb cur">생각 중...</span>' : ''}
        </div>
      </div>
      
      ${handHTML(bot.hand, hideBotCards)}
      
      <div class="action-box">
        <div class="action-row"><span style="color:var(--dim)">보유 칩:</span> ${chipHTML(bot.chips, true)}</div>
        <div class="action-row"><span style="color:var(--dim)">베팅:</span> ${bot.bet > 0 ? chipHTML(bot.bet, true) : (G.phase === 'BETTING' && botCur ? '<span style="color:var(--gold2)">고민 중...</span>' : '대기 중')}</div>
        ${(G.phase === 'INVESTMENT' || G.phase === 'HITSTAY' || G.phase === 'SHOWDOWN') ? `
          <div class="action-row"><span style="color:var(--dim)">투자:</span> ${bot.inv > 0 ? chipHTML(bot.inv, true) : (G.phase === 'INVESTMENT' && botCur ? '<span style="color:var(--gold2)">고민 중...</span>' : '(투자 안함)')}</div>
        ` : ''}
      </div>
    </div>
  `;

  // 중앙: 미스터리 카드 테이블
  h += `<div class="table-center">`;
  if (G.phase === 'SHOWDOWN') {
    h += `<h3 style="margin-bottom:10px; color:var(--gold2);">미스터리 카드 오픈!</h3>`;
    h += cardHTML(G.mc, false, 'flip-in');
    h += `<div style="margin-top:15px;"><button class="btn gold pulse-btn" onclick="doAction('NEXT_TURN')">다음 턴 진행</button></div>`;
  } else {
    h += `<h3 style="margin-bottom:10px; color:var(--dim);">숨겨진 미스터리 카드</h3>`;
    h += cardHTML(null, true);
  }
  h += `</div>`;
  
  h += `<div class="log">${G.log.slice(0,5).map(e=>`<div class="le ${e.t}">${e.m}</div>`).join('')}</div>`;

  // 하단: 내 영역
  const myTurn = G.order[G.curI] === 0 && G.phase !== 'SHOWDOWN';
  const hideMyCards = (G.phase === 'BETTING' || G.phase === 'INVESTMENT' || (G.phase === 'HITSTAY' && !UI.revealed));
  const flipClass = (G.phase === 'HITSTAY' && UI.revealed) ? 'flip-in' : '';

  h += `
    <div class="my-area ${myTurn ? 'hi' : ''}">
      <div style="display:flex; justify-content:center; align-items:center; gap:10px; margin-bottom:10px; width:100%;">
        ${isMeDealer ? '<span class="chip-dealer">딜러</span>' : ''}
        <div style="font-size:1.4rem; font-weight:bold; color:var(--gold2);">${me.name} ${myTurn ? '<span class="pb cur">내 차례</span>' : ''}</div>
      </div>
      
      <div style="margin-bottom:15px;">${chipHTML(me.chips, true)}</div>
      ${me.loan > 0 ? `<div style="color:var(--red); font-size:0.85rem; margin-top:-5px; margin-bottom:10px;">대출 잔액: ${me.loan}</div>` : ''}

      <div style="display:flex; gap:20px; margin-bottom:15px; font-size:1rem; background:rgba(0,0,0,0.3); padding:8px 15px; border-radius:8px;">
        <div><span style="color:var(--dim)">베팅:</span> ${me.bet > 0 ? chipHTML(me.bet, true) : '-'}</div>
        ${G.phase !== 'BETTING' ? `<div><span style="color:var(--dim)">투자:</span> ${me.inv > 0 ? chipHTML(me.inv, true) : '-'}</div>` : ''}
      </div>
      
      <div style="width:100%; max-width:600px;">
        ${handHTML(me.hand, hideMyCards, flipClass)}
        <div style="width:100%; margin-top:15px;">${renderMyControls(me, myTurn)}</div>
      </div>
    </div>
  `;
  return h;
}

function renderMyControls(me, isMyTurn) {
  if (!isMyTurn) return `<div style="text-align:center; color:var(--dim); padding:20px 0;">AI 봇이 생각 중입니다...</div>`;

  if (G.phase === 'BETTING') {
    const minB = G.curI===0 ? 1 : G.players[G.order[0]].bet;
    return `
      <div style="text-align:center; background:rgba(0,0,0,0.4); padding:15px; border-radius:12px;">
        <div style="color:var(--dim); font-size:0.95rem; margin-bottom:5px;">👇 칩을 눌러 베팅액을 올려주세요 (최소 ${minB})</div>
        ${renderChipButtons(me.chips, UI.tempBet, true)}
        <div style="margin-bottom:20px; font-size:1.3rem; display:flex; align-items:center; justify-content:center; gap:10px;">
          <span style="color:var(--gold2)">총 베팅액:</span> ${UI.tempBet > 0 ? chipHTML(UI.tempBet, true) : '0'}
        </div>
        <div class="btns" style="justify-content:center;">
          <button class="btn dim" onclick="resetStaged(true)">초기화</button>
          <button class="btn gold pulse-btn" onclick="if(UI.tempBet>=${minB}) { doAction('BET', UI.tempBet); UI.tempBet=0; } else showToast('최소 베팅액은 ${minB}입니다.', true);">베팅 확정</button>
          <button class="btn dim" onclick="UI.modal='loan'; render()">💳 은행</button>
        </div>
      </div>`;
  }
  
  if (G.phase === 'INVESTMENT') {
    return `
      <div style="text-align:center; background:rgba(0,0,0,0.4); padding:15px; border-radius:12px;">
        <div style="color:var(--dim); font-size:0.95rem; margin-bottom:5px;">👇 칩을 눌러 투자액을 올려주세요 (최대 파란칩 2개)</div>
        ${renderChipButtons(me.chips, UI.tempInv, false)}
        <div style="margin-bottom:20px; font-size:1.3rem; display:flex; align-items:center; justify-content:center; gap:10px;">
          <span style="color:var(--gold2)">총 투자액:</span> ${UI.tempInv > 0 ? chipHTML(UI.tempInv, true) : '0'}
        </div>
        <div class="btns" style="justify-content:center;">
          <button class="btn dim" onclick="resetStaged(false)">초기화</button>
          <button class="btn dim" onclick="doAction('INVEST', 0)">투자 패스</button>
          <button class="btn gold pulse-btn" onclick="if(UI.tempInv%2===0 && UI.tempInv>0) { doAction('INVEST', UI.tempInv); UI.tempInv=0; } else showToast('투자는 짝수만 가능하며 0보다 커야 합니다.', true);">투자 확정</button>
        </div>
      </div>`;
  }
  
  if (G.phase === 'HITSTAY') {
    if (!UI.revealed) {
      return `
        <div style="text-align:center; padding: 20px 0;">
          <button class="btn gold pulse-btn" style="padding:15px 30px; font-size:1.2rem; border-radius:12px;" 
            onclick="UI.revealed=true; showToast('카드를 오픈했습니다!'); render();">
            👀 내 패 확인하기
          </button>
        </div>`;
    }

    const v = hv(me.hand);
    return `
      <div style="text-align:center; background:rgba(0,0,0,0.4); padding:15px; border-radius:12px;">
        <div style="font-size:1.4rem; color:${v>21?'var(--red)':'#fff'}; margin-bottom:15px;">현재 카드 합: <b>${v}</b></div>
        <div class="btns" style="justify-content:center; gap:15px;">
          <button class="btn dim" style="color:var(--red); border-color:var(--red); padding:10px 20px; font-size:1.1rem;" onclick="doAction('HIT')" ${me.chips<HIT_COST||v>=21?'disabled':''}>🃏 히트 (-5)</button>
          <button class="btn gold" style="padding:10px 20px; font-size:1.1rem;" onclick="doAction('STAY')">✋ 스테이</button>
        </div>
      </div>`;
  }
  return '';
}

// ── 은행 모달 ──
function renderLoanModal(){
  const p = G.players[0]; const maxL = Math.min(BK_LOAN - p.loan, p.chips);
  return `
    <div class="panel gold" style="max-width:400px; margin: 50px auto; text-align:center;">
      <h2 class="mb">💳 은행 대출</h2>
      <div style="color:var(--dim); font-size:0.9rem; margin-bottom:15px;">보유 칩: ${p.chips}<br>현재 대출: ${p.loan} / 3125</div>
      <input type="number" id="loanA" min="1" max="${maxL}" placeholder="대출할 금액" style="width:100%; text-align:center;">
      <div class="btns" style="margin-top:15px;">
        <button class="btn gold" onclick="const v=parseInt(document.getElementById('loanA').value); if(v>0) doAction('TAKE_LOAN', v)">대출 받기</button>
        ${p.loan > 0 ? `<button class="btn dim" onclick="UI.modal='repay'; render()">상환하기</button>` : ''}
        <button class="btn back" onclick="UI.modal=null; render()">닫기</button>
      </div>
    </div>`;
}

function renderRepayModal(){
  const p = G.players[0]; const mx = Math.min(p.loan, p.chips);
  return `
    <div class="panel gold" style="max-width:400px; margin: 50px auto; text-align:center;">
      <h2 class="mb">💳 대출 상환</h2>
      <div style="color:var(--dim); font-size:0.9rem; margin-bottom:15px;">갚아야 할 대출: ${p.loan}<br>보유 칩: ${p.chips}</div>
      <input type="number" id="repayA" min="1" max="${mx}" value="${mx}" style="width:100%; text-align:center;">
      <div class="btns" style="margin-top:15px;">
        <button class="btn gold" onclick="const v=parseInt(document.getElementById('repayA').value); if(v>0) doAction('REPAY', v)">상환하기</button>
        <button class="btn back" onclick="UI.modal=null; render()">닫기</button>
      </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => { checkLogin(); render(); });
</script>
