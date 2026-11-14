import { deployment } from '../../engine/world.js';

const NS = 'node-tools';
const SA = 'node-agent-sa';
const usar = (w, conta, scc) => w.pode(`system:serviceaccount:${NS}:${conta}`, 'use', 'securitycontextconstraints', 'security.openshift.io', NS, scc);

export default {
  id: 'c8-privilegiado',
  minutes: 20,
  xp: 230,
  difficulty: 2,
  objectives: ['Executar aplicações privilegiadas', 'Gerenciar e aplicar permissões com security context constraints', 'Criar e usar service accounts'],
  title: { pt: 'Um agente com chave do nó', en: 'An agent with the node key' },
  story: {
    pt: 'O time de Infraestrutura comprou um agente que coleta métricas do kernel e precisa rodar como contêiner privilegiado. O deployment foi criado, mas nenhum pod nasce. A Segurança libera, desde que o privilégio fique preso a uma conta só desse agente.',
    en: 'The Infrastructure team bought an agent that collects kernel metrics and must run as a privileged container. The deployment was created, but no pod is born. Security allows it, as long as the privilege is tied to an account used only by this agent.',
  },
  tasks: {
    pt: [
      'No projeto `node-tools`, o deployment `node-agent` precisa rodar com o contêiner privilegiado, como está no manifesto. Não tire o `privileged: true`.',
      `Crie a service account \`${SA}\` e dê a ela, e só a ela, a SCC \`privileged\`.`,
      `O deployment deve rodar com essa service account, com o pod pronto e admitido pela SCC \`privileged\`.`,
    ],
    en: [
      'In the `node-tools` project, the `node-agent` deployment must run with its privileged container, as in the manifest. Do not remove `privileged: true`.',
      `Create the \`${SA}\` service account and grant it, and only it, the \`privileged\` SCC.`,
      'The deployment must run with that service account, with its pod ready and admitted by the `privileged` SCC.',
    ],
  },
  hints: [
    { pt: 'Procure `FailedCreate` em `oc get events`: a mensagem diz por que cada SCC recusou o pod.', en: 'Look for `FailedCreate` in `oc get events`: the message says why each SCC refused the pod.' },
    { pt: 'Contêiner privilegiado só passa pela SCC `privileged`: `oc adm policy add-scc-to-user privileged -z CONTA`.', en: 'A privileged container only passes the `privileged` SCC: `oc adm policy add-scc-to-user privileged -z ACCOUNT`.' },
    { pt: '`oc set serviceaccount deployment/node-agent CONTA` troca a conta e recria o pod.', en: '`oc set serviceaccount deployment/node-agent ACCOUNT` switches the account and recreates the pod.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('node-agent', NS, 'nimbus/reports:4.1', { extra: { container: { securityContext: { privileged: true } } } }));
  },
  checks: [
    {
      text: { pt: `Só ${SA} pode usar a SCC privileged`, en: `Only ${SA} can use the privileged SCC` },
      test: (w) => usar(w, SA, 'privileged') && !usar(w, 'default', 'privileged'),
    },
    {
      text: { pt: 'node-agent roda privilegiado, com a conta e a SCC privileged', en: 'node-agent runs privileged, with the account and the privileged SCC' },
      test: (w) => w.ready('node-agent', NS) && w.pods(NS, { app: 'node-agent' }).every((p) => p.spec.serviceAccountName === SA && p.spec.containers[0].securityContext?.privileged === true && p.metadata.annotations?.['openshift.io/scc'] === 'privileged'),
    },
  ],
  solution: [
    { cmd: 'oc project node-tools', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get events | grep FailedCreate | tail -1', pt: 'Nenhuma SCC disponível aceita contêiner privilegiado.', en: 'No available SCC accepts a privileged container.' },
    { cmd: `oc create serviceaccount ${SA}`, pt: 'Conta só do agente.', en: 'An account just for the agent.' },
    { cmd: `oc adm policy add-scc-to-user privileged -z ${SA}`, pt: 'A SCC `privileged` só para ela.', en: 'The `privileged` SCC only for it.' },
    { cmd: `oc set serviceaccount deployment/node-agent ${SA}`, pt: 'O deployment passa a usar a conta.', en: 'The deployment now uses the account.' },
    { cmd: 'sleep 15; oc get pod -l app=node-agent -o yaml | grep openshift.io/scc', pt: 'Admitido pela `privileged`.', en: 'Admitted by `privileged`.' },
  ],
};
