import { provedorNimbus, SENHAS } from './comum.js';

const NOVA = 'Bruno@Nova1';

export default {
  id: 'c3-usuarios',
  minutes: 20,
  xp: 220,
  difficulty: 3,
  objectives: ['Criar e excluir usuários', 'Alterar senhas de usuários', 'Configurar o identity provider HTPasswd'],
  title: { pt: 'Entra um, sai outro', en: 'One in, one out' },
  story: {
    pt: 'Dia de movimentação no time de Faturamento: Carla saiu da empresa, Diego entrou, e Bruno teve a senha exposta numa planilha compartilhada. Tudo isso precisa estar resolvido antes do fim do expediente.',
    en: 'A busy day in the Billing team: Carla left the company, Diego joined, and Bruno had his password exposed in a shared spreadsheet. All of it must be settled before the end of the day.',
  },
  tasks: {
    pt: [
      'Os usuários do provedor `nimbus-users` estão no secret `nimbus-htpasswd`, no projeto `openshift-config`.',
      `Troque a senha de \`bruno\` para \`${NOVA}\`. A senha antiga deve deixar de funcionar.`,
      'Remova `carla` por completo: ela não pode mais logar e não pode sobrar usuário nem identidade dela no cluster.',
      `Acrescente o usuário \`diego\` com a senha \`${SENHAS.diego}\`.`,
      '`ana` deve continuar logando com a senha atual.',
    ],
    en: [
      'The users of the `nimbus-users` provider are in the `nimbus-htpasswd` secret, in the `openshift-config` project.',
      `Change the \`bruno\` password to \`${NOVA}\`. The old password must stop working.`,
      'Remove `carla` completely: she can no longer log in, and no user or identity of hers may remain in the cluster.',
      `Add the \`diego\` user with the \`${SENHAS.diego}\` password.`,
      '`ana` must keep logging in with the current password.',
    ],
  },
  hints: [
    { pt: '`oc extract secret/nimbus-htpasswd -n openshift-config --to DIR --confirm` baixa o arquivo atual. Edite-o com `htpasswd` e devolva com `oc set data`.', en: '`oc extract secret/nimbus-htpasswd -n openshift-config --to DIR --confirm` downloads the current file. Edit it with `htpasswd` and push it back with `oc set data`.' },
    { pt: '`htpasswd -D ARQUIVO usuário` remove a linha. Para senha nova, `htpasswd -B -b ARQUIVO usuário senha`.', en: '`htpasswd -D FILE user` removes the line. For a new password, `htpasswd -B -b FILE user password`.' },
    { pt: 'Quem já logou tem um `user` e uma `identity` no cluster (`oc get users,identities`). Tirar do htpasswd não apaga esses objetos.', en: 'Whoever has logged in has a `user` and an `identity` in the cluster (`oc get users,identities`). Removing them from htpasswd does not delete those objects.' },
  ],
  setup(w) {
    provedorNimbus(w, ['ana', 'bruno', 'carla'], ['ana', 'bruno', 'carla']);
  },
  checks: [
    {
      text: { pt: 'bruno loga com a senha nova e não com a antiga', en: 'bruno logs in with the new password and not the old one' },
      test: (w) => w.credencial('bruno', NOVA) && !w.credencial('bruno', SENHAS.bruno),
    },
    {
      text: { pt: 'carla não consegue mais logar', en: 'carla can no longer log in' },
      test: (w) => !w.credencial('carla', SENHAS.carla),
    },
    {
      text: { pt: 'Não sobrou user nem identity de carla', en: 'No user or identity of carla remains' },
      test: (w) => !w.get('User', 'carla') && !w.list('Identity').some((i) => i.providerUserName === 'carla'),
    },
    {
      text: { pt: 'diego consegue logar', en: 'diego can log in' },
      test: (w) => w.credencial('diego', SENHAS.diego),
    },
    {
      text: { pt: 'ana continua logando com a senha atual', en: 'ana still logs in with the current password' },
      test: (w) => w.credencial('ana', SENHAS.ana),
    },
  ],
  solution: [
    { cmd: 'oc get users,identities', pt: 'carla já logou antes: tem user e identity.', en: 'carla has logged in before: she has a user and an identity.' },
    { cmd: 'oc extract secret/nimbus-htpasswd -n openshift-config --to ~/auth --confirm', pt: 'Baixa o arquivo htpasswd atual.', en: 'Downloads the current htpasswd file.' },
    { cmd: `htpasswd -B -b ~/auth/htpasswd bruno '${NOVA}'`, pt: 'Atualiza a senha de bruno.', en: 'Updates bruno\'s password.' },
    { cmd: 'htpasswd -D ~/auth/htpasswd carla', pt: 'Remove a linha de carla.', en: 'Removes carla\'s line.' },
    { cmd: `htpasswd -B -b ~/auth/htpasswd diego '${SENHAS.diego}'`, pt: 'Acrescenta diego.', en: 'Adds diego.' },
    { cmd: 'oc set data secret/nimbus-htpasswd -n openshift-config --from-file htpasswd=$HOME/auth/htpasswd', pt: 'Devolve o arquivo ao secret; o OAuth é reiniciado sozinho.', en: 'Pushes the file back to the secret; OAuth restarts by itself.' },
    { cmd: 'oc delete user carla', pt: 'Remove o usuário.', en: 'Removes the user.' },
    { cmd: 'oc delete identity nimbus-users:carla', pt: 'Remove a identidade, que é um objeto separado.', en: 'Removes the identity, which is a separate object.' },
    { cmd: 'sleep 60', pt: 'Espera o rollout do OAuth.', en: 'Waits for the OAuth rollout.' },
    { cmd: `oc login -u bruno -p '${NOVA}'`, pt: 'Confere a senha nova.', en: 'Checks the new password.' },
    { cmd: 'oc login -u admin -p redhatocp', pt: 'Volta para o administrador.', en: 'Goes back to the administrator.' },
  ],
};
