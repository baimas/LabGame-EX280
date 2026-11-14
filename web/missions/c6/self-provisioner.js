import { provedorNimbus, SENHAS } from '../c3/comum.js';
import { copia } from './comum.js';
import { configProjetos, reconciliaPapeisPadrao } from '../../sim/projetos.js';
import { pode } from '../../sim/rbac.js';

const MSG = 'Projetos novos são pedidos pelo portal da Plataforma Nimbus.';
const pedir = (c, u) => pode(c, u, 'create', 'projectrequests', 'project.openshift.io');

export default {
  id: 'c6-self-provisioner',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Configurar o autoprovisionamento de projetos', 'Modificar permissões de usuários e grupos'],
  title: { pt: 'Projeto só com pedido', en: 'Projects by request only' },
  story: {
    pt: 'O cluster tem 140 projetos e metade está abandonada. A partir de hoje, só os líderes técnicos criam projetos; os demais pedem pelo portal. E a regra precisa sobreviver ao próximo reinício do servidor de API.',
    en: 'The cluster has 140 projects and half of them are abandoned. From today on, only tech leads create projects; everyone else asks through the portal. And the rule must survive the next API server restart.',
  },
  tasks: {
    pt: [
      'Crie o grupo `project-leads` com o usuário `ana`. Só os membros dele podem criar projetos.',
      '`bruno` e `developer` não podem mais criar projetos. Os projetos que já existem não mudam.',
      'A configuração precisa sobreviver a um reinício do servidor de API.',
      `Quem não puder criar projetos deve ver a mensagem: \`${MSG}\``,
    ],
    en: [
      'Create the `project-leads` group with the `ana` user. Only its members may create projects.',
      '`bruno` and `developer` may no longer create projects. Existing projects stay as they are.',
      'The configuration must survive an API server restart.',
      `Whoever cannot create projects must see the message: \`${MSG}\``,
    ],
  },
  hints: [
    { pt: 'O papel `self-provisioner` chega a todo mundo pelo clusterrolebinding `self-provisioners`, para o grupo `system:authenticated:oauth`.', en: 'The `self-provisioner` role reaches everyone through the `self-provisioners` clusterrolebinding, for the `system:authenticated:oauth` group.' },
    { pt: 'Na partida, o servidor de API recoloca os bindings padrão, a menos que tenham a anotação `rbac.authorization.kubernetes.io/autoupdate: "false"`. Apagar o binding não basta: ele volta.', en: 'On startup, the API server restores the default bindings unless they carry the `rbac.authorization.kubernetes.io/autoupdate: "false"` annotation. Deleting the binding is not enough: it comes back.' },
    { pt: 'A mensagem fica em `spec.projectRequestMessage` de `projects.config.openshift.io/cluster` (e mudar esse objeto reinicia o openshift-apiserver).', en: 'The message goes in `spec.projectRequestMessage` of `projects.config.openshift.io/cluster` (and changing that object restarts openshift-apiserver).' },
  ],
  setup(w) {
    provedorNimbus(w, ['ana', 'bruno'], ['ana', 'bruno']);
  },
  checks: [
    {
      text: { pt: 'ana, do grupo project-leads, pode criar projetos', en: 'ana, in the project-leads group, can create projects' },
      test: (w) => (w.get('Group', 'project-leads')?.users || []).includes('ana') && pedir(w.cluster, 'ana'),
    },
    {
      text: { pt: 'bruno e developer não podem criar projetos', en: 'bruno and developer cannot create projects' },
      test: (w) => !pedir(w.cluster, 'bruno') && !pedir(w.cluster, 'developer'),
    },
    {
      text: { pt: 'A regra continua valendo depois de reiniciar o servidor de API', en: 'The rule still holds after an API server restart' },
      test: (w) => {
        const c = copia(w);
        reconciliaPapeisPadrao(c);
        return !pedir(c, 'bruno') && pedir(c, 'ana');
      },
    },
    {
      text: { pt: 'A mensagem de recusa está em vigor', en: 'The refusal message is in effect' },
      test: (w) => configProjetos(w.cluster).projectRequestMessage === MSG,
    },
  ],
  solution: [
    { cmd: 'oc describe clusterrolebinding self-provisioners', pt: 'O papel vai para todos os usuários autenticados.', en: 'The role goes to every authenticated user.' },
    { cmd: 'oc annotate clusterrolebinding self-provisioners rbac.authorization.kubernetes.io/autoupdate=false --overwrite', pt: 'Impede que o servidor de API restaure o binding.', en: 'Stops the API server from restoring the binding.' },
    { cmd: 'oc patch clusterrolebinding.rbac self-provisioners -p \'{"subjects":null}\'', pt: 'Tira todo mundo do binding, sem apagá-lo.', en: 'Removes everyone from the binding, without deleting it.' },
    { cmd: 'oc adm groups new project-leads ana', pt: 'Cria o grupo dos líderes.', en: 'Creates the leads group.' },
    { cmd: 'oc adm policy add-cluster-role-to-group self-provisioner project-leads', pt: 'Só o grupo recebe o papel.', en: 'Only the group gets the role.' },
    { cmd: `oc patch projects.config.openshift.io cluster --type merge -p '{"spec":{"projectRequestMessage":"${MSG}"}}'`, pt: 'A mensagem para quem não pode criar.', en: 'The message for whoever cannot create.' },
    { cmd: 'sleep 60', pt: 'O openshift-apiserver reinicia, e o binding continua como deixamos.', en: 'openshift-apiserver restarts, and the binding stays as we left it.' },
    { cmd: `oc login -u bruno -p '${SENHAS.bruno}'`, pt: 'Testa com quem não é líder.', en: 'Tests with someone who is not a lead.' },
    { cmd: 'oc new-project teste-bruno', pt: 'Recusado, com a mensagem nova.', en: 'Refused, with the new message.', falha: true },
    { cmd: `oc login -u ana -p '${SENHAS.ana}'`, pt: 'Agora com a líder.', en: 'Now with the lead.' },
    { cmd: 'oc auth can-i create projectrequests', pt: '`yes`.', en: '`yes`.' },
    { cmd: 'oc login -u admin -p redhatocp', pt: 'Volta para o admin.', en: 'Back to admin.' },
  ],
};
