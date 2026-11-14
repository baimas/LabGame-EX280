import yaml from '../../vendor/js-yaml.mjs';
import { REGISTRY } from '../../engine/world.js';

const NS = 'intranet';
const DIR = '/home/student/labs/intranet';
const APLICADO = 'kubectl.kubernetes.io/last-applied-configuration';

const DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: intranet
  labels:
    app: intranet
spec:
  replicas: 1
  selector:
    matchLabels:
      app: intranet
  template:
    metadata:
      labels:
        app: intranet-web
    spec:
      containers:
        - name: intranet
          image: ${REGISTRY}/nimbus/portal:1.0
          ports:
            - containerPort: 8080
`;

const SERVICE = `apiVersion: v1
kind: Service
metadata:
  name: intranet
  labels:
    app: intranet
spec:
  selector:
    app: intranet
  ports:
    - port: 8080
      targetPort: 8080
`;

const aplicado = (w) => JSON.parse(w.get('Deployment', 'intranet', NS).metadata.annotations[APLICADO]);

export default {
  id: 'c1-manifestos',
  minutes: 15,
  xp: 150,
  difficulty: 2,
  objectives: ['Trabalhar com manifestos de recursos', 'Implantar aplicações a partir de manifestos YAML', 'Atualizar implantações de aplicações'],
  title: { pt: 'O que vale é o arquivo', en: 'The file is the truth' },
  story: {
    pt: 'A Nimbus decidiu que nada mais entra no cluster por comando avulso: todo recurso precisa existir em um manifesto versionado. O time da Intranet mandou os arquivos deles, mas avisou que "o deployment não aplica".',
    en: 'Nimbus decided that nothing else gets into the cluster through one-off commands: every resource must exist in a versioned manifest. The Intranet team sent their files, but warned that "the deployment does not apply".',
  },
  tasks: {
    pt: [
      'Crie o projeto `intranet` e aplique nele, de forma declarativa, os manifestos de `~/labs/intranet`.',
      'O manifesto do deployment tem um erro. Corrija-o no arquivo.',
      `Ainda no arquivo, ajuste o deployment para 3 réplicas e para a imagem \`${REGISTRY}/nimbus/portal:1.1\`.`,
      'O estado final do cluster deve ter vindo dos arquivos via `oc apply`, com as 3 réplicas prontas.',
    ],
    en: [
      'Create the `intranet` project and declaratively apply the manifests from `~/labs/intranet` to it.',
      'The deployment manifest has an error. Fix it in the file.',
      `Still in the file, set the deployment to 3 replicas and to the \`${REGISTRY}/nimbus/portal:1.1\` image.`,
      'The final cluster state must come from the files through `oc apply`, with all 3 replicas ready.',
    ],
  },
  hints: [
    { pt: 'Rode `oc apply -f ~/labs/intranet/` e leia a mensagem de erro: ela aponta o campo exato.', en: 'Run `oc apply -f ~/labs/intranet/` and read the error message: it points to the exact field.' },
    { pt: 'O seletor do deployment precisa coincidir com os labels do template de pod.', en: 'The deployment selector must match the labels of the pod template.' },
    { pt: 'Edite com `vi` ou `sed -i`, confira com `oc diff -f` e aplique de novo com `oc apply -f`.', en: 'Edit with `vi` or `sed -i`, check with `oc diff -f`, and apply again with `oc apply -f`.' },
  ],
  setup(w) {
    w.fs.put(`${DIR}/deployment.yaml`, DEPLOYMENT);
    w.fs.put(`${DIR}/service.yaml`, SERVICE);
  },
  checks: [
    {
      text: { pt: 'O arquivo deployment.yaml pede 3 réplicas da imagem portal:1.1', en: 'The deployment.yaml file asks for 3 replicas of the portal:1.1 image' },
      test: (w) => {
        const d = yaml.load(w.fs.read(`${DIR}/deployment.yaml`));
        return d.spec.replicas === 3 && d.spec.template.spec.containers[0].image === `${REGISTRY}/nimbus/portal:1.1`;
      },
    },
    {
      text: { pt: 'O deployment foi aplicado a partir do arquivo com `oc apply`', en: 'The deployment was applied from the file with `oc apply`' },
      test: (w) => aplicado(w).spec.replicas === 3 && aplicado(w).spec.template.spec.containers[0].image === `${REGISTRY}/nimbus/portal:1.1`,
    },
    {
      text: { pt: 'O deployment intranet tem 3 réplicas prontas', en: 'The intranet deployment has 3 ready replicas' },
      test: (w) => w.get('Deployment', 'intranet', NS).spec.replicas === 3 && w.ready('intranet', NS),
    },
    {
      text: { pt: 'O service intranet alcança os 3 pods', en: 'The intranet service reaches all 3 pods' },
      test: (w) => w.pods(NS, w.get('Service', 'intranet', NS).spec.selector).filter(w.podPronto).length === 3,
    },
  ],
  solution: [
    { cmd: 'oc new-project intranet', pt: 'Cria o projeto de destino.', en: 'Creates the target project.' },
    { cmd: 'cat ~/labs/intranet/deployment.yaml', pt: 'O seletor pede `app: intranet`, mas o template rotula os pods como `app: intranet-web`. A API recusa esse deployment.', en: 'The selector asks for `app: intranet`, but the template labels the pods `app: intranet-web`. The API rejects that deployment.' },
    { cmd: "sed -i 's/app: intranet-web/app: intranet/' ~/labs/intranet/deployment.yaml", pt: 'Corrige o label do template no arquivo.', en: 'Fixes the template label in the file.' },
    { cmd: "sed -i 's/replicas: 1/replicas: 3/' ~/labs/intranet/deployment.yaml", pt: 'Ajusta as réplicas.', en: 'Sets the replicas.' },
    { cmd: "sed -i 's/portal:1.0/portal:1.1/' ~/labs/intranet/deployment.yaml", pt: 'Ajusta a versão da imagem.', en: 'Sets the image version.' },
    { cmd: 'oc apply -f ~/labs/intranet/', pt: 'Aplica todos os manifestos do diretório.', en: 'Applies every manifest in the directory.' },
    { cmd: 'oc rollout status deployment/intranet', pt: 'Aguarda as 3 réplicas.', en: 'Waits for the 3 replicas.' },
    { cmd: 'oc diff -f ~/labs/intranet/', pt: 'Sem saída: cluster e arquivos estão iguais.', en: 'No output: cluster and files match.' },
  ],
};
