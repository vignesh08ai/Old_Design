/* ═══════════════════════════════════════════════════════
   INVESTMENT PORTFOLIO  app.js  v3
   Features: Live data · Add · Edit · Delete · Export
═══════════════════════════════════════════════════════ */
'use strict';

let PORTFOLIO   = null;
let LIVE        = {};
let activePanel = 'dashboard';
let sortState   = {};
let filterState = {};
let chartStore  = {};
let _editIdx    = null;   // index being edited, null = new
let _editType   = null;   // 'fd' | 'mf' | 'stock' | 'gold'

const CORS = 'https://corsproxy.io/?';
const AMFI = 'https://www.amfiindia.com/spages/NAVAll.txt';
const YF   = 'https://query1.finance.yahoo.com/v8/finance/chart/';

const STORAGE_KEY = 'portfolio_data_v1';
const GITHUB_TOKEN_KEY = 'github_token';
const GITHUB_REPO = 'vignesh08ai/InvestmentPortfolio_Vignesh';
const GITHUB_FILE_PATH = 'data/portfolio.json';
const COLUMN_VISIBILITY_KEY = 'column_visibility_v1';

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  console.log('[BOOT] Starting...');
  showSpinner('Loading portfolio…');
  try {
    // Try localStorage first (user edits), fall back to JSON file
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      console.log('[BOOT] Loading from localStorage');
      PORTFOLIO = JSON.parse(saved);
    } else {
      console.log('[BOOT] Fetching portfolio.json');
      PORTFOLIO = await fetch('./data/portfolio.json').then(r => r.json());
    }
    console.log('[BOOT] Portfolio loaded:', {
      fds: PORTFOLIO.fixedDeposits?.length,
      mfs: PORTFOLIO.mutualFunds?.length,
      stocks: PORTFOLIO.stocks?.length
    });
    
    console.log('[BOOT] Building nav...');
    buildNav();
    console.log('[BOOT] Building summary cards...');
    buildSummaryCards();
    console.log('[BOOT] Showing dashboard...');
    showPanel('dashboard');
    
    // Fetch live data - don't fail if this errors
    try {
      console.log('[BOOT] Fetching live data...');
      await fetchAllLiveData();
      console.log('[BOOT] Updating summary cards...');
      updateSummaryCards();
      console.log('[BOOT] Refreshing dashboard...');
      showPanel('dashboard'); // refresh with live data
      showToast('✓ Live prices loaded', 'success');
      document.getElementById('statusDot').className = 'status-dot live';
      console.log('[BOOT] ✓ Success!');
    } catch(liveErr) {
      console.error('[BOOT] Live data fetch failed:', liveErr);
      showToast('⚠ Live prices unavailable, showing cached values', 'warning');
      document.getElementById('statusDot').className = 'status-dot';
    }
  } catch(e) {
    console.error('[BOOT] CRITICAL ERROR:', e);
    showToast('⚠ Could not load portfolio data', 'error');
  }
  hideSpinner();
  document.getElementById('lastUpdated').textContent = 'Updated: ' + new Date().toLocaleTimeString('en-IN');
  console.log('[BOOT] Complete');
});

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(PORTFOLIO));
}

/* ═══════════════════════════════════════════════════════
   LIVE DATA
═══════════════════════════════════════════════════════ */
async function fetchAllLiveData() {
  console.log('[LIVE] Starting live data fetch...');
  const results = await Promise.allSettled([fetchMFNavs(), fetchStockAndGoldPrices()]);
  console.log('[LIVE] Fetch complete:', results.map((r,i) => ({
    task: i === 0 ? 'MF NAVs' : 'Stocks/Gold',
    status: r.status,
    error: r.reason?.message
  })));
}
async function fetchMFNavs() {
  try {
    const txt = await fetch(CORS + encodeURIComponent(AMFI), {cache:'no-store'}).then(r=>r.text());
    const map = {};
    txt.split('\n').forEach(line => {
      const p = line.split(';');
      if (p.length >= 5) { const n = parseFloat(p[4]); if (!isNaN(n)) map[p[0].trim()] = n; }
    });
    PORTFOLIO.mutualFunds.forEach(mf => {
      const nav = map[mf.schemeCode];
      if (nav) LIVE[mf.schemeCode] = { price: nav };
    });
  } catch(e) { console.error('[LIVE] AMFI fetch failed:', e); }
}
async function fetchStockAndGoldPrices() {
  const syms = [...(PORTFOLIO.stocks||[]).map(s=>s.symbol), ...(PORTFOLIO.gold||[]).map(g=>g.symbol), 'USDINR=X'];
  await Promise.allSettled(syms.map(fetchYF));
}
function getUsdInr() { return LIVE['USDINR=X']?.price || 84; }
async function fetchYF(sym) {
  try {
    const data = await fetch(CORS + encodeURIComponent(`${YF}${sym}?interval=1d&range=2d`), {cache:'no-store'}).then(r=>r.json());
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta) {
      const price = meta.regularMarketPrice || meta.previousClose;
      const prev  = meta.chartPreviousClose || meta.previousClose;
      LIVE[sym] = { price, change: price-prev, changePct:((price-prev)/prev)*100 };
    }
  } catch(e) { console.error('[LIVE] YF fetch failed for', sym, ':', e); }
}

