import { deployment, service, REGISTRY } from '../../engine/world.js';

const NS = 'billing';

export default {
  id: 'c0-inventario',
  minutes: 15,
  xp: 120,
  difficulty: 2,
  objectives: ['Consultar, formatar e filtrar atributos de recursos', 'Examinar recursos e o status do cluster', 'Trabalhar com labels e selectors'],
  title: { pt: 'Inventário para a auditoria', en: 'Inventory for the audit' },
  startNamespace: 'default',
  story: {
    pt: 'A auditoria interna pediu um levantamento do ambiente de faturamento até o fim do dia. Ninguém quer planilha preenchida à mão: os dados precisam sair direto do cluster.',
    en: 'Internal audit asked for a survey of the billing environment by the end of the day. Nobody wants a hand-filled spreadsheet: the data must come straight from the cluster.',
  },
  tasks: {
    pt: [
      'Todos os dados são do projeto `billing`. O diretório `~/audit` já existe.',
      'Grave em `~/audit/backend-pods.txt` o nome de cada pod com o label `tier=backend`, um por linha.',
      'Grave em `~/audit/images.txt` a imagem de cada pod do projeto, uma linha por pod.',
      'Grave em `~/audit/kubelet.txt` a versão do kubelet do nó `master01`.',
      'Grave em `~/audit/db-ip.txt` o ClusterIP do service `billing-db`.',
    ],
    en: [
      'All data comes from the `billing` project. The `~/audit` directory already exists.',
      'Write to `~/audit/backend-pods.txt` the name of every pod labeled `tier=backend`, one per line.',
      'Write to `~/audit/images.txt` the image of every pod in the project, one line per pod.',
      'Write to `~/audit/kubelet.txt` the kubelet version of the `master01` node.',
      'Write to `~/audit/db-ip.txt` the ClusterIP of the `billing-db` service.',
    ],
  },
  hints: [
    { pt: '`-l chave=valor` filtra por label; `-o jsonpath=...` extrai só o campo que interessa.', en: '`-l key=value` filters by label; `-o jsonpath=...` extracts only the field you need.' },
    { pt: 'Para uma linha por item use `{range .items[*]}{.campo}{"\\n"}{end}`.', en: 'For one line per item use `{range .items[*]}{.field}{"\\n"}{end}`.' },
    { pt: 'Descubra o caminho do campo com `-o yaml` primeiro: a versão do kubelet fica em `.status.nodeInfo`.', en: 'Find the field path with `-o yaml` first: the kubelet version lives under `.status.nodeInfo`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('billing-api', NS, 'nimbus/billing-api:1.1', { replicas: 2, labels: { tier: 'backend' }, env: { DB_HOST: 'billing-db' } }));
    w.cluster.create(deployment('reports', NS, 'nimbus/reports:4.0', { labels: { tier: 'backend' } }));
    w.cluster.create(deployment('portal', NS, 'nimbus/portal:1.1', { labels: { tier: 'frontend' } }));
    w.cluster.create(deployment('billing-db', NS, 'rhel9/mysql-80:1-228', { labels: { tier: 'database' }, env: { MYSQL_ROOT_PASSWORD: 'nimbus-root' } }));
    for (const n of ['billing-api', 'reports', 'portal']) w.cluster.create(service(n, NS));
    w.cluster.create(service('billing-db', NS, 3306));
    w.fs.mkdir('/home/student/audit', true);
  },
  checks: [
    {
      text: { pt: 'backend-pods.txt lista exatamente os pods com tier=backend', en: 'backend-pods.txt lists exactly the pods labeled tier=backend' },
      test: (w) => {
        const esperado = w.pods(NS, { tier: 'backend' }).map((p) => p.metadata.name).sort();
        return esperado.length === 3 && JSON.stringify(w.lines('audit/backend-pods.txt')) === JSON.stringify(esperado);
      },
    },
    {
      text: { pt: 'images.txt tem a imagem de cada pod do projeto', en: 'images.txt has the image of every pod in the project' },
      test: (w) => {
        const esperado = w.pods(NS).map((p) => p.spec.containers[0].image).sort();
        return JSON.stringify(w.lines('audit/images.txt')) === JSON.stringify(esperado);
      },
    },
    {
      text: { pt: 'kubelet.txt tem a versão do kubelet de master01', en: 'kubelet.txt has the kubelet version of master01' },
      test: (w) => w.file('audit/kubelet.txt') === w.get('Node', 'master01').status.nodeInfo.kubeletVersion,
    },
    {
      text: { pt: 'db-ip.txt tem o ClusterIP do service billing-db', en: 'db-ip.txt has the ClusterIP of the billing-db service' },
      test: (w) => w.file('audit/db-ip.txt') === w.get('Service', 'billing-db', NS).spec.clusterIP,
    },
  ],
  solution: [
    { cmd: 'oc project billing', pt: 'Entra no projeto para não repetir `-n billing`.', en: 'Switches to the project to avoid repeating `-n billing`.' },
    { cmd: 'oc get pods --show-labels', pt: 'Olha os pods e os labels antes de filtrar.', en: 'Looks at the pods and labels before filtering.' },
    { cmd: `oc get pods -l tier=backend -o jsonpath='{range .items[*]}{.metadata.name}{"\\n"}{end}' > ~/audit/backend-pods.txt`, pt: 'Filtra por label e imprime um nome por linha.', en: 'Filters by label and prints one name per line.' },
    { cmd: `oc get pods -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\\n"}{end}' > ~/audit/images.txt`, pt: 'Mesmo padrão, agora com a imagem do contêiner.', en: 'Same pattern, now with the container image.' },
    { cmd: `oc get node master01 -o jsonpath='{.status.nodeInfo.kubeletVersion}' > ~/audit/kubelet.txt`, pt: 'Um único objeto: o caminho começa direto no campo.', en: 'A single object: the path starts right at the field.' },
    { cmd: `oc get service billing-db -o jsonpath='{.spec.clusterIP}' > ~/audit/db-ip.txt`, pt: 'O ClusterIP fica em `.spec.clusterIP`.', en: 'The ClusterIP lives at `.spec.clusterIP`.' },
  ],
  _registry: REGISTRY,
};
