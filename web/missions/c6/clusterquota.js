import { deployment, service } from '../../engine/world.js';
import { mesmos } from './comum.js';
import { projetosDa } from '../../sim/quota.js';

const HARD = { pods: '12', services: '6', 'requests.cpu': '4' };

export default {
  id: 'c6-clusterquota',
  minutes: 20,
  xp: 230,
  difficulty: 3,
  objectives: ['Configurar quotas de recursos para vários projetos', 'Trabalhar com labels e selectors'],
  title: { pt: 'Um orçamento para o time Órion', en: 'A budget for team Orion' },
  story: {
    pt: 'O time Órion tem vários projetos e o orçamento é do time, não de cada projeto. Uma quota por projeto não resolve: o limite precisa valer para a soma de todos eles.',
    en: 'Team Orion has several projects and the budget belongs to the team, not to each project. A per-project quota will not do: the limit must apply to the sum of all of them.',
  },
  tasks: {
    pt: [
      'Os projetos do time Órion têm o label `team=orion`. O projeto `orion-api` também é do time, mas ficou sem o label.',
      'Crie a cluster resource quota `orion-budget`, que vale para todos os projetos com `team=orion`: no máximo 12 pods, 6 services e 4 CPUs em requests.',
      'O projeto `orion-legacy` é de outro time e não pode entrar na quota.',
      'Grave em `~/orion/pods.txt` só o número de pods que a quota contabiliza no total.',
    ],
    en: [
      'Team Orion projects carry the `team=orion` label. The `orion-api` project also belongs to the team, but it is missing the label.',
      'Create the `orion-budget` cluster resource quota, which applies to every project with `team=orion`: at most 12 pods, 6 services, and 4 CPUs in requests.',
      'The `orion-legacy` project belongs to another team and must not be covered by the quota.',
      'Write to `~/orion/pods.txt` only the total number of pods the quota accounts for.',
    ],
  },
  hints: [
    { pt: '`oc create clusterresourcequota NOME --project-label-selector team=orion --hard pods=12,...`.', en: '`oc create clusterresourcequota NAME --project-label-selector team=orion --hard pods=12,...`.' },
    { pt: 'Projeto é namespace: `oc label namespace orion-api team=orion`.', en: 'A project is a namespace: `oc label namespace orion-api team=orion`.' },
    { pt: 'O uso somado fica em `.status.total.used` da quota; `oc describe clusterresourcequota` mostra também os projetos escolhidos.', en: 'The combined usage is in the quota `.status.total.used`; `oc describe clusterresourcequota` also shows the selected projects.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: 'orion-web', labels: { team: 'orion' } } });
    c.create({ kind: 'Namespace', metadata: { name: 'orion-api' } });
    c.create({ kind: 'Namespace', metadata: { name: 'orion-legacy', labels: { team: 'legacy' } } });
    c.create(deployment('web', 'orion-web', 'nimbus/portal:1.1', { replicas: 3 }));
    c.create(service('web', 'orion-web'));
    c.create(deployment('api', 'orion-api', 'nimbus/billing-api:2.0', { replicas: 2 }));
    c.create(service('api', 'orion-api'));
    c.create(deployment('old', 'orion-legacy', 'nimbus/portal:1.0', { replicas: 2 }));
    w.fs.mkdir('/home/student/orion', true);
  },
  checks: [
    {
      text: { pt: 'orion-budget tem os limites pedidos', en: 'orion-budget has the requested limits' },
      test: (w) => mesmos(w.get('ClusterResourceQuota', 'orion-budget')?.spec?.quota?.hard, HARD),
    },
    {
      text: { pt: 'A quota vale para orion-web e orion-api, e não para orion-legacy', en: 'The quota covers orion-web and orion-api, but not orion-legacy' },
      test: (w) => {
        const q = w.get('ClusterResourceQuota', 'orion-budget');
        return Boolean(q) && JSON.stringify(projetosDa(w.cluster, q)) === '["orion-api","orion-web"]' && w.get('Namespace', 'orion-api').metadata.labels?.team === 'orion';
      },
    },
    {
      text: { pt: 'pods.txt tem o total de pods contabilizado', en: 'pods.txt holds the total pod count' },
      test: (w) => {
        const q = w.get('ClusterResourceQuota', 'orion-budget');
        return Boolean(q?.status?.total) && w.file('orion/pods.txt') === q.status.total.used.pods;
      },
    },
  ],
  solution: [
    { cmd: 'oc get projects -l team=orion', pt: 'Só `orion-web` aparece.', en: 'Only `orion-web` shows up.' },
    { cmd: 'oc label namespace orion-api team=orion', pt: 'Coloca o `orion-api` no time.', en: 'Puts `orion-api` in the team.' },
    { cmd: 'oc create clusterresourcequota orion-budget --project-label-selector team=orion --hard pods=12,services=6,requests.cpu=4', pt: 'Uma quota para os projetos do time.', en: 'One quota for the team projects.' },
    { cmd: 'oc describe clusterresourcequota orion-budget', pt: 'Os dois projetos escolhidos e o uso somado.', en: 'Both selected projects and the combined usage.' },
    { cmd: "oc get clusterresourcequota orion-budget -o jsonpath='{.status.total.used.pods}' > ~/orion/pods.txt", pt: 'Grava o total de pods.', en: 'Writes the pod total.' },
    { cmd: 'cat ~/orion/pods.txt', pt: '3 pods do web e 2 da api.', en: '3 web pods and 2 api pods.' },
  ],
};