/* ═══════════════════════════════════════════════════════
   CALCULATIONS
═══════════════════════════════════════════════════════ */
function calcMF(mf) {
  const live = LIVE[mf.schemeCode];
  const curNAV = live ? live.price : mf.purchaseNAV;
  const curVal = curNAV * mf.units;
  const gl = curVal - mf.invested;
  return { curNAV, curVal, gl, ret:(gl/mf.invested)*100, isLive:!!live };
}
function calcStock(s) {
  const live = LIVE[s.symbol];
  const curPrice = live ? live.price : s.avgPrice;
  const curVal = curPrice * s.units;
  const gl = curVal - s.invested;
  return { curPrice, curVal, gl, ret:(gl/s.invested)*100, isLive:!!live };
}
function calcGold(g) {
  const live = LIVE[g.symbol];
  const curPrice = live ? live.price : g.purchasePrice;
  const curVal = curPrice * g.units;
  const gl = curVal - g.invested;
  return { curPrice, curVal, gl, ret:(gl/g.invested)*100, isLive:!!live };
}
function calcFD(fd) {
  const today   = new Date();
  const start   = new Date(fd.startDate);
  const mat     = new Date(fd.maturityDate);
  const elapsed = Math.max(0, Math.round((today-start)/86400000));
  const daysLeft= Math.max(0, Math.round((mat-today)/86400000));
  const accrued = fd.invested*(fd.rate/100)*(elapsed/365);
  const curVal  = fd.invested + accrued;
  const gl      = curVal - fd.invested;
  return { curVal, gl, daysLeft, ret:(gl/fd.invested)*100 };
}
function getAssetTotals() {
  const groups = [
    { label:'Fixed Deposits', icon:'🏛', items:PORTFOLIO.fixedDeposits,
      sum:items=>items.reduce((a,i)=>{const c=calcFD(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal};},{inv:0,cur:0})},
    { label:'MF — Mahesh', icon:'📈', items:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh'),
      sum:items=>items.reduce((a,i)=>{const c=calcMF(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal};},{inv:0,cur:0})},
    { label:'MF — Family', icon:'👨‍👩‍👧', items:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family'),
      sum:items=>items.reduce((a,i)=>{const c=calcMF(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal};},{inv:0,cur:0})},
    { label:'Indian Equity', icon:'📊', items:PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ'),
      sum:items=>items.reduce((a,i)=>{const c=calcStock(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal};},{inv:0,cur:0})},
    { label:'US Equity', icon:'🇺🇸', items:PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ'),
      sum:items=>items.reduce((a,i)=>{const c=calcStock(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal};},{inv:0,cur:0})},
    { label:'Gold / SGB', icon:'🥇', items:PORTFOLIO.gold||[],
      sum:items=>items.reduce((a,i)=>{const c=calcGold(i);return{inv:a.inv+i.invested,cur:a.cur+c.curVal};},{inv:0,cur:0})},
  ].filter(g=>g.items.length>0);
  return groups.map(g=>{
    const {inv,cur}=g.sum(g.items); const gl=cur-inv; const ret=inv>0?(gl/inv)*100:0;
    return {...g,inv,cur,gl,ret};
  });
}
function getPortfolioTotal() {
  const at=getAssetTotals();
  const t=at.reduce((a,g)=>({inv:a.inv+g.inv,cur:a.cur+g.cur,gl:a.gl+g.gl}),{inv:0,cur:0,gl:0});
  return {...t,ret:t.inv>0?(t.gl/t.inv)*100:0};
}

