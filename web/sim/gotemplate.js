// Subconjunto de text/template do Go com as funções do Sprig que os charts
// do Helm costumam usar.
import yaml from '../vendor/js-yaml.mjs';
import { b64 } from './util.js';

export class TemplateError extends Error {}

// ------------------------------------------------------------------ léxico

function lexa(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const ini = src.indexOf('{{', i);
    if (ini < 0) {
      toks.push({ t: 'txt', v: src.slice(i) });
      break;
    }
    if (ini > i) toks.push({ t: 'txt', v: src.slice(i, ini) });
    let j = ini + 2;
    const trimL = src[j] === '-' && /\s/.test(src[j + 1] || '');
    if (trimL) j++;
    let aspas = null;
    let k = j;
    for (; k < src.length; k++) {
      const ch = src[k];
      if (aspas) {
        if (ch === '\\' && aspas === '"') k++;
        else if (ch === aspas) aspas = null;
      } else if (ch === '"' || ch === '`') aspas = ch;
      else if (src.startsWith('}}', k)) break;
      else if (src.startsWith('*/}}', k)) {
        k += 2;
        break;
      }
    }
    if (k >= src.length) throw new TemplateError('unclosed action');
    let dentro = src.slice(j, k);
    const trimR = /\s-$/.test(dentro);
    if (trimR) dentro = dentro.slice(0, -1);
    dentro = dentro.trim();
    const linha = src.slice(0, ini).split('\n').length;
    if (!dentro.startsWith('/*')) toks.push({ t: 'acao', v: dentro, trimL, trimR, linha });
    else toks.push({ t: 'coment', trimL, trimR });
    i = k + 2;
  }
  // Aplica os marcadores {{- e -}} ao texto vizinho.
  toks.forEach((tk, n) => {
    if (tk.t === 'txt') return;
    if (tk.trimL && toks[n - 1]?.t === 'txt') toks[n - 1].v = toks[n - 1].v.replace(/\s+$/, '');
    if (tk.trimR && toks[n + 1]?.t === 'txt') toks[n + 1].v = toks[n + 1].v.replace(/^\s+/, '');
  });
  return toks.filter((tk) => tk.t !== 'coment');
}

// Divide uma ação em pedaços: strings, números, campos, variáveis, símbolos.
function pedacos(txt) {
  const out = [];
  let i = 0;
  while (i < txt.length) {
    const ch = txt[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === '"') {
      let j = i + 1;
      let v = '';
      while (j < txt.length && txt[j] !== '"') {
        if (txt[j] === '\\') {
          const e = txt[++j];
          v += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        } else v += txt[j];
        j++;
      }
      out.push({ t: 'str', v });
      i = j + 1;
    } else if (ch === '`') {
      const j = txt.indexOf('`', i + 1);
      out.push({ t: 'str', v: txt.slice(i + 1, j) });
      i = j + 1;
    } else if ('()|,'.includes(ch)) {
      out.push({ t: ch });
      i++;
    } else if (txt.startsWith(':=', i)) {
      out.push({ t: ':=' });
      i += 2;
    } else if (ch === '=' ) {
      out.push({ t: '=' });
      i++;
    } else {
      const m = txt.slice(i).match(/^[^\s()|,]+/)[0];
      if (/^-?\d+(\.\d+)?$/.test(m)) out.push({ t: 'num', v: Number(m) });
      else if (m.startsWith('$')) out.push({ t: 'var', v: m });
      else if (m.startsWith('.')) out.push({ t: 'campo', v: m, colado: i > 0 && txt[i - 1] === ')' });
      else out.push({ t: 'id', v: m });
      i += m.length;
    }
  }
  return out;
}

