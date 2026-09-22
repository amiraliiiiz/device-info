// ─── رابط کاربری اقتصادستان ────────────────────────────────────────────
import { newGame, pushNews } from './state.js';
import { bondYieldOf, doQE, doSubsidyReform, propertyValue, tick } from './sim.js';
import { COMPANIES, SCENARIOS, SPEND_CATS, TARGET_INFLATION } from './config.js';
import { drawBars, drawGauge, drawLine } from './charts.js';
import { clamp, dateShort, dateStr, esc, fa, fa0, money, pct, signed, tomanStr } from './utils.js';

const SAVE_KEY = 'econestan-save-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let state = loadGame() || newGame('abadan');
let activeView = 'dashboard';
let timer = null;
let speed = state.speed || 1;
let marketSector = 'all';
let newsFilter = 'all';
let modalEscapeHandler = null;

const ACHIEVEMENTS = [
  ['growth8', 'جهش اقتصادی', '🚀'], ['price_stable', 'مهار تورم', '🎯'], ['full_emp', 'اشتغال کامل', '👷'],
  ['surplus', 'بودجه مازاد', '🏦'], ['tycoon', 'ابرثروتمند', '💎'], ['bull', 'گاوصفت', '🐂'],
  ['hyper', 'ابر تورم!', '🔥'], ['crash', 'سقوط بازار', '📉'], ['reserve_king', 'ذخایر ارزی نیرومند', '💱'], ['survivor5', 'پنج سال حکمرانی', '🏛️'],
];
const NAV_TITLES = { dashboard: 'نمای کلی اقتصاد', monetary: 'سیاست پولی', fiscal: 'بودجه و دولت', markets: 'بازارها', portfolio: 'دارایی‌های من', news: 'اتاق خبر' };

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || !saved.econ || !saved.gov || !saved.market) return null;
    saved.paused = true;
    saved.speed = saved.speed || 1;
    saved.news = saved.news || [];
    saved.achievements = saved.achievements || [];
    saved.history = saved.history || {};
    saved._tmp = saved._tmp || {};
    return saved;
  } catch (error) {
    console.warn('Could not load save', error);
    return null;
  }
}

function saveGame() {
  try {
    state.speed = speed;
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    const status = $('#footer-save-status');
    if (status) {
      status.textContent = 'ذخیره شد · همین الان';
      window.clearTimeout(saveGame._timer);
      saveGame._timer = window.setTimeout(() => { status.textContent = 'ذخیره خودکار فعال'; }, 1600);
    }
  } catch (error) {
    console.warn('Could not save game', error);
  }
}

function currentDate() { return dateStr(Math.max(0, state.month - 1)); }
function series(key, current) {
  const values = Array.isArray(state.history?.[key]) ? state.history[key].slice() : [];
  return values.length ? values : [current];
}
function seriesMonths(values) {
  const start = Math.max(0, state.month - values.length);
  return values.map((_, index) => start + index);
}
function lastValue(key, fallback = 0) {
  const arr = state.history?.[key];
  return arr && arr.length ? arr[arr.length - 1] : fallback;
}
function previousValue(key, fallback) {
  const arr = state.history?.[key];
  return arr && arr.length > 1 ? arr[arr.length - 2] : fallback;
}
function changeOf(value, previous) { return previous && isFinite(previous) ? value / previous - 1 : 0; }
function changeClass(value, inverse = false) {
  const adjusted = inverse ? -value : value;
  return adjusted > .0001 ? 'up' : adjusted < -.0001 ? 'down' : 'neutral';
}
function formatPercent(value, digits = 1) { return pct(value * 100, digits); }
function formatSignedPercent(value, digits = 1) { return signed(value * 100, digits, '٪'); }
function safeMoney(value, digits = 1) { return money(Number.isFinite(value) ? value : 0, digits); }
function formatUnits(value, digits = 1) { return fa(value, digits); }
function formatDateMonth(month) { return dateStr(Math.max(0, month - 1)); }
function riskLabel() {
  const score = state.econ.riskPrem * 1000 + Math.max(0, state.econ.inflAnnual - .12) * 15 + (state.mods.sanctioned ? 4 : 0);
  return score < 4 ? 'پایین' : score < 9 ? 'متوسط' : score < 15 ? 'بالا' : 'بحرانی';
}
function riskColor() {
  const label = riskLabel();
  return label === 'پایین' ? 'positive' : label === 'متوسط' ? 'neutral' : 'negative';
}
function statusKind(value) { return value > 0 ? 'positive' : value < 0 ? 'negative' : ''; }
function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
function renderMoneyValue(value, digits = 1) { return safeMoney(value, digits); }

function metricCard(label, value, icon, footer, change, inverse = false, tone = '') {
  const cls = change === undefined ? '' : changeClass(change, inverse);
  const changeText = change === undefined ? '' : `<span class="metric-change ${cls}">${formatSignedPercent(change)}</span>`;
  return `<article class="card metric-card ${tone}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon}</span></div><strong class="metric-value">${value}</strong><div class="metric-footer">${changeText}<span>${footer}</span></div></article>`;
}

function render() {
  renderShell();
  renderDashboard();
  renderMonetary();
  renderFiscal();
  renderMarkets();
  renderPortfolio();
  renderNews();
  renderCharts();
}

