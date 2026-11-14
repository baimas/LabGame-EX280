import { atualizado } from './comum.js';

export default {
  id: 'c9-zstream',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Atualizar o cluster OpenShift', 'Examinar recursos e o status do cluster'],
  title: { pt: 'Patch de segurança', en: 'Security patch' },
  story: {
    pt: 'Saiu um boletim de segurança e o cluster está algumas versões de patch atrás. A janela de manutenção é agora: atualize para a versão mais nova recomendada, sem trocar de minor.',
    en: 'A security advisory came out and the cluster is a few patch versions behind. The maintenance window is now: update to the newest recommended version, without changing the minor version.',
  },
  tasks: {
    pt: [
      'Antes de começar, grave em `~/upgrade/antes.txt` só a versão atual do cluster.',
      'Atualize o cluster para a versão mais nova recomendada no canal `stable-4.22`.',
      'Espere a atualização terminar: todos os cluster operators devem estar na versão nova.',
    ],
    en: [
      'Before starting, write only the current cluster version to `~/upgrade/antes.txt`.',
      'Update the cluster to the newest recommended version in the `stable-4.22` channel.',
      'Wait for the update to finish: every cluster operator must be on the new version.',
    ],
  },
  hints: [
    { pt: '`oc adm upgrade` mostra a versão atual, o canal e as atualizações recomendadas.', en: '`oc adm upgrade` shows the current version, the channel, and the recommended updates.' },
    { pt: '`oc adm upgrade --to-latest` (ou `--to VERSÃO`) pede a atualização; o Cluster Version Operator faz o resto.', en: '`oc adm upgrade --to-latest` (or `--to VERSION`) requests the update; the Cluster Version Operator does the rest.' },
    { pt: 'Acompanhe com `oc get clusterversion` e `oc get co`. A atualização leva alguns minutos do relógio do jogo; `sleep 120` ajuda a esperar.', en: 'Follow with `oc get clusterversion` and `oc get co`. The update takes a few minutes of game clock; `sleep 120` helps you wait.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/upgrade', true);
  },
  checks: [
    {
      text: { pt: 'antes.txt tem a versão anterior', en: 'antes.txt holds the previous version' },
      test: (w) => w.file('upgrade/antes.txt') === '4.22.4',
    },
    {
      text: { pt: 'O cluster está na 4.22.8, no canal stable-4.22', en: 'The cluster is on 4.22.8, in the stable-4.22 channel' },
      test: (w) => atualizado(w, '4.22.8') && w.get('ClusterVersion', 'version').spec.channel === 'stable-4.22',
    },
  ],
  solution: [
    { cmd: "oc get clusterversion version -o jsonpath='{.status.desired.version}' > ~/upgrade/antes.txt", pt: 'Guarda a versão atual.', en: 'Saves the current version.' },
    { cmd: 'oc adm upgrade', pt: 'Canal `stable-4.22`; recomendadas 4.22.8 e 4.22.6.', en: '`stable-4.22` channel; 4.22.8 and 4.22.6 recommended.' },
    { cmd: 'oc adm upgrade --to-latest', pt: 'Pede a mais nova.', en: 'Requests the newest one.' },
    { cmd: 'sleep 120; oc get clusterversion', pt: 'Em andamento, com a porcentagem.', en: 'In progress, with the percentage.' },
    { cmd: 'sleep 120; sleep 90', pt: 'Espera o restante.', en: 'Waits for the rest.' },
    { cmd: 'oc get clusterversion; oc get co', pt: 'Tudo na 4.22.8.', en: 'Everything on 4.22.8.' },
  ],
};
