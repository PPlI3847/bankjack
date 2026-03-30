/* =========================================================
   BLACKJACK WITH BANK — Multiplayer P2P Edition
   ========================================================= */

// ── Constants ──
const START_VAL  = 1590;  
const ENTRY_FEE  = 1590;
const MAX_INV    = 250;   
const HIT_COST   = 5;     
const LOAN_MAX_T = 1875;  
const LOAN_RATE  = 0.2;   
const WIN_TARGET = 6250;  
const BK_LOAN    = 3125;  

const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

// ── UI Local State (동기화되지 않는 개인 화면 상태) ──
let UI = {
  revealed: false,
  modal: null
};

// ── Game Global State (방장이 통제하고 모두에게 동기화되는 상태) ──
let G = null;
let SU = { n: 2, names: ['플레이어1', '플레이어2'], mode: 'local' };

// ── Network Layer (P2P 통신) ──
let peer = null;
let hostConn = null;       // 클라이언트가 방장과 연결된 객체
let clientConns = [];      // 방장이 관리하는 클라이언트 목록
let isOnline = false;
let isHost = false;
let roomId = '';

function initHost() {
  peer = new Peer();
  peer.on('open', (id) => {
    roomId = id;
    isOnline = true;
    isHost = true;
    alert(`방이 생성되었습니다!\n친구들에게 방 코드 [ ${id} ] 를 알려주세요.`);
    startSetup(); // 방장이 게임 초기화
  });
  peer.on('connection', (conn) => {
    clientConns.push(conn);
    conn.on('data', (data) => {
      if (data.type === 'ACTION') {
        // 클라이언트로부터 액션 요청을 받으면 실행 후 모두에게 상태 전송
        executeAction(data.action, data.payload);
        broadcastState();
      }
    });
    conn.on('open', () => {
      // 새로운 접속자에게 현재 게임 상태 전송
      if (G) conn.send({ type: 'SYNC', state: G });
    });
  });
}

function joinRoom() {
  const id = document.getElementById('joinId').value.trim();
  if (!id) return alert('방 코드를 입력하세요!');
  
  peer = new Peer();
  peer.on('open', () => {
    hostConn = peer.connect(id);
    hostConn.on('open', () => {
      isOnline = true;
      isHost = false;
      alert('방에 접속했습니다! 방장이 설정을 마치면 게임이 시작됩니다.');
      render();
    });
    hostConn.on('data', (data) => {
      if (data.type === 'SYNC') {
        G = data.state; // 방장으로부터 최신 상태 동기화
        render();
      }
    });
  });
}

function broadcastState() {
  if (!isOnline || !isHost || !G) return;
  clientConns.forEach(conn => {
    conn.send({ type: 'SYNC', state: G });
  });
}

// ── Action Dispatcher (버튼 클릭 시 네트워크 분기) ──
function dispatchAction(action, payload) {
  if (isOnline && !isHost) {
    // 나는 접속자이므로 방장에게 행동 요청만 보냄
    hostConn.send({ type: 'ACTION', action, payload });
    return;
  }
  // 내가 방장이거나 로컬 모드이면 직접 실행
  executeAction(action, payload);
  if (isOnline && isHost) broadcastState();
  render();
}

function executeAction(action, payload) {
  switch(action) {
    case 'BET': actualDoBet(payload); break;
    case 'INVEST': actualDoInvest(payload); break;
    case 'CONFIRM_VIEW': actualConfirmView(); break;
    case 'HIT': actualDoHit(); break;
    case 'STAY': actualDoStay(); break;
    case 'NEXT_TURN': actualDoNextTurn(); break;
    case 'TAKE_LOAN': actualDoTakeLoan(payload); break;
    case 'REPAY': actualDoRepay(payload); break;
  }
}

