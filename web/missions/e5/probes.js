import { deployment, service } from '../../engine/world.js';

const NS = 'catalog';
const ct = (w) => w.get('Deployment', 'catalog', NS)?.spec.template.spec.containers[0];

export default {
  id: 'e5-probes',
  minutes: 25,
  xp: 230,
  difficulty: 3,
  objectives: ['Configurar probes de saúde das aplicações', 'Solucionar problemas de contêineres e pods'],
  title: { pt: 'Reinicia, reinicia, reinicia', en: 'Restart, restart, restart' },
  startNamespace: NS,
  story: {
    pt: 'Alguém colocou uma liveness probe no catálogo de produtos copiada de outro sistema. Desde então os pods reiniciam sem parar. E, mesmo quando sobem, recebem tráfego antes de carregar o índice de produtos, que leva uns 25 segundos.',
    en: 'Someone added a liveness probe to the product catalog, copied from another system. Since then the pods keep restarting. And even when they come up, they get traffic before loading the product index, which takes about 25 seconds.',
  },
  tasks: {
    pt: [
      'No projeto `catalog`, a aplicação do deployment `catalog` publica `/health/live` (está viva) e `/health/ready` (pronta para tráfego), na porta 8080.',
      'Configure a liveness probe HTTP em `/health/live`, porta 8080, sem matar o contêiner enquanto ele carrega o índice (use um atraso inicial de pelo menos 30 segundos ou uma startup probe).',
      'Configure a readiness probe HTTP em `/health/ready`, porta 8080.',
      'As 2 réplicas devem ficar prontas e sem reiniciar.',
    ],
    en: [
      'In the `catalog` project, the `catalog` deployment application publishes `/health/live` (alive) and `/health/ready` (ready for traffic), on port 8080.',
      'Configure the HTTP liveness probe on `/health/live`, port 8080, without killing the container while it loads the index (use an initial delay of at least 30 seconds or a startup probe).',
      'Configure the HTTP readiness probe on `/health/ready`, port 8080.',
      'The 2 replicas must be ready and not restarting.',
    ],
  },
  hints: [
    { pt: '`oc describe pod` mostra os eventos `Unhealthy` e `Killing`: a probe atual chama um caminho que não existe.', en: '`oc describe pod` shows the `Unhealthy` and `Killing` events: the current probe calls a path that does not exist.' },
    { pt: '`oc set probe deployment/catalog --liveness --get-url http://:8080/health/live --initial-delay-seconds 30`.', en: '`oc set probe deployment/catalog --liveness --get-url http://:8080/health/live --initial-delay-seconds 30`.' },
    { pt: '`oc set probe deployment/catalog --readiness --get-url http://:8080/health/ready`.', en: '`oc set probe deployment/catalog --readiness --get-url http://:8080/health/ready`.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('catalog', NS, 'nimbus/catalog:1.1', { replicas: 2, container: 'catalog', extra: { container: { livenessProbe: { httpGet: { path: '/healthz', port: 8080, scheme: 'HTTP' }, periodSeconds: 10, failureThreshold: 3, timeoutSeconds: 1, successThreshold: 1 } } } }));
    c.create(service('catalog', NS));
    c.tick(60);
  },
  checks: [
    {
      text: { pt: 'A liveness chama /health/live na 8080 sem matar durante a subida', en: 'Liveness calls /health/live on 8080 without killing during startup' },
      test: (w) => {
        const x = ct(w);
        const v = x?.livenessProbe?.httpGet;
        return v?.path === '/health/live' && Number(v.port) === 8080 && ((x.livenessProbe.initialDelaySeconds || 0) >= 30 || Boolean(x.startupProbe));
      },
    },
    {
      text: { pt: 'A readiness chama /health/ready na 8080', en: 'Readiness calls /health/ready on 8080' },
      test: (w) => ct(w)?.readinessProbe?.httpGet?.path === '/health/ready' && Number(ct(w).readinessProbe.httpGet.port) === 8080,
    },
    {
      text: { pt: '2 réplicas prontas e sem reinícios', en: '2 ready replicas with no restarts' },
      test: (w) => w.get('Deployment', 'catalog', NS).spec.replicas === 2 && w.ready('catalog', NS) && w.pods(NS, { app: 'catalog' }).every((p) => (p.status.containerStatuses || []).every((s) => !s.restartCount)),
    },
  ],
  solution: [
    { cmd: 'oc project catalog', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods', pt: 'Reinícios e pods sem ficar prontos.', en: 'Restarts and pods not becoming ready.' },
    { cmd: 'oc describe pod -l app=catalog | grep -E "Liveness|Unhealthy|Killing" | head -4', pt: '`/healthz` dá 404.', en: '`/healthz` returns 404.' },
    { cmd: 'oc set probe deployment/catalog --liveness --get-url http://:8080/health/live --initial-delay-seconds 30', pt: 'Liveness no caminho certo, com tempo para subir.', en: 'Liveness on the right path, with time to start.' },
    { cmd: 'oc set probe deployment/catalog --readiness --get-url http://:8080/health/ready', pt: 'Só recebe tráfego quando estiver pronta.', en: 'Only gets traffic once ready.' },
    { cmd: 'oc rollout status deployment/catalog', pt: 'Pods novos, prontos depois de ~30 s.', en: 'New pods, ready after ~30 s.' },
    { cmd: 'oc get pods', pt: '`RESTARTS` 0.', en: '`RESTARTS` 0.' },
  ],
};
