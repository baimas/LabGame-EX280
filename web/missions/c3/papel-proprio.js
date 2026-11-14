import { deployment } from '../../engine/world.js';
import { provedorNimbus } from './comum.js';

const NS = 'support';

export default {
  id: 'c3-papel-proprio',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Modificar permissões de usuários e grupos', 'Criar e gerenciar grupos'],
  title: { pt: 'Um papel sob medida', en: 'A tailor-made role' },
  story: {
    pt: 'O Diego, do plantão, precisa reiniciar o helpdesk de madrugada quando ele trava, mas a auditoria vetou dar `edit`: ele não pode criar nem apagar nada. E a auditoria quer listar os projetos do cluster sem ver o conteúdo deles.',
    en: 'Diego, on call, must restart the helpdesk at night when it hangs, but audit vetoed granting `edit`: he cannot create or delete anything. And audit wants to list the cluster projects without seeing their content.',
  },
  tasks: {
    pt: [
      'No projeto `support`, crie a role `restarter`, que permite consultar (`get`, `list`, `watch`) pods e deployments e alterar (`patch`, `update`) apenas deployments.',
      'Dê a role `restarter` ao usuário `diego` no projeto `support`, pelo rolebinding `diego-restarter`.',
      'Crie a clusterrole `namespace-viewer`, que permite `get` e `list` de namespaces.',
      'Crie o grupo `auditors` com o usuário `bruno` e dê a ele a clusterrole `namespace-viewer` em todo o cluster, pelo clusterrolebinding `auditors-namespaces`.',
    ],
    en: [
      'In the `support` project, create the `restarter` role, which allows reading (`get`, `list`, `watch`) pods and deployments and changing (`patch`, `update`) only deployments.',
      'Grant the `restarter` role to the `diego` user in the `support` project, through the `diego-restarter` rolebinding.',
      'Create the `namespace-viewer` clusterrole, which allows `get` and `list` on namespaces.',
      'Create the `auditors` group with the `bruno` user and grant it the `namespace-viewer` clusterrole cluster-wide, through the `auditors-namespaces` clusterrolebinding.',
    ],
  },
  hints: [
    { pt: '`oc create role` aplica os mesmos verbos a todos os recursos. Para verbos diferentes por recurso, crie com uma regra e acrescente outra com `oc patch --type json` ou `oc edit`.', en: '`oc create role` applies the same verbs to every resource. For different verbs per resource, create it with one rule and add another with `oc patch --type json` or `oc edit`.' },
    { pt: '`oc create rolebinding NOME --role ROLE --user USUÁRIO` e `oc create clusterrolebinding NOME --clusterrole CR --group GRUPO`.', en: '`oc create rolebinding NAME --role ROLE --user USER` and `oc create clusterrolebinding NAME --clusterrole CR --group GROUP`.' },
    { pt: 'Teste com `oc auth can-i patch deployments -n support --as diego` e `oc rollout restart deployment/helpdesk -n support --as diego`.', en: 'Test with `oc auth can-i patch deployments -n support --as diego` and `oc rollout restart deployment/helpdesk -n support --as diego`.' },
  ],
  setup(w) {
    provedorNimbus(w, ['bruno', 'diego'], ['bruno', 'diego']);
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('helpdesk', NS, 'nimbus/portal:1.1'));
  },
  checks: [
    {
      text: { pt: 'diego consulta pods e deployments em support', en: 'diego reads pods and deployments in support' },
      test: (w) => ['get', 'list', 'watch'].every((v) => w.pode('diego', v, 'pods', '', NS) && w.pode('diego', v, 'deployments', 'apps', NS)),
    },
    {
      text: { pt: 'diego altera deployments, mas não cria nem apaga nada, e não altera pods', en: 'diego changes deployments, but creates and deletes nothing, and does not change pods' },
      test: (w) => w.pode('diego', 'patch', 'deployments', 'apps', NS) && w.pode('diego', 'update', 'deployments', 'apps', NS) && !w.pode('diego', 'delete', 'deployments', 'apps', NS) && !w.pode('diego', 'create', 'deployments', 'apps', NS) && !w.pode('diego', 'patch', 'pods', '', NS) && !w.pode('diego', 'delete', 'pods', '', NS),
    },
    {
      text: { pt: 'O acesso de diego vem da role restarter pelo rolebinding diego-restarter', en: 'diego\'s access comes from the restarter role through the diego-restarter rolebinding' },
      test: (w) => {
        const b = w.get('RoleBinding', 'diego-restarter', NS);
        return b?.roleRef.kind === 'Role' && b.roleRef.name === 'restarter' && b.subjects.some((s) => s.kind === 'User' && s.name === 'diego');
      },
    },
    {
      text: { pt: 'bruno, pelo grupo auditors, lista os namespaces do cluster', en: 'bruno, through the auditors group, lists the cluster namespaces' },
      test: (w) => {
        const b = w.get('ClusterRoleBinding', 'auditors-namespaces');
        return (w.get('Group', 'auditors')?.users || []).includes('bruno') && b?.roleRef.name === 'namespace-viewer' && b.subjects.some((s) => s.kind === 'Group' && s.name === 'auditors') && w.pode('bruno', 'list', 'namespaces', '');
      },
    },
    {
      text: { pt: 'bruno não enxerga pods de support', en: 'bruno cannot see pods in support' },
      test: (w) => !w.pode('bruno', 'list', 'pods', '', NS),
    },
  ],
  solution: [
    { cmd: 'oc create role restarter --verb get,list,watch --resource pods,deployments -n support', pt: 'Primeira regra: só leitura de pods e deployments.', en: 'First rule: read-only on pods and deployments.' },
    { cmd: 'oc patch role restarter -n support --type json -p \'[{"op":"add","path":"/rules/-","value":{"apiGroups":["apps"],"resources":["deployments"],"verbs":["patch","update"]}}]\'', pt: 'Segunda regra: alterar apenas deployments.', en: 'Second rule: change deployments only.' },
    { cmd: 'oc describe role restarter -n support', pt: 'Confere as regras.', en: 'Checks the rules.' },
    { cmd: 'oc create rolebinding diego-restarter --role restarter --user diego -n support', pt: 'Liga a role a diego.', en: 'Binds the role to diego.' },
    { cmd: 'oc rollout restart deployment/helpdesk -n support --as diego', pt: 'Testa como diego: o restart funciona.', en: 'Tests as diego: the restart works.' },
    { cmd: 'oc delete deployment helpdesk -n support --as diego', pt: 'E apagar é negado.', en: 'And deleting is denied.', falha: true },
    { cmd: 'oc create clusterrole namespace-viewer --verb get,list --resource namespaces', pt: 'Papel de cluster só para namespaces.', en: 'Cluster role for namespaces only.' },
    { cmd: 'oc adm groups new auditors bruno', pt: 'Cria o grupo de auditoria.', en: 'Creates the audit group.' },
    { cmd: 'oc create clusterrolebinding auditors-namespaces --clusterrole namespace-viewer --group auditors', pt: 'Vale para o cluster inteiro.', en: 'Applies to the whole cluster.' },
    { cmd: 'oc get namespaces --as bruno | head -3', pt: 'bruno lista os namespaces.', en: 'bruno lists the namespaces.' },
  ],
};
