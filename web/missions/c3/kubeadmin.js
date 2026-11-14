import { KUBEADMIN_SENHA } from '../../sim/rbac.js';
import { provedorNimbus, SENHAS } from './comum.js';

export default {
  id: 'c3-kubeadmin',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Modificar permissões de usuários e grupos', 'Criar e gerenciar grupos', 'Criar e excluir usuários'],
  title: { pt: 'Fechando a porta dos fundos', en: 'Closing the back door' },
  story: {
    pt: 'A auditoria encontrou o usuário `kubeadmin` ativo, com a senha da instalação anotada num wiki antigo. Antes de removê-lo, o cluster precisa de administradores nominais, para ninguém ficar trancado do lado de fora.',
    en: 'Audit found the `kubeadmin` user active, with the installation password written down in an old wiki. Before removing it, the cluster needs named administrators, so nobody gets locked out.',
  },
  tasks: {
    pt: [
      'Crie o grupo `platform-admins` com o usuário `ana`.',
      'Dê ao grupo `platform-admins` o papel `cluster-admin` em todo o cluster.',
      `Confirme que \`ana\` (senha \`${SENHAS.ana}\`) consegue administrar o cluster.`,
      'Remova o usuário temporário `kubeadmin`.',
    ],
    en: [
      'Create the `platform-admins` group with the `ana` user.',
      'Grant the `platform-admins` group the `cluster-admin` role cluster-wide.',
      `Confirm that \`ana\` (password \`${SENHAS.ana}\`) can administer the cluster.`,
      'Remove the temporary `kubeadmin` user.',
    ],
  },
  hints: [
    { pt: '`oc adm policy add-cluster-role-to-group` dá um papel de cluster em todo o cluster.', en: '`oc adm policy add-cluster-role-to-group` grants a cluster role cluster-wide.' },
    { pt: 'Teste com `oc login` como ana e algo que só um administrador faz, como `oc get nodes`.', en: 'Test with `oc login` as ana and something only an administrator can do, such as `oc get nodes`.' },
    { pt: 'O `kubeadmin` não é um usuário do htpasswd: ele existe enquanto existir o secret `kubeadmin` no projeto `kube-system`.', en: '`kubeadmin` is not an htpasswd user: it exists while the `kubeadmin` secret exists in the `kube-system` project.' },
  ],
  setup(w) {
    provedorNimbus(w, ['ana'], ['ana']);
  },
  checks: [
    {
      text: { pt: 'O grupo platform-admins contém ana', en: 'The platform-admins group contains ana' },
      test: (w) => (w.get('Group', 'platform-admins')?.users || []).includes('ana'),
    },
    {
      text: { pt: 'platform-admins tem cluster-admin em todo o cluster', en: 'platform-admins has cluster-admin cluster-wide' },
      test: (w) => w.list('ClusterRoleBinding').some((b) => b.roleRef.name === 'cluster-admin' && (b.subjects || []).some((s) => s.kind === 'Group' && s.name === 'platform-admins')),
    },
    {
      text: { pt: 'ana administra o cluster', en: 'ana administers the cluster' },
      test: (w) => w.credencial('ana', SENHAS.ana) && w.pode('ana', '*', '*', '*'),
    },
    {
      text: { pt: 'O kubeadmin não consegue mais logar', en: 'kubeadmin can no longer log in' },
      test: (w) => !w.get('Secret', 'kubeadmin', 'kube-system') && !w.credencial('kubeadmin', KUBEADMIN_SENHA),
    },
  ],
  solution: [
    { cmd: 'oc adm groups new platform-admins ana', pt: 'Cria o grupo de administradores.', en: 'Creates the administrators group.' },
    { cmd: 'oc adm policy add-cluster-role-to-group cluster-admin platform-admins', pt: 'Dá cluster-admin ao grupo.', en: 'Grants cluster-admin to the group.' },
    { cmd: `oc login -u ana -p '${SENHAS.ana}'`, pt: 'Entra como ana.', en: 'Logs in as ana.' },
    { cmd: 'oc get nodes', pt: 'Só um administrador de cluster lista os nós.', en: 'Only a cluster administrator lists the nodes.' },
    { cmd: 'oc delete secret kubeadmin -n kube-system', pt: 'Remove o kubeadmin, já logado como um administrador nominal.', en: 'Removes kubeadmin, already logged in as a named administrator.' },
  ],
};
