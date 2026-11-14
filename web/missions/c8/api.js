import { deployment } from '../../engine/world.js';

const NS = 'observability';
const SA = 'pod-watcher';
const USUARIO = `system:serviceaccount:${NS}:${SA}`;

export default {
  id: 'c8-api',
  minutes: 20,
  xp: 240,
  difficulty: 3,
  objectives: ['Criar e usar service accounts', 'Permitir que aplicações acessem a API do Kubernetes', 'Modificar permissões de usuários e grupos'],
  title: { pt: 'Quem vigia os pods', en: 'Who watches the pods' },
  story: {
    pt: 'O time de Observabilidade criou um painel que lista os pods da loja online consultando a API do cluster. O deployment sobe, mas cai na mesma hora com `Forbidden`. A aplicação precisa ler, e só ler.',
    en: 'The Observability team built a dashboard that lists the online store pods by querying the cluster API. The deployment starts, but crashes right away with `Forbidden`. The application needs to read, and only read.',
  },
  tasks: {
    pt: [
      `No projeto \`observability\`, crie a service account \`${SA}\` e faça o deployment \`pod-watcher\` usá-la.`,
      'A aplicação lista os pods dos projetos `observability` e `shop` (variável `WATCH_NAMESPACES`). Dê a ela o papel `view` nesses dois projetos, e só neles.',
      'O deployment deve ficar com o pod pronto.',
    ],
    en: [
      `In the \`observability\` project, create the \`${SA}\` service account and make the \`pod-watcher\` deployment use it.`,
      'The application lists the pods of the `observability` and `shop` projects (`WATCH_NAMESPACES` variable). Give it the `view` role in those two projects, and only there.',
      'The deployment must end up with its pod ready.',
    ],
  },
  hints: [
    { pt: 'Os logs mostram o usuário que a aplicação usa: `system:serviceaccount:PROJETO:CONTA`.', en: 'The logs show the user the application acts as: `system:serviceaccount:PROJECT:ACCOUNT`.' },
    { pt: '`oc policy add-role-to-user view -z CONTA` vale para a conta do projeto atual. Em outro projeto, use `-n shop` com o nome completo `system:serviceaccount:observability:pod-watcher`.', en: '`oc policy add-role-to-user view -z ACCOUNT` works for an account of the current project. In another project, use `-n shop` with the full name `system:serviceaccount:observability:pod-watcher`.' },
    { pt: 'Um clusterrolebinding daria acesso a todos os projetos: não é o pedido.', en: 'A clusterrolebinding would grant access to every project: that is not what was asked.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: 'shop' } });
    c.create(deployment('storefront', 'shop', 'nimbus/portal:1.1', { replicas: 2 }));
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('pod-watcher', NS, 'nimbus/pod-watcher:1.0', { env: { WATCH_NAMESPACES: 'observability,shop' } }));
  },
  checks: [
    {
      text: { pt: 'pod-watcher usa a service account e está pronto', en: 'pod-watcher uses the service account and is ready' },
      test: (w) => w.ready('pod-watcher', NS) && w.pods(NS, { app: 'pod-watcher' }).every((p) => p.spec.serviceAccountName === SA),
    },
    {
      text: { pt: 'A conta lê pods em observability e shop', en: 'The account reads pods in observability and shop' },
      test: (w) => ['observability', 'shop'].every((n) => w.pode(USUARIO, 'list', 'pods', '', n)),
    },
    {
      text: { pt: 'A conta só lê, e só nesses projetos', en: 'The account only reads, and only in those projects' },
      test: (w) => !w.pode(USUARIO, 'delete', 'pods', '', 'shop') && !w.pode(USUARIO, 'create', 'deployments', 'apps', NS) && !w.pode(USUARIO, 'list', 'pods', '', 'default'),
    },
  ],
  solution: [
    { cmd: 'oc project observability', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc logs deployment/pod-watcher', pt: 'A conta `default` não pode listar pods.', en: 'The `default` account cannot list pods.' },
    { cmd: `oc create serviceaccount ${SA}`, pt: 'Uma conta própria para a aplicação.', en: 'A dedicated account for the application.' },
    { cmd: `oc policy add-role-to-user view -z ${SA}`, pt: 'Leitura no próprio projeto.', en: 'Read access in its own project.' },
    { cmd: `oc policy add-role-to-user view ${USUARIO} -n shop`, pt: 'Leitura no `shop`, com o nome completo da conta.', en: 'Read access in `shop`, with the full account name.' },
    { cmd: `oc set serviceaccount deployment/pod-watcher ${SA}`, pt: 'O deployment passa a usar a conta.', en: 'The deployment now uses the account.' },
    { cmd: 'sleep 15; oc logs deployment/pod-watcher', pt: 'A aplicação vê os pods dos dois projetos.', en: 'The application sees the pods of both projects.' },
    { cmd: `oc auth can-i delete pods -n shop --as ${USUARIO}`, pt: '`no`: só leitura.', en: '`no`: read only.', falha: true },
  ],
};