// pipeline := comando ('|' comando)* ; comando := operando+
function lePipeline(toks, pos = 0, fecha = null) {
  const comandos = [[]];
  let decl = null;
  if (toks[pos]?.t === 'var' && (toks[pos + 1]?.t === ':=' || toks[pos + 1]?.t === '=')) {
    decl = { nomes: [toks[pos].v], novo: toks[pos + 1].t === ':=' };
    pos += 2;
  } else if (toks[pos]?.t === 'var' && toks[pos + 1]?.t === ',' && toks[pos + 2]?.t === 'var' && toks[pos + 3]?.t === ':=') {
    decl = { nomes: [toks[pos].v, toks[pos + 2].v], novo: true };
    pos += 4;
  }
  while (pos < toks.length) {
    const tk = toks[pos];
    if (tk.t === fecha) return { pipe: { comandos, decl }, pos: pos + 1 };
    if (tk.t === '|') {
      comandos.push([]);
      pos++;
    } else if (tk.t === '(') {
      const r = lePipeline(toks, pos + 1, ')');
      let no = { t: 'sub', pipe: r.pipe };
      pos = r.pos;
      if (toks[pos]?.t === 'campo' && toks[pos].colado) {
        no = { t: 'subcampo', base: no, v: toks[pos].v };
        pos++;
      }
      comandos.at(-1).push(no);
    } else {
      comandos.at(-1).push(tk);
      pos++;
    }
  }
  if (fecha) throw new TemplateError('unclosed left paren');
  return { pipe: { comandos, decl }, pos };
}

const pipeline = (txt) => lePipeline(pedacos(txt)).pipe;

function parse(toks) {
  const defs = {};
  let i = 0;
  const lista = (fins) => {
    const nos = [];
    while (i < toks.length) {
      const tk = toks[i];
      if (tk.t === 'txt') {
        nos.push({ t: 'txt', v: tk.v });
        i++;
        continue;
      }
      const v = tk.v;
      const palavra = v.split(/\s+/)[0];
      if (fins.includes(palavra)) return { nos, fim: tk };
      i++;
      if (palavra === 'if') {
        const ramos = [{ cond: pipeline(v.slice(2)), corpo: null }];
        let senao = null;
        let r = lista(['else', 'end']);
        ramos[0].corpo = r.nos;
        while (r.fim.v.startsWith('else')) {
          i++;
          const resto = r.fim.v.slice(4).trim();
          if (resto.startsWith('if ')) {
            const ramo = { cond: pipeline(resto.slice(3)) };
            r = lista(['else', 'end']);
            ramo.corpo = r.nos;
            ramos.push(ramo);
          } else {
            r = lista(['end']);
            senao = r.nos;
          }
        }
        i++;
        nos.push({ t: 'if', ramos, senao });
      } else if (palavra === 'range' || palavra === 'with') {
        const pipe = pipeline(v.slice(palavra.length));
        let r = lista(['else', 'end']);
        const corpo = r.nos;
        let senao = null;
        if (r.fim.v === 'else') {
          i++;
          r = lista(['end']);
          senao = r.nos;
        }
        i++;
        nos.push({ t: palavra, pipe, corpo, senao });
      } else if (palavra === 'define') {
        const nome = pedacos(v.slice(6))[0].v;
        const r = lista(['end']);
        i++;
        defs[nome] = r.nos;
      } else if (palavra === 'template') {
        const p = pedacos(v.slice(8));
        nos.push({ t: 'template', nome: p[0].v, pipe: p.length > 1 ? lePipeline(p, 1).pipe : null });
      } else if (palavra === 'end' || palavra === 'else') {
        throw new TemplateError(`unexpected {{${palavra}}}`);
      } else nos.push({ t: 'acao', pipe: pipeline(v), linha: tk.linha });
    }
    if (fins.length) throw new TemplateError(`unexpected EOF`);
    return { nos };
  };
  return { nos: lista([]).nos, defs };
}

// ----------------------------------------------------------------- avaliação

export const vazio = (v) => v === undefined || v === null || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v !== null && !Object.keys(v).length);

export function texto(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return `[${v.map(texto).join(' ')}]`;
  if (typeof v === 'object') return `map[${Object.keys(v).sort().map((k) => `${k}:${texto(v[k])}`).join(' ')}]`;
  return String(v);
}

function campo(base, caminho) {
  let v = base;
  for (const p of caminho.split('.').filter(Boolean)) {
    if (v === undefined || v === null) return undefined;
    v = v[p];
  }
  return v;
}

const paraYaml = (v) => (v === undefined || v === null ? 'null' : yaml.dump(v, { lineWidth: -1, noRefs: true }).replace(/\n$/, ''));
const recua = (n, s) => String(s).split('\n').map((l) => ' '.repeat(n) + l).join('\n');

function printf(fmt, ...args) {
  let i = 0;
  return fmt.replace(/%[-+ 0#]*\d*(\.\d+)?([svdqtf%])/g, (m, _p, c) => {
    if (c === '%') return '%';
    const a = args[i++];
    if (c === 'q') return JSON.stringify(texto(a));
    if (c === 'd') return String(Math.trunc(Number(a)));
    if (c === 'f') return Number(a).toFixed(6);
    return texto(a);
  });
}

