import { deployment } from '../../engine/world.js';
import { ipDe, noPool, deFora } from './comum.js';

const NS = 'games';
const FIXO = '192.168.50.30';

const lb = (nome, porta) => ({ kind: 'Service', metadata: { name: nome, namespace: NS, labels: { app: nome } }, spec: { type: 'LoadBalancer', selector: { app: nome }, ports: [{ port: porta, targetPort: porta }] } });

export default {
  id: 'c5-metallb',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Configurar um service do tipo load balancer', 'Configurar componentes de rede', 'Expor aplicações não HTTP/SNI'],
  title: { pt: 'Endereços para o fliperama', en: 'Addresses for the arcade' },
  story: {
    pt: 'O time de Jogos subiu o servidor de chat e o placar como services LoadBalancer, mas eles estão em `<pending>` há horas. O MetalLB foi instalado e ninguém configurou de onde tirar os endereços.',
    en: 'The Games team created the chat server and the leaderboard as LoadBalancer services, but they have been `<pending>` for hours. MetalLB was installed and nobody configured where to take addresses from.',
  },
  tasks: {
    pt: [
      'No projeto `metallb-system`, crie o IPAddressPool `games-pool` com os endereços de 192.168.50.30 a 192.168.50.39.',
      'Crie o L2Advertisement `games-l2`, que anuncia apenas o `games-pool`.',
      `O service \`chat\` do projeto \`games\` deve receber exatamente o IP \`${FIXO}\`.`,
      'O service `leaderboard` pode receber qualquer IP do pool.',
      `Da estação de trabalho, \`echo oi | nc ${FIXO} 9000\` e \`curl http://IP-DO-LEADERBOARD:8080\` devem responder.`,
    ],
    en: [
      'In the `metallb-system` project, create the `games-pool` IPAddressPool with the addresses from 192.168.50.30 to 192.168.50.39.',
      'Create the `games-l2` L2Advertisement, which announces only `games-pool`.',
      `The \`chat\` service of the \`games\` project must get exactly the \`${FIXO}\` IP.`,
      'The `leaderboard` service may get any IP from the pool.',
      `From the workstation, \`echo hi | nc ${FIXO} 9000\` and \`curl http://LEADERBOARD-IP:8080\` must answer.`,
    ],
  },
  hints: [
    { pt: 'Os recursos são do grupo `metallb.io/v1beta1`: `IPAddressPool` com `spec.addresses` e `L2Advertisement` com `spec.ipAddressPools`. `oc explain ipaddresspool.spec` mostra os campos, e `oc describe svc` mostra os eventos do MetalLB.', en: 'The resources belong to `metallb.io/v1beta1`: `IPAddressPool` with `spec.addresses` and `L2Advertisement` with `spec.ipAddressPools`. `oc explain ipaddresspool.spec` shows the fields, and `oc describe svc` shows the MetalLB events.' },
    { pt: 'Um IP fixo é pedido no campo `spec.loadBalancerIP` do service (o MetalLB também aceita a anotação `metallb.io/loadBalancerIPs`).', en: 'A fixed IP is requested in the service `spec.loadBalancerIP` field (MetalLB also accepts the `metallb.io/loadBalancerIPs` annotation).' },
    { pt: 'IP alocado mas sem resposta? Falta o anúncio L2 para o pool dele.', en: 'IP allocated but no answer? The L2 advertisement for its pool is missing.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('chat', NS, 'nimbus/chat:1.1', { extra: { container: { ports: [{ containerPort: 9000 }] } } }));
    w.cluster.create(deployment('leaderboard', NS, 'nimbus/reports:4.1'));
    w.cluster.create(lb('chat', 9000));
    w.cluster.create(lb('leaderboard', 8080));
  },
  checks: [
    {
      text: { pt: 'O pool games-pool tem a faixa pedida', en: 'The games-pool pool has the requested range' },
      test: (w) => noPool(w, '192.168.50.30', 'games-pool') && noPool(w, '192.168.50.39', 'games-pool') && !noPool(w, '192.168.50.40', 'games-pool') && !noPool(w, '192.168.50.29', 'games-pool'),
    },
    {
      text: { pt: 'games-l2 anuncia apenas o games-pool', en: 'games-l2 announces only games-pool' },
      test: (w) => JSON.stringify(w.get('L2Advertisement', 'games-l2', 'metallb-system')?.spec?.ipAddressPools) === '["games-pool"]',
    },
    {
      text: { pt: `chat tem o IP ${FIXO} e responde de fora`, en: `chat has the ${FIXO} IP and answers from outside` },
      test: (w) => ipDe(w, 'chat', NS) === FIXO && deFora(w, FIXO, 9000).proto === 'chat',
    },
    {
      text: { pt: 'leaderboard tem um IP do pool e responde de fora', en: 'leaderboard has an IP from the pool and answers from outside' },
      test: (w) => noPool(w, ipDe(w, 'leaderboard', NS), 'games-pool') && w.http(`http://${ipDe(w, 'leaderboard', NS)}:8080`).status === 200,
    },
  ],
  solution: [
    { cmd: 'oc get svc -n games', pt: 'Os dois estão em `<pending>`.', en: 'Both are `<pending>`.' },
    { cmd: 'oc describe svc chat -n games | tail -3', pt: 'O MetalLB diz que não há IPs disponíveis.', en: 'MetalLB says there are no IPs available.' },
    { cmd: `cat > metallb.yaml <<EOF
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: games-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.50.30-192.168.50.39
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: games-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - games-pool
EOF`, pt: 'Pool e anúncio num arquivo só.', en: 'Pool and advertisement in a single file.' },
    { cmd: `oc patch svc chat -n games -p '{"spec":{"loadBalancerIP":"${FIXO}"}}'`, pt: 'Pede o IP fixo antes de criar o pool, para ele não ser dado a outro service.', en: 'Requests the fixed IP before creating the pool, so it is not handed to another service.' },
    { cmd: 'oc apply -f metallb.yaml', pt: 'Cria o pool e o anúncio.', en: 'Creates the pool and the advertisement.' },
    { cmd: 'oc get svc -n games', pt: 'Os dois recebem IP.', en: 'Both get an IP.' },
    { cmd: `echo oi | nc ${FIXO} 9000`, pt: 'O chat responde de fora.', en: 'The chat answers from outside.' },
    { cmd: "curl -s http://$(oc get svc leaderboard -n games -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):8080", pt: 'E o placar também.', en: 'And so does the leaderboard.' },
  ],
};
