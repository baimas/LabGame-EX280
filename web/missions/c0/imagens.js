import { deployment, REGISTRY } from '../../engine/world.js';
import { findImage } from '../../sim/images.js';

const NS = 'portal-prod';
const REPO = `${REGISTRY}/nimbus/portal`;
const digest = () => findImage(`${REPO}:1.1`).digest;

export default {
  id: 'c0-imagens',
  minutes: 15,
  xp: 140,
  difficulty: 2,
  objectives: ['Localizar e examinar imagens de contêiner', 'Identificar imagens por tags e digests', 'Atualizar implantações de aplicações'],
  title: { pt: 'Tag não é contrato', en: 'A tag is not a contract' },
  startNamespace: 'default',
  story: {
    pt: 'Na semana passada alguém republicou a tag `latest` do Portal e a produção mudou de versão sozinha. O time de Segurança agora exige que a produção referencie imagens por digest, que não muda.',
    en: 'Last week someone republished the Portal `latest` tag and production changed versions by itself. The Security team now requires production to reference images by digest, which never changes.',
  },
  tasks: {
    pt: [
      `Descubra o digest (\`sha256:...\`) da imagem \`${REPO}:1.1\` e grave-o em \`~/audit/portal-digest.txt\`.`,
      'No projeto `portal-prod`, altere o deployment `portal` para usar essa imagem referenciada pelo digest, no formato `repositório@sha256:...`.',
      'As 3 réplicas devem ficar prontas com a nova referência.',
    ],
    en: [
      `Find the digest (\`sha256:...\`) of the \`${REPO}:1.1\` image and write it to \`~/audit/portal-digest.txt\`.`,
      'In the `portal-prod` project, change the `portal` deployment to use that image referenced by digest, in the `repository@sha256:...` form.',
      'All 3 replicas must become ready with the new reference.',
    ],
  },
  hints: [
    { pt: '`oc image info IMAGEM` e `skopeo inspect docker://IMAGEM` mostram o digest.', en: '`oc image info IMAGE` and `skopeo inspect docker://IMAGE` show the digest.' },
    { pt: 'Na referência por digest a tag some: `repositório@sha256:...`.', en: 'In a digest reference the tag goes away: `repository@sha256:...`.' },
    { pt: '`oc set image deployment/portal portal=NOVA_IMAGEM` troca a imagem do contêiner `portal`.', en: '`oc set image deployment/portal portal=NEW_IMAGE` replaces the image of the `portal` container.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('portal', NS, 'nimbus/portal:latest', { replicas: 3 }));
    w.fs.mkdir('/home/student/audit', true);
  },
  checks: [
    {
      text: { pt: 'portal-digest.txt contém o digest da versão 1.1', en: 'portal-digest.txt holds the digest of version 1.1' },
      test: (w) => w.file('audit/portal-digest.txt') === digest(),
    },
    {
      text: { pt: 'O deployment portal referencia a imagem pelo digest da versão 1.1', en: 'The portal deployment references the image by the digest of version 1.1' },
      test: (w) => w.get('Deployment', 'portal', NS).spec.template.spec.containers[0].image === `${REPO}@${digest()}`,
    },
    {
      text: { pt: 'As 3 réplicas estão prontas', en: 'All 3 replicas are ready' },
      test: (w) => w.get('Deployment', 'portal', NS).spec.replicas === 3 && w.ready('portal', NS),
    },
  ],
  solution: [
    { cmd: `oc image info ${REPO}:1.1`, pt: 'Mostra os metadados da imagem, incluindo o digest.', en: 'Shows the image metadata, including the digest.' },
    { cmd: `oc image info ${REPO}:1.1 | grep Digest | awk '{print $2}' > ~/audit/portal-digest.txt`, pt: 'Isola o digest e grava no arquivo da auditoria.', en: 'Isolates the digest and writes it to the audit file.' },
    { cmd: `oc set image deployment/portal -n portal-prod portal=${REPO}@$(cat ~/audit/portal-digest.txt)`, pt: 'Troca a referência por tag pela referência por digest.', en: 'Replaces the tag reference with the digest reference.' },
    { cmd: 'oc rollout status deployment/portal -n portal-prod', pt: 'Aguarda as réplicas novas ficarem prontas.', en: 'Waits for the new replicas to become ready.' },
  ],
};
