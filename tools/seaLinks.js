/* Finds the geographic gaps between the disconnected blocks of the world graph
   and prints the shortest sea crossings that would join them. */
const fs = require("fs");
const D = JSON.parse(fs.readFileSync(__dirname + "/data.json", "utf8"));
const C = D.countries, N = C.length;

function pts(paths, cap){
  const all = [];
  for (const p of paths){
    const nums = p.match(/-?\d+(?:\.\d+)?/g) || [];
    for (let k = 0; k + 1 < nums.length; k += 2) all.push([+nums[k], +nums[k + 1]]);
  }
  if (all.length <= cap) return all;
  const step = all.length / cap, out = [];
  for (let k = 0; k < all.length; k += step) out.push(all[Math.floor(k)]);
  return out;
}
const P = C.map(c => pts(c.paths, 900));

function gap(list1, list2){
  let best = Infinity;
  for (const a of list1) for (const b of list2){
    const dx = a[0] - b[0], dy = a[1] - b[1];
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* components of the nb graph */
const comp = new Int16Array(N).fill(-1);
let nc = 0;
for (let i = 0; i < N; i++){
  if (comp[i] >= 0) continue;
  const st = [i]; comp[i] = nc;
  while (st.length){
    const k = st.pop();
    for (const j of C[k].nb) if (comp[j] < 0){ comp[j] = nc; st.push(j); }
  }
  nc++;
}
console.log("components:", nc, [...Array(nc)].map((_, c) => C.filter(x => comp[x.i] === c).length));

/* shortest crossing between every pair of components */
const pairs = [];
for (let a = 0; a < nc; a++) for (let b = a + 1; b < nc; b++){
  let best = {d: Infinity};
  for (let i = 0; i < N; i++){
    if (comp[i] !== a) continue;
    for (let j = 0; j < N; j++){
      if (comp[j] !== b) continue;
      const lab = Math.hypot(C[i].lab[0] - C[j].lab[0], C[i].lab[1] - C[j].lab[1]);
      if (lab > best.d + 0) { /* cheap pre-filter on label distance */ }
      const g = gap(P[i], P[j]);
      if (g < best.d) best = {d: g, i, j, lab};
    }
  }
  pairs.push({a, b, ...best});
  console.log(`comp ${a} <-> ${b}: ${best.d.toFixed(2)}  ${C[best.i].en} <-> ${C[best.j].en}`);
}

/* minimum spanning tree over components */
pairs.sort((p, q) => p.d - q.d);
const par = [...Array(nc)].map((_, k) => k);
const find = k => par[k] === k ? k : (par[k] = find(par[k]));
const links = [];
for (const p of pairs){
  const ra = find(p.a), rb = find(p.b);
  if (ra === rb) continue;
  par[ra] = rb;
  links.push(p);
}
console.log("MST sea routes:");
for (const l of links) console.log(`  ${C[l.i].en} (${l.i}) <-> ${C[l.j].en} (${l.j})  gap=${l.d.toFixed(2)}`);
fs.writeFileSync(__dirname + "/seaLinks.json", JSON.stringify(links.map(l => [l.i, l.j, +l.d.toFixed(2)])));
