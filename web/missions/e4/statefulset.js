import { dadosDoVolume } from '../../sim/storage.js';

const NS = 'ledger';
const IMG = 'registry.lab.example.com:8443/rhel10/postgresql-18:10.1-4';

const MANIFESTO = `apiVersion: v1
kind: Service
metadata:
  name: ledger-db
  labels:
    app: ledger-db
spec:
  clusterIP: None
  selector:
    app: ledger-db
  ports:
  - name: postgresql
    port: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: ledger-db
spec:
  serviceName: ledger-db
  replicas: 1
  selector:
    matchLabels:
      app: ledger-db
  template:
    metadata:
      labels:
        app: ledger-db
    spec:
      containers:
      - name: postgresql
        image: ${IMG}
        env:
        - name: POSTGRESQL_ADMIN_PASSWORD
          value: ledger-admin
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: data
          mountPath: /var/lib/pgsql/data
  volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes:
      - ReadWriteOnce
      resources:
        requests:
          storage: 1Gi
`;

export default {
  id: 'e4-statefulset',
  minutes: 25,
  xp: 230,
  difficulty: 3,
  objectives: ['Gerenciar armazenamento não compartilhado com stateful sets', 'Provisionar volumes de dados persistentes'],
  title: { pt: 'Cada réplica com seu disco', en: 'Each replica with its own disk' },
  startNamespace: NS,
  story: {
    pt: 'O livro-razão financeiro vai rodar em três instâncias de PostgreSQL, cada uma com os próprios dados. Um deployment com um PVC compartilhado não serve: cada réplica precisa de nome e disco estáveis.',
    en: 'The financial ledger will run on three PostgreSQL instances, each with its own data. A deployment with a shared PVC will not do: each replica needs a stable name and disk.',
  },
  tasks: {
    pt: [
      'O manifesto `~/ledger/ledger-db.yaml` tem um service headless e o stateful set `ledger-db`. Aplique-o no projeto `ledger`.',
      'O stateful set deve ficar com 3 réplicas prontas (`ledger-db-0`, `-1` e `-2`), cada uma com o próprio PVC (`data-ledger-db-N`) `Bound`.',
      'Grave `primario` no arquivo `/var/lib/pgsql/data/role.txt` do pod `ledger-db-0`, apague esse pod e confirme que o pod recriado, com o mesmo nome, ainda tem o arquivo.',
    ],
    en: [
      'The `~/ledger/ledger-db.yaml` manifest has a headless service and the `ledger-db` stateful set. Apply it in the `ledger` project.',
      'The stateful set must end up with 3 ready replicas (`ledger-db-0`, `-1`, and `-2`), each with its own `Bound` PVC (`data-ledger-db-N`).',
      'Write `primario` to the `/var/lib/pgsql/data/role.txt` file of the `ledger-db-0` pod, delete that pod, and confirm that the recreated pod, with the same name, still has the file.',
    ],
  },
  hints: [
    { pt: '`oc scale statefulset/ledger-db --replicas 3`. As réplicas sobem em ordem: cada uma espera a anterior ficar pronta.', en: '`oc scale statefulset/ledger-db --replicas 3`. Replicas start in order: each one waits for the previous one to be ready.' },
    { pt: '`volumeClaimTemplates` cria um PVC por réplica; `oc get pvc` mostra `data-ledger-db-0`, `-1`...', en: '`volumeClaimTemplates` creates one PVC per replica; `oc get pvc` shows `data-ledger-db-0`, `-1`...' },
    { pt: '`oc exec ledger-db-0 -- sh -c \'echo primario > /var/lib/pgsql/data/role.txt\'`.', en: '`oc exec ledger-db-0 -- sh -c \'echo primario > /var/lib/pgsql/data/role.txt\'`.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.fs.put('/home/student/ledger/ledger-db.yaml', MANIFESTO);
  },
  checks: [
    {
      text: { pt: 'ledger-db tem 3 réplicas prontas', en: 'ledger-db has 3 ready replicas' },
      test: (w) => {
        const s = w.get('StatefulSet', 'ledger-db', NS);
        return s?.spec.replicas === 3 && s.status?.readyReplicas === 3 && w.get('Service', 'ledger-db', NS)?.spec.clusterIP === 'None';
      },
    },
    {
      text: { pt: 'Cada réplica tem o próprio PVC Bound', en: 'Each replica has its own Bound PVC' },
      test: (w) => [0, 1, 2].every((i) => w.get('PersistentVolumeClaim', `data-ledger-db-${i}`, NS)?.status?.phase === 'Bound'),
    },
    {
      text: { pt: 'role.txt sobreviveu à recriação de ledger-db-0', en: 'role.txt survived the recreation of ledger-db-0' },
      test: (w) => {
        const v = dadosDoVolume(w.cluster, NS, 'data-ledger-db-0');
        const atual = w.get('Pod', 'ledger-db-0', NS);
        return (v?.files['role.txt'] || '').trim() === 'primario' && Boolean(atual) && v.autor?.['role.txt'] !== atual.metadata.uid;
      },
    },
  ],
  solution: [
    { cmd: 'oc project ledger', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc apply -f ~/ledger/ledger-db.yaml', pt: 'Service headless e stateful set.', en: 'Headless service and stateful set.' },
    { cmd: 'oc scale statefulset/ledger-db --replicas 3', pt: 'Três réplicas.', en: 'Three replicas.' },
    { cmd: 'oc rollout status statefulset/ledger-db', pt: 'Sobem em ordem: 0, 1, 2.', en: 'They start in order: 0, 1, 2.' },
    { cmd: 'oc get pods,pvc', pt: 'Um PVC por réplica.', en: 'One PVC per replica.' },
    { cmd: "oc exec ledger-db-0 -- sh -c 'echo primario > /var/lib/pgsql/data/role.txt'", pt: 'Grava no disco da réplica 0.', en: 'Writes to replica 0 disk.' },
    { cmd: 'oc delete pod ledger-db-0', pt: 'Apaga a réplica 0.', en: 'Deletes replica 0.' },
    { cmd: 'sleep 15; oc exec ledger-db-0 -- cat /var/lib/pgsql/data/role.txt', pt: 'Mesmo nome, mesmo disco.', en: 'Same name, same disk.' },
  ],
};
