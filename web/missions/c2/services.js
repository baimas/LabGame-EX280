import { deployment } from '../../engine/world.js';

const NS = 'shop';
const HOST = 'catalog-shop.apps.lab.example.com';

export default {
  id: 'c2-services',
  minutes: 20,
  xp: 200,
  difficulty: 3,
  objectives: ['Configurar services', 'Trabalhar com labels e selectors', 'Expor aplicações para acesso externo'],
  title: { pt: 'Loja fora do ar', en: 'Store is down' },
  story: {
    pt: 'A loja virtual saiu do ar depois que um estagiário "organizou" os manifestos de rede. Os pods estão saudáveis, mas o endereço público só devolve a página de aplicação indisponível.',
    en: 'The online store went down after an intern "tidied up" the network manifests. The pods are healthy, but the public address only returns the application-not-available page.',
  },
  tasks: {
    pt: [
      `No projeto \`shop\`, faça \`http://${HOST}\` responder com a aplicação do deployment \`catalog\`.`,
      'Não recrie o deployment `catalog` nem a route `catalog`: corrija o que estiver errado.',
      'O service `catalog` deve continuar existindo e expondo a porta 8080.',
      'O service deve alcançar as 2 réplicas do deployment.',
    ],
    en: [
      `In the \`shop\` project, make \`http://${HOST}\` answer with the application of the \`catalog\` deployment.`,
      'Do not recreate the `catalog` deployment or the `catalog` route: fix whatever is wrong.',
      'The `catalog` service must keep existing and exposing port 8080.',
      'The service must reach both replicas of the deployment.',
    ],
  },
  hints: [
    { pt: 'Siga o caminho da requisição: route → service → endpoints → pods. `oc get endpoints catalog` vazio significa seletor errado ou pods não prontos.', en: 'Follow the request path: route → service → endpoints → pods. An empty `oc get endpoints catalog` means a wrong selector or pods that are not ready.' },
    { pt: 'Compare `oc get pods --show-labels` com o seletor do service, e a porta em que a aplicação escuta com o `targetPort`. De dentro de um pod, `curl` no service mostra se ele responde.', en: 'Compare `oc get pods --show-labels` with the service selector, and the port the application listens on with the `targetPort`. From inside a pod, `curl` against the service shows whether it answers.' },
    { pt: 'A route aponta para uma porta do service pelo nome (`spec.port.targetPort`). `oc patch` ou `oc edit` resolvem sem recriar nada.', en: 'The route points to a service port by name (`spec.port.targetPort`). `oc patch` or `oc edit` fix it without recreating anything.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('catalog', NS, 'nimbus/inventory:3.3', { replicas: 2, labels: { tier: 'backend' } }));
    c.create({ kind: 'Service', metadata: { name: 'catalog', namespace: NS, labels: { app: 'catalog' } }, spec: { selector: { app: 'catalogue' }, ports: [{ name: 'http', port: 8080, targetPort: 80 }] } });
    c.create({ kind: 'Route', metadata: { name: 'catalog', namespace: NS, labels: { app: 'catalog' } }, spec: { host: HOST, to: { kind: 'Service', name: 'catalog' }, port: { targetPort: 'web' } } });
    // Guardado no cluster para sobreviver ao recarregamento da página.
    c.side.missao = { dep: c.get('Deployment', 'catalog', NS).metadata.uid, rota: c.get('Route', 'catalog', NS).metadata.uid };
  },
  checks: [
    {
      text: { pt: `http://${HOST} responde com a aplicação`, en: `http://${HOST} answers with the application` },
      test: (w) => {
        const r = w.http(`http://${HOST}`);
        return r.status === 200 && r.corpo.includes('inventory');
      },
    },
    {
      text: { pt: 'O deployment e a route originais foram mantidos', en: 'The original deployment and route were kept' },
      test: (w) => w.get('Deployment', 'catalog', NS).metadata.uid === w.cluster.side.missao.dep && w.get('Route', 'catalog', NS).metadata.uid === w.cluster.side.missao.rota,
    },
    {
      text: { pt: 'O service catalog expõe a porta 8080 e alcança as 2 réplicas', en: 'The catalog service exposes port 8080 and reaches both replicas' },
      test: (w) => {
        const s = w.get('Service', 'catalog', NS);
        const ep = w.get('Endpoints', 'catalog', NS);
        return s.spec.ports.some((p) => p.port === 8080) && (ep?.subsets || []).flatMap((x) => x.addresses || []).length === 2;
      },
    },
  ],
  solution: [
    { cmd: 'oc project shop', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `curl -s -o /dev/null -w '%{http_code}\\n' http://${HOST}`, pt: 'Confirma o sintoma: 503.', en: 'Confirms the symptom: 503.' },
    { cmd: 'oc get endpoints catalog', pt: 'Sem endpoints: o service não seleciona nenhum pod.', en: 'No endpoints: the service selects no pod.' },
    { cmd: 'oc get svc catalog -o wide && oc get pods --show-labels', pt: 'O service procura `app=catalogue`, mas os pods têm `app=catalog`.', en: 'The service looks for `app=catalogue`, but the pods have `app=catalog`.' },
    { cmd: 'oc patch svc catalog -p \'{"spec":{"selector":{"app":"catalog"}}}\'', pt: 'Corrige o seletor.', en: 'Fixes the selector.' },
    { cmd: 'oc rsh deploy/catalog curl -s -m 3 catalog:8080', falha: true, pt: 'Ainda falha: o service manda para a porta 80, e a aplicação escuta na 8080.', en: 'Still failing: the service sends traffic to port 80, and the application listens on 8080.' },
    { cmd: 'oc patch svc catalog --type json -p \'[{"op":"replace","path":"/spec/ports/0/targetPort","value":8080}]\'', pt: 'Corrige o `targetPort`.', en: 'Fixes the `targetPort`.' },
    { cmd: 'oc get route catalog -o jsonpath=\'{.spec.port.targetPort}{"\\n"}\'', pt: 'A route aponta para a porta `web`, que não existe no service (a porta se chama `http`).', en: 'The route points to the `web` port, which does not exist on the service (the port is named `http`).' },
    { cmd: 'oc patch route catalog -p \'{"spec":{"port":{"targetPort":"http"}}}\'', pt: 'Aponta a route para a porta certa.', en: 'Points the route to the right port.' },
    { cmd: `curl -s http://${HOST}`, pt: 'A loja responde.', en: 'The store answers.' },
  ],
};
