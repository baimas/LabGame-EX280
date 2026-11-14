import { deployment } from '../../engine/world.js';
import { VERSAO } from '../../sim/seed.js';

const NS = 'payments';

export default {
  id: 'c0-saude',
  minutes: 15,
  xp: 150,
  difficulty: 2,
  objectives: ['Avaliar a saúde de um cluster OpenShift', 'Monitorar eventos e alertas do cluster', 'Examinar recursos e o status do cluster'],
  title: { pt: 'Checagem de saúde', en: 'Health check' },
  startNamespace: 'default',
  story: {
    pt: 'Antes da janela de mudanças desta noite, a gerência quer um parecer sobre a saúde do cluster. De quebra, o time de Pagamentos reclama que o `gateway` não sobe desde ontem.',
    en: 'Before tonight\'s change window, management wants a report on cluster health. On top of that, the Payments team complains that `gateway` has not come up since yesterday.',
  },
  tasks: {
    pt: [
      'O diretório `~/health` já existe.',
      'Grave em `~/health/version.txt` a versão do OpenShift do cluster.',
      'Um cluster operator está degradado. Grave o nome dele em `~/health/operator.txt`.',
      'No projeto `payments`, os pods do deployment `gateway` geram eventos do tipo Warning. Grave em `~/health/reason.txt` o motivo (coluna REASON) desses eventos.',
      'Corrija o deployment `gateway` para que ele solicite 500m de CPU, e deixe-o pronto.',
    ],
    en: [
      'The `~/health` directory already exists.',
      'Write the cluster OpenShift version to `~/health/version.txt`.',
      'One cluster operator is degraded. Write its name to `~/health/operator.txt`.',
      'In the `payments` project, the pods of the `gateway` deployment generate Warning events. Write the reason (REASON column) of those events to `~/health/reason.txt`.',
      'Fix the `gateway` deployment so that it requests 500m of CPU, and get it ready.',
    ],
  },
  hints: [
    { pt: '`oc get clusterversion` e `oc get clusteroperators` são o ponto de partida de qualquer checagem de saúde.', en: '`oc get clusterversion` and `oc get clusteroperators` are the starting point of any health check.' },
    { pt: '`oc get events -n payments --field-selector type=Warning` mostra só os avisos.', en: '`oc get events -n payments --field-selector type=Warning` shows only the warnings.' },
    { pt: '`oc set resources deployment/gateway --requests=cpu=500m` altera a solicitação de CPU.', en: '`oc set resources deployment/gateway --requests=cpu=500m` changes the CPU request.' },
  ],
  setup(w) {
    const c = w.cluster;
    const op = c.get('ClusterOperator', 'image-registry');
    const degradado = op.status.conditions.find((x) => x.type === 'Degraded');
    Object.assign(degradado, { status: 'True', reason: 'StorageNotConfigured', message: 'Degraded: the registry storage is not configured', lastTransitionTime: c.iso(c.now - 5400) });
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('gateway', NS, 'nimbus/inventory:3.3', { extra: { container: { resources: { requests: { cpu: '16', memory: '256Mi' } } } } }));
    c.create(deployment('ledger', NS, 'nimbus/reports:4.1'));
    w.fs.mkdir('/home/student/health', true);
  },
  checks: [
    {
      text: { pt: 'version.txt tem a versão do cluster', en: 'version.txt has the cluster version' },
      test: (w) => w.file('health/version.txt') === VERSAO,
    },
    {
      text: { pt: 'operator.txt tem o nome do operator degradado', en: 'operator.txt has the name of the degraded operator' },
      test: (w) => w.file('health/operator.txt') === 'image-registry',
    },
    {
      text: { pt: 'reason.txt tem o motivo dos eventos de aviso', en: 'reason.txt has the reason of the warning events' },
      test: (w) => w.file('health/reason.txt') === 'FailedScheduling',
    },
    {
      text: { pt: 'gateway solicita 500m de CPU e está pronto', en: 'gateway requests 500m of CPU and is ready' },
      test: (w) => w.get('Deployment', 'gateway', NS).spec.template.spec.containers[0].resources.requests.cpu === '500m' && w.ready('gateway', NS),
    },
  ],
  solution: [
    { cmd: 'oc get clusterversion', pt: 'Versão e estado geral do cluster.', en: 'Version and overall state of the cluster.' },
    { cmd: `oc get clusterversion version -o jsonpath='{.status.desired.version}' > ~/health/version.txt`, pt: 'Grava só o número da versão.', en: 'Writes only the version number.' },
    { cmd: 'oc get clusteroperators', pt: 'A coluna DEGRADED aponta o operator com problema.', en: 'The DEGRADED column points to the troubled operator.' },
    { cmd: 'echo image-registry > ~/health/operator.txt', pt: 'Registra o nome encontrado.', en: 'Records the name you found.' },
    { cmd: 'oc get events -n payments --field-selector type=Warning', pt: 'Os avisos dizem que o pod não cabe no nó: CPU insuficiente.', en: 'The warnings say the pod does not fit the node: insufficient CPU.' },
    { cmd: 'echo FailedScheduling > ~/health/reason.txt', pt: 'Registra o motivo.', en: 'Records the reason.' },
    { cmd: 'oc set resources deployment/gateway -n payments --requests=cpu=500m', pt: 'Reduz a solicitação de CPU para algo que o nó comporta.', en: 'Lowers the CPU request to something the node can fit.' },
    { cmd: 'oc rollout status deployment/gateway -n payments', pt: 'Confirma que o novo pod foi agendado e está pronto.', en: 'Confirms the new pod was scheduled and is ready.' },
  ],
};
