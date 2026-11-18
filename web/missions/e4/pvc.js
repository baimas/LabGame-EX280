import { deployment } from '../../engine/world.js';
import { dadosDoVolume } from '../../sim/storage.js';

const NS = 'notes-prod';
const DIR = '/var/lib/notes';

export default {
  id: 'e4-pvc',
  minutes: 20,
  xp: 200,
  difficulty: 2,
  objectives: ['Provisionar volumes de dados persistentes'],
  title: { pt: 'Os anexos sumiram', en: 'The attachments are gone' },
  startNamespace: NS,
  story: {
    pt: 'Toda vez que o pod do Nimbus Notes reinicia, os anexos dos usuários desaparecem. Eles ficam em `/var/lib/notes`, dentro do contêiner. Os usuários já reclamaram três vezes esta semana.',
    en: 'Every time the Nimbus Notes pod restarts, user attachments disappear. They live in `/var/lib/notes`, inside the container. Users have complained three times this week.',
  },
  tasks: {
    pt: [
      `No projeto \`notes-prod\`, dê ao deployment \`notes\` um volume persistente: um PVC chamado \`notes-data\`, de 1Gi, \`ReadWriteOnce\`, da storage class padrão, montado em \`${DIR}\`.`,
      `Crie no volume o arquivo \`${DIR}/welcome.txt\` com o conteúdo \`ola\`.`,
      'Apague o pod do deployment e confirme que o arquivo continua lá no pod novo.',
    ],
    en: [
      `In the \`notes-prod\` project, give the \`notes\` deployment a persistent volume: a PVC named \`notes-data\`, 1Gi, \`ReadWriteOnce\`, from the default storage class, mounted at \`${DIR}\`.`,
      `Create the \`${DIR}/welcome.txt\` file in the volume with the content \`ola\`.`,
      'Delete the deployment pod and confirm that the file is still there in the new pod.',
    ],
  },
  hints: [
    { pt: '`oc get storageclass` mostra a classe padrão e o modo de ligação (`WaitForFirstConsumer` só liga quando um pod usa o PVC).', en: '`oc get storageclass` shows the default class and the binding mode (`WaitForFirstConsumer` only binds when a pod uses the PVC).' },
    { pt: '`oc set volumes deployment/notes --add --name data --type pvc --claim-name notes-data --claim-size 1Gi --claim-mode rwo --mount-path DIR` cria o PVC e monta.', en: '`oc set volumes deployment/notes --add --name data --type pvc --claim-name notes-data --claim-size 1Gi --claim-mode rwo --mount-path DIR` creates the PVC and mounts it.' },
    { pt: '`oc exec deploy/notes -- sh -c \'echo ola > ARQUIVO\'` grava no volume.', en: '`oc exec deploy/notes -- sh -c \'echo ola > FILE\'` writes into the volume.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('notes', NS, 'nimbus/notes:1.0', { container: 'notes' }));
  },
  checks: [
    {
      text: { pt: 'O PVC notes-data (1Gi, RWO, classe padrão) está Bound', en: 'The notes-data PVC (1Gi, RWO, default class) is Bound' },
      test: (w) => {
        const p = w.get('PersistentVolumeClaim', 'notes-data', NS);
        return p?.status?.phase === 'Bound' && p.spec.resources.requests.storage === '1Gi' && p.spec.accessModes.includes('ReadWriteOnce') && p.spec.storageClassName === 'lvms-vg1';
      },
    },
    {
      text: { pt: `O deployment monta notes-data em ${DIR} e está pronto`, en: `The deployment mounts notes-data at ${DIR} and is ready` },
      test: (w) => {
        const spec = w.get('Deployment', 'notes', NS).spec.template.spec;
        const v = (spec.volumes || []).find((x) => x.persistentVolumeClaim?.claimName === 'notes-data');
        return Boolean(v) && (spec.containers[0].volumeMounts || []).some((m) => m.name === v.name && m.mountPath.replace(/\/$/, '') === DIR) && w.ready('notes', NS);
      },
    },
    {
      text: { pt: 'welcome.txt está no volume e sobreviveu a um pod novo', en: 'welcome.txt is in the volume and survived a new pod' },
      test: (w) => {
        const v = dadosDoVolume(w.cluster, NS, 'notes-data');
        const atuais = w.pods(NS, { app: 'notes' }).map((p) => p.metadata.uid);
        return (v?.files['welcome.txt'] || '').trim() === 'ola' && Boolean(v.autor?.['welcome.txt']) && !atuais.includes(v.autor['welcome.txt']) && atuais.length > 0;
      },
    },
  ],
  solution: [
    { cmd: 'oc project notes-prod', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get storageclass', pt: '`lvms-vg1` é a padrão.', en: '`lvms-vg1` is the default.' },
    { cmd: `oc set volumes deployment/notes --add --name data --type pvc --claim-name notes-data --claim-size 1Gi --claim-mode rwo --mount-path ${DIR}`, pt: 'Cria o PVC e monta no deployment.', en: 'Creates the PVC and mounts it in the deployment.' },
    { cmd: 'oc rollout status deployment/notes && oc get pvc', pt: 'PVC `Bound` depois que o pod nasceu.', en: 'PVC `Bound` once the pod was born.' },
    { cmd: `oc exec deploy/notes -- sh -c 'echo ola > ${DIR}/welcome.txt'`, pt: 'Grava no volume.', en: 'Writes into the volume.' },
    { cmd: 'oc delete pod -l app=notes', pt: 'Mata o pod.', en: 'Kills the pod.' },
    { cmd: `sleep 10; oc exec deploy/notes -- cat ${DIR}/welcome.txt`, pt: 'O arquivo continua lá.', en: 'The file is still there.' },
  ],
};
