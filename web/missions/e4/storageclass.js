import { deployment } from '../../engine/world.js';

const NS = 'media';
const DIR = '/var/lib/notes';

export default {
  id: 'e4-storageclass',
  minutes: 20,
  xp: 210,
  difficulty: 3,
  objectives: ['Escolher uma storage class', 'Provisionar volumes de dados persistentes'],
  title: { pt: 'Um volume, duas réplicas', en: 'One volume, two replicas' },
  startNamespace: NS,
  story: {
    pt: 'O servidor de mídia precisa de duas réplicas lendo e gravando a mesma pasta de uploads. O PVC foi criado pedindo `ReadWriteMany`, mas está `Pending` desde ontem, e os pods também.',
    en: 'The media server needs two replicas reading and writing the same uploads folder. The PVC was created asking for `ReadWriteMany`, but it has been `Pending` since yesterday, and so have the pods.',
  },
  tasks: {
    pt: [
      'No projeto `media`, descubra por que o PVC `uploads` não liga a um volume.',
      'Faça o PVC `uploads` (1Gi, `ReadWriteMany`) ficar `Bound` usando uma storage class do cluster que aceite esse modo de acesso.',
      `O deployment \`media\` deve ficar com as 2 réplicas prontas, as duas montando o PVC \`uploads\` em \`${DIR}\`.`,
    ],
    en: [
      'In the `media` project, find out why the `uploads` PVC does not bind to a volume.',
      'Make the `uploads` PVC (1Gi, `ReadWriteMany`) become `Bound` using a cluster storage class that supports that access mode.',
      `The \`media\` deployment must have its 2 replicas ready, both mounting the \`uploads\` PVC at \`${DIR}\`.`,
    ],
  },
  hints: [
    { pt: '`oc describe pvc uploads` mostra o evento do provisionador; `oc get storageclass` lista as classes e os provisionadores.', en: '`oc describe pvc uploads` shows the provisioner event; `oc get storageclass` lists the classes and provisioners.' },
    { pt: 'O spec de um PVC não muda depois de criado: apague e crie de novo com o mesmo nome e `storageClassName` certo.', en: 'A PVC spec cannot change after creation: delete it and create it again with the same name and the right `storageClassName`.' },
    { pt: '`oc set volumes deployment/media --add --overwrite --name uploads --type pvc --claim-name uploads --claim-size 1Gi --claim-mode rwx --claim-class CLASSE --mount-path DIR`.', en: '`oc set volumes deployment/media --add --overwrite --name uploads --type pvc --claim-name uploads --claim-size 1Gi --claim-mode rwx --claim-class CLASS --mount-path DIR`.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create({ kind: 'PersistentVolumeClaim', metadata: { name: 'uploads', namespace: NS }, spec: { accessModes: ['ReadWriteMany'], resources: { requests: { storage: '1Gi' } } } });
    c.create(deployment('media', NS, 'nimbus/notes:1.0', {
      replicas: 2,
      container: 'notes',
      extra: { container: { volumeMounts: [{ name: 'uploads', mountPath: DIR }] }, pod: { volumes: [{ name: 'uploads', persistentVolumeClaim: { claimName: 'uploads' } }] } },
    }));
  },
  checks: [
    {
      text: { pt: 'uploads é RWX, de uma classe que aceita RWX, e está Bound', en: 'uploads is RWX, from a class that supports RWX, and is Bound' },
      test: (w) => {
        const p = w.get('PersistentVolumeClaim', 'uploads', NS);
        return p?.status?.phase === 'Bound' && p.spec.accessModes.includes('ReadWriteMany') && p.spec.storageClassName === 'nfs-storage';
      },
    },
    {
      text: { pt: 'media tem 2 réplicas prontas montando uploads', en: 'media has 2 ready replicas mounting uploads' },
      test: (w) => {
        const spec = w.get('Deployment', 'media', NS).spec.template.spec;
        const v = (spec.volumes || []).find((x) => x.persistentVolumeClaim?.claimName === 'uploads');
        return w.get('Deployment', 'media', NS).spec.replicas === 2 && Boolean(v) && spec.containers[0].volumeMounts?.some((m) => m.name === v.name && m.mountPath === DIR) && w.ready('media', NS);
      },
    },
  ],
  solution: [
    { cmd: 'oc project media', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pvc,pods', pt: 'PVC e pods `Pending`.', en: 'PVC and pods `Pending`.' },
    { cmd: 'oc describe pvc uploads | tail -4', pt: 'A classe padrão (`topolvm.io`) não aceita `ReadWriteMany`.', en: 'The default class (`topolvm.io`) does not support `ReadWriteMany`.' },
    { cmd: 'oc get storageclass', pt: '`nfs-storage` é a opção compartilhada.', en: '`nfs-storage` is the shared option.' },
    { cmd: 'oc delete pvc uploads', pt: 'O spec não muda: recria.', en: 'The spec cannot change: recreate it.' },
    { cmd: `oc set volumes deployment/media --add --overwrite --name uploads --type pvc --claim-name uploads --claim-size 1Gi --claim-mode rwx --claim-class nfs-storage --mount-path ${DIR}`, pt: 'Novo PVC na classe NFS, montado nas duas réplicas.', en: 'New PVC in the NFS class, mounted in both replicas.' },
    { cmd: 'oc rollout status deployment/media && oc get pvc', pt: '`Bound` e 2/2.', en: '`Bound` and 2/2.' },
  ],
};
