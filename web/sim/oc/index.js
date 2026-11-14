// Comando `oc` simulado. Cada subcomando consulta ou altera o cluster simulado.
import yaml from '../../vendor/js-yaml.mjs';
import { ApiError, SERVER, APPS_DOMAIN } from '../cluster.js';
import { KINDS } from '../resources.js';
import { clone, parseSelector, deepEqual, b64, table, hashNum, rand } from '../util.js';
import { kustomize } from '../kustomize.js';
import { fusaoEstrategica, fusaoSimples, jsonPatch } from '../patch.js';
import { jsonpath, evalPath } from '../jsonpath.js';
import { findImage, parseRef, IMAGES } from '../images.js';
import { resolveEnv, podPronto } from '../controllers.js';
import { VERSAO, KUBE } from '../seed.js';
import { parseArgs, ok, erro, naoSimulado, nsDe, alvos, umAlvo, lerManifestos, normaliza, tipoOuErro } from './args.js';
import { tabela, ordena, paraYaml, paraJson, descreve, podResumo } from './output.js';

const APLICADO = 'kubectl.kubernetes.io/last-applied-configuration';

// Envia texto imediatamente ao terminal quando possível (comandos que esperam).
function emite(ctx, txt) {
  if (ctx.env.write) {
    ctx.env.write(txt);
    return '';
  }
  return txt;
}

const visao = (o, k) => (k.alias ? { ...o, kind: k.kind, apiVersion: k.apiVersion } : o);

function filtraCampos(itens, expr) {
  for (const parte of expr.split(',')) {
    const m = parte.match(/^([^!=]+)(!=|==|=)(.*)$/);
    if (!m) throw erro(`error: invalid field selector "${parte}"`);
    itens = itens.filter((o) => {
      const [v] = evalPath('.' + m[1], o);
      return (String(v ?? '') === m[3]) === (m[2] !== '!=');
    });
  }
  return itens;
}

// Seleciona objetos conforme os argumentos posicionais e os filtros.
function seleciona(ctx, pos, f, verbo) {
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const todos = f.has('all-namespaces');
  return alvos(pos, verbo).map(({ k, nomes }) => {
    const r = c.tipo(k.kind);
    let itens = nomes.length ? nomes.map((n) => c.must(r.kind, n, ns)) : c.list(r.kind, r.namespaced && !todos ? ns : null);
    if (f.has('selector')) {
      const sel = parseSelector(String(f.one('selector')));
      itens = itens.filter((o) => sel(o.metadata.labels));
    }
    if (f.has('field-selector')) itens = filtraCampos(itens, f.one('field-selector'));
    return { k, r, nomeado: nomes.length > 0, itens };
  });
}

// Cria o objeto ou, com --dry-run, apenas o exibe.
function entrega(ctx, f, obj, verbo = 'created') {
  const c = ctx.env.cluster;
  const k = tipoOuErro(obj.kind);
  const saida = f.one('output');
  const seco = f.has('dry-run');
  let final = obj;
  if (!seco) final = c.create(obj);
  else {
    final = { apiVersion: k.apiVersion, ...obj };
    final.metadata = { creationTimestamp: null, ...final.metadata };
  }
  if (saida === 'yaml') return ok(paraYaml(ordena(clone(final))));
  if (saida === 'json') return ok(paraJson(ordena(clone(final))));
  if (saida === 'name') return ok(`${k.out}/${obj.metadata.name}\n`);
  return ok(`${k.out}/${obj.metadata.name} ${verbo}${seco ? ' (dry run)' : ''}\n`);
}

// ------------------------------------------------------------------- get

function get(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const todos = f.has('all-namespaces');
  const grupos = seleciona(ctx, pos, f, 'get');
  if (f.has('sort-by')) {
    const caminho = String(f.one('sort-by')).replace(/^\{|\}$/g, '');
    for (const g of grupos) {
      g.itens = [...g.itens].sort((a, b) => {
        const [x] = evalPath(caminho, a);
        const [y] = evalPath(caminho, b);
        return x < y ? -1 : x > y ? 1 : 0;
      });
    }
  }
  const saida = String(f.one('output') || '');
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);

  if (!saida || saida === 'wide') {
    if (!total) {
      const comNs = grupos.some((g) => g.r.namespaced) && !todos;
      return { err: comNs ? `No resources found in ${ns} namespace.\n` : 'No resources found\n', code: 0 };
    }
    const partes = grupos.filter((g) => g.itens.length).map((g) => tabela(g.k.alias ? g.k : g.r, g.itens, c, {
      wide: saida === 'wide',
      labels: f.has('show-labels'),
      todosNs: todos,
      prefixo: grupos.length > 1,
      semCabecalho: f.has('no-headers'),
    }));
    return ok(partes.join('\n'));
  }

  const planos = grupos.flatMap((g) => g.itens.map((o) => ordena(clone(visao(o, g.k)))));
  if (saida === 'name') return ok(grupos.flatMap((g) => g.itens.map((o) => `${g.k.out}/${o.metadata.name}\n`)).join(''));
  const unico = grupos.length === 1 && grupos[0].nomeado && planos.length === 1;
  const dados = unico ? planos[0] : { apiVersion: 'v1', items: planos, kind: 'List', metadata: { resourceVersion: '' } };
  if (saida === 'yaml') return ok(paraYaml(dados));
  if (saida === 'json') return ok(paraJson(dados));
  if (saida.startsWith('jsonpath=')) return ok(jsonpath(saida.slice(9), dados));
  if (saida.startsWith('custom-columns=')) {
    const cols = saida.slice(15).split(',').map((x) => {
      const i = x.indexOf(':');
      return [x.slice(0, i), x.slice(i + 1)];
    });
    const linhas = planos.map((o) => cols.map(([, caminho]) => {
      const v = evalPath(caminho, o);
      return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(',') : '<none>';
    }));
    return ok(table(f.has('no-headers') ? linhas : [cols.map(([n]) => n), ...linhas]));
  }
  if (saida.startsWith('go-template')) throw naoSimulado(ctx, 'oc get -o go-template');
  throw erro(`error: unable to match a printer suitable for the output format "${saida}", allowed formats are: custom-columns,json,jsonpath,name,wide,yaml`);
}

function describe(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const grupos = seleciona(ctx, pos, f, 'describe');
  const partes = grupos.flatMap((g) => g.itens.map((o) => descreve(visao(o, g.k), c)));
  if (!partes.length) return { err: `No resources found in ${nsDe(ctx, f)} namespace.\n`, code: 0 };
  return ok(partes.join('\n\n'));
}

// ------------------------------------------------------------ apply / create

function poda(alvo, anterior, novo) {
  if (!anterior || typeof anterior !== 'object' || Array.isArray(anterior)) return;
  for (const k of Object.keys(anterior)) {
    if (novo == null || !(k in novo)) delete alvo[k];
    else if (alvo[k] && typeof alvo[k] === 'object' && !Array.isArray(alvo[k])) poda(alvo[k], anterior[k], novo[k]);
  }
}

function funde(alvo, novo) {
  for (const [k, v] of Object.entries(novo)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && alvo[k] && typeof alvo[k] === 'object' && !Array.isArray(alvo[k])) funde(alvo[k], v);
    else alvo[k] = clone(v);
  }
}