// ── Chip helpers ──
function v2c(v){
  v=Math.max(0,Math.round(v));
  const c={k:0,b:0,g:0,r:0,w:0};
  c.k=Math.floor(v/625);v%=625;
  c.b=Math.floor(v/125);v%=125;
  c.g=Math.floor(v/25); v%=25;
  c.r=Math.floor(v/5);  v%=5;
  c.w=v; return c;
}
function chipHTML(val,showN=true){
  const c=v2c(val);
  let h='<div class="chips">';
  if(c.k)h+=`<span class="chip k">${c.k}</span>`;
  if(c.b)h+=`<span class="chip b">${c.b}</span>`;
  if(c.g)h+=`<span class="chip g">${c.g}</span>`;
  if(c.r)h+=`<span class="chip r">${c.r}</span>`;
  if(c.w)h+=`<span class="chip w">${c.w}</span>`;
  if(!c.k&&!c.b&&!c.g&&!c.r&&!c.w)h+=`<span style="color:var(--dim);font-size:.8rem">없음</span>`;
  if(showN)h+=`<span class="cv">${val.toLocaleString()}</span>`;
  return h+'</div>';
}

// ── Deck / Cards ──
function makeDeck(){
  const d=[];
  for(const s of SUITS)for(const r of RANKS)
    d.push({r,s,red:s==='♥'||s==='♦'});
  d.push({r:'JKR',s:'🃏',joker:true});
  d.push({r:'JKR',s:'🃏',joker:true});
  return d;
}
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=0|Math.random()*(i+1);
    [a[i],a[j]]=[a[j],a[i]];
  }return a;
}
function hv(hand){
  let t=0,a=0,jk=0;
  for(const c of hand){
    if(c.joker){t+=5;jk++;}
    else if(c.r==='A'){t+=11;a++;}
    else if('JQK'.includes(c.r))t+=10;
    else t+=parseInt(c.r);
  }
  while(t>21&&a>0){t-=10;a--;}
  while(t>21&&jk>0){t-=5;jk--;}
  return t;
}
function cardHTML(c,hidden=false){
  if(hidden)return`<div class="card back"></div>`;
  if(c.joker)return`<div class="card j"><span>JKR</span><span>🃏</span><span>JKR</span></div>`;
  const cl=c.red?'card r':'card';
  return`<div class="${cl}"><span>${c.r}</span><span>${c.s}</span><span>${c.r}</span></div>`;
}
function handHTML(hand,rev=true){
  return`<div class="hand">${hand.map(c=>cardHTML(c,!rev)).join('')}</div>`;
}
function cardStr(c){
  if(!c)return'?';
  if(c.joker)return'JOKER🃏';
  return`${c.r}${c.s}`;
}

function lg(m,t=''){G.log.unshift({m,t});if(G.log.length>80)G.log.pop();}

// ── Game Core Logic ──
function initGame(names){
  G={
    players:names.map(n=>({
      name:n,chips:START_VAL,loan:0,
      hand:[],bet:0,inv:0,
      stayed:false,busted:false,bankrupt:false,roundWon:false,
    })),
    deck:[],mc:null,pot:0,store:0,
    dealerI:0,order:[],curI:0,
    phase:'DEAL',turn:1,log:[],
    gameWinner:-1,
  };
  startTurn();
}

function startTurn(){
  const alive=G.players.filter(p=>!p.bankrupt);
  if(alive.length<2){G.phase='GAMEOVER';render();return;}

  for(const p of G.players){
    p.hand=[];p.bet=0;p.inv=0;
    p.stayed=false;p.busted=false;p.roundWon=false;
  }
  G.mc=null; UI.revealed=false; UI.modal=null;

  G.order=[];
  for(let i=0;i<G.players.length;i++){
    const idx=(G.dealerI+i)%G.players.length;
    if(!G.players[idx].bankrupt)G.order.push(idx);
  }

  if(G.deck.length<G.order.length*4+5)G.deck=shuffle(makeDeck());
  for(const pi of G.order)G.players[pi].hand=[G.deck.pop(),G.deck.pop()];
  G.mc=G.deck.pop();

  lg(`── 턴 ${G.turn} 시작 | 딜러: ${G.players[G.dealerI].name} ──`,'imp');
  G.phase='BETTING';G.curI=0;
  if(isHost) broadcastState();
  render();
}

