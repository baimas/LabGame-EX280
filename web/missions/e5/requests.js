import { deployment } from '../../engine/world.js';
import { parseCpu, parseMem } from '../../sim/util.js';

const NS = 'forecast';
const ct = (w) => w.get('Deployment', 'forecast', NS)?.spec.template.spec.containers[0];

export default {
  id: 'e5-requests',
  minutes: 20,
  xp: 200,
  difficulty: 2,
  objectives: ['Reservar e limitar a capacidade de computação das aplicações', 'Solucionar problemas de contêineres e pods'],
  title: { pt: 'Reserva exagerada', en: 'Over-reservation' },
  startNamespace: NS,
  story: {
    pt: 'A previsão de vendas não sobe desde que alguém "garantiu recursos" para ela. O nó do laboratório tem 7,5 CPUs alocáveis, e o deployment pede muito mais que isso. Medições mostram que cada réplica usa uns 200m de CPU e 200Mi de memória.',
    en: 'Sales forecasting has not started since someone "guaranteed resources" for it. The lab node has 7.5 allocatable CPUs, and the deployment asks for much more than that. Measurements show each replica uses about 200m CPU and 200Mi memory.',
  },
  tasks: {
    pt: [
      'No projeto `forecast`, descubra por que os pods do deployment `forecast` ficam `Pending`.',
      'Ajuste os requests do contêiner para `cpu=250m` e `memory=256Mi`.',
      'Defina limites de `cpu=500m` e `memory=512Mi`.',
      'As 3 réplicas devem ficar prontas.',
    ],
    en: [
      'In the `forecast` project, find out why the `forecast` deployment pods stay `Pending`.',
      'Set the container requests to `cpu=250m` and `memory=256Mi`.',
      'Set limits of `cpu=500m` and `memory=512Mi`.',
      'All 3 replicas must be ready.',
    ],
  },
  hints: [
    { pt: '`oc describe pod` mostra o evento `FailedScheduling` com `Insufficient cpu`. `oc describe node master01` mostra a capacidade e o que já está reservado.', en: '`oc describe pod` shows the `FailedScheduling` event with `Insufficient cpu`. `oc describe node master01` shows capacity and what is already reserved.' },
    { pt: '`oc set resources deployment/forecast --requests cpu=250m,memory=256Mi --limits cpu=500m,memory=512Mi`.', en: '`oc set resources deployment/forecast --requests cpu=250m,memory=256Mi --limits cpu=500m,memory=512Mi`.' },
    { pt: 'Requests reservam capacidade para o agendamento; limites são o teto que o contêiner pode usar.', en: 'Requests reserve capacity for scheduling; limits are the ceiling the container may use.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('forecast', NS, 'nimbus/reports:4.1', { replicas: 3, container: 'reports', extra: { container: { resources: { requests: { cpu: '4', memory: '2Gi' } } } } }));
  },
  checks: [
    {
      text: { pt: 'Requests de 250m de CPU e 256Mi de memória', en: 'Requests of 250m CPU and 256Mi memory' },
      test: (w) => parseCpu(ct(w)?.resources?.requests?.cpu) === 0.25 && parseMem(ct(w).resources.requests.memory) === 256 * 2 ** 20,
    },
    {
      text: { pt: 'Limites de 500m de CPU e 512Mi de memória', en: 'Limits of 500m CPU and 512Mi memory' },
      test: (w) => parseCpu(ct(w)?.resources?.limits?.cpu) === 0.5 && parseMem(ct(w).resources.limits.memory) === 512 * 2 ** 20,
    },
    { text: { pt: 'As 3 réplicas estão prontas', en: 'All 3 replicas are ready' }, test: (w) => w.get('Deployment', 'forecast', NS).spec.replicas === 3 && w.ready('forecast', NS) },
  ],
  solution: [
    { cmd: 'oc project forecast', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods', pt: 'Um pod roda; os outros ficam `Pending`.', en: 'One pod runs; the others stay `Pending`.' },
    { cmd: 'oc describe pod -l app=forecast | grep -A2 FailedScheduling | head -3', pt: '`Insufficient cpu`.', en: '`Insufficient cpu`.' },
    { cmd: 'oc set resources deployment/forecast --requests cpu=250m,memory=256Mi --limits cpu=500m,memory=512Mi', pt: 'Reserva o que a aplicação usa de fato.', en: 'Reserves what the application actually uses.' },
    { cmd: 'oc rollout status deployment/forecast', pt: '3/3.', en: '3/3.' },
  ],
};
