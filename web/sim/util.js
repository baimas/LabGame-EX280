// Utilitários compartilhados pelo simulador.

export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

const ALFA = 'bcdfghjklmnpqrstvwxz2456789';

export function rand(n = 5) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALFA[Math.floor(Math.random() * ALFA.length)];
  return s;
}

// Hash determinístico (FNV-1a) usado para pod-template-hash e digests de imagem.
export function hashNum(str, seed = 2166136261) {
  let h = seed;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function hashId(str, n = 10) {
  let s = '';
  let h = hashNum(str);
  for (let i = 0; i < n; i++) {
    s += ALFA[h % ALFA.length];
    h = hashNum(str + i, h);
  }
  return s;
}

export function fakeDigest(seed) {
  let s = '';
  for (let i = 0; i < 8; i++) s += hashNum(seed + ':' + i).toString(16).padStart(8, '0');
  return 'sha256:' + s;
}

export function uuid(seed) {
  const h = fakeDigest(seed).slice(7);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

// Idade no formato do kubectl (5s, 3m12s, 4h, 12d...).
export function age(s) {
  s = Math.max(0, Math.floor(s));
  if (s < 120) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 10) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  if (m < 180) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 8) return m % 60 ? `${h}h${m % 60}m` : `${h}h`;
  if (h < 48) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 8) return h % 24 ? `${d}d${h % 24}h` : `${d}d`;
  return d + 'd';
}

export function table(rows) {
  const larg = [];
  for (const r of rows) r.forEach((c, i) => (larg[i] = Math.max(larg[i] || 0, String(c).length)));
  return rows.map((r) => r.map((c, i) => String(c).padEnd(larg[i])).join('   ').trimEnd()).join('\n') + '\n';
}

// Seletor em objeto: mapa simples ou {matchLabels, matchExpressions}.
export function matchLabels(labels = {}, sel) {
  if (!sel) return false;
  const simples = !('matchLabels' in sel) && !('matchExpressions' in sel);
  const ml = simples ? sel : sel.matchLabels || {};
  for (const [k, v] of Object.entries(ml)) if (labels[k] !== v) return false;
  for (const e of (!simples && sel.matchExpressions) || []) {
    const tem = e.key in labels;
    const v = labels[e.key];
    if (e.operator === 'In' && !(tem && e.values.includes(v))) return false;
    if (e.operator === 'NotIn' && tem && e.values.includes(v)) return false;
    if (e.operator === 'Exists' && !tem) return false;
    if (e.operator === 'DoesNotExist' && tem) return false;
  }
  return true;
}

// Seletor em texto, como em `-l app=web,tier!=db,env in (a,b)`.
export function parseSelector(str) {
  const partes = [];
  let nivel = 0;
  let atual = '';
  for (const ch of str) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) {
      partes.push(atual);
      atual = '';
    } else atual += ch;
  }
  if (atual.trim()) partes.push(atual);
  const preds = partes.map((p) => {
    p = p.trim();
    let m;
    if ((m = p.match(/^(\S+)\s+(in|notin)\s+\((.*)\)$/))) {
      const vals = m[3].split(',').map((x) => x.trim());
      return m[2] === 'in' ? (l) => m[1] in l && vals.includes(l[m[1]]) : (l) => !(m[1] in l && vals.includes(l[m[1]]));
    }
    if ((m = p.match(/^([^!=\s]+)\s*!=\s*(.*)$/))) return (l) => l[m[1]] !== m[2];
    if ((m = p.match(/^([^!=\s]+)\s*==?\s*(.*)$/))) return (l) => l[m[1]] === m[2];
    if (p.startsWith('!')) return (l) => !(p.slice(1) in l);
    return (l) => p in l;
  });
  return (labels = {}) => preds.every((f) => f(labels));
}

export function parseCpu(q) {
  if (q == null) return 0;
  q = String(q);
  return q.endsWith('m') ? parseFloat(q) / 1000 : parseFloat(q);
}

const UNIDADES = { Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };

export function parseMem(q) {
  if (q == null) return 0;
  const m = String(q).match(/^([0-9.]+)([A-Za-z]*)$/);
  if (!m) return NaN;
  return parseFloat(m[1]) * (UNIDADES[m[2]] || 1);
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

export const b64 = {
  enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
};

export const labelsText = (l) =>
  l && Object.keys(l).length ? Object.entries(l).map(([k, v]) => `${k}=${v}`).join(',') : '<none>';