function curP(){return G.players[G.order[G.curI]];}

// ── Actual Execution Functions (Only called by dispatchAction) ──
function actualDoBet(amount){
  const p=curP();
  const minBet=G.curI===0?1:G.players[G.order[0]].bet;
  if(amount<minBet){alert(`최소 베팅: ${minBet}`);return;}
  if(p.chips<amount){alert('칩이 부족합니다!');return;}
  p.bet=amount;p.chips-=amount;G.pot+=amount;
  lg(`${p.name}: ${amount} 베팅`);
  G.curI++;
  if(G.curI>=G.order.length){G.phase='INVESTMENT';G.curI=0;}
}

function actualDoInvest(amount){
  const p=curP();
  if(amount>MAX_INV){alert(`최대 투자: ${MAX_INV}`);return;}
  if(p.chips<amount){alert('칩이 부족합니다!');return;}
  if(amount%2!==0){alert('투자는 짝수 단위만 가능합니다 (0,2,4…)');return;}
  p.inv=amount;
  if(amount>0)p.chips-=amount;
  lg(amount>0?`${p.name}: ${amount} 투자`:`${p.name}: 투자 없음`);
  G.curI++;
  if(G.curI>=G.order.length){
    G.phase='HANDVIEW';G.curI=0;UI.revealed=false;
  }
}

function actualConfirmView(){
  G.curI++;
  if(G.curI>=G.order.length){G.phase='HITSTAY';G.curI=0;skipStayed();}
}

function skipStayed(){
  while(G.curI<G.order.length&&G.players[G.order[G.curI]].stayed)G.curI++;
}

function actualDoHit(){
  const p=curP();
  if(p.chips<HIT_COST){alert('빨간칩 1개(5) 부족합니다. 대출을 받으세요.');return;}
  p.chips-=HIT_COST;
  const card=G.deck.pop();
  p.hand.push(card);
  const v=hv(p.hand);
  lg(`${p.name}: 히트 → ${cardStr(card)} (합계 ${v})`);
  if(v>21){
    p.busted=true;p.stayed=true;
    lg(`${p.name}: BUST! (${v})`,'bad');
    advHS();
  }
}

function actualDoStay(){
  curP().stayed=true;
  lg(`${curP().name}: 스테이 (${hv(curP().hand)})`);
  advHS();
}

function advHS(){
  G.curI++;
  skipStayed();
  if(G.curI>=G.order.length)doShowdown();
}

function invMult(c){
  if(c.joker)return 3;
  if(c.r==='A')return 2;
  if('JQK'.includes(c.r))return 1.5;
  const n=parseInt(c.r);
  if(n>=8&&n<=10)return 1;
  return 0.5;
}
function invDesc(c){
  if(c.joker)return 'JOKER → 300% 수익';
  if(c.r==='A')return 'A → 200% 수익';
  if('JQK'.includes(c.r))return 'J/Q/K → 150% 수익';
  const n=parseInt(c.r);
  if(n>=8&&n<=10)return '8~10 → 원금 회수';
  return '2~7 → 50% 회수 (손실)';
}