/* ═══════════════════════════════════════════════════════
   SUMMARY CARDS
═══════════════════════════════════════════════════════ */
function buildSummaryCards() {
  document.getElementById('summaryGrid').innerHTML = `
    <div class="scard scard-accent"><div class="sc-icon">💼</div><div class="sc-label">Total Portfolio</div><div class="sc-value" id="sc-total-val">—</div><div class="sc-sub" id="sc-total-sub">—</div></div>
    <div class="scard scard-red"><div class="sc-icon">📉</div><div class="sc-label">Total Gain / Loss</div><div class="sc-value" id="sc-gl-val">—</div><div class="sc-sub" id="sc-gl-sub">—</div></div>
    <div class="scard scard-teal"><div class="sc-icon">🏛</div><div class="sc-label">Fixed Deposits</div><div class="sc-value gain" id="sc-fd-val">—</div><div class="sc-sub gain" id="sc-fd-sub">—</div></div>
    <div class="scard scard-accent"><div class="sc-icon">📈</div><div class="sc-label">Mutual Funds</div><div class="sc-value" id="sc-mf-val">—</div><div class="sc-sub" id="sc-mf-sub">—</div></div>
    <div class="scard scard-purple"><div class="sc-icon">📊</div><div class="sc-label">Stocks</div><div class="sc-value" id="sc-stk-val">—</div><div class="sc-sub" id="sc-stk-sub">—</div></div>
    <div class="scard scard-gold"><div class="sc-icon">🥇</div><div class="sc-label">Gold / SGB</div><div class="sc-value gold" id="sc-gld-val">—</div><div class="sc-sub gold" id="sc-gld-sub">—</div></div>`;
}
function updateSummaryCards() {
  const at=getAssetTotals(), tot=getPortfolioTotal();
  setCard('sc-total',fmtINR(tot.cur),'Invested '+fmtINR(tot.inv),'',tot.gl>=0?'gain':'loss');
  setCard('sc-gl',(tot.gl>=0?'+':'')+fmtINR(tot.gl),tot.ret.toFixed(2)+'% return',tot.gl>=0?'gain':'loss',tot.gl>=0?'gain':'loss');
  const fd=at.find(a=>a.label==='Fixed Deposits');
  const mfm=at.find(a=>a.label==='MF — Mahesh'), mff=at.find(a=>a.label==='MF — Family');
  const nse=at.find(a=>a.label==='Indian Equity'), nas=at.find(a=>a.label==='US Equity');
  const gld=at.find(a=>a.label==='Gold / SGB');
  if(fd) setCard('sc-fd',fmtINR(fd.cur),'+'+fd.ret.toFixed(2)+'% accrued','gain','gain');
  const mfInv=(mfm?.inv||0)+(mff?.inv||0),mfCur=(mfm?.cur||0)+(mff?.cur||0),mfGL=mfCur-mfInv,mfRet=mfInv>0?(mfGL/mfInv)*100:0;
  setCard('sc-mf',fmtINR(mfCur),(mfGL>=0?'+':'')+mfRet.toFixed(2)+'% return',mfGL>=0?'gain':'loss',mfGL>=0?'gain':'loss');
  const sInv=(nse?.inv||0)+(nas?.inv||0),sCur=(nse?.cur||0)+(nas?.cur||0),sGL=sCur-sInv,sRet=sInv>0?(sGL/sInv)*100:0;
  setCard('sc-stk',fmtINR(sCur),(sGL>=0?'+':'')+sRet.toFixed(2)+'% return',sGL>=0?'gain':'loss',sGL>=0?'gain':'loss');
  if(gld) setCard('sc-gld',fmtINR(gld.cur),'+'+gld.ret.toFixed(2)+'% return','gold','gold');
}
function setCard(id,val,sub,vCls,sCls){
  const v=document.getElementById(id+'-val'),s=document.getElementById(id+'-sub');
  if(v){v.textContent=val;v.className='sc-value '+(vCls||'');}
  if(s){s.textContent=sub;s.className='sc-sub '+(sCls||'');}
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════ */
function buildNav() {
  const panels=[
    {id:'dashboard',  label:'Dashboard',     icon:'🏠'},
    {id:'fd',         label:'Fixed Deposits',icon:'🏛',  count:PORTFOLIO.fixedDeposits.length},
    {id:'mf-mahesh',  label:'MF — Mahesh',   icon:'📈',  count:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh').length},
    {id:'mf-family',  label:'MF — Family',   icon:'👨‍👩‍👧', count:PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family').length},
    {id:'stocks-nse', label:'Indian Equity',  icon:'📊',  count:PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ').length},
    {id:'stocks-nas', label:'US Equity',      icon:'🇺🇸', count:PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ').length},
    {id:'gold',       label:'Gold / SGB',    icon:'🥇',  count:(PORTFOLIO.gold||[]).length},
  ].filter(p=>p.count===undefined||p.count>=0);
  document.getElementById('sideNav').innerHTML=`<div class="nav-section"><div class="nav-label">Navigation</div>
    ${panels.map(p=>`<button class="nav-item" id="nav-${p.id}" onclick="showPanel('${p.id}')">
      <span class="icon">${p.icon}</span>${p.label}${p.count!=null?`<span class="nav-badge" id="badge-${p.id}">${p.count}</span>`:''}</button>`).join('')}
  </div>`;
}
function updateBadges() {
  const counts={
    'fd':PORTFOLIO.fixedDeposits.length,
    'mf-mahesh':PORTFOLIO.mutualFunds.filter(m=>m.owner==='Mahesh').length,
    'mf-family':PORTFOLIO.mutualFunds.filter(m=>m.owner==='Family').length,
    'stocks-nse':PORTFOLIO.stocks.filter(s=>s.exchange!=='NASDAQ').length,
    'stocks-nas':PORTFOLIO.stocks.filter(s=>s.exchange==='NASDAQ').length,
    'gold':(PORTFOLIO.gold||[]).length,
  };
  Object.entries(counts).forEach(([id,n])=>{const b=document.getElementById('badge-'+id);if(b)b.textContent=n;});
}

/* ═══════════════════════════════════════════════════════
   PANEL ROUTER
═══════════════════════════════════════════════════════ */
function showPanel(id) {
  activePanel=id;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const nb=document.getElementById('nav-'+id); if(nb) nb.classList.add('active');
  
  // Show/hide summary cards - only show on dashboard
  const summarySection = document.querySelector('.section-title');
  const summaryGrid = document.getElementById('summaryGrid');
  if (id === 'dashboard') {
    if (summarySection) summarySection.style.display = 'block';
    if (summaryGrid) summaryGrid.style.display = 'grid';
  } else {
    if (summarySection) summarySection.style.display = 'none';
    if (summaryGrid) summaryGrid.style.display = 'none';
  }
  Object.keys(chartStore).forEach(k=>{try{chartStore[k].destroy();}catch(e){}});
  chartStore={};
  const mc=document.getElementById('mainContent');
  mc.innerHTML='';
  const div=document.createElement('div');
  div.className='panel active'; div.id='panel-'+id;
  mc.appendChild(div);
  switch(id){
    case 'dashboard':  buildDashboard(div); break;
    case 'fd':         buildFDPanel(div); break;
    case 'mf-mahesh':  buildMFPanel(div,'Mahesh'); break;
    case 'mf-family':  buildMFPanel(div,'Family'); break;
    case 'stocks-nse': buildStocksPanel(div,'NSE'); break;
    case 'stocks-nas': buildStocksPanel(div,'NASDAQ'); break;
    case 'gold':       buildGoldPanel(div); break;
  }
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════ */
function buildDashboard(el) {
  const at=getAssetTotals();
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
      <div class="chart-card">
        <div class="chart-card-title">Asset Class Performance</div>
        ${at.map(a=>`<div class="perf-row">
          <span class="perf-icon">${a.icon}</span>
          <span class="perf-label">${a.label}</span>
          <span class="perf-invested">${fmtINR(a.inv)}</span>
          <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${Math.min(Math.abs(a.ret),100)}%;background:${a.gl>=0?'#059669':'#dc2626'}"></div></div>
          <span class="perf-ret ${a.gl>=0?'gain':'loss'}">${a.gl>=0?'+':''}${a.ret.toFixed(2)}%</span>
        </div>`).join('')}
      </div>
      <div class="chart-card"><div class="chart-card-title">Portfolio Allocation</div><canvas id="dbPie" height="230"></canvas></div>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><div class="chart-card-title">Invested vs Current Value</div><canvas id="dbBar"></canvas></div>
      <div class="chart-card"><div class="chart-card-title">Return % by Asset Class</div><canvas id="dbRet"></canvas></div>
    </div>`;
  setTimeout(()=>{
    const labels=at.map(a=>a.label),gc='rgba(0,0,0,0.05)',tc='#64748b',bf={family:"'Plus Jakarta Sans',sans-serif",size:11};
    const pal=['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#b45309'];
    newChart('dbPie','doughnut',{labels,datasets:[{data:at.map(a=>a.inv),backgroundColor:pal,borderWidth:2,borderColor:'#fff'}]},
      {cutout:'62%',plugins:{legend:{position:'right',labels:{color:tc,font:bf,boxWidth:10}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtINR(c.raw)}`}}}});
    newChart('dbBar','bar',{labels,datasets:[{label:'Invested',data:at.map(a=>a.inv),backgroundColor:'#bfdbfe',borderRadius:5},{label:'Current',data:at.map(a=>a.cur),backgroundColor:at.map(a=>a.gl>=0?'#6ee7b7':'#fca5a5'),borderRadius:5}]},
      {scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>shortINR(v)},grid:{color:gc}}},plugins:{legend:{labels:{color:tc,font:bf}},tooltip:{callbacks:{label:c=>fmtINR(c.raw)}}}});
    newChart('dbRet','bar',{labels,datasets:[{label:'Return %',data:at.map(a=>a.ret),backgroundColor:at.map(a=>a.gl>=0?'#6ee7b7':'#fca5a5'),borderRadius:5}]},
      {scales:{x:{ticks:{color:tc,font:{size:9}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>v.toFixed(1)+'%'},grid:{color:gc}}},plugins:{legend:{labels:{color:tc,font:bf}},tooltip:{callbacks:{label:c=>c.raw.toFixed(2)+'%'}}}});
  },50);
}

