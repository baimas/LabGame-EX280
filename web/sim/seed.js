// Estado inicial do cluster: um OpenShift de nó único, como nos laboratórios.
import { TEMPLATES } from './catalogo.js';
import { objetosIniciais, hashSenha } from './rbac.js';
import { kindDoObjeto } from './resources.js';
import { objetosCatalogo } from './olm.js';
import { objetosScc } from './scc.js';

export const VERSAO = '4.18.6';
export const KUBE = 'v1.31.6';

const SISTEMA = 'quay.io/openshift-release-dev/ocp-v4.0-art-dev';

const NAMESPACES = [
  'default', 'kube-system', 'kube-public', 'openshift', 'openshift-apiserver', 'openshift-authentication',
  'openshift-config', 'openshift-console', 'openshift-dns', 'openshift-image-registry', 'openshift-ingress',
  'openshift-marketplace', 'openshift-monitoring', 'openshift-operators',
];

const OPERADORES = [
  'authentication', 'console', 'dns', 'etcd', 'image-registry', 'ingress', 'kube-apiserver',
  'kube-controller-manager', 'kube-scheduler', 'machine-config', 'monitoring', 'network',
  'openshift-apiserver', 'operator-lifecycle-manager', 'storage',
];

const COMPONENTES = [
  ['openshift-ingress', 'router-default', 1],
  ['openshift-console', 'console', 1],
  ['openshift-authentication', 'oauth-openshift', 1],
  ['openshift-apiserver', 'apiserver', 1],
  ['openshift-image-registry', 'image-registry', 1],
  ['openshift-dns', 'dns-operator', 1],
  ['metallb-system', 'metallb-operator-controller-manager', 1],
  ['metallb-system', 'controller', 1],
];

export function seed(c) {
  const agora = c.now;
  c.ocupado = true;
  c.now = agora - 30 * 86400;

  for (const nome of NAMESPACES) c.create({ kind: 'Namespace', metadata: { name: nome, labels: ROTULOS[nome] } });
  for (const o of objetosBase()) c.create(o);
  seedResto(c, agora);
}

// Labels que as network policies usam para liberar o tráfego do roteador e do monitoramento.
const ROTULOS = {
  'openshift-ingress': { 'network.openshift.io/policy-group': 'ingress', 'policy-group.network.openshift.io/ingress': '' },
  'openshift-monitoring': { 'network.openshift.io/policy-group': 'monitoring', 'policy-group.network.openshift.io/monitoring': '' },
};

// Templates, papéis, OAuth e usuários iniciais do laboratório.
function objetosBase() {
  // Usuários do laboratório: admin (cluster-admin) e developer, no provedor HTPasswd `localusers`.
  const htpasswd = `admin:${hashSenha('redhatocp', 'bcrypt', 'Nimbus0AdminSaltLab280')}\ndeveloper:${hashSenha('developer', 'bcrypt', 'Nimbus0DevelSaltLab280')}\n`;
  return [
    ...TEMPLATES.map((t) => JSON.parse(JSON.stringify(t))),
    ...objetosIniciais(htpasswd),
    // Operator do MetalLB instalado, sem pools de endereços configurados.
    { kind: 'Namespace', metadata: { name: 'metallb-system', labels: { 'openshift.io/cluster-monitoring': 'true' } } },
    { kind: 'MetalLB', metadata: { name: 'metallb', namespace: 'metallb-system' }, spec: { logLevel: 'info' } },
    // Configuração dos pedidos de projeto, sem template nem mensagem.
    { apiVersion: 'config.openshift.io/v1', kind: 'Project', metadata: { name: 'cluster' }, spec: {} },
    // Catálogo de operators e o operator group global de openshift-operators.
    ...objetosCatalogo(),
    ...objetosScc(),
    { kind: 'OperatorGroup', metadata: { name: 'global-operators', namespace: 'openshift-operators' }, spec: {} },
  ];
}

