// ─── موتور شبیه‌سازی اقتصاد (هر تیک = یک ماه) ──────────────────────────
import { ALPHA, EVENTS, HIST_CAP, NATURAL_UNEMP, TARGET_INFLATION } from './config.js';
import { clamp, chance, gauss, money } from './utils.js';
import { pushNews } from './state.js';

const US_RATE = 0.04;

export function bondYieldOf(s) {
  const g = s.gov;
  const spread = Math.max(0, g.debtGDP - 0.55) * 0.09;
  return clamp(s.econ.policyRate + 0.015 + spread, 0.02, 0.9);
}

function capDec(s) {
  for (const k of ['prodBoost', 'prodHit', 'brainDrain', 'exportBoost', 'foodShock', 'rebuild', 'tension']) {
    if (s.mods[k] > 0) s.mods[k]--;
  }
  if (s.econ.creditTight > 0) s.econ.creditTight--;
  if (s.mods.pandemic) {
    s.mods.pandemicMonths++;
    if (s.mods.pandemicMonths > 9) { s.mods.pandemic = false; pushNews(s, { icon: '🦠', text: 'موج بیماری فروکش کرد؛ محدودیت‌ها برداشته شد.', kind: 'good' }); }
  }
  if (s.mods.sanctioned) s.mods.sanctionMonths++;
  if (s._tmp.qeCooldown > 0) s._tmp.qeCooldown--;
  if (s._tmp.qeMonths > 0) {
    s._tmp.qeMonths--;
    if (s._tmp.qeMonths === 0) { s.econ.qeActive = 0; pushNews(s, { icon: '🖨️', text: 'برنامه تزریق نقدینگی بانک مرکزی به پایان رسید.', kind: 'info' }); }
  }
}

