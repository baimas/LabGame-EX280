// Atualização do cluster: canais, grafo de versões, o Cluster Version
// Operator aplicando a versão nova e o admin-ack das APIs removidas.
import { fakeDigest } from './util.js';

export const DURACAO = 300; // segundos simulados de uma atualização
// Ack exigido para sair da 4.21 (Kubernetes 1.34) para a 4.22 (Kubernetes 1.35).
// As APIs depreciadas do laboratório são de um operator fictício da Nimbus:
// o que a prova cobra é o mecanismo, não uma lista de APIs.
const GATE = 'ack-4.21-kube-1.35-api-removals-in-4.22';
const MSG_GATE = 'Kubernetes 1.35 and therefore OpenShift 4.22 remove several APIs which require admin consideration. Please see the knowledge article for details and instructions.';

// Versões por canal e arestas do grafo (de → para).
const V421 = ['4.21.9', '4.21.12'];
const V422 = ['4.22.4', '4.22.6', '4.22.8'];
const CANAIS = {
  'stable-4.21': V421,
  'fast-4.21': [...V421, '4.21.14'],
  'candidate-4.21': [...V421, '4.21.14'],
  'stable-4.22': [...V421, ...V422],
  'eus-4.22': [...V421, ...V422],
  'fast-4.22': [...V421, '4.21.14', ...V422, '4.22.9'],
  'candidate-4.22': [...V421, '4.21.14', ...V422, '4.22.9', '4.22.10'],
  'candidate-5.0': [...V422, '4.22.9', '4.22.10'],
};
const ARESTAS = [
  ['4.21.9', '4.21.12'], ['4.21.9', '4.21.14'], ['4.21.12', '4.21.14'],
  ['4.21.12', '4.22.4'], ['4.21.12', '4.22.6'], ['4.21.14', '4.22.6'],
  ['4.22.4', '4.22.6'], ['4.22.4', '4.22.8'], ['4.22.6', '4.22.8'], ['4.22.4', '4.22.9'], ['4.22.6', '4.22.9'], ['4.22.8', '4.22.9'], ['4.22.8', '4.22.10'], ['4.22.9', '4.22.10'],
];

export const CANAIS_DISPONIVEIS = Object.keys(CANAIS).sort();
export const imagemDa = (v) => `quay.io/openshift-release-dev/ocp-release@${fakeDigest(`ocp-release:${v}`)}`;
export const kubeDa = (v) => (v.startsWith('4.21') ? 'v1.34.6' : 'v1.35.5');
const menor = (v) => v.split('.').slice(0, 2).join('.');
const compara = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

export const versaoAtual = (c) => c.get('ClusterVersion', 'version')?.status?.history?.find((h) => h.state === 'Completed')?.version || '4.22.4';

// Atualizações recomendadas a partir da versão atual, no canal configurado.
export function recomendadas(c) {
  const cv = c.get('ClusterVersion', 'version');
  const atual = versaoAtual(c);
  const canal = CANAIS[cv?.spec?.channel] || [];
  return ARESTAS.filter(([de, para]) => de === atual && canal.includes(para)).map(([, para]) => para).sort((a, b) => compara(b, a));
}

// A atualização de minor está bloqueada até o administrador dar o ack.
export function bloqueio(c, alvo) {
  if (!alvo || menor(alvo) === menor(versaoAtual(c))) return null;
  const acks = c.get('ConfigMap', 'admin-acks', 'openshift-config')?.data || {};
  if (acks[GATE] === 'true') return null;
  return { reason: 'AdminAckRequired', message: MSG_GATE };
}

const cond = (cv, tipo) => cv.status.conditions.find((x) => x.type === tipo);
function poe(cv, tipo, status, extra, c) {
  let x = cond(cv, tipo);
  if (!x) cv.status.conditions.push((x = { type: tipo }));
  if (x.status !== status) x.lastTransitionTime = c.iso();
  Object.assign(x, { status, reason: undefined, message: undefined }, extra);
}

