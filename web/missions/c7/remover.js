import { csvDe } from './comum.js';
import { instalaPacote } from '../../sim/olm.js';

const NS = 'openshift-logging';
const PKG = 'cluster-logging';

export default {
  id: 'c7-remover',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Desinstalar operators', 'Excluir operators', 'Usar a CLI para gerenciar o cluster'],
  title: { pt: 'Desligando o que ninguém usa', en: 'Switching off what nobody uses' },
  story: {
    pt: 'A Nimbus migrou os logs para um serviço externo, mas o operator de Logging continua instalado, consumindo recursos e aparecendo nos relatórios de atualização. Hora de removê-lo de vez.',
    en: 'Nimbus moved its logs to an external service, but the Logging operator is still installed, using resources and showing up in update reports. Time to remove it for good.',
  },
  tasks: {
    pt: [
      'Remova o operator `cluster-logging`, instalado no projeto `openshift-logging`.',
      'Não pode sobrar subscription, install plan, CSV nem o deployment do operator.',
      'O projeto `openshift-logging` deve continuar existindo: outro time vai reaproveitá-lo.',
    ],
    en: [
      'Remove the `cluster-logging` operator, installed in the `openshift-logging` project.',
      'No subscription, install plan, CSV, or operator deployment may remain.',
      'The `openshift-logging` project must keep existing: another team will reuse it.',
    ],
  },
  hints: [
    { pt: 'Remover um operator pela CLI são dois passos: apagar a subscription e apagar o CSV.', en: 'Removing an operator through the CLI takes two steps: deleting the subscription and deleting the CSV.' },
    { pt: 'O nome do CSV instalado aparece em `oc get sub NOME -o jsonpath=\'{.status.installedCSV}\'`.', en: 'The installed CSV name shows up in `oc get sub NAME -o jsonpath=\'{.status.installedCSV}\'`.' },
    { pt: 'O deployment do operator pertence ao CSV e some junto com ele; os install plans pertencem à subscription.', en: 'The operator deployment belongs to the CSV and goes away with it; the install plans belong to the subscription.' },
  ],
  setup(w) {
    instalaPacote(w.cluster, PKG, NS);
  },
  checks: [
    {
      text: { pt: 'Não sobrou subscription nem install plan', en: 'No subscription or install plan is left' },
      test: (w) => !w.list('Subscription', NS).length && !w.list('InstallPlan', NS).length,
    },
    {
      text: { pt: 'Não sobrou CSV nem deployment do operator', en: 'No CSV or operator deployment is left' },
      test: (w) => !csvDe(w, PKG, NS).length && !w.get('Deployment', 'cluster-logging-operator', NS),
    },
    {
      text: { pt: 'O projeto openshift-logging continua existindo', en: 'The openshift-logging project still exists' },
      test: (w) => Boolean(w.get('Namespace', NS)),
    },
  ],
  solution: [
    { cmd: 'oc get sub,csv -n openshift-logging', pt: 'O que está instalado.', en: 'What is installed.' },
    { cmd: "CSV=$(oc get sub cluster-logging -n openshift-logging -o jsonpath='{.status.installedCSV}')", pt: 'Guarda o nome do CSV antes de apagar a subscription.', en: 'Saves the CSV name before deleting the subscription.' },
    { cmd: 'oc delete sub cluster-logging -n openshift-logging', pt: 'Sem subscription, o OLM para de atualizar. O operator continua rodando.', en: 'Without the subscription, OLM stops updating. The operator keeps running.' },
    { cmd: 'oc get csv,deploy -n openshift-logging', pt: 'O CSV e o deployment ainda estão lá.', en: 'The CSV and the deployment are still there.' },
    { cmd: 'oc delete csv $CSV -n openshift-logging', pt: 'Apaga o CSV, e o deployment vai junto.', en: 'Deletes the CSV, and the deployment goes with it.' },
    { cmd: 'oc get sub,installplan,csv,deploy -n openshift-logging', pt: 'Nada sobrou.', en: 'Nothing is left.' },
  ],
};
