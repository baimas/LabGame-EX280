import { deployment } from '../../engine/world.js';
import { provedorNimbus } from './comum.js';

export default {
  id: 'c3-grupos',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Criar e gerenciar grupos', 'Modificar permissões de usuários e grupos'],
  title: { pt: 'Cada time no seu quadrado', en: 'Every team in its lane' },
  story: {
    pt: 'O Faturamento tem dois projetos: `billing`, que é produção, e `billing-dev`. Até hoje todo mundo pedia acesso individual. A partir de agora as permissões serão dadas a grupos, e cada pessoa entra no grupo do seu time.',
    en: 'Billing has two projects: `billing`, which is production, and `billing-dev`. Until today everybody asked for individual access. From now on permissions go to groups, and each person joins their team group.',
  },
  tasks: {
    pt: [
      'Crie o grupo `billing-devs` com `ana` e `bruno`, e o grupo `billing-qa` com `diego`.',
      '`billing-devs` pode criar e alterar recursos de aplicação em `billing-dev`, mas só consultar em `billing`.',
      '`billing-qa` só pode consultar em `billing-dev` e não tem acesso a `billing`.',
      '`ana` é a responsável por `billing`: deve poder administrar o projeto, inclusive conceder permissões nele.',
      'Use os papéis padrão do cluster.',
    ],
    en: [
      'Create the `billing-devs` group with `ana` and `bruno`, and the `billing-qa` group with `diego`.',
      '`billing-devs` can create and change application resources in `billing-dev`, but only view them in `billing`.',
      '`billing-qa` can only view in `billing-dev` and has no access to `billing`.',
      '`ana` owns `billing`: she must be able to administer the project, including granting permissions in it.',
      'Use the default cluster roles.',
    ],
  },
  hints: [
    { pt: '`oc adm groups new GRUPO usuário...` cria o grupo já com os membros.', en: '`oc adm groups new GROUP user...` creates the group with its members.' },
    { pt: 'Os papéis padrão são `view` (consultar), `edit` (alterar aplicações) e `admin` (tudo no projeto, inclusive permissões).', en: 'The default roles are `view` (read), `edit` (change applications), and `admin` (everything in the project, including permissions).' },
    { pt: '`oc adm policy add-role-to-group PAPEL GRUPO -n PROJETO` e `add-role-to-user`. Confira com `oc auth can-i ... --as usuário`.', en: '`oc adm policy add-role-to-group ROLE GROUP -n PROJECT` and `add-role-to-user`. Check with `oc auth can-i ... --as user`.' },
  ],
  setup(w) {
    provedorNimbus(w, ['ana', 'bruno', 'diego'], ['ana', 'bruno', 'diego']);
    for (const ns of ['billing', 'billing-dev']) {
      w.cluster.create({ kind: 'Namespace', metadata: { name: ns } });
      w.cluster.create(deployment('billing-api', ns, 'nimbus/billing-api:1.1', { env: { DB_HOST: 'billing-db' } }));
    }
  },
  checks: [
    {
      text: { pt: 'Os grupos billing-devs e billing-qa têm os membros certos', en: 'The billing-devs and billing-qa groups have the right members' },
      test: (w) => {
        const dev = w.get('Group', 'billing-devs')?.users || [];
        const qa = w.get('Group', 'billing-qa')?.users || [];
        return dev.length === 2 && dev.includes('ana') && dev.includes('bruno') && qa.length === 1 && qa[0] === 'diego';
      },
    },
    {
      text: { pt: 'billing-devs altera em billing-dev e só consulta em billing', en: 'billing-devs changes things in billing-dev and only views in billing' },
      test: (w) => ['bruno'].every((u) => w.pode(u, 'create', 'deployments', 'apps', 'billing-dev') && w.pode(u, 'list', 'pods', '', 'billing') && !w.pode(u, 'create', 'deployments', 'apps', 'billing') && !w.pode(u, 'create', 'rolebindings', 'rbac.authorization.k8s.io', 'billing')),
    },
    {
      text: { pt: 'billing-qa só consulta em billing-dev e não vê billing', en: 'billing-qa only views in billing-dev and cannot see billing' },
      test: (w) => w.pode('diego', 'list', 'pods', '', 'billing-dev') && !w.pode('diego', 'create', 'deployments', 'apps', 'billing-dev') && !w.pode('diego', 'list', 'pods', '', 'billing'),
    },
    {
      text: { pt: 'ana administra billing, inclusive as permissões', en: 'ana administers billing, including permissions' },
      test: (w) => w.pode('ana', 'create', 'rolebindings', 'rbac.authorization.k8s.io', 'billing') && w.pode('ana', 'delete', 'deployments', 'apps', 'billing'),
    },
    {
      text: { pt: 'As permissões dos times foram dadas aos grupos, não às pessoas', en: 'Team permissions were granted to the groups, not to people' },
      test: (w) => {
        const sujeitos = ['billing', 'billing-dev'].flatMap((ns) => w.list('RoleBinding', ns)).filter((b) => ['edit', 'view'].includes(b.roleRef.name)).flatMap((b) => b.subjects || []);
        return sujeitos.length > 0 && sujeitos.every((s) => s.kind === 'Group');
      },
    },
  ],
  solution: [
    { cmd: 'oc adm groups new billing-devs ana bruno', pt: 'Cria o grupo de desenvolvimento.', en: 'Creates the development group.' },
    { cmd: 'oc adm groups new billing-qa diego', pt: 'Cria o grupo de testes.', en: 'Creates the QA group.' },
    { cmd: 'oc adm policy add-role-to-group edit billing-devs -n billing-dev', pt: 'Desenvolvimento altera em billing-dev.', en: 'Development changes things in billing-dev.' },
    { cmd: 'oc adm policy add-role-to-group view billing-devs -n billing', pt: 'E só consulta em produção.', en: 'And only views production.' },
    { cmd: 'oc adm policy add-role-to-group view billing-qa -n billing-dev', pt: 'Testes só consulta em billing-dev.', en: 'QA only views billing-dev.' },
    { cmd: 'oc adm policy add-role-to-user admin ana -n billing', pt: 'ana administra produção.', en: 'ana administers production.' },
    { cmd: 'oc auth can-i create deployments -n billing --as bruno', pt: 'Deve responder `no`.', en: 'Should answer `no`.', falha: true },
    { cmd: 'oc auth can-i list pods -n billing --as diego', pt: 'Também `no`.', en: 'Also `no`.', falha: true },
    { cmd: 'oc get rolebindings -n billing -o wide', pt: 'Revisa quem tem o quê.', en: 'Reviews who has what.' },
  ],
};
