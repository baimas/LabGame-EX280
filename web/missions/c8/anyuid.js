import { deployment } from '../../engine/world.js';

const NS = 'legacy-files';
const SA = 'ftp-sa';
const usar = (w, conta, scc) => w.pode(`system:serviceaccount:${NS}:${conta}`, 'use', 'securitycontextconstraints', 'security.openshift.io', NS, scc);

export default {
  id: 'c8-anyuid',
  minutes: 20,
  xp: 230,
  difficulty: 2,
  objectives: ['Criar e usar service accounts', 'Gerenciar e aplicar permissões com security context constraints'],
  title: { pt: 'O legado que exige root', en: 'The legacy that demands root' },
  story: {
    pt: 'O servidor de arquivos dos fornecedores é uma imagem antiga, de um fornecedor que já não existe, e só funciona como root. Reescrever não é opção este ano. A Segurança aceita a exceção, desde que ela valha só para esse servidor.',
    en: 'The supplier file server is an old image, from a vendor that no longer exists, and it only works as root. Rewriting it is not an option this year. Security accepts the exception, as long as it applies only to that server.',
  },
  tasks: {
    pt: [
      'No projeto `legacy-files`, o deployment `ftp-legacy` está em CrashLoopBackOff. Descubra o motivo nos logs.',
      `Crie a service account \`${SA}\` e permita que só ela use a SCC \`anyuid\`.`,
      `O deployment \`ftp-legacy\` deve rodar com a service account \`${SA}\`, com o pod pronto e admitido pela SCC \`anyuid\`.`,
      'A service account `default` do projeto não pode ganhar acesso à `anyuid`.',
    ],
    en: [
      'In the `legacy-files` project, the `ftp-legacy` deployment is in CrashLoopBackOff. Find out why in the logs.',
      `Create the \`${SA}\` service account and allow only it to use the \`anyuid\` SCC.`,
      `The \`ftp-legacy\` deployment must run with the \`${SA}\` service account, with its pod ready and admitted by the \`anyuid\` SCC.`,
      'The project `default` service account must not get access to `anyuid`.',
    ],
  },
  hints: [
    { pt: 'A SCC que admitiu um pod aparece na anotação `openshift.io/scc`. Por padrão é a `restricted-v2`, que roda com um UID alto do projeto.', en: 'The SCC that admitted a pod shows up in the `openshift.io/scc` annotation. By default it is `restricted-v2`, which runs with a high project UID.' },
    { pt: '`oc adm policy add-scc-to-user anyuid -z NOME` dá a SCC a uma service account do projeto atual. Outro caminho, só no projeto: `oc create role NOME --verb use --resource scc --resource-name anyuid` e um rolebinding para a conta.', en: '`oc adm policy add-scc-to-user anyuid -z NAME` grants the SCC to a service account of the current project. Another way, scoped to the project: `oc create role NAME --verb use --resource scc --resource-name anyuid` plus a rolebinding for the account.' },
    { pt: '`oc set serviceaccount deployment/NOME CONTA` troca a service account e dispara um rollout. `oc get deploy NOME -o yaml | oc adm policy scc-subject-review -f -` diz qual SCC vai admitir o pod.', en: '`oc set serviceaccount deployment/NAME ACCOUNT` changes the service account and triggers a rollout. `oc get deploy NAME -o yaml | oc adm policy scc-subject-review -f -` tells which SCC will admit the pod.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('ftp-legacy', NS, 'nimbus/legacy-ftp:3.0'));
  },
  checks: [
    {
      text: { pt: `A service account ${SA} pode usar a anyuid`, en: `The ${SA} service account can use anyuid` },
      test: (w) => Boolean(w.get('ServiceAccount', SA, NS)) && usar(w, SA, 'anyuid'),
    },
    {
      text: { pt: 'A service account default não ganhou a anyuid', en: 'The default service account did not get anyuid' },
      test: (w) => !usar(w, 'default', 'anyuid'),
    },
    {
      text: { pt: 'ftp-legacy roda com a service account e a SCC anyuid', en: 'ftp-legacy runs with the service account and the anyuid SCC' },
      test: (w) => w.ready('ftp-legacy', NS) && w.pods(NS, { app: 'ftp-legacy' }).every((p) => p.spec.serviceAccountName === SA && p.metadata.annotations?.['openshift.io/scc'] === 'anyuid'),
    },
  ],
  solution: [
    { cmd: 'oc project legacy-files', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc logs deployment/ftp-legacy', pt: 'A imagem exige rodar como root.', en: 'The image requires running as root.' },
    { cmd: "oc get pod -l app=ftp-legacy -o jsonpath='{.items[0].metadata.annotations.openshift\\.io/scc}'", pt: 'O pod foi admitido pela `restricted-v2`.', en: 'The pod was admitted by `restricted-v2`.' },
    { cmd: `oc create serviceaccount ${SA}`, pt: 'Uma service account só para o servidor.', en: 'A service account just for the server.' },
    { cmd: `oc adm policy add-scc-to-user anyuid -z ${SA}`, pt: 'A exceção vale só para ela.', en: 'The exception applies only to it.' },
    { cmd: `oc set serviceaccount deployment/ftp-legacy ${SA}`, pt: 'O deployment passa a usar a service account; o rollout recria o pod.', en: 'The deployment now uses the service account; the rollout recreates the pod.' },
    { cmd: 'sleep 15; oc get pods', pt: 'Pod novo rodando.', en: 'New pod running.' },
    { cmd: 'oc get pod -l app=ftp-legacy -o yaml | grep openshift.io/scc', pt: 'Admitido pela `anyuid`.', en: 'Admitted by `anyuid`.' },
  ],
};