export function tick(s) {
  const e = s.econ, g = s.gov, p = s.player, m = s.mods;
  s.month++;
  capDec(s);

  const prevFx = e.fx;
  const prevCpi = e.cpi;
  const hist = s.history;
  const gdp12 = hist.gdp.length >= 12 ? hist.gdp[hist.gdp.length - 12] : e.gdp;
  const cpi12 = hist.cpi && hist.cpi.length >= 12 ? hist.cpi[hist.cpi.length - 12] : e.cpi;
  const m212 = hist.m2.length >= 12 ? hist.m2[hist.m2.length - 12] : e.m2;

  // ۱) قیمت نفت: گام تصادفی + جهش‌ها
  e.oilPrice = clamp(e.oilPrice * (1 + gauss() * 0.035), 28, 190);

  // ۲) بهره‌وری (فناوری، آموزش، پژوهش)
  const sp = g.spend;
  let prodG = 0.004 + sp.rd * 0.25 + sp.edu * 0.08 + sp.infra * 0.04;
  if (m.prodBoost > 0) prodG += 0.02;
  if (m.prodHit > 0) prodG -= 0.028;
  if (m.brainDrain > 0) prodG -= 0.014;
  if (m.rebuild > 0) prodG -= 0.004;
  e.prodGrowth = prodG;
  e.productivity *= 1 + clamp(prodG, -0.05, 0.07) / 12;

  // ۳) انباشت سرمایه (سرمایه‌گذاری ماه قبل منهای استهلاک)
  const invest = s._tmp.lastInvest ?? e.gdp * 0.17;
  e.capital = Math.max(800, e.capital + invest - e.capital * 0.0075);
  if (e.capitalShock > 0) { e.capital *= 1 - e.capitalShock; e.capitalShock = 0; }

  // ۴) تولید بالقوه و جمعیت فعال
  e.population *= 1 + 0.009 / 12;
  let wfGrowth = 0.011;
  if (m.brainDrain > 0) wfGrowth -= 0.006;
  e.workforce *= 1 + wfGrowth / 12;
  e.potential = e.productivity * Math.pow(e.capital, ALPHA) * Math.pow(e.workforce * 0.96, 1 - ALPHA);

  // ۵) نرخ‌های بهره و اعتماد
  const by = bondYieldOf(s);
  e.marketRate = clamp(e.policyRate + 0.02 + e.npl * 0.5 - (e.qeActive > 0 ? 0.015 : 0), 0.02, 0.95);
  const growthTrend = clamp(e.gdp / gdp12 - 1, -0.25, 0.25);
  e.confidenceHit *= 0.9;
  e.sentiment *= e.sentimentDecay;
  e.confidence = clamp(
    0.52 + growthTrend * 1.6 - Math.max(0, e.inflAnnual - TARGET_INFLATION) * 0.7 +
    e.sentiment * 0.3 + (g.approval - 50) * 0.0035 + e.confidenceHit, 0.08, 0.95);

  // ۶) بخش خارجی: نفت، صادرات، واردات
  const oilBarrels = e.oilProd * 1e6 * 30 * 0.45; // سهم صادراتی تولید
  e.oilRevenue = (oilBarrels * e.oilPrice * e.fx) / 5e12;
  const compet = clamp(Math.pow(e.fx / e.fxAnchor, 0.5), 0.65, 1.5) * (m.exportBoost > 0 ? 1.12 : 1);
  const nonOilX = e.gdp * 0.083 * compet;
  e.exports = e.oilRevenue + nonOilX;
  const absorbBase = (s._tmp.lastC ?? e.gdp * 0.52) + (s._tmp.lastInvest ?? e.gdp * 0.17) + (s._tmp.lastG ?? e.gdp * 0.2);
  e.imports = 0.13 * absorbBase / compet;
  e.tradeBalance = e.exports - e.imports;
  e.fxAnchor = e.fxAnchor * 0.992 + e.fx * 0.008;

  // ۷) مخارج بخش خصوصی
  const laborIncome = e.wage * e.employed;
  const subsidyShare = g.subsidyReform ? sp.subsidy * 0.35 : sp.subsidy;
  const transfers = (sp.welfare + subsidyShare) * e.gdp * 0.9;
  const disposable = laborIncome * (1 - g.incomeTax * 0.75) + transfers;
  const realRate = e.marketRate - e.inflAnnual;
  let C = disposable * 0.92 * (1 - clamp(realRate, -0.05, 0.2) * 0.14) * (0.9 + e.confidence * 0.18);

  let I = e.gdp * (0.175 + 0.35 * (e.capUtil - 0.92)) *
    clamp(1 - (realRate - 0.06) * 0.8, 0.5, 1.45) * (0.7 + e.confidence * 0.55);
  if (e.creditTight > 0) I *= 0.62;
  else if (e.bankHealth < 0.6) I *= 0.65 + 0.6 * e.bankHealth;
  I = clamp(I, e.gdp * 0.04, e.gdp * 0.32);

  const G = Object.values(sp).reduce((a, b) => a + b, 0) * e.gdp;
  const NX = e.exports - e.imports;
  const AD = C + I + G + NX;

  // ۸) تولید واقعی و شکاف تولید
  e.outputGap = (AD - e.potential) / e.potential;
  e.gdp = e.potential * (1 + clamp(e.outputGap, -0.22, 0.06));
  e.capUtil = clamp(e.gdp / e.potential, 0.55, 1.06);
  e.growthAnnual = e.gdp / gdp12 - 1;
  s._tmp.lastC = C; s._tmp.lastInvest = I; s._tmp.lastG = G;

  // ۹) بازار کار (کندلی اسمی)
  const desired = e.employed * (1 + 0.75 * e.outputGap);
  e.employed = clamp(e.employed + clamp(desired - e.employed, -0.28, 0.28),
    e.workforce * 0.5, e.workforce * 0.995);
  e.unemployed = e.workforce - e.employed;
  e.uRate = e.unemployed / e.workforce;

  // ۱۰) دستمزد (منحنی فیلیپس + بهره‌وری)
  const wageG = e.inflExpect + (NATURAL_UNEMP - e.uRate) * 1.1 + prodG * 0.45;
  e.wage *= 1 + clamp(wageG, -0.08, 0.65) / 12;
  e.wage = Math.max(e.wage, e.minWage * 1.02);

  // ۱۱) تورم
  const gapPressure = clamp(e.outputGap, -0.16, 0.06) * 0.55;
  const m2g = e.m2 / m212 - 1;
  e.m2Growth = m2g;
  const nomGdpG = e.gdp / gdp12 - 1 + e.inflAnnual;
  const moneyPressure = clamp((m2g - nomGdpG - 0.03) * 0.12, 0, 0.05);
  e.costPush *= 0.93;
  const foodP = m.foodShock > 0 ? 0.035 : 0;
  const annualPi = 0.52 * e.inflExpect + 0.26 * e.inflAnnual + gapPressure + moneyPressure + foodP;
  const fxChange = e.fx / prevFx - 1;
  // انتقال نرخ ارز به قیمت‌ها تدریجی است؛ شوک کامل در همان ماه وارد نمی‌شود.
  e.inflMonthly = clamp(annualPi / 12 + fxChange * 0.08 + e.costPush + gauss() * 0.0004, -0.04, 0.08);
  e.cpi *= 1 + e.inflMonthly;
  // تا قبل از کامل شدن داده‌ی ۱۲ماهه، نرخ فعلی را سالانه‌سازی می‌کنیم تا
  // داشبورد از همان ماه اول «تورم سالانه»ی معنادار نشان دهد.
  e.inflAnnual = hist.cpi && hist.cpi.length >= 12
    ? e.cpi / cpi12 - 1
    : clamp(Math.pow(1 + e.inflMonthly, 12) - 1, -0.35, 1.5);
  const credibility = e.policyRate > e.inflAnnual ? 0.18 : 0.10;
  e.inflExpect = clamp((1 - credibility) * e.inflExpect + credibility * e.inflAnnual, 0.01, 1.5);

  // ۱۲) پول و بانکداری
  if (e.qeActive > 0) e.m2 += e.qeActive;
  const creditG = clamp(0.14 + nomGdpG * 0.35 + (realRate < 0 ? 0.07 : -0.02) + e.sentiment * 0.06 + (e.qeActive > 0 ? 0.06 : 0), 0.04, 0.8);
  e.m2 *= 1 + creditG / 12;
  e.deposits *= 1 + creditG * 0.9 / 12;
  e.loans = e.deposits * (1 - e.reserveReq) * 0.92;
  const defaultFlow = 0.0035 + Math.max(0, e.uRate - NATURAL_UNEMP) * 0.3 + Math.max(0, -e.growthAnnual) * 0.22;
  e.npl = clamp(e.npl * 0.962 + defaultFlow, 0.008, 0.45);
  e.bankHealth = clamp(1 - (e.npl - 0.03) * 3, 0.05, 1);

  // ۱۳) بودجه دولت
  const profitPool = e.gdp * 0.3;
  g.revenue = g.collect * (
    g.incomeTax * laborIncome * 0.8 +
    g.corpTax * profitPool * 0.85 +
    g.vat * C * 0.78 +
    g.tariff * e.imports * 0.9
  ) + e.oilRevenue * 0.7;
  g.interestPaid = g.debt * by / 12;
  g.spending = G + g.interestPaid;
  g.balance = g.revenue - g.spending;
  g.debt = Math.max(0, g.debt - g.balance);
  g.debtGDP = g.debt / (e.gdp * 12);
  if (g.debtGDP > 0.9 && !s._tmp.debtWarned) {
    s._tmp.debtWarned = true;
    e.riskPrem += 0.004;
    pushNews(s, { icon: '⚠️', text: 'نسبت بدهی دولت از ۹۰٪ تولید ناخالص گذشت؛ هزینه استقراض بالا رفت و اعتماد سرمایه‌گذاران آسیب دید.', kind: 'bad' });
  }
  if (g.debtGDP < 0.7) s._tmp.debtWarned = false;

  // ۱۴) بازار ارز
  let pressure = 0.35 * (e.imports - e.exports) / e.gdp
    + (e.inflAnnual - 0.03) / 12
    + e.flight + e.riskPrem
    + (US_RATE - e.policyRate) * 0.0035
    + 0.006 + gauss() * 0.004;
  if (m.tension > 0) pressure += 0.004;
  if (m.sanctioned) pressure += 0.006;
  if (e.fxRegime === 'managed') {
    if (pressure > 0 && e.reserves > 5) {
      e.reserves -= pressure * e.gdp * 1.4;
      pressure *= 0.45;
    } else if (pressure > 0) {
      if (!s._tmp.reservesWarned) {
        s._tmp.reservesWarned = true;
        pushNews(s, { icon: '🚨', text: 'ذخایر ارزی رو به اتمام است! بانک مرکزی دیگر نمی‌تواند از نرخ ارز دفاع کند.', kind: 'bad' });
      }
    } else {
      e.reserves += Math.abs(pressure) * e.gdp * 0.7;
      pressure *= 0.75;
    }
  } else {
    s._tmp.reservesWarned = false;
    e.reserves = clamp(e.reserves + gauss() * 2, 0, 2000);
  }
  e.reserves = Math.max(0, e.reserves);
  e.fx = clamp(e.fx * (1 + clamp(pressure, -0.06, 0.09)), e.fxAnchor * 0.35, e.fxAnchor * 6);

  // ۱۵) بازار سهام
  let totalCap = 0;
  const gExp = clamp(prodG + 0.02 + e.sentiment * 0.02, 0.01, 0.09);
  for (const c of s.market.companies) {
    const oilAdj = 1 + c.oilBeta * (e.oilPrice / 78 - 1) * 0.5;
    const profit12 = profitPool * 12 * c.w * oilAdj * (1 + gauss() * 0.02);
    // profit12 در واحد اقتصادی است؛ EPS برای بازار سهام باید تومان به‌ازای هر سهم باشد.
    c.eps = (profit12 * 5e12) / c.shares;
    const denom = Math.max(0.035, e.marketRate - e.inflAnnual * 0.4 - gExp);
    const targetP = c.eps / denom;
    c.prevPrice = c.price;
    c.price = Math.max(50, c.price + (targetP - c.price) * 0.10 + c.price * (e.sentiment * 0.005 + gauss() * 0.02));
    c.pe = c.price / (c.eps || 1);
    c.div = (profitPool * 3 * c.w * oilAdj * 0.28) / c.shares; // سود تقسیمی فصلی
    // تبدیل ارزش بازار از تومان به واحد اقتصادی برای مقایسه با cap0.
    totalCap += (c.price * c.shares) / 5e12;
  }
  const cap0Total = s.market.companies.reduce((a, c) => a + c.cap0, 0);
  e.index = (totalCap / cap0Total) * 100;
  // سود تقسیمی فصلی
  if (s.month % 3 === 0) {
    let divTotal = 0;
    for (const c of s.market.companies) {
      const held = p.stocks[c.id] || 0;
      if (held > 0) divTotal += held * c.div;
    }
    if (divTotal > 0) {
      p.cash += divTotal;
      pushNews(s, { icon: '💰', text: `سود نقدی فصلی سهام به ارزش ${money(divTotal)} به حساب شما واریز شد.`, kind: 'good' });
    }
  }

  // ۱۶) بازار مسکن
  const wageGAnnual = e.wage / (hist.wage && hist.wage.length ? hist.wage[hist.wage.length - 12 >= 0 ? Math.max(0, hist.wage.length - 12) : 0] : e.wage) - 1;
  let hpiG = 0.4 * e.inflAnnual + 0.42 * m2g + 0.2 * clamp(wageGAnnual, 0, 0.5)
    - Math.max(0, e.marketRate - e.inflAnnual - 0.04) * 0.22
    + fxChange * 1.6 - 0.012 + gauss() * 0.01;
  e.hpi *= 1 + clamp(hpiG, -0.14, 0.85) / 12;
  e.rentYield = clamp(0.055 - hpiG * 0.025, 0.018, 0.07);

  // ۱۷) دارایی بازیکن: اجاره، کوپن اوراق
  let rent = 0;
  for (const prop of p.properties) rent += propertyValue(s, prop) * e.rentYield / 12;
  p.cash += rent + p.bonds * by / 12;
  let nw = p.cash + p.bonds;
  for (const c of s.market.companies) nw += (p.stocks[c.id] || 0) * c.price;
  for (const prop of p.properties) nw += propertyValue(s, prop);
  p.netWorth = nw;

  // ۱۸) محبوبیت دولت
  const welfareShare = sp.welfare + (g.subsidyReform ? sp.subsidy * 0.35 : sp.subsidy);
  const apprTarget = 55 + e.growthAnnual * 240
    - (e.inflAnnual - TARGET_INFLATION) * 130
    - (e.uRate - NATURAL_UNEMP) * 320
    + (welfareShare - 0.08) * 120
    - Math.max(0, g.debtGDP - 0.8) * 30
    + e.confidenceHit * 20;
  g.approval = clamp(g.approval + clamp(apprTarget - g.approval, -5, 5) * 0.22, 0, 100);

  // ۱۹) رویدادهای تصادفی
  for (const ev of EVENTS) {
    if (ev.cond(s) && chance(ev.p)) {
      const d = {};
      ev.apply(s, d);
      pushNews(s, { icon: ev.icon, text: ev.text(d), kind: ev.bias });
      if (ev.bias === 'bad') e.sentiment -= 0.02;
    }
  }

  // ۲۰) گزارش‌های دوره‌ای
  if (s.month % 3 === 0) {
    pushNews(s, {
      icon: '📊',
      text: `گزارش فصلی: رشد اقتصادی ${(e.growthAnnual * 100).toFixed(1)}٪، تورم ${(e.inflAnnual * 100).toFixed(1)}٪، بیکاری ${(e.uRate * 100).toFixed(1)}٪.`,
      kind: 'info',
    });
  }

  // ۲۱) دستاوردها و پایان بازی
  checkAchievements(s);
  checkGameOver(s);

  // ۲۲) تاریخچه
  const h = s.history;
  const push = (arr, v) => { arr.push(v); if (arr.length > HIST_CAP) arr.shift(); };
  if (!h.cpi) h.cpi = [];
  if (!h.wage) h.wage = [];
  push(h.gdp, e.gdp); push(h.growth, e.growthAnnual); push(h.infl, e.inflAnnual);
  push(h.unemp, e.uRate); push(h.rate, e.marketRate); push(h.m2, e.m2);
  push(h.index, e.index); push(h.hpi, e.hpi); push(h.fx, e.fx); push(h.oil, e.oilPrice);
  push(h.debtGDP, g.debtGDP); push(h.approval, g.approval); push(h.netWorth, p.netWorth);
  push(h.balance, g.balance / e.gdp); push(h.trade, e.tradeBalance); push(h.confidence, e.confidence);
  push(h.cpi, e.cpi); push(h.wage, e.wage);

  return s;
}