function doShowdown(){
  G.phase='SHOWDOWN';
  lg(`미스터리 카드 공개: ${cardStr(G.mc)}`,'imp');
  lg(invDesc(G.mc));

  const mult=invMult(G.mc);
  for(const pi of G.order){
    const p=G.players[pi];
    if(!p.inv)continue;
    const back=Math.floor(p.inv*mult);
    p.chips+=back;
    const net=back-p.inv;
    lg(`${p.name} 투자: ${p.inv}→${back} (${net>=0?'+':''}${net})`,(net>0?'good':'bad'));
  }

  for(const pi of G.order){
    const p=G.players[pi];
    if(!p.busted)continue;
    const half=Math.floor(p.chips/2);
    p.chips-=half;
    lg(`${p.name} 버스트 패널티: -${half} (은행 반납)`,'bad');
  }

  for(const pi of G.order){
    const p=G.players[pi];
    if(!p.busted&&hv(p.hand)===21){
      p.chips+=625;
      lg(`${p.name}: 블랙잭 21! 검은칩 +1 (+625)`,'good');
    }
  }

  const alive=G.order.filter(pi=>!G.players[pi].busted);
  if(!alive.length){
    G.store+=G.pot;G.pot=0;
    lg('모두 버스트 → 팟 이월','bad');
  }else{
    const best=Math.max(...alive.map(pi=>hv(G.players[pi].hand)));
    const wins=alive.filter(pi=>hv(G.players[pi].hand)===best);
    if(wins.length>1){
      G.store+=G.pot;G.pot=0;
      wins.forEach(pi=>G.players[pi].roundWon=true);
      lg(`동점(${best}점) → 팟 이월`,'imp');
    }else{
      const wp=G.players[wins[0]];
      const prize=G.pot+G.store;
      wp.chips+=prize;wp.roundWon=true;
      G.store=0;G.pot=0;
      lg(`🏆 ${wp.name} 승리! +${prize} (${best}점)`,'good');
    }
  }
}

function actualDoNextTurn(){
  for(const p of G.players){
    if(!p.loan)continue;
    const int=Math.ceil(p.loan*LOAN_RATE);
    if(p.chips>=int){
      p.chips-=int; lg(`${p.name}: 이자 ${int} 납부`,'bad');
    }else{
      const diff=int-p.chips;
      p.loan+=diff;p.chips=0;
      lg(`${p.name}: 이자 납부 불가 → 대출 +${diff}`,'bad');
    }
  }

  for(const p of G.players){
    if(!p.loan&&p.chips>=WIN_TARGET){
      G.gameWinner=G.players.indexOf(p);
      G.phase='GAMEOVER';
      lg(`🎉 ${p.name} 최종 승리! 빚 없이 검은칩 10개!`,'imp');
      return;
    }
  }

  for(const p of G.players){
    if(p.bankrupt)continue;
    if(p.loan>=BK_LOAN&&p.chips<5){
      p.bankrupt=true;
      const others=G.players.filter(x=>x!==p&&!x.bankrupt);
      const fee=ENTRY_FEE*others.length;
      const fromChips=Math.min(p.chips,fee);
      p.chips-=fromChips;
      if(fee>fromChips)p.loan+=fee-fromChips;
      others.forEach(o=>o.chips+=ENTRY_FEE);
      lg(`💀 ${p.name} 파산! 입장료 지급`,'bad');
    }
  }

  do{G.dealerI=(G.dealerI+1)%G.players.length;}
  while(G.players[G.dealerI].bankrupt);

  G.turn++;startTurn();
}

function actualDoTakeLoan(amt){
  const p=curP();
  p.chips+=amt;p.loan+=amt;
  lg(`${p.name}: 대출 ${amt} (총 ${p.loan})`,'bad');
  UI.modal=null;
}

function actualDoRepay(actual){
  const p=curP();
  p.chips-=actual;p.loan-=actual;
  lg(`${p.name}: ${actual} 상환 (잔액 ${p.loan})`);
  UI.modal=null;
}