// Calcula o resultado de aplicar um manifesto, sem gravar nada.
function planeja(ctx, bruto, ns) {
  const c = ctx.env.cluster;
  const o = clone(normaliza(bruto));
  const k = c.tipo(o.kind);
  o.metadata ??= {};
  if (k.namespaced) o.metadata.namespace ??= ns;
  const atual = c.get(k.kind, o.metadata.name, o.metadata.namespace);
  const registro = JSON.stringify(o) + '\n';
  if (!atual) {
    const novo = clone(o);
    (novo.metadata.annotations ??= {})[APLICADO] = registro;
    return { k, o, atual: null, proximo: novo };
  }
  const proximo = clone(atual);
  const anterior = atual.metadata.annotations?.[APLICADO];
  if (anterior) {
    const antigo = JSON.parse(anterior);
    for (const chave of Object.keys(antigo)) {
      if (['apiVersion', 'kind', 'status'].includes(chave)) continue;
      if (chave === 'metadata') {
        for (const m of ['labels', 'annotations']) if (antigo.metadata[m]) poda((proximo.metadata[m] ??= {}), antigo.metadata[m], o.metadata[m] || {});
      } else if (!(chave in o)) delete proximo[chave];
      else poda(proximo[chave], antigo[chave], o[chave]);
    }
  }
  for (const [chave, v] of Object.entries(o)) {
    if (['apiVersion', 'kind', 'status'].includes(chave)) continue;
    if (chave === 'metadata') {
      for (const m of ['labels', 'annotations']) if (v[m]) funde((proximo.metadata[m] ??= {}), v[m]);
    } else if (v && typeof v === 'object' && !Array.isArray(v) && proximo[chave]) funde(proximo[chave], v);
    else proximo[chave] = clone(v);
  }
  (proximo.metadata.annotations ??= {})[APLICADO] = registro;
  // Reaplica os valores padrão do servidor, para que um manifesto idêntico
  // ao que já está no cluster resulte em "unchanged".
  c.padroes(proximo);
  return { k, o, atual, proximo };
}

function aplicaUm(ctx, bruto, ns) {
  const c = ctx.env.cluster;
  const p = planeja(ctx, bruto, ns);
  const nome = `${p.k.out}/${p.o.metadata.name}`;
  if (!p.atual) {
    c.create(p.proximo);
    return `${nome} created\n`;
  }
  if (deepEqual(p.proximo, p.atual)) return `${nome} unchanged\n`;
  c.update(p.proximo);
  return `${nome} configured\n`;
}

// Objetos indicados por -f (arquivos) ou -k (diretório do Kustomize).
function fontes(ctx, f) {
  if (f.has('kustomize')) {
    const dir = f.one('kustomize') === true ? '.' : f.one('kustomize');
    return kustomize(ctx.env.fs, ctx.env.fs.resolve(ctx.sh.cwd, dir));
  }
  if (!f.has('filename')) throw erro('error: must specify one of -f and -k');
  return lerManifestos(ctx, f);
}

function apply(ctx) {
  const { f } = parseArgs(ctx.args);
  const ns = nsDe(ctx, f);
  let out = '';
  let err = '';
  for (const o of fontes(ctx, f)) {
    try {
      out += f.has('dry-run') ? `${tipoOuErro(o.kind).out}/${o.metadata?.name} configured (dry run)\n` : aplicaUm(ctx, o, ns);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      err += e.message + '\n';
    }
  }
  return { out, err, code: err ? 1 : 0 };
}

function kustomizeCmd(ctx) {
  const { pos } = parseArgs(ctx.args);
  const objs = kustomize(ctx.env.fs, ctx.env.fs.resolve(ctx.sh.cwd, pos[0] || '.'));
  return ok(objs.map((o) => paraYaml(ordena(clone(o)))).join('---\n'));
}

// Diferença linha a linha, no formato unificado, com 3 linhas de contexto.
function difLinhas(a, b) {
  const n = a.length;
  const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push([' ', a[i++], j++]);
    else if (i < n && (j >= m || t[i + 1][j] >= t[i][j + 1])) ops.push(['-', a[i++]]);
    else ops.push(['+', b[j++]]);
  }
  const perto = ops.map((_, x) => ops.slice(Math.max(0, x - 3), x + 4).some((o) => o[0] !== ' '));
  let out = '';
  let aberto = false;
  ops.forEach((o, x) => {
    if (!perto[x]) {
      aberto = false;
      return;
    }
    if (!aberto) out += '@@\n';
    aberto = true;
    out += `${o[0]}${o[1]}\n`;
  });
  return out;
}

function diff(ctx) {
  const { f } = parseArgs(ctx.args);
  const ns = nsDe(ctx, f);
  const limpa = (o) => {
    if (!o) return [];
    const x = clone(o);
    delete x.status;
    if (x.metadata.annotations) {
      delete x.metadata.annotations[APLICADO];
      if (!Object.keys(x.metadata.annotations).length) delete x.metadata.annotations;
    }
    return paraYaml(ordena(x)).trimEnd().split('\n');
  };
  let out = '';
  for (const bruto of fontes(ctx, f)) {
    const p = planeja(ctx, bruto, ns);
    const antes = limpa(p.atual);
    const depois = limpa(p.proximo);
    if (antes.join('\n') === depois.join('\n')) continue;
    const nome = `${p.k.apiVersion.replace('/', '.')}.${p.k.kind}.${p.o.metadata.namespace || ''}.${p.o.metadata.name}`;
    out += `diff -u -N /tmp/LIVE-1/${nome} /tmp/MERGED-1/${nome}\n--- /tmp/LIVE-1/${nome}\n+++ /tmp/MERGED-1/${nome}\n${difLinhas(antes, depois)}`;
  }
  // Como o diff real, sai com código 1 quando há diferenças.
  return { out, code: out ? 1 : 0 };
}

function dadosDe(ctx, f) {
  const fs = ctx.env.fs;
  const dados = {};
  for (const l of f.all('from-literal')) {
    const i = String(l).indexOf('=');
    if (i < 1) throw erro(`error: invalid literal source ${l}, expected key=value`);
    dados[l.slice(0, i)] = l.slice(i + 1);
  }
  for (const a of f.all('from-file')) {
    const i = String(a).indexOf('=');
    const [chave, arq] = i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [null, a];
    const caminho = fs.resolve(ctx.sh.cwd, arq);
    if (fs.isDir(caminho)) for (const n of fs.ls(caminho)) if (fs.isFile(`${caminho}/${n}`)) dados[n] = fs.read(`${caminho}/${n}`);
    if (fs.isDir(caminho)) continue;
    if (!fs.isFile(caminho)) throw erro(`error: error reading ${arq}: no such file or directory`);
    dados[chave || arq.split('/').pop()] = fs.read(caminho);
  }
  if (f.has('from-env-file')) throw naoSimulado(ctx, '--from-env-file');
  return dados;
}

