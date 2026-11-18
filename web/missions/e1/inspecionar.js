import { deployment, service } from '../../engine/world.js';

const NS = 'storefront';

export default {
  id: 'e1-inspecionar',
  minutes: 15,
  xp: 140,
  difficulty: 1,
  objectives: ['Inspecionar recursos do Kubernetes pela CLI e pela interface web'],
  title: { pt: 'Raio X da loja', en: 'Store X-ray' },
  startNamespace: NS,
  story: {
    pt: 'O time da loja virtual vai passar o plantão para você e quer ter certeza de que você sabe achar as informações no cluster sem perguntar a ninguém. As respostas vão para arquivos, para a revisão do líder.',
    en: 'The online store team is handing on-call over to you and wants to be sure you can find information in the cluster without asking anyone. The answers go into files for the lead to review.',
  },
  tasks: {
    pt: [
      'O diretório `~/inspect` já existe. Os dados são do projeto `storefront`.',
      'Grave em `~/inspect/cronjob-api.txt` o grupo e a versão da API do recurso `cronjobs`, no formato `grupo/versão`.',
      'Grave em `~/inspect/frontend-replicas.txt` o número de réplicas pedido no deployment `frontend`.',
      'Grave em `~/inspect/cart-image.txt` a imagem do contêiner do deployment `cart`.',
      'Grave em `~/inspect/cart-selector.txt` o seletor do service `cart`, no formato `chave=valor`.',
    ],
    en: [
      'The `~/inspect` directory already exists. The data comes from the `storefront` project.',
      'Write to `~/inspect/cronjob-api.txt` the API group and version of the `cronjobs` resource, as `group/version`.',
      'Write to `~/inspect/frontend-replicas.txt` the number of replicas requested in the `frontend` deployment.',
      'Write to `~/inspect/cart-image.txt` the container image of the `cart` deployment.',
      'Write to `~/inspect/cart-selector.txt` the selector of the `cart` service, as `key=value`.',
    ],
  },
  hints: [
    { pt: '`oc api-resources` lista cada recurso com o APIVERSION; `oc explain cronjob` também mostra o GROUP e a VERSION.', en: '`oc api-resources` lists each resource with its APIVERSION; `oc explain cronjob` also shows GROUP and VERSION.' },
    { pt: '`oc get deploy NOME -o yaml` mostra tudo; `-o jsonpath=\'{.spec.replicas}\'` pega só um campo.', en: '`oc get deploy NAME -o yaml` shows everything; `-o jsonpath=\'{.spec.replicas}\'` takes a single field.' },
    { pt: '`oc describe svc cart` mostra o seletor na linha `Selector`.', en: '`oc describe svc cart` shows the selector on the `Selector` line.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('frontend', NS, 'nimbus/portal:2.0', { replicas: 3 }));
    c.create(deployment('cart', NS, 'nimbus/inventory:3.3', { labels: { tier: 'cart' } }));
    c.create(service('frontend', NS));
    const svc = service('cart', NS);
    svc.spec.selector = { tier: 'cart' };
    c.create(svc);
    w.fs.mkdir('/home/student/inspect', true);
  },
  checks: [
    { text: { pt: 'cronjob-api.txt tem batch/v1', en: 'cronjob-api.txt has batch/v1' }, test: (w) => w.file('inspect/cronjob-api.txt') === 'batch/v1' },
    { text: { pt: 'frontend-replicas.txt tem o número de réplicas do frontend', en: 'frontend-replicas.txt has the frontend replica count' }, test: (w) => w.file('inspect/frontend-replicas.txt') === String(w.get('Deployment', 'frontend', NS).spec.replicas) },
    { text: { pt: 'cart-image.txt tem a imagem do cart', en: 'cart-image.txt has the cart image' }, test: (w) => w.file('inspect/cart-image.txt') === w.get('Deployment', 'cart', NS).spec.template.spec.containers[0].image },
    { text: { pt: 'cart-selector.txt tem o seletor do service cart', en: 'cart-selector.txt has the cart service selector' }, test: (w) => w.file('inspect/cart-selector.txt') === 'tier=cart' },
  ],
  solution: [
    { cmd: 'oc project storefront', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc api-resources | grep cronjobs', pt: '`batch/v1`.', en: '`batch/v1`.' },
    { cmd: 'echo batch/v1 > ~/inspect/cronjob-api.txt', pt: 'Grava a resposta.', en: 'Writes the answer.' },
    { cmd: "oc get deploy frontend -o jsonpath='{.spec.replicas}' > ~/inspect/frontend-replicas.txt", pt: 'Número de réplicas.', en: 'Replica count.' },
    { cmd: "oc get deploy cart -o jsonpath='{.spec.template.spec.containers[0].image}' > ~/inspect/cart-image.txt", pt: 'Imagem do contêiner.', en: 'Container image.' },
    { cmd: 'oc describe svc cart | grep Selector', pt: '`tier=cart`.', en: '`tier=cart`.' },
    { cmd: 'echo tier=cart > ~/inspect/cart-selector.txt', pt: 'Grava o seletor.', en: 'Writes the selector.' },
  ],
};
