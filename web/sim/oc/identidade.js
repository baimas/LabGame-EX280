// Subcomandos de identidade e autorização: oc auth can-i, oc adm policy,
// oc adm groups e os geradores de roles e bindings do `oc create`.
import { ApiError } from '../cluster.js';
import { kindOf } from '../resources.js';
import { clone, table } from '../util.js';
import { pode, regras, grupos } from '../rbac.js';
import { parseArgs, ok, erro, naoSimulado, nsDe } from './args.js';

const RBAC = 'rbac.authorization.k8s.io';

// `deployments`, `deployments.apps`, `pods/log`, `*` → { recurso, grupo }.
export function resolveRecurso(txt) {
  if (txt === '*') return { recurso: '*', grupo: '*' };
  const [base, sub] = txt.split('/');
  const k = kindOf(base);
  if (!k) {
    const [nome, ...g] = base.split('.');
    if (g.length) return { recurso: sub ? `${nome}/${sub}` : nome, grupo: g.join('.'), desconhecido: true };
    return null;
  }
  const real = k.alias ? { plural: 'projects', group: 'project.openshift.io' } : k;
  return { recurso: sub ? `${real.plural}/${sub}` : real.plural, grupo: real.group, kind: k };
}

const lista = (f, flag) => f.all(flag).flatMap((x) => String(x).split(',')).filter(Boolean);

// --------------------------------------------------------- oc create

function regrasDe(f) {
  const verbos = lista(f, 'verb');
  const recursos = lista(f, 'resource');
  if (!verbos.length) throw erro('error: at least one verb must be specified');
  if (!recursos.length) throw erro('error: at least one resource must be specified');
  const porGrupo = new Map();
  for (const r of recursos) {
    const x = resolveRecurso(r);
    if (!x) throw erro(`error: the server doesn't have a resource type "${r.split('/')[0]}"`);
    if (!porGrupo.has(x.grupo)) porGrupo.set(x.grupo, []);
    porGrupo.get(x.grupo).push(x.recurso);
  }
  const nomes = lista(f, 'resource-name');
  return [...porGrupo].map(([g, rs]) => ({ apiGroups: [g], resources: rs, ...(nomes.length ? { resourceNames: nomes } : {}), verbs: verbos }));
}

function sujeitos(f, ns) {
  const out = [];
  for (const u of lista(f, 'user')) out.push({ apiGroup: RBAC, kind: 'User', name: u });
  for (const g of lista(f, 'group')) out.push({ apiGroup: RBAC, kind: 'Group', name: g });
  for (const sa of lista(f, 'serviceaccount')) {
    const [n, nome] = sa.split(':');
    if (!nome) throw erro('error: serviceaccount must be <namespace>:<name>');
    out.push({ kind: 'ServiceAccount', name: nome, namespace: n || ns });
  }
  return out;
}

export const GERADORES_RBAC = {
  role: (ctx, pos, f) => ({ kind: 'Role', metadata: { name: pos[0] }, rules: regrasDe(f) }),
  clusterrole: (ctx, pos, f) => ({ kind: 'ClusterRole', metadata: { name: pos[0] }, rules: regrasDe(f) }),
  rolebinding: (ctx, pos, f) => {
    const [role, cr] = [f.one('role'), f.one('clusterrole')];
    if (Boolean(role) === Boolean(cr)) throw erro('error: exactly one of clusterrole or role must be specified');
    return { kind: 'RoleBinding', metadata: { name: pos[0] }, roleRef: { apiGroup: RBAC, kind: role ? 'Role' : 'ClusterRole', name: role || cr }, subjects: sujeitos(f, nsDe(ctx, f)) };
  },
  clusterrolebinding: (ctx, pos, f) => {
    if (!f.has('clusterrole')) throw erro('error: required flag(s) "clusterrole" not set');
    return { kind: 'ClusterRoleBinding', metadata: { name: pos[0] }, roleRef: { apiGroup: RBAC, kind: 'ClusterRole', name: f.one('clusterrole') }, subjects: sujeitos(f, nsDe(ctx, f)) };
  },
  user: (ctx, pos, f) => ({ kind: 'User', metadata: { name: pos[0] }, ...(f.has('full-name') ? { fullName: f.one('full-name') } : {}), identities: [] }),
};

// ------------------------------------------------------------ can-i

