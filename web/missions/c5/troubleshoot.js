import { deployment } from '../../engine/world.js';
import { pool, anuncio, ipDe, noPool, deFora } from './comum.js';

const NS = 'radio';

const lb = (nome, porta, anot) => ({ kind: 'Service', metadata: { name: nome, namespace: NS, labels: { app: nome }, annotations: anot }, spec: { type: 'LoadBalancer', selector: { app: nome }, ports: [{ port: porta, targetPort: porta }] } });

export default {
  id: 'c5-troubleshoot',
  minutes: 30,
  xp: 280,
  difficulty: 3,
  objectives: ['Solucionar problemas de rede definida por software (SDN)', 'Configurar um service do tipo load balancer', 'Configurar network policies de aplicações'],
  title: { pt: 'O IP que ninguém alcança', en: 'The IP nobody can reach' },
  story: {
    pt: 'A rádio interna estreia hoje e nada funciona: o `stream` nunca recebeu IP, o painel `admin` tem IP mas não responde, e o time de Segurança já deixou um deny-all no projeto. Ninguém lembra o que foi configurado no MetalLB.',
    en: 'The internal radio launches today and nothing works: `stream` never got an IP, the `admin` panel has an IP but does not answer, and the Security team already left a deny-all in the project. Nobody remembers what was configured in MetalLB.',
  },
  tasks: {
    pt: [
      'No projeto `radio`, o service `stream` (porta 9000) deve receber um IP do pool `public-pool` e responder da estação de trabalho.',
      'O service `admin` (porta 8080) deve responder da estação de trabalho sem trocar o IP que já tem.',
      'A network policy `deny-all` do projeto não pode ser apagada nem alterada.',
      'Libere de fora do cluster só as portas desses dois services.',
    ],
    en: [
      'In the `radio` project, the `stream` service (port 9000) must get an IP from the `public-pool` pool and answer from the workstation.',
      'The `admin` service (port 8080) must answer from the workstation without changing the IP it already has.',
      'The project `deny-all` network policy may not be deleted or changed.',
      'Open only the ports of those two services to the outside of the cluster.',
    ],
  },
  hints: [
    { pt: 'Comece por `oc describe svc` (eventos do MetalLB) e por `oc get ipaddresspools,l2advertisements -n metallb-system`.', en: 'Start with `oc describe svc` (MetalLB events) and `oc get ipaddresspools,l2advertisements -n metallb-system`.' },
    { pt: 'Um pool com `autoAssign: false` só entrega IP a quem pede o pool pela anotação `metallb.universe.tf/address-pool`. Um IP só responde de fora se algum L2Advertisement anunciar o pool dele. A documentação do 4.22 usa `metallb.io/address-pool`; o prefixo antigo `metallb.universe.tf/` continua aceito.', en: 'A pool with `autoAssign: false` only hands out IPs to whoever asks for it through the `metallb.universe.tf/address-pool` annotation. An IP only answers from outside if some L2Advertisement announces its pool. The 4.22 documentation uses `metallb.io/address-pool`; the old `metallb.universe.tf/` prefix is still accepted.' },
    { pt: 'Tráfego que chega por LoadBalancer vem de fora do cluster: uma regra de ingress só com `ports` (sem `from`) libera a porta para qualquer origem.', en: 'Traffic arriving through a LoadBalancer comes from outside the cluster: an ingress rule with only `ports` (no `from`) opens the port to any source.' },
  ],
  setup(w) {
    const c = w.cluster;
    pool(w, 'lab-pool', '192.168.50.20-192.168.50.29');
    anuncio(w, 'lab-l2', ['lab-pool']);
    pool(w, 'public-pool', '192.168.50.40-192.168.50.44', { autoAssign: false });
    anuncio(w, 'public-l2', ['public-pool']);
    pool(w, 'internal-pool', '192.168.50.50-192.168.50.52', { autoAssign: false });
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('stream', NS, 'nimbus/chat:1.1', { extra: { container: { ports: [{ containerPort: 9000 }] } } }));
    c.create(deployment('admin', NS, 'nimbus/portal:1.1'));
    c.create(lb('stream', 9000, { 'metallb.universe.tf/address-pool': 'publik-pool' }));
    c.create(lb('admin', 8080, { 'metallb.universe.tf/address-pool': 'internal-pool' }));
    c.create({ kind: 'NetworkPolicy', metadata: { name: 'deny-all', namespace: NS }, spec: { podSelector: {} } });
    c.tick(5);
    c.side.missao = { admin: ipDe(w, 'admin', NS), deny: JSON.stringify(c.get('NetworkPolicy', 'deny-all', NS).spec) };
  },
  checks: [
    {
      text: { pt: 'stream recebeu um IP do public-pool', en: 'stream got an IP from public-pool' },
      test: (w) => noPool(w, ipDe(w, 'stream', NS), 'public-pool'),
    },
    {
      text: { pt: 'stream responde da estação de trabalho', en: 'stream answers from the workstation' },
      test: (w) => deFora(w, ipDe(w, 'stream', NS), 9000).proto === 'chat',
    },
    {
      text: { pt: 'admin manteve o IP e responde da estação de trabalho', en: 'admin kept its IP and answers from the workstation' },
      test: (w) => ipDe(w, 'admin', NS) === w.cluster.side.missao.admin && w.http(`http://${w.cluster.side.missao.admin}:8080`).status === 200,
    },
    {
      text: { pt: 'deny-all continua igual', en: 'deny-all is unchanged' },
      test: (w) => JSON.stringify(w.get('NetworkPolicy', 'deny-all', NS)?.spec) === w.cluster.side.missao.deny,
    },
    {
      text: { pt: 'Outras portas dos pods continuam fechadas para fora', en: 'Other pod ports stay closed to the outside' },
      test: (w) => {
        const pol = w.list('NetworkPolicy', NS).filter((p) => p.metadata.name !== 'deny-all');
        const regras = pol.flatMap((p) => p.spec.ingress || []);
        return regras.length > 0 && regras.every((r) => (r.ports || []).length > 0);
      },
    },
  ],
  solution: [
    { cmd: 'oc project radio', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get svc', pt: '`stream` está em `<pending>`; `admin` tem IP.', en: '`stream` is `<pending>`; `admin` has an IP.' },
    { cmd: 'oc describe svc stream | tail -2', pt: 'O pool pedido não existe: a anotação diz `publik-pool`.', en: 'The requested pool does not exist: the annotation says `publik-pool`.' },
    { cmd: 'oc annotate svc stream metallb.universe.tf/address-pool=public-pool --overwrite', pt: 'Corrige o nome do pool.', en: 'Fixes the pool name.' },
    { cmd: 'oc get l2advertisements -n metallb-system', pt: 'Nenhum anúncio inclui o `internal-pool`, então o IP do admin não é anunciado.', en: 'No advertisement includes `internal-pool`, so the admin IP is not announced.' },
    { cmd: `cat > internal-l2.yaml <<EOF
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: internal-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - internal-pool
EOF`, pt: 'Anúncio para o pool do admin.', en: 'Advertisement for the admin pool.' },
    { cmd: 'oc apply -f internal-l2.yaml', pt: 'O IP do admin passa a ser anunciado.', en: 'The admin IP is now announced.' },
    { cmd: `cat > allow-lb.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-lb-ports
spec:
  podSelector: {}
  ingress:
    - ports:
        - port: 9000
        - port: 8080
EOF`, pt: 'Libera só as duas portas, de qualquer origem.', en: 'Opens only the two ports, from any source.' },
    { cmd: 'oc apply -f allow-lb.yaml', pt: 'Soma-se ao deny-all sem alterá-lo.', en: 'Adds to the deny-all without changing it.' },
    { cmd: "echo oi | nc $(oc get svc stream -o jsonpath='{.status.loadBalancer.ingress[0].ip}') 9000", pt: 'O stream responde.', en: 'The stream answers.' },
    { cmd: "curl -s http://$(oc get svc admin -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):8080", pt: 'E o admin também.', en: 'And so does admin.' },
  ],
};
