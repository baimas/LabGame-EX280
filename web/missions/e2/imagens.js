import { findImage } from '../../sim/images.js';

const NS = 'images-lab';
const REPO = 'registry.lab.example.com:8443/nimbus/catalog';
const digest = () => findImage(`${REPO}:1.1`).digest;

export default {
  id: 'e2-imagens',
  minutes: 20,
  xp: 180,
  difficulty: 2,
  objectives: ['Encontrar e inspecionar imagens de contêiner', 'Implantar aplicações a partir de uma imagem e de um template'],
  title: { pt: 'A imagem certa, sempre', en: 'The right image, every time' },
  startNamespace: NS,
  story: {
    pt: 'Na última auditoria, o catálogo de produtos rodava uma imagem diferente em cada ambiente porque todo mundo usava a tag `latest`. A partir de agora, a imagem é escolhida pelo digest e documentada antes de ir para o cluster.',
    en: 'In the last audit, the product catalog ran a different image in each environment because everyone used the `latest` tag. From now on, the image is chosen by digest and documented before it goes to the cluster.',
  },
  tasks: {
    pt: [
      `Inspecione a imagem \`${REPO}:1.1\` no registro, sem baixá-la. O diretório \`~/images\` já existe.`,
      'Grave em `~/images/catalog-digest.txt` o digest da tag 1.1 (no formato `sha256:...`).',
      'Grave em `~/images/catalog-user.txt` o usuário com que a imagem roda e em `~/images/catalog-port.txt` a porta que ela expõe (só o número).',
      'No projeto `images-lab`, crie o deployment `catalog` usando a imagem pelo digest (`REPO@sha256:...`), com o pod pronto.',
    ],
    en: [
      `Inspect the \`${REPO}:1.1\` image in the registry, without pulling it. The \`~/images\` directory already exists.`,
      'Write to `~/images/catalog-digest.txt` the digest of tag 1.1 (as `sha256:...`).',
      'Write to `~/images/catalog-user.txt` the user the image runs as, and to `~/images/catalog-port.txt` the port it exposes (number only).',
      'In the `images-lab` project, create the `catalog` deployment using the image by digest (`REPO@sha256:...`), with its pod ready.',
    ],
  },
  hints: [
    { pt: '`skopeo inspect docker://IMAGEM` mostra o digest e as tags; `oc image info IMAGEM` mostra também o usuário e as portas.', en: '`skopeo inspect docker://IMAGE` shows the digest and tags; `oc image info IMAGE` also shows the user and ports.' },
    { pt: '`skopeo inspect --format \'{{.Digest}}\'` imprime só o digest.', en: '`skopeo inspect --format \'{{.Digest}}\'` prints only the digest.' },
    { pt: 'A aplicação demora uns 25 segundos para subir; `oc get pods -w` ou `oc rollout status` ajudam a esperar.', en: 'The application takes about 25 seconds to start; `oc get pods -w` or `oc rollout status` help you wait.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.fs.mkdir('/home/student/images', true);
  },
  checks: [
    { text: { pt: 'catalog-digest.txt tem o digest da 1.1', en: 'catalog-digest.txt has the 1.1 digest' }, test: (w) => w.file('images/catalog-digest.txt') === digest() },
    { text: { pt: 'catalog-user.txt e catalog-port.txt estão certos', en: 'catalog-user.txt and catalog-port.txt are correct' }, test: (w) => w.file('images/catalog-user.txt') === '1001' && w.file('images/catalog-port.txt') === '8080' },
    {
      text: { pt: 'O deployment catalog usa a imagem pelo digest e está pronto', en: 'The catalog deployment uses the image by digest and is ready' },
      test: (w) => w.get('Deployment', 'catalog', NS)?.spec.template.spec.containers[0].image === `${REPO}@${digest()}` && w.ready('catalog', NS),
    },
  ],
  solution: [
    { cmd: 'oc project images-lab', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `skopeo inspect docker://${REPO}:1.1`, pt: 'Digest, tags e labels.', en: 'Digest, tags, and labels.' },
    { cmd: `skopeo inspect --format '{{.Digest}}' docker://${REPO}:1.1 > ~/images/catalog-digest.txt`, pt: 'Grava o digest.', en: 'Writes the digest.' },
    { cmd: `oc image info ${REPO}:1.1`, pt: 'Usuário `1001`, porta `8080/tcp`.', en: 'User `1001`, port `8080/tcp`.' },
    { cmd: 'echo 1001 > ~/images/catalog-user.txt; echo 8080 > ~/images/catalog-port.txt', pt: 'Grava usuário e porta.', en: 'Writes user and port.' },
    { cmd: `oc create deployment catalog --image ${REPO}@$(cat ~/images/catalog-digest.txt)`, pt: 'Deployment preso ao digest.', en: 'Deployment pinned to the digest.' },
    { cmd: 'oc rollout status deployment/catalog', pt: 'Espera a aplicação subir.', en: 'Waits for the application to start.' },
  ],
};