export function propertyValue(s, prop) {
  const def = s.realty.find((r) => r.typeId === prop.typeId);
  return def.base * (s.econ.hpi / 100) * prop.quality;
}

// ─── اقدامات بازیکن ────────────────────────────────────────────────────
export function doQE(s) {
  if (s._tmp.qeCooldown > 0 || s.gameOver) return { ok: false, msg: 'بانک مرکزی هنوز در دوره پرهیز از تزریق جدید است.' };
  const amount = s.econ.m2 * 0.009;
  s.econ.qeActive = amount;
  s._tmp.qeMonths = 6;
  s._tmp.qeCooldown = 18;
  s.econ.sentiment += 0.05;
  pushNews(s, { icon: '🖨️', text: 'بانک مرکزی برنامه خرید اوراق و تزریق نقدینگی را آغاز کرد. بازارها موقتاً نفس کشیدند اما کارشناسان نگران تورم‌اند.', kind: 'info' });
  return { ok: true };
}

export function doSubsidyReform(s) {
  if (s.gov.subsidyReform || s.gameOver) return { ok: false };
  s.gov.subsidyReform = true;
  s.econ.costPush += 0.012; // جهش یکباره سطح قیمت‌ها
  s.gov.approval = Math.max(0, s.gov.approval - 9);
  s.econ.sentiment -= 0.05;
  pushNews(s, { icon: '⛽', text: 'جراحی بزرگ: یارانه پنهان انرژی حذف شد. قیمت حامل‌های انرژی جهش کرد اما بودجه دولت نفس کشید. اعتراضاتی در برخی شهرها گزارش شد.', kind: 'bad' });
  return { ok: true };
}

