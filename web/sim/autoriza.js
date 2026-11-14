// Aplica o RBAC às operações feitas em nome do usuário logado: o oc e o
// helm enxergam o cluster por meio deste filtro.
import { ApiError } from './cluster.js';
import { kindOf } from './resources.js';
import { pode, ehAdmin } from './rbac.js';

function negado(usuario, verbo, k, ns, nome) {
  const recurso = k.group ? `${k.plural}.${k.group}` : k.plural;
  const alvo = nome !== undefined && verbo !== 'list' && verbo !== 'create' ? `${recurso} "${nome}"` : recurso;
  const onde = ns ? `in the namespace "${ns}"` : 'at the cluster scope';
  return new ApiError(`Error from server (Forbidden): ${alvo} is forbidden: User "${usuario}" cannot ${verbo} resource "${k.plural}" in API group "${k.group}" ${onde}`, 'Forbidden');
}

// Namespaces são vistos como projetos: o acesso vem dos bindings do próprio projeto.
const nsDoAlvo = (k, ns, nome) => (k.kind === 'Namespace' || k.kind === 'Project' ? nome : k.namespaced ? ns || 'default' : null);

export function clusterDoUsuario(c, usuario, gruposExtras = []) {
  if (ehAdmin(c, usuario, gruposExtras)) return c;
  const permite = (verbo, k, ns, nome) => {
    if (k.kind === 'Namespace' || k.kind === 'Project') {
      if (verbo === 'list') return true;
      return pode(c, usuario, verbo, 'namespaces', '', nome, nome, gruposExtras) || pode(c, usuario, verbo, 'projects', 'project.openshift.io', nome, nome, gruposExtras);
    }
    return pode(c, usuario, verbo, k.plural, k.group, nsDoAlvo(k, ns, nome), nome, gruposExtras);
  };
  const checa = (verbo, kind, ns, nome) => {
    const k = kindOf(kind);
    if (k && !permite(verbo, k, ns, nome)) throw negado(usuario, verbo, k.alias ? kindOf('Project') : k, k.kind === 'Namespace' || k.kind === 'Project' ? nome : k.namespaced ? ns || 'default' : null, nome);
  };
  return new Proxy(c, {
    get(alvo, prop) {
      if (prop === 'get' || prop === 'must') {
        return (kind, nome, ns) => {
          checa('get', kind, ns, nome);
          return alvo[prop](kind, nome, ns);
        };
      }
      if (prop === 'list') {
        return (kind, ns = null) => {
          const k = kindOf(kind);
          // Projetos: cada usuário vê só aqueles em que tem acesso.
          if (k && (k.kind === 'Project' || k.kind === 'Namespace')) {
            if (k.kind === 'Namespace' && !pode(c, usuario, 'list', 'namespaces', '', null, undefined, gruposExtras)) throw negado(usuario, 'list', k, null);
            return alvo.list(kind, ns).filter((n) => permite('get', k, null, n.metadata.name));
          }
          if (k && !(ns === null ? pode(c, usuario, 'list', k.plural, k.group, null, undefined, gruposExtras) : permite('list', k, ns))) throw negado(usuario, 'list', k, k.namespaced ? ns : null);
          return alvo.list(kind, ns);
        };
      }
      if (prop === 'create' || prop === 'update') {
        return (o) => {
          checa(prop, o.kind, o.metadata?.namespace, o.metadata?.name);
          return alvo[prop](o);
        };
      }
      if (prop === 'delete') {
        return (kind, nome, ns) => {
          checa('delete', kind, ns, nome);
          return alvo.delete(kind, nome, ns);
        };
      }
      const v = alvo[prop];
      return typeof v === 'function' ? v.bind(alvo) : v;
    },
    set(alvo, prop, valor) {
      alvo[prop] = valor;
      return true;
    },
  });
}

// Confere uma permissão pontual (subrecursos como pods/log e pods/exec).
export function exige(ctx, verbo, recurso, grupo, ns, nome) {
  const c = ctx.env.clusterReal || ctx.env.cluster;
  const u = ctx.env.usuario || ctx.env.session.user;
  if (pode(c, u, verbo, recurso, grupo, ns, nome, ctx.env.gruposExtras || [])) return;
  const [base, sub] = recurso.split('/');
  throw new ApiError(`Error from server (Forbidden): ${base}${grupo ? '.' + grupo : ''} "${nome}" is forbidden: User "${u}" cannot ${verbo} resource "${base}/${sub}" in API group "${grupo}" in the namespace "${ns}"`, 'Forbidden');
}

// Contexto de execução de um comando em nome do usuário (ou de quem ele personifica com --as).
export function comUsuario(ctx, usuario, gruposExtras = []) {
  const real = ctx.env.clusterReal || ctx.env.cluster;
  const env = Object.assign(Object.create(ctx.env), { cluster: clusterDoUsuario(real, usuario, gruposExtras), clusterReal: real, usuario, gruposExtras });
  return { ...ctx, env };
}