/* ═══════════════════════════════════════════════════════
   FIXED DEPOSITS PANEL
═══════════════════════════════════════════════════════ */
function buildFDPanel(el) {
  const id='fd';
  if(!sortState[id])  sortState[id]={col:'maturityDate',asc:true};
  if(!filterState[id]) filterState[id]={q:''};
  const cols=[
    {key:'bank',        label:'Bank',         fn:v=>`<span class="mono">${v}</span>`},
    {key:'fdNumber',    label:'FD No.',        fn:v=>`<span class="mono">${v}</span>`},
    {key:'invested',    label:'Invested',      fn:v=>fmtINR(v)},
    {key:'rate',        label:'Rate',          fn:v=>`<span class="chip blue">${v.toFixed(1)}%</span>`},
    {key:'startDate',   label:'Start',         fn:v=>`<span class="mono">${v}</span>`},
    {key:'maturityDate',label:'Maturity',      fn:v=>`<span class="mono">${v}</span>`},
    {key:'_daysLeft',   label:'Days Left',     fn:(_,r)=>`<span class="mono">${calcFD(r).daysLeft}d</span>`},
    {key:'maturityValue',label:'Maturity Val', fn:(_,r)=>fmtINR(r.maturityValue)},
    {key:'_curVal',     label:'Current Value', fn:(_,r)=>fmtINR(calcFD(r).curVal)},
    {key:'_gl',         label:'Gain',          fn:(_,r)=>chipGL(calcFD(r).gl)},
    {key:'_ret',        label:'Return',        fn:(_,r)=>chipRet(calcFD(r).ret)},
    {key:'status',      label:'Status',        fn:v=>`<span class="chip active">${v}</span>`},
    {key:'_actions',    label:'Actions',       fn:(_,r,i)=>rowActions('fd',i)},
  ];
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML=mkControls(id,false,'fd','',cols)+mkTable(id,visibleCols);console.log("[DEBUG] FD controls rendered");
  renderTable(id,visibleCols,PORTFOLIO.fixedDeposits);
}