// ─── دستاوردها ─────────────────────────────────────────────────────────
const ACH = [
  { id: 'growth8', name: 'جهش اقتصادی', icon: '🚀', cond: (s) => s.econ.growthAnnual > 0.08 },
  { id: 'price_stable', name: 'مهار تورم', icon: '🎯', cond: (s) => s.econ.inflAnnual < 0.08 && s.month > 24 },
  { id: 'full_emp', name: 'اشتغال کامل', icon: '👷', cond: (s) => s.econ.uRate < 0.06 },
  { id: 'surplus', name: 'بودجه مازاد', icon: '🏦', cond: (s) => s.gov.balance / s.econ.gdp > 0.02 },
  { id: 'tycoon', name: 'ابرثروتمند', icon: '💎', cond: (s) => s.player.netWorth > 0.24 },
  { id: 'bull', name: 'گاوصفت', icon: '🐂', cond: (s) => s.econ.index > 200 },
  { id: 'hyper', name: 'ابر تورم!', icon: '🔥', cond: (s) => s.econ.inflAnnual > 0.5, bad: true },
  { id: 'crash', name: 'سقوط بازار', icon: '📉', cond: (s) => s.econ.index < 55, bad: true },
  { id: 'reserve_king', name: 'ذخایر ارزی نیرومند', icon: '💱', cond: (s) => s.econ.reserves > 600 },
  { id: 'survivor5', name: 'پنج سال حکمرانی', icon: '🏛️', cond: (s) => s.month >= 60 },
];