// ═══════════════════════════════════════════════
//  RENDERING & UI INTERACTIONS
// ═══════════════════════════════════════════════
function render(){
  const app=document.getElementById('app');
  
  // 게임방에 접속했지만 방장이 아직 게임을 안만들었을 때
  if(isOnline && !isHost && !G){
    app.innerHTML = `
      <h1>🃏 Blackjack with Bank</h1>
      <div class="panel">
        <h2 style="text-align:center; color:var(--dim)">방장(${hostConn.peer})이 게임 설정을 진행 중입니다...<br>잠시만 기다려주세요.</h2>
      </div>`;
    return;
  }
  
  if(!G){app.innerHTML=renderSetup();return;}

  if(UI.modal==='loan'){app.innerHTML=renderLoanModal();return;}
  if(UI.modal==='repay'){app.innerHTML=renderRepayModal();return;}
  if(G.phase==='HANDVIEW'){app.innerHTML=renderHandViewScreen();return;}

  let h=`<h1>🃏 Blackjack with Bank</h1>`;
  if(isOnline) h+=`<p class="sub" style="color:#50e090">온라인 방 코드: ${isHost?roomId:hostConn.peer}</p>`;
  h+=`<p class="sub">턴 ${G.turn} &nbsp;|&nbsp; 팟 ${G.pot.toLocaleString()} &nbsp;|&nbsp; 이월 ${G.store.toLocaleString()}</p>`;

  h+=renderPlayersGrid();
  h+=renderPhaseArea();
  h+=`<div class="log">${G.log.slice(0,25).map(e=>`<div class="le ${e.t}">${e.m}</div>`).join('')}</div>`;
  app.innerHTML=h;
}

// ── Setup (방식 선택 기능 추가) ──
function renderSetup(){
  const n=SU.n;
  
  let modeHTML = `
    <div class="gap" style="margin-bottom:15px; justify-content:center;">
      <button class="btn ${SU.mode==='local'?'gold':'dim'}" onclick="SU.mode='local';render()">로컬 플레이</button>
      <button class="btn ${SU.mode==='host'?'gold':'dim'}" onclick="SU.mode='host';render()">온라인 방 만들기</button>
      <button class="btn ${SU.mode==='client'?'gold':'dim'}" onclick="SU.mode='client';render()">온라인 참가</button>
    </div>
  `;

  let contentHTML = '';

  if (SU.mode === 'client') {
    contentHTML = `
      <div class="mb">
        <p style="color:var(--dim);font-size:.9rem;margin-bottom:8px">방 코드 입력</p>
        <input type="text" id="joinId" placeholder="방 코드" style="width:100%">
      </div>
      <button class="btn gold" style="width:100%; margin-top:10px;" onclick="joinRoom()">방 접속하기</button>
    `;
  } else {
    contentHTML = `
      <div class="mb">
        <p style="color:var(--dim);font-size:.9rem;margin-bottom:8px">플레이어 수</p>
        <div class="gap">
          ${[2,3,4,5,6].map(i=>`<button class="btn ${i===n?'gold':'dim'}" onclick="setSN(${i})">${i}명</button>`).join('')}
        </div>
      </div>
      <div class="mb">
        <p style="color:var(--dim);font-size:.9rem;margin-bottom:8px">플레이어 이름</p>
        <div style="display:grid;gap:8px">
          ${Array.from({length:n},(_,i)=>`<input type="text" id="pn${i}" value="${SU.names[i]||'플레이어'+(i+1)}" style="width:100%">`).join('')}
        </div>
      </div>
      <button class="btn gold" style="width:100%" onclick="SU.mode==='host'?initHost():startSetup()">${SU.mode==='host'?'방 만들고 시작':'게임 시작'}</button>
    `;
  }

  return`
  <h1>🃏 Blackjack with Bank</h1>
  <div class="panel gold">
    <h2 class="mb" style="text-align:center">게임 모드</h2>
    ${modeHTML}
    ${contentHTML}
    <div class="setup-info mt" style="margin-top:20px;">
      <b>게임 규칙 요약</b><br>
      시작 칩: ${START_VAL.toLocaleString()} &nbsp;|&nbsp; 입장료: ${ENTRY_FEE.toLocaleString()}<br>
      승리: 빚 없이 ${WIN_TARGET.toLocaleString()} (검은칩 10개)<br>
      파산: 대출 ≥${BK_LOAN.toLocaleString()} + 빨간칩 없음
    </div>
  </div>`;
}