/* ═══════════════════════════════════════════════════════
   MUTUAL FUNDS PANEL
═══════════════════════════════════════════════════════ */
function buildMFPanel(el,owner) {
  const id='mf-'+owner.toLowerCase();
  if(!sortState[id])  sortState[id]={col:'invested',asc:false};
  if(!filterState[id]) filterState[id]={q:'',filter:'all'};
  const cols=[
    {key:'name',       label:'Fund Name',    fn:v=>`<div class="fund-name-cell"><span class="name" title="${v}">${v}</span></div>`},
    {key:'schemeCode', label:'Scheme Code',  fn:v=>`<span class="mono">${v}</span>`},
    {key:'units',      label:'Units',         fn:v=>`<span class="mono">${v.toFixed(3)}</span>`},
    {key:'purchaseNAV',label:'Buy NAV',       fn:v=>fmtINR(v)},
    {key:'invested',   label:'Invested',      fn:v=>fmtINR(v)},
    {key:'_curNAV',    label:'Live NAV',      fn:(_,r)=>{const c=calcMF(r);return liveCell(c.curNAV,c.isLive);}},
    {key:'_curVal',    label:'Current Value', fn:(_,r)=>fmtINR(calcMF(r).curVal)},
    {key:'_gl',        label:'Gain / Loss',   fn:(_,r)=>chipGL(calcMF(r).gl)},
    {key:'_ret',       label:'Return %',      fn:(_,r)=>chipRet(calcMF(r).ret)},
    {key:'_actions',   label:'Actions',       fn:(_,r,i)=>rowActions('mf',PORTFOLIO.mutualFunds.indexOf(r))},
  ];
  const rows=PORTFOLIO.mutualFunds.filter(m=>m.owner===owner);
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML=mkControls(id,true,'mf',owner,cols)+mkTable(id,visibleCols);console.log("[DEBUG] MF controls rendered");
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════
   STOCKS PANEL
═══════════════════════════════════════════════════════ */
function buildStocksPanel(el,exchange) {
  const id=exchange==='NASDAQ'?'stocks-nas':'stocks-nse';
  if(!sortState[id])  sortState[id]={col:'invested',asc:false};
  if(!filterState[id]) filterState[id]={q:'',filter:'all'};

  const isUS = exchange === 'NASDAQ';

  // USD→INR rate fetched from LIVE, fallback 84
  const usdInr = getUsdInr();

  const baseCols = [
    {key:'name',     label:'Company',       fn:v=>`<span style="font-weight:600">${v}</span>`},
    {key:'symbol',   label:'Symbol',        fn:v=>`<span class="chip blue mono">${v}</span>`},
    {key:'units',    label:'Qty',           fn:v=>`<span class="mono">${v}</span>`},
    {key:'avgPrice', label:`Avg Buy${isUS?' (USD)':''}`,  fn:v=>isUS?`<span class="mono">$${v.toFixed(2)}</span>`:fmtINR(v)},
    {key:'invested', label:`Invested${isUS?' (USD)':''}`, fn:v=>isUS?`<span class="mono">$${v.toFixed(2)}</span>`:fmtINR(v)},
  ];

  const usdInrCol = isUS ? [
    {key:'_inr',     label:'Invested (INR)', fn:(_,r)=>`<span class="mono">${fmtINR(r.invested * usdInr)}</span>`},
  ] : [];

  const liveCols = [
    {key:'_liveP',   label:`Live Price${isUS?' (USD)':''}`, fn:(_,r)=>{const c=calcStock(r);return isUS?`<div class="live-val"><span class="price">$${c.curPrice.toFixed(2)}</span><span style="color:${c.isLive?'#059669':'#94a3b8'};font-size:10px;font-family:'JetBrains Mono',monospace">${c.isLive?'● LIVE':'cached'}</span></div>`:liveCell(c.curPrice,c.isLive);}},
    ...(isUS ? [{key:'_liveINR', label:'Live Value (INR)', fn:(_,r)=>{const c=calcStock(r); return fmtINR(c.curPrice * r.units * usdInr);}}] : []),
    {key:'_curVal',  label:`Current Value${isUS?' (USD)':''}`, fn:(_,r)=>{const c=calcStock(r);return isUS?`<span class="mono">$${c.curVal.toFixed(2)}</span>`:fmtINR(c.curVal);}},
    {key:'_gl',      label:'Gain / Loss',   fn:(_,r)=>{const c=calcStock(r);return chipGL(isUS?c.gl*usdInr:c.gl);}},
    {key:'_ret',     label:'Return %',      fn:(_,r)=>chipRet(calcStock(r).ret)},
    {key:'_actions', label:'Actions',       fn:(_,r)=>rowActions('stock',PORTFOLIO.stocks.indexOf(r))},
  ];

  const cols = [...baseCols, ...usdInrCol, ...liveCols];
  const rows = PORTFOLIO.stocks.filter(s=>isUS ? s.exchange==='NASDAQ' : s.exchange!=='NASDAQ');

  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML = mkControls(id,true,'stock',exchange,cols) + mkTable(id,visibleCols);
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════
   GOLD PANEL
═══════════════════════════════════════════════════════ */
function buildGoldPanel(el) {
  const id='gold';
  if(!sortState[id])  sortState[id]={col:'invested',asc:false};
  if(!filterState[id]) filterState[id]={q:''};
  const cols=[
    {key:'name',         label:'Instrument',  fn:v=>`<span style="font-weight:600">${v}</span>`},
    {key:'type',         label:'Type',        fn:v=>`<span class="chip gold">${v}</span>`},
    {key:'units',        label:'Units',       fn:v=>`<span class="mono">${v}</span>`},
    {key:'purchasePrice',label:'Buy Price',   fn:v=>fmtINR(v)},
    {key:'invested',     label:'Invested',    fn:v=>fmtINR(v)},
    {key:'_liveP',       label:'Live Price',  fn:(_,r)=>{const c=calcGold(r);return liveCell(c.curPrice,c.isLive);}},
    {key:'_manualVal',   label:'Current Value (Manual)', fn:(_,r,idx)=>{
      const val = r.manualCurrentValue !== undefined ? r.manualCurrentValue : '';
      return `<input type="number" class="gold-manual-input" 
        data-idx="${idx}" 
        value="${val}" 
        placeholder="Enter value" 
        style="width:120px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:13px;"
        onchange="updateGoldManualValue(${idx}, this.value)">`;
    }},
    {key:'_curVal',      label:'Calculated Value', fn:(_,r)=>{
      const c=calcGold(r);
      return `<span style="font-weight:600;color:${c.isManual?'#059669':'#64748b'}">${fmtINR(c.curVal)}</span>`;
    }},
    {key:'_gl',          label:'Gain / Loss', fn:(_,r)=>chipGL(calcGold(r).gl)},
    {key:'_ret',         label:'Return %',    fn:(_,r)=>chipRet(calcGold(r).ret)},
    {key:'_actions',     label:'Actions',     fn:(_,r,i)=>rowActions('gold',PORTFOLIO.gold.indexOf(r))},
  ];
  const rows=PORTFOLIO.gold||[];
  const visibleCols = filterVisibleColumns(id, cols);
  el.innerHTML=mkControls(id,false,'gold','',cols)+mkTable(id,visibleCols);
  renderTable(id,visibleCols,rows);
}

/* ═══════════════════════════════════════════════════════
   UPDATE GOLD MANUAL VALUE
═══════════════════════════════════════════════════════ */
function updateGoldManualValue(idx, value) {
  const gold = PORTFOLIO.gold[idx];
  if (!gold) return;
  
  if (value === '' || value === null) {
    delete gold.manualCurrentValue;
  } else {
    gold.manualCurrentValue = parseFloat(value);
  }
  
  saveToStorage();
  updateSummaryCards();
  showPanel('gold'); // refresh the panel to show updated calculations
  showToast('✓ Gold value updated', 'success');
}


/* ═══════════════════════════════════════════════════════
   COLUMN VISIBILITY
═══════════════════════════════════════════════════════ */
function getColumnVisibility(panelId) {
  const stored = localStorage.getItem(COLUMN_VISIBILITY_KEY);
  const all = stored ? JSON.parse(stored) : {};
  return all[panelId] || {};
}

function setColumnVisibility(panelId, colKey, visible) {
  const stored = localStorage.getItem(COLUMN_VISIBILITY_KEY);
  const all = stored ? JSON.parse(stored) : {};
  if (!all[panelId]) all[panelId] = {};
  all[panelId][colKey] = visible;
  localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(all));
  showPanel(activePanel); // Refresh panel
}

function filterVisibleColumns(panelId, cols) {
  const visibility = getColumnVisibility(panelId);
  return cols.filter(col => {
    // Always show actions column
    if (col.key === '_actions') return true;
    // If no stored preference, show by default
    if (visibility[col.key] === undefined) return true;
    return visibility[col.key];
  });
}

function buildColumnToggle(panelId, cols) {
  const visibility = getColumnVisibility(panelId);
  return `
    <div class="column-toggle">
      <button class="toggle-btn" onclick="toggleColumnMenu('${panelId}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
        Show/Hide Columns
      </button>
      <div class="column-menu" id="colMenu-${panelId}" style="display:none">
        <div class="column-menu-title">Visible Columns</div>
        ${cols.filter(c => c.key !== '_actions').map(col => {
          const isVisible = visibility[col.key] === undefined ? true : visibility[col.key];
          return `
            <label class="column-checkbox">
              <input type="checkbox" 
                ${isVisible ? 'checked' : ''} 
                onchange="setColumnVisibility('${panelId}','${col.key}',this.checked)">
              <span>${col.label}</span>
            </label>`;
        }).join('')}
      </div>
    </div>`;
}

function toggleColumnMenu(panelId) {
  const menu = document.getElementById('colMenu-' + panelId);
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

// Close column menu when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.column-toggle')) {
    document.querySelectorAll('.column-menu').forEach(m => m.style.display = 'none');
  }
});

/* ═══════════════════════════════════════════════════════
   TABLE HELPERS
═══════════════════════════════════════════════════════ */
function rowActions(type,idx) {
  return `<div class="row-actions">
    <button class="btn-edit" onclick="openEditModal('${type}',${idx})">✏ Edit</button>
    <button class="btn-del"  onclick="deleteRow('${type}',${idx})">🗑</button>
  </div>`;
}

