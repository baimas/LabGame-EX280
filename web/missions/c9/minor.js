import { emVersao, atualizado } from './comum.js';

const API = 'reportschedules.v1beta1.reports.nimbus.io';
const USUARIO = 'system:serviceaccount:capacity-tools:report-scheduler';

export default {
  id: 'c9-minor',
  minutes: 30,
  xp: 300,
  difficulty: 3,
  objectives: ['Atualizar o cluster OpenShift', 'Identificar APIs depreciadas antes de atualizar'],
  title: { pt: 'Rumo à 4.22', en: 'On to 4.22' },
  story: {
    pt: 'A Plataforma aprovou a migração do cluster de homologação, ainda na 4.21, para o OpenShift 4.22. A 4.22 traz o Kubernetes 1.35, que remove APIs antigas, e o cluster não deixa atualizar enquanto um administrador não confirmar que avaliou o impacto. (As APIs depreciadas deste laboratório são de um operator fictício da Nimbus.)',
    en: 'The Platform team approved moving the staging cluster, still on 4.21, to OpenShift 4.22. 4.22 ships Kubernetes 1.35, which removes old APIs, and the cluster will not update until an administrator confirms the impact was assessed. (The deprecated APIs in this lab belong to a fictional Nimbus operator.)',
  },
  tasks: {
    pt: [
      'Descubra qual API que será removida no Kubernetes 1.35 ainda recebe requisições. Grave o nome dela (como aparece em `apirequestcounts`) em `~/upgrade/api.txt`, e o usuário que a chama em `~/upgrade/usuario.txt`.',
      'Dê o reconhecimento de administrador (admin-ack) exigido para a 4.22.',
      'Troque o canal para `stable-4.22` e atualize o cluster para a versão 4.22 mais nova recomendada. Espere terminar.',
    ],
    en: [
      'Find which API to be removed in Kubernetes 1.35 still receives requests. Write its name (as shown in `apirequestcounts`) to `~/upgrade/api.txt`, and the user calling it to `~/upgrade/usuario.txt`.',
      'Give the administrator acknowledgment (admin-ack) required for 4.22.',
      'Switch the channel to `stable-4.22` and update the cluster to the newest recommended 4.22 version. Wait for it to finish.',
    ],
  },
  hints: [
    { pt: '`oc get apirequestcounts` tem a coluna `REMOVEDINRELEASE`. O usuário fica em `.status.last24h[*].byNode[*].byUser[*].username`.', en: '`oc get apirequestcounts` has the `REMOVEDINRELEASE` column. The user is at `.status.last24h[*].byNode[*].byUser[*].username`.' },
    { pt: '`oc adm upgrade` mostra `Upgradeable=False` com o motivo. A chave do ack está no config map `admin-gates` do projeto `openshift-config-managed`; o ack vai no config map `admin-acks` do `openshift-config`, com valor `"true"`.', en: '`oc adm upgrade` shows `Upgradeable=False` with the reason. The ack key is in the `admin-gates` config map of the `openshift-config-managed` project; the ack goes in the `admin-acks` config map of `openshift-config`, with value `"true"`.' },
    { pt: '`oc adm upgrade channel stable-4.22` troca o canal; depois `oc adm upgrade` lista as versões 4.22 recomendadas.', en: '`oc adm upgrade channel stable-4.22` switches the channel; then `oc adm upgrade` lists the recommended 4.22 versions.' },
  ],
  setup(w) {
    emVersao(w, '4.21.12');
    w.fs.mkdir('/home/student/upgrade', true);
  },
  checks: [
    {
      text: { pt: 'api.txt e usuario.txt identificam a API depreciada e quem a usa', en: 'api.txt and usuario.txt identify the deprecated API and its user' },
      test: (w) => w.file('upgrade/api.txt') === API && w.file('upgrade/usuario.txt') === USUARIO,
    },
    {
      text: { pt: 'O admin-ack da 4.22 foi dado', en: 'The 4.22 admin-ack was given' },
      test: (w) => w.get('ConfigMap', 'admin-acks', 'openshift-config')?.data?.['ack-4.21-kube-1.35-api-removals-in-4.22'] === 'true',
    },
    {
      text: { pt: 'O cluster está na 4.22.6, no canal stable-4.22', en: 'The cluster is on 4.22.6, in the stable-4.22 channel' },
      test: (w) => atualizado(w, '4.22.6') && w.get('ClusterVersion', 'version').spec.channel === 'stable-4.22',
    },
  ],
  solution: [
    { cmd: 'oc adm upgrade', pt: '`Upgradeable=False`: falta o admin-ack.', en: '`Upgradeable=False`: the admin-ack is missing.' },
    { cmd: 'oc get apirequestcounts | grep 1.35', pt: 'Duas APIs saem na 1.35; só uma tem requisições.', en: 'Two APIs go away in 1.35; only one has requests.' },
    { cmd: `echo ${API} > ~/upgrade/api.txt`, pt: 'Grava a API.', en: 'Writes the API down.' },
    { cmd: `oc get apirequestcount ${API} -o jsonpath='{.status.last24h[*].byNode[*].byUser[*].username}' > ~/upgrade/usuario.txt`, pt: 'Quem chama a API.', en: 'Who calls the API.' },
    { cmd: 'oc get cm admin-gates -n openshift-config-managed -o yaml | grep ack-', pt: 'A chave do ack.', en: 'The ack key.' },
    { cmd: 'oc -n openshift-config patch cm admin-acks --type merge -p \'{"data":{"ack-4.21-kube-1.35-api-removals-in-4.22":"true"}}\'', pt: 'Dá o ack.', en: 'Gives the ack.' },
    { cmd: 'oc adm upgrade channel stable-4.22', pt: 'Troca o canal.', en: 'Switches the channel.' },
    { cmd: 'oc adm upgrade', pt: '`Upgradeable` voltou a `True`; recomendadas 4.22.6 e 4.22.4.', en: '`Upgradeable` is back to `True`; 4.22.6 and 4.22.4 recommended.' },
    { cmd: 'oc adm upgrade --to 4.22.6', pt: 'Pede a mais nova.', en: 'Requests the newest one.' },
    { cmd: 'sleep 120; sleep 120; sleep 90', pt: 'Espera a atualização.', en: 'Waits for the update.' },
    { cmd: 'oc get clusterversion; oc get nodes', pt: '4.22.6, com o kubelet no Kubernetes 1.35.', en: '4.22.6, with the kubelet on Kubernetes 1.35.' },
  ],
};
