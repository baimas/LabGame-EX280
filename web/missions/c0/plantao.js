import { deployment, REGISTRY } from '../../engine/world.js';

const NS = 'support';
const PORTAL = `${REGISTRY}/nimbus/portal`;

export default {
  id: 'c0-plantao',
  minutes: 20,
  xp: 180,
  difficulty: 3,
  objectives: ['Visualizar logs', 'Monitorar eventos do cluster', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'Plantão: três aplicações fora do ar', en: 'On call: three applications down' },
  startNamespace: 'default',
  story: {
    pt: 'Segunda-feira, 8h. O time de Suporte abriu um chamado crítico: nenhuma das três aplicações do projeto `support` está respondendo depois de uma mudança feita na sexta à noite. Ninguém documentou o que foi alterado.',
    en: 'Monday, 8 a.m. The Support team opened a critical ticket: none of the three applications in the `support` project is responding after a change made on Friday night. Nobody documented what was changed.',
  },
  tasks: {
    pt: [
      'Coloque no ar os três deployments do projeto `support`: `helpdesk`, `tickets-db` e `notifier`.',
      `\`helpdesk\` deve rodar a versão \`1.1\` da imagem \`${PORTAL}\`.`,
      '`tickets-db` deve criar o banco `tickets` para o usuário `tickets` com a senha `s3nha-tickets`.',
      '`notifier` só pode rodar em nós com o label `tier=gold`, e essa regra não pode ser removida do deployment. O nó `master01` é o nó gold da Nimbus.',
    ],
    en: [
      'Bring up the three deployments in the `support` project: `helpdesk`, `tickets-db`, and `notifier`.',
      `\`helpdesk\` must run version \`1.1\` of the \`${PORTAL}\` image.`,
      '`tickets-db` must create the `tickets` database for the `tickets` user with the `s3nha-tickets` password.',
      '`notifier` may only run on nodes labeled `tier=gold`, and that rule must stay in the deployment. The `master01` node is the Nimbus gold node.',
    ],
  },
  hints: [
    { pt: 'Comece por `oc get pods`: a coluna STATUS já separa os três problemas. Depois use `oc describe pod` e `oc logs` em cada um.', en: 'Start with `oc get pods`: the STATUS column already separates the three problems. Then use `oc describe pod` and `oc logs` on each.' },
    { pt: 'ImagePullBackOff é imagem ou tag errada; CrashLoopBackOff pede `oc logs`; Pending pede a seção Events do `oc describe pod`.', en: 'ImagePullBackOff means a wrong image or tag; CrashLoopBackOff calls for `oc logs`; Pending calls for the Events section of `oc describe pod`.' },
    { pt: '`oc set image`, `oc set env` e `oc label node` resolvem os três sem editar YAML.', en: '`oc set image`, `oc set env`, and `oc label node` fix all three without editing YAML.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('helpdesk', NS, 'nimbus/portal:1.2', { replicas: 2 }));
    w.cluster.create(deployment('tickets-db', NS, 'rhel9/mysql-80:1-228'));
    w.cluster.create(deployment('notifier', NS, 'nimbus/reports:4.1', { extra: { pod: { nodeSelector: { tier: 'gold' } } } }));
  },
  checks: [
    {
      text: { pt: 'helpdesk roda a imagem portal:1.1 com todas as réplicas prontas', en: 'helpdesk runs the portal:1.1 image with all replicas ready' },
      test: (w) => w.get('Deployment', 'helpdesk', NS).spec.template.spec.containers[0].image === `${PORTAL}:1.1` && w.ready('helpdesk', NS),
    },
    {
      text: { pt: 'tickets-db está pronto com usuário, senha e banco pedidos', en: 'tickets-db is ready with the requested user, password, and database' },
      test: (w) => {
        const env = Object.fromEntries((w.get('Deployment', 'tickets-db', NS).spec.template.spec.containers[0].env || []).map((e) => [e.name, e.value]));
        return env.MYSQL_USER === 'tickets' && env.MYSQL_PASSWORD === 's3nha-tickets' && env.MYSQL_DATABASE === 'tickets' && w.ready('tickets-db', NS);
      },
    },
    {
      text: { pt: 'notifier está pronto e mantém a regra tier=gold', en: 'notifier is ready and keeps the tier=gold rule' },
      test: (w) => w.get('Deployment', 'notifier', NS).spec.template.spec.nodeSelector?.tier === 'gold' && w.ready('notifier', NS),
    },
  ],
  solution: [
    { cmd: 'oc project support', pt: 'Entra no projeto com problema.', en: 'Switches to the troubled project.' },
    { cmd: 'oc get pods', pt: 'Três sintomas diferentes: ImagePullBackOff, CrashLoopBackOff e Pending.', en: 'Three different symptoms: ImagePullBackOff, CrashLoopBackOff, and Pending.' },
    { cmd: 'oc describe pod -l app=helpdesk | grep -i failed', pt: 'Os eventos mostram que a tag 1.2 não existe no registro.', en: 'The events show that tag 1.2 does not exist in the registry.' },
    { cmd: `oc set image deployment/helpdesk helpdesk=${PORTAL}:1.1`, pt: 'Corrige a tag da imagem.', en: 'Fixes the image tag.' },
    { cmd: 'oc logs deployment/tickets-db', pt: 'O log do contêiner diz quais variáveis o MySQL exige.', en: 'The container log says which variables MySQL requires.' },
    { cmd: 'oc set env deployment/tickets-db MYSQL_USER=tickets MYSQL_PASSWORD=s3nha-tickets MYSQL_DATABASE=tickets', pt: 'Define as variáveis pedidas no chamado.', en: 'Sets the variables requested in the ticket.' },
    { cmd: 'oc describe pod -l app=notifier | grep -A3 Events', pt: 'FailedScheduling: nenhum nó atende ao nodeSelector.', en: 'FailedScheduling: no node satisfies the nodeSelector.' },
    { cmd: 'oc label node master01 tier=gold', pt: 'A regra fica; o que faltava era o label no nó.', en: 'The rule stays; what was missing was the label on the node.' },
    { cmd: 'oc rollout status deployment/helpdesk && oc rollout status deployment/tickets-db && oc rollout status deployment/notifier', pt: 'Confere os três antes de fechar o chamado.', en: 'Checks all three before closing the ticket.' },
  ],
};
