import { deployment } from '../../engine/world.js';

const NS = 'portal';
const R = 'registry.lab.example.com:8443/nimbus/portal';

export default {
  id: 'e6-atualizar',
  minutes: 20,
  xp: 200,
  difficulty: 2,
  objectives: ['Atualizar a imagem e a configuração de aplicações'],
  title: { pt: 'Atualização com volta', en: 'Update with a way back' },
  startNamespace: NS,
  story: {
    pt: 'O portal da Nimbus vai passar da versão 1.0 para a 2.0 e ganhar o tema escuro. A 1.1 foi publicada por engano com um bug grave e não pode ir para produção. O diretor quer ver o histórico de revisões, para saber como voltar se der problema.',
    en: 'The Nimbus portal is moving from version 1.0 to 2.0 and getting the dark theme. Version 1.1 was published by mistake with a serious bug and must not reach production. The director wants to see the revision history, to know how to roll back if something goes wrong.',
  },
  tasks: {
    pt: [
      `No projeto \`portal\`, atualize o deployment \`portal\` para a imagem \`${R}:2.0\`.`,
      'Defina a variável de ambiente `THEME=dark` no contêiner.',
      'O rollout deve terminar com todas as réplicas prontas, e o histórico de revisões (`oc rollout history`) deve ter pelo menos 3 revisões.',
    ],
    en: [
      `In the \`portal\` project, update the \`portal\` deployment to the \`${R}:2.0\` image.`,
      'Set the `THEME=dark` environment variable on the container.',
      'The rollout must finish with all replicas ready, and the revision history (`oc rollout history`) must have at least 3 revisions.',
    ],
  },
  hints: [
    { pt: '`oc set image deployment/portal portal=IMAGEM` troca a imagem e cria uma revisão nova.', en: '`oc set image deployment/portal portal=IMAGE` changes the image and creates a new revision.' },
    { pt: '`oc set env deployment/portal THEME=dark` também gera uma revisão.', en: '`oc set env deployment/portal THEME=dark` also creates a revision.' },
    { pt: '`oc rollout history deployment/portal` lista as revisões; `oc rollout undo` volta para a anterior.', en: '`oc rollout history deployment/portal` lists the revisions; `oc rollout undo` goes back to the previous one.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('portal', NS, 'nimbus/portal:1.0', { replicas: 2, container: 'portal' }));
  },
  checks: [
    {
      text: { pt: 'portal roda a 2.0 com THEME=dark', en: 'portal runs 2.0 with THEME=dark' },
      test: (w) => {
        const ct = w.get('Deployment', 'portal', NS).spec.template.spec.containers[0];
        return ct.image === `${R}:2.0` && (ct.env || []).some((e) => e.name === 'THEME' && e.value === 'dark') && w.ready('portal', NS);
      },
    },
    {
      text: { pt: 'O histórico tem pelo menos 3 revisões', en: 'The history has at least 3 revisions' },
      test: (w) => w.list('ReplicaSet', NS).filter((r) => r.metadata.name.startsWith('portal-')).length >= 3,
    },
  ],
  solution: [
    { cmd: 'oc project portal', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc set image deployment/portal portal=${R}:2.0`, pt: 'Revisão 2: imagem nova.', en: 'Revision 2: new image.' },
    { cmd: 'oc rollout status deployment/portal', pt: 'Rollout concluído.', en: 'Rollout done.' },
    { cmd: 'oc set env deployment/portal THEME=dark', pt: 'Revisão 3: tema escuro.', en: 'Revision 3: dark theme.' },
    { cmd: 'oc rollout status deployment/portal && oc rollout history deployment/portal', pt: 'Três revisões no histórico.', en: 'Three revisions in the history.' },
  ],
};
