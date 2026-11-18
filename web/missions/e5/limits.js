import { deployment } from '../../engine/world.js';
import { parseCpu, parseMem } from '../../sim/util.js';

const NS = 'reports';
const ct = (w) => w.get('Deployment', 'report-builder', NS)?.spec.template.spec.containers[0];

export default {
  id: 'e5-limits',
  minutes: 20,
  xp: 210,
  difficulty: 2,
  objectives: ['Reservar e limitar a capacidade de computação das aplicações', 'Solucionar problemas de contêineres e pods'],
  title: { pt: 'Morto pelo kernel', en: 'Killed by the kernel' },
  startNamespace: NS,
  story: {
    pt: 'O gerador de relatórios carrega um ano de vendas na memória antes de responder. Um limite de memória "conservador" foi aplicado na semana passada, e desde então o pod morre segundos depois de subir.',
    en: 'The report builder loads a year of sales into memory before answering. A "conservative" memory limit was applied last week, and since then the pod dies seconds after starting.',
  },
  tasks: {
    pt: [
      'No projeto `reports`, descubra por que o pod do deployment `report-builder` reinicia sem parar.',
      'A aplicação precisa de cerca de 600Mi de memória. Ajuste o contêiner para request de memória `700Mi` e limite de memória `1Gi`.',
      'Mantenha um limite de CPU de `500m`.',
      'O deployment deve ficar pronto, sem `OOMKilled` no pod atual.',
    ],
    en: [
      'In the `reports` project, find out why the `report-builder` deployment pod keeps restarting.',
      'The application needs about 600Mi of memory. Set the container memory request to `700Mi` and the memory limit to `1Gi`.',
      'Keep a CPU limit of `500m`.',
      'The deployment must be ready, with no `OOMKilled` in the current pod.',
    ],
  },
  hints: [
    { pt: '`oc describe pod` mostra `Last State: Terminated`, `Reason: OOMKilled` e `Exit Code: 137`.', en: '`oc describe pod` shows `Last State: Terminated`, `Reason: OOMKilled`, and `Exit Code: 137`.' },
    { pt: '`oc adm top pods` mostra o consumo de quem está rodando.', en: '`oc adm top pods` shows the usage of what is running.' },
    { pt: '`oc set resources deployment/report-builder --requests memory=700Mi --limits memory=1Gi,cpu=500m`.', en: '`oc set resources deployment/report-builder --requests memory=700Mi --limits memory=1Gi,cpu=500m`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('report-builder', NS, 'nimbus/report-builder:2.0', { container: 'report-builder', extra: { container: { resources: { requests: { memory: '128Mi' }, limits: { memory: '256Mi', cpu: '500m' } } } } }));
    w.cluster.tick(40);
  },
  checks: [
    {
      text: { pt: 'Request de 700Mi e limite de 1Gi de memória', en: 'Memory request of 700Mi and limit of 1Gi' },
      test: (w) => parseMem(ct(w)?.resources?.requests?.memory) === 700 * 2 ** 20 && parseMem(ct(w).resources.limits?.memory) === 2 ** 30,
    },
    { text: { pt: 'Limite de CPU de 500m', en: 'CPU limit of 500m' }, test: (w) => parseCpu(ct(w)?.resources?.limits?.cpu) === 0.5 },
    {
      text: { pt: 'report-builder pronto e sem OOMKilled', en: 'report-builder ready with no OOMKilled' },
      test: (w) => w.ready('report-builder', NS) && w.pods(NS, { app: 'report-builder' }).every((p) => (p.status.containerStatuses || []).every((s) => s.lastState?.terminated?.reason !== 'OOMKilled' && !s.restartCount)),
    },
  ],
  solution: [
    { cmd: 'oc project reports', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods', pt: '`CrashLoopBackOff` com reinícios.', en: '`CrashLoopBackOff` with restarts.' },
    { cmd: "oc describe pod -l app=report-builder | grep -A3 'Last State'", pt: '`OOMKilled`, código 137.', en: '`OOMKilled`, code 137.' },
    { cmd: 'oc set resources deployment/report-builder --requests memory=700Mi --limits memory=1Gi,cpu=500m', pt: 'Memória suficiente, com teto.', en: 'Enough memory, with a ceiling.' },
    { cmd: 'oc rollout status deployment/report-builder', pt: 'Pronto.', en: 'Ready.' },
    { cmd: 'oc adm top pods', pt: 'Uns 600Mi em uso, abaixo do limite.', en: 'About 600Mi in use, below the limit.' },
  ],
};