function setSN(n){
  for(let i=0;i<SU.n;i++){
    const el=document.getElementById(`pn${i}`);
    if(el)SU.names[i]=el.value;
  }
  SU.n=n;
  for(let i=SU.names.length;i<n;i++)SU.names.push(`플레이어${i+1}`);
  render();
}
function startSetup(){
  const n=SU.n,names=[];
  for(let i=0;i<n;i++){
    const el=document.getElementById(`pn${i}`);
    const nm=el?el.value.trim()||`플레이어${i+1}`:`플레이어${i+1}`;
    names.push(nm);SU.names[i]=nm;
  }
  initGame(names);
}

// UI Rendering Functions (Grid, Phase, Modal)
function renderPlayersGrid(){
  let h=`<div class="pgrid">`;
  for(let pi=0;pi<G.players.length;pi++){
    const p=G.players[pi];
    const isDealer=pi===G.dealerI;
    const isCur=G.order[G.curI]===pi&&G.phase!=='SHOWDOWN'&&G.phase!=='GAMEOVER';
    let cls='panel';
    if(p.bankrupt)cls+=' bad';
    else if(p.busted&&G.phase==='SHOWDOWN')cls+=' bad';
    else if(p.roundWon)cls+=' win';
    else if(isCur)cls+=' hi';
    else if(isDealer)cls+=' gold';

    const showHand=G.phase==='SHOWDOWN'||(G.phase==='HITSTAY'&&isCur);

    h+=`<div class="${cls}">
      <div class="gap mb">
        <span style="font-family:'Playfair Display',serif;color:var(--gold2)">${p.name}</span>
        ${isDealer?`<span class="pb dealer">딜러</span>`:''}
        ${isCur?`<span class="pb cur">차례</span>`:''}
        ${p.bankrupt?`<span class="pb bk">파산</span>`:''}
        ${p.busted&&!p.bankrupt&&G.phase==='SHOWDOWN'?`<span class="pb bust">버스트</span>`:''}
        ${p.roundWon?`<span class="pb wn">승</span>`:''}
      </div>
      ${chipHTML(p.chips)}
      ${p.loan?`<div style="color:#d05040;font-size:.78rem;margin-top:3px">대출: ${p.loan.toLocaleString()}</div>`:''}
      ${p.bet?`<div style="font-size:.78rem;color:var(--dim);margin-top:2px">베팅: ${p.bet}</div>`:''}
      ${p.inv?`<div style="font-size:.78rem;color:var(--dim)">투자: ${p.inv}</div>`:''}
      ${showHand?`<div class="mt">${handHTML(p.hand,true)}<div style="font-size:.82rem;color:${hv(p.hand)>21?'#d05040':'var(--dim)'};margin-top:4px">${hv(p.hand)}점</div></div>`:''}
    </div>`;
  }
  return h+'</div>';
}

function renderPhaseArea(){
  switch(G.phase){
    case 'BETTING':  return renderBetting();
    case 'INVESTMENT':return renderInvestment();
    case 'HITSTAY':  return renderHitStay();
    case 'SHOWDOWN': return renderShowdown();
    case 'GAMEOVER': return renderGameOver();
    default:         return '';
  }
}

// ── Button UI Actions (Calls dispatchAction) ──
function submitBet(){
  const v=parseInt(document.getElementById('betI')?.value||0);
  dispatchAction('BET', v);
}

function submitInv(forced){
  const v=forced!=null?forced:parseInt(document.getElementById('invS')?.value||0);
  dispatchAction('INVEST', v);
}

function confirmView(){
  UI.revealed=false;
  dispatchAction('CONFIRM_VIEW');
}

function quickBet(v){
  document.getElementById('betI').value=v;
  document.getElementById('bv').textContent=v;
}

