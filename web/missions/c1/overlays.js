import { REGISTRY } from '../../engine/world.js';
import { resolveEnv } from '../../sim/controllers.js';

const DIR = '/home/student/labs/portal';
const REPO = `${REGISTRY}/nimbus/portal`;

const DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: portal
spec:
  replicas: 1
  selector:
    matchLabels:
      app: portal
  template:
    metadata:
      labels:
        app: portal
    spec:
      containers:
        - name: portal
          image: ${REPO}:1.1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: portal-settings
`;

const SERVICE = `apiVersion: v1
kind: Service
metadata:
  name: portal
spec:
  selector:
    app: portal
  ports:
    - port: 8080
      targetPort: 8080
`;

const BASE = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
`;

const STAGE = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: portal-stage
resources:
  - ../../base
configMapGenerator:
  - name: portal-settings
    literals:
      - MODE=staging
`;

const PROD = `apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: portal-prod
resources:
  - ../../base
replicas:
  - name: portal
    count: 3
images:
  - name: ${REPO}
    newTag: "2.0"
configMapGenerator:
  - name: portal-settings
    literals:
      - MODE=production
patches:
  - target:
      kind: Deployment
      name: portal
    patch: |-
      - op: add
        path: /spec/template/spec/containers/0/resources
        value:
          limits:
            memory: 256Mi
