import { deployment, service } from '../../engine/world.js';

const NS = 'shop';

export default {
  id: 'e3-rede',
  minutes: 20,
  xp: 190,
  difficulty: 2,
  objectives: ['Usar as redes de pods e services', 'Solucionar problemas de contêineres e pods'],
  title: { pt: 'O backend sumiu', en: 'The backend is gone' },
  startNamespace: NS,
  story: {
    pt: 'Depois de uma "padronização de labels", o frontend da loja não consegue mais falar com o backend. Os pods do backend estão rodando, mas quem chama o service recebe conexão recusada.',
    en: 'After a "label standardization", the store frontend can no longer talk to the backend. The backend pods are running, but whoever calls the service gets connection refused.',
  },
  tasks: {
    pt: [
      'No projeto `shop`, faça o service `backend` voltar a encaminhar para os pods do deployment `backend`, sem mexer no deployment.',
      'Confirme de dentro de um pod do `frontend` que `http://backend:8080` responde.',
      'Grave em `~/shop/dns.txt` o nome DNS completo (FQDN) do service `backend`.',
    ],
    en: [
      'In the `shop` project, make the `backend` service forward to the pods of the `backend` deployment again, without touching the deployment.',
      'Confirm from inside a `frontend` pod that `http://backend:8080` answers.',
      'Write to `~/shop/dns.txt` the full DNS name (FQDN) of the `backend` service.',
    ],
  },
  hints: [
    { pt: '`oc describe svc backend` mostra o seletor e os endpoints; compare com `oc get pods --show-labels`.', en: '`oc describe svc backend` shows the selector and endpoints; compare with `oc get pods --show-labels`.' },
    { pt: '`oc set selector svc/backend app=backend` troca o seletor (ou edite com `oc edit`).', en: '`oc set selector svc/backend app=backend` changes the selector (or edit it with `oc edit`).' },
    { pt: 'O DNS de um service é `NOME.PROJETO.svc.cluster.local`; o `/etc/resolv.conf` do pod mostra os domínios de busca.', en: 'A service DNS name is `NAME.PROJECT.svc.cluster.local`; the pod `/etc/resolv.conf` shows the search domains.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('backend', NS, 'nimbus/inventory:3.3', { replicas: 2 }));
    c.create(deployment('frontend', NS, 'nimbus/portal:2.0'));
    const svc = service('backend', NS);
    svc.spec.selector = { app: 'backend-api' };
    c.create(svc);
    c.create(service('frontend', NS));
    w.fs.mkdir('/home/student/shop', true);
  },
  checks: [
    {
      text: { pt: 'O service backend tem os 2 pods como endpoints', en: 'The backend service has the 2 pods as endpoints' },
      test: (w) => (w.get('Endpoints', 'backend', NS)?.subsets || []).flatMap((s) => s.addresses || []).length === 2 && w.ready('backend', NS),
    },
    { text: { pt: 'dns.txt tem o FQDN do service', en: 'dns.txt has the service FQDN' }, test: (w) => w.file('shop/dns.txt') === 'backend.shop.svc.cluster.local' },
  ],
  solution: [
    { cmd: 'oc project shop', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc exec deploy/frontend -- curl -s http://backend:8080', pt: 'Falha: o service não tem endpoints.', en: 'Fails: the service has no endpoints.', falha: true },
    { cmd: 'oc describe svc backend | grep -E "Selector|Endpoints"', pt: 'Seletor `app=backend-api`, nenhum endpoint.', en: 'Selector `app=backend-api`, no endpoints.' },
    { cmd: 'oc get pods --show-labels', pt: 'Os pods têm `app=backend`.', en: 'The pods have `app=backend`.' },
    { cmd: 'oc set selector svc/backend app=backend', pt: 'Corrige o seletor.', en: 'Fixes the selector.' },
    { cmd: 'oc exec deploy/frontend -- curl -s http://backend:8080', pt: 'Responde.', en: 'It answers.' },
    { cmd: 'oc exec deploy/frontend -- cat /etc/resolv.conf', pt: 'Domínios de busca: `shop.svc.cluster.local`...', en: 'Search domains: `shop.svc.cluster.local`...' },
    { cmd: 'echo backend.shop.svc.cluster.local > ~/shop/dns.txt', pt: 'Grava o FQDN.', en: 'Writes the FQDN.' },
  ],
};
