import { deployment } from '../../engine/world.js';
import { destinoTcp } from '../../sim/net.js';
import { ROTULO_UDN, ANOT_STATUS } from '../../sim/redes.js';

const NS = 'tenant-blue';
const SUBREDE = '10.100.0.0/16';
const MANIFESTO = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: registry.lab.example.com:8443/nimbus/portal:1.1
          ports:
            - containerPort: 8080
`;

// IP do pod na interface da rede de usuário (ovn-udn1), ou null.
function ipUdn(p) {
  try {
    return JSON.parse(p.metadata.annotations?.[ANOT_STATUS] || '[]').find((x) => x.interface === 'ovn-udn1')?.ips?.[0] || null;
  } catch {
    return null;
  }
}

export default {
  id: 'c5-udn',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Configurar componentes de rede', 'Solucionar problemas de rede definida por software (SDN)'],
  title: { pt: 'Cada cliente na sua rede', en: 'Every customer on its own network' },
  story: {
    pt: 'O cliente Blue assinou um contrato que exige isolamento de rede: nenhum pod de outro projeto pode alcançar os pods dele, e não queremos depender de network policies para isso. A Plataforma decidiu usar uma rede primária definida pelo usuário (UDN). O projeto do cliente já existe, criado às pressas.',
    en: 'Customer Blue signed a contract that requires network isolation: no pod from another project may reach its pods, and we do not want to rely on network policies for that. The Platform team decided to use a primary user-defined network (UDN). The customer project already exists, created in a hurry.',
  },
  tasks: {
    pt: [
      `O projeto \`tenant-blue\` deve usar como rede primária o UserDefinedNetwork \`blue-net\`, de topologia Layer2, com a sub-rede \`${SUBREDE}\`.`,
      'O deployment `api` (manifesto em `~/tenant-blue/api.yaml`) deve rodar no projeto com 2 réplicas prontas, com IPs da rede `blue-net`.',
      'Pods de outros projetos, como o `probe` do projeto `shared-tools`, não podem alcançar os pods do `api`.',
    ],
    en: [
      `The \`tenant-blue\` project must use as its primary network the \`blue-net\` UserDefinedNetwork, with Layer2 topology and the \`${SUBREDE}\` subnet.`,
      'The `api` deployment (manifest in `~/tenant-blue/api.yaml`) must run in the project with 2 ready replicas, with IPs from the `blue-net` network.',
      'Pods from other projects, such as `probe` in the `shared-tools` project, must not reach the `api` pods.',
    ],
  },
  hints: [
    { pt: `Um namespace só usa UDN primário se tiver o rótulo \`${ROTULO_UDN}\`, e esse rótulo só pode ser posto na criação do namespace.`, en: `A namespace only uses a primary UDN if it has the \`${ROTULO_UDN}\` label, and that label can only be set when the namespace is created.` },
    { pt: 'O UserDefinedNetwork é do grupo `k8s.ovn.org/v1`, com `spec.topology: Layer2` e `spec.layer2.role: Primary` e `subnets`. `oc explain userdefinednetwork.spec.layer2` ajuda.', en: 'The UserDefinedNetwork belongs to `k8s.ovn.org/v1`, with `spec.topology: Layer2` plus `spec.layer2.role: Primary` and `subnets`. `oc explain userdefinednetwork.spec.layer2` helps.' },
    { pt: 'O IP da rede de usuário aparece na anotação `k8s.v1.cni.cncf.io/network-status`, na interface `ovn-udn1`.', en: 'The user-defined network IP shows up in the `k8s.v1.cni.cncf.io/network-status` annotation, on the `ovn-udn1` interface.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    const d = deployment('api', NS, 'nimbus/portal:1.1', { replicas: 2 });
    c.create(d);
    c.create({ kind: 'Namespace', metadata: { name: 'shared-tools' } });
    c.create(deployment('probe', 'shared-tools', 'nimbus/portal:1.0'));
    w.fs.mkdir('/home/student/tenant-blue', true);
    w.fs.write('/home/student/tenant-blue/api.yaml', MANIFESTO);
  },
  checks: [
    {
      text: { pt: 'tenant-blue tem o rótulo e o UDN blue-net Layer2 primário', en: 'tenant-blue has the label and the primary Layer2 blue-net UDN' },
      test: (w) => {
        const ns = w.get('Namespace', NS);
        const u = w.get('UserDefinedNetwork', 'blue-net', NS);
        return ns?.metadata.labels?.[ROTULO_UDN] !== undefined && u?.spec?.topology === 'Layer2' && u.spec.layer2?.role === 'Primary' && (u.spec.layer2.subnets || []).includes(SUBREDE) && (u.status?.conditions || []).some((x) => x.type === 'NetworkCreated' && x.status === 'True');
      },
    },
    {
      text: { pt: 'api roda com 2 réplicas na rede blue-net', en: 'api runs with 2 replicas on the blue-net network' },
      test: (w) => w.ready('api', NS) && w.get('Deployment', 'api', NS).spec.replicas === 2 && w.pods(NS, { app: 'api' }).every((p) => (ipUdn(p) || '').startsWith('10.100.')),
    },
    {
      text: { pt: 'O probe de shared-tools não alcança os pods do api', en: 'The shared-tools probe cannot reach the api pods' },
      test: (w) => {
        const probe = w.pods('shared-tools', { app: 'probe' }).find(w.podPronto);
        const alvos = w.pods(NS, { app: 'api' });
        return Boolean(probe) && alvos.length > 0 && alvos.every((p) => [ipUdn(p), p.status.podIP].filter(Boolean).every((ip) => destinoTcp(w.cluster, probe, ip, 8080).erro));
      },
    },
  ],
  solution: [
    { cmd: 'oc get namespace tenant-blue --show-labels', pt: 'O projeto não tem o rótulo de UDN.', en: 'The project lacks the UDN label.' },
    { cmd: 'oc label namespace tenant-blue k8s.ovn.org/primary-user-defined-network=', pt: 'Recusado: o rótulo só vale na criação do namespace.', en: 'Refused: the label only works when the namespace is created.', falha: true },
    { cmd: 'oc delete project tenant-blue', pt: 'O jeito é recriar o projeto.', en: 'The way out is to recreate the project.' },
    { cmd: `cat > ~/tenant-blue/rede.yaml <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: tenant-blue
  labels:
    k8s.ovn.org/primary-user-defined-network: ""
---
apiVersion: k8s.ovn.org/v1
kind: UserDefinedNetwork
metadata:
  name: blue-net
  namespace: tenant-blue
spec:
  topology: Layer2
  layer2:
    role: Primary
    subnets:
      - ${SUBREDE}
    ipam:
      lifecycle: Persistent
EOF`, pt: 'Namespace com o rótulo e o UDN, num arquivo só.', en: 'Namespace with the label and the UDN, in a single file.' },
    { cmd: 'oc create -f ~/tenant-blue/rede.yaml', pt: 'Cria os dois, nessa ordem.', en: 'Creates both, in that order.' },
    { cmd: 'oc get udn blue-net -n tenant-blue -o jsonpath=\'{.status.conditions[0].message}\'', pt: 'O NAD da rede foi criado.', en: 'The network NAD was created.' },
    { cmd: 'oc apply -f ~/tenant-blue/api.yaml -n tenant-blue', pt: 'Recria a aplicação.', en: 'Recreates the application.' },
    { cmd: 'sleep 15; oc get pods -n tenant-blue', pt: 'Os dois pods rodando.', en: 'Both pods running.' },
    { cmd: "oc get pod -l app=api -n tenant-blue -o jsonpath='{.items[0].metadata.annotations.k8s\\.v1\\.cni\\.cncf\\.io/network-status}'", pt: 'A interface `ovn-udn1` com IP da `blue-net`.', en: 'The `ovn-udn1` interface with a `blue-net` IP.' },
  ],
};