function mkControls(id,hasFilter,addType,addMeta,cols) {
  return `
  <div class="export-bar">
    <span>⚠️ <strong>Changes are saved in your browser.</strong> Export JSON to update your GitHub file.</span>
    <button onclick="syncToGitHub()" style="margin-right:12px;padding:10px 20px;background:#059669;color:#fff;border:2px solid #047857;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">SYNC TO GITHUB</button>
    <button onclick="exportJSON()" style="padding:10px 20px;background:#64748b;color:#fff;border:2px solid #475569;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">DOWNLOAD JSON</button>
  </div>
  <div class="ctrl-bar">
    <div class="ctrl-bar-left">
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" class="search-input" placeholder="Search…" oninput="onSearch('${id}',this.value)"/>
    </div>
    ${hasFilter?`<select class="filter-sel" onchange="onFilter('${id}',this.value)">
      <option value="all">All</option><option value="gain">Gains Only</option><option value="loss">Losses Only</option>
    </select>`:''}
    <div class="row-count" id="rc-${id}">—</div>
    </div>
    <button class="btn-add" onclick="openAddModal('${addType}','${addMeta||''}')">＋ Add ${addType==='mf'?'Fund':addType==='fd'?'FD':addType==='stock'?'Stock':'Gold'}</button>
    ${cols ? buildColumnToggle(id, cols) : ''}
  </div>`;
}

function mkTable(id,cols) {
  return `<div class="tbl-card"><table>
    <thead><tr id="th-${id}">${cols.map(c=>`<th data-col="${c.key}" onclick="onSort('${id}','${c.key}')">${c.label}<span class="sort-icon">⇅</span></th>`).join('')}</tr></thead>
    <tbody id="tb-${id}"></tbody>
  </table></div>`;
}

function onSearch(id,val){if(!filterState[id])filterState[id]={q:'',filter:'all'};filterState[id].q=val;showPanel(activePanel);}
function onFilter(id,val){if(!filterState[id])filterState[id]={q:'',filter:'all'};filterState[id].filter=val;showPanel(activePanel);}
function onSort(id,col){
  console.log('[SORT] Clicked column:', col, 'in panel:', id);
  if(!sortState[id])sortState[id]={col:null,asc:true};
  sortState[id].asc=sortState[id].col===col?!sortState[id].asc:true;
  sortState[id].col=col;
  console.log('[SORT] New sort state:', sortState[id]);
  showPanel(activePanel);
}

function renderTable(id,cols,allRows) {
  const fs=filterState[id]||{q:'',filter:'all'};
  let rows=[...allRows];
  if(fs.q) rows=rows.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(fs.q.toLowerCase())));
  if(fs.filter==='gain') rows=rows.filter(r=>{
    try{if(r.schemeCode)return calcMF(r).gl>=0;if(r.symbol&&r.avgPrice)return calcStock(r).gl>=0;if(r.symbol)return calcGold(r).gl>=0;return calcFD(r).gl>=0;}catch{return true;}
  });
  if(fs.filter==='loss') rows=rows.filter(r=>{
    try{if(r.schemeCode)return calcMF(r).gl<0;if(r.symbol&&r.avgPrice)return calcStock(r).gl<0;if(r.symbol)return calcGold(r).gl<0;return calcFD(r).gl<0;}catch{return true;}
  });
  const ss=sortState[id];
  console.log("[RENDER] Sorting with state:", ss);
  if(ss?.col) {
    rows.sort((a,b)=>{
      let va, vb;
      
      // For calculated columns (starting with _), compute the value
      if(ss.col.startsWith('_')) {
        // Map column key to actual calculated value
        const getCalcValue = (row, col) => {
          try {
            if(row.schemeCode) { // Mutual Fund
              const c = calcMF(row);
              if(col === '_curNAV') return c.curNAV;
              if(col === '_curVal') return c.curVal;
              if(col === '_gl') return c.gl;
              if(col === '_ret') return c.ret;
            } else if(row.symbol && row.avgPrice) { // Stock
              const c = calcStock(row);
              if(col === '_liveP') return c.curPrice;
              if(col === '_curVal') return c.curVal;
              if(col === '_gl') return c.gl;
              if(col === '_ret') return c.ret;
            } else if(row.symbol) { // Gold
              const c = calcGold(row);
              if(col === '_liveP') return c.curPrice;
              if(col === '_curVal') return c.curVal;
              if(col === '_gl') return c.gl;
              if(col === '_ret') return c.ret;
            } else if(row.maturityDate) { // FD
              const c = calcFD(row);
              if(col === '_daysLeft') return c.daysLeft;
              if(col === '_curVal') return c.curVal;
              if(col === '_gl') return c.gl;
              if(col === '_ret') return c.ret;
            }
          } catch(e) { return 0; }
          return 0;
        };
        va = getCalcValue(a, ss.col);
        vb = getCalcValue(b, ss.col);
      } else {
        // For regular columns, use the raw value
        va = a[ss.col];
        vb = b[ss.col];
      }
      
      // Convert to numbers if possible
      const numA = parseFloat(va);
      const numB = parseFloat(vb);
      const isNumeric = !isNaN(numA) && !isNaN(numB);
      
      if(isNumeric) {
        return ss.asc ? numA - numB : numB - numA;
      } else if(typeof va === 'string' && typeof vb === 'string') {
        return ss.asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return ss.asc ? (va||0)-(vb||0) : (vb||0)-(va||0);
    });
  }
  document.querySelectorAll(`#th-${id} th`).forEach(th=>{
    th.classList.remove('sorted');const si=th.querySelector('.sort-icon');if(si)si.textContent='⇅';
    if(ss?.col&&th.dataset.col===ss.col){th.classList.add('sorted');if(si)si.textContent=ss.asc?'▲':'▼';}
  });
  const rc=document.getElementById('rc-'+id);
  if(rc) rc.textContent=`${rows.length} / ${allRows.length} rows`;
  const tb=document.getElementById('tb-'+id);
  if(!tb) return;
  if(!rows.length){tb.innerHTML=`<tr><td colspan="${cols.length}" class="no-results"><div class="nr-icon">🔍</div><div class="nr-text">No results</div></td></tr>`;return;}
  tb.innerHTML=rows.map((row,i)=>`<tr>${cols.map(c=>`<td>${c.fn(row[c.key],row,i)}</td>`).join('')}</tr>`).join('');
}

/* ═══════════════════════════════════════════════════════
   ADD / EDIT MODALS
═══════════════════════════════════════════════════════ */
function openAddModal(type,meta) {
  _editIdx=null; _editType=type;
  const titles={fd:'Add Fixed Deposit',mf:'Add Mutual Fund',stock:'Add Stock',gold:'Add Gold / SGB'};
  openModal(titles[type]||'Add', buildForm(type,null,meta));
}
function openEditModal(type,idx) {
  _editIdx=idx; _editType=type;
  const data=getDataStore(type)[idx];
  const titles={fd:'Edit Fixed Deposit',mf:'Edit Mutual Fund',stock:'Edit Stock',gold:'Edit Gold / SGB'};
  openModal(titles[type]||'Edit', buildForm(type,data,''));
}