// ── UI View Helpers ──
function renderBetting(){
  const p=curP();
  const minB=G.curI===0?1:G.players[G.order[0]].bet;
  const maxB=p.chips;
  const presets=[minB,...[.25,.5,1].map(f=>Math.round(maxB*f))].filter((v,i,a)=>a.indexOf(v)===i&&v>=minB&&v<=maxB);
  return`
  <div class="panel gold">
    <div class="badge">베팅 단계</div>
    <h2>${p.name}님의 베팅 차례</h2>
    <div class="info">
      <div>현재 칩 <span>${p.chips.toLocaleString()}</span></div>
      <div>최소 베팅 <span>${minB}</span></div>
      ${G.pot?`<div>팟 <span>${G.pot}</span></div>`:''}
      ${G.store?`<div>이월 <span>${G.store}</span></div>`:''}
    </div>
    <div style="margin:14px 0">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <input type="range" min="${minB}" max="${maxB}" value="${minB}" step="1"
          oninput="document.getElementById('bv').textContent=this.value;document.getElementById('betI').value=this.value">
        <span class="rv" id="bv">${minB}</span>
      </div>
      <div style="font-size:.8rem;color:var(--dim);margin-bottom:6px">직접 입력:
        <input type="number" id="betI" value="${minB}" min="${minB}" max="${maxB}" style="width:110px;margin-left:6px"
          oninput="document.getElementById('bv').textContent=this.value">
      </div>
    </div>
    <div class="btns">
      ${presets.map(v=>`<button class="btn dim sm" onclick="quickBet(${v})">${v}</button>`).join('')}
    </div>
    <div class="btns">
      <button class="btn gold" onclick="submitBet()">베팅 확정</button>
      <button class="btn dim" onclick="UI.modal='loan';render()">💳 대출</button>
      ${p.loan?`<button class="btn dim" onclick="UI.modal='repay';render()">상환</button>`:''}
    </div>
  </div>`;
}

function renderInvestment(){
  const p=curP();
  const maxI=Math.min(MAX_INV,Math.floor(p.chips/2)*2);
  return`
  <div class="panel gold">
    <div class="badge">투자 단계</div>
    <h2>${p.name}님의 투자 차례</h2>
    <p style="color:var(--dim);font-size:.88rem;margin-bottom:10px">
      숨겨진 미스터리 카드에 투자합니다. (최대 파란칩 2개=250, 짝수 단위)
    </p>
    <div class="info">
      <div>현재 칩 <span>${p.chips.toLocaleString()}</span></div>
      <div>최대 투자 <span>${maxI}</span></div>
    </div>
    <div style="margin:14px 0">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
        <input type="range" id="invS" min="0" max="${maxI}" value="0" step="2"
          oninput="document.getElementById('iv').textContent=this.value">
        <span class="rv" id="iv">0</span>
      </div>
    </div>
    <div class="btns">
      <button class="btn dim" onclick="submitInv(0)">투자 안 함</button>
      <button class="btn gold" onclick="submitInv()">투자 확정</button>
      <button class="btn dim" onclick="UI.modal='loan';render()">💳 대출</button>
      ${p.loan?`<button class="btn dim" onclick="UI.modal='repay';render()">상환</button>`:''}
    </div>
  </div>`;
}

function renderHandViewScreen(){
  const p=G.players[G.order[G.curI]];
  if(!UI.revealed){
    return`
    <div class="prv">
      <div style="font-size:4rem;margin-bottom:16px">🙈</div>
      <h2>${p.name}님 이외 시선을 돌려주세요</h2>
      <button class="btn gold" onclick="UI.revealed=true;render()">내 카드 확인하기</button>
    </div>`;
  }
  const v=hv(p.hand);
  return`
  <div class="prv">
    <h2 style="margin-bottom:16px">${p.name}님의 패</h2>
    ${handHTML(p.hand,true)}
    <div style="font-size:1.5rem;margin:14px 0;color:${v>21?'#d05040':v===21?'#40d080':'var(--gold2)'}">${v}점 ${v===21?'🎉':''}</div>
    <button class="btn gold" onclick="confirmView()" style="margin-top:22px">확인 완료</button>
  </div>`;
}

