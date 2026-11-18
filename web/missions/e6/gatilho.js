import { findImage } from '../../sim/images.js';
import { imagemDaTag, gatilhos } from '../../sim/imagestreams.js';

const NS = 'store';
const R = 'registry.lab.example.com:8443/nimbus/portal';
const dig = (t) => findImage(`${R}:${t}`).digest;

export default {
  id: 'e6-gatilho',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Usar image streams e gatilhos de imagem', 'Atualizar a imagem e a configuração de aplicações'],
  title: { pt: 'Promoção sem rollout manual', en: 'Promotion without a manual rollout' },
  startNamespace: NS,
  story: {
    pt: 'A loja promove versões movendo a tag `prod` do image stream `storefront`. Mas, toda vez que a tag muda, alguém precisa lembrar de atualizar o deployment, e ninguém lembra. O deployment deve seguir a tag sozinho.',
    en: 'The store promotes versions by moving the `prod` tag of the `storefront` image stream. But every time the tag changes, someone has to remember to update the deployment, and nobody does. The deployment should follow the tag on its own.',
  },
  tasks: {
    pt: [
      'No projeto `store`, o deployment `storefront` (contêiner `portal`) roda a imagem da tag `storefront:prod`, hoje na versão 1.0.',
      'Configure um gatilho de imagem para o contêiner `portal` do deployment acompanhar a tag `storefront:prod`.',
      `Promova a versão 1.1: faça a tag \`storefront:prod\` apontar para \`${R}:1.1\`.`,
      'Sem mexer no deployment depois disso, ele deve rodar a imagem da 1.1, com o pod pronto.',
    ],
    en: [
      'In the `store` project, the `storefront` deployment (`portal` container) runs the image of the `storefront:prod` tag, currently version 1.0.',
      'Configure an image trigger so that the deployment `portal` container follows the `storefront:prod` tag.',
      `Promote version 1.1: make the \`storefront:prod\` tag point to \`${R}:1.1\`.`,
      'Without touching the deployment afterwards, it must run the 1.1 image, with the pod ready.',
    ],
  },
  hints: [
    { pt: '`oc set triggers deployment/storefront --from-image storefront:prod -c portal` grava a anotação `image.openshift.io/triggers`.', en: '`oc set triggers deployment/storefront --from-image storefront:prod -c portal` writes the `image.openshift.io/triggers` annotation.' },
    { pt: '`oc tag REGISTRO/nimbus/portal:1.1 storefront:prod` move a tag; `oc describe is storefront` mostra o histórico.', en: '`oc tag REGISTRY/nimbus/portal:1.1 storefront:prod` moves the tag; `oc describe is storefront` shows the history.' },
    { pt: '`oc rollout history deployment/storefront` mostra a revisão criada pelo gatilho.', en: '`oc rollout history deployment/storefront` shows the revision created by the trigger.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create({ kind: 'ImageStream', metadata: { name: 'storefront', namespace: NS }, spec: { lookupPolicy: { local: true }, tags: [{ name: 'prod', from: { kind: 'DockerImage', name: `${R}:1.0` }, importPolicy: { importMode: 'Legacy' }, referencePolicy: { type: 'Source' } }] } });
    c.tick(1);
    c.create({ kind: 'Deployment', metadata: { name: 'storefront', namespace: NS, labels: { app: 'storefront' } }, spec: { replicas: 1, selector: { matchLabels: { app: 'storefront' } }, template: { metadata: { labels: { app: 'storefront' } }, spec: { containers: [{ name: 'portal', image: imagemDaTag(c, NS, 'storefront', 'prod').ref, ports: [{ containerPort: 8080 }] }] } } } });
  },
  checks: [
    {
      text: { pt: 'O deployment tem gatilho para storefront:prod no contêiner portal', en: 'The deployment has a storefront:prod trigger on the portal container' },
      test: (w) => gatilhos(w.get('Deployment', 'storefront', NS)).some((g) => g.from?.name === 'storefront:prod' && g.fieldPath.includes('"portal"') && g.paused !== 'true'),
    },
    { text: { pt: 'storefront:prod aponta para a 1.1', en: 'storefront:prod points to 1.1' }, test: (w) => imagemDaTag(w.cluster, NS, 'storefront', 'prod')?.digest === dig('1.1') },
    {
      text: { pt: 'O deployment roda a 1.1 e está pronto', en: 'The deployment runs 1.1 and is ready' },
      test: (w) => w.get('Deployment', 'storefront', NS).spec.template.spec.containers[0].image.endsWith(dig('1.1')) && w.ready('storefront', NS),
    },
  ],
  solution: [
    { cmd: 'oc project store', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc describe is storefront', pt: '`prod` aponta para a 1.0.', en: '`prod` points to 1.0.' },
    { cmd: 'oc set triggers deployment/storefront --from-image storefront:prod -c portal', pt: 'O deployment passa a seguir a tag.', en: 'The deployment now follows the tag.' },
    { cmd: `oc tag ${R}:1.1 storefront:prod`, pt: 'Promove a 1.1.', en: 'Promotes 1.1.' },
    { cmd: 'oc rollout status deployment/storefront', pt: 'O gatilho disparou o rollout.', en: 'The trigger fired the rollout.' },
    { cmd: "oc get deploy storefront -o jsonpath='{.spec.template.spec.containers[0].image}'", pt: 'Digest da 1.1.', en: 'The 1.1 digest.' },
  ],
};
