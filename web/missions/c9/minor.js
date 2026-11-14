import { emVersao, atualizado } from './comum.js';

const API = 'flowschemas.v1beta3.flowcontrol.apiserver.k8s.io';
const USUARIO = 'system:serviceaccount:capacity-tools:flow-auditor';

export default {
  id: 'c9-minor',
  minutes: 30,
  xp: 300,
  difficulty: 3,
  objectives: ['Atualizar o cluster OpenShift', 'Identificar APIs depreciadas antes de atualizar'],
  title: { pt: 'Rumo à 4.19', en: 'On to 4.19' },
  story: {
    pt: 'A Plataforma aprovou a migração para o OpenShift 4.19. Só que a 4.19 traz o Kubernetes 1.32, que remove APIs antigas, e o cluster não deixa atualizar enquanto um administrador não confirmar que avaliou o impacto.',
    en: 'The Platform team approved the move to OpenShift 4.19. But 4.19 ships Kubernetes 1.32, which removes old APIs, and the cluster will not update until an administrator confirms the impact was assessed.',
  },
  tasks: {
    pt: [
      'Descubra qual API que será removida no Kubernetes 1.32 ainda recebe requisições. Grave o nome dela (como aparece em `apirequestcounts`) em `~/upgrade/api.txt`, e o usuário que a chama em `~/upgrade/usuario.txt`.',
      'Dê o reconhecimento de administrador (admin-ack) exigido para a 4.19.',
      'Troque o canal para `stable-4.19` e atualize o cluster para a versão 4.19 mais nova recomendada. Espere terminar.',
    ],
    en: [
      'Find which API to be removed in Kubernetes 1.32 still receives requests. Write its name (as shown in `apirequestcounts`) to `~/upgrade/api.txt`, and the user calling it to `~/upgrade/usuario.txt`.',
      'Give the administrator acknowledgment (admin-ack) required for 4.19.',
      'Switch the channel to `stable-4.19` and update the cluster to the newest recommended 4.19 version. Wait for it to finish.',
    ],
  },
  hints: [
    { pt: '`oc get apirequestcounts` tem a coluna `REMOVEDINRELEASE`. O usuário fica em `.status.last24h[*].byNode[*].byUser[*].username`.', en: '`oc get apirequestcounts` has the `REMOVEDINRELEASE` column. The user is at `.status.last24h[*].byNode[*].byUser[*].username`.' },
    { pt: '`oc adm upgrade` mostra `Upgradeable=False` com o motivo. A chave do ack está no config map `admin-gates` do projeto `openshift-config-managed`; o ack vai no config map `admin-acks` do `openshift-config`, com valor `"true"`.', en: '`oc adm upgrade` shows `Upgradeable=False` with the reason. The ack key is in the `admin-gates` config map of the `openshift-config-managed` project; the ack goes in the `admin-acks` config map of `openshift-config`, with value `"true"`.' },
    { pt: '`oc adm upgrade channel stable-4.19` troca o canal; depois `oc adm upgrade` lista as versões 4.19 recomendadas.', en: '`oc adm upgrade channel stable-4.19` switches the channel; then `oc adm upgrade` lists the recommended 4.19 versions.' },
  ],
  setup(w) {
    emVersao(w, '4.18.12');
    w.fs.mkdir('/home/student/upgrade', true);
  },
  checks: [
    {
      text: { pt: 'api.txt e usuario.txt identificam a API depreciada e quem a usa', en: 'api.txt and usuario.txt identify the deprecated API and its user' },
      test: (w) => w.file('upgrade/api.txt') === API && w.file('upgrade/usuario.txt') === USUARIO,
    },
    {
      text: { pt: 'O admin-ack da 4.19 foi dado', en: 'The 4.19 admin-ack was given' },
      test: (w) => w.get('ConfigMap', 'admin-acks', 'openshift-config')?.data?.['ack-4.18-kube-1.32-api-removals-in-4.19'] === 'true',
    },
    {
      text: { pt: 'O cluster está na 4.19.5, no canal stable-4.19', en: 'The cluster is on 4.19.5, in the stable-4.19 channel' },
      test: (w) => atualizado(w, '4.19.5') && w.get('ClusterVersion', 'version').spec.channel === 'stable-4.19',
    },
  ],
  solution: [
    { cmd: 'oc adm upgrade', pt: '`Upgradeable=False`: falta o admin-ack.', en: '`Upgradeable=False`: the admin-ack is missing.' },
    { cmd: 'oc get apirequestcounts | grep 1.32', pt: 'Duas APIs saem na 1.32; só uma tem requisições.', en: 'Two APIs go away in 1.32; only one has requests.' },
    { cmd: `echo ${API} > ~/upgrade/api.txt`, pt: 'Grava a API.', en: 'Writes the API down.' },
    { cmd: `oc get apirequestcount ${API} -o jsonpath='{.status.last24h[*].byNode[*].byUser[*].username}' > ~/upgrade/usuario.txt`, pt: 'Quem chama a API.', en: 'Who calls the API.' },
    { cmd: 'oc get cm admin-gates -n openshift-config-managed -o yaml | grep ack-', pt: 'A chave do ack.', en: 'The ack key.' },
    { cmd: 'oc -n openshift-config patch cm admin-acks --type merge -p \'{"data":{"ack-4.18-kube-1.32-api-removals-in-4.19":"true"}}\'', pt: 'Dá o ack.', en: 'Gives the ack.' },
    { cmd: 'oc adm upgrade channel stable-4.19', pt: 'Troca o canal.', en: 'Switches the channel.' },
    { cmd: 'oc adm upgrade', pt: '`Upgradeable` voltou a `True`; recomendadas 4.19.5 e 4.19.3.', en: '`Upgradeable` is back to `True`; 4.19.5 and 4.19.3 recommended.' },
    { cmd: 'oc adm upgrade --to 4.19.5', pt: 'Pede a mais nova.', en: 'Requests the newest one.' },
    { cmd: 'sleep 120; sleep 120; sleep 90', pt: 'Espera a atualização.', en: 'Waits for the update.' },
    { cmd: 'oc get clusterversion; oc get nodes', pt: '4.19.5, com o kubelet no Kubernetes 1.32.', en: '4.19.5, with the kubelet on Kubernetes 1.32.' },
  ],
};
