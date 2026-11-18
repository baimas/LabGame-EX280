import { findImage } from '../../sim/images.js';
import { imagemDaTag } from '../../sim/imagestreams.js';

const NS = 'catalog-prod';
const R = 'registry.lab.example.com:8443/nimbus/catalog';
const dig = (t) => findImage(`${R}:${t}`).digest;

export default {
  id: 'e6-imagestream',
  minutes: 25,
  xp: 230,
  difficulty: 3,
  objectives: ['Usar image streams e gatilhos de imagem', 'Implantar aplicações a partir de uma imagem e de um template'],
  title: { pt: 'Implantações reproduzíveis', en: 'Reproducible deployments' },
  startNamespace: NS,
  story: {
    pt: 'Produção precisa de uma tag que só muda quando alguém decide. A ideia é ter um image stream no projeto, com a tag `prod` presa a um digest, e um deployment que use o nome curto `catalog:prod`.',
    en: 'Production needs a tag that only changes when someone decides to. The idea is an image stream in the project, with the `prod` tag pinned to a digest, and a deployment that uses the short name `catalog:prod`.',
  },
  tasks: {
    pt: [
      `No projeto \`catalog-prod\`, crie o image stream \`catalog\` com as tags \`1.0\` e \`1.1\` importadas de \`${R}\`.`,
      'Crie a tag `prod` apontando para a imagem da tag `1.0` do próprio stream (presa ao digest).',
      'Habilite a resolução local de nomes (`lookupPolicy.local`) no image stream.',
      'Crie o deployment `catalog` com a imagem `catalog:prod`. O pod deve rodar a imagem da 1.0 e ficar pronto.',
    ],
    en: [
      `In the \`catalog-prod\` project, create the \`catalog\` image stream with tags \`1.0\` and \`1.1\` imported from \`${R}\`.`,
      'Create the `prod` tag pointing to the image of the stream\'s own `1.0` tag (pinned to the digest).',
      'Enable local name resolution (`lookupPolicy.local`) on the image stream.',
      'Create the `catalog` deployment with the `catalog:prod` image. The pod must run the 1.0 image and become ready.',
    ],
  },
  hints: [
    { pt: '`oc import-image catalog:1.0 --from REGISTRO/nimbus/catalog:1.0 --confirm` cria o stream e importa a tag.', en: '`oc import-image catalog:1.0 --from REGISTRY/nimbus/catalog:1.0 --confirm` creates the stream and imports the tag.' },
    { pt: '`oc tag catalog:1.0 catalog:prod` copia o digest atual (não segue a 1.0 depois).', en: '`oc tag catalog:1.0 catalog:prod` copies the current digest (it does not follow 1.0 afterwards).' },
    { pt: '`oc set image-lookup catalog` permite usar `catalog:prod` como imagem num deployment do projeto.', en: '`oc set image-lookup catalog` allows `catalog:prod` as an image in a deployment of the project.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
  },
  checks: [
    {
      text: { pt: 'O stream catalog tem 1.0 e 1.1 do registro', en: 'The catalog stream has 1.0 and 1.1 from the registry' },
      test: (w) => imagemDaTag(w.cluster, NS, 'catalog', '1.0')?.digest === dig('1.0') && imagemDaTag(w.cluster, NS, 'catalog', '1.1')?.digest === dig('1.1'),
    },
    {
      text: { pt: 'prod aponta para o digest da 1.0, preso', en: 'prod points to the 1.0 digest, pinned' },
      test: (w) => {
        const t = w.get('ImageStream', 'catalog', NS)?.spec.tags?.find((x) => x.name === 'prod');
        return imagemDaTag(w.cluster, NS, 'catalog', 'prod')?.digest === dig('1.0') && t?.from?.kind !== 'DockerImage' && !(t?.from?.kind === 'ImageStreamTag');
      },
    },
    { text: { pt: 'lookupPolicy.local habilitado', en: 'lookupPolicy.local enabled' }, test: (w) => w.get('ImageStream', 'catalog', NS)?.spec.lookupPolicy?.local === true },
    {
      text: { pt: 'catalog usa catalog:prod e o pod roda a 1.0', en: 'catalog uses catalog:prod and the pod runs 1.0' },
      test: (w) => w.get('Deployment', 'catalog', NS)?.spec.template.spec.containers[0].image === 'catalog:prod' && w.ready('catalog', NS) && w.pods(NS, { app: 'catalog' }).every((p) => p.spec.containers[0].image.endsWith(dig('1.0'))),
    },
  ],
  solution: [
    { cmd: 'oc project catalog-prod', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc import-image catalog:1.0 --from ${R}:1.0 --confirm`, pt: 'Cria o stream com a 1.0.', en: 'Creates the stream with 1.0.' },
    { cmd: `oc import-image catalog:1.1 --from ${R}:1.1 --confirm`, pt: 'Importa a 1.1.', en: 'Imports 1.1.' },
    { cmd: 'oc tag catalog:1.0 catalog:prod', pt: '`prod` preso ao digest da 1.0.', en: '`prod` pinned to the 1.0 digest.' },
    { cmd: 'oc set image-lookup catalog', pt: 'Nomes curtos resolvidos no projeto.', en: 'Short names resolved in the project.' },
    { cmd: 'oc create deployment catalog --image catalog:prod', pt: 'Deployment com o nome curto.', en: 'Deployment with the short name.' },
    { cmd: 'oc rollout status deployment/catalog', pt: 'O pod usa o digest da 1.0.', en: 'The pod uses the 1.0 digest.' },
    { cmd: "oc get pods -o jsonpath='{.items[0].spec.containers[0].image}'", pt: '`...catalog@sha256:...`.', en: '`...catalog@sha256:...`.' },
  ],
};
