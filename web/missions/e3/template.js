import { b64 } from '../../sim/util.js';

const NS = 'inventory';

export default {
  id: 'e3-template',
  minutes: 20,
  xp: 180,
  difficulty: 2,
  objectives: ['Implantar aplicações a partir de uma imagem e de um template'],
  title: { pt: 'Banco do estoque', en: 'Inventory database' },
  startNamespace: NS,
  story: {
    pt: 'O sistema de estoque vai sair da planilha e precisa de um banco MariaDB com dados persistentes. O cluster já tem um template pronto no projeto `openshift`; basta preencher os parâmetros certos.',
    en: 'The inventory system is moving off the spreadsheet and needs a MariaDB database with persistent data. The cluster already has a ready template in the `openshift` project; you only need the right parameters.',
  },
  tasks: {
    pt: [
      'No projeto `inventory`, implante o template `mariadb-persistent` com os parâmetros:',
      '`DATABASE_SERVICE_NAME=inventorydb`, `MYSQL_USER=stock`, `MYSQL_PASSWORD=St0ck-2026`, `MYSQL_DATABASE=inventory` e `VOLUME_CAPACITY=2Gi`.',
      'O deployment `inventorydb` deve ficar pronto, com o PVC `inventorydb` ligado (`Bound`) a um volume.',
    ],
    en: [
      'In the `inventory` project, deploy the `mariadb-persistent` template with the parameters:',
      '`DATABASE_SERVICE_NAME=inventorydb`, `MYSQL_USER=stock`, `MYSQL_PASSWORD=St0ck-2026`, `MYSQL_DATABASE=inventory`, and `VOLUME_CAPACITY=2Gi`.',
      'The `inventorydb` deployment must be ready, with the `inventorydb` PVC bound (`Bound`) to a volume.',
    ],
  },
  hints: [
    { pt: '`oc get templates -n openshift` lista os templates; `oc process --parameters mariadb-persistent -n openshift` mostra os parâmetros.', en: '`oc get templates -n openshift` lists the templates; `oc process --parameters mariadb-persistent -n openshift` shows the parameters.' },
    { pt: '`oc new-app --template mariadb-persistent -p CHAVE=valor ...` processa e cria tudo.', en: '`oc new-app --template mariadb-persistent -p KEY=value ...` processes and creates everything.' },
    { pt: 'Teste o banco: `oc exec deploy/inventorydb -- mysql -u stock -pSt0ck-2026 inventory -e "SELECT 1"`.', en: 'Test the database: `oc exec deploy/inventorydb -- mysql -u stock -pSt0ck-2026 inventory -e "SELECT 1"`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
  },
  checks: [
    {
      text: { pt: 'O secret inventorydb tem o usuário, a senha e o banco pedidos', en: 'The inventorydb secret has the requested user, password, and database' },
      test: (w) => {
        const d = w.get('Secret', 'inventorydb', NS)?.data || {};
        const v = (k) => (d[k] ? b64.dec(d[k]) : null);
        return v('database-user') === 'stock' && v('database-password') === 'St0ck-2026' && v('database-name') === 'inventory';
      },
    },
    {
      text: { pt: 'O PVC inventorydb de 2Gi está Bound', en: 'The 2Gi inventorydb PVC is Bound' },
      test: (w) => {
        const p = w.get('PersistentVolumeClaim', 'inventorydb', NS);
        return p?.status?.phase === 'Bound' && p.spec.resources.requests.storage === '2Gi';
      },
    },
    { text: { pt: 'O deployment inventorydb está pronto', en: 'The inventorydb deployment is ready' }, test: (w) => w.ready('inventorydb', NS) },
  ],
  solution: [
    { cmd: 'oc project inventory', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc process --parameters mariadb-persistent -n openshift', pt: 'Os parâmetros do template.', en: 'The template parameters.' },
    { cmd: 'oc new-app --template mariadb-persistent -p DATABASE_SERVICE_NAME=inventorydb -p MYSQL_USER=stock -p MYSQL_PASSWORD=St0ck-2026 -p MYSQL_DATABASE=inventory -p VOLUME_CAPACITY=2Gi', pt: 'Cria secret, service, PVC e deployment.', en: 'Creates the secret, service, PVC, and deployment.' },
    { cmd: 'oc rollout status deployment/inventorydb', pt: 'O banco no ar.', en: 'The database is up.' },
    { cmd: 'oc get pvc', pt: '`Bound`, 2Gi.', en: '`Bound`, 2Gi.' },
  ],
};
