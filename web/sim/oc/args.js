// Análise de argumentos e utilitários comuns aos subcomandos do oc.
import yaml from '../../vendor/js-yaml.mjs';
import { ApiError } from '../cluster.js';
import { kindOf, ALL } from '../resources.js';

const CURTAS = { n: 'namespace', o: 'output', l: 'selector', f: 'filename', k: 'kustomize', A: 'all-namespaces', c: 'container', p: 'patch', e: 'env', u: 'username', R: 'recursive', w: 'watch', h: 'help' };
const BOOLEANAS = ['all-namespaces', 'all', 'show-labels', 'watch', 'no-headers', 'help', 'overwrite', 'force', 'recursive', 'insecure-skip-tls-verify', 'now', 'list', 'add', 'remove', 'dry-run', 'save-config', 'show-server', 'show-console', 'show-token', 'previous', 'follow', 'stdin', 'tty', 'i', 't', 'it', 'ti', 'short', 'client'];

export function parseArgs(args, extras = []) {
  const bool = new Set([...BOOLEANAS, ...extras]);
  const pos = [];
  const flags = {};
  let resto = null;
  const add = (k, v) => (flags[k] ??= []).push(v);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      resto = args.slice(i + 1);
      break;
    }
    if (a === '-') pos.push(a);
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) add(a.slice(2, eq), a.slice(eq + 1));
      else if (bool.has(a.slice(2)) || i + 1 >= args.length) add(a.slice(2), true);
      else add(a.slice(2), args[++i]);
    } else if (/^-[a-zA-Z]/.test(a)) {
      if (bool.has(a.slice(1))) {
        add(a.slice(1), true);
        continue;
      }
      const k = CURTAS[a[1]] || a[1];
      if (a.length > 2) add(k, a.slice(2).replace(/^=/, ''));
      else if (bool.has(k) || i + 1 >= args.length) add(k, true);
      else add(k, args[++i]);
    } else pos.push(a);
  }
  const f = { one: (k) => flags[k]?.at(-1), all: (k) => flags[k] || [], has: (k) => k in flags };
  return { pos, f, resto };
}

export const ok = (out = '') => ({ out, code: 0 });
export const erro = (msg) => new ApiError(msg);
export const naoSimulado = (ctx, o) => new ApiError(ctx.env.t(`[simulador] "${o}" ainda não é simulado neste jogo.`, `[simulator] "${o}" is not simulated in this game yet.`));
export const nsDe = (ctx, f) => f.one('namespace') || ctx.env.session.namespace;

export function tipoOuErro(t) {
  const k = kindOf(t);
  if (!k) throw erro(`error: the server doesn't have a resource type "${t}"`);
  return k;
}

// Interpreta `pods`, `pod x y`, `pod/x svc/y`, `deploy,svc` e `all`.
export function alvos(pos, verbo = 'get') {
  if (!pos.length) throw erro(`error: You must specify the type of resource to ${verbo}. Use "oc api-resources" for a complete list of supported resources.`);
  if (pos[0].includes('/')) {
    const mapa = new Map();
    for (const p of pos) {
      const i = p.indexOf('/');
      if (i < 0) throw erro('error: there is no need to specify a resource type as a separate argument when passing arguments in resource/name form (e.g. \'oc get resource/<resource_name>\' instead of \'oc get resource resource/<resource_name>\'');
      const k = tipoOuErro(p.slice(0, i));
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(p.slice(i + 1));
    }
    return [...mapa].map(([k, nomes]) => ({ k, nomes }));
  }
  const tipos = pos[0].split(',').flatMap((t) => (t === 'all' ? ALL : [t])).map(tipoOuErro);
  return tipos.map((k) => ({ k, nomes: pos.slice(1) }));
}

// Um único alvo: `deployment/x` ou `deployment x`. Devolve também o que sobra.
export function umAlvo(pos, verbo) {
  if (!pos.length) throw erro(`error: you must specify the type of resource to ${verbo}`);
  if (pos[0].includes('/')) {
    const i = pos[0].indexOf('/');
    return { k: tipoOuErro(pos[0].slice(0, i)), nome: pos[0].slice(i + 1), resto: pos.slice(1) };
  }
  if (pos.length < 2) throw erro('error: resource(s) were provided, but no name was specified');
  return { k: tipoOuErro(pos[0]), nome: pos[1], resto: pos.slice(2) };
}

// Lê os manifestos indicados por -f (arquivo, diretório ou "-" para stdin).
export function lerManifestos(ctx, f) {
  const fs = ctx.env.fs;
  const fontes = [];
  for (const arq of f.all('filename')) {
    if (arq === true) throw erro('error: flag needs an argument: \'f\' in -f');
    if (arq === '-') {
      fontes.push(['STDIN', ctx.stdin]);
      continue;
    }
    if (/^https?:/.test(arq)) throw naoSimulado(ctx, 'oc -f <URL>');
    const caminho = fs.resolve(ctx.sh.cwd, arq);
    if (fs.isDir(caminho)) {
      const dentro = fs.ls(caminho).filter((n) => /\.(ya?ml|json)$/.test(n));
      for (const n of dentro) fontes.push([`${arq}/${n}`, fs.read(`${caminho}/${n}`)]);
    } else if (fs.isFile(caminho)) fontes.push([arq, fs.read(caminho)]);
    else throw erro(`error: the path "${arq}" does not exist`);
  }
  const objs = [];
  for (const [nome, texto] of fontes) {
    let docs;
    try {
      docs = yaml.loadAll(texto);
    } catch (e) {
      throw erro(`error: error parsing ${nome}: error converting YAML to JSON: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || 'could not parse'}`);
    }
    for (const d of docs) {
      if (!d) continue;
      if (typeof d !== 'object' || !d.kind) throw erro(`error: error validating "${nome}": error validating data: kind not set`);
      if (d.kind === 'List') objs.push(...(d.items || []));
      else objs.push(d);
    }
  }
  if (!objs.length) throw erro('error: no objects passed to apply');
  return objs;
}

// `Project` em manifesto vira Namespace.
export function normaliza(o) {
  const k = tipoOuErro(o.kind);
  if (k.alias) return { ...o, kind: k.alias, apiVersion: 'v1' };
  return o;
}
