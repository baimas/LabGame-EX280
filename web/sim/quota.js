// Admissão de quotas e limit ranges, e o controller que mantém o uso das
// quotas em dia. Como no Kubernetes, tudo é avaliado na criação do objeto:
// pods que já existem não mudam quando a regra muda.
import { ApiError } from './cluster.js';
import { clone, parseCpu, parseMem, matchLabels } from './util.js';
import { admiteScc } from './scc.js';

const proibido = (o, msg) => new ApiError(`Error from server (Forbidden): ${o.kind === 'Pod' ? 'pods' : o.kind.toLowerCase() + 's'} "${o.metadata.name}" is forbidden: ${msg}`, 'Forbidden');

const ehCpu = (r) => /(^|\.)cpu$/.test(r);
export const valor = (r, q) => (ehCpu(r) ? parseCpu(q) : /memory|storage/.test(r) ? parseMem(q) : Number(q));

// Formata uma quantidade como o servidor de API faz.
export function formata(r, n) {
  if (ehCpu(r)) {
    const m = Math.round(n * 1000);
    return m % 1000 === 0 ? String(m / 1000) : `${m}m`;
  }
  if (/memory|storage/.test(r)) {
    if (n === 0) return '0';
    for (const [u, b] of [['Gi', 2 ** 30], ['Mi', 2 ** 20], ['Ki', 2 ** 10]]) if (n % b === 0) return `${n / b}${u}`;
    return String(n);
  }
  return String(n);
}

// ------------------------------------------------------------- limit range

const MAIOR = (a, b) => b > a;

// Aplica os valores padrão e confere mínimo e máximo. Devolve o pod ajustado.
export function aplicaLimites(c, pod) {
  // Limit informado sem request: o request herda o limit.
  for (const ct of pod.spec.containers || []) {
    for (const [r, q] of Object.entries(ct.resources?.limits || {})) if (!ct.resources.requests?.[r]) (ct.resources.requests ??= {})[r] = q;
  }
  const ranges = c.list('LimitRange', pod.metadata.namespace);
  if (!ranges.length) return pod;
  for (const lr of ranges) {
    for (const lim of lr.spec?.limits || []) {
      if ((lim.type || 'Container') !== 'Container') continue;
      for (const ct of pod.spec.containers || []) {
        const res = (ct.resources ??= {});
        for (const [r, q] of Object.entries(lim.default || {})) if (!res.limits?.[r]) (res.limits ??= {})[r] = q;
        for (const [r, q] of Object.entries(lim.defaultRequest || {})) if (!res.requests?.[r]) (res.requests ??= {})[r] = q;
      }
    }
  }
  const erros = [];
  for (const lr of ranges) {
    for (const lim of lr.spec?.limits || []) {
      const tipo = lim.type || 'Container';
      if (!['Container', 'Pod'].includes(tipo)) continue;
      const alvos = tipo === 'Container' ? (pod.spec.containers || []).map((ct) => ct.resources || {}) : [somaPod(pod)];
      for (const res of alvos) {
        for (const [r, q] of Object.entries(lim.max || {})) {
          const usado = res.limits?.[r];
          if (usado === undefined) erros.push(`maximum ${r} usage per ${tipo} is ${q}.  No limit is specified`);
          else if (MAIOR(valor(r, q), valor(r, usado))) erros.push(`maximum ${r} usage per ${tipo} is ${q}, but limit is ${usado}`);
        }
        for (const [r, q] of Object.entries(lim.min || {})) {
          const usado = res.requests?.[r];
          if (usado === undefined) erros.push(`minimum ${r} usage per ${tipo} is ${q}.  No request is specified`);
          else if (MAIOR(valor(r, usado), valor(r, q))) erros.push(`minimum ${r} usage per ${tipo} is ${q}, but request is ${usado}`);
        }
      }
    }
  }
  if (erros.length) throw proibido(pod, `[${erros.join(', ')}]`);
  return pod;
}

function somaPod(pod) {
  const out = { requests: {}, limits: {} };
  for (const ct of pod.spec.containers || []) {
    for (const t of ['requests', 'limits']) {
      for (const [r, q] of Object.entries(ct.resources?.[t] || {})) out[t][r] = formata(r, valor(r, out[t][r] ?? 0) + valor(r, q));
    }
  }
  return out;
}

// ------------------------------------------------------------------ quota

const terminado = (p) => ['Succeeded', 'Failed'].includes(p.status?.phase);

// Quanto um pod consome de cada recurso de quota.
function custoPod(pod, r) {
  if (r === 'pods' || r === 'count/pods') return 1;
  const m = r.match(/^(requests|limits)\.(cpu|memory)$/) || r.match(/^()(cpu|memory)$/);
  if (!m) return 0;
  const tipo = m[1] || 'requests';
  return (pod.spec.containers || []).reduce((n, ct) => n + valor(m[2], ct.resources?.[tipo]?.[m[2]] ?? 0), 0);
}

const CONTAGENS = { services: 'Service', secrets: 'Secret', configmaps: 'ConfigMap', persistentvolumeclaims: 'PersistentVolumeClaim', replicationcontrollers: null, resourcequotas: 'ResourceQuota', 'services.loadbalancers': 'Service', 'services.nodeports': 'Service' };

