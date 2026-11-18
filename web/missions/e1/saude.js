import { deployment } from '../../engine/world.js';

const NS = 'analytics';

export default {
  id: 'e1-saude',
  minutes: 15,
  xp: 160,
  difficulty: 2,
  objectives: ['Monitorar e avaliar a saúde do cluster', 'Inspecionar recursos do Kubernetes pela CLI e pela interface web'],
  title: { pt: 'Segunda de manhã', en: 'Monday morning' },
  startNamespace: 'default',
  story: {
    pt: 'Segunda de manhã, e o painel do NOC está amarelo. Antes da reunião das 9h, o gerente quer três respostas objetivas: qual componente do cluster está com problema, quem está comendo memória no projeto de analytics e por que um dos serviços de lá não sobe.',
    en: 'Monday morning, and the NOC dashboard is yellow. Before the 9 a.m. meeting, the manager wants three straight answers: which cluster component has a problem, who is eating memory in the analytics project, and why one of the services there does not start.',
  },
  tasks: {
    pt: [
      'O diretório `~/health` já existe.',
      'Grave em `~/health/degraded.txt` o nome do cluster operator que está `Degraded`.',
      'Grave em `~/health/top-memory.txt` o nome do pod do projeto `analytics` que mais usa memória agora.',
      'Grave em `~/health/warning.txt` o `REASON` do evento de aviso (`Warning`) do projeto `analytics`.',
    ],
    en: [
      'The `~/health` directory already exists.',
      'Write to `~/health/degraded.txt` the name of the cluster operator that is `Degraded`.',
      'Write to `~/health/top-memory.txt` the name of the `analytics` project pod that uses the most memory right now.',
      'Write to `~/health/warning.txt` the `REASON` of the warning (`Warning`) event in the `analytics` project.',
    ],
  },
  hints: [
    { pt: '`oc get clusteroperators` mostra as colunas AVAILABLE, PROGRESSING e DEGRADED.', en: '`oc get clusteroperators` shows the AVAILABLE, PROGRESSING, and DEGRADED columns.' },
    { pt: '`oc adm top pods -n analytics --sort-by memory` ordena pelo consumo de memória.', en: '`oc adm top pods -n analytics --sort-by memory` sorts by memory usage.' },
    { pt: '`oc get events -n analytics --field-selector type=Warning` mostra só os avisos.', en: '`oc get events -n analytics --field-selector type=Warning` shows only warnings.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('dashboard', NS, 'nimbus/portal:2.0'));
    c.create(deployment('aggregator', NS, 'nimbus/report-builder:2.0'));
    c.create(deployment('etl', NS, 'nimbus/inventory:3.3', { extra: { container: { resources: { requests: { cpu: '24' } } } } }));
    const co = c.get('ClusterOperator', 'image-registry');
    for (const x of co.status.conditions) {
      if (x.type === 'Degraded') Object.assign(x, { status: 'True', reason: 'ImagePrunerJobFailed', message: 'ImagePrunerDegraded: Job has reached the specified backoff limit' });
    }
    w.fs.mkdir('/home/student/health', true);
  },
  checks: [
    { text: { pt: 'degraded.txt aponta o operator degradado', en: 'degraded.txt names the degraded operator' }, test: (w) => w.file('health/degraded.txt') === 'image-registry' },
    {
      text: { pt: 'top-memory.txt tem o pod que mais usa memória', en: 'top-memory.txt has the pod using the most memory' },
      test: (w) => w.file('health/top-memory.txt') === w.pods(NS, { app: 'aggregator' })[0]?.metadata.name,
    },
    { text: { pt: 'warning.txt tem o motivo do aviso', en: 'warning.txt has the warning reason' }, test: (w) => w.file('health/warning.txt') === 'FailedScheduling' },
  ],
  solution: [
    { cmd: 'oc get clusteroperators', pt: '`image-registry` com DEGRADED `True`.', en: '`image-registry` with DEGRADED `True`.' },
    { cmd: 'echo image-registry > ~/health/degraded.txt', pt: 'Grava o operator.', en: 'Writes the operator.' },
    { cmd: 'oc adm top pods -n analytics --sort-by memory', pt: 'O aggregator lidera.', en: 'The aggregator is on top.' },
    { cmd: "oc adm top pods -n analytics --sort-by memory --no-headers | head -1 | awk '{print $1}' > ~/health/top-memory.txt", pt: 'Grava o nome do pod.', en: 'Writes the pod name.' },
    { cmd: 'oc get events -n analytics --field-selector type=Warning', pt: '`FailedScheduling`: o etl pede 24 CPUs.', en: '`FailedScheduling`: etl requests 24 CPUs.' },
    { cmd: 'echo FailedScheduling > ~/health/warning.txt', pt: 'Grava o motivo.', en: 'Writes the reason.' },
  ],
};
