import { REGISTRY } from '../../engine/world.js';

const NS = 'queue';

const doRs = (w, p) => (p.metadata.ownerReferences || []).some((r) => r.kind === 'ReplicaSet' && r.name === 'worker');

export default {
  id: 'c2-replicasets',
  minutes: 15,
  xp: 160,
  difficulty: 2,
  objectives: ['Trabalhar com replica sets', 'Trabalhar com labels e selectors', 'Configurar services'],
  title: { pt: 'Um pod em quarentena', en: 'A pod in quarantine' },
  story: {
    pt: 'O processador de filas roda como um replica set antigo, sem deployment. Um dos pods anda processando mensagens em dobro e o time quer investigá-lo vivo, mas sem perder capacidade: o replica set precisa repor o pod isolado.',
    en: 'The queue processor runs as an old replica set, with no deployment. One of the pods has been processing messages twice and the team wants to inspect it alive, without losing capacity: the replica set must replace the isolated pod.',
  },
  tasks: {
    pt: [
      'Trabalhe no projeto `queue`, no replica set `worker`.',
      'Escale o replica set `worker` para 4 réplicas.',
      'Escolha um pod do replica set e tire-o do controle dele trocando o label `app` do pod para `worker-debug`. Não apague o pod.',
      'Grave em `~/queue/debug-pod.txt` o nome do pod isolado.',
      'O replica set deve continuar com 4 pods prontos.',
      'Crie o service `worker`, porta 8080, que alcance apenas os pods do replica set (não o pod isolado).',
    ],
    en: [
      'Work in the `queue` project, on the `worker` replica set.',
      'Scale the `worker` replica set to 4 replicas.',
      'Pick a pod of the replica set and take it out of its control by changing the pod `app` label to `worker-debug`. Do not delete the pod.',
      'Write the name of the isolated pod to `~/queue/debug-pod.txt`.',
      'The replica set must keep 4 ready pods.',
      'Create the `worker` service, port 8080, reaching only the replica set pods (not the isolated pod).',
    ],
  },
  hints: [
    { pt: '`oc scale` funciona com replica sets: `oc scale rs/worker --replicas 4`.', en: '`oc scale` works with replica sets: `oc scale rs/worker --replicas 4`.' },
    { pt: 'O replica set controla os pods pelo seletor. `oc label pod NOME app=worker-debug --overwrite` faz o pod deixar de casar, e o replica set cria outro no lugar.', en: 'The replica set controls pods through its selector. `oc label pod NAME app=worker-debug --overwrite` makes the pod stop matching, and the replica set creates another one.' },
    { pt: '`oc expose rs/worker --port 8080` cria um service com o mesmo seletor do replica set. Confira com `oc get endpoints worker`.', en: '`oc expose rs/worker --port 8080` creates a service with the replica set selector. Check with `oc get endpoints worker`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create({
      kind: 'ReplicaSet',
      metadata: { name: 'worker', namespace: NS, labels: { app: 'worker' } },
      spec: { replicas: 3, selector: { matchLabels: { app: 'worker' } }, template: { metadata: { labels: { app: 'worker', tier: 'queue' } }, spec: { containers: [{ name: 'worker', image: `${REGISTRY}/nimbus/reports:4.1`, ports: [{ containerPort: 8080 }] }] } } },
    });
    w.fs.mkdir('/home/student/queue', true);
  },
  checks: [
    {
      text: { pt: 'O replica set worker tem 4 réplicas prontas', en: 'The worker replica set has 4 ready replicas' },
      test: (w) => {
        const rs = w.get('ReplicaSet', 'worker', NS);
        return rs.spec.replicas === 4 && w.pods(NS).filter((p) => doRs(w, p) && w.podPronto(p)).length === 4;
      },
    },
    {
      text: { pt: 'Existe um pod isolado com app=worker-debug, fora do replica set e em execução', en: 'There is one isolated pod labeled app=worker-debug, outside the replica set and running' },
      test: (w) => {
        const isolados = w.pods(NS, { app: 'worker-debug' });
        return isolados.length === 1 && !doRs(w, isolados[0]) && isolados[0].status.phase === 'Running';
      },
    },
    {
      text: { pt: 'debug-pod.txt tem o nome do pod isolado', en: 'debug-pod.txt holds the name of the isolated pod' },
      test: (w) => w.file('queue/debug-pod.txt') === w.pods(NS, { app: 'worker-debug' })[0]?.metadata.name,
    },
    {
      text: { pt: 'O service worker alcança os 4 pods do replica set e não o pod isolado', en: 'The worker service reaches the 4 replica set pods and not the isolated pod' },
      test: (w) => {
        const ep = w.get('Endpoints', 'worker', NS);
        const ips = (ep?.subsets || []).flatMap((s) => (s.addresses || []).map((a) => a.targetRef.name));
        const isolado = w.pods(NS, { app: 'worker-debug' })[0]?.metadata.name;
        return w.get('Service', 'worker', NS).spec.ports[0].port === 8080 && ips.length === 4 && !ips.includes(isolado);
      },
    },
  ],
  solution: [
    { cmd: 'oc project queue', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get rs worker -o wide', pt: 'O seletor do replica set é `app=worker`.', en: 'The replica set selector is `app=worker`.' },
    { cmd: 'oc scale rs/worker --replicas 4', pt: 'Escala direto no replica set, já que não há deployment.', en: 'Scales the replica set directly, since there is no deployment.' },
    { cmd: "POD=$(oc get pods -l app=worker -o jsonpath='{.items[0].metadata.name}')", pt: 'Guarda o nome de um dos pods numa variável.', en: 'Stores the name of one pod in a variable.' },
    { cmd: 'oc label pod $POD app=worker-debug --overwrite', pt: 'O pod deixa de casar com o seletor e o replica set o solta.', en: 'The pod stops matching the selector and the replica set releases it.' },
    { cmd: 'echo $POD > ~/queue/debug-pod.txt', pt: 'Registra o pod isolado.', en: 'Records the isolated pod.' },
    { cmd: 'oc get pods --show-labels', pt: 'O replica set já criou um pod novo para manter as 4 réplicas.', en: 'The replica set has already created a new pod to keep 4 replicas.' },
    { cmd: 'oc expose rs/worker --port 8080', pt: 'O service herda o seletor `app=worker`, que não inclui o pod isolado.', en: 'The service inherits the `app=worker` selector, which leaves the isolated pod out.' },
    { cmd: 'sleep 5; oc get endpoints worker', pt: 'Confere os 4 endereços do service.', en: 'Checks the 4 service addresses.' },
  ],
};
