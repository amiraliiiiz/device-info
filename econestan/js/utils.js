// ─── ابزارهای عمومی: اعداد فارسی، پول، تاریخ ───────────────────────────
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;

/** تقریب نرمال استاندارد (Box–Muller) */
export function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// هر «واحد اقتصادی» ≈ ۵ هزار میلیارد تومان (۵ همت)
export const MONEY = 5e12;

const cache = {};
export function fa(x, d = 1) {
  if (!isFinite(x)) return '—';
  const key = 'nf' + d;
  if (!cache[key]) cache[key] = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  return cache[key].format(x);
}
export const fa0 = (x) => fa(x, 0);
export const pct = (x, d = 1) => (isFinite(x) ? fa(x, d) + '٪' : '—');

/** تبدیل واحد اقتصادی به تومان با پیشوند هوشمند (همت/میلیارد/میلیون) */
export function money(units, d = 1) {
  if (!isFinite(units)) return '—';
  const t = units * MONEY;
  const s = t < 0 ? '−' : '';
  const a = Math.abs(t);
  if (a >= 1e12) return s + fa(a / 1e12, d) + ' همت';
  if (a >= 1e9) return s + fa(a / 1e9, d) + ' میلیارد تومان';
  if (a >= 1e6) return s + fa(a / 1e6, 0) + ' میلیون تومان';
  return s + fa(a, 0) + ' تومان';
}

/** تومانِ خام را خوش‌نمایش می‌کند (برای قیمت سهام و مسکن) */
export function tomanStr(t, d = 0) {
  const s = t < 0 ? '−' : '';
  const a = Math.abs(t);
  if (a >= 1e12) return s + fa(a / 1e12, 2) + ' همت';
  if (a >= 1e9) return s + fa(a / 1e9, 2) + ' میلیارد تومان';
  if (a >= 1e6) return s + fa(a / 1e6, 1) + ' میلیون تومان';
  return s + fa(a, d) + ' تومان';
}

export const MONTHS_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const dateStr = (mIdx) => `${MONTHS_FA[mIdx % 12]} ${fa0(1404 + Math.floor(mIdx / 12))}`;
export const dateShort = (mIdx) => `${MONTHS_FA[mIdx % 12].slice(0, 3)} ${fa0((1404 + Math.floor(mIdx / 12)) % 100)}`;

export function signed(v, d = 1, suffix = '') {
  if (!isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + fa(v, d) + suffix;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** میانگین متحرک ساده روی انتهای آرایه */
export function smaLast(arr, n) {
  if (!arr.length) return 0;
  const k = Math.min(n, arr.length);
  let s = 0;
  for (let i = arr.length - k; i < arr.length; i++) s += arr[i];
  return s / k;
}