function buildForm(type,data,meta) {
  const v=(field,def='')=>data?data[field]??def:def;
  if(type==='fd') return `<div class="form-grid">
    <div class="form-group"><label class="form-label">Bank / Institution</label><input class="form-input" id="f-bank" value="${v('bank')}" placeholder="e.g. HDFC"/></div>
    <div class="form-group"><label class="form-label">FD Number</label><input class="form-input" id="f-fdNumber" value="${v('fdNumber')}" placeholder="e.g. 12345"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}" placeholder="100000"/></div>
    <div class="form-group"><label class="form-label">Interest Rate (%)</label><input class="form-input" type="number" step="0.1" id="f-rate" value="${v('rate',7)}" placeholder="7.0"/></div>
    <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="f-startDate" value="${v('startDate')}"/></div>
    <div class="form-group"><label class="form-label">Maturity Date</label><input class="form-input" type="date" id="f-maturityDate" value="${v('maturityDate')}"/></div>
    <div class="form-group"><label class="form-label">Maturity Value (₹)</label><input class="form-input" type="number" id="f-maturityValue" value="${v('maturityValue',0)}" placeholder="107000"/></div>
    <div class="form-group"><label class="form-label">Status</label>
      <select class="form-select" id="f-status">
        <option ${v('status')==='Active'?'selected':''}>Active</option>
        <option ${v('status')==='Matured'?'selected':''}>Matured</option>
        <option ${v('status')==='Closed'?'selected':''}>Closed</option>
      </select>
    </div>
  </div>`;

  if(type==='mf') return `<div class="form-grid">
    <div class="form-group full"><label class="form-label">Fund Name</label><input class="form-input" id="f-name" value="${v('name')}" placeholder="e.g. HDFC Flexi Cap Fund"/></div>
    <div class="form-group"><label class="form-label">Scheme Code (AMFI)</label><input class="form-input" id="f-schemeCode" value="${v('schemeCode')}" placeholder="e.g. 100179"/>
      <div class="form-hint">Find at <a href="https://mfapi.in" target="_blank">mfapi.in</a></div></div>
    <div class="form-group"><label class="form-label">Owner</label>
      <select class="form-select" id="f-owner">
        <option ${(v('owner',meta)==='Mahesh')?'selected':''}>Mahesh</option>
        <option ${(v('owner',meta)==='Family')?'selected':''}>Family</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Units</label><input class="form-input" type="number" step="0.001" id="f-units" value="${v('units',0)}" placeholder="500.000"/></div>
    <div class="form-group"><label class="form-label">Purchase NAV (₹)</label><input class="form-input" type="number" step="0.01" id="f-purchaseNAV" value="${v('purchaseNAV',0)}" placeholder="45.23"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}" placeholder="22615"/></div>
  </div>`;

  if(type==='stock') return `<div class="form-grid">
    <div class="form-group full"><label class="form-label">Company Name</label><input class="form-input" id="f-name" value="${v('name')}" placeholder="e.g. Reliance Industries"/></div>
    <div class="form-group"><label class="form-label">Symbol</label><input class="form-input" id="f-symbol" value="${v('symbol')}" placeholder="RELIANCE.NS"/>
      <div class="form-hint">NSE: add .NS · BSE: add .BO · NASDAQ: plain e.g. AAPL</div></div>
    <div class="form-group"><label class="form-label">Exchange</label>
      <select class="form-select" id="f-exchange">
        <option ${v('exchange')==='NSE'?'selected':''}>NSE</option>
        <option ${v('exchange')==='BSE'?'selected':''}>BSE</option>
        <option ${v('exchange')==='NASDAQ'?'selected':''}>NASDAQ</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Quantity (units)</label><input class="form-input" type="number" id="f-units" value="${v('units',0)}" placeholder="10"/></div>
    <div class="form-group"><label class="form-label">Avg Buy Price (₹)</label><input class="form-input" type="number" step="0.01" id="f-avgPrice" value="${v('avgPrice',0)}" placeholder="2450"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}" placeholder="24500"/></div>
  </div>`;

  if(type==='gold') return `<div class="form-grid">
    <div class="form-group full"><label class="form-label">Instrument Name</label><input class="form-input" id="f-name" value="${v('name')}" placeholder="e.g. SGB Series X"/></div>
    <div class="form-group"><label class="form-label">Type</label>
      <select class="form-select" id="f-type">
        <option ${v('type')==='SGB'?'selected':''}>SGB</option>
        <option ${v('type')==='ETF'?'selected':''}>ETF</option>
        <option ${v('type')==='Physical'?'selected':''}>Physical</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Symbol (Yahoo Finance)</label><input class="form-input" id="f-symbol" value="${v('symbol')}" placeholder="GOLDBEES.NS"/></div>
    <div class="form-group"><label class="form-label">Units / Grams</label><input class="form-input" type="number" step="0.001" id="f-units" value="${v('units',0)}" placeholder="8"/></div>
    <div class="form-group"><label class="form-label">Purchase Price (₹)</label><input class="form-input" type="number" step="0.01" id="f-purchasePrice" value="${v('purchasePrice',0)}" placeholder="4500"/></div>
    <div class="form-group"><label class="form-label">Investment Amount (₹)</label><input class="form-input" type="number" id="f-invested" value="${v('invested',0)}" placeholder="36000"/></div>
  </div>`;

  return '<p>Unknown type</p>';
}

