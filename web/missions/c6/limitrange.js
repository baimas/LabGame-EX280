import { deployment } from '../../engine/world.js';
import { mesmos, recursos } from './comum.js';

const NS = 'analytics';
const PADRAO = { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '300m', memory: '256Mi' } };

export default {
  id: 'c6-limitrange',
  minutes: 20,
  xp: 230,
  difficulty: 3,
  objectives: ['Configurar limit ranges por projeto', 'Configurar os requisitos de recursos do projeto'],
  title: { pt: 'Padrão para quem esquece', en: 'Defaults for the forgetful' },
  story: {
    pt: 'No projeto de Analytics ninguém declara requests nem limits, e um job pesado já derrubou o nó uma vez. A regra agora é: quem não declarar recebe um padrão, e ninguém passa de 1 CPU por contêiner.',
    en: 'In the Analytics project nobody declares requests or limits, and a heavy job already took the node down once. The rule now is: whoever does not declare gets a default, and nobody goes above 1 CPU per container.',
  },
  tasks: {
    pt: [
      'No projeto `analytics`, crie o limit range `analytics-limits` para contêineres: limit padrão de `300m` de CPU e `256Mi` de memória, request padrão de `100m` e `128Mi`, máximo de `1` CPU e `1Gi` de memória.',
      'Os pods do deployment `etl` devem rodar com os valores padrão do limit range.',
      'O deployment `report-builder` deve ser reiniciado e voltar a ter todas as réplicas prontas, respeitando o máximo.',
    ],
    en: [
      'In the `analytics` project, create the `analytics-limits` limit range for containers: default limit of `300m` CPU and `256Mi` memory, default request of `100m` and `128Mi`, maximum of `1` CPU and `1Gi` memory.',
      'The pods of the `etl` deployment must run with the limit range defaults.',
      'The `report-builder` deployment must be restarted and get all replicas ready again, within the maximum.',
    ],
  },
  hints: [
    { pt: 'O limit range é do tipo `Container` com os campos `default`, `defaultRequest` e `max`. `oc explain limitrange.spec.limits` mostra cada campo; a estrutura cabe em 15 linhas de YAML.', en: 'The limit range is of type `Container` with the `default`, `defaultRequest`, and `max` fields. `oc explain limitrange.spec.limits` shows each field; the structure fits in 15 lines of YAML.' },
    { pt: 'O limit range só vale para pods criados depois dele. `oc rollout restart deployment etl` recria os pods.', en: 'The limit range only applies to pods created after it. `oc rollout restart deployment etl` recreates the pods.' },
    { pt: 'Se os pods novos não aparecem, procure `FailedCreate` em `oc get events`: o limit de CPU do `report-builder` passa do máximo.', en: 'If the new pods do not show up, look for `FailedCreate` in `oc get events`: the `report-builder` CPU limit is above the maximum.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('etl', NS, 'nimbus/reports:4.1', { replicas: 2 }));
    c.create(deployment('report-builder', NS, 'nimbus/reports:4.1', { extra: { container: { resources: { requests: { cpu: '500m', memory: '512Mi' }, limits: { cpu: '2', memory: '1Gi' } } } } }));
    c.tick(10);
  },
  checks: [
    {
      text: { pt: 'analytics-limits tem os padrões e o máximo pedidos', en: 'analytics-limits has the requested defaults and maximum' },
      test: (w) => {
        const lim = (w.get('LimitRange', 'analytics-limits', NS)?.spec?.limits || []).find((l) => (l.type || 'Container') === 'Container');
        return Boolean(lim) && mesmos(lim.default, PADRAO.limits) && mesmos(lim.defaultRequest, PADRAO.requests) && mesmos(lim.max, { cpu: '1', memory: '1Gi' });
      },
    },
    {
      text: { pt: 'Os pods do etl rodam com os valores padrão', en: 'The etl pods run with the default values' },
      test: (w) => w.ready('etl', NS) && w.pods(NS, { app: 'etl' }).every((p) => recursos(p.spec.containers[0], PADRAO)),
    },
    {
      text: { pt: 'report-builder foi recriado e está pronto, dentro do máximo', en: 'report-builder was recreated and is ready, within the maximum' },
      test: (w) => {
        const pods = w.pods(NS, { app: 'report-builder' });
        const lr = w.get('LimitRange', 'analytics-limits', NS);
        return w.ready('report-builder', NS) && Boolean(lr) && pods.every((p) => Date.parse(p.metadata.creationTimestamp) >= Date.parse(lr.metadata.creationTimestamp));
      },
    },
  ],
  solution: [
    { cmd: 'oc project analytics', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `cat > limits.yaml <<EOF
apiVersion: v1
kind: LimitRange
metadata:
  name: analytics-limits
spec:
  limits:
    - type: Container
      default:
        cpu: 300m
        memory: 256Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
      max:
        cpu: "1"
        memory: 1Gi
EOF`, pt: 'O limit range em YAML.', en: 'The limit range in YAML.' },
    { cmd: 'oc apply -f limits.yaml', pt: 'Cria o limit range.', en: 'Creates the limit range.' },
    { cmd: 'oc rollout restart deployment etl report-builder', pt: 'Recria os pods dos dois deployments.', en: 'Recreates the pods of both deployments.' },
    { cmd: 'sleep 10; oc get events | grep FailedCreate | tail -1', pt: 'O report-builder pede limit de 2 CPUs, acima do máximo.', en: 'report-builder asks for a 2 CPU limit, above the maximum.' },
    { cmd: 'oc set resources deployment report-builder --limits cpu=1', pt: 'Baixa o limit para o máximo permitido.', en: 'Lowers the limit to the allowed maximum.' },
    { cmd: 'sleep 20; oc get pods', pt: 'Todos os pods novos rodando.', en: 'All new pods running.' },
    { cmd: "oc get pod -l app=etl -o jsonpath='{.items[0].spec.containers[0].resources}'", pt: 'O etl recebeu os padrões.', en: 'etl got the defaults.' },
  ],
};
