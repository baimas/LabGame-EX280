import { b64 } from '../../sim/util.js';
import { leHtpasswd, confereSenha } from '../../sim/rbac.js';
import { SENHAS } from './comum.js';

const NOVOS = ['ana', 'bruno', 'carla'];

const idps = (w) => w.get('OAuth', 'cluster').spec.identityProviders || [];

export default {
  id: 'c3-htpasswd',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Configurar o identity provider HTPasswd', 'Criar e excluir usuários'],
  title: { pt: 'Crachás para o time novo', en: 'Badges for the new team' },
  story: {
    pt: 'Três pessoas entram hoje no time de Faturamento e precisam acessar o OpenShift. A segurança pediu um provedor de identidade separado para os times de negócio, sem mexer nas contas da equipe de plataforma.',
    en: 'Three people join the Billing team today and need access to OpenShift. Security asked for a separate identity provider for the business teams, without touching the platform team accounts.',
  },
  tasks: {
    pt: [
      `Crie o arquivo \`~/auth/htpasswd\` com bcrypt e os usuários \`ana\` (senha \`${SENHAS.ana}\`), \`bruno\` (\`${SENHAS.bruno}\`) e \`carla\` (\`${SENHAS.carla}\`).`,
      'Crie o secret `nimbus-htpasswd` no projeto `openshift-config` a partir desse arquivo.',
      'Acrescente ao OAuth do cluster um provedor de identidade do tipo HTPasswd chamado `nimbus-users`, que use esse secret.',
      'O provedor `localusers` deve continuar funcionando: `admin` e `developer` ainda precisam logar.',
      'Os três usuários novos devem conseguir fazer login.',
    ],
    en: [
      `Create the \`~/auth/htpasswd\` file with bcrypt and the users \`ana\` (password \`${SENHAS.ana}\`), \`bruno\` (\`${SENHAS.bruno}\`), and \`carla\` (\`${SENHAS.carla}\`).`,
      'Create the `nimbus-htpasswd` secret in the `openshift-config` project from that file.',
      'Add to the cluster OAuth an HTPasswd identity provider named `nimbus-users` that uses that secret.',
      'The `localusers` provider must keep working: `admin` and `developer` still need to log in.',
      'The three new users must be able to log in.',
    ],
  },
  hints: [
    { pt: '`htpasswd -c -B -b ARQUIVO usuário senha` cria o arquivo; sem o `-c`, acrescenta usuários. A chave do secret precisa se chamar `htpasswd`.', en: '`htpasswd -c -B -b FILE user password` creates the file; without `-c`, it adds users. The secret key must be named `htpasswd`.' },
    { pt: 'Edite o recurso `oauth/cluster` (com `oc edit`, ou `-o yaml` + `oc replace -f`). Copie o bloco do `localusers` em `spec.identityProviders` e acrescente o novo.', en: 'Edit the `oauth/cluster` resource (with `oc edit`, or `-o yaml` + `oc replace -f`). Copy the `localusers` block under `spec.identityProviders` and add the new one.' },
    { pt: 'A mudança só vale depois que os pods de `openshift-authentication` são recriados. Acompanhe com `oc get co authentication` ou `watch oc get pods -n openshift-authentication` antes de testar o login.', en: 'The change only takes effect after the `openshift-authentication` pods are recreated. Follow it with `oc get co authentication` or `watch oc get pods -n openshift-authentication` before testing the login.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/auth', true);
  },
  checks: [
    {
      text: { pt: '~/auth/htpasswd tem os três usuários com bcrypt e as senhas certas', en: '~/auth/htpasswd has the three users with bcrypt and the right passwords' },
      test: (w) => {
        const m = leHtpasswd(w.file('auth/htpasswd'));
        return NOVOS.every((u) => m[u]?.startsWith('$2') && confereSenha(m[u], SENHAS[u]));
      },
    },
    {
      text: { pt: 'O secret nimbus-htpasswd existe em openshift-config com a chave htpasswd', en: 'The nimbus-htpasswd secret exists in openshift-config with the htpasswd key' },
      test: (w) => NOVOS.every((u) => b64.dec(w.get('Secret', 'nimbus-htpasswd', 'openshift-config').data.htpasswd).includes(`${u}:`)),
    },
    {
      text: { pt: 'O OAuth tem os provedores localusers e nimbus-users', en: 'The OAuth has the localusers and nimbus-users providers' },
      test: (w) => {
        const novo = idps(w).find((i) => i.name === 'nimbus-users');
        return idps(w).some((i) => i.name === 'localusers') && novo?.type === 'HTPasswd' && novo.htpasswd?.fileData?.name === 'nimbus-htpasswd';
      },
    },
    {
      text: { pt: 'admin e developer continuam logando', en: 'admin and developer can still log in' },
      test: (w) => w.credencial('admin', 'redhatocp') && w.credencial('developer', 'developer'),
    },
    {
      text: { pt: 'ana, bruno e carla conseguem logar', en: 'ana, bruno, and carla can log in' },
      test: (w) => NOVOS.every((u) => w.credencial(u, SENHAS[u])),
    },
  ],
  solution: [
    { cmd: `htpasswd -c -B -b ~/auth/htpasswd ana '${SENHAS.ana}'`, pt: 'Cria o arquivo com o primeiro usuário.', en: 'Creates the file with the first user.' },
    { cmd: `htpasswd -B -b ~/auth/htpasswd bruno '${SENHAS.bruno}'`, pt: 'Sem `-c` para não apagar o que já existe.', en: 'Without `-c` so nothing is erased.' },
    { cmd: `htpasswd -B -b ~/auth/htpasswd carla '${SENHAS.carla}'`, pt: 'Terceiro usuário.', en: 'Third user.' },
    { cmd: 'oc create secret generic nimbus-htpasswd --from-file htpasswd=$HOME/auth/htpasswd -n openshift-config', pt: 'A chave do secret precisa ser `htpasswd`.', en: 'The secret key must be `htpasswd`.' },
    { cmd: 'oc get oauth cluster -o yaml', pt: 'Mostra o provedor atual, que não pode ser perdido.', en: 'Shows the current provider, which must not be lost.' },
    { cmd: 'oc patch oauth cluster --type json -p \'[{"op":"add","path":"/spec/identityProviders/-","value":{"name":"nimbus-users","mappingMethod":"claim","type":"HTPasswd","htpasswd":{"fileData":{"name":"nimbus-htpasswd"}}}}]\'', pt: 'Acrescenta o provedor no fim da lista, sem tocar no `localusers`. Pelo `oc edit` o resultado é o mesmo.', en: 'Appends the provider to the list without touching `localusers`. With `oc edit` the result is the same.' },
    { cmd: 'oc get co authentication', pt: 'PROGRESSING=True enquanto os pods do OAuth são recriados.', en: 'PROGRESSING=True while the OAuth pods are recreated.' },
    { cmd: 'sleep 60', pt: 'Espera o rollout terminar (na prova, use `watch` e aguarde).', en: 'Waits for the rollout (in the exam, use `watch` and wait).' },
    { cmd: `oc login -u ana -p '${SENHAS.ana}'`, pt: 'Testa um usuário novo.', en: 'Tests a new user.' },
    { cmd: 'oc login -u admin -p redhatocp', pt: 'Volta para o administrador.', en: 'Goes back to the administrator.' },
  ],
};
