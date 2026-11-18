import { deployment, service } from '../../engine/world.js';

const NS = 'support-desk';

export default {
  id: 'e2-troubleshoot',
  minutes: 20,
  xp: 200,
  difficulty: 2,
  objectives: ['Solucionar problemas de contêineres e pods', 'Criar contêineres Linux e pods do Kubernetes'],
  title: { pt: 'Dois incêndios antes do café', en: 'Two fires before coffee' },
  startNamespace: NS,
  story: {
    pt: 'A central de atendimento está fora do ar: o portal do helpdesk não sobe depois do deploy de ontem, e a API de cobrança que ele consulta reinicia sem parar. Ninguém deixou anotação do que mudou.',
    en: 'The help center is down: the helpdesk portal does not start after yesterday\'s deploy, and the billing API it calls keeps restarting. Nobody left a note about what changed.',
  },
  tasks: {
    pt: [
      'No projeto `support-desk`, o deployment `helpdesk` deveria usar a versão `2.0` da imagem `nimbus/portal`. Descubra por que o pod não sobe e corrija.',
      'O deployment `billing` (imagem `nimbus/billing-api`) reinicia sem parar. Descubra nos logs o que falta: o banco dele é o service `billing-db`.',
      'Os dois deployments devem ficar com todos os pods prontos.',
    ],
    en: [
      'In the `support-desk` project, the `helpdesk` deployment should use version `2.0` of the `nimbus/portal` image. Find out why the pod does not start and fix it.',
      'The `billing` deployment (`nimbus/billing-api` image) keeps restarting. Find in the logs what is missing: its database is the `billing-db` service.',
      'Both deployments must have all pods ready.',
    ],
  },
  hints: [
    { pt: '`oc get pods` mostra o estado; `oc describe pod` mostra os eventos (pull da imagem) e `oc logs` mostra a saída da aplicação.', en: '`oc get pods` shows the status; `oc describe pod` shows the events (image pull), and `oc logs` shows the application output.' },
    { pt: '`skopeo list-tags docker://REPO` mostra as tags que existem de verdade.', en: '`skopeo list-tags docker://REPO` shows the tags that actually exist.' },
    { pt: '`oc set image deployment/NOME CONTÊINER=IMAGEM` e `oc set env deployment/NOME VAR=valor` mudam o deployment e disparam um rollout.', en: '`oc set image deployment/NAME CONTAINER=IMAGE` and `oc set env deployment/NAME VAR=value` change the deployment and trigger a rollout.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('helpdesk', NS, 'nimbus/portal:2.1', { container: 'portal' }));
    c.create(deployment('billing', NS, 'nimbus/billing-api:1.1', { container: 'billing-api' }));
    c.create(deployment('billing-db', NS, 'rhel9/mysql-80:1-228', { env: { MYSQL_ROOT_PASSWORD: 'nimbus-root' } }));
    c.create(service('billing-db', NS, 3306));
  },
  checks: [
    {
      text: { pt: 'helpdesk usa nimbus/portal:2.0 e está pronto', en: 'helpdesk uses nimbus/portal:2.0 and is ready' },
      test: (w) => /\/nimbus\/portal(:2\.0|@sha256:)/.test(w.get('Deployment', 'helpdesk', NS).spec.template.spec.containers[0].image) && w.ready('helpdesk', NS),
    },
    {
      text: { pt: 'billing tem DB_HOST apontando para billing-db e está pronto', en: 'billing has DB_HOST pointing to billing-db and is ready' },
      test: (w) => (w.get('Deployment', 'billing', NS).spec.template.spec.containers[0].env || []).some((e) => e.name === 'DB_HOST' && /^billing-db(\.support-desk(\.svc(\.cluster\.local)?)?)?$/.test(e.value)) && w.ready('billing', NS),
    },
  ],
  solution: [
    { cmd: 'oc project support-desk', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods', pt: '`ImagePullBackOff` no helpdesk e `CrashLoopBackOff` no billing.', en: '`ImagePullBackOff` on helpdesk and `CrashLoopBackOff` on billing.' },
    { cmd: 'oc describe pod -l app=helpdesk | tail -5', pt: 'A tag `2.1` não existe.', en: 'Tag `2.1` does not exist.' },
    { cmd: 'skopeo list-tags docker://registry.lab.example.com:8443/nimbus/portal', pt: 'Existem 1.0, 1.1, 2.0 e latest.', en: 'There are 1.0, 1.1, 2.0, and latest.' },
    { cmd: 'oc set image deployment/helpdesk portal=registry.lab.example.com:8443/nimbus/portal:2.0', pt: 'Corrige a tag.', en: 'Fixes the tag.' },
    { cmd: 'oc logs deployment/billing', pt: '`DB_HOST is not set`.', en: '`DB_HOST is not set`.' },
    { cmd: 'oc set env deployment/billing DB_HOST=billing-db', pt: 'Aponta para o banco.', en: 'Points to the database.' },
    { cmd: 'oc rollout status deployment/helpdesk && oc rollout status deployment/billing', pt: 'Os dois no ar.', en: 'Both up.' },
  ],
};
