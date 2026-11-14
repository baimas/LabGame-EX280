// Identidade e autorização: arquivos htpasswd, configuração do OAuth,
// login com criação de User/Identity e avaliação das regras RBAC.
import { b64, hashId, rand } from './util.js';

// ------------------------------------------------------------- senhas

// Hash no formato do htpasswd. Não é bcrypt de verdade: é um resumo
// determinístico com sal, suficiente para o jogo verificar senhas.
export function hashSenha(senha, tipo = 'bcrypt', sal = rand(22)) {
  if (tipo === 'bcrypt') return `$2y$05$${sal.slice(0, 22).padEnd(22, 'x')}${hashId(`${sal}:${senha}`, 31)}`;
  const s = sal.slice(0, 8);
  return `$apr1$${s}$${hashId(`${s}:${senha}`, 22)}`;
}

export function confereSenha(hash, senha) {
  if (hash.startsWith('$2y$') || hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    const sal = hash.slice(7, 29);
    return hash === hashSenha(senha, 'bcrypt', sal);
  }
  if (hash.startsWith('$apr1$')) return hash === hashSenha(senha, 'md5', hash.split('$')[2]);
  return false;
}

export function leHtpasswd(texto) {
  const out = {};
  for (const linha of String(texto || '').split('\n')) {
    const i = linha.indexOf(':');
    if (i > 0) out[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return out;
}

const escreveHtpasswd = (mapa) => Object.entries(mapa).map(([u, h]) => `${u}:${h}\n`).join('');

// ---------------------------------------------------------- htpasswd

export async function htpasswd(ctx) {
  const opc = new Set();
  const pos = [];
  for (const a of ctx.args) {
    if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) opc.add(ch);
    else pos.push(a);
  }
  const uso = 'Usage:\n\thtpasswd [-cimB25dpsDv] [-C cost] [-r rounds] passwordfile username\n\thtpasswd -b[cmB25dpsDv] [-C cost] [-r rounds] passwordfile username password\n\n\thtpasswd -n[imB25dpsv] [-C cost] [-r rounds] username\n\thtpasswd -nb[mB25dpsv] [-C cost] [-r rounds] username password\n -c  Create a new file.\n -n  Don\'t update file; display results on stdout.\n -b  Use the password from the command line rather than prompting for it.\n -B  Force bcrypt hashing of the password (very secure).\n -D  Delete the specified user.\n -v  Verify password for the specified user.\n';
  const tipo = opc.has('B') ? 'bcrypt' : 'md5';
  const semArquivo = opc.has('n');
  const [arq, usuario, senhaArg] = semArquivo ? [null, ...pos] : pos;
  if (!usuario || (opc.has('b') && !opc.has('D') && senhaArg === undefined)) return { err: uso, code: 2 };
  const fs = ctx.env.fs;
  const caminho = arq && fs.resolve(ctx.sh.cwd, arq);
  if (!semArquivo && !opc.has('c') && !fs.isFile(caminho)) return { err: `htpasswd: cannot modify file ${arq}; use '-c' to create it\n`, code: 3 };
  const mapa = !semArquivo && !opc.has('c') ? leHtpasswd(fs.read(caminho)) : {};
  if (opc.has('D')) {
    if (!(usuario in mapa)) return { err: `User ${usuario} not found\n`, code: 0 };
    delete mapa[usuario];
    fs.write(caminho, escreveHtpasswd(mapa));
    return { err: `Deleting password for user ${usuario}\n`, code: 0 };
  }
  let senha = senhaArg;
  if (!opc.has('b')) {
    if (!ctx.env.ask) return { err: 'htpasswd: use -b para informar a senha na linha de comando\n', code: 2 };
    senha = await ctx.env.ask('New password: ', true);
    const confirma = await ctx.env.ask('Re-type new password: ', true);
    if (senha !== confirma) return { err: 'htpasswd: password verification error\n', code: 3 };
  }
  if (opc.has('v')) {
    if (!(usuario in mapa)) return { err: `User ${usuario} not found\n`, code: 6 };
    return confereSenha(mapa[usuario], senha) ? { err: `Password for user ${usuario} correct.\n`, code: 0 } : { err: 'password verification failed\n', code: 3 };
  }
  const linha = hashSenha(senha, tipo);
  if (semArquivo) return { out: `${usuario}:${linha}\n\n`, code: 0 };
  const existia = usuario in mapa;
  mapa[usuario] = linha;
  try {
    fs.write(caminho, escreveHtpasswd(mapa));
  } catch (e) {
    return { err: `htpasswd: cannot create file ${arq}: ${e.message}\n`, code: 1 };
  }
  const msg = opc.has('c') ? `Adding password for user ${usuario}\n` : `${existia ? 'Updating' : 'Adding'} password for user ${usuario}\n`;
  return { err: msg, code: 0 };
}

// --------------------------------------------------------------- OAuth

// Provedores de identidade como estão definidos agora no cluster.
export function configOAuth(c) {
  const oauth = c.get('OAuth', 'cluster');
  return (oauth?.spec?.identityProviders || []).map((idp) => {
    const out = { name: idp.name, type: idp.type, mappingMethod: idp.mappingMethod || 'claim' };
    if (idp.type === 'HTPasswd') {
      const nome = idp.htpasswd?.fileData?.name;
      const s = nome && c.get('Secret', nome, 'openshift-config');
      out.usuarios = s?.data?.htpasswd ? leHtpasswd(b64.dec(s.data.htpasswd)) : null;
      out.erro = !nome ? 'missing fileData.name' : !s ? `secret "${nome}" not found` : !s.data?.htpasswd ? 'secret missing key htpasswd' : null;
    }
    return out;
  });
}

const ESPERA_OAUTH = 45;

// Controller: uma mudança no OAuth ou nos secrets dele reinicia os pods do
// servidor de OAuth, e a configuração nova só vale depois do rollout.
export function oauthCtl(c) {
  const cfg = configOAuth(c);
  const fp = JSON.stringify(cfg);
  const s = (c.side.oauth ??= { ativo: cfg, fp });
  if (fp !== s.fp) {
    s.fp = fp;
    s.pendente = cfg;
    s.em = c.now + ESPERA_OAUTH;
    const d = c.get('Deployment', 'oauth-openshift', 'openshift-authentication');
    if (d) {
      const novo = JSON.parse(JSON.stringify(d));
      ((novo.spec.template.metadata ??= {}).annotations ??= {})['operator.openshift.io/rvs-hash'] = fp.length.toString(36) + c.now.toString(36);
      c.update(novo);
    }
  }
  if (s.pendente && c.now >= s.em) {
    s.ativo = s.pendente;
    s.pendente = null;
  }
  const co = c.get('ClusterOperator', 'authentication');
  if (co) {
    const prog = co.status.conditions.find((x) => x.type === 'Progressing');
    const deg = co.status.conditions.find((x) => x.type === 'Degraded');
    const quebrado = cfg.find((i) => i.erro);
    const emAndamento = Boolean(s.pendente);
    if ((prog.status === 'True') !== emAndamento) Object.assign(prog, { status: emAndamento ? 'True' : 'False', lastTransitionTime: c.iso(), reason: emAndamento ? 'OAuthServerDeployment_NewGeneration' : 'AsExpected', message: emAndamento ? 'OAuthServerDeploymentProgressing: deployment/oauth-openshift.openshift-authentication: 1/1 pods have been updated to the latest generation and 0/1 pods are available' : undefined });
    if ((deg.status === 'True') !== Boolean(quebrado)) Object.assign(deg, { status: quebrado ? 'True' : 'False', lastTransitionTime: c.iso(), reason: quebrado ? 'OAuthServerConfigObservation_Error' : 'AsExpected', message: quebrado ? `OAuthServerConfigObservationDegraded: failed to apply IDP ${quebrado.name} config: ${quebrado.erro}` : undefined });
  }
}

// Confere usuário e senha na configuração em vigor, sem criar nada
// (usado pela correção das missões). Devolve o nome do provedor ou null.
export function credencialValida(c, usuario, senha) {
  if (usuario === 'kubeadmin') {
    const s = c.get('Secret', 'kubeadmin', 'kube-system');
    return s && b64.dec(s.data.kubeadmin) === senha ? 'kube:admin' : null;
  }
  const idp = (c.side.oauth?.ativo || []).find((i) => i.usuarios?.[usuario] && confereSenha(i.usuarios[usuario], senha));
  return idp ? idp.name : null;
}

// Valida usuário e senha e, no primeiro login, cria User e Identity
// (mappingMethod: claim). Devolve { usuario } ou { erro }.
export function autentica(c, usuario, senha) {
  if (usuario === 'kubeadmin') {
    const s = c.get('Secret', 'kubeadmin', 'kube-system');
    return s && b64.dec(s.data.kubeadmin) === senha ? { usuario: 'kube:admin' } : { erro: 'credenciais' };
  }
  const idps = c.side.oauth?.ativo || [];
  const idp = idps.find((i) => i.usuarios?.[usuario] && confereSenha(i.usuarios[usuario], senha));
  if (!idp) return { erro: 'credenciais' };
  const nomeId = `${idp.name}:${usuario}`;
  const ident = c.get('Identity', nomeId);
  if (ident) {
    const u = c.get('User', ident.user.name);
    if (!u || u.metadata.uid !== ident.user.uid) return { erro: 'identidade' };
    return { usuario: u.metadata.name };
  }
  let u = c.get('User', usuario);
  if (u && (u.identities || []).length) return { erro: 'identidade' };
  if (!u) u = c.create({ kind: 'User', metadata: { name: usuario }, identities: [] });
  c.create({ kind: 'Identity', metadata: { name: nomeId }, providerName: idp.name, providerUserName: usuario, user: { name: usuario, uid: u.metadata.uid } });
  u.identities = [...(u.identities || []), nomeId];
  return { usuario };
}

// --------------------------------------------------------------- RBAC

export function grupos(c, usuario) {
  const out = ['system:authenticated'];
  if (usuario.startsWith('system:serviceaccount:')) {
    const ns = usuario.split(':')[2];
    out.push('system:serviceaccounts', `system:serviceaccounts:${ns}`);
  } else if (usuario === 'kube:admin') out.push('system:cluster-admins');
  else if (usuario === 'system:admin') out.push('system:masters');
  else out.push('system:authenticated:oauth');
  for (const g of c.list('Group')) if ((g.users || []).includes(usuario)) out.push(g.metadata.name);
  return out;
}

function sujeitoCasa(s, usuario, gs, nsBinding) {
  if (s.kind === 'User') return s.name === usuario;
  if (s.kind === 'Group') return gs.includes(s.name);
  if (s.kind === 'ServiceAccount') return usuario === `system:serviceaccount:${s.namespace || nsBinding}:${s.name}`;
  return false;
}

// Regras que valem para o usuário: as de cluster e as do namespace `ns`.
export function regras(c, usuario, ns, gruposExtras = []) {
  const gs = [...grupos(c, usuario), ...gruposExtras];
  const papel = (ref, nsRef) => (ref.kind === 'ClusterRole' ? c.get('ClusterRole', ref.name) : c.get('Role', ref.name, nsRef));
  const cluster = [];
  for (const b of c.list('ClusterRoleBinding')) {
    if ((b.subjects || []).some((s) => sujeitoCasa(s, usuario, gs))) cluster.push(...(papel(b.roleRef)?.rules || []));
  }
  const local = [];
  if (ns) {
    for (const b of c.list('RoleBinding', ns)) {
      if ((b.subjects || []).some((s) => sujeitoCasa(s, usuario, gs, ns))) local.push(...(papel(b.roleRef, ns)?.rules || []));
    }
  }
  return { cluster, local };
}

const casaRegra = (r, verbo, recurso, grupo, nome) =>
  (r.verbs || []).some((v) => v === '*' || v === verbo) &&
  (r.apiGroups || []).some((g) => g === '*' || g === grupo) &&
  (r.resources || []).some((x) => x === '*' || x === recurso || (x.endsWith('/*') && recurso.startsWith(x.slice(0, -1)))) &&
  (!r.resourceNames?.length || (nome !== undefined && r.resourceNames.includes(nome)));

export function pode(c, usuario, verbo, recurso, grupo = '', ns = null, nome, gruposExtras = []) {
  const { cluster, local } = regras(c, usuario, ns, gruposExtras);
  return cluster.some((r) => casaRegra(r, verbo, recurso, grupo, nome)) || local.some((r) => casaRegra(r, verbo, recurso, grupo, nome));
}

export const ehAdmin = (c, usuario, gruposExtras = []) => pode(c, usuario, '*', '*', '*', null, undefined, gruposExtras);

// ------------------------------------------------- papéis padrão do cluster

const leitura = ['get', 'list', 'watch'];
const escrita = ['create', 'delete', 'deletecollection', 'get', 'list', 'patch', 'update', 'watch'];

const APLICACAO = [
  { apiGroups: [''], resources: ['pods', 'pods/log', 'services', 'endpoints', 'configmaps', 'persistentvolumeclaims', 'serviceaccounts', 'replicationcontrollers'] },
  { apiGroups: ['apps'], resources: ['deployments', 'deployments/scale', 'replicasets', 'replicasets/scale', 'statefulsets', 'daemonsets'] },
  { apiGroups: ['batch'], resources: ['jobs', 'cronjobs'] },
  { apiGroups: ['route.openshift.io'], resources: ['routes'] },
  { apiGroups: ['template.openshift.io'], resources: ['templates', 'processedtemplates'] },
  { apiGroups: ['image.openshift.io'], resources: ['imagestreams'] },
  { apiGroups: ['networking.k8s.io'], resources: ['networkpolicies', 'ingresses'] },
];

const regrasDe = (base, verbs) => base.map((r) => ({ ...r, verbs }));

const PROJETO_LEITURA = [
  { apiGroups: [''], resources: ['namespaces', 'events', 'resourcequotas', 'limitranges'], verbs: leitura },
  { apiGroups: ['project.openshift.io'], resources: ['projects'], verbs: ['get'] },
  { apiGroups: ['quota.openshift.io'], resources: ['appliedclusterresourcequotas'], verbs: leitura },
];

const PAPEIS = {
  'cluster-admin': [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }, { nonResourceURLs: ['*'], verbs: ['*'] }],
  admin: [
    ...regrasDe(APLICACAO, escrita),
    { apiGroups: [''], resources: ['secrets', 'pods/exec', 'pods/attach', 'pods/portforward'], verbs: escrita },
    { apiGroups: ['rbac.authorization.k8s.io'], resources: ['roles', 'rolebindings'], verbs: escrita },
    { apiGroups: ['project.openshift.io'], resources: ['projects'], verbs: ['delete', 'get', 'patch', 'update'] },
    { apiGroups: ['authorization.k8s.io'], resources: ['localsubjectaccessreviews'], verbs: ['create'] },
    ...PROJETO_LEITURA,
  ],
  edit: [
    ...regrasDe(APLICACAO, escrita),
    { apiGroups: [''], resources: ['secrets', 'pods/exec', 'pods/attach', 'pods/portforward'], verbs: escrita },
    { apiGroups: ['rbac.authorization.k8s.io'], resources: ['roles', 'rolebindings'], verbs: leitura },
    ...PROJETO_LEITURA,
  ],
  view: [...regrasDe(APLICACAO, leitura), ...PROJETO_LEITURA],
  'self-provisioner': [{ apiGroups: ['project.openshift.io'], resources: ['projectrequests'], verbs: ['create'] }],
  'basic-user': [
    { apiGroups: ['user.openshift.io'], resources: ['users'], resourceNames: ['~'], verbs: ['get'] },
    { apiGroups: ['project.openshift.io'], resources: ['projects'], verbs: ['list', 'watch'] },
    { apiGroups: ['authorization.k8s.io'], resources: ['selfsubjectaccessreviews', 'selfsubjectrulesreviews'], verbs: ['create'] },
  ],
  'cluster-reader': [{ apiGroups: ['*'], resources: ['*'], verbs: leitura }],
  'shared-resource-viewer': [{ apiGroups: ['template.openshift.io'], resources: ['templates'], verbs: leitura }, { apiGroups: ['image.openshift.io'], resources: ['imagestreams', 'imagestreamtags'], verbs: leitura }],
};