function renderShell() {
  setText('#sim-date', currentDate());
  setText('#sim-month', `ماه ${fa0(state.month + 1)}`);
  setText('#sidebar-scenario', state.scenarioName || 'اقتصاد نفتی آبادان');
  const scenario = SCENARIOS.find((item) => item.id === state.scenario) || SCENARIOS[0];
  setText('#sidebar-scenario-icon', scenario.icon);
  setText('#sidebar-status', state.gameOver ? 'دولت پایان یافته' : (state.paused ? 'آماده تصمیم‌گیری' : 'دولت در حال فعالیت'));
  setText('#governance-score', fa0(state.gov.approval));
  const progress = $('#governance-progress');
  if (progress) progress.style.width = `${clamp(state.gov.approval, 0, 100)}%`;
  setText('#mobile-title', NAV_TITLES[activeView] || NAV_TITLES.dashboard);
  setText('#footer-save-status', 'ذخیره خودکار فعال');

  const unread = Math.max(0, state.news.length - (state._tmp.readNews || 0));
  setText('#news-badge', fa0(unread));
  const critical = state.news.filter((item) => item.kind === 'bad').slice(0, 12).length;
  setText('#alert-badge', fa0(critical));
  setText('#event-count', fa0(Math.min(state.news.length, 99)));

  const play = $('#play-btn');
  const dot = $('#play-state-dot');
  const stateText = $('#play-state-text');
  if (state.paused || state.gameOver) {
    if (play) { play.textContent = '▶'; play.classList.remove('pause'); }
    dot?.classList.remove('on');
    if (stateText) stateText.textContent = state.gameOver ? 'شبیه‌سازی پایان یافته' : 'شبیه‌سازی متوقف است';
  } else {
    if (play) { play.textContent = 'Ⅱ'; play.classList.add('pause'); }
    dot?.classList.add('on');
    if (stateText) stateText.textContent = 'شبیه‌سازی در حال اجراست';
  }
  $$('.speed-control button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.speed) === speed));
}

function renderDashboard() {
  const e = state.econ;
  const g = state.gov;
  const gdpChange = e.growthAnnual;
  const inflationChange = changeOf(e.inflAnnual, previousValue('infl', e.inflAnnual));
  const unemploymentChange = changeOf(e.uRate, previousValue('unemp', e.uRate));
  const fxChange = changeOf(e.fx, previousValue('fx', e.fx));
  const metrics = [
    metricCard('تولید ناخالص داخلی', renderMoneyValue(e.gdp), '▥', 'رشد سالانه', gdpChange, false),
    metricCard('تورم سالانه', formatPercent(e.inflAnnual), '◌', 'هدف بانک مرکزی ۸٪', inflationChange, false, 'inflation-metric'),
    metricCard('نرخ بیکاری', formatPercent(e.uRate), '♙', 'از جمعیت فعال', unemploymentChange, true),
    metricCard('دلار آزاد', `${fa0(e.fx)} <code>تومان</code>`, '◇', 'بازار شناور', fxChange, false),
  ];
  const target = $('#headline-metrics');
  if (target) target.innerHTML = metrics.join('');

  setText('#gdp-chart-value', formatUnits(e.gdp, 1));
  setText('#gdp-trend', formatSignedPercent(gdpChange));
  if ($('#gdp-trend')) $('#gdp-trend').className = `trend-chip ${statusKind(gdpChange)}`;
  setText('#infl-chart-value', formatPercent(e.inflAnnual));
  setText('#fx-chart-value', `${fa0(e.fx)} تومان`);
  setText('#health-growth', formatSignedPercent(e.growthAnnual));
  setText('#health-unemp', formatPercent(e.uRate));
  setText('#health-risk', riskLabel());
  if ($('#health-growth')) $('#health-growth').className = statusKind(e.growthAnnual);
  if ($('#health-unemp')) $('#health-unemp').className = changeClass(e.uRate, true);
  if ($('#health-risk')) $('#health-risk').className = riskColor();

  const newsTarget = $('#dashboard-news');
  if (newsTarget) newsTarget.innerHTML = state.news.slice(0, 4).map(newsItem).join('') || emptyNews();
}

function newsItem(item, index = 0) {
  const kind = item.kind || 'info';
  const monthLabel = item.month === undefined ? '' : formatDateMonth(item.month);
  return `<article class="news-item ${esc(kind)}"><span class="news-item-icon">${esc(item.icon || '◌')}</span><div class="news-item-body"><div class="news-item-text">${esc(item.text || '')}</div><div class="news-item-meta">${monthLabel}${index === 0 && item.month === state.month ? ' · تازه' : ''}</div></div></article>`;
}
function emptyNews() { return '<div class="empty-state"><strong>هنوز خبری نیست</strong>ماه اول را جلو ببرید تا اقتصاد واکنش نشان دهد.</div>'; }

function renderMonetary() {
  const e = state.econ;
  const alert = $('#monetary-alert');
  if (alert) {
    const alertText = e.inflAnnual > .25 ? 'تورم از کنترل خارج شده است؛ افزایش نرخ بهره هزینه رکود دارد، اما بی‌عملی می‌تواند انتظارات تورمی را تثبیت کند.' : e.inflAnnual > .12 ? 'تورم بالاتر از هدف است. بانک مرکزی باید اعتبار خود را بین رشد و ثبات قیمت‌ها متعادل کند.' : e.growthAnnual < -.03 ? 'اقتصاد وارد رکود شده است؛ سیاست انبساطی می‌تواند تقاضا را نجات دهد، اما مراقب فشار بر ارز باشید.' : '';
    alert.textContent = alertText;
    alert.classList.toggle('show', Boolean(alertText));
  }
  setText('#policy-rate-value', formatPercent(e.policyRate));
  setText('#reserve-value', formatPercent(e.reserveReq));
  setText('#qe-current', e.qeActive > 0 ? `${safeMoney(e.qeActive)} / ماه` : 'خاموش');
  const rateSlider = $('#policy-rate-slider');
  if (rateSlider && document.activeElement !== rateSlider) rateSlider.value = e.policyRate;
  const reserveSlider = $('#reserve-slider');
  if (reserveSlider && document.activeElement !== reserveSlider) reserveSlider.value = e.reserveReq;
  const impact = $('#rate-impact');
  if (impact) {
    const realRate = e.policyRate - e.inflAnnual;
    impact.innerHTML = `<span>نرخ واقعی ${formatPercent(realRate)}</span><span>${realRate > .02 ? 'پول گران' : realRate < -.02 ? 'پول ارزان' : 'متعادل'}</span><span>اعتبار ${e.creditTight > 0 ? 'محدود' : 'باز'}</span>`;
  }
  const cooldown = $('#qe-cooldown');
  const cd = state._tmp.qeCooldown || 0;
  if (cooldown) cooldown.textContent = cd > 0 ? `${fa0(cd)} ماه تا امکان تزریق بعدی` : 'چرخه‌ی شش‌ماهه؛ با احتیاط استفاده کنید.';
  const qeBtn = $('#qe-btn');
  if (qeBtn) { qeBtn.disabled = e.qeActive > 0 || cd > 0 || Boolean(state.gameOver); qeBtn.textContent = e.qeActive > 0 ? 'برنامه در حال اجراست' : cd > 0 ? 'دوره پرهیز از تزریق' : 'شروع تزریق نقدینگی'; }
  $$('[data-fx-regime]').forEach((button) => button.classList.toggle('active', button.dataset.fxRegime === e.fxRegime));
  setText('#fx-regime-note', e.fxRegime === 'managed' ? 'ذخایر ارزی برای دفاع از نرخ مصرف می‌شود.' : 'قیمت با عرضه و تقاضا کشف می‌شود.');

  setText('#m2-value', safeMoney(e.m2));
  setText('#m2-growth', formatPercent(e.m2Growth));
  setText('#market-rate', formatPercent(e.marketRate));
  setText('#loans-value', safeMoney(e.loans));
  setText('#npl-value', formatPercent(e.npl));
  setText('#bank-health', formatPercent(e.bankHealth));
  if ($('#npl-value')) $('#npl-value').className = e.npl > .1 ? 'negative' : '';
  if ($('#bank-health')) $('#bank-health').className = e.bankHealth > .7 ? 'positive' : e.bankHealth < .45 ? 'negative' : 'neutral';
}

function renderFiscal() {
  const e = state.econ;
  const g = state.gov;
  const planned = Object.values(g.spend).reduce((sum, value) => sum + value, 0);
  const balanceRatio = e.gdp ? g.balance / e.gdp : 0;
  const metrics = [
    metricCard('درآمد دولت', safeMoney(g.revenue), '↗', 'مالیات و نفت', changeOf(g.revenue, previousValue('revenue', g.revenue))),
    metricCard('هزینه دولت', safeMoney(g.spending), '↘', 'با احتساب بهره', changeOf(g.spending, previousValue('spending', g.spending)), true),
    metricCard('تراز بودجه', safeMoney(g.balance), g.balance >= 0 ? '＋' : '−', g.balance >= 0 ? 'مازاد' : 'کسری', balanceRatio, false, g.balance >= 0 ? '' : 'inflation-metric'),
    metricCard('بدهی به GDP', formatPercent(g.debtGDP), '▤', 'سطح بدهی عمومی', changeOf(g.debtGDP, previousValue('debtGDP', g.debtGDP)), true),
  ];
  const target = $('#fiscal-metrics');
  if (target) target.innerHTML = metrics.join('');
  setText('#budget-year', `بودجه ${fa0(1404 + Math.floor(state.month / 12))}`);
  setText('#spending-total-value', `${formatPercent(planned)} از GDP`);
  setText('#debt-gdp-value', formatPercent(g.debtGDP));
  const reformButton = $('#subsidy-btn');
  const reformStatus = $('#reform-status');
  if (reformButton) { reformButton.disabled = g.subsidyReform || Boolean(state.gameOver); reformButton.textContent = g.subsidyReform ? 'اصلاحات اجرا شده' : 'اجرای اصلاحات'; }
  if (reformStatus) reformStatus.textContent = g.subsidyReform ? '✓ یارانه پنهان اصلاح شده؛ منابع آزادشده در بودجه منعکس شد.' : 'این تصمیم برگشت‌پذیر نیست.';
  renderSpendingList();
  const taxFields = [['income-tax-slider', 'income-tax-value', g.incomeTax], ['corp-tax-slider', 'corp-tax-value', g.corpTax], ['vat-slider', 'vat-value', g.vat], ['tariff-slider', 'tariff-value', g.tariff]];
  taxFields.forEach(([inputId, outputId, value]) => {
    const input = $(`#${inputId}`);
    if (input && document.activeElement !== input) input.value = value;
    setText(`#${outputId}`, formatPercent(value));
  });
}

function renderSpendingList() {
  const target = $('#spending-list');
  if (!target) return;
  target.innerHTML = SPEND_CATS.map((cat) => {
    const value = state.gov.spend[cat.id] ?? 0;
    return `<label class="spend-row"><span class="spend-icon">${cat.icon}</span><span class="spend-label">${cat.name}<small>${cat.desc}</small></span><input type="range" min="0" max="0.12" step="0.001" value="${value}" data-spend="${cat.id}" aria-label="${cat.name}" /><output class="spend-value" data-spend-output="${cat.id}">${formatPercent(value)}</output></label>`;
  }).join('');
}

function renderMarkets() {
  const e = state.econ;
  const indexNow = e.index;
  const indexPrev = previousValue('index', indexNow);
  const overview = $('#market-overview');
  if (overview) {
    overview.innerHTML = [
      overviewCard('شاخص کل بورس', fa(indexNow, 1), formatSignedPercent(changeOf(indexNow, indexPrev)), '⌁', changeClass(changeOf(indexNow, indexPrev))),
      overviewCard('قیمت نفت برنت', `${fa(e.oilPrice, 1)} دلار`, state.mods.sanctioned ? 'تحریم؛ صادرات محدود' : 'بازار جهانی', '◉', 'neutral'),
      overviewCard('شاخص قیمت مسکن', fa(e.hpi, 1), formatSignedPercent(changeOf(e.hpi, previousValue('hpi', e.hpi))), '⌂', changeClass(changeOf(e.hpi, previousValue('hpi', e.hpi)))),
      overviewCard('ذخایر ارزی', safeMoney(e.reserves), e.fxRegime === 'managed' ? 'مدیریت‌شده' : 'شناور', '◇', 'neutral'),
    ].join('');
  }
  setText('#market-index-top', fa(indexNow, 1));
  const indexChange = changeOf(indexNow, indexPrev);
  setText('#market-index-change', formatSignedPercent(indexChange));
  if ($('#market-index-change')) $('#market-index-change').className = indexChange >= 0 ? 'positive' : 'negative';
  const hpichange = changeOf(e.hpi, previousValue('hpi', e.hpi));
  setText('#hpi-growth', formatSignedPercent(hpichange));
  if ($('#hpi-growth')) $('#hpi-growth').className = `trend-chip ${changeClass(hpichange)}`;

  const body = $('#market-body');
  if (body) {
    const companies = state.market.companies.filter((company) => marketSector === 'all' || company.sector === marketSector || (marketSector === 'فلزات' && ['فلزات', 'خودرو', 'ساختمانی'].includes(company.sector)));
    body.innerHTML = companies.map((company) => {
      const ch = company.prevPrice ? company.price / company.prevPrice - 1 : 0;
      const code = company.id.slice(0, 3).toUpperCase();
      return `<tr><td><div class="stock-name"><span class="stock-avatar">${esc(code.slice(0, 2))}</span><span><span class="stock-title">${esc(company.name)}</span><span class="stock-code">${esc(code)}</span></span></div></td><td class="sector-cell">${esc(company.sector)}</td><td>${tomanStr(company.price)}</td><td class="${ch >= 0 ? 'positive' : 'negative'}">${company.prevPrice ? formatSignedPercent(ch) : '—'}</td><td>${tomanStr(company.eps)}</td><td>${fa(company.pe, 1)}</td><td><button class="trade-btn" data-trade="${esc(company.id)}">معامله</button></td></tr>`;
    }).join('') || `<tr><td colspan="7"><div class="empty-state">شرکتی در این فیلتر وجود ندارد.</div></td></tr>`;
  }
}
function overviewCard(label, value, foot, icon, cls) { return `<article class="card market-overview-card"><span class="overview-label">${label}</span><span class="overview-icon">${icon}</span><strong class="overview-value">${value}</strong><div class="overview-foot"><span class="${cls || ''}">${foot}</span></div></article>`; }

function recalculateNetWorth() {
  const p = state.player;
  let total = p.cash + p.bonds;
  for (const company of state.market.companies) total += (p.stocks[company.id] || 0) * company.price / 5e12;
  for (const prop of p.properties) total += propertyValue(state, prop);
  p.netWorth = Math.max(0, total);
  return total;
}

function renderPortfolio() {
  const p = state.player;
  const total = recalculateNetWorth();
  let stockValue = 0;
  Object.entries(p.stocks).forEach(([id, amount]) => { const company = state.market.companies.find((item) => item.id === id); if (company) stockValue += amount * company.price / 5e12; });
  const propertyValueTotal = p.properties.reduce((sum, property) => sum + propertyValue(state, property), 0);
  const summary = $('#portfolio-summary');
  if (summary) summary.innerHTML = [
    portfolioStat('ارزش خالص دارایی‌ها', safeMoney(total), '◇', 'cyan'),
    portfolioStat('سرمایه‌گذاری در بازار', safeMoney(stockValue + propertyValueTotal), '◈', 'blue'),
    portfolioStat('نقدینگی قابل استفاده', safeMoney(p.cash), '⌁', 'gold'),
  ].join('');
  setText('#portfolio-networth', safeMoney(total));
  setText('#cash-value', safeMoney(p.cash));
  setText('#bond-value', safeMoney(p.bonds));
  setText('#bond-yield', formatPercent(bondYieldOf(state)));
  const portfolioBody = $('#portfolio-body');
  const held = state.market.companies.filter((company) => (p.stocks[company.id] || 0) > 0);
  if (portfolioBody) portfolioBody.innerHTML = held.length ? held.map((company) => {
    const amount = p.stocks[company.id];
    const ch = company.prevPrice ? company.price / company.prevPrice - 1 : 0;
    return `<tr><td><div class="stock-name"><span class="stock-avatar">◈</span><span class="stock-title">${esc(company.name)}</span></div></td><td>${fa0(amount)}</td><td>${tomanStr(company.price)}</td><td>${safeMoney(amount * company.price / 5e12)}</td><td class="${ch >= 0 ? 'positive' : 'negative'}">${formatSignedPercent(ch)}</td></tr>`;
  }).join('') : `<tr><td colspan="5"><div class="empty-state"><strong>سبد شما خالی است</strong>از تابلوی بازار اولین سرمایه‌گذاری‌ات را شروع کن.</div></td></tr>`;

  const realty = $('#realty-list');
  if (realty) realty.innerHTML = state.realty.map((property) => {
    const price = propertyValue(state, { typeId: property.typeId, quality: 1 });
    const owned = p.properties.filter((item) => item.typeId === property.typeId).length;
    const canBuy = p.cash >= price && !state.gameOver;
    return `<div class="realty-item"><span class="realty-icon">${property.icon}</span><div><div class="realty-name">${property.name}${owned ? ` <span class="positive">(${fa0(owned)} عدد)</span>` : ''}</div><div class="realty-price">${safeMoney(price)} · اجاره ${formatPercent(state.econ.rentYield * property.rentMult)}</div></div><button class="buy-property" data-property="${esc(property.typeId)}" ${canBuy ? '' : 'disabled'}>خرید</button></div>`;
  }).join('');
}
function portfolioStat(label, value, icon, tone) { return `<article class="card portfolio-stat"><span>${label}</span><strong>${value}</strong><span class="stat-icon ${tone}">${icon}</span></article>`; }

function renderNews() {
  const list = $('#all-news-list');
  if (list) {
    const filtered = state.news.filter((item) => newsFilter === 'all' || item.kind === newsFilter);
    list.innerHTML = filtered.length ? filtered.map((item, index) => newsItem(item, index)).join('') : emptyNews();
  }
  const achievementList = $('#achievement-list');
  if (achievementList) {
    achievementList.innerHTML = ACHIEVEMENTS.map(([id, name, icon]) => {
      const unlocked = state.achievements.some((item) => item.id === id);
      return `<div class="achievement-item ${unlocked ? 'unlocked' : ''}"><span class="achievement-icon">${icon}</span><span class="achievement-name">${name}</span><span class="achievement-lock">${unlocked ? '✓' : '◌'}</span></div>`;
    }).join('');
  }
  setText('#achievement-count', `${fa0(state.achievements.length)}/${fa0(ACHIEVEMENTS.length)}`);
}

function renderCharts() {
  const e = state.econ;
  const g = state.gov;
  const gdp = series('gdp', e.gdp);
  const months = seriesMonths(gdp);
  drawLine($('#gdp-chart'), [{ data: gdp, color: '#4ea8ff', fill: true }], { months, yFmt: (v) => fa(v, 0) });
  const infl = series('infl', e.inflAnnual).map((value) => value * 100);
  const inflMonths = seriesMonths(infl);
  drawLine($('#infl-chart'), [{ data: infl, color: '#f4bd58', fill: true }], { months: inflMonths, yFmt: (v) => `${fa(v, 0)}٪`, target: { value: 8, color: '#38d39f', label: 'هدف' } });
  const policyInfl = series('infl', e.inflAnnual).map((value) => value * 100);
  const policyRate = series('rate', e.marketRate).map((value) => value * 100);
  drawLine($('#policy-chart'), [{ data: policyInfl, color: '#f4bd58' }, { data: policyRate, color: '#4ea8ff' }], { months: seriesMonths(policyInfl), yFmt: (v) => `${fa(v, 0)}٪` });
  drawGauge($('#confidence-gauge'), e.confidence, '#4ea8ff', 'اعتماد بازار');
  drawGauge($('#approval-gauge'), g.approval / 100, g.approval > 50 ? '#38d39f' : '#ff6b86', 'محبوبیت دولت');
  drawBars($('#budget-bars'), [{ label: 'درآمد دولت', value: g.revenue, color: '#38d39f' }, { label: 'هزینه دولت', value: g.spending, color: '#ff6b86' }, { label: 'بهره بدهی', value: g.interestPaid, color: '#f4bd58' }]);
  const index = series('index', e.index);
  drawLine($('#market-chart'), [{ data: index, color: '#38d39f', fill: true }], { months: seriesMonths(index), yFmt: (v) => fa(v, 0) });
  const hpi = series('hpi', e.hpi);
  drawLine($('#housing-chart'), [{ data: hpi, color: '#a78bfa', fill: true }], { months: seriesMonths(hpi), yFmt: (v) => fa(v, 0) });
}

function showView(view) {
  activeView = NAV_TITLES[view] ? view : 'dashboard';
  $$('.view').forEach((element) => element.classList.toggle('hidden', element.id !== `view-${activeView}`));
  $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === activeView));
  setText('#mobile-title', NAV_TITLES[activeView]);
  $('.sidebar')?.classList.remove('open');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function togglePlay() {
  if (state.gameOver) { openGameOver(); return; }
  state.paused = !state.paused;
  if (state.paused) stopTimer(); else startTimer();
  renderShell();
  saveGame();
}
function startTimer() {
  stopTimer();
  const interval = Math.max(120, 1500 / speed);
  timer = window.setInterval(advanceMonth, interval);
}
function stopTimer() { if (timer) { window.clearInterval(timer); timer = null; } }
function advanceMonth() {
  if (state.gameOver) { stopTimer(); state.paused = true; render(); return; }
  tick(state);
  recalculateNetWorth();
  render();
  saveGame();
  if (state.gameOver) { stopTimer(); state.paused = true; window.setTimeout(openGameOver, 350); }
}
function setSpeed(value) {
  speed = Number(value) || 1;
  state.speed = speed;
  renderShell();
  if (!state.paused) startTimer();
}