export function authCmd(ctx) {
  const [sub, ...resto] = ctx.args;
  if (sub === 'whoami') return ok(`ATTRIBUTE   VALUE\nUsername    ${ctx.env.usuario}\nGroups      [${grupos(ctx.env.clusterReal, ctx.env.usuario).join(' ')}]\n`);
  if (sub !== 'can-i') throw naoSimulado(ctx, `oc auth ${sub ?? ''}`.trim());
  const { pos, f } = parseArgs(resto, ['list', 'quiet', 'q']);
  const c = ctx.env.clusterReal;
  const u = ctx.env.usuario;
  const ns = f.has('all-namespaces') ? null : nsDe(ctx, f);
  const extras = ctx.env.gruposExtras || [];
  if (f.has('list')) {
    const { cluster, local } = regras(c, u, ns, extras);
    const linhas = [['Resources', 'Non-Resource URLs', 'Resource Names', 'Verbs']];
    for (const r of [...local, ...cluster]) {
      if (r.nonResourceURLs) {
        linhas.push(['', `[${r.nonResourceURLs.join(' ')}]`, '[]', `[${r.verbs.join(' ')}]`]);
        continue;
      }
      for (const g of r.apiGroups || ['']) for (const res of r.resources || []) linhas.push([g && g !== '*' ? `${res}.${g}` : g === '*' ? `${res}.*` : res, '[]', `[${(r.resourceNames || []).join(' ')}]`, `[${r.verbs.join(' ')}]`]);
    }
    return ok(table(linhas));
  }
  const [verbo, alvo] = pos;
  if (!verbo || !alvo) throw erro("error: you must specify two arguments: verb resource or verb resource/resourceName.\nSee 'oc auth can-i -h' for help and examples");
  const [res, nome] = alvo.includes('/') && !/^\w+\/(log|exec|scale|status|attach|portforward)$/.test(alvo) ? alvo.split('/') : [alvo, undefined];
  const x = resolveRecurso(res);
  let aviso = '';
  if (!x || x.desconhecido) aviso = `Warning: the server doesn't have a resource type '${res.split('/')[0]}'\n\n`;
  const recurso = x?.recurso ?? res;
  const grupo = x?.grupo ?? '';
  const nsAlvo = x?.kind && !x.kind.namespaced && !x.kind.alias ? null : x?.kind?.alias || x?.kind?.kind === 'Namespace' ? nome || ns : ns;
  const sim = pode(c, u, verbo, recurso, grupo, nsAlvo, nome, extras) || (x?.kind?.kind === 'Namespace' && pode(c, u, verbo, 'projects', 'project.openshift.io', nsAlvo, nome, extras));
  if (f.has('quiet') || f.has('q')) return { code: sim ? 0 : 1 };
  return { err: aviso, out: sim ? 'yes\n' : 'no\n', code: sim ? 0 : 1 };
}

// ------------------------------------------------------ adm policy

const textoAlvos = (nomes) => (nomes.length === 1 ? `"${nomes[0]}"` : `[${nomes.map((n) => `"${n}"`).join(' ')}]`);

function avisaInexistentes(c, tipo, nomes) {
  const kind = tipo === 'User' ? 'User' : tipo === 'Group' ? 'Group' : null;
  if (!kind) return '';
  return nomes.filter((n) => !c.get(kind, n)).map((n) => `Warning: ${kind} '${n}' not found\n`).join('');
}

function politica(ctx, sub, resto) {
  const { pos, f } = parseArgs(resto, ['rolebinding-name']);
  const c = ctx.env.cluster;
  const real = ctx.env.clusterReal;
  const m = sub.match(/^(add|remove)-(cluster-)?role-(?:to|from)-(user|group)$/);
  if (!m) {
    if (sub === 'who-can') return quemPode(ctx, pos, f);
    if (/scc/.test(sub)) throw naoSimulado(ctx, `oc adm policy ${sub}`);
    throw erro(`error: unknown command "${sub}" for "oc adm policy"`);
  }
  const [, acao, deCluster, tipoAlvo] = m;
  const [papel, ...alvos] = pos;
  const contas = lista(f, 'serviceaccount').concat(lista(f, 'z'));
  if (!papel || (!alvos.length && !contas.length)) throw erro(`error: you must specify at least two arguments: <role> <${tipoAlvo}> [${tipoAlvo}]...`);
  const ns = nsDe(ctx, f);
  const tipo = tipoAlvo === 'user' ? 'User' : 'Group';
  const novos = [...alvos.map((n) => ({ apiGroup: RBAC, kind: tipo, name: n })), ...contas.map((n) => ({ kind: 'ServiceAccount', name: n, namespace: ns }))];
  const roleNs = f.one('role-namespace');
  const ref = { apiGroup: RBAC, kind: roleNs ? 'Role' : 'ClusterRole', name: papel };
  if (roleNs && !real.get('Role', papel, roleNs)) throw erro(`Error from server (NotFound): roles.rbac.authorization.k8s.io "${papel}" not found`);
  const bindKind = deCluster ? 'ClusterRoleBinding' : 'RoleBinding';
  const bindNs = deCluster ? undefined : ns;
  const existentes = c.list(bindKind, deCluster ? null : ns).filter((b) => b.roleRef.kind === ref.kind && b.roleRef.name === papel && (!f.has('rolebinding-name') || b.metadata.name === f.one('rolebinding-name')));
  const rotulo = `${ref.kind === 'Role' ? 'role' : 'clusterrole'}.rbac.authorization.k8s.io/${papel}`;
  const nomesAlvo = [...alvos, ...contas];
  const igual = (a, b) => a.kind === b.kind && a.name === b.name && (a.kind !== 'ServiceAccount' || a.namespace === b.namespace);
  if (acao === 'add') {
    const aviso = avisaInexistentes(real, tipo, alvos);
    if (existentes.length) {
      const b = clone(existentes[0]);
      b.subjects = [...(b.subjects || [])];
      for (const s of novos) if (!b.subjects.some((x) => igual(x, s))) b.subjects.push(s);
      c.update(b);
    } else {
      let nome = f.one('rolebinding-name') || papel;
      for (let i = 0; !f.has('rolebinding-name') && real.get(bindKind, nome, bindNs); i++) nome = `${papel}-${i}`;
      c.create({ kind: bindKind, metadata: { name: nome, ...(bindNs ? { namespace: bindNs } : {}) }, roleRef: ref, subjects: novos });
    }
    return { err: aviso, out: `${rotulo} added: ${textoAlvos(nomesAlvo)}\n`, code: 0 };
  }
  let achou = false;
  for (const atual of existentes) {
    const b = clone(atual);
    const antes = (b.subjects || []).length;
    b.subjects = (b.subjects || []).filter((x) => !novos.some((s) => igual(x, s)));
    if (b.subjects.length === antes) continue;
    achou = true;
    if (b.subjects.length) c.update(b);
    else c.delete(bindKind, b.metadata.name, bindNs);
  }
  if (!achou) throw erro(`error: unable to find target [${nomesAlvo.join(' ')}]`);
  return ok(`${rotulo} removed: ${textoAlvos(nomesAlvo)}\n`);
}