function saveModal() {
  const type=_editType;
  const get=(id)=>{const el=document.getElementById(id);return el?el.value:null;};
  const num=(id)=>parseFloat(get(id))||0;
  let obj;
  if(type==='fd') obj={bank:get('f-bank'),fdNumber:get('f-fdNumber'),invested:num('f-invested'),rate:num('f-rate'),startDate:get('f-startDate'),maturityDate:get('f-maturityDate'),maturityValue:num('f-maturityValue'),status:get('f-status')};
  else if(type==='mf') obj={name:get('f-name'),schemeCode:get('f-schemeCode'),owner:get('f-owner'),units:num('f-units'),purchaseNAV:num('f-purchaseNAV'),invested:num('f-invested')};
  else if(type==='stock') obj={name:get('f-name'),symbol:get('f-symbol'),exchange:get('f-exchange'),units:num('f-units'),avgPrice:num('f-avgPrice'),invested:num('f-invested')};
  else if(type==='gold') obj={name:get('f-name'),type:get('f-type'),symbol:get('f-symbol'),units:num('f-units'),purchasePrice:num('f-purchasePrice'),invested:num('f-invested')};

  const store=getDataStore(type);
  if(_editIdx===null) { store.push(obj); showToast('✓ Entry added','success'); }
  else               { store[_editIdx]=obj; showToast('✓ Entry updated','success'); }

  saveToStorage();
  closeModal();
  updateBadges();
  updateSummaryCards();
  showPanel(activePanel);
}

function deleteRow(type,idx) {
  if(!confirm('Delete this entry?')) return;
  const store=getDataStore(type);
  store.splice(idx,1);
  saveToStorage();
  updateBadges();
  updateSummaryCards();
  showToast('🗑 Entry deleted','info');
  showPanel(activePanel);
}

function getDataStore(type) {
  if(type==='fd')    return PORTFOLIO.fixedDeposits;
  if(type==='mf')    return PORTFOLIO.mutualFunds;
  if(type==='stock') return PORTFOLIO.stocks;
  if(type==='gold')  return PORTFOLIO.gold;
  return [];
}

/* ═══════════════════════════════════════════════════════
   EXPORT JSON
═══════════════════════════════════════════════════════ */
function exportJSON() {
  const blob=new Blob([JSON.stringify(PORTFOLIO,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='portfolio.json';
  a.click();
  showToast('📥 portfolio.json downloaded — upload to GitHub data/ folder','info');
}

/* ═══════════════════════════════════════════════════════
   SYNC TO GITHUB
═══════════════════════════════════════════════════════ */
async function syncToGitHub() {
  let token = localStorage.getItem(GITHUB_TOKEN_KEY);
  if (!token) {
    token = prompt("GitHub Personal Access Token:\n\nGenerate at: https://github.com/settings/tokens\nScope: repo");
    if (!token) { showToast("❌ Cancelled", "error"); return; }
    localStorage.setItem(GITHUB_TOKEN_KEY, token);
  }
  showSpinner("Syncing...");
  try {
    const getUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
    const getResp = await fetch(getUrl, { headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" }});
    if (!getResp.ok) throw new Error(`API error: ${getResp.status}`);
    const fileData = await getResp.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(PORTFOLIO, null, 2))));
    const updateResp = await fetch(getUrl, {
      method: "PUT",
      headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ message: `Update ${new Date().toISOString()}`, content, sha: fileData.sha })
    });
    if (!updateResp.ok) throw new Error("Update failed");
    hideSpinner(); showToast("✅ Synced!", "success");
  } catch (e) {
    hideSpinner(); showToast(`❌ ${e.message}`, "error");
    if (e.message.includes("401")) localStorage.removeItem(GITHUB_TOKEN_KEY);
  }
}


/* ═══════════════════════════════════════════════════════
   MODAL HELPERS
═══════════════════════════════════════════════════════ */
function openModal(title,bodyHTML) {
  document.getElementById('modalTitle').textContent=title;
  document.getElementById('modalBody').innerHTML=bodyHTML;
  document.getElementById('modalFooter').innerHTML=`
    ${_editIdx!==null?`<button class="btn-danger" onclick="deleteRow('${_editType}',${_editIdx})">🗑 Delete</button>`:''}
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-primary" onclick="saveModal()">💾 Save</button>`;
  document.getElementById('modalBackdrop').classList.add('show');
}
function closeModal() { document.getElementById('modalBackdrop').classList.remove('show'); }
function closeModalOnBackdrop(e) { if(e.target===document.getElementById('modalBackdrop')) closeModal(); }

/* ═══════════════════════════════════════════════════════
   CHART + UI HELPERS
═══════════════════════════════════════════════════════ */
function newChart(id,type,data,options={}) {
  if(chartStore[id]){try{chartStore[id].destroy();}catch(e){}delete chartStore[id];}
  const canvas=document.getElementById(id); if(!canvas) return;
  chartStore[id]=new Chart(canvas,{type,data,options:{responsive:true,...options}});
}
function chipGL(gl){return `<span class="chip ${gl>=0?'gain':'loss'}">${gl>=0?'▲ +':'▼ '}${fmtINR(Math.abs(gl))}</span>`;}
function chipRet(ret){return `<span class="chip ${ret>=0?'gain':'loss'}">${ret>=0?'+':''}${ret.toFixed(2)}%</span>`;}
function liveCell(price,isLive){
  return `<div class="live-val"><span class="price">${fmtINR(price)}</span>
  <span style="color:${isLive?'#059669':'#94a3b8'};font-size:10px;font-family:'JetBrains Mono',monospace">${isLive?'● LIVE':'cached'}</span></div>`;
}
function fmtINR(n){if(n==null||isNaN(n))return '—';return(n<0?'-₹':'₹')+Math.abs(n).toLocaleString('en-IN',{maximumFractionDigits:2});}
function shortINR(n){const a=Math.abs(n);if(a>=1e7)return '₹'+(n/1e7).toFixed(1)+'Cr';if(a>=1e5)return '₹'+(n/1e5).toFixed(1)+'L';if(a>=1e3)return '₹'+(n/1e3).toFixed(0)+'K';return '₹'+n.toFixed(0);}
function showSpinner(msg){document.getElementById('spinnerOverlay').classList.add('show');document.getElementById('spinnerText').textContent=msg;}
function hideSpinner(){document.getElementById('spinnerOverlay').classList.remove('show');}
let _tt;
function showToast(msg,type='info'){const t=document.getElementById('toast');t.textContent=msg;t.className=`toast show ${type}`;clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('show'),4000);}
async function handleRefresh(){
  const btn=document.getElementById('refreshBtn');
  btn.classList.add('loading');btn.querySelector('span').textContent='Refreshing…';
  showSpinner('Fetching live prices…');
  await fetchAllLiveData();
  updateSummaryCards();showPanel(activePanel);
  hideSpinner();btn.classList.remove('loading');btn.querySelector('span').textContent='Refresh Prices';
  document.getElementById('lastUpdated').textContent='Updated: '+new Date().toLocaleTimeString('en-IN');
  showToast('✓ Prices refreshed','success');
}
