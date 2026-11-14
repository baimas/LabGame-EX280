// Security context constraints: qual SCC admite cada pod, e com que UID ele roda.
import { ApiError } from './cluster.js';
import { pode } from './rbac.js';
import { findImage } from './images.js';
import { hashNum } from './util.js';

const RBAC = 'rbac.authorization.k8s.io';
const ANOT = 'openshift.io/scc';

// UID atribuído pelo OpenShift ao projeto (faixa por namespace).
export function uidDoProjeto(ns) {
  return 1000000000 + (hashNum(ns) % 900 + 50) * 10000;
}

const scc = (nome, extra) => ({
  kind: 'SecurityContextConstraints',
  metadata: { name: nome, annotations: { 'kubernetes.io/description': extra.desc } },
  allowPrivilegedContainer: false,
  allowHostNetwork: false,
  allowHostPorts: false,
  allowHostDirVolumePlugin: false,
  priority: null,
  readOnlyRootFilesystem: false,
  requiredDropCapabilities: ['ALL'],
  runAsUser: { type: 'MustRunAsRange' },
  seLinuxContext: { type: 'MustRunAs' },
  fsGroup: { type: 'MustRunAs' },
  supplementalGroups: { type: 'RunAsAny' },
  users: [],
  groups: [],
  volumes: ['configMap', 'csi', 'downwardAPI', 'emptyDir', 'ephemeral', 'persistentVolumeClaim', 'projected', 'secret'],
  ...extra.campos,
});

// SCCs da instalação, na ordem em que o admission controller as tenta
// (maior prioridade primeiro, depois a mais restritiva).
export const SCCS = [
  scc('anyuid', { desc: 'anyuid provides all features of the restricted SCC but allows users to run with any UID and any GID.', campos: { priority: 10, runAsUser: { type: 'RunAsAny' }, fsGroup: { type: 'RunAsAny' }, requiredDropCapabilities: ['MKNOD'] } }),
  scc('restricted-v2', { desc: 'restricted-v2 denies access to all host features and requires pods to be run with a UID, and SELinux context that are allocated to the namespace.' }),
  scc('nonroot-v2', { desc: 'nonroot provides all features of the restricted SCC but allows users to run with any non-root UID.', campos: { runAsUser: { type: 'MustRunAsNonRoot' }, fsGroup: { type: 'RunAsAny' } } }),
  scc('hostnetwork-v2', { desc: 'hostnetwork allows using host networking and host ports but still requires pods to be run with a UID and SELinux context that are allocated to the namespace.', campos: { allowHostNetwork: true, allowHostPorts: true } }),
  scc('privileged', { desc: 'privileged allows access to all privileged and host features and the ability to run as any user, any group, any fsGroup, and with any SELinux context.', campos: { allowPrivilegedContainer: true, allowHostNetwork: true, allowHostPorts: true, allowHostDirVolumePlugin: true, runAsUser: { type: 'RunAsAny' }, seLinuxContext: { type: 'RunAsAny' }, fsGroup: { type: 'RunAsAny' }, requiredDropCapabilities: null, users: ['system:admin'], groups: ['system:cluster-admins', 'system:nodes', 'system:masters'], volumes: ['*'] } }),
];

export const papelDaScc = (nome) => `system:openshift:scc:${nome}`;

// SCCs, os papéis que dão `use` em cada uma e o restricted-v2 para todos.
export function objetosScc() {
  const out = [];
  for (const s of SCCS) {
    out.push(s);
    out.push({ kind: 'ClusterRole', metadata: { name: papelDaScc(s.metadata.name) }, rules: [{ apiGroups: ['security.openshift.io'], resources: ['securitycontextconstraints'], resourceNames: [s.metadata.name], verbs: ['use'] }] });
  }
  out.push({ kind: 'ClusterRoleBinding', metadata: { name: papelDaScc('restricted-v2') }, roleRef: { apiGroup: RBAC, kind: 'ClusterRole', name: papelDaScc('restricted-v2') }, subjects: [{ apiGroup: RBAC, kind: 'Group', name: 'system:authenticated' }] });
  return out;
}

const SISTEMA = /^(openshift(-.*)?|kube-.*|default|metallb-system)$/;
const usuarioDaSa = (pod) => `system:serviceaccount:${pod.metadata.namespace}:${pod.spec.serviceAccountName || 'default'}`;

