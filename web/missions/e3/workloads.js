const NS = 'batch-lab';
const R = 'registry.lab.example.com:8443';
const cond = (j, t) => (j?.status?.conditions || []).some((x) => x.type === t && x.status === 'True');
const cmd = (ct) => [...(ct?.command || []), ...(ct?.args || [])].join(' ');

export default {
  id: 'e3-workloads',
  minutes: 20,
  xp: 180,
  difficulty: 2,
  objectives: ['Gerenciar aplicações com a API de workloads', 'Implantar aplicações a partir de uma imagem e de um template'],
  title: { pt: 'Longa e curta duração', en: 'Long-lived and short-lived' },
  startNamespace: NS,
  story: {
    pt: 'O sistema de pedidos tem três pedaços: uma API que fica sempre no ar, uma carga inicial que roda uma vez e uma limpeza que roda de meia em meia hora. Cada um precisa do recurso de workload certo.',
    en: 'The ordering system has three pieces: an API that is always up, an initial load that runs once, and a cleanup that runs every half hour. Each one needs the right workload resource.',
  },
  tasks: {
    pt: [
      `No projeto \`batch-lab\`, crie o deployment \`orders-api\` com a imagem \`${R}/nimbus/inventory:3.3\` e 2 réplicas prontas.`,
      `Crie o job \`initial-load\` com a imagem \`${R}/ubi9/ubi:9.4\` que roda \`echo carga ok\`, e que termine com sucesso.`,
      `Crie o cron job \`cleanup\` com a imagem \`${R}/ubi9/ubi:9.4\` que roda \`echo limpeza\` a cada 30 minutos (\`*/30 * * * *\`).`,
    ],
    en: [
      `In the \`batch-lab\` project, create the \`orders-api\` deployment with the \`${R}/nimbus/inventory:3.3\` image and 2 ready replicas.`,
      `Create the \`initial-load\` job with the \`${R}/ubi9/ubi:9.4\` image that runs \`echo carga ok\`, and that finishes successfully.`,
      `Create the \`cleanup\` cron job with the \`${R}/ubi9/ubi:9.4\` image that runs \`echo limpeza\` every 30 minutes (\`*/30 * * * *\`).`,
    ],
  },
  hints: [
    { pt: '`oc create deployment NOME --image IMAGEM --replicas N`.', en: '`oc create deployment NAME --image IMAGE --replicas N`.' },
    { pt: '`oc create job NOME --image IMAGEM -- comando args`.', en: '`oc create job NAME --image IMAGE -- command args`.' },
    { pt: '`oc create cronjob NOME --image IMAGEM --schedule \'*/30 * * * *\' -- comando`.', en: '`oc create cronjob NAME --image IMAGE --schedule \'*/30 * * * *\' -- command`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
  },
  checks: [
    { text: { pt: 'orders-api tem 2 réplicas prontas', en: 'orders-api has 2 ready replicas' }, test: (w) => w.get('Deployment', 'orders-api', NS)?.spec.replicas === 2 && w.ready('orders-api', NS) },
    {
      text: { pt: 'initial-load rodou echo carga ok e terminou', en: 'initial-load ran echo carga ok and finished' },
      test: (w) => {
        const j = w.get('Job', 'initial-load', NS);
        return cond(j, 'Complete') && cmd(j.spec.template.spec.containers[0]).includes('echo carga ok');
      },
    },
    {
      text: { pt: 'cleanup roda echo limpeza a cada 30 minutos', en: 'cleanup runs echo limpeza every 30 minutes' },
      test: (w) => {
        const cj = w.get('CronJob', 'cleanup', NS);
        return cj?.spec.schedule === '*/30 * * * *' && cmd(cj.spec.jobTemplate.spec.template.spec.containers[0]).includes('echo limpeza');
      },
    },
  ],
  solution: [
    { cmd: 'oc project batch-lab', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc create deployment orders-api --image ${R}/nimbus/inventory:3.3 --replicas 2`, pt: 'Aplicação de longa duração.', en: 'Long-lived application.' },
    { cmd: `oc create job initial-load --image ${R}/ubi9/ubi:9.4 -- echo carga ok`, pt: 'Tarefa única.', en: 'One-off task.' },
    { cmd: `oc create cronjob cleanup --image ${R}/ubi9/ubi:9.4 --schedule '*/30 * * * *' -- echo limpeza`, pt: 'Tarefa agendada.', en: 'Scheduled task.' },
    { cmd: 'sleep 10; oc get deploy,job,cronjob', pt: 'Os três no ar.', en: 'All three in place.' },
  ],
};