const igual = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && a === b) || String(a) === String(b) && typeof a === typeof b;

function funcoes(estado) {
  return {
    default: (d, v) => (vazio(v) ? d : v),
    quote: (...a) => a.filter((x) => x !== undefined && x !== null).map((x) => JSON.stringify(texto(x))).join(' '),
    squote: (...a) => a.filter((x) => x !== undefined && x !== null).map((x) => `'${texto(x)}'`).join(' '),
    upper: (s) => texto(s).toUpperCase(),
    lower: (s) => texto(s).toLowerCase(),
    title: (s) => texto(s).replace(/\b\w/g, (c) => c.toUpperCase()),
    trim: (s) => texto(s).trim(),
    trunc: (n, s) => (n >= 0 ? texto(s).slice(0, n) : texto(s).slice(n)),
    trimSuffix: (suf, s) => (texto(s).endsWith(suf) ? texto(s).slice(0, -suf.length) : texto(s)),
    trimPrefix: (pre, s) => (texto(s).startsWith(pre) ? texto(s).slice(pre.length) : texto(s)),
    replace: (a, b, s) => texto(s).split(a).join(b),
    contains: (sub, s) => texto(s).includes(sub),
    hasPrefix: (pre, s) => texto(s).startsWith(pre),
    hasSuffix: (suf, s) => texto(s).endsWith(suf),
    toYaml: paraYaml,
    toJson: (v) => JSON.stringify(v ?? null),
    nindent: (n, s) => '\n' + recua(n, s),
    indent: (n, s) => recua(n, s),
    int: (v) => Math.trunc(Number(v) || 0),
    int64: (v) => Math.trunc(Number(v) || 0),
    float64: (v) => Number(v) || 0,
    toString: (v) => texto(v),
    printf,
    print: (...a) => a.map(texto).join(''),
    cat: (...a) => a.filter((x) => x !== undefined && x !== null).map(texto).join(' '),
    b64enc: (s) => b64.enc(texto(s)),
    b64dec: (s) => b64.dec(texto(s)),
    eq: (a, ...b) => b.some((x) => igual(a, x)),
    ne: (a, b) => !igual(a, b),
    lt: (a, b) => a < b,
    le: (a, b) => a <= b,
    gt: (a, b) => a > b,
    ge: (a, b) => a >= b,
    and: (...a) => a.find((x) => vazio(x)) ?? a.at(-1),
    or: (...a) => a.find((x) => !vazio(x)) ?? a.at(-1),
    not: (v) => vazio(v),
    empty: (v) => vazio(v),
    len: (v) => (v === undefined || v === null ? 0 : Array.isArray(v) || typeof v === 'string' ? v.length : Object.keys(v).length),
    list: (...a) => a,
    dict: (...a) => Object.fromEntries(a.reduce((acc, x, i) => (i % 2 ? acc : [...acc, [x, a[i + 1]]]), [])),
    get: (m, k) => m?.[k] ?? '',
    hasKey: (m, k) => Boolean(m) && k in m,
    join: (sep, l) => (l || []).map(texto).join(sep),
    index: (v, ...ks) => ks.reduce((x, k) => x?.[k], v),
    required: (msg, v) => {
      if (vazio(v) && v !== false && v !== 0) throw new TemplateError(msg);
      return v;
    },
    fail: (msg) => {
      throw new TemplateError(msg);
    },
    include: (nome, dot) => renderNos(estado.defs[nome] || falta(nome), { ...estado, dot, vars: [{ $: estado.raiz }] }),
    tpl: (src, dot) => render(src, dot, estado.defs),
  };
}

function falta(nome) {
  throw new TemplateError(`template: no template "${nome}" associated with template "gotpl"`);
}

function variavel(estado, nome) {
  const [base, ...resto] = nome.split('.');
  for (let i = estado.vars.length - 1; i >= 0; i--) {
    if (base in estado.vars[i]) return resto.length ? campo(estado.vars[i][base], resto.join('.')) : estado.vars[i][base];
  }
  throw new TemplateError(`undefined variable "${base}"`);
}

