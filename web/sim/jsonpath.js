// Subconjunto do JSONPath do kubectl: campos, índices, [*], filtros
// [?(@.a=="b")], range/end e literais entre aspas.
import { ApiError } from './cluster.js';

const valores = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);

function fecha(s, i) {
  let aspas = null;
  for (let j = i + 1; j < s.length; j++) {
    const ch = s[j];
    if (aspas) {
      if (ch === aspas) aspas = null;
    } else if (ch === '"' || ch === "'") aspas = ch;
    else if (ch === ']') return j;
  }
  throw new ApiError('error: error parsing jsonpath: unterminated array');
}

function literal(txt) {
  txt = txt.trim();
  if (/^["'].*["']$/.test(txt)) return txt.slice(1, -1);
  if (txt === 'true') return true;
  if (txt === 'false') return false;
  if (/^-?[0-9.]+$/.test(txt)) return Number(txt);
  return txt;
}

export function evalPath(expr, raiz) {
  let s = expr.trim().replace(/^[$@]/, '');
  let atual = [raiz];
  let p = 0;
  while (p < s.length) {
    if (s[p] === '.') {
      p++;
      if (s[p] === '*') {
        p++;
        atual = atual.flatMap(valores);
        continue;
      }
      let nome = '';
      while (p < s.length && s[p] !== '.' && s[p] !== '[') {
        if (s[p] === '\\') p++;
        nome += s[p++];
      }
      if (nome) atual = atual.map((c) => (c == null ? undefined : c[nome])).filter((v) => v !== undefined);
    } else if (s[p] === '[') {
      const fim = fecha(s, p);
      const dentro = s.slice(p + 1, fim).trim();
      p = fim + 1;
      if (dentro === '*') atual = atual.flatMap(valores);
      else if (/^-?\d+$/.test(dentro)) atual = atual.map((c) => (Array.isArray(c) ? c.at(Number(dentro)) : undefined)).filter((v) => v !== undefined);
      else if (/^["']/.test(dentro)) atual = atual.map((c) => c?.[dentro.slice(1, -1)]).filter((v) => v !== undefined);
      else if (dentro.startsWith('?(') && dentro.endsWith(')')) {
        const cond = dentro.slice(2, -1).trim();
        const m = cond.match(/^@(\S*?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        const teste = m
          ? (item) => {
              const [esq] = evalPath(m[1] || '', item);
              const dir = literal(m[3]);
              if (m[2] === '==') return esq === dir || String(esq) === String(dir);
              if (m[2] === '!=') return !(esq === dir || String(esq) === String(dir));
              if (esq === undefined) return false;
              return m[2] === '>' ? esq > dir : m[2] === '<' ? esq < dir : m[2] === '>=' ? esq >= dir : esq <= dir;
            }
          : (item) => evalPath(cond.replace(/^@/, ''), item).length > 0;
        atual = atual.flatMap((c) => valores(c).filter(teste));
      } else throw new ApiError(`error: error parsing jsonpath: unsupported expression [${dentro}]`);
    } else throw new ApiError(`error: error parsing jsonpath {${expr}}: unrecognized character in action: ${JSON.stringify(s[p])}`);
  }
  return atual;
}

const texto = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));

function partes(tpl) {
  const out = [];
  let i = 0;
  while (i < tpl.length) {
    const abre = tpl.indexOf('{', i);
    if (abre < 0) {
      out.push({ t: 'txt', v: tpl.slice(i) });
      break;
    }
    if (abre > i) out.push({ t: 'txt', v: tpl.slice(i, abre) });
    let j = abre + 1;
    let aspas = null;
    for (; j < tpl.length; j++) {
      const ch = tpl[j];
      if (aspas) {
        if (ch === '\\') j++;
        else if (ch === aspas) aspas = null;
      } else if (ch === '"' || ch === "'") aspas = ch;
      else if (ch === '}') break;
    }
    if (j >= tpl.length) throw new ApiError('error: error parsing jsonpath: unclosed action');
    out.push({ t: 'expr', v: tpl.slice(abre + 1, j).trim() });
    i = j + 1;
  }
  return out;
}

export function jsonpath(tpl, dados) {
  const toks = partes(tpl);
  let i = 0;
  const roda = (ctx, dentroDeRange) => {
    let out = '';
    while (i < toks.length) {
      const k = toks[i++];
      if (k.t === 'txt') {
        out += k.v;
        continue;
      }
      const e = k.v;
      if (e === 'end') {
        if (dentroDeRange) return out;
        continue;
      }
      if (e.startsWith('range')) {
        const itens = evalPath(e.slice(5), ctx);
        const inicio = i;
        if (!itens.length) {
          let nivel = 1;
          while (i < toks.length && nivel > 0) {
            const x = toks[i++];
            if (x.t === 'expr' && x.v.startsWith('range')) nivel++;
            if (x.t === 'expr' && x.v === 'end') nivel--;
          }
          continue;
        }
        for (const item of itens) {
          i = inicio;
          out += roda(item, true);
        }
        continue;
      }
      if (/^["']/.test(e)) {
        out += e.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(["'\\])/g, '$1');
        continue;
      }
      out += evalPath(e, ctx).map(texto).join(' ');
    }
    return out;
  };
  return roda(dados, false);
}