function quemPode(ctx, pos, f) {
  const c = ctx.env.clusterReal;
  const [verbo, res, nome] = pos;
  if (!verbo || !res) throw erro('error: you must specify two arguments: verb resource');
  const x = resolveRecurso(res);
  if (!x) throw erro(`error: the server doesn't have a resource type "${res}"`);
  const ns = f.has('all-namespaces') ? null : nsDe(ctx, f);
  const usuarios = new Set();
  const gs = new Set();
  const casa = (r) => (r.verbs || []).some((v) => v === '*' || v === verbo) && (r.apiGroups || []).some((g) => g === '*' || g === x.grupo) && (r.resources || []).some((y) => y === '*' || y === x.recurso) && (!r.resourceNames?.length || r.resourceNames.includes(nome));
  const coleta = (b, nsB) => {
    const papel = b.roleRef.kind === 'ClusterRole' ? c.get('ClusterRole', b.roleRef.name) : c.get('Role', b.roleRef.name, nsB);
    if (!(papel?.rules || []).some(casa)) return;
    for (const s of b.subjects || []) {
      if (s.kind === 'User') usuarios.add(s.name);
      else if (s.kind === 'Group') gs.add(s.name);
      else usuarios.add(`system:serviceaccount:${s.namespace || nsB}:${s.name}`);
    }
  };
  for (const b of c.list('ClusterRoleBinding')) coleta(b);
  if (ns) for (const b of c.list('RoleBinding', ns)) coleta(b, ns);
  const col = (rot, itens) => `${rot.padEnd(8)}${[...itens].sort().join('\n' + ' '.repeat(8)) || '<none>'}\n`;
  return ok(`resourceaccessreviewresponse.authorization.openshift.io/<unknown> \n\n${ns ? `Namespace: ${ns}\n` : ''}Verb:      ${verbo}\nResource:  ${x.grupo ? `${x.recurso}.${x.grupo}` : x.recurso}\n\n${col('Users:', usuarios)}${col('Groups:', gs)}`);
}

// ------------------------------------------------------ adm groups

function gruposCmd(ctx, sub, resto) {
  const { pos } = parseArgs(resto);
  const c = ctx.env.cluster;
  const [nome, ...usuarios] = pos;
  if (sub === 'sync' || sub === 'prune') throw naoSimulado(ctx, `oc adm groups ${sub}`);
  if (!['new', 'add-users', 'remove-users'].includes(sub)) throw erro(`error: unknown command "${sub ?? ''}" for "oc adm groups"`);
  if (!nome) throw erro(`error: you must specify ${sub === 'new' ? 'at least one argument: GROUP [USER]...' : 'at least two arguments: GROUP USER [USER]...'}`);
  if (sub === 'new') {
    c.create({ kind: 'Group', metadata: { name: nome }, users: usuarios });
    return ok(`group.user.openshift.io/${nome} created\n`);
  }
  if (!usuarios.length) throw erro('error: you must specify at least two arguments: GROUP USER [USER]...');
  const g = clone(c.must('Group', nome));
  const antes = g.users || [];
  g.users = sub === 'add-users' ? [...antes, ...usuarios.filter((u) => !antes.includes(u))] : antes.filter((u) => !usuarios.includes(u));
  c.update(g);
  return ok(`group.user.openshift.io/${nome} ${sub === 'add-users' ? 'added' : 'removed'}: ${textoAlvos(usuarios)}\n`);
}

export function admIdentidade(ctx, sub, resto) {
  const [acao, ...args] = resto;
  if (sub === 'policy') {
    if (!acao) throw erro('error: you must specify a subcommand for "oc adm policy"');
    return politica(ctx, acao, args);
  }
  if (sub === 'groups') return gruposCmd(ctx, acao, args);
  return null;
}

export { ApiError };