function operando(estado, tk) {
  if (tk.t === 'str' || tk.t === 'num') return tk.v;
  if (tk.t === 'campo') return tk.v === '.' ? estado.dot : campo(estado.dot, tk.v);
  if (tk.t === 'var') return variavel(estado, tk.v);
  if (tk.t === 'sub') return avalia(estado, tk.pipe);
  if (tk.t === 'subcampo') return campo(operando(estado, tk.base), tk.v);
  if (tk.t === 'id') {
    if (tk.v === 'true') return true;
    if (tk.v === 'false') return false;
    if (tk.v === 'nil') return null;
  }
  throw new TemplateError(`unexpected "${tk.v ?? tk.t}"`);
}

function avalia(estado, pipe) {
  let valor;
  let primeiro = true;
  for (const cmd of pipe.comandos) {
    if (!cmd.length) throw new TemplateError('missing value for command');
    const [cabeca, ...args] = cmd;
    if (cabeca.t === 'id' && !['true', 'false', 'nil'].includes(cabeca.v)) {
      const fn = estado.funcs[cabeca.v];
      if (!fn) throw new TemplateError(`function "${cabeca.v}" not defined`);
      const vals = args.map((a) => operando(estado, a));
      if (!primeiro) vals.push(valor);
      valor = fn(...vals);
    } else {
      if (!primeiro || args.length) throw new TemplateError(`can't give argument to non-function ${cabeca.v ?? cabeca.t}`);
      valor = operando(estado, cabeca);
    }
    primeiro = false;
  }
  if (pipe.decl) {
    const escopo = pipe.decl.novo ? estado.vars.at(-1) : estado.vars.findLast((v) => pipe.decl.nomes[0] in v) || estado.vars.at(-1);
    escopo[pipe.decl.nomes.at(-1)] = valor;
    return undefined;
  }
  return valor;
}

function renderNos(nos, estado) {
  let out = '';
  for (const no of nos) {
    if (no.t === 'txt') out += no.v;
    else if (no.t === 'acao') {
      const v = avalia(estado, no.pipe);
      if (!no.pipe.decl) out += texto(v);
    } else if (no.t === 'if') {
      const ramo = no.ramos.find((r) => !vazio(avalia(estado, r.cond)));
      const corpo = ramo ? ramo.corpo : no.senao;
      if (corpo) out += renderNos(corpo, { ...estado, vars: [...estado.vars, {}] });
    } else if (no.t === 'with') {
      const v = avalia(estado, no.pipe);
      if (!vazio(v)) out += renderNos(no.corpo, { ...estado, dot: v, vars: [...estado.vars, {}] });
      else if (no.senao) out += renderNos(no.senao, { ...estado, vars: [...estado.vars, {}] });
    } else if (no.t === 'range') {
      const decl = no.pipe.decl;
      const v = avalia(estado, { ...no.pipe, decl: null });
      const itens = Array.isArray(v) ? v.map((x, i) => [i, x]) : v && typeof v === 'object' ? Object.keys(v).sort().map((k) => [k, v[k]]) : typeof v === 'number' ? Array.from({ length: v }, (_, i) => [i, i]) : [];
      if (!itens.length && no.senao) out += renderNos(no.senao, estado);
      for (const [k, x] of itens) {
        const escopo = {};
        if (decl?.nomes.length === 2) {
          escopo[decl.nomes[0]] = k;
          escopo[decl.nomes[1]] = x;
        } else if (decl) escopo[decl.nomes[0]] = x;
        out += renderNos(no.corpo, { ...estado, dot: x, vars: [...estado.vars, escopo] });
      }
    } else if (no.t === 'template') {
      const dot = no.pipe ? avalia(estado, no.pipe) : null;
      out += renderNos(estado.defs[no.nome] || falta(no.nome), { ...estado, dot, vars: [{ $: dot }] });
    }
  }
  return out;
}

// Coleta os blocos {{ define }} de vários arquivos (como os _helpers.tpl).
export function definicoes(fontes) {
  const defs = {};
  for (const src of fontes) Object.assign(defs, parse(lexa(src)).defs);
  return defs;
}

export function render(src, dot, defsExternas = {}) {
  const { nos, defs } = parse(lexa(src));
  const estado = { dot, raiz: dot, vars: [{ $: dot }], defs: { ...defsExternas, ...defs } };
  estado.funcs = funcoes(estado);
  return renderNos(nos, estado);
}