`;

const dep = (w, ns) => w.get('Deployment', 'portal', ns);
const modo = (w, ns) => {
  const pod = w.pods(ns, { app: 'portal' }).find(w.podPronto);
  return pod ? resolveEnv(w.cluster, pod, pod.spec.containers[0]).env.MODE : undefined;
};

export default {
  id: 'c1-overlays',
  minutes: 25,
  xp: 220,
  difficulty: 3,
  objectives: ['Trabalhar com overlays do Kustomize', 'Implantar aplicações com Kustomize', 'Criar e usar config maps'],
  title: { pt: 'Kustomize: uma base, dois ambientes', en: 'Kustomize: one base, two environments' },
  story: {
    pt: 'O Portal vai para homologação e produção a partir dos mesmos manifestos. Copiar e colar YAML entre ambientes foi o que causou o último incidente, então a regra agora é: uma base intocada e um overlay por ambiente.',
    en: 'The Portal goes to staging and production from the same manifests. Copying and pasting YAML between environments is what caused the last incident, so the rule now is: one untouched base and one overlay per environment.',
  },
  tasks: {
    pt: [
      'A base está pronta em `~/labs/portal/base` e não pode ser alterada. Os projetos `portal-stage` e `portal-prod` já existem.',
      'Crie o overlay `~/labs/portal/overlays/stage`: namespace `portal-stage`, 1 réplica e um config map gerado `portal-settings` com `MODE=staging`.',
      `Crie o overlay \`~/labs/portal/overlays/prod\`: namespace \`portal-prod\`, 3 réplicas, imagem \`${REPO}\` na tag \`2.0\` e um config map gerado \`portal-settings\` com \`MODE=production\`.`,
      'No overlay de produção, o contêiner `portal` deve ter limite de memória de `256Mi`, aplicado por um patch.',
      'Aplique os dois overlays. Todos os pods devem ficar prontos.',
    ],
    en: [
      'The base is ready at `~/labs/portal/base` and must not be changed. The `portal-stage` and `portal-prod` projects already exist.',
      'Create the `~/labs/portal/overlays/stage` overlay: `portal-stage` namespace, 1 replica, and a generated `portal-settings` config map with `MODE=staging`.',
      `Create the \`~/labs/portal/overlays/prod\` overlay: \`portal-prod\` namespace, 3 replicas, the \`${REPO}\` image at tag \`2.0\`, and a generated \`portal-settings\` config map with \`MODE=production\`.`,
      'In the production overlay, the `portal` container must have a `256Mi` memory limit, applied through a patch.',
      'Apply both overlays. Every pod must become ready.',
    ],
  },
  hints: [
    { pt: 'O overlay referencia a base em `resources` com um caminho relativo: `../../base`.', en: 'The overlay references the base in `resources` with a relative path: `../../base`.' },
    { pt: 'Use os campos `namespace`, `replicas` (name e count), `images` (name e newTag) e `configMapGenerator`.', en: 'Use the `namespace`, `replicas` (name and count), `images` (name and newTag), and `configMapGenerator` fields.' },
    { pt: 'Em `patches`, informe `target` (kind e name) e um `patch`: pode ser JSON patch (`op`, `path`, `value`) ou um trecho do deployment para fusão.', en: 'Under `patches`, give a `target` (kind and name) and a `patch`: it can be a JSON patch (`op`, `path`, `value`) or a deployment fragment to merge.' },
  ],
  setup(w) {
    w.fs.put(`${DIR}/base/deployment.yaml`, DEPLOYMENT);
    w.fs.put(`${DIR}/base/service.yaml`, SERVICE);
    w.fs.put(`${DIR}/base/kustomization.yaml`, BASE);
    w.fs.mkdir(`${DIR}/overlays/stage`, true);
    w.fs.mkdir(`${DIR}/overlays/prod`, true);
    for (const ns of ['portal-stage', 'portal-prod']) w.cluster.create({ kind: 'Namespace', metadata: { name: ns } });
  },
  checks: [
    {
      text: { pt: 'A base não foi alterada e os dois overlays têm kustomization.yaml', en: 'The base was not changed and both overlays have a kustomization.yaml' },
      test: (w) => w.fs.read(`${DIR}/base/deployment.yaml`) === DEPLOYMENT && w.fs.read(`${DIR}/base/kustomization.yaml`) === BASE && w.fs.isFile(`${DIR}/overlays/stage/kustomization.yaml`) && w.fs.isFile(`${DIR}/overlays/prod/kustomization.yaml`),
    },
    {
      text: { pt: 'Homologação: 1 réplica pronta da tag 1.1 com MODE=staging', en: 'Staging: 1 ready replica of tag 1.1 with MODE=staging' },
      test: (w) => dep(w, 'portal-stage').spec.replicas === 1 && dep(w, 'portal-stage').spec.template.spec.containers[0].image === `${REPO}:1.1` && w.ready('portal', 'portal-stage') && modo(w, 'portal-stage') === 'staging',
    },
    {
      text: { pt: 'Produção: 3 réplicas prontas da tag 2.0', en: 'Production: 3 ready replicas of tag 2.0' },
      test: (w) => dep(w, 'portal-prod').spec.replicas === 3 && dep(w, 'portal-prod').spec.template.spec.containers[0].image === `${REPO}:2.0` && w.ready('portal', 'portal-prod'),
    },
    {
      text: { pt: 'Produção: os pods recebem MODE=production', en: 'Production: the pods receive MODE=production' },
      test: (w) => modo(w, 'portal-prod') === 'production',
    },
    {
      text: { pt: 'Produção: o contêiner portal tem limite de memória de 256Mi', en: 'Production: the portal container has a 256Mi memory limit' },
      test: (w) => dep(w, 'portal-prod').spec.template.spec.containers[0].resources.limits.memory === '256Mi',
    },
    {
      text: { pt: 'Os services existem nos dois projetos', en: 'The services exist in both projects' },
      test: (w) => Boolean(w.get('Service', 'portal', 'portal-stage') && w.get('Service', 'portal', 'portal-prod')),
    },
  ],
  solution: [
    { cmd: 'oc kustomize ~/labs/portal/base', pt: 'A base sozinha referencia um config map que ela não cria: cada overlay gera o seu.', en: 'The base alone references a config map it does not create: each overlay generates its own.' },
    { cmd: `cat > ~/labs/portal/overlays/stage/kustomization.yaml <<EOF\n${STAGE}EOF`, pt: 'Overlay de homologação: muda o namespace e gera o config map. Réplicas e imagem ficam as da base.', en: 'Staging overlay: changes the namespace and generates the config map. Replicas and image stay as in the base.' },
    { cmd: `cat > ~/labs/portal/overlays/prod/kustomization.yaml <<EOF\n${PROD}EOF`, pt: 'Overlay de produção: réplicas, tag, config map e um JSON patch para o limite de memória.', en: 'Production overlay: replicas, tag, config map, and a JSON patch for the memory limit.' },
    { cmd: 'oc kustomize ~/labs/portal/overlays/prod', pt: 'Confere o resultado de produção antes de aplicar.', en: 'Checks the production result before applying.' },
    { cmd: 'oc apply -k ~/labs/portal/overlays/stage', pt: 'Aplica homologação.', en: 'Applies staging.' },
    { cmd: 'oc apply -k ~/labs/portal/overlays/prod', pt: 'Aplica produção.', en: 'Applies production.' },
    { cmd: 'oc rollout status deployment/portal -n portal-stage && oc rollout status deployment/portal -n portal-prod', pt: 'Aguarda os dois ambientes.', en: 'Waits for both environments.' },
  ],
};