export function updatesCtl(c) {
  const cv = c.get('ClusterVersion', 'version');
  if (!cv) return;
  const atual = versaoAtual(c);
  const st = (c.side.update ??= {});
  const alvo = cv.spec.desiredUpdate?.version;
  const recs = recomendadas(c);
  cv.status.availableUpdates = recs.map((v) => ({ version: v, image: imagemDa(v), channels: Object.keys(CANAIS).filter((k) => CANAIS[k].includes(v)).sort() }));
  const gate = menor(atual) === '4.21' ? bloqueio(c, '4.22.0') : null;
  poe(cv, 'Upgradeable', gate ? 'False' : 'True', gate || {}, c);

  if (st.alvo) {
    const pct = Math.min(100, Math.floor(((c.now - st.inicio) / DURACAO) * 100));
    if (pct >= 100) {
      cv.status.history[0] = { ...cv.status.history[0], state: 'Completed', completionTime: c.iso() };
      for (const co of c.list('ClusterOperator')) co.status.versions = [{ name: 'operator', version: st.alvo }];
      for (const n of c.list('Node')) n.status.nodeInfo.kubeletVersion = kubeDa(st.alvo);
      poe(cv, 'Progressing', 'False', { message: `Cluster version is ${st.alvo}` }, c);
      poe(cv, 'Available', 'True', { message: `Done applying ${st.alvo}` }, c);
      c.event(cv, 'Normal', 'UpgradeComplete', `cluster version upgraded to ${st.alvo}`, 'cluster-version-operator');
      c.side.update = {};
      return;
    }
    const total = 905;
    const feitos = Math.floor((total * pct) / 100);
    const operadores = c.list('ClusterOperator');
    operadores.slice(0, Math.floor((operadores.length * pct) / 100)).forEach((co) => (co.status.versions = [{ name: 'operator', version: st.alvo }]));
    poe(cv, 'Progressing', 'True', { message: `Working towards ${st.alvo}: ${feitos} of ${total} done (${pct}% complete)` }, c);
    return;
  }
  if (!alvo || alvo === atual) {
    poe(cv, 'ReleaseAccepted', 'True', { reason: 'PayloadLoaded', message: `Payload loaded version="${atual}" image="${imagemDa(atual)}" architecture="amd64"` }, c);
    return;
  }
  const g = bloqueio(c, alvo);
  if (g) {
    poe(cv, 'ReleaseAccepted', 'False', { reason: 'PreconditionChecks', message: `Preconditions failed for payload loaded version="${alvo}" image="${imagemDa(alvo)}": Precondition "ClusterVersionUpgradeable" failed because of "${g.reason}": ${g.message}` }, c);
    return;
  }
  poe(cv, 'ReleaseAccepted', 'True', { reason: 'PayloadLoaded', message: `Payload loaded version="${alvo}" image="${imagemDa(alvo)}" architecture="amd64"` }, c);
  Object.assign(st, { alvo, inicio: c.now });
  cv.status.desired = { version: alvo, image: imagemDa(alvo), channels: Object.keys(CANAIS).filter((k) => CANAIS[k].includes(alvo)).sort() };
  cv.status.history.unshift({ state: 'Partial', version: alvo, image: imagemDa(alvo), startedTime: c.iso(), verified: true });
  poe(cv, 'Progressing', 'True', { message: `Working towards ${alvo}: 0 of 905 done (0% complete)` }, c);
}

// Texto do `oc adm upgrade`.
export function resumoUpgrade(c) {
  const cv = c.get('ClusterVersion', 'version');
  let s = '';
  const prog = cond(cv, 'Progressing');
  if (prog?.status === 'True') s += `info: An upgrade is in progress. ${prog.message}\n\n`;
  else s += `Cluster version is ${versaoAtual(c)}\n\n`;
  const up = cond(cv, 'Upgradeable');
  if (up?.status === 'False') s += `Upgradeable=False\n\n  Reason: ${up.reason}\n  Message: ${up.message}\n\n`;
  const aceito = cond(cv, 'ReleaseAccepted');
  if (aceito?.status === 'False') s += `ReleaseAccepted=False\n\n  Reason: ${aceito.reason}\n  Message: ${aceito.message}\n\n`;
  s += 'Upstream is unset, so the cluster will use an appropriate default.\n';
  s += cv.spec.channel ? `Channel: ${cv.spec.channel} (available channels: ${CANAIS_DISPONIVEIS.join(', ')})\n` : 'Channel: \n';
  const recs = recomendadas(c);
  if (!cv.spec.channel) return s + '\nNo updates available. You may still upgrade to a specific release image with --to-image or wait for new updates to be available.\n';
  if (!recs.length) return s + '\nNo updates available. You may still upgrade to a specific release image with --to-image or wait for new updates to be available.\n';
  s += '\nRecommended updates:\n\n';
  const linhas = [['VERSION', 'IMAGE'], ...recs.map((v) => [v, imagemDa(v)])];
  const larg = Math.max(...linhas.map((l) => l[0].length)) + 5;
  return s + linhas.map((l) => `  ${l[0].padEnd(larg)}${l[1]}`).join('\n') + '\n';
}

// Contadores de uso de APIs (`oc get apirequestcounts`).
export function objetosUpdates() {
  const uso = (nome, removida, total, usuarios) => ({
    kind: 'APIRequestCount',
    metadata: { name: nome },
    spec: { numberOfUsersToReport: 10 },
    status: {
      ...(removida ? { removedInRelease: removida } : {}),
      requestCount: total,
      currentHour: { requestCount: Math.floor(total / 24) },
      last24h: [{ requestCount: total, byNode: [{ nodeName: '192.168.50.10', requestCount: total, byUser: usuarios.map(([username, userAgent, n]) => ({ username, userAgent, requestCount: n, byVerb: [{ verb: 'list', requestCount: n }] })) }] }],
    },
  });
  return [
    { kind: 'Namespace', metadata: { name: 'openshift-config-managed' } },
    { kind: 'ConfigMap', metadata: { name: 'admin-acks', namespace: 'openshift-config' }, data: {} },
    { kind: 'ConfigMap', metadata: { name: 'admin-gates', namespace: 'openshift-config-managed' }, data: { [GATE]: MSG_GATE } },
    uso('deployments.v1.apps', null, 4210, [['system:serviceaccount:kube-system:deployment-controller', 'kube-controller-manager/v1.35.5', 4210]]),
    uso('pods.v1', null, 18233, [['system:serviceaccount:kube-system:replicaset-controller', 'kube-controller-manager/v1.35.5', 18233]]),
    uso('reportschedules.v1beta1.reports.nimbus.io', '1.35', 288, [['system:serviceaccount:capacity-tools:report-scheduler', 'report-scheduler/2.3.1', 288]]),
    uso('reportarchives.v1beta1.reports.nimbus.io', '1.35', 0, []),
    uso('reportschedules.v1.reports.nimbus.io', null, 960, [['system:serviceaccount:reports:reports-operator', 'reports-operator/3.0.0', 960]]),
  ];
}