function checkAchievements(s) {
  for (const a of ACH) {
    if (s.achievements.some((x) => x.id === a.id)) continue;
    if (a.cond(s)) {
      s.achievements.push({ id: a.id, name: a.name, icon: a.icon, bad: !!a.bad, month: s.month });
      pushNews(s, { icon: a.icon, text: `نشان ${a.bad ? 'شوم' : 'افتخار'} «${a.name}» ثبت شد!`, kind: a.bad ? 'bad' : 'good' });
    }
  }
}

function checkGameOver(s) {
  const t = s._tmp;
  if (s.gameOver) return;
  t.lowAppr = s.gov.approval <= 6 ? (t.lowAppr || 0) + 1 : 0;
  if (t.lowAppr >= 6) {
    s.gameOver = { title: 'سقوط دولت', icon: '🏚️', desc: 'نارضایتی عمومی از کنترل خارج شد. دولت شما پس از شش ماه بحرانی مداوم، تاب نیاورد و برکنار شد.' };
    return;
  }
  if (s.econ.inflAnnual > 0.95) {
    s.gameOver = { title: 'ابرتورم', icon: '💸', desc: 'تورم از ۹۵٪ گذشت و پول ملی عملاً بی‌ارزش شد. اقتصاد به مبادله کالایی بازگشت و دوران شما به پایان رسید.' };
    return;
  }
  if (s.econ.reserves < 1 && s.econ.fxRegime === 'managed') {
    s.gameOver = { title: 'ورشکستگی ارزی', icon: '🕳️', desc: 'ذخایر ارزی کشور تماماً سوخت. بازار ارز از هم پاشید و بحران پرداخت‌های خارجی آغاز شد.' };
  }
}