// Tipo contado por um recurso de quota (`count/deployments.apps` → Deployment).
function contado(c, r) {
  if (r in CONTAGENS) return CONTAGENS[r];
  const m = r.match(/^count\/(.+)$/);
  if (!m) return null;
  try {
    return c.tipo(m[1]).kind;
  } catch {
    return null;
  }
}

function custoObjeto(c, o, r) {
  if (o.kind === 'Pod') return custoPod(o, r);
  if (contado(c, r) !== o.kind) return 0;
  if (r === 'services.loadbalancers') return o.spec?.type === 'LoadBalancer' ? 1 : 0;
  if (r === 'services.nodeports') return ['NodePort', 'LoadBalancer'].includes(o.spec?.type) ? (o.spec.ports || []).length : 0;
  return 1;
}

function usoNo(c, ns, r) {
  if (/^(count\/)?pods$|cpu$|memory$/.test(r)) return c.list('Pod', ns).filter((p) => !terminado(p)).reduce((n, p) => n + custoPod(p, r), 0);
  const kind = contado(c, r);
  if (!kind) return 0;
  return c.list(kind, ns).reduce((n, o) => n + custoObjeto(c, o, r), 0);
}

// Projetos escolhidos por uma cluster resource quota.
export function projetosDa(c, crq) {
  const sel = crq.spec?.selector || {};
  return c.list('Namespace').filter((ns) => {
    if (!sel.labels && !sel.annotations) return false;
    if (sel.labels && !matchLabels(ns.metadata.labels || {}, sel.labels)) return false;
    for (const [k, v] of Object.entries(sel.annotations || {})) if (ns.metadata.annotations?.[k] !== v) return false;
    return true;
  }).map((ns) => ns.metadata.name);
}

// Quotas que valem para um namespace: [{nome, hard, uso(r)}].
function quotasDe(c, ns) {
  const out = [];
  for (const q of c.list('ResourceQuota', ns)) out.push({ nome: q.metadata.name, hard: q.spec?.hard || {}, uso: (r) => usoNo(c, ns, r) });
  for (const crq of c.list('ClusterResourceQuota')) {
    const nss = projetosDa(c, crq);
    if (nss.includes(ns)) out.push({ nome: crq.metadata.name, hard: crq.spec?.quota?.hard || {}, uso: (r) => nss.reduce((n, x) => n + usoNo(c, x, r), 0) });
  }
  return out;
}

// Barra o objeto se ele estourar alguma quota do namespace.
export function admiteQuota(c, o) {
  const ns = o.metadata.namespace;
  if (!ns) return;
  for (const q of quotasDe(c, ns)) {
    const recursos = Object.keys(q.hard);
    if (o.kind === 'Pod') {
      const faltando = recursos.filter((r) => /^(requests|limits)\.(cpu|memory)$|^(cpu|memory)$/.test(r)).filter((r) => {
        const [tipo, rec] = r.includes('.') ? r.split('.') : ['requests', r];
        return (o.spec.containers || []).some((ct) => ct.resources?.[tipo]?.[rec] === undefined);
      });
      if (faltando.length) throw proibido(o, `failed quota: ${q.nome}: must specify ${faltando.join(',')}`);
    }
    const pedidos = recursos.map((r) => [r, custoObjeto(c, o, r)]).filter(([, n]) => n > 0);
    const estouro = pedidos.filter(([r, n]) => q.uso(r) + n > valor(r, q.hard[r]));
    if (estouro.length) {
      const lista = (fn) => estouro.map(([r, n]) => `${r}=${fn(r, n)}`).join(',');
      throw proibido(o, `exceeded quota: ${q.nome}, requested: ${lista((r, n) => formata(r, n))}, used: ${lista((r) => formata(r, q.uso(r)))}, limited: ${lista((r) => q.hard[r])}`);
    }
  }
}

// Admissão completa de um objeto novo.
export function admite(c, o) {
  if (o.kind === 'Pod') aplicaLimites(c, o);
  if (o.kind === 'Pod') admiteScc(c, o);
  admiteQuota(c, o);
}

// O LimitRange recebe `defaultRequest` igual ao `default` quando ele falta.
export function padroesLimitRange(lr) {
  for (const lim of lr.spec?.limits || []) {
    if ((lim.type || 'Container') !== 'Container') continue;
    // Sem `default`, o limit padrão é o máximo; sem `defaultRequest`, é o `default`.
    if (lim.max) lim.default = { ...lim.max, ...(lim.default || {}) };
    if (lim.default) lim.defaultRequest = { ...lim.default, ...(lim.defaultRequest || {}) };
  }
}

// Controller: mantém `status.used` das quotas.
export function quotaCtl(c) {
  for (const q of c.list('ResourceQuota')) {
    const hard = clone(q.spec?.hard || {});
    q.status = { hard, used: Object.fromEntries(Object.keys(hard).map((r) => [r, formata(r, usoNo(c, q.metadata.namespace, r))])) };
  }
  for (const crq of c.list('ClusterResourceQuota')) {
    const hard = clone(crq.spec?.quota?.hard || {});
    const nss = projetosDa(c, crq);
    const uso = (lista) => Object.fromEntries(Object.keys(hard).map((r) => [r, formata(r, lista.reduce((n, x) => n + usoNo(c, x, r), 0))]));
    crq.status = { total: { hard, used: uso(nss) }, namespaces: nss.map((n) => ({ namespace: n, status: { hard, used: uso([n]) } })) };
  }
}
