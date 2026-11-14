import { deployment, service } from '../../engine/world.js';
import { requisicao } from '../../sim/net.js';
import { deDentro } from './comum.js';

const NS = 'orders';
const HOST = 'orders.apps.ocp4.example.com';

// Requisição HTTP de um pod para um service, com tempo curto.
const acessa = (w, ns, app, alvo) => requisicao(w.cluster, deDentro(w, ns, app), { host: alvo, porta: 8080, caminho: '/', https: false });
const passa = (r) => r.status === 200;

export default {
  id: 'c4-netpol-isola',
  minutes: 30,
  xp: 280,
  difficulty: 3,
  objectives: ['Configurar network policies de aplicações', 'Controlar o tráfego de entrada (ingress) do cluster'],
  title: { pt: 'Ninguém entra sem convite', en: 'No one gets in uninvited' },
  story: {
    pt: 'Um teste de intrusão mostrou que qualquer pod do cluster alcança o banco de pedidos. A nova regra é "negar por padrão": no projeto `orders`, só passa o tráfego que alguém justificou.',
    en: 'A penetration test showed that any pod in the cluster can reach the orders database. The new rule is "deny by default": in the `orders` project, only traffic someone justified gets through.',
  },
  tasks: {
    pt: [
      'No projeto `orders`, crie a network policy `deny-all`, que bloqueia todo o tráfego de entrada de todos os pods do projeto.',
      `Os pods \`orders-web\` devem continuar recebendo o tráfego do roteador na porta 8080, para \`http://${HOST}\` funcionar.`,
      'Os pods `orders-db` devem aceitar conexões na porta 8080 apenas dos pods `orders-web` do próprio projeto e dos pods `app=reports` do projeto `reports`.',
      'Qualquer outro acesso, como os pods do projeto `outsider`, deve ser bloqueado.',
    ],
    en: [
      'In the `orders` project, create the `deny-all` network policy, which blocks all ingress traffic to every pod in the project.',
      `The \`orders-web\` pods must keep receiving router traffic on port 8080, so \`http://${HOST}\` works.`,
      'The `orders-db` pods must accept connections on port 8080 only from the `orders-web` pods of the same project and from the `app=reports` pods of the `reports` project.',
      'Any other access, such as the pods of the `outsider` project, must be blocked.',
    ],
  },
  hints: [
    { pt: 'Uma policy com `podSelector: {}` e nenhuma regra em `ingress` bloqueia toda a entrada. As outras policies somam permissões.', en: 'A policy with `podSelector: {}` and no rule under `ingress` blocks all ingress. Other policies add permissions on top of it.' },
    { pt: 'O tráfego do roteador vem de um namespace com o label `policy-group.network.openshift.io/ingress: ""`. Todo namespace tem o label `kubernetes.io/metadata.name`.', en: 'Router traffic comes from a namespace labeled `policy-group.network.openshift.io/ingress: ""`. Every namespace has the `kubernetes.io/metadata.name` label.' },
    { pt: 'Num mesmo item de `from`, `namespaceSelector` e `podSelector` juntos significam "estes pods naquele namespace". Em itens separados, significam "um ou outro". Teste com `oc exec ... -- curl -s -m 3 ...`.', en: 'In the same `from` item, `namespaceSelector` and `podSelector` together mean "these pods in that namespace". In separate items, they mean "either one". Test with `oc exec ... -- curl -s -m 3 ...`.' },
  ],
  setup(w) {
    const c = w.cluster;
    for (const ns of [NS, 'reports', 'outsider']) c.create({ kind: 'Namespace', metadata: { name: ns } });
    c.create(deployment('orders-web', NS, 'nimbus/portal:1.1', { labels: { tier: 'frontend' } }));
    c.create(deployment('orders-db', NS, 'nimbus/inventory:3.3', { labels: { tier: 'database' } }));
    c.create(service('orders-web', NS));
    c.create(service('orders-db', NS));
    c.create({ kind: 'Route', metadata: { name: 'orders-web', namespace: NS }, spec: { host: HOST, to: { kind: 'Service', name: 'orders-web' } } });
    c.create(deployment('reports', 'reports', 'nimbus/reports:4.1'));
    c.create(deployment('curious', 'outsider', 'nimbus/portal:1.1'));
  },
  checks: [
    {
      text: { pt: 'A policy deny-all bloqueia a entrada em todos os pods de orders', en: 'The deny-all policy blocks ingress to every pod in orders' },
      test: (w) => {
        const np = w.get('NetworkPolicy', 'deny-all', NS);
        const sel = np.spec.podSelector || {};
        return !Object.keys(sel.matchLabels || {}).length && !(sel.matchExpressions || []).length && !(np.spec.ingress || []).length;
      },
    },
    {
      text: { pt: `http://${HOST} continua funcionando`, en: `http://${HOST} keeps working` },
      test: (w) => w.http(`http://${HOST}`).status === 200,
    },
    {
      text: { pt: 'orders-web e reports alcançam orders-db', en: 'orders-web and reports reach orders-db' },
      test: (w) => passa(acessa(w, NS, 'orders-web', 'orders-db')) && passa(acessa(w, 'reports', 'reports', 'orders-db.orders')),
    },
    {
      text: { pt: 'outsider não alcança orders-db nem orders-web', en: 'outsider reaches neither orders-db nor orders-web' },
      test: (w) => !passa(acessa(w, 'outsider', 'curious', 'orders-db.orders')) && !passa(acessa(w, 'outsider', 'curious', 'orders-web.orders')),
    },
    {
      text: { pt: 'reports não alcança orders-web, e orders-db não alcança orders-web', en: 'reports does not reach orders-web, and orders-db does not reach orders-web' },
      test: (w) => !passa(acessa(w, 'reports', 'reports', 'orders-web.orders')) && !passa(acessa(w, NS, 'orders-db', 'orders-web')),
    },
  ],
  solution: [
    { cmd: 'oc project orders', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `cat > deny-all.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
spec:
  podSelector: {}
EOF`, pt: 'Seleciona todos os pods e não libera nada.', en: 'Selects every pod and allows nothing.' },
    { cmd: `cat > allow-router.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-router
spec:
  podSelector:
    matchLabels:
      app: orders-web
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              policy-group.network.openshift.io/ingress: ""
      ports:
        - port: 8080
EOF`, pt: 'Libera o roteador só para orders-web.', en: 'Allows the router to orders-web only.' },
    { cmd: `cat > allow-db.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-db
spec:
  podSelector:
    matchLabels:
      app: orders-db
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: orders-web
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: reports
          podSelector:
            matchLabels:
              app: reports
      ports:
        - port: 8080
EOF`, pt: 'Dois itens em `from`: orders-web do próprio projeto, ou pods reports no projeto reports.', en: 'Two `from` items: orders-web from this project, or reports pods in the reports project.' },
    { cmd: 'oc apply -f deny-all.yaml -f allow-router.yaml -f allow-db.yaml', pt: 'Aplica as três policies.', en: 'Applies the three policies.' },
    { cmd: 'oc exec -n outsider deploy/curious -- curl -s -m 3 orders-db.orders:8080', pt: 'Bloqueado: o curl estoura o tempo.', en: 'Blocked: curl times out.', falha: true },
    { cmd: 'oc exec -n reports deploy/reports -- curl -s -m 3 orders-db.orders:8080', pt: 'Liberado.', en: 'Allowed.' },
    { cmd: `curl -s http://${HOST}`, pt: 'A route continua funcionando.', en: 'The route keeps working.' },
  ],
};
