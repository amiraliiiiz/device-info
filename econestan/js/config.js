// ─── پیکربندی بازی: سناریوها، شرکت‌ها، رویدادها، سیاست‌ها ─────────────────
import { fa0 } from './utils.js';

export const TARGET_INFLATION = 0.08;   // هدف تورمی بانک مرکزی
export const NATURAL_UNEMP = 0.09;      // نرخ بیکاری طبیعی
export const ALPHA = 0.45;              // سهم سرمایه در تولید
export const HIST_CAP = 480;            // حداکثر تاریخچه (ماه)

export const SPEND_CATS = [
  { id: 'infra',   name: 'زیرساخت و عمران',  icon: '🏗️', desc: 'جاده، نیروگاه، راه‌آهن — رشد بلندمدت سرمایه' },
  { id: 'edu',     name: 'آموزش و پرورش',    icon: '🎓', desc: 'بهره‌وری نیروی کار را در بلندمدت بالا می‌برد' },
  { id: 'health',  name: 'بهداشت و درمان',   icon: '🏥', desc: 'سلامت نیروی کار و رضایت عمومی' },
  { id: 'mil',     name: 'دفاعی و امنیتی',   icon: '🛡️', desc: 'کاهش ریسک ژئوپلیتیک و فرار سرمایه' },
  { id: 'welfare', name: 'رفاه و حمایت اجتماعی', icon: '🤝', desc: 'یارانه معیشتی؛ محبوبیت می‌آورد، انگیزه کار را کم می‌کند' },
  { id: 'subsidy', name: 'یارانه انرژی',     icon: '⛽', desc: 'سوخت ارزان؛ هزینه سنگین برای بودجه و تورم‌زا' },
  { id: 'rd',      name: 'پژوهش و فناوری',   icon: '🔬', desc: 'بیشترین اثر بلندمدت بر بهره‌وری' },
];

/** فهرست شرکت‌های بورسی — وزن‌ها سهم هر بخش از سود اقتصاد */
export const COMPANIES = [
  { id: 'petro1', name: 'پتروشیمی پارس',      sector: 'پتروشیمی', w: 0.14, oilBeta: 0.9 },
  { id: 'oil1',   name: 'نفت و گاز زاگرس',    sector: 'نفت و گاز', w: 0.12, oilBeta: 1.2 },
  { id: 'steel1', name: 'فولاد کاوه',          sector: 'فلزات', w: 0.10, oilBeta: 0.2 },
  { id: 'copper', name: 'مس سرچشمه‌نما',       sector: 'فلزات', w: 0.07, oilBeta: 0.1 },
  { id: 'bank1',  name: 'بانک آینده‌ساز',      sector: 'بانکی', w: 0.11, oilBeta: 0.0 },
  { id: 'bank2',  name: 'بانک کارآفرین',      sector: 'بانکی', w: 0.08, oilBeta: 0.0 },
  { id: 'auto1',  name: 'خودروسازی آریا',     sector: 'خودرو', w: 0.09, oilBeta: 0.1 },
  { id: 'tele1',  name: 'مخابرات پیام',       sector: 'مخابرات', w: 0.07, oilBeta: 0.0 },
  { id: 'food1',  name: 'صنایع غذایی مهرگان', sector: 'غذایی', w: 0.06, oilBeta: 0.0 },
  { id: 'pharm1', name: 'داروسازی البرز',     sector: 'دارویی', w: 0.05, oilBeta: 0.0 },
  { id: 'cement', name: 'سیمان آبادگران',     sector: 'ساختمانی', w: 0.06, oilBeta: 0.1 },
  { id: 'ship1',  name: 'حمل‌ونقل دریایی خزر', sector: 'حمل‌ونقل', w: 0.05, oilBeta: 0.3 },
];

