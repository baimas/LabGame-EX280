import { deployment } from '../../engine/world.js';

const NS = 'marketing';
const HOST = 'promo.apps.lab.example.com';

export default {
  id: 'e3-escalar-expor',
  minutes: 20,
  xp: 190,
  difficulty: 2,
  objectives: ['Escalar e expor aplicações para acesso externo'],
  title: { pt: 'Black Friday', en: 'Black Friday' },
  startNamespace: NS,
  story: {
    pt: 'O marketing vai lançar a página da Black Friday amanhã às 8h. A aplicação já está no cluster, mas com uma réplica só e sem acesso de fora.',
    en: 'Marketing launches the Black Friday page tomorrow at 8 a.m. The application is already in the cluster, but with a single replica and no outside access.',
  },
  tasks: {
    pt: [
      'No projeto `marketing`, escale o deployment `landing` para 3 réplicas prontas.',
      'Crie o service `landing` na porta `80`, encaminhando para a porta `8080` dos pods.',
      `Exponha o service com a route \`landing\` no endereço \`http://${HOST}\`. Ela deve responder da estação de trabalho.`,
    ],
    en: [
      'In the `marketing` project, scale the `landing` deployment to 3 ready replicas.',
      'Create the `landing` service on port `80`, forwarding to port `8080` of the pods.',
      `Expose the service with the \`landing\` route at \`http://${HOST}\`. It must answer from the workstation.`,
    ],
  },
  hints: [
    { pt: '`oc scale deployment/NOME --replicas N`.', en: '`oc scale deployment/NAME --replicas N`.' },
    { pt: '`oc expose deployment/landing --port 80 --target-port 8080` cria o service.', en: '`oc expose deployment/landing --port 80 --target-port 8080` creates the service.' },
    { pt: '`oc expose service/landing --hostname HOST` cria a route; `curl` da estação testa.', en: '`oc expose service/landing --hostname HOST` creates the route; `curl` from the workstation tests it.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('landing', NS, 'nimbus/portal:2.0', { container: 'portal' }));
  },
  checks: [
    { text: { pt: 'landing tem 3 réplicas prontas', en: 'landing has 3 ready replicas' }, test: (w) => w.get('Deployment', 'landing', NS).spec.replicas === 3 && w.ready('landing', NS) },
    {
      text: { pt: 'O service landing atende na 80 e encaminha para a 8080', en: 'The landing service listens on 80 and forwards to 8080' },
      test: (w) => (w.get('Service', 'landing', NS)?.spec.ports || []).some((p) => p.port === 80 && String(p.targetPort) === '8080'),
    },
    {
      text: { pt: `http://${HOST} responde`, en: `http://${HOST} answers` },
      test: (w) => w.get('Route', 'landing', NS)?.spec.host === HOST && w.http(`http://${HOST}/`).status === 200,
    },
  ],
  solution: [
    { cmd: 'oc project marketing', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc scale deployment/landing --replicas 3', pt: 'Três réplicas.', en: 'Three replicas.' },
    { cmd: 'oc expose deployment/landing --port 80 --target-port 8080', pt: 'Service na porta 80.', en: 'Service on port 80.' },
    { cmd: `oc expose service/landing --hostname ${HOST}`, pt: 'Route com o endereço pedido.', en: 'Route with the requested host.' },
    { cmd: `sleep 5; curl -s http://${HOST}`, pt: 'A página responde.', en: 'The page answers.' },
  ],
};
