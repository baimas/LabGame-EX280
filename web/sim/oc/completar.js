// Autocomplete e validação de opções do `oc`, a partir dos dados extraídos do
// cliente oficial 4.22 (oc-real.js). Reproduz o que o Tab do bash faz com o
// `oc __complete` do binário real, e as mensagens de erro de opções do pflag.
import { OC_REAL } from './oc-real.js';
import { KINDS, PROJECT } from '../resources.js';

const C = OC_REAL.comandos;
const APELIDOS = OC_REAL.apelidos || {};

// Próximo nível do comando, resolvendo apelidos (`set volume` → `set volumes`).
function desce(caminho, t) {
  const sub = caminho ? `${caminho} ${t}` : t;
  if (C[sub] && (C[caminho]?.subs || []).includes(t)) return sub;
  return APELIDOS[sub] || null;
}
const AJUDA = { l: 'help', c: 'h', b: 1 };
// Comandos que param de ler opções no primeiro argumento (como no binário).
const SEM_INTERCALAR = new Set(['rsh']);

const opcoesDe = (caminho) => [...(C[caminho]?.opcoes || []), ...OC_REAL.globais, AJUDA];

function achaOpcao(caminho, nome, curta) {
  return opcoesDe(caminho).find((o) => (curta ? o.c === nome : o.l === nome)) || null;
}

const precisaValor = (o) => !o.b;

// Percorre os argumentos (sem o `oc`) como o cobra: descobre o comando e os
// argumentos posicionais, pulando as opções e os valores delas.
export function analisa(args) {
  let caminho = '';
  const posicionais = [];
  let ultimaOpcao = null; // opção que ainda espera valor
  let aposTraco = false;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    ultimaOpcao = null;
    if (aposTraco || (SEM_INTERCALAR.has(caminho) && posicionais.length)) {
      posicionais.push(t);
      continue;
    }
    if (t === '--') {
      aposTraco = true;
      continue;
    }
    if (t.startsWith('--') && t.length > 2) {
      const [nome, valor] = [t.slice(2).split('=')[0], t.includes('=') ? t.slice(t.indexOf('=') + 1) : undefined];
      const o = achaOpcao(caminho, nome, false);
      if (o && precisaValor(o) && valor === undefined) {
        if (i + 1 < args.length) i++;
        else ultimaOpcao = o;
      }
      continue;
    }
    if (t.startsWith('-') && t.length > 1) {
      for (let j = 1; j < t.length; j++) {
        const o = achaOpcao(caminho, t[j], true);
        if (o && precisaValor(o)) {
          if (j === t.length - 1) {
            if (i + 1 < args.length) i++;
            else ultimaOpcao = o;
          }
          break;
        }
      }
      continue;
    }
    const sub = !posicionais.length && desce(caminho, t);
    if (sub) caminho = sub;
    else posicionais.push(t);
  }
  return { caminho, posicionais, ultimaOpcao };
}

const verAjuda = (caminho) => `See 'oc${caminho ? ' ' + caminho : ''} --help' for usage.`;

// Erros de opção iguais aos do oc real (pflag). Devolve null se estiver tudo certo.
export function validaOpcoes(args) {
  let caminho = '';
  let posicionais = 0;
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--') break;
    if (SEM_INTERCALAR.has(caminho) && posicionais) break;
    if (t.startsWith('--') && t.length > 2) {
      const nome = t.slice(2).split('=')[0];
      const o = achaOpcao(caminho, nome, false);
      if (!o) return `error: unknown flag: --${nome}\n${verAjuda(caminho)}\n`;
      if (precisaValor(o) && !t.includes('=')) {
        if (i + 1 >= args.length) return `error: flag needs an argument: --${nome}\n${verAjuda(caminho)}\n`;
        i++;
      }
      continue;
    }
    if (t.startsWith('-') && t.length > 1 && !/^-\d/.test(t)) {
      for (let j = 1; j < t.length; j++) {
        const o = achaOpcao(caminho, t[j], true);
        if (!o) return `error: unknown shorthand flag: '${t[j]}' in -${t.slice(j)}\n${verAjuda(caminho)}\n`;
        if (precisaValor(o)) {
          if (j === t.length - 1) {
            if (i + 1 >= args.length) return `error: flag needs an argument: '${t[j]}' in -${t[j]}\n${verAjuda(caminho)}\n`;
            i++;
          }
          break;
        }
      }
      continue;
    }
    const sub = !posicionais && desce(caminho, t);
    if (sub) caminho = sub;
    else posicionais++;
  }
  return null;
}