function toast(message, kind = 'info', icon = kind === 'good' ? '✓' : kind === 'bad' ? '!' : '✦') {
  const stack = $('#toast-stack');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.innerHTML = `<span class="toast-icon">${icon}</span><span>${esc(message)}</span>`;
  stack.appendChild(node);
  window.setTimeout(() => node.remove(), 4000);
}

function openModal(content, onClose = null) {
  const backdrop = $('#modal-backdrop');
  const modal = $('#modal-content');
  if (!backdrop || !modal) return;
  modal.innerHTML = content;
  backdrop.classList.remove('hidden');
  modalEscapeHandler = (event) => { if (event.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', modalEscapeHandler);
  backdrop.onclick = (event) => { if (event.target === backdrop) closeModal(); };
  $('.modal-close', modal)?.addEventListener('click', closeModal);
  modal._onClose = onClose;
}
function closeModal() {
  const backdrop = $('#modal-backdrop');
  const modal = $('#modal-content');
  if (!backdrop) return;
  backdrop.classList.add('hidden');
  if (modal?._onClose) modal._onClose();
  if (modal) { modal.innerHTML = ''; modal._onClose = null; }
  if (modalEscapeHandler) document.removeEventListener('keydown', modalEscapeHandler);
  modalEscapeHandler = null;
}

function openNewGameModal() {
  const scenarioCards = SCENARIOS.map((scenario, index) => `<button class="scenario-option ${scenario.id === state.scenario ? 'selected' : ''}" data-scenario="${scenario.id}"><span class="scenario-option-icon">${scenario.icon}</span><span><span class="scenario-option-name">${scenario.name}</span><span class="scenario-option-desc">${scenario.desc}</span></span><span class="difficulty ${scenario.difficulty === 'سخت' ? 'hard' : ''}">${scenario.difficulty}</span></button>`).join('');
  openModal(`<div class="modal-head"><div><h2>یک فصل تازه شروع کن</h2><p>سناریوی اقتصادی خودت را انتخاب کن. همه‌ی شاخص‌ها، شوک‌ها و تصمیم‌ها از این نقطه آغاز می‌شوند.</p></div><button class="modal-close">×</button></div><div class="scenario-grid">${scenarioCards}</div><div class="modal-footer"><button class="btn btn-primary" id="confirm-scenario">شروع شبیه‌سازی</button><button class="btn btn-ghost modal-cancel">انصراف</button></div>`);
  let selected = state.scenario;
  $$('.scenario-option').forEach((button) => button.addEventListener('click', () => { selected = button.dataset.scenario; $$('.scenario-option').forEach((item) => item.classList.toggle('selected', item === button)); }));
  $('.modal-cancel')?.addEventListener('click', closeModal);
  $('#confirm-scenario')?.addEventListener('click', () => { state = newGame(selected); speed = 1; stopTimer(); activeView = 'dashboard'; showView('dashboard'); closeModal(); saveGame(); toast('سناریوی جدید آماده شد. آینده اقتصاد به تو بستگی دارد.', 'good', '🎮'); });
}

function openResetModal() {
  openModal(`<div class="modal-head"><div><h2>از اول شروع کنیم؟</h2><p>پیشرفت فعلی این سناریو پاک می‌شود و بازی از فروردین ۱۴۰۴ دوباره آغاز خواهد شد.</p></div><button class="modal-close">×</button></div><div class="modal-footer"><button class="btn btn-primary" id="confirm-reset">شروع مجدد</button><button class="btn btn-ghost modal-cancel">انصراف</button></div>`);
  $('.modal-cancel')?.addEventListener('click', closeModal);
  $('#confirm-reset')?.addEventListener('click', () => { state = newGame(state.scenario); speed = 1; stopTimer(); closeModal(); render(); saveGame(); toast('سناریو از ابتدا شروع شد.', 'info', '↻'); });
}

function openHelpModal() {
  openModal(`<div class="modal-head"><div><h2>راهنمای اقتصادستان</h2><p>یک اقتصاد زنده، همیشه بین چند هدف دشوار در حال انتخاب است.</p></div><button class="modal-close">×</button></div><div class="help-grid"><div class="help-item"><strong>⌁ هر ماه چه می‌شود؟</strong><span>تقاضا، تولید، اشتغال، تورم، ارز، بانک‌ها و بازارها هم‌زمان به سیاست‌ها و شوک‌های تصادفی واکنش نشان می‌دهند.</span></div><div class="help-item"><strong>◉ سیاست پولی</strong><span>نرخ بهره بالا تورم را آرام می‌کند، اما سرمایه‌گذاری و رشد را به قیمت رکود کاهش می‌دهد.</span></div><div class="help-item"><strong>▣ بودجه دولت</strong><span>آموزش، زیرساخت و پژوهش ظرفیت آینده را می‌سازند؛ رفاه و یارانه محبوبیت امروز را بالا می‌برند.</span></div><div class="help-item"><strong>◇ بازارها</strong><span>ارز، سهام و مسکن به نقدینگی، ریسک، سود بنگاه‌ها و انتظارات پاسخ می‌دهند. در سبد خود تنوع بساز.</span></div><div class="help-item"><strong>⏯ کنترل زمان</strong><span>ماه‌ها را دستی جلو ببر یا شبیه‌سازی را روی سرعت دلخواه اجرا کن. Space هم شروع/توقف می‌کند.</span></div><div class="help-item"><strong>✦ هدف نهایی</strong><span>رشد پایدار بساز، تورم را مهار کن، اعتماد عمومی را حفظ کن و پنج سال دوام بیاور.</span></div></div><div class="modal-footer"><button class="btn btn-primary modal-cancel">متوجه شدم</button></div>`);
  $('.modal-cancel')?.addEventListener('click', closeModal);
}

function openEventsModal() {
  const recent = state.news.filter((item) => item.kind !== 'info').slice(0, 8);
  const content = recent.length ? recent.map(newsItem).join('') : '<div class="empty-state"><strong>آسمان آرام است</strong>هنوز رویداد ویژه‌ای رخ نداده است.</div>';
  openModal(`<div class="modal-head"><div class="event-modal-header"><span class="event-modal-icon">✦</span><div><h2>رویدادهای تاثیرگذار</h2><p>شوک‌هایی که مسیر اقتصاد را تغییر داده‌اند.</p></div></div><button class="modal-close">×</button></div><div class="full-news-list">${content}</div><div class="modal-footer"><button class="btn btn-ghost modal-cancel">بستن</button></div>`);
  $('.modal-cancel')?.addEventListener('click', closeModal);
}

function openGameOver() {
  if (!state.gameOver) return;
  stopTimer();
  state.paused = true;
  openModal(`<div class="game-over"><div class="game-over-icon">${state.gameOver.icon}</div><h2>${esc(state.gameOver.title)}</h2><p>${esc(state.gameOver.desc)}</p><div class="final-stats"><div><span>مدت حکمرانی</span><strong>${fa0(state.month)} ماه</strong></div><div><span>تورم نهایی</span><strong>${formatPercent(state.econ.inflAnnual)}</strong></div><div><span>محبوبیت</span><strong>${fa0(state.gov.approval)}٪</strong></div></div><div class="modal-footer"><button class="btn btn-primary" id="game-over-restart">شروع دوباره همین سناریو</button><button class="btn btn-ghost" id="game-over-new">سناریوی جدید</button></div></div>`);
  $('#game-over-restart')?.addEventListener('click', () => { closeModal(); state = newGame(state.scenario); render(); saveGame(); });
  $('#game-over-new')?.addEventListener('click', () => { closeModal(); openNewGameModal(); });
}

function openTradeModal(company) {
  const held = state.player.stocks[company.id] || 0;
  const price = company.price;
  openModal(`<div class="modal-head"><div><h2>معامله ${esc(company.name)}</h2><p>${esc(company.sector)} · خرید و فروش در تابلوی اقتصادستان</p></div><button class="modal-close">×</button></div><div class="trade-modal"><div class="trade-summary"><div><span>قیمت هر سهم</span><strong>${tomanStr(price)}</strong></div><div><span>موجودی شما</span><strong>${fa0(held)} سهم</strong></div><div><span>نقدینگی</span><strong>${safeMoney(state.player.cash)}</strong></div></div><div class="trade-input-row"><label><span class="field-label">تعداد سهم</span><input class="number-input" id="trade-amount" type="number" min="1" step="1" value="100000" /></label><label><span class="field-label">ارزش معامله</span><input class="number-input" id="trade-cost" type="text" value="—" readonly /></label></div><div class="modal-footer"><button class="btn btn-primary" id="confirm-buy">خرید سهم</button><button class="btn btn-outline" id="confirm-sell">فروش سهم</button><button class="btn btn-ghost modal-cancel">انصراف</button></div></div>`);
  const amountInput = $('#trade-amount');
  const costInput = $('#trade-cost');
  const updateCost = () => { const amount = Math.max(0, Number(amountInput?.value) || 0); if (costInput) costInput.value = safeMoney(amount * price / 5e12); };
  amountInput?.addEventListener('input', updateCost);
  updateCost();
  $('#confirm-buy')?.addEventListener('click', () => tradeStock(company, 'buy', Number(amountInput?.value) || 0));
  $('#confirm-sell')?.addEventListener('click', () => tradeStock(company, 'sell', Number(amountInput?.value) || 0));
  $('.modal-cancel')?.addEventListener('click', closeModal);
}
function tradeStock(company, side, amount) {
  amount = Math.floor(amount);
  if (amount <= 0) { toast('تعداد سهم باید بزرگ‌تر از صفر باشد.', 'bad'); return; }
  const cost = amount * company.price / 5e12;
  const held = state.player.stocks[company.id] || 0;
  if (side === 'buy') {
    if (state.player.cash < cost) { toast('نقدینگی کافی برای این معامله ندارید.', 'bad', '⚠️'); return; }
    state.player.cash -= cost;
    state.player.stocks[company.id] = held + amount;
    pushNews(state, { icon: '📈', kind: 'info', text: `شما ${fa0(amount)} سهم ${company.name} را خریدید.` });
    toast(`خرید ${fa0(amount)} سهم با موفقیت انجام شد.`, 'good', '📈');
  } else {
    if (held < amount) { toast('تعداد سهام قابل فروش شما کافی نیست.', 'bad', '⚠️'); return; }
    state.player.cash += cost;
    state.player.stocks[company.id] = held - amount;
    pushNews(state, { icon: '💵', kind: 'info', text: `شما ${fa0(amount)} سهم ${company.name} را فروختید.` });
    toast(`فروش ${fa0(amount)} سهم انجام شد.`, 'good', '💵');
  }
  recalculateNetWorth(); closeModal(); render(); saveGame();
}

function buyProperty(typeId) {
  const property = state.realty.find((item) => item.typeId === typeId);
  if (!property) return;
  const price = propertyValue(state, { typeId, quality: 1 });
  if (state.player.cash < price) { toast('نقدینگی کافی برای خرید این ملک ندارید.', 'bad', '🏚️'); return; }
  state.player.cash -= price;
  state.player.properties.push({ typeId, quality: 1, price0: price, month: state.month });
  pushNews(state, { icon: property.icon, kind: 'info', text: `شما یک ${property.name} به ارزش ${safeMoney(price)} خریدید.` });
  recalculateNetWorth(); render(); saveGame(); toast(`${property.name} به سبد شما اضافه شد.`, 'good', property.icon);
}
function tradeBond() {
  openModal(`<div class="modal-head"><div><h2>اوراق دولتی</h2><p>بازدهی ثابت، ریسک پایین‌تر و کمک مستقیم به تامین مالی دولت.</p></div><button class="modal-close">×</button></div><div class="trade-modal"><div class="trade-summary"><div><span>هر واحد اوراق</span><strong>${safeMoney(.01)}</strong></div><div><span>بازده سالانه</span><strong>${formatPercent(bondYieldOf(state))}</strong></div><div><span>موجودی شما</span><strong>${safeMoney(state.player.bonds)}</strong></div></div><label><span class="field-label">تعداد واحد (هر واحد ≈ ۵۰ میلیارد تومان)</span><input class="number-input" id="bond-amount" type="number" min="0.01" step="0.01" value="0.01" /></label><div class="modal-footer"><button class="btn btn-primary" id="confirm-bond-buy">خرید اوراق</button><button class="btn btn-outline" id="confirm-bond-sell">فروش اوراق</button><button class="btn btn-ghost modal-cancel">انصراف</button></div></div>`);
  const amount = () => Math.max(.01, Number($('#bond-amount')?.value) || 0);
  $('#confirm-bond-buy')?.addEventListener('click', () => {
    const value = amount();
    if (state.player.cash < value) { toast('نقدینگی کافی ندارید.', 'bad'); return; }
    state.player.cash -= value; state.player.bonds += value; closeModal(); render(); saveGame(); toast('اوراق دولتی خریداری شد.', 'good', '▤');
  });
  $('#confirm-bond-sell')?.addEventListener('click', () => {
    const value = amount();
    if (state.player.bonds < value) { toast('موجودی اوراق شما کافی نیست.', 'bad'); return; }
    state.player.bonds -= value; state.player.cash += value; closeModal(); render(); saveGame(); toast('اوراق فروخته شد و وجه به حساب نقدی برگشت.', 'good', '▤');
  });
  $('.modal-cancel')?.addEventListener('click', closeModal);
}

function handleDelegatedClick(event) {
  const nav = event.target.closest('[data-view]');
  if (nav) { showView(nav.dataset.view); return; }
  const link = event.target.closest('[data-view-link]');
  if (link) { showView(link.dataset.viewLink); return; }
  const trade = event.target.closest('[data-trade]');
  if (trade) { const company = state.market.companies.find((item) => item.id === trade.dataset.trade); if (company) openTradeModal(company); return; }
  const prop = event.target.closest('[data-property]');
  if (prop) { buyProperty(prop.dataset.property); return; }
  const regime = event.target.closest('[data-fx-regime]');
  if (regime) {
    state.econ.fxRegime = regime.dataset.fxRegime;
    renderMonetary(); renderMarkets(); saveGame();
    toast(state.econ.fxRegime === 'managed' ? 'بانک مرکزی از نرخ ارز دفاع می‌کند؛ ذخایر هزینه خواهد شد.' : 'نرخ ارز به بازار شناور سپرده شد.', 'info', '◇');
    return;
  }
  const sector = event.target.closest('[data-sector]');
  if (sector) { marketSector = sector.dataset.sector; $$('.filter-chip[data-sector]').forEach((item) => item.classList.toggle('active', item === sector)); renderMarkets(); return; }
  const filter = event.target.closest('[data-news-filter]');
  if (filter) { newsFilter = filter.dataset.newsFilter; $$('.filter-chip[data-news-filter]').forEach((item) => item.classList.toggle('active', item === filter)); renderNews(); return; }
}

function bindEvents() {
  document.addEventListener('click', handleDelegatedClick);
  $('#play-btn')?.addEventListener('click', togglePlay);
  $('#next-month-btn')?.addEventListener('click', advanceMonth);
  $('#save-btn')?.addEventListener('click', () => { saveGame(); toast('بازی در حافظه دستگاه ذخیره شد.', 'good', '⌄'); });
  $('#help-btn')?.addEventListener('click', openHelpModal);
  $('#new-game-btn')?.addEventListener('click', openNewGameModal);
  $('#reset-btn')?.addEventListener('click', openResetModal);
  $('#open-events-btn')?.addEventListener('click', openEventsModal);
  $('#subsidy-btn')?.addEventListener('click', () => { const result = doSubsidyReform(state); if (result.ok !== false) { render(); saveGame(); toast('اصلاح یارانه اجرا شد؛ اقتصاد باید با شوک اولیه سازگار شود.', 'info', '⛽'); } });
  $('#qe-btn')?.addEventListener('click', () => { const result = doQE(state); if (result.ok) { render(); saveGame(); toast('برنامه تزریق نقدینگی برای شش ماه آغاز شد.', 'info', '🖨️'); } else toast(result.msg || 'این ابزار فعلاً در دسترس نیست.', 'bad', '⚠️'); });
  $('#buy-bond-btn')?.addEventListener('click', tradeBond);
  $('#clear-news-btn')?.addEventListener('click', () => { state._tmp.readNews = state.news.length; renderShell(); renderNews(); saveGame(); toast('همه خبرها خوانده شدند.', 'good', '✓'); });
  $('#mobile-menu')?.addEventListener('click', () => $('.sidebar')?.classList.toggle('open'));
  $('#policy-rate-slider')?.addEventListener('input', (event) => { state.econ.policyRate = Number(event.target.value); renderMonetary(); });
  $('#policy-rate-slider')?.addEventListener('change', () => { saveGame(); toast('نرخ سیاستی به‌روزرسانی شد.', 'info', '◉'); });
  $('#reserve-slider')?.addEventListener('input', (event) => { state.econ.reserveReq = Number(event.target.value); renderMonetary(); });
  $('#reserve-slider')?.addEventListener('change', () => { saveGame(); toast('نسبت ذخیره قانونی تغییر کرد.', 'info', '▤'); });
  $('#spending-list')?.addEventListener('input', (event) => {
    const input = event.target.closest('[data-spend]');
    if (!input) return;
    const id = input.dataset.spend;
    state.gov.spend[id] = Number(input.value);
    const output = $(`[data-spend-output="${id}"]`);
    if (output) output.textContent = formatPercent(Number(input.value));
    const total = Object.values(state.gov.spend).reduce((sum, value) => sum + value, 0);
    setText('#spending-total-value', `${formatPercent(total)} از GDP`);
  });
  $('#spending-list')?.addEventListener('change', () => { saveGame(); toast('ترکیب بودجه دولت ذخیره شد.', 'info', '▣'); renderFiscal(); renderCharts(); });
  const taxBindings = [['income-tax-slider', 'income-tax-value', 'incomeTax'], ['corp-tax-slider', 'corp-tax-value', 'corpTax'], ['vat-slider', 'vat-value', 'vat'], ['tariff-slider', 'tariff-value', 'tariff']];
  taxBindings.forEach(([inputId, outputId, stateKey]) => {
    $(`#${inputId}`)?.addEventListener('input', (event) => { state.gov[stateKey] = Number(event.target.value); setText(`#${outputId}`, formatPercent(state.gov[stateKey])); });
    $(`#${inputId}`)?.addEventListener('change', () => { saveGame(); toast('نرخ مالیاتی تغییر کرد؛ اثر آن در تراز بعدی دیده می‌شود.', 'info', '٪'); renderFiscal(); renderCharts(); });
  });
  $$('.speed-control button').forEach((button) => button.addEventListener('click', () => setSpeed(button.dataset.speed)));
  document.addEventListener('keydown', (event) => { if (event.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); togglePlay(); } });
  window.addEventListener('beforeunload', saveGame);
}

bindEvents();
showView('dashboard');
if (state.month > 0) toast('بازی ذخیره‌شده بازیابی شد.', 'info', '↻');
