import { REGISTRY } from '../../engine/world.js';
import { releases, releaseHistory } from '../../sim/helm.js';
import { REPO_URL } from '../../sim/charts.js';

const NS = 'portal-helm';

const atual = (w) => releases(w.cluster, NS).find((r) => r.name === 'portal');
const hist = (w) => releaseHistory(w.cluster, NS, 'portal');
const ct = (w) => w.get('Deployment', 'portal', NS).spec.template.spec.containers[0];

export default {
  id: 'c2-helm-upgrade',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Implantar aplicações a partir de Helm charts', 'Atualizar implantações de aplicações'],
  title: { pt: 'Helm: atualizar, voltar e atualizar de novo', en: 'Helm: upgrade, roll back, upgrade again' },
  story: {
    pt: 'O portal roda em produção como a release `portal`, com 3 réplicas e route. O fornecedor publicou a versão 0.3.0 do chart e a gerência quer a atualização hoje. Se der errado, o portal não pode ficar fora do ar.',
    en: 'The portal runs in production as the `portal` release, with 3 replicas and a route. The vendor published chart version 0.3.0 and management wants the upgrade today. If it goes wrong, the portal cannot stay down.',
  },
  tasks: {
    pt: [
      'Trabalhe na release `portal` do projeto `portal-helm`. O repositório `nimbus` já está configurado.',
      'Atualize a release para a versão `0.3.0` do chart, mantendo as 3 réplicas e a route.',
      'Se a nova versão não ficar pronta, volte com o Helm para a revisão que funcionava.',
      'Depois, atualize a release para a versão `0.2.0` do chart com limite de memória de `256Mi` no contêiner, ainda com 3 réplicas e a route.',
      'Ao final, as 3 réplicas devem estar prontas.',
    ],
    en: [
      'Work on the `portal` release of the `portal-helm` project. The `nimbus` repository is already configured.',
      'Upgrade the release to chart version `0.3.0`, keeping the 3 replicas and the route.',
      'If the new version does not become ready, use Helm to go back to the revision that worked.',
      'Then upgrade the release to chart version `0.2.0` with a `256Mi` memory limit on the container, still with 3 replicas and the route.',
      'In the end, all 3 replicas must be ready.',
    ],
  },
  hints: [
    { pt: '`helm history portal` e `helm get values portal` mostram as revisões e os valores que foram informados em cada uma.', en: '`helm history portal` and `helm get values portal` show the revisions and the values given in each one.' },
    { pt: '`helm rollback portal REVISÃO` cria uma revisão nova com o conteúdo da revisão escolhida.', en: '`helm rollback portal REVISION` creates a new revision with the content of the chosen one.' },
    { pt: 'Cuidado: quando você passa qualquer `--set` ou `-f` num upgrade, o Helm descarta os valores anteriores. Use `--reuse-values` ou repita todos os valores.', en: 'Careful: when you pass any `--set` or `-f` on an upgrade, Helm drops the previous values. Use `--reuse-values` or repeat every value.' },
  ],
  async setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    await w.sh(`helm repo add nimbus ${REPO_URL}`);
    await w.sh(`helm install portal nimbus/portal --version 0.1.0 -n ${NS} --set replicaCount=3 --set route.enabled=true`);
    w.cluster.tick(60);
  },
  checks: [
    {
      text: { pt: 'A versão 0.3.0 do chart foi tentada', en: 'Chart version 0.3.0 was attempted' },
      test: (w) => hist(w).some((r) => r.chart.metadata.version === '0.3.0'),
    },
    {
      text: { pt: 'Houve um rollback com o Helm', en: 'There was a rollback with Helm' },
      test: (w) => hist(w).some((r) => r.info.description.startsWith('Rollback to')),
    },
    {
      text: { pt: 'A revisão atual usa o chart portal-0.2.0 (versão 1.1)', en: 'The current revision uses the portal-0.2.0 chart (version 1.1)' },
      test: (w) => atual(w).info.status === 'deployed' && atual(w).chart.metadata.version === '0.2.0' && ct(w).image === `${REGISTRY}/nimbus/portal:1.1`,
    },
    {
      text: { pt: 'O contêiner tem limite de memória de 256Mi', en: 'The container has a 256Mi memory limit' },
      test: (w) => ct(w).resources?.limits?.memory === '256Mi',
    },
    {
      text: { pt: 'Continuam 3 réplicas prontas e a route existe', en: 'There are still 3 ready replicas and the route exists' },
      test: (w) => w.get('Deployment', 'portal', NS).spec.replicas === 3 && w.ready('portal', NS) && Boolean(w.get('Route', 'portal', NS)),
    },
  ],
  solution: [
    { cmd: 'oc project portal-helm', pt: 'Entra no projeto da release.', en: 'Switches to the release project.' },
    { cmd: 'helm history portal && helm get values portal', pt: 'Uma revisão, com `replicaCount=3` e a route habilitada.', en: 'One revision, with `replicaCount=3` and the route enabled.' },
    { cmd: 'helm upgrade portal nimbus/portal --version 0.3.0', pt: 'Sem `--set` nem `-f`, o Helm reaproveita os valores da revisão anterior.', en: 'Without `--set` or `-f`, Helm reuses the values of the previous revision.' },
    { cmd: 'sleep 10; oc get pods', pt: 'Os pods novos ficam em ImagePullBackOff: a imagem 2.1 do chart não existe.', en: 'The new pods stay in ImagePullBackOff: the chart 2.1 image does not exist.' },
    { cmd: 'helm rollback portal 1', pt: 'Volta para a revisão 1, que funcionava. O rollback vira a revisão 3.', en: 'Goes back to revision 1, which worked. The rollback becomes revision 3.' },
    { cmd: 'helm upgrade portal nimbus/portal --version 0.2.0 --reuse-values --set resources.limits.memory=256Mi', pt: 'Com `--reuse-values`, o limite de memória se soma aos valores anteriores em vez de substituí-los.', en: 'With `--reuse-values`, the memory limit is added to the previous values instead of replacing them.' },
    { cmd: 'oc rollout status deployment/portal', pt: 'Aguarda as 3 réplicas da versão 1.1.', en: 'Waits for the 3 replicas of version 1.1.' },
    { cmd: 'helm history portal', pt: 'Quatro revisões: instalação, upgrade com falha, rollback e o upgrade final.', en: 'Four revisions: install, failed upgrade, rollback, and the final upgrade.' },
  ],
};