// Texto exato do --help do oc real para o comando, ou null.
export function ajudaReal(args) {
  const { caminho } = analisa(args.filter((a) => a !== '--help' && a !== '-h'));
  if (!caminho) return OC_REAL.raiz;
  return C[caminho]?.ajuda || null;
}

export const ajudaOptions = () => OC_REAL.options;
export const versaoCliente = () => OC_REAL.versao;
export const comandosRaiz = () => C[''].subs;

// Tipos de recurso no formato de `oc api-resources -o name`, que é o que o
// autocomplete do oc oferece quando está conectado ao cluster.
export function tiposApi() {
  return [...KINDS, PROJECT].map((k) => (k.group ? `${k.plural}.${k.group}` : k.plural));
}

// Comandos cujo primeiro argumento é um tipo de recurso, e o segundo, nomes.
const TIPO_E_NOME = new Set(['get', 'describe', 'delete', 'edit', 'patch', 'label', 'annotate']);

// Candidatos para o Tab. `ctx` traz o que depende do estado do jogo:
// { namespaces(), nomes(tipo), arquivos(), diretorios() }.
export function candidatos(args, atual, ctx) {
  const { caminho, posicionais, ultimaOpcao } = analisa(args);
  const cmd = C[caminho] || C[''];
  // Valor de opção: `--output json`, `-n NS` ou `--output=json`.
  let opcao = ultimaOpcao;
  let prefixo = '';
  if (atual.startsWith('--') && atual.includes('=')) {
    const nome = atual.slice(2, atual.indexOf('='));
    opcao = achaOpcao(caminho, nome, false);
    prefixo = atual.slice(0, atual.indexOf('=') + 1);
    if (!opcao || !precisaValor(opcao)) return [];
  }
  if (opcao) {
    let vals = [];
    if (opcao.l === 'namespace') vals = ctx.namespaces();
    else if (opcao.v) vals = opcao.v;
    else if (opcao.x) vals = ctx.arquivos().filter((a) => a.endsWith('/') || opcao.x.some((e) => a.endsWith(`.${e}`)));
    else if (opcao.d) vals = ctx.diretorios();
    else if (opcao.f) vals = ctx.arquivos();
    return vals.map((v) => prefixo + v);
  }
  // Enquanto faltar uma opção obrigatória, o cobra só sugere as obrigatórias.
  const faltam = (cmd.obrig || []).filter((o) => !args.some((a) => a === `--${o}` || a.startsWith(`--${o}=`))).map((o) => `--${o}`);
  if (atual.startsWith('-')) {
    if (faltam.length) return faltam;
    return atual.startsWith('--') ? cmd.tabLongas : cmd.tabTodas;
  }
  if (cmd.subs.length) return cmd.subs;
  return [...posicionais_(caminho, cmd, posicionais, atual, ctx), ...faltam];
}

function posicionais_(caminho, cmd0, posicionais, atual, ctx) {
  const cmd = { ...cmd0, pos: cmd0.pos.filter((p) => !p.startsWith('-')) };
  // Argumentos posicionais.
  if (caminho === 'project') return posicionais.length ? [] : ctx.namespaces();
  if (caminho === 'explain') return posicionais.length ? [] : tiposApi();
  if (TIPO_E_NOME.has(caminho)) {
    if (atual.includes('/')) {
      const tipo = atual.split('/')[0];
      return ctx.nomes(tipo).map((n) => `${tipo}/${n}`);
    }
    if (!posicionais.length) return tiposApi();
    if (posicionais[0].includes('/')) return [];
    return ctx.nomes(posicionais[0]);
  }
  if (cmd.pos.length) {
    // Listas fixas do oc (`logs` → `deployments/`, `expose` → `service`...).
    if (atual.includes('/')) {
      const tipo = atual.split('/')[0];
      return ctx.nomes(tipo).map((n) => `${tipo}/${n}`);
    }
    if (!posicionais.length) return cmd.pos;
    if (!cmd.pos.some((p) => p.endsWith('/'))) return ctx.nomes(posicionais[0]);
    return [];
  }
  return cmd.dpos & 4 ? [] : ctx.arquivos();
}
