// ─── موتور نمودار: چارت خطی، اسپارک‌لاین و عقربه‌ای با Canvas ─────────
import { fa, dateShort } from './utils.js';

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 160;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * series: [{data, color, fill?, width?}]
 * opts: {fmt, yFmt, months (برچسب تاریخ), target?: {value,color,label}}
 */
export function drawLine(canvas, series, opts = {}) {
  if (!canvas) return;
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const padL = 6, padR = 52, padT = 10, padB = opts.months ? 22 : 8;
  const cw = w - padL - padR, ch = h - padT - padB;

  let all = [];
  for (const s of series) all = all.concat(s.data);
  if (opts.target) all.push(opts.target.value);
  if (!all.length) return;
  let mn = Math.min(...all), mx = Math.max(...all);
  if (mn === mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.08;
  mn -= pad; mx += pad;

  const X = (i, len) => padL + (len <= 1 ? 0 : (i / (len - 1)) * cw);
  const Y = (v) => padT + (1 - (v - mn) / (mx - mn)) * ch;

  // خطوط شبکه
  ctx.strokeStyle = 'rgba(148,163,184,0.10)';
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.font = '10px Vazirmatn, Tahoma';
  ctx.textAlign = 'left';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = mn + ((mx - mn) * i) / 4;
    const y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
    const label = opts.yFmt ? opts.yFmt(v) : fa(v, Math.abs(mx - mn) < 2 ? 2 : 1);
    ctx.fillText(label, padL + cw + 6, y + 3);
  }

  // خط هدف
  if (opts.target) {
    const y = Y(opts.target.value);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = opts.target.color || 'rgba(250,204,21,0.6)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
    ctx.restore();
    if (opts.target.label) {
      ctx.fillStyle = opts.target.color || 'rgba(250,204,21,0.85)';
      ctx.fillText(opts.target.label, padL + 4, y - 4);
    }
  }

  // سری‌ها
  for (const s of series) {
    const data = s.data;
    if (data.length < 2) continue;
    if (s.fill) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
      grad.addColorStop(0, s.color + '55');
      grad.addColorStop(1, s.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(X(0, data.length), Y(data[0]));
      for (let i = 1; i < data.length; i++) ctx.lineTo(X(i, data.length), Y(data[i]));
      ctx.lineTo(X(data.length - 1, data.length), padT + ch);
      ctx.lineTo(X(0, data.length), padT + ch);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width || 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(X(0, data.length), Y(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(X(i, data.length), Y(data[i]));
    ctx.stroke();
    // نقطه آخر
    const lx = X(data.length - 1, data.length), ly = Y(data[data.length - 1]);
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  // برچسب ماه‌ها
  if (opts.months && opts.months.length > 1) {
    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.textAlign = 'center';
    const n = opts.months.length;
    const ticks = Math.min(5, n);
    for (let t = 0; t < ticks; t++) {
      const i = Math.round((t / (ticks - 1)) * (n - 1));
      ctx.fillText(dateShort(opts.months[i]), padL + (i / (n - 1)) * cw, h - 6);
    }
  }
}

export function drawSpark(canvas, data, color) {
  if (!canvas) return;
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const mn = Math.min(...data), mx = Math.max(...data);
  const rng = mx - mn || 1;
  const X = (i) => (i / (data.length - 1)) * (w - 2) + 1;
  const Y = (v) => 2 + (1 - (v - mn) / rng) * (h - 4);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(data[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(X(i), Y(data[i]));
  ctx.lineTo(X(data.length - 1), h); ctx.lineTo(X(0), h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(X(0), Y(data[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(X(i), Y(data[i]));
  ctx.stroke();
}

/** عقربه نیم‌دایره‌ای برای محبوبیت و سلامت اقتصاد */
export function drawGauge(canvas, value, color, label) {
  if (!canvas) return;
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.92, r = Math.min(w / 2.3, h * 0.78);
  const start = Math.PI, end = 2 * Math.PI;
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(148,163,184,0.12)';
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end); ctx.stroke();
  const v = Math.max(0, Math.min(1, value));
  const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  grad.addColorStop(0, '#f43f5e'); grad.addColorStop(0.5, '#f59e0b'); grad.addColorStop(1, '#10b981');
  ctx.strokeStyle = color || grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, start, start + v * Math.PI); ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `bold ${Math.round(r * 0.42)}px Vazirmatn, Tahoma`;
  ctx.textAlign = 'center';
  ctx.fillText(fa(value * 100, 0) + '٪', cx, cy - r * 0.12);
  if (label) {
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = `${Math.max(10, r * 0.18)}px Vazirmatn, Tahoma`;
    ctx.fillText(label, cx, cy - 4);
  }
}

/** نمودار ستونی افقی برای ترکیب بودجه/دارایی */
export function drawBars(canvas, items) {
  if (!canvas) return;
  const { ctx, w, h } = setup(canvas);
  ctx.clearRect(0, 0, w, h);
  if (!items.length) return;
  const maxV = Math.max(...items.map((i) => Math.abs(i.value)), 1e-9);
  const rowH = h / items.length;
  ctx.font = '11px Vazirmatn, Tahoma';
  items.forEach((it, idx) => {
    const y = idx * rowH + rowH / 2;
    const barW = (Math.abs(it.value) / maxV) * (w * 0.42);
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.textAlign = 'right';
    ctx.fillText(it.label, w - 4, y + 4);
    ctx.fillStyle = it.color || (it.value >= 0 ? '#38bdf8' : '#f43f5e');
    const x0 = w * 0.52;
    ctx.beginPath();
    ctx.roundRect(it.value >= 0 ? x0 : x0 - barW, y - rowH * 0.28, barW, rowH * 0.56, 3);
    ctx.fill();
  });
}
