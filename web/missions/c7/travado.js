import { subDe, instalado } from './comum.js';
import { CATALOGO, CATALOGO_NS } from '../../sim/olm.js';

const ERRADO = 'terminal';
const CERTO = 'openshift-operators';

export default {
  id: 'c7-travado',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Instalar operators', 'Desinstalar operators', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'O terminal que nunca chegou', en: 'The terminal that never arrived' },
  story: {
    pt: 'Um estagiário tentou instalar o Web Terminal para os desenvolvedores, criou um projeto só para isso e foi embora. Faz dois dias que nada acontece, e o time quer o terminal disponível em todos os projetos.',
    en: 'An intern tried to install Web Terminal for the developers, created a project just for it, and left. Nothing has happened for two days, and the team wants the terminal available in every project.',
  },
  tasks: {
    pt: [
      'O operator `web-terminal` deve estar instalado para todos os projetos do cluster, na versão mais nova do catálogo `redhat-operators`, com o CSV em `Succeeded`.',
      'Não pode sobrar subscription nem CSV de operator no projeto `terminal`. O projeto em si pode ficar.',
    ],
    en: [
      'The `web-terminal` operator must be installed for every project in the cluster, at the newest version of the `redhat-operators` catalog, with the CSV in `Succeeded`.',
      'No operator subscription or CSV may remain in the `terminal` project. The project itself may stay.',
    ],
  },
  hints: [
    { pt: '`oc describe sub -n terminal` mostra por que a resolução falhou. Compare com os canais em `oc describe packagemanifest web-terminal`.', en: '`oc describe sub -n terminal` shows why resolution failed. Compare with the channels in `oc describe packagemanifest web-terminal`.' },
    { pt: 'O Web Terminal só suporta o modo AllNamespaces. Operators globais ficam no `openshift-operators`, que já tem o operator group `global-operators`.', en: 'Web Terminal only supports the AllNamespaces mode. Global operators live in `openshift-operators`, which already has the `global-operators` operator group.' },
    { pt: 'Apagar a subscription não apaga o CSV. Confira com `oc get sub,csv -n terminal`.', en: 'Deleting the subscription does not delete the CSV. Check with `oc get sub,csv -n terminal`.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: ERRADO } });
    c.create({ kind: 'OperatorGroup', metadata: { name: 'terminal-og', namespace: ERRADO }, spec: { targetNamespaces: [ERRADO] } });
    c.create({ kind: 'Subscription', metadata: { name: 'web-terminal', namespace: ERRADO }, spec: { channel: 'stable', name: 'web-terminal', source: CATALOGO, sourceNamespace: CATALOGO_NS, installPlanApproval: 'Automatic' } });
    c.tick(30);
  },
  checks: [
    {
      text: { pt: 'web-terminal 1.12.1 está Succeeded no openshift-operators', en: 'web-terminal 1.12.1 is Succeeded in openshift-operators' },
      test: (w) => Boolean(subDe(w, 'web-terminal', CERTO)) && instalado(w, 'web-terminal.v1.12.1', CERTO) && w.ready('web-terminal-controller', CERTO),
    },
    {
      text: { pt: 'A dependência DevWorkspace também foi instalada', en: 'The DevWorkspace dependency was installed too' },
      test: (w) => instalado(w, 'devworkspace-operator.v0.32.1', CERTO),
    },
    {
      text: { pt: 'Não sobrou subscription nem CSV no projeto terminal', en: 'No subscription or CSV is left in the terminal project' },
      test: (w) => !w.list('Subscription', ERRADO).length && !w.list('ClusterServiceVersion', ERRADO).length,
    },
  ],
  solution: [
    { cmd: 'oc get sub,csv -n terminal', pt: 'Uma subscription e nenhum CSV.', en: 'One subscription and no CSV.' },
    { cmd: 'oc describe sub web-terminal -n terminal | grep -i message', pt: 'Não existe o canal `stable` no pacote.', en: 'The package has no `stable` channel.' },
    { cmd: 'oc describe packagemanifest web-terminal | grep -B2 -A10 installModes', pt: 'Canal `fast` e só o modo AllNamespaces.', en: 'The `fast` channel and only the AllNamespaces mode.' },
    { cmd: 'oc delete sub web-terminal -n terminal', pt: 'O projeto `terminal` nunca vai servir: o operator group dele é de um projeto só.', en: 'The `terminal` project will never work: its operator group targets a single project.' },
    { cmd: 'oc get operatorgroup -n openshift-operators', pt: '`global-operators`, sem `targetNamespaces`: vale para todos.', en: '`global-operators`, without `targetNamespaces`: it covers everything.' },
    { cmd: `cat > wt.yaml <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: web-terminal
  namespace: openshift-operators
spec:
  channel: fast
  name: web-terminal
  source: redhat-operators
  sourceNamespace: openshift-marketplace
EOF`, pt: 'Subscription no lugar certo e no canal certo.', en: 'Subscription in the right place and on the right channel.' },
    { cmd: 'oc apply -f wt.yaml', pt: 'O OLM também assina a dependência.', en: 'OLM also subscribes to the dependency.' },
    { cmd: 'sleep 30', pt: 'Espera a instalação.', en: 'Waits for the installation.' },
    { cmd: 'oc get sub,csv -n openshift-operators', pt: 'Web Terminal e DevWorkspace em `Succeeded`.', en: 'Web Terminal and DevWorkspace in `Succeeded`.' },
    { cmd: 'oc get sub,csv -n terminal', pt: 'Nada sobrou no projeto antigo.', en: 'Nothing is left in the old project.' },
  ],
};