/** رویدادهای تصادفی دنیا واقعی */
export const EVENTS = [
  {
    id: 'oil_boom', name: 'جهش قیمت نفت', icon: '🛢️', bias: 'good', p: 0.010,
    cond: (s) => true,
    text: (d) => `قیمت جهانی نفت با ${d.mag > 0 ? 'جهش' : 'سقوط'} مواجه شد و به ${fa0(d.price)} دلار در هر بشکه رسید.`,
    apply: (s, d) => {
      d.mag = (s.econ.oilPrice < 95 ? 1 : -1) * (0.15 + Math.random() * 0.2);
      d.price = Math.round(s.econ.oilPrice * (1 + d.mag));
      s.econ.oilPrice *= 1 + d.mag;
      s.econ.sentiment += d.mag > 0 ? 0.12 : -0.15;
    },
  },
  {
    id: 'sanctions', name: 'دور جدید تحریم‌ها', icon: '⛓️', bias: 'bad', p: 0.008,
    cond: (s) => !s.mods.sanctioned,
    text: () => 'قدرت‌های جهانی دور تازه‌ای از تحریم‌های نفتی و بانکی وضع کردند. صادرات نفت و دسترسی ارزی محدود شد.',
    apply: (s) => {
      s.mods.sanctioned = true;
      s.mods.sanctionMonths = 0;
      s.econ.oilProd *= 0.55;
      s.econ.sentiment -= 0.25;
      s.econ.flight += 0.015;
      s.gov.approval -= 6;
    },
  },
  {
    id: 'sanctions_relief', name: 'گشایش دیپلماتیک', icon: '🕊️', bias: 'good', p: 0.006,
    cond: (s) => s.mods.sanctioned,
    text: () => 'توافق دیپلماتیک حاصل شد؛ تحریم‌ها به‌تدریج لغو می‌شوند و بازارها نفس کشیدند.',
    apply: (s) => {
      s.mods.sanctioned = false;
      s.econ.oilProd *= 1.6;
      s.econ.sentiment += 0.3;
      s.econ.flight = Math.max(0, s.econ.flight - 0.02);
      s.gov.approval += 9;
    },
  },
  {
    id: 'tech_boom', name: 'رونق فناوری', icon: '🚀', bias: 'good', p: 0.009,
    cond: (s) => true,
    text: () => 'موج نوآوری در استارتاپ‌ها و صنایع دانش‌بنیان، بهره‌وری اقتصاد را بالا برد.',
    apply: (s) => { s.mods.prodBoost = 18; s.econ.sentiment += 0.1; },
  },
  {
    id: 'drought', name: 'خشکسالی شدید', icon: '🌵', bias: 'bad', p: 0.010,
    cond: (s) => true,
    text: () => 'خشکسالی بی‌سابقه، تولید کشاورزی را نابود کرد و قیمت مواد غذایی بالا رفت.',
    apply: (s) => { s.econ.costPush += 0.004; s.mods.foodShock = 10; s.gov.approval -= 3; },
  },
  {
    id: 'pandemic', name: 'شیوع بیماری همه‌گیر', icon: '🦠', bias: 'bad', p: 0.004,
    cond: (s) => !s.mods.pandemic,
    text: () => 'ویروس جدید فراگیر شد؛ محدودیت‌ها اقتصاد را فلج و نظام بهداشت را تحت فشار گذاشت.',
    apply: (s) => {
      s.mods.pandemic = true; s.mods.pandemicMonths = 0;
      s.econ.confidenceHit = -0.25; s.mods.prodHit = 9;
      s.gov.approval -= 5;
    },
  },
  {
    id: 'bank_run', name: 'هجوم سپرده‌گذاران', icon: '🏦', bias: 'bad', p: 0.005,
    cond: (s) => s.econ.npl > 0.08,
    text: () => 'شایعه ورشکستگی یک بانک بزرگ، صف‌های طولانی برداشت سپرده به راه انداخت.',
    apply: (s) => { s.econ.npl += 0.05; s.econ.sentiment -= 0.2; s.econ.creditTight = 8; },
  },
  {
    id: 'corruption', name: 'افشای فساد بزرگ', icon: '💼', bias: 'bad', p: 0.008,
    cond: (s) => true,
    text: () => 'پرونده اختلاس کلان در دستگاه دولتی فاش شد؛ افکار عمومی خشمگین است.',
    apply: (s) => { s.gov.approval -= 7; s.econ.sentiment -= 0.08; },
  },
  {
    id: 'capital_flight', name: 'موج خروج سرمایه', icon: '✈️', bias: 'bad', p: 0.007,
    cond: (s) => s.econ.inflAnnual > 0.25,
    text: () => 'ثروتمندان دارایی‌های خود را به ارز و املاک خارج از کشور تبدیل می‌کنند؛ فشار بر بازار ارز تشدید شد.',
    apply: (s) => { s.econ.flight += 0.012; },
  },
  {
    id: 'earthquake', name: 'زلزله ویرانگر', icon: '🌋', bias: 'bad', p: 0.004,
    cond: (s) => true,
    text: () => 'زلزله‌ای شدید غرب کشور را لرزاند؛ هزینه بازسازی سنگین است.',
    apply: (s) => { s.econ.capitalShock = 0.02; s.gov.approval -= 4; s.mods.rebuild = 12; },
  },
  {
    id: 'gulf_tension', name: 'تنش منطقه‌ای', icon: '⚔️', bias: 'bad', p: 0.007,
    cond: (s) => true,
    text: () => 'تنش نظامی در منطقه بالا گرفت؛ ریسک کشور و قیمت بیمه صادرات افزایش یافت.',
    apply: (s) => { s.econ.riskPrem += 0.008; s.econ.sentiment -= 0.12; s.mods.tension = 8; },
  },
  {
    id: 'oil_discovery', name: 'کشف میدان گازی', icon: '⛲', bias: 'good', p: 0.005,
    cond: (s) => true,
    text: () => 'میدان عظیم گازی در خلیج فارس کشف شد؛ افق صادرات انرژی روشن‌تر شد.',
    apply: (s) => { s.econ.oilProd *= 1.12; s.econ.sentiment += 0.1; },
  },
  {
    id: 'protests', name: 'اعتراضات سراسری', icon: '📢', bias: 'bad', p: 0.006,
    cond: (s) => s.gov.approval < 35,
    text: () => 'نارضایتی از وضعیت اقتصادی به خیابان‌ها کشید؛ اعتصابات تولید را مختل کرد.',
    apply: (s) => { s.gov.approval -= 4; s.mods.prodHit = Math.max(s.mods.prodHit || 0, 4); s.econ.sentiment -= 0.1; },
  },
  {
    id: 'imf_loan', name: 'خط اعتباری خارجی', icon: '🏛️', bias: 'good', p: 0.005,
    cond: (s) => s.gov.debtGDP > 0.45 && !s.mods.sanctioned,
    text: () => 'یک نهاد بین‌المللی خط اعتباری اضطراری ارائه کرد؛ ذخایر ارزی تقویت شد.',
    apply: (s) => { s.econ.reserves += 120; s.econ.sentiment += 0.08; },
  },
  {
    id: 'brain_drain', name: 'شتاب مهاجرت نخبگان', icon: '🧠', bias: 'bad', p: 0.007,
    cond: (s) => s.econ.inflAnnual > 0.3 || s.gov.approval < 40,
    text: () => 'موج مهاجرت متخصصان شدت گرفت؛ سرمایه انسانی کشور تحلیل می‌رود.',
    apply: (s) => { s.mods.brainDrain = 16; },
  },
  {
    id: 'export_deal', name: 'قرارداد بزرگ صادراتی', icon: '🤝', bias: 'good', p: 0.008,
    cond: (s) => !s.mods.sanctioned,
    text: () => 'قرارداد بلندمدت صادرات محصولات صنعتی با همسایگان امضا شد.',
    apply: (s) => { s.mods.exportBoost = 14; s.econ.sentiment += 0.06; },
  },
  {
    id: 'grid_blackout', name: 'بحران ناترازی انرژی', icon: '🔌', bias: 'bad', p: 0.008,
    cond: (s) => s.gov.spend.infra < 0.03,
    text: () => 'قطعی گسترده برق و گاز، کارخانه‌ها را تعطیل کرد. سال‌ها کم‌سرمایه‌گذاری در انرژی کار دست کشور داد.',
    apply: (s) => { s.mods.prodHit = Math.max(s.mods.prodHit || 0, 6); s.gov.approval -= 4; },
  },
  {
    id: 'crypto_boom', name: 'رونق بازارهای دارایی جهانی', icon: '📈', bias: 'good', p: 0.007,
    cond: (s) => true,
    text: () => 'رونق جهانی بازارهای دارایی، اشتهای ریسک سرمایه‌گذاران داخلی را هم بالا برد.',
    apply: (s) => { s.econ.sentiment += 0.14; },
  },
];