// Objetos de RBAC e OAuth criados na instalação do cluster.
export function objetosIniciais(htpasswdInicial) {
  const out = Object.entries(PAPEIS).map(([name, rules]) => ({ kind: 'ClusterRole', metadata: { name, annotations: { 'rbac.authorization.kubernetes.io/autoupdate': 'true' } }, rules }));
  const crb = (name, role, subjects) => ({ kind: 'ClusterRoleBinding', metadata: { name, annotations: { 'rbac.authorization.kubernetes.io/autoupdate': 'true' } }, roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: role }, subjects });
  const grupo = (name) => ({ apiGroup: 'rbac.authorization.k8s.io', kind: 'Group', name });
  out.push(
    crb('cluster-admin', 'cluster-admin', [grupo('system:masters')]),
    crb('cluster-admins', 'cluster-admin', [grupo('system:cluster-admins'), { apiGroup: 'rbac.authorization.k8s.io', kind: 'User', name: 'system:admin' }]),
    crb('cluster-admin-0', 'cluster-admin', [{ apiGroup: 'rbac.authorization.k8s.io', kind: 'User', name: 'admin' }]),
    crb('self-provisioners', 'self-provisioner', [grupo('system:authenticated:oauth')]),
    crb('basic-users', 'basic-user', [grupo('system:authenticated')]),
    { kind: 'RoleBinding', metadata: { name: 'shared-resource-viewers', namespace: 'openshift' }, roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'shared-resource-viewer' }, subjects: [grupo('system:authenticated')] },
    { kind: 'Secret', metadata: { name: 'localusers', namespace: 'openshift-config' }, type: 'Opaque', data: { htpasswd: b64.enc(htpasswdInicial) } },
    { kind: 'Secret', metadata: { name: 'kubeadmin', namespace: 'kube-system' }, type: 'Opaque', data: { kubeadmin: b64.enc('Xp4Tn-dYqWm-8kRzL-vB3sE') } },
    { kind: 'OAuth', metadata: { name: 'cluster', annotations: { 'include.release.openshift.io/self-managed-high-availability': 'true' } }, spec: { identityProviders: [{ name: 'localusers', mappingMethod: 'claim', type: 'HTPasswd', htpasswd: { fileData: { name: 'localusers' } } }] } },
  );
  return out;
}

export const KUBEADMIN_SENHA = 'Xp4Tn-dYqWm-8kRzL-vB3sE';
