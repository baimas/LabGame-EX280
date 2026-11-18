import { deployment, service } from '../../engine/world.js';
import { parseCpu } from '../../sim/util.js';

const NS = 'checkout';

export default {
  id: 'e5-hpa',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Configurar o autoscaling das aplicações', 'Reservar e limitar a capacidade de computação das aplicações'],
  title: { pt: 'Pico de vendas', en: 'Sales peak' },
  startNamespace: NS,
  story: {
    pt: 'O checkout aguenta bem a carga normal, mas trava nos picos de promoção. Escalar na mão às 3 da manhã não é opção. O time de desempenho deixou um gerador de carga rodando para simular o pico.',
    en: 'Checkout handles normal load well, but it chokes during promotion peaks. Scaling by hand at 3 a.m. is not an option. The performance team left a load generator running to simulate the peak.',
  },
  tasks: {
    pt: [
      'No projeto `checkout`, o deployment `loadgen` gera carga contínua no service `checkout`. Não mexa nele.',
      'Defina request de CPU de `200m` no contêiner do deployment `checkout`.',
      'Crie um horizontal pod autoscaler para o deployment `checkout` com no mínimo 2 e no máximo 6 réplicas, mirando 50% de uso de CPU.',
      'Sob a carga, o `checkout` deve escalar sozinho para mais de 2 réplicas, todas prontas.',
    ],
    en: [
      'In the `checkout` project, the `loadgen` deployment generates continuous load on the `checkout` service. Do not touch it.',
      'Set a CPU request of `200m` on the `checkout` deployment container.',
      'Create a horizontal pod autoscaler for the `checkout` deployment with at least 2 and at most 6 replicas, targeting 50% CPU usage.',
      'Under load, `checkout` must scale on its own to more than 2 replicas, all ready.',
    ],
  },
  hints: [
    { pt: 'O HPA calcula o uso em percentual do request: sem request de CPU, ele fica com `<unknown>` (veja `oc describe hpa`).', en: 'The HPA calculates usage as a percentage of the request: without a CPU request, it shows `<unknown>` (see `oc describe hpa`).' },
    { pt: '`oc autoscale deployment/checkout --min 2 --max 6 --cpu 50%`.', en: '`oc autoscale deployment/checkout --min 2 --max 6 --cpu 50%`.' },
    { pt: '`oc get hpa -w` acompanha TARGETS e REPLICAS; o HPA recalcula a cada 15 segundos.', en: '`oc get hpa -w` follows TARGETS and REPLICAS; the HPA recalculates every 15 seconds.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('checkout', NS, 'nimbus/portal:2.0', { container: 'portal' }));
    c.create(service('checkout', NS));
    c.create(deployment('loadgen', NS, 'nimbus/loadgen:1.0', { env: { TARGET_URL: 'http://checkout:8080/' } }));
  },
  checks: [
    {
      text: { pt: 'checkout pede 200m de CPU', en: 'checkout requests 200m CPU' },
      test: (w) => parseCpu(w.get('Deployment', 'checkout', NS).spec.template.spec.containers[0].resources?.requests?.cpu) === 0.2,
    },
    {
      text: { pt: 'O HPA vai de 2 a 6 réplicas mirando 50% de CPU', en: 'The HPA goes from 2 to 6 replicas targeting 50% CPU' },
      test: (w) => {
        const h = w.list('HorizontalPodAutoscaler', NS).find((x) => x.spec.scaleTargetRef.kind === 'Deployment' && x.spec.scaleTargetRef.name === 'checkout');
        const m = h?.spec.metrics?.find((x) => x.resource?.name === 'cpu');
        return h?.spec.minReplicas === 2 && h.spec.maxReplicas === 6 && m?.resource.target.averageUtilization === 50;
      },
    },
    {
      text: { pt: 'Sob carga, checkout escalou para mais de 2 réplicas prontas', en: 'Under load, checkout scaled to more than 2 ready replicas' },
      test: (w) => w.get('Deployment', 'checkout', NS).spec.replicas > 2 && w.ready('checkout', NS),
    },
  ],
  solution: [
    { cmd: 'oc project checkout', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc adm top pods', pt: 'O checkout trabalha muito com uma réplica só.', en: 'Checkout works hard with a single replica.' },
    { cmd: 'oc set resources deployment/checkout --requests cpu=200m', pt: 'Base para o cálculo do HPA.', en: 'Baseline for the HPA calculation.' },
    { cmd: 'oc autoscale deployment/checkout --min 2 --max 6 --cpu 50%', pt: 'Cria o HPA.', en: 'Creates the HPA.' },
    { cmd: 'sleep 60; oc get hpa', pt: 'TARGETS acima de 50% puxa réplicas.', en: 'TARGETS above 50% pulls in replicas.' },
    { cmd: 'oc rollout status deployment/checkout && oc get deploy checkout', pt: 'Mais de 2 réplicas prontas.', en: 'More than 2 ready replicas.' },
  ],
};