const GERADORES = {
  namespace(ctx, pos) {
    return { kind: 'Namespace', metadata: { name: pos[0] } };
  },
  deployment(ctx, pos, f, resto) {
    if (!f.has('image')) throw erro('error: required flag(s) "image" not set');
    const nome = pos[0];
    const ct = { name: parseRef(f.one('image')).repo.split('/').pop(), image: f.one('image') };
    if (f.has('port')) ct.ports = [{ containerPort: Number(f.one('port')) }];
    if (resto?.length) ct.command = resto;
    return {
      kind: 'Deployment',
      metadata: { name: nome, labels: { app: nome } },
      spec: { replicas: Number(f.one('replicas') ?? 1), selector: { matchLabels: { app: nome } }, template: { metadata: { labels: { app: nome } }, spec: { containers: [ct] } } },
    };
  },
  configmap(ctx, pos, f) {
    return { kind: 'ConfigMap', metadata: { name: pos[0] }, data: dadosDe(ctx, f) };
  },
  secret(ctx, pos, f) {
    const [tipo, nome] = pos;
    if (tipo === 'generic') {
      const dados = dadosDe(ctx, f);
      return { kind: 'Secret', metadata: { name: nome }, type: f.one('type') || 'Opaque', data: Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, b64.enc(v)])) };
    }
    if (tipo === 'tls') {
      const le = (flag) => {
        if (!f.has(flag)) throw erro(`error: required flag(s) "${flag}" not set`);
        const p = ctx.env.fs.resolve(ctx.sh.cwd, f.one(flag));
        if (!ctx.env.fs.isFile(p)) throw erro(`error: open ${f.one(flag)}: no such file or directory`);
        return b64.enc(ctx.env.fs.read(p));
      };
      return { kind: 'Secret', metadata: { name: nome }, type: 'kubernetes.io/tls', data: { 'tls.crt': le('cert'), 'tls.key': le('key') } };
    }
    throw naoSimulado(ctx, `oc create secret ${tipo}`);
  },
  serviceaccount(ctx, pos) {
    return { kind: 'ServiceAccount', metadata: { name: pos[0] } };
  },
  service(ctx, pos, f) {
    const [tipo, nome] = pos;
    const mapa = { clusterip: 'ClusterIP', nodeport: 'NodePort', loadbalancer: 'LoadBalancer' };
    if (!mapa[tipo]) throw naoSimulado(ctx, `oc create service ${tipo}`);
    const portas = f.all('tcp').map((t) => {
      const [porta, alvo] = String(t).split(':');
      return { name: `${porta}-${alvo || porta}`, port: Number(porta), targetPort: Number(alvo || porta), protocol: 'TCP' };
    });
    return { kind: 'Service', metadata: { name: nome, labels: { app: nome } }, spec: { type: mapa[tipo], selector: { app: nome }, ports: portas } };
  },
};
GERADORES.ns = GERADORES.namespace;
GERADORES.deploy = GERADORES.deployment;
GERADORES.cm = GERADORES.configmap;
GERADORES.sa = GERADORES.serviceaccount;
GERADORES.svc = GERADORES.service;

function create(ctx) {
  const { pos, f, resto } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (f.has('filename')) {
    let out = '';
    let err = '';
    for (const bruto of lerManifestos(ctx, f)) {
      try {
        const o = clone(normaliza(bruto));
        o.metadata ??= {};
        if (c.tipo(o.kind).namespaced) o.metadata.namespace ??= ns;
        out += entrega(ctx, f, o).out;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        err += e.message + '\n';
      }
    }
    return { out, err, code: err ? 1 : 0 };
  }
  const [tipo, ...nomes] = pos;
  if (!tipo) throw erro('error: must specify one of -f and -k');
  const gerador = GERADORES[tipo];
  if (!gerador) throw naoSimulado(ctx, `oc create ${tipo}`);
  if (!nomes.length) throw erro('error: exactly one NAME is required, got 0');
  const obj = gerador(ctx, nomes, f, resto);
  if (c.tipo(obj.kind).namespaced) obj.metadata.namespace = ns;
  return entrega(ctx, f, obj);
}

function del(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  let lista = [];
  const porArquivo = f.has('filename') || f.has('kustomize');
  if (porArquivo) {
    for (const bruto of fontes(ctx, f)) {
      const o = normaliza(bruto);
      lista.push({ k: tipoOuErro(bruto.kind), nome: o.metadata.name, ns: o.metadata.namespace || ns });
    }
  } else {
    const temFiltro = f.has('all') || f.has('selector');
    for (const g of seleciona(ctx, pos, f, 'delete')) {
      if (!g.nomeado && !temFiltro) throw erro('error: resource(s) were provided, but no name was specified');
      for (const o of g.itens) lista.push({ k: g.k, nome: o.metadata.name, ns: o.metadata.namespace });
    }
  }
  if (!lista.length) return { err: 'No resources found\n', code: 0 };
  let out = '';
  let err = '';
  for (const { k, nome, ns: n } of lista) {
    const r = c.tipo(k.kind);
    try {
      if (r.kind === 'Namespace' && /^(default|kube-.*|openshift(-.*)?)$/.test(nome)) throw erro(`Error from server (Forbidden): namespaces "${nome}" is forbidden: this namespace may not be deleted`);
      if (!c.get(r.kind, nome, n)) {
        if (lista.length > 1 && !porArquivo) continue; // já removido em cascata
        c.must(r.kind, nome, n);
      }
      c.delete(r.kind, nome, n);
      out += `${k.out} "${nome}" deleted\n`;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      err += e.message + '\n';
    }
  }
  return { out, err, code: err ? 1 : 0 };
}

// --------------------------------------------------------------- projetos

function newProject(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const nome = pos[0];
  if (!nome) throw erro('error: must have exactly one argument');
  if (c.get('Namespace', nome)) throw erro(`Error from server (AlreadyExists): project.project.openshift.io "${nome}" already exists`);
  const anot = { 'openshift.io/requester': ctx.env.session.user };
  if (f.has('display-name')) anot['openshift.io/display-name'] = f.one('display-name');
  if (f.has('description')) anot['openshift.io/description'] = f.one('description');
  c.create({ kind: 'Namespace', metadata: { name: nome, annotations: anot } });
  ctx.env.session.namespace = nome;
  return ok(`Now using project "${nome}" on server "${SERVER}".\n\nYou can add applications to this project with the 'new-app' command. For example, try:\n\n    oc new-app rails-postgresql-example\n\nto build a new example application in Ruby. Or use kubectl to deploy a simple Kubernetes application:\n\n    kubectl create deployment hello-node --image=registry.k8s.io/e2e-test-images/agnhost:2.43 -- /agnhost serve-hostname\n\n`);
}

function project(ctx) {
  const { pos } = parseArgs(ctx.args);
  const s = ctx.env.session;
  if (!pos.length) return ok(`Using project "${s.namespace}" on server "${SERVER}".\n`);
  if (!ctx.env.cluster.get('Namespace', pos[0])) throw erro(`error: A project named "${pos[0]}" does not exist on "${SERVER}".\nYour projects are:\n${ctx.env.cluster.list('Namespace').map((n) => '* ' + n.metadata.name).join('\n')}`);
  if (s.namespace === pos[0]) return ok(`Already on project "${pos[0]}" on server "${SERVER}".\n`);
  s.namespace = pos[0];
  return ok(`Now using project "${pos[0]}" on server "${SERVER}".\n`);
}

function projects(ctx) {
  const s = ctx.env.session;
  const nomes = ctx.env.cluster.list('Namespace').map((n) => n.metadata.name);
  return ok(`You have access to the following projects and can switch between them with ' project <projectname>':\n\n${nomes.map((n) => (n === s.namespace ? '  * ' : '    ') + n).join('\n')}\n\nUsing project "${s.namespace}" on server "${SERVER}".\n`);
}