/** سناریوهای شروع بازی */
export const SCENARIOS = [
  {
    id: 'abadan',
    name: 'اقتصاد نفتی آبادان',
    icon: '🛢️',
    desc: 'کشوری نفتی با تورم دو رقمی، وابسته به صادرات نفت. تعادل میان دلار نفتی، یارانه و رشد — چالش اصلی توست.',
    difficulty: 'متعادل',
    setup: {},
  },
  {
    id: 'crisis',
    name: 'بحران تمام‌عیار',
    icon: '🔥',
    desc: 'تحریم‌های فلج‌کننده، تورم ۴۵ درصدی، ذخایر ارزی رو به اتمام و مردم ناراضی. فقط برای حرفه‌ای‌ها.',
    difficulty: 'سخت',
    setup: {
      sanctioned: true,
      inflation: 0.45,
      approval: 30,
      reserves: 90,
      flight: 0.02,
      debt: 1400,
      sentiment: -0.3,
      oilProd: 0.9,
      fx: 135000,
    },
  },
  {
    id: 'industrial',
    name: 'ببر صنعتی نوپا',
    icon: '🏭',
    desc: 'اقتصادی صنعتی با وابستگی کم به نفت و تورم مهارشده. هدف: رسیدن به رشد ۸٪ و تبدیل شدن به قدرت صادراتی.',
    difficulty: 'آسان',
    setup: {
      oilShare: 0.35,
      inflation: 0.05,
      productivity: 1.15,
      capital: 3600,
      confidence: 0.68,
      inflExpect: 0.05,
      sentiment: 0.15,
      rdBoost: true,
    },
  },
];
