// ─── ساخت وضعیت اولیه بازی ─────────────────────────────────────────────
import { COMPANIES, SCENARIOS, TARGET_INFLATION } from './config.js';
import { clamp } from './utils.js';

const H = () => []; // تاریخچه خالی

export function newGame(scenarioId = 'abadan') {
  const sc = SCENARIOS.find((x) => x.id === scenarioId) || SCENARIOS[0];
  const sp = sc.setup;

  const infl = sp.inflation ?? 0.13;
  const inflExpect = sp.inflExpect ?? infl;
  const approval = sp.approval ?? 52;
  const reserves = sp.reserves ?? 310;
  const flight = sp.flight ?? 0.004;
  const sentiment = sp.sentiment ?? 0;
  const oilProd = sp.oilProd ?? 1.6;          // میلیون بشکه در روز
  const fx0 = sp.fx ?? 92000;                  // تومان به ازای هر دلار

  const workforce = 36;    // میلیون نفر
  const employed = 32.6;
  const wage = 4.95;       // واحد در ماه (≈ ۲۵ میلیون تومان)

  const s = {
    scenario: sc.id,
    scenarioName: sc.name,
    month: 0,               // ۰ = فروردین ۱۴۰۴
    speed: 1,
    paused: true,
    gameOver: null,

    econ: {
      population: 88.4,
      workforce,
      employed,
      unemployed: workforce - employed,
      uRate: (workforce - employed) / workforce,
      wage,
      minWage: 2.0,        // ≈ ۱۰ میلیون تومان

      productivity: sp.productivity ?? 1.0,
      prodGrowth: 0.008,
      capital: sp.capital ?? 4000,
      potential: 0,
      gdp: sp.gdp ?? 295,
      capUtil: 0.9,
      outputGap: 0,
      growthAnnual: 0.025,

      cpi: 100,
      inflMonthly: infl / 12,
      inflAnnual: infl,
      inflExpect,

      m2: 4200,            // نقدینگی (واحد)
      m2Growth: 0.22,
      policyRate: 0.23,    // نرخ سیاستی سالانه
      marketRate: 0.25,
      reserveReq: 0.13,
      qeActive: 0,         // واحد تزریق ماهانه
      fxRegime: 'float',   // float | managed

      deposits: 3600,
      loans: 3100,
      npl: 0.055,
      bankHealth: 0.8,
      creditTight: 0,      // ماه‌های باقی‌مانده انقباض اعتباری

      oilPrice: 78,
      oilProd,
      oilRevenue: 0,
      reserves,            // واحد (≈ هر واحد ۵ همت)
      fx: fx0,
      fxAnchor: fx0,
      riskPrem: 0.004,
      flight,
      exports: 0,
      imports: 0,
      tradeBalance: 0,

      confidence: sp.confidence ?? 0.55,
      confidenceHit: 0,
      sentiment,
      sentimentDecay: 0.94,

      costPush: 0,
      capitalShock: 0,
      index: 100,
      hpi: 100,
      rentYield: 0.038,
    },

    gov: {
      incomeTax: 0.15,
      corpTax: 0.25,
      vat: 0.10,
      tariff: 0.12,
      collect: 0.82,
      spend: {
        infra: 0.045, edu: 0.045, health: 0.04, mil: 0.04,
        welfare: 0.055, subsidy: 0.06, rd: sp.rdBoost ? 0.022 : 0.012,
      },
      revenue: 0,
      spending: 0,
      interestPaid: 0,
      balance: 0,
      debt: sp.debt ?? 900,
      debtGDP: 0,
      approval,
      subsidyReform: false,
    },

    player: {
      cash: 0.06,          // ≈ ۳۰۰ میلیارد تومان
      stocks: {},          // id → تعداد سهم
      bonds: 0,            // واحد اوراق دولتی
      properties: [],      // {typeId, price0, month}
      netWorth: 0.06,
      totalTaxPaid: 0,
    },

    mods: {
      sanctioned: sp.sanctioned ?? false,
      sanctionMonths: 0,
      prodBoost: 0,        // ماه‌های رونق بهره‌وری
      prodHit: 0,          // ماه‌های افت بهره‌وری
      brainDrain: 0,
      exportBoost: 0,
      foodShock: 0,
      rebuild: 0,
      tension: 0,
      pandemic: false,
      pandemicMonths: 0,
    },

    news: [],
    achievements: [],
    history: {
      gdp: H(), growth: H(), infl: H(), unemp: H(), rate: H(), m2: H(),
      index: H(), hpi: H(), fx: H(), oil: H(), debtGDP: H(), approval: H(),
      netWorth: H(), balance: H(), trade: H(), confidence: H(),
    },
    _tmp: {},
  };

  // شرکت‌های بورسی
  s.market = {
    companies: COMPANIES.map((c) => {
      const cap0 = 295 * 12 * c.w * 2.4; // ارزش بازار اولیه ≈ ۲.۴ برابر سود سالانه بخش
      const shares = Math.round((cap0 * 5e12) / 7500); // قیمت ≈ ۷٬۵۰۰ تومان
      return {
        ...c, shares,
        price: (cap0 * 5e12) / shares,
        prevPrice: 0,
        eps: 0, pe: 0, div: 0, cap0,
      };
    }),
  };

  // املاک قابل خرید
  s.realty = [
    { typeId: 'apt70', name: 'آپارتمان ۷۰ متری', icon: '🏢', base: 0.0016, rentMult: 1.0 },
    { typeId: 'apt120', name: 'آپارتمان ۱۲۰ متری لوکس', icon: '🌆', base: 0.0042, rentMult: 0.95 },
    { typeId: 'villa', name: 'ویلای شمال', icon: '🏡', base: 0.006, rentMult: 0.7 },
    { typeId: 'shop', name: 'مغازه تجاری', icon: '🏪', base: 0.005, rentMult: 1.5 },
    { typeId: 'office', name: 'طبقه اداری', icon: '🏬', base: 0.0085, rentMult: 1.3 },
  ];

  pushNews(s, { icon: '🎮', text: `به «${sc.name}» خوش آمدید! شما سکان اقتصاد کشور را در دست دارید.`, kind: 'info' });
  pushNews(s, { icon: '📜', text: 'هدف: رشد پایدار، تورم پایین، اشتغال و ثروت‌آفرینی. مراقب رویدادهای غیرمنتظره باشید.', kind: 'info' });
  return s;
}

export function pushNews(s, item) {
  s.news.unshift({ month: s.month, kind: 'info', ...item });
  if (s.news.length > 90) s.news.length = 90;
}
