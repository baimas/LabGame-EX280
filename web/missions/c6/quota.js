import { deployment } from '../../engine/world.js';
import { mesmos, recursos } from './comum.js';

const NS = 'marketing';
const HARD = { pods: '6', 'requests.cpu': '1500m', 'requests.memory': '2Gi', 'limits.cpu': '3', 'limits.memory': '4Gi' };
const CAMPANHA = { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } };
const LANDING = { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '200m', memory: '256Mi' } };

export default {
  id: 'c6-quota',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Configurar quotas de recursos por projeto', 'Gerenciar o consumo de recursos de aplicações'],
  title: { pt: 'Teto de gastos', en: 'Spending cap' },
  story: {
    pt: 'O Marketing vai rodar uma campanha grande e o Financeiro quer garantia de que o projeto não vai engolir o cluster. Antes de aumentar as réplicas, o projeto ganha um teto de consumo.',
    en: 'Marketing is about to run a big campaign and Finance wants a guarantee that the project will not swallow the cluster. Before the replicas go up, the project gets a consumption cap.',
  },
  tasks: {
    pt: [
      'No projeto `marketing`, crie a quota `marketing-quota` com: no máximo 6 pods, 1500m de CPU e 2Gi de memória em requests, 3 CPUs e 4Gi de memória em limits.',
      'O deployment `campaign` deve rodar 4 réplicas prontas, cada contêiner com requests de `250m` de CPU e `256Mi` de memória, e limits de `500m` e `512Mi`.',
      'O deployment `landing` deve continuar com 1 réplica pronta, com requests de `100m` e `128Mi`, e limits de `200m` e `256Mi`.',
    ],
    en: [
      'In the `marketing` project, create the `marketing-quota` quota with: at most 6 pods, 1500m CPU and 2Gi memory in requests, 3 CPUs and 4Gi memory in limits.',
      'The `campaign` deployment must run 4 ready replicas, each container with requests of `250m` CPU and `256Mi` memory, and limits of `500m` and `512Mi`.',
      'The `landing` deployment must keep 1 ready replica, with requests of `100m` and `128Mi`, and limits of `200m` and `256Mi`.',
    ],
  },
  hints: [
    { pt: '`oc create quota NOME --hard pods=6,requests.cpu=1500m,...` cria a quota numa linha só.', en: '`oc create quota NAME --hard pods=6,requests.cpu=1500m,...` creates the quota in a single line.' },
    { pt: 'Com quota de CPU e memória, pod sem requests e limits é recusado: veja os eventos `FailedCreate` em `oc describe rs` ou `oc get events`.', en: 'With a CPU and memory quota, a pod without requests and limits is refused: look for `FailedCreate` events in `oc describe rs` or `oc get events`.' },
    { pt: '`oc set resources deployment NOME --requests cpu=250m,memory=256Mi --limits cpu=500m,memory=512Mi`.', en: '`oc set resources deployment NAME --requests cpu=250m,memory=256Mi --limits cpu=500m,memory=512Mi`.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('campaign', NS, 'nimbus/portal:1.1', { replicas: 2 }));
    c.create(deployment('landing', NS, 'nimbus/portal:1.0'));
  },
  checks: [
    {
      text: { pt: 'A quota marketing-quota tem os limites pedidos', en: 'The marketing-quota quota has the requested limits' },
      test: (w) => mesmos(w.get('ResourceQuota', 'marketing-quota', NS)?.spec?.hard, HARD),
    },
    {
      text: { pt: 'campaign roda 4 réplicas com os recursos pedidos', en: 'campaign runs 4 replicas with the requested resources' },
      test: (w) => w.ready('campaign', NS) && w.get('Deployment', 'campaign', NS).spec.replicas === 4 && w.pods(NS, { app: 'campaign' }).every((p) => recursos(p.spec.containers[0], CAMPANHA)),
    },
    {
      text: { pt: 'landing roda 1 réplica com os recursos pedidos', en: 'landing runs 1 replica with the requested resources' },
      test: (w) => w.ready('landing', NS) && w.get('Deployment', 'landing', NS).spec.replicas === 1 && w.pods(NS, { app: 'landing' }).every((p) => recursos(p.spec.containers[0], LANDING)),
    },
  ],
  solution: [
    { cmd: 'oc project marketing', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc create quota marketing-quota --hard pods=6,requests.cpu=1500m,requests.memory=2Gi,limits.cpu=3,limits.memory=4Gi', pt: 'Cria a quota.', en: 'Creates the quota.' },
    { cmd: 'oc scale deployment campaign --replicas 4', pt: 'O scale é aceito, mas os pods novos não nascem.', en: 'The scale is accepted, but the new pods are not created.' },
    { cmd: 'oc get events | grep FailedCreate | tail -1', pt: 'A quota exige requests e limits de CPU e memória.', en: 'The quota requires CPU and memory requests and limits.' },
    { cmd: 'oc set resources deployment campaign --requests cpu=250m,memory=256Mi --limits cpu=500m,memory=512Mi', pt: 'Define os recursos; o rollout recria os pods.', en: 'Sets the resources; the rollout recreates the pods.' },
    { cmd: 'oc set resources deployment landing --requests cpu=100m,memory=128Mi --limits cpu=200m,memory=256Mi', pt: 'O landing também precisa, ou não sobrevive ao próximo rollout.', en: 'landing needs them too, or it will not survive its next rollout.' },
    { cmd: 'sleep 20', pt: 'Espera os rollouts.', en: 'Waits for the rollouts.' },
    { cmd: 'oc get deployments', pt: '`campaign` com 4/4 e `landing` com 1/1.', en: '`campaign` at 4/4 and `landing` at 1/1.' },
    { cmd: 'oc describe quota marketing-quota', pt: 'O uso: 5 pods, 1100m de CPU em requests.', en: 'Usage: 5 pods, 1100m CPU in requests.' },
  ],
};
