// Processamento de templates do OpenShift: parâmetros, geradores e
// substituição de ${PARAM} e ${{PARAM}}.
import { ApiError } from './cluster.js';
import { clone } from './util.js';

const CLASSES = {
  '\\w': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_',
  '\\d': '0123456789',
  '\\a': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_',
  '\\A': '~!@#$%^&*()-_+={}[]\\|<,>.?/"\';:`',
};

const sorteia = (s) => s[Math.floor(Math.random() * s.length)];

// Gera um valor a partir de uma expressão como `[a-zA-Z0-9]{16}` ou `user[A-Z]{3}`.
export function gera(expr) {
  let out = '';
  let i = 0;
  while (i < expr.length) {
    let conjunto;
    if (expr[i] === '[') {
      const fim = expr.indexOf(']', i);
      const dentro = expr.slice(i + 1, fim);
      conjunto = '';
      for (let j = 0; j < dentro.length; j++) {
        if (dentro[j] === '\\' && CLASSES[dentro.slice(j, j + 2)]) {
          conjunto += CLASSES[dentro.slice(j, j + 2)];
          j++;
        } else if (dentro[j + 1] === '-' && dentro[j + 2]) {
          for (let c = dentro.charCodeAt(j); c <= dentro.charCodeAt(j + 2); c++) conjunto += String.fromCharCode(c);
          j += 2;
        } else conjunto += dentro[j];
      }
      i = fim + 1;
    } else if (expr[i] === '\\' && CLASSES[expr.slice(i, i + 2)]) {
      conjunto = CLASSES[expr.slice(i, i + 2)];
      i += 2;
    } else {
      conjunto = expr[i];
      i++;
    }
    let n = 1;
    const m = expr.slice(i).match(/^\{(\d+)\}/);
    if (m) {
      n = Number(m[1]);
      i += m[0].length;
    }
    for (let k = 0; k < n; k++) out += conjunto.length === 1 ? conjunto : sorteia(conjunto);
  }
  return out;
}

function substitui(valor, params) {
  if (typeof valor === 'string') {
    // ${{PARAM}} sozinho vira um valor não string (número, booleano...).
    const bruto = valor.match(/^\$\{\{([A-Za-z0-9_]+)\}\}$/);
    if (bruto && bruto[1] in params) {
      try {
        return JSON.parse(params[bruto[1]]);
      } catch {
        return params[bruto[1]];
      }
    }
    return valor.replace(/\$\{\{?([A-Za-z0-9_]+)\}?\}/g, (m, nome) => (nome in params ? params[nome] : m));
  }
  if (Array.isArray(valor)) return valor.map((v) => substitui(v, params));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, substitui(v, params)]));
  return valor;
}

// Resolve os parâmetros: valores informados, padrões e gerados.
export function resolveParametros(tpl, informados) {
  const definidos = tpl.parameters || [];
  for (const nome of Object.keys(informados)) {
    if (!definidos.some((p) => p.name === nome)) throw new ApiError(`error: unknown parameter name "${nome}"`);
  }
  const valores = {};
  const gerados = new Set();
  definidos.forEach((p, i) => {
    let v = informados[p.name];
    if (v === undefined && p.generate === 'expression' && p.from && !p.value) {
      v = gera(p.from);
      gerados.add(p.name);
    }
    if (v === undefined) v = p.value ?? '';
    if (p.required && v === '') throw new ApiError(`error: unable to process template\n  template.parameters[${i}]: Required value: template.parameters[${i}]: parameter ${p.name} is required and must be specified`);
    valores[p.name] = String(v);
  });
  return { valores, gerados };
}

export function processa(tpl, informados = {}, rotulosExtras = {}) {
  const { valores, gerados } = resolveParametros(tpl, informados);
  const rotulos = { ...(tpl.labels || {}), ...rotulosExtras };
  const objetos = (tpl.objects || []).map((o) => {
    const x = substitui(clone(o), valores);
    if (Object.keys(rotulos).length) {
      x.metadata = x.metadata || {};
      x.metadata.labels = { ...(x.metadata.labels || {}), ...rotulos };
      if (x.spec?.template?.metadata) x.spec.template.metadata.labels = { ...(x.spec.template.metadata.labels || {}), ...rotulos };
    }
    return x;
  });
  return { objetos, valores, gerados, mensagem: tpl.message ? substitui(tpl.message, valores) : '' };
}

// Lê parâmetros de -p A=B e de --param-file.
export function parametros(fs, cwd, lista, arquivos) {
  const out = {};
  for (const a of arquivos) {
    const p = fs.resolve(cwd, a);
    if (!fs.isFile(p)) throw new ApiError(`error: open ${a}: no such file or directory`);
    for (const linha of fs.read(p).split('\n')) {
      const t = linha.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) throw new ApiError(`error: invalid parameter assignment in "${t}"`);
      out[t.slice(0, i)] = t.slice(i + 1).replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  for (const v of lista) {
    const i = String(v).indexOf('=');
    if (i < 1) throw new ApiError(`error: invalid parameter assignment in "${v}": "${v}"`);
    out[v.slice(0, i)] = v.slice(i + 1);
  }
  return out;
}