function usavel(c, s, usuario, ns) {
  const nome = s.metadata.name;
  if ((s.users || []).includes(usuario)) return true;
  return pode(c, usuario, 'use', 'securitycontextconstraints', 'security.openshift.io', ns, nome);
}

// UIDs pedidos explicitamente no pod: [{caminho, uid}].
function uidsPedidos(pod) {
  const out = [];
  const nivelPod = pod.spec.securityContext?.runAsUser;
  (pod.spec.containers || []).forEach((ct, i) => {
    const uid = ct.securityContext?.runAsUser ?? nivelPod;
    if (uid !== undefined) out.push({ caminho: `.containers[${i}].runAsUser`, uid: Number(uid) });
  });
  return out;
}

// Erros de validação do pod contra uma SCC (lista vazia = admite).
function valida(s, pod) {
  const erros = [];
  const base = uidDoProjeto(pod.metadata.namespace);
  if (pod.spec.hostNetwork && !s.allowHostNetwork) erros.push('.spec.securityContext.hostNetwork: Invalid value: true: Host network is not allowed to be used');
  (pod.spec.containers || []).forEach((ct, i) => {
    if (ct.securityContext?.privileged && !s.allowPrivilegedContainer) erros.push(`.containers[${i}].privileged: Invalid value: true: Privileged containers are not allowed`);
  });
  for (const { caminho, uid } of uidsPedidos(pod)) {
    if (s.runAsUser.type === 'MustRunAsRange' && (uid < base || uid > base + 9999)) erros.push(`${caminho}: Invalid value: ${uid}: must be in the ranges: [${base}, ${base + 9999}]`);
    if (s.runAsUser.type === 'MustRunAsNonRoot' && uid === 0) erros.push(`${caminho}: Invalid value: 0: running with the root UID is forbidden`);
  }
  return erros;
}

// Escolhe a SCC para o pod e devolve {scc} ou {motivos}.
export function escolheScc(c, pod, usuario = usuarioDaSa(pod)) {
  const motivos = [];
  const lista = c.list('SecurityContextConstraints').sort((a, b) => (b.priority || 0) - (a.priority || 0) || ordem(a) - ordem(b));
  for (const s of lista) {
    const nome = s.metadata.name;
    if (!usavel(c, s, usuario, pod.metadata.namespace)) {
      motivos.push(`provider "${nome}": Forbidden: not usable by user or serviceaccount`);
      continue;
    }
    const erros = valida(s, pod);
    if (!erros.length) return { scc: nome };
    motivos.push(`provider ${nome}: ${erros.join(', ')}`);
  }
  return { motivos };
}

const ORDEM = SCCS.map((s) => s.metadata.name);
const ordem = (s) => (ORDEM.includes(s.metadata.name) ? ORDEM.indexOf(s.metadata.name) : 50);

// Admissão de pods nos projetos de aplicação.
export function admiteScc(c, pod) {
  const ns = pod.metadata.namespace;
  if (SISTEMA.test(ns) || pod.metadata.annotations?.[ANOT]) return;
  const sa = pod.spec.serviceAccountName || 'default';
  const proibido = (msg) => new ApiError(`Error from server (Forbidden): pods "${pod.metadata.name}" is forbidden: ${msg}`, 'Forbidden');
  if (!c.get('ServiceAccount', sa, ns)) throw proibido(`error looking up service account ${ns}/${sa}: serviceaccount "${sa}" not found`);
  const r = escolheScc(c, pod);
  if (!r.scc) throw proibido(`unable to validate against any security context constraint: [${r.motivos.join(', ')}]`);
  pod.metadata.annotations = { ...(pod.metadata.annotations || {}), [ANOT]: r.scc, 'openshift.io/scc': r.scc };
}

// UID com que o contêiner roda de fato.
export function uidEfetivo(pod, ct) {
  const pedido = ct?.securityContext?.runAsUser ?? pod.spec.securityContext?.runAsUser;
  if (pedido !== undefined) return Number(pedido);
  const s = pod.metadata.annotations?.[ANOT];
  if (s === 'anyuid' || s === 'privileged' || SISTEMA.test(pod.metadata.namespace)) {
    const img = findImage(ct?.image || '');
    return Number(img.image?.user ?? 0) || 0;
  }
  return uidDoProjeto(pod.metadata.namespace);
}