function login(ctx) {
  const { f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const u = f.one('username');
  const p = f.one('password') ?? f.one('patch');
  if (!u || u === true) throw naoSimulado(ctx, ctx.env.t('oc login interativo (use -u e -p)', 'interactive oc login (use -u and -p)'));
  if (p === undefined || p === true) throw naoSimulado(ctx, ctx.env.t('oc login com senha interativa (use -p)', 'oc login with interactive password (use -p)'));
  if (c.users[u] !== p) return { err: 'Login failed (401 Unauthorized)\nVerify you have provided the correct credentials.\n', code: 1 };
  ctx.env.session.user = u;
  const n = c.list('Namespace').length;
  return ok(`Login successful.\n\nYou have access to ${n} projects, the list has been suppressed. You can list all projects with 'oc projects'\n\nUsing project "${ctx.env.session.namespace}".\n`);
}

function whoami(ctx) {
  const { f } = parseArgs(ctx.args);
  if (f.has('show-server')) return ok(SERVER + '\n');
  if (f.has('show-console')) return ok(`https://console-openshift-console.${APPS_DOMAIN}\n`);
  if (f.has('show-token') || f.has('t')) return ok(`sha256~${hashNum(ctx.env.session.user).toString(36)}SimuladoNaoEhUmTokenReal\n`);
  return ok(ctx.env.session.user + '\n');
}

// ------------------------------------------------------- new-app / expose

function newApp(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (f.has('template') || f.has('file') || f.has('filename')) throw naoSimulado(ctx, 'oc new-app --template/--file');
  const imagem = f.one('image') || f.one('docker-image') || pos[0];
  if (!imagem) throw erro('error: You must specify one or more images, image streams, templates, or source code locations to create an application.');
  if (/^https?:|\.git$|~/.test(imagem)) throw naoSimulado(ctx, ctx.env.t('oc new-app a partir de código-fonte', 'oc new-app from source code'));
  const achada = findImage(imagem);
  if (achada.error) throw erro(`error: unable to locate any images in image streams, local docker images with name "${imagem}"\n\nThe 'oc new-app' command will match arguments to the following types:\n\n  1. Images tagged into image streams in the current project or the 'openshift' project\n  2. Images in the container storage, on remote registries\n  3. Templates in the current project or the 'openshift' project\n  4. Git repository URLs or local paths that point to Git repositories\n\n--allow-missing-images can be used to point to an image that does not exist yet.`);
  const nome = f.one('name') || parseRef(imagem).repo.split('/').pop();
  const rotulos = { app: nome, 'app.kubernetes.io/component': nome, 'app.kubernetes.io/instance': nome };
  for (const l of [...f.all('labels'), ...f.all('selector')]) for (const par of String(l).split(',')) rotulos[par.split('=')[0]] = par.split('=')[1] ?? '';
  const ct = { name: nome, image: imagem };
  const env = f.all('env').map((e) => ({ name: String(e).split('=')[0], value: String(e).split('=').slice(1).join('=') }));
  if (env.length) ct.env = env;
  const porta = achada.image.port;
  if (porta) ct.ports = [{ containerPort: porta, protocol: 'TCP' }];
  const dep = { kind: 'Deployment', metadata: { name: nome, namespace: ns, labels: rotulos }, spec: { replicas: 1, selector: { matchLabels: { deployment: nome } }, template: { metadata: { labels: { deployment: nome } }, spec: { containers: [ct] } } } };
  if (f.has('dry-run')) return f.one('output') === 'yaml' ? ok(paraYaml(ordena({ apiVersion: 'apps/v1', ...dep }))) : ok(`deployment.apps "${nome}" created (dry run)\n`);
  let out = `--> Found container image ${achada.digest.slice(7, 14)} (3 weeks old) from ${parseRef(imagem).repo.split('/')[0]} for "${imagem}"\n\n    * An image stream tag will be created as "${nome}:${achada.tag}" that will track this image\n\n--> Creating resources ...\n`;
  c.create(dep);
  out += `    deployment.apps "${nome}" created\n`;
  if (porta) {
    c.create({ kind: 'Service', metadata: { name: nome, namespace: ns, labels: rotulos }, spec: { selector: { deployment: nome }, ports: [{ name: `${porta}-tcp`, port: porta, targetPort: porta, protocol: 'TCP' }] } });
    out += `    service "${nome}" created\n`;
  }
  out += '--> Success\n';
  if (porta) out += `    Application is not exposed. You can expose services to the outside world by executing one or more of the commands below:\n     'oc expose service/${nome}'\n`;
  return ok(out + "    Run 'oc status' to view your app.\n");
}

function expose(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  const { k, nome } = umAlvo(pos, 'expose');
  const o = c.must(k.kind, nome, ns);
  if (k.kind === 'Service') {
    const rota = { kind: 'Route', metadata: { name: f.one('name') || nome, namespace: ns, labels: clone(o.metadata.labels) }, spec: { to: { kind: 'Service', name: nome } } };
    if (f.has('hostname')) rota.spec.host = f.one('hostname');
    if (f.has('path')) rota.spec.path = f.one('path');
    const porta = f.one('port') || o.spec.ports?.[0]?.name || o.spec.ports?.[0]?.targetPort;
    if (porta) rota.spec.port = { targetPort: /^\d+$/.test(String(porta)) ? Number(porta) : porta };
    return entrega(ctx, f, rota, 'exposed');
  }
  if (k.kind === 'Deployment' || k.kind === 'Pod' || k.kind === 'ReplicaSet') {
    const spec = k.kind === 'Pod' ? o.spec : o.spec.template.spec;
    const porta = Number(f.one('port') ?? spec.containers[0].ports?.[0]?.containerPort);
    if (!porta) throw erro("error: couldn't find port via --port flag or introspection\nSee 'oc expose -h' for help and examples");
    const seletor = k.kind === 'Pod' ? o.metadata.labels : o.spec.selector.matchLabels;
    if (!seletor || !Object.keys(seletor).length) throw erro("error: couldn't retrieve selectors via --selector flag or introspection");
    const alvo = f.one('target-port');
    const svc = {
      kind: 'Service',
      metadata: { name: f.one('name') || nome, namespace: ns, labels: clone(o.metadata.labels) },
      spec: { type: f.one('type') || 'ClusterIP', selector: clone(seletor), ports: [{ port: porta, protocol: f.one('protocol') || 'TCP', targetPort: alvo === undefined ? porta : /^\d+$/.test(alvo) ? Number(alvo) : alvo }] },
    };
    return entrega(ctx, f, svc, 'exposed');
  }
  throw erro(`error: cannot expose a ${k.kind}`);
}

// ----------------------------------------------------- alterações pontuais

// Altera o template de pod de um deployment e grava.
function mudaTemplate(ctx, k, nome, ns, fn) {
  const c = ctx.env.cluster;
  if (k.kind !== 'Deployment') throw naoSimulado(ctx, `oc set ... ${k.singular}`);
  const d = clone(c.must('Deployment', nome, ns));
  const antes = JSON.stringify(d.spec.template);
  fn(d.spec.template.spec, d);
  if (JSON.stringify(d.spec.template) === antes) return false;
  c.update(d);
  return true;
}

function quais(spec, f) {
  const alvo = f.one('container');
  const lista = alvo ? spec.containers.filter((x) => x.name === alvo) : spec.containers;
  if (!lista.length) throw erro(`error: unable to find container named "${alvo}"`);
  return lista;
}

function set(ctx) {
  const [sub, ...resto] = ctx.args;
  const { pos, f } = parseArgs(resto, ['read-only']);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (!['env', 'image', 'resources', 'volume'].includes(sub)) throw naoSimulado(ctx, `oc set ${sub ?? ''}`.trim());
  const { k, nome, resto: itens } = umAlvo(pos, 'set');

  if (sub === 'env') {
    if (f.has('list')) {
      const d = c.must(k.kind, nome, ns);
      const spec = k.kind === 'Pod' ? d.spec : d.spec.template.spec;
      let out = '';
      for (const ct of spec.containers) {
        out += `# ${k.plural}/${nome}, container ${ct.name}\n`;
        for (const e of ct.env || []) {
          const r = e.valueFrom?.secretKeyRef || e.valueFrom?.configMapKeyRef;
          out += r ? `# ${e.name} from ${e.valueFrom.secretKeyRef ? 'secret' : 'configmap'} ${r.name}, key ${r.key}\n` : `${e.name}=${e.value ?? ''}\n`;
        }
      }
      return ok(out);
    }
    const novos = [];
    const remove = [];
    for (const it of [...itens, ...f.all('env')]) {
      if (/^[^=]+-$/.test(it)) remove.push(it.slice(0, -1));
      else if (it.includes('=')) novos.push({ name: it.slice(0, it.indexOf('=')), value: it.slice(it.indexOf('=') + 1) });
      else throw erro(`error: invalid parameter assignment in "${it}"`);
    }
    if (f.has('from')) {
      const [tipo, origem] = String(f.one('from')).split('/');
      const kind = tipoOuErro(tipo).kind;
      if (kind !== 'Secret' && kind !== 'ConfigMap') throw erro('error: unsupported resource specified in --from');
      const fonte = c.must(kind, origem, ns);
      for (const chave of Object.keys(fonte.data || {})) {
        novos.push({ name: (f.one('prefix') || '') + chave.toUpperCase().replace(/[^A-Z0-9_]/g, '_'), valueFrom: { [kind === 'Secret' ? 'secretKeyRef' : 'configMapKeyRef']: { name: origem, key: chave } } });
      }
    }
    if (!novos.length && !remove.length) throw erro('error: at least one environment variable must be provided');
    mudaTemplate(ctx, k, nome, ns, (spec) => {
      for (const ct of quais(spec, f)) {
        let env = (ct.env || []).filter((e) => !remove.includes(e.name) && !novos.some((n) => n.name === e.name));
        env = [...env, ...clone(novos)];
        if (env.length) ct.env = env;
        else delete ct.env;
      }
    });
    return ok(`${k.out}/${nome} updated\n`);
  }

  if (sub === 'image') {
    if (!itens.length) throw erro('error: at least one image update is required');
    const mudou = mudaTemplate(ctx, k, nome, ns, (spec) => {
      for (const it of itens) {
        const i = it.indexOf('=');
        if (i < 1) throw erro(`error: invalid image update "${it}", expected CONTAINER=IMAGE`);
        const alvo = spec.containers.filter((x) => it.slice(0, i) === '*' || x.name === it.slice(0, i));
        if (!alvo.length) throw erro(`error: unable to find container named "${it.slice(0, i)}"`);
        for (const ct of alvo) ct.image = it.slice(i + 1);
      }
    });
    return ok(mudou ? `${k.out}/${nome} image updated\n` : '');
  }

  if (sub === 'volume') {
    if (!f.has('add') && !f.has('remove')) throw naoSimulado(ctx, ctx.env.t('oc set volume sem --add ou --remove', 'oc set volume without --add or --remove'));
    const nomeVol = f.one('name') || `volume-${rand(5)}`;
    if (f.has('remove')) {
      if (!f.has('name')) throw erro('error: must specify --name with --remove');
      mudaTemplate(ctx, k, nome, ns, (spec) => {
        if (!(spec.volumes || []).some((v) => v.name === nomeVol)) throw erro(`error: volume '${nomeVol}' not found`);
        spec.volumes = spec.volumes.filter((v) => v.name !== nomeVol);
        if (!spec.volumes.length) delete spec.volumes;
        for (const ct of spec.containers) {
          if (!ct.volumeMounts) continue;
          ct.volumeMounts = ct.volumeMounts.filter((m) => m.name !== nomeVol);
          if (!ct.volumeMounts.length) delete ct.volumeMounts;
        }
      });
      return ok(`${k.out}/${nome} volume updated\n`);
    }
    const tipo = String(f.one('type') || (f.has('configmap-name') ? 'configmap' : f.has('secret-name') ? 'secret' : f.has('claim-name') ? 'pvc' : 'emptydir')).toLowerCase();
    const exige = (flag) => {
      if (!f.has(flag) || f.one(flag) === true) throw erro(`error: must provide --${flag} for --type=${tipo}`);
      return f.one(flag);
    };
    const vol = { name: nomeVol };
    if (tipo === 'configmap') vol.configMap = { name: exige('configmap-name') };
    else if (tipo === 'secret') vol.secret = { secretName: exige('secret-name') };
    else if (tipo === 'pvc' || tipo === 'persistentvolumeclaim') vol.persistentVolumeClaim = { claimName: exige('claim-name') };
    else if (tipo === 'emptydir') vol.emptyDir = {};
    else throw naoSimulado(ctx, `oc set volume --type=${tipo}`);
    mudaTemplate(ctx, k, nome, ns, (spec) => {
      if ((spec.volumes || []).some((v) => v.name === nomeVol)) {
        if (!f.has('overwrite')) throw erro(`error: volume '${nomeVol}' already exists. Use --overwrite to replace`);
        spec.volumes = spec.volumes.filter((v) => v.name !== nomeVol);
        for (const ct of spec.containers) if (ct.volumeMounts) ct.volumeMounts = ct.volumeMounts.filter((m) => m.name !== nomeVol);
      }
      (spec.volumes ??= []).push(vol);
      if (f.has('mount-path')) {
        for (const ct of quais(spec, f)) {
          const m = { name: nomeVol, mountPath: f.one('mount-path') };
          if (f.has('sub-path')) m.subPath = f.one('sub-path');
          if (f.has('read-only')) m.readOnly = true;
          (ct.volumeMounts ??= []).push(m);
        }
      }
    });
    return ok(`${k.out}/${nome} volume updated\n`);
  }

  const le = (txt) => Object.fromEntries(String(txt).split(',').map((p) => p.split('=')));
  if (!f.has('limits') && !f.has('requests')) throw erro('error: you must specify an update for requests or limits');
  mudaTemplate(ctx, k, nome, ns, (spec) => {
    for (const ct of quais(spec, f)) {
      ct.resources ??= {};
      if (f.has('limits')) ct.resources.limits = { ...ct.resources.limits, ...le(f.one('limits')) };
      if (f.has('requests')) ct.resources.requests = { ...ct.resources.requests, ...le(f.one('requests')) };
    }
  });
  return ok(`${k.out}/${nome} resource requirements updated\n`);
}

function scale(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  if (!f.has('replicas')) throw erro('error: required flag(s) "replicas" not set');
  const { k, nome } = umAlvo(pos, 'scale');
  if (!['Deployment', 'ReplicaSet'].includes(k.kind)) throw erro(`error: could not find proper group-version for scale subresource of ${k.resource}`);
  const o = clone(c.must(k.kind, nome, nsDe(ctx, f)));
  o.spec.replicas = Number(f.one('replicas'));
  c.update(o);
  return ok(`${k.out}/${nome} scaled\n`);
}

function rotula(campo, verbo) {
  return (ctx) => {
    const { pos, f } = parseArgs(ctx.args);
    const c = ctx.env.cluster;
    const ns = nsDe(ctx, f);
    let k;
    let nomes;
    let itens;
    if (pos[0]?.includes('/')) {
      const a = umAlvo(pos, verbo);
      [k, nomes, itens] = [a.k, [a.nome], a.resto];
    } else {
      k = tipoOuErro(pos[0] ?? '');
      const i = pos.findIndex((p, n) => n > 0 && (p.includes('=') || p.endsWith('-')));
      nomes = pos.slice(1, i < 0 ? undefined : i);
      itens = i < 0 ? [] : pos.slice(i);
    }
    const r = c.tipo(k.kind);
    let objs = nomes.map((n) => c.must(r.kind, n, ns));
    if (f.has('selector')) {
      const sel = parseSelector(String(f.one('selector')));
      objs = c.list(r.kind, r.namespaced ? ns : null).filter((o) => sel(o.metadata.labels));
    } else if (f.has('all')) objs = c.list(r.kind, r.namespaced ? ns : null);
    if (!objs.length) throw erro('error: one or more resources must be specified as <resource> <name> or <resource>/<name>');
    if (!itens.length) throw erro(`error: at least one ${verbo} update is required`);
    let out = '';
    for (const atual of objs) {
      const o = clone(atual);
      const mapa = (o.metadata[campo] ??= {});
      for (const it of itens) {
        if (it.endsWith('-') && !it.includes('=')) delete mapa[it.slice(0, -1)];
        else {
          const chave = it.slice(0, it.indexOf('='));
          const valor = it.slice(it.indexOf('=') + 1);
          if (chave in mapa && mapa[chave] !== valor && !f.has('overwrite')) throw erro(`error: '${chave}' already has a value (${mapa[chave]}), and --overwrite is false`);
          mapa[chave] = valor;
        }
      }
      const mudou = !deepEqual(o.metadata[campo], atual.metadata[campo] || {});
      if (mudou) c.update(o);
      out += `${k.out}/${o.metadata.name} ${mudou ? verbo + (verbo === 'label' ? 'ed' : 'd') : 'not ' + verbo + (verbo === 'label' ? 'ed' : 'd')}\n`;
    }
    return ok(out);
  };
}

function patch(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const { k, nome } = umAlvo(pos, 'patch');
  if (!f.has('patch')) throw erro('error: must specify --patch or --patch-file containing the contents of the patch');
  let p;
  try {
    p = yaml.load(String(f.one('patch')));
  } catch {
    throw erro('error: unable to parse "patch": yaml: did not find expected node content');
  }
  const r = c.tipo(k.kind);
  const atual = c.must(r.kind, nome, nsDe(ctx, f));
  const o = clone(atual);
  const tipo = f.one('type') || 'strategic';
  if (tipo === 'json') jsonPatch(o, p);
  else if (tipo === 'merge') fusaoSimples(o, p);
  else if (tipo === 'strategic') fusaoEstrategica(o, p);
  else throw erro(`error: --type must be one of [json merge strategic], not "${tipo}"`);
  if (deepEqual(o, atual)) return ok(`${k.out}/${nome} patched (no change)\n`);
  c.update(o);
  return ok(`${k.out}/${nome} patched\n`);
}

async function edit(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const { k, nome } = umAlvo(pos, 'edit');
  const r = c.tipo(k.kind);
  const ns = nsDe(ctx, f);
  const atual = c.must(r.kind, nome, ns);
  if (!ctx.env.openEditor) throw erro('error: unable to launch the editor "vi"');
  const cabecalho = "# Please edit the object below. Lines beginning with a '#' will be ignored,\n# and an empty file will abort the edit. If an error occurs while saving this file will be\n# reopened with the relevant failures.\n#\n";
  const texto = await ctx.env.openEditor(`oc-edit-${nome}.yaml`, cabecalho + paraYaml(ordena(clone(visao(atual, k)))));
  if (texto === null || texto === undefined || !texto.replace(/^#.*$/gm, '').trim()) return ok('Edit cancelled, no changes made.\n');
  let novo;
  try {
    novo = yaml.load(texto);
  } catch (e) {
    throw erro(`error: error converting YAML to JSON: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || 'could not parse'}`);
  }
  novo = normaliza(novo);
  if (novo.metadata?.name !== nome) throw erro(`error: the name of the object (${novo.metadata?.name}) does not match the name on the URL (${nome})`);
  novo.metadata.namespace = atual.metadata.namespace;
  novo.status = atual.status;
  if (deepEqual(novo, clone(atual))) return ok('Edit cancelled, no changes made.\n');
  c.update(novo);
  return ok(`${k.out}/${nome} edited\n`);
}

// ---------------------------------------------------------------- rollout

const donoDe = (filho, pai) => (filho.metadata.ownerReferences || []).some((r) => r.uid === pai.metadata.uid);
const REV = 'deployment.kubernetes.io/revision';

async function rollout(ctx) {
  const [sub, ...resto] = ctx.args;
  const { pos, f } = parseArgs(resto);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  if (!['status', 'restart', 'history', 'undo', 'pause', 'resume'].includes(sub)) throw erro(`error: unknown command "${sub ?? ''}" for "oc rollout"`);
  if (sub === 'pause' || sub === 'resume') throw naoSimulado(ctx, `oc rollout ${sub}`);
  const { k, nome } = umAlvo(pos, 'rollout');
  if (k.kind !== 'Deployment') throw naoSimulado(ctx, `oc rollout ${sub} ${k.singular}`);
  const d = c.must('Deployment', nome, ns);
  const rss = () => c.list('ReplicaSet', ns).filter((r) => donoDe(r, d)).sort((a, b) => Number(a.metadata.annotations[REV]) - Number(b.metadata.annotations[REV]));

  if (sub === 'status') {
    let out = '';
    let ultima = '';
    for (let i = 0; i <= 30; i++) {
      const atual = c.must('Deployment', nome, ns);
      const st = atual.status || {};
      const n = atual.spec.replicas;
      if ((st.updatedReplicas || 0) >= n && (st.readyReplicas || 0) >= n && (st.replicas || 0) === n) return ok(out + `deployment "${nome}" successfully rolled out\n`);
      const msg = (st.updatedReplicas || 0) < n
        ? `Waiting for deployment "${nome}" rollout to finish: ${st.updatedReplicas || 0} out of ${n} new replicas have been updated...\n`
        : (st.replicas || 0) > n && (st.availableReplicas || 0) >= (st.replicas || 0)
          ? `Waiting for deployment "${nome}" rollout to finish: ${(st.replicas || 0) - n} old replicas are pending termination...\n`
          : `Waiting for deployment "${nome}" rollout to finish: ${Math.max(0, (st.availableReplicas || 0) - ((st.replicas || 0) - (st.updatedReplicas || 0)))} of ${n} updated replicas are available...\n`;
      if (msg !== ultima) out += emite(ctx, msg);
      ultima = msg;
      await ctx.env.sleep(1);
    }
    return { out, err: 'error: timed out waiting for the condition\n', code: 1 };
  }

  if (sub === 'restart') {
    const novo = clone(d);
    ((novo.spec.template.metadata ??= {}).annotations ??= {})['kubectl.kubernetes.io/restartedAt'] = c.iso();
    c.update(novo);
    return ok(`deployment.apps/${nome} restarted\n`);
  }

  if (sub === 'history') {
    const linhas = rss().map((r) => `${String(r.metadata.annotations[REV]).padEnd(10)}${r.metadata.annotations['kubernetes.io/change-cause'] || '<none>'}`);
    return ok(`deployment.apps/${nome} \nREVISION  CHANGE-CAUSE\n${linhas.join('\n')}\n\n`);
  }

  const lista = rss();
  const alvoRev = f.has('to-revision') ? Number(f.one('to-revision')) : null;
  const destino = alvoRev ? lista.find((r) => Number(r.metadata.annotations[REV]) === alvoRev) : lista.at(-2);
  if (!destino) throw erro(alvoRev ? `error: unable to find specified revision ${alvoRev} in history` : 'error: no rollout history found for deployment "' + nome + '"');
  const novo = clone(d);
  const tpl = clone(destino.spec.template);
  delete tpl.metadata.labels['pod-template-hash'];
  novo.spec.template = tpl;
  c.update(novo);
  return ok(`deployment.apps/${nome} rolled back\n`);
}

// ---------------------------------------------------------- logs e exec

// Resolve um pod a partir de `pod`, `pod/x`, `deploy/x`...
function achaPod(ctx, alvo, ns) {
  const c = ctx.env.cluster;
  if (!alvo) throw erro('error: expected \'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]\'.\nPOD or TYPE/NAME is a required argument for the logs command');
  if (!alvo.includes('/')) return { pod: c.must('Pod', alvo, ns) };
  const k = tipoOuErro(alvo.split('/')[0]);
  const nome = alvo.slice(alvo.indexOf('/') + 1);
  if (k.kind === 'Pod') return { pod: c.must('Pod', nome, ns) };
  const dono = c.must(k.kind, nome, ns);
  let pods = [];
  if (k.kind === 'Deployment') {
    const rs = c.list('ReplicaSet', ns).filter((r) => donoDe(r, dono) && r.metadata.annotations?.[REV] === dono.metadata.annotations?.[REV]);
    pods = c.list('Pod', ns).filter((p) => rs.some((r) => donoDe(p, r)));
  } else pods = c.list('Pod', ns).filter((p) => donoDe(p, dono));
  if (!pods.length) throw erro(`error: no pods found for ${k.out}/${nome}`);
  return { pod: pods[0], aviso: pods.length > 1 ? `Found ${pods.length} pods, using pod/${pods[0].metadata.name}\n` : '' };
}

function logs(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['patch', 'filename']);
  const c = ctx.env.cluster;
  const { pod, aviso = '' } = achaPod(ctx, pos[0], nsDe(ctx, f));
  const ct = f.one('container') || pos[1] || pod.spec.containers[0].name;
  if (!pod.spec.containers.some((x) => x.name === ct)) throw erro(`error: container ${ct} is not valid for pod ${pod.metadata.name}`);
  const reg = c.side[pod.metadata.uid]?.logs?.[ct];
  const esperando = (motivo) => ({ err: aviso + `Error from server (BadRequest): container "${ct}" in pod "${pod.metadata.name}" is waiting to start: ${motivo}\n`, code: 1 });
  if (!reg) return esperando('ContainerCreating');
  if (reg.espera) return esperando(reg.espera);
  let linhas = reg.linhas;
  if (f.has('tail')) linhas = linhas.slice(-Number(f.one('tail')));
  return { err: aviso, out: linhas.length ? linhas.join('\n') + '\n' : '', code: 0 };
}

function exec(ctx) {
  const { pos, f, resto } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const { pod } = achaPod(ctx, pos[0], nsDe(ctx, f));
  const cmd = resto || pos.slice(1);
  if (!cmd.length) throw naoSimulado(ctx, ctx.env.t('sessão interativa dentro do pod (informe um comando após --)', 'interactive session inside the pod (pass a command after --)'));
  const nomeCt = f.one('container') || pod.spec.containers[0].name;
  const ct = pod.spec.containers.find((x) => x.name === nomeCt);
  const estado = pod.status.containerStatuses?.find((x) => x.name === nomeCt);
  if (!ct || !estado?.state.running) throw erro(`error: unable to upgrade connection: container not found ("${nomeCt}")`);
  const { env } = resolveEnv(c, pod, ct);
  const tudo = { HOSTNAME: pod.metadata.name, HOME: '/opt/app-root/src', KUBERNETES_SERVICE_HOST: '172.30.0.1', KUBERNETES_SERVICE_PORT: '443', ...env };
  if (cmd[0] === 'env' || (cmd[0] === 'printenv' && cmd.length === 1)) return ok(Object.entries(tudo).map(([k, v]) => `${k}=${v}\n`).join(''));
  if (cmd[0] === 'printenv') return cmd[1] in tudo ? ok(tudo[cmd[1]] + '\n') : { code: 1 };
  if (cmd[0] === 'hostname') return ok(pod.metadata.name + '\n');
  if ((cmd[0] === 'cat' || cmd[0] === 'ls') && cmd[1]) {
    for (const m of ct.volumeMounts || []) {
      const base = m.mountPath.replace(/\/$/, '');
      if (cmd[1] !== base && !cmd[1].startsWith(base + '/')) continue;
      const v = (pod.spec.volumes || []).find((x) => x.name === m.name);
      const fonte = v?.configMap ? c.get('ConfigMap', v.configMap.name, pod.metadata.namespace) : v?.secret ? c.get('Secret', v.secret.secretName, pod.metadata.namespace) : null;
      if (!fonte) break;
      const dados = Object.fromEntries(Object.entries(fonte.data || {}).map(([k, val]) => [k, fonte.kind === 'Secret' ? b64.dec(val) : val]));
      const chave = cmd[1].slice(base.length + 1).replace(/\/$/, '');
      if (cmd[0] === 'ls' && !chave) return ok(Object.keys(dados).join('\n') + '\n');
      if (chave in dados) return ok(cmd[0] === 'ls' ? cmd[1] + '\n' : dados[chave]);
      return { err: `${cmd[0]}: ${cmd[1]}: No such file or directory\n`, code: 1 };
    }
  }
  throw naoSimulado(ctx, `oc exec ... -- ${cmd.join(' ')}`);
}

async function wait(ctx) {
  const { pos, f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const para = String(f.one('for') || '');
  if (!para) throw erro('error: --for is required');
  const limite = parseInt(f.one('timeout') ?? '30', 10);
  const m = para.match(/^condition=([^=]+)(?:=(.*))?$/i);
  if (!m && para !== 'delete') throw naoSimulado(ctx, `oc wait --for=${para}`);
  let out = '';
  for (let t = 0; t <= limite; t++) {
    let grupos;
    try {
      grupos = seleciona(ctx, pos, f, 'wait');
    } catch (e) {
      if (para === 'delete' && e instanceof ApiError) return ok(out);
      throw e;
    }
    const itens = grupos.flatMap((g) => g.itens.map((o) => ({ o, k: g.k })));
    if (para === 'delete') {
      if (!itens.length) return ok(out);
    } else {
      if (!itens.length) throw erro('error: no matching resources found');
      const pendentes = itens.filter(({ o }) => !(o.status?.conditions || []).some((x) => x.type.toLowerCase() === m[1].toLowerCase() && x.status.toLowerCase() === (m[2] || 'true').toLowerCase()));
      if (!pendentes.length) return ok(itens.map(({ o, k }) => `${k.out}/${o.metadata.name} condition met\n`).join(''));
      if (t === limite) return { err: pendentes.map(({ o, k }) => `error: timed out waiting for the condition on ${k.plural}/${o.metadata.name}\n`).join(''), code: 1 };
    }
    await ctx.env.sleep(1);
  }
  return { err: 'error: timed out waiting for the condition\n', code: 1 };
}

function extract(ctx) {
  const { pos, f } = parseArgs(ctx.args, ['confirm']);
  const c = ctx.env.cluster;
  const fs = ctx.env.fs;
  const { k, nome } = umAlvo(pos, 'extract');
  if (k.kind !== 'Secret' && k.kind !== 'ConfigMap') throw erro(`error: ${k.plural}/${nome} is not a secret or config map`);
  const o = c.must(k.kind, nome, nsDe(ctx, f));
  const chaves = f.has('keys') ? f.all('keys').flatMap((x) => String(x).split(',')) : Object.keys(o.data || {});
  const destino = f.one('to') ?? '.';
  let out = '';
  let err = '';
  for (const chave of chaves) {
    if (!(chave in (o.data || {}))) continue;
    const valor = k.kind === 'Secret' ? b64.dec(o.data[chave]) : o.data[chave];
    if (destino === '-') {
      out += `# ${chave}\n${valor.endsWith('\n') ? valor : valor + '\n'}`;
      continue;
    }
    const dir = fs.resolve(ctx.sh.cwd, destino);
    if (!fs.isDir(dir)) throw erro(`error: stat ${destino}: no such file or directory`);
    const arq = `${dir}/${chave}`;
    if (fs.isFile(arq) && !f.has('confirm')) {
      err += `error: ${destino}/${chave}: file exists, pass --confirm to overwrite\n`;
      continue;
    }
    fs.write(arq, valor);
    out += `${destino}/${chave}\n`;
  }
  // Com --to=-, cada valor é precedido por um comentário com o nome da chave.
  return { out, err, code: err ? 1 : 0 };
}

// ------------------------------------------------------------ informações

function status(ctx) {
  const { f } = parseArgs(ctx.args);
  const c = ctx.env.cluster;
  const ns = nsDe(ctx, f);
  let out = `In project ${ns} on server ${SERVER}\n\n`;
  const deps = c.list('Deployment', ns);
  const svcs = c.list('Service', ns);
  const rotas = c.list('Route', ns);
  const erros = [];
  for (const d of deps) {
    const svc = svcs.find((s) => s.spec.selector && Object.entries(s.spec.selector).every(([k, v]) => d.spec.template.metadata?.labels?.[k] === v));
    const rota = svc && rotas.find((r) => r.spec.to.name === svc.metadata.name);
    if (rota) out += `http${rota.spec.tls ? 's' : ''}://${rota.spec.host} to pod port ${rota.spec.port?.targetPort ?? '<all>'} (svc/${svc.metadata.name})\n`;
    else if (svc) out += `svc/${svc.metadata.name} - ${svc.spec.clusterIP}:${svc.spec.ports[0].port}\n`;
    out += `  deployment/${d.metadata.name} deploys ${d.spec.template.spec.containers.map((x) => x.image).join(',')}\n`;
    out += `    deployment #${d.metadata.annotations?.[REV] || 1} running - ${d.status.readyReplicas || 0}/${d.spec.replicas} pods\n\n`;
  }
  for (const p of c.list('Pod', ns)) {
    const r = podResumo(p);
    if (r.status === 'CrashLoopBackOff') erros.push(`  * pod/${p.metadata.name} is crash-looping\n`);
    if (r.status === 'ImagePullBackOff' || r.status === 'ErrImagePull') erros.push(`  * pod/${p.metadata.name} is unable to pull its image\n`);
  }
  if (!deps.length) out += "You have no services, deployment configs, or build configs.\nRun 'oc new-app' to create an application.\n";
  if (erros.length) out += `Errors:\n${erros.join('')}\n`;
  return ok(out + (deps.length ? `${erros.length ? erros.length + ' error' + (erros.length > 1 ? 's' : '') + ', ' : ''}View details with 'oc describe <resource>/<name>' or list resources with 'oc get all'.\n` : ''));
}

function version(ctx) {
  const { f } = parseArgs(ctx.args);
  const cliente = `Client Version: ${VERSAO}\nKustomize Version: v5.4.2\n`;
  return ok(f.has('client') ? cliente : cliente + `Server Version: ${VERSAO}\nKubernetes Version: ${KUBE}\n`);
}

function apiResources() {
  const linhas = [['NAME', 'SHORTNAMES', 'APIVERSION', 'NAMESPACED', 'KIND']];
  for (const k of KINDS) linhas.push([k.plural, k.short.join(','), k.apiVersion, String(k.namespaced), k.kind]);
  return ok(table(linhas));
}

function adm(ctx) {
  const [sub, oque, ...resto] = ctx.args;
  const c = ctx.env.cluster;
  if (sub !== 'top') throw naoSimulado(ctx, `oc adm ${sub ?? ''}`.trim());
  const { f } = parseArgs(resto);
  if (/^nodes?$/.test(oque)) {
    const n = c.list('Pod').filter((p) => p.status.phase === 'Running').length;
    const cpu = 1100 + n * 35;
    const mem = 9200 + n * 110;
    return ok(table([['NAME', 'CPU(cores)', 'CPU(%)', 'MEMORY(bytes)', 'MEMORY(%)'], ['master01', `${cpu}m`, `${Math.round(cpu / 75)}%`, `${mem}Mi`, `${Math.round((mem / (31 * 1024)) * 100)}%`]]));
  }
  if (/^pods?$/.test(oque)) {
    const ns = nsDe(ctx, f);
    const pods = c.list('Pod', f.has('all-namespaces') ? null : ns).filter(podPronto);
    if (!pods.length) return { err: `No resources found in ${ns} namespace.\n`, code: 0 };
    return ok(table([['NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...pods.map((p) => [p.metadata.name, `${1 + (hashNum(p.metadata.name) % 24)}m`, `${28 + (hashNum(p.metadata.uid) % 180)}Mi`])]));
  }
  throw erro('error: unknown command "' + (oque ?? '') + '" for "oc adm top"');
}

function imagem(ctx) {
  const [sub, ref] = ctx.args;
  if (sub !== 'info' || !ref) throw naoSimulado(ctx, `oc image ${sub ?? ''}`.trim());
  const a = findImage(ref);
  if (a.error) throw erro(`error: unable to read image ${ref}: ${a.error === 'repo' ? 'name unknown: repository not found' : 'manifest unknown'}`);
  const i = a.image;
  return ok([
    `Name:          ${ref}`,
    `Digest:        ${a.digest}`,
    'Media Type:    application/vnd.oci.image.manifest.v1+json',
    `Created:       3w ago`,
    `Image Size:    ${i.size} in 4 layers`,
    'OS:            linux',
    'Arch:          amd64',
    'Entrypoint:    container-entrypoint',
    'Command:       /usr/bin/run-app',
    'Working Dir:   /opt/app-root/src',
    `User:          ${i.user}`,
    `Exposes Ports: ${i.port ? i.port + '/tcp' : '<none>'}`,
    `Environment:   APP_VERSION=${a.tag}`,
    '               PATH=/opt/app-root/bin:/usr/local/bin:/usr/bin:/bin',
    '',
  ].join('\n'));
}

export function skopeo(ctx) {
  const [sub, ...resto] = ctx.args;
  const alvo = resto.find((a) => a.startsWith('docker://'));
  if (!alvo || !['inspect', 'list-tags'].includes(sub)) return { err: ctx.env.t('[simulador] skopeo: use `skopeo inspect docker://IMAGEM` ou `skopeo list-tags docker://REPOSITÓRIO`.\n', '[simulator] skopeo: use `skopeo inspect docker://IMAGE` or `skopeo list-tags docker://REPOSITORY`.\n'), code: 1 };
  const ref = alvo.slice(9);
  if (sub === 'list-tags') {
    const img = IMAGES.find((x) => x.repo === ref);
    if (!img) return { err: `FATA[0000] Error listing repository tags: fetching tags list: name unknown: repository not found\n`, code: 1 };
    return ok(JSON.stringify({ Repository: ref, Tags: Object.keys(img.tags) }, null, 4) + '\n');
  }
  const a = findImage(ref);
  if (a.error) return { err: `FATA[0000] Error parsing image name "${alvo}": reading manifest ${a.tag || a.digest} in ${a.repo}: ${a.error === 'repo' ? 'name unknown: repository not found' : 'manifest unknown'}\n`, code: 1 };
  return ok(JSON.stringify({ Name: a.image.repo, Digest: a.digest, RepoTags: Object.keys(a.image.tags), Created: '2026-10-20T09:14:02Z', DockerVersion: '', Labels: { version: a.tag }, Architecture: 'amd64', Os: 'linux', Layers: [0, 1, 2, 3].map((n) => `sha256:${hashNum(a.digest + n).toString(16).padStart(8, '0').repeat(8)}`), Env: [`APP_VERSION=${a.tag}`] }, null, 4) + '\n');
}

const SUBS = {
  get, describe, apply, create, delete: del, 'new-project': newProject, project, projects, login, whoami,
  'new-app': newApp, expose, set, scale, label: rotula('labels', 'label'), annotate: rotula('annotations', 'annotate'),
  patch, edit, rollout, logs, exec, rsh: exec, wait, status, kustomize: kustomizeCmd, diff, extract, version, 'api-resources': apiResources, adm, image: imagem,
  'cluster-info': () => ok(`Kubernetes control plane is running at ${SERVER}\n\nTo further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.\n`),
  events: (ctx) => get({ ...ctx, args: ['events', ...ctx.args] }),
  logout: (ctx) => ok(`Logged "${ctx.env.session.user}" out on "${SERVER}"\n`),
};

export async function oc(ctx) {
  const [sub, ...resto] = ctx.args;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    return ok(ctx.env.t('Subcomandos do oc simulados até agora:\n  ', 'oc subcommands simulated so far:\n  ') + Object.keys(SUBS).sort().join(', ') + '\n');
  }
  const fn = SUBS[sub];
  if (!fn) throw naoSimulado(ctx, `oc ${sub}`);
  if (resto.includes('--help') || resto.includes('-h')) throw naoSimulado(ctx, `oc ${sub} --help`);
  return fn({ ...ctx, args: resto });
}

export const OC_SUBS = Object.keys(SUBS).sort();