// Sessões salvas por versões antigas do jogo: completa o que faltar no cluster.
export function migra(c) {
  for (const [nome, labels] of Object.entries(ROTULOS)) {
    const ns = c.get('Namespace', nome);
    if (ns) ns.metadata.labels = { ...labels, ...ns.metadata.labels };
  }
  for (const o of objetosBase()) {
    if (!c.get(kindDoObjeto(o), o.metadata.name, o.metadata.namespace)) c.create(o);
  }
  c.tick(60);
}

function seedResto(c, agora) {

  c.create({
    kind: 'Node',
    metadata: {
      name: 'master01',
      labels: {
        'kubernetes.io/arch': 'amd64',
        'kubernetes.io/hostname': 'master01',
        'kubernetes.io/os': 'linux',
        'node-role.kubernetes.io/control-plane': '',
        'node-role.kubernetes.io/master': '',
        'node-role.kubernetes.io/worker': '',
        'node.openshift.io/os_id': 'rhcos',
      },
    },
    spec: {},
    status: {
      capacity: { cpu: '8', memory: '32Gi', pods: '250' },
      allocatable: { cpu: '7500m', memory: '31Gi', pods: '250' },
      addresses: [{ type: 'InternalIP', address: '192.168.50.10' }, { type: 'Hostname', address: 'master01' }],
      conditions: [
        { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory' },
        { type: 'DiskPressure', status: 'False', reason: 'KubeletHasNoDiskPressure' },
        { type: 'PIDPressure', status: 'False', reason: 'KubeletHasSufficientPID' },
        { type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' },
      ],
      nodeInfo: { kubeletVersion: KUBE, osImage: 'Red Hat Enterprise Linux CoreOS 418.94 (Plow)', containerRuntimeVersion: 'cri-o://1.31.6', architecture: 'amd64', operatingSystem: 'linux' },
    },
  });

  c.create({
    kind: 'ClusterVersion',
    metadata: { name: 'version' },
    spec: { channel: 'stable-4.18', clusterID: '6f1c2a34-0b5d-4c8e-9a7f-2d3e4b5c6a70' },
    status: {
      desired: { version: VERSAO },
      history: [{ state: 'Completed', version: VERSAO, startedTime: c.iso(), completionTime: c.iso() }],
      conditions: [
        { type: 'Available', status: 'True', lastTransitionTime: c.iso(), message: `Done applying ${VERSAO}` },
        { type: 'Progressing', status: 'False', lastTransitionTime: c.iso(), message: `Cluster version is ${VERSAO}` },
        { type: 'Failing', status: 'False', lastTransitionTime: c.iso() },
      ],
    },
  });

  for (const nome of OPERADORES) {
    c.create({
      kind: 'ClusterOperator',
      metadata: { name: nome },
      spec: {},
      status: {
        versions: [{ name: 'operator', version: VERSAO }],
        conditions: [
          { type: 'Available', status: 'True', lastTransitionTime: c.iso(), reason: 'AsExpected' },
          { type: 'Progressing', status: 'False', lastTransitionTime: c.iso(), reason: 'AsExpected' },
          { type: 'Degraded', status: 'False', lastTransitionTime: c.iso(), reason: 'AsExpected' },
        ],
      },
    });
  }

  for (const [ns, nome, replicas] of COMPONENTES) {
    c.create({
      kind: 'Deployment',
      metadata: { name: nome, namespace: ns, labels: { app: nome } },
      spec: {
        replicas,
        selector: { matchLabels: { app: nome } },
        template: { metadata: { labels: { app: nome } }, spec: { containers: [{ name: nome, image: `${SISTEMA}:${nome}` }] } },
      },
    });
  }

  c.ocupado = false;
  c.reconcile();
  c.now = agora - 30 * 86400 + 60;
  c.reconcile();
  // Os eventos de instalação já expiraram há muito tempo.
  for (const [chave, o] of [...c.objs]) if (o.kind === 'Event') c.objs.delete(chave);
  c.now = agora;
  c.reconcile();
}