function renderHitStay(){
  if(G.curI>=G.order.length){doShowdown();return'';}
  const p=curP();
  const v=hv(p.hand);
  return`
  <div class="panel gold">
    <div class="badge">히트 / 스테이</div>
    <h2>${p.name}님의 차례</h2>
    <div style="margin:12px 0">
      ${handHTML(p.hand,true)}
      <div style="font-size:1.2rem;margin-top:8px;color:${v>21?'#d05040':v===21?'#40d080':'var(--gold2)'}">${v}점</div>
    </div>
    <div class="btns">
      <button class="btn red" onclick="dispatchAction('HIT')" ${p.chips<HIT_COST||v>21?'disabled':''}>🃏 히트 (-5)</button>
      <button class="btn green" onclick="dispatchAction('STAY')">✋ 스테이</button>
      <button class="btn dim" onclick="UI.modal='loan';render()">💳 대출</button>
      ${p.loan?`<button class="btn dim" onclick="UI.modal='repay';render()">상환</button>`:''}
    </div>
  </div>`;
}

function renderShowdown(){
  const mult=invMult(G.mc);
  const desc=invDesc(G.mc);
  return`
  <div class="table-center">
    <h2 style="margin-bottom:12px">미스터리 카드</h2>
    <div>${cardHTML(G.mc,false)}</div>
    <div style="color:var(--gold2);font-size:1.05rem;margin-top:10px">${desc}</div>
  </div>
  <div class="panel gold">
    <h2 class="mb">결과</h2>
    ${G.order.map(pi=>{
      const p=G.players[pi];
      const v=hv(p.hand);
      return`<div class="res-row ${p.roundWon?'rwin':p.busted?'rbust':''}">
        <div style="min-width:90px"><b style="color:var(--gold2)">${p.name}</b> ${p.roundWon?'🏆':''}</div>
        ${handHTML(p.hand,true)} <div style="font-size:.88rem"><b>${v}점</b></div>
      </div>`;
    }).join('')}
    <div class="btns">
      <button class="btn gold" onclick="dispatchAction('NEXT_TURN')">다음 턴 →</button>
    </div>
  </div>`;
}

function renderGameOver(){
  const w=G.gameWinner>=0?G.players[G.gameWinner]:null;
  return`
  <div class="panel gold" style="text-align:center;padding:30px">
    <h2 style="font-size:1.9rem;margin-bottom:12px">${w?`${w.name} 최종 승리!`:'게임 종료'}</h2>
    <button class="btn gold" onclick="G=null; isOnline=false; isHost=false; render()">처음으로</button>
  </div>`;
}

function renderLoanModal(){
  const p=curP();
  const maxL=Math.min(LOAN_MAX_T,p.chips);
  return`
  <div class="panel gold">
    <h2 class="mb">대출</h2>
    <div class="gap mt mb">
      <input type="number" id="loanA" min="1" max="${maxL}" placeholder="금액" style="width:160px">
      <button class="btn gold" onclick="const a=parseInt(document.getElementById('loanA').value); if(a>0&&a<=${maxL})dispatchAction('TAKE_LOAN',a)">대출</button>
      <button class="btn dim" onclick="UI.modal=null;render()">취소</button>
    </div>
  </div>`;
}

function renderRepayModal(){
  const p=curP();
  const mx=Math.min(p.loan,p.chips);
  return`
  <div class="panel gold">
    <h2 class="mb">대출 상환</h2>
    <div class="gap mt mb">
      <input type="number" id="repayA" min="1" max="${mx}" value="${mx}" style="width:160px">
      <button class="btn gold" onclick="const a=parseInt(document.getElementById('repayA').value); if(a>0&&a<=${mx})dispatchAction('REPAY',a)">상환</button>
      <button class="btn dim" onclick="UI.modal=null;render()">취소</button>
    </div>
  </div>`;
}

render();
