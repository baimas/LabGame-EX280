import { deployment } from '../../engine/world.js';

const NS = 'store-api';
const CAUSA = 'kubernetes.io/change-cause';
const imagem = (w) => w.get('Deployment', 'checkout', NS)?.spec.template.spec.containers[0].image || '';

export default {
  id: 'c2-rollback',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Gerenciar implantações de aplicações', 'Atualizar implantações de aplicações', 'Visualizar logs'],
  title: { pt: 'Volta uma casa', en: 'One step back' },
  story: {
    pt: 'O deploy das 18h do checkout derrubou a loja: pods em CrashLoopBackOff e clientes sem conseguir pagar. Não dá tempo de investigar a fundo; a ordem é voltar para a última versão que funcionava, sem recriar nada.',
    en: 'The 6 PM checkout deploy took the store down: pods in CrashLoopBackOff and customers unable to pay. There is no time to dig deep; the order is to go back to the last version that worked, without recreating anything.',
  },
  tasks: {
    pt: [
      'No projeto `store-api`, o deployment `checkout` está quebrado. Volte para a última revisão que funcionava, usando o histórico de rollout.',
      'Grave em `~/store/revisao.txt` só o número da revisão para a qual você voltou.',
      `Registre o motivo no histórico: a anotação \`${CAUSA}\` do deployment deve ser \`rollback do deploy das 18h\`.`,
      'O deployment não pode ser apagado nem recriado.',
    ],
    en: [
      'In the `store-api` project, the `checkout` deployment is broken. Go back to the last revision that worked, using the rollout history.',
      'Write to `~/store/revisao.txt` only the number of the revision you went back to.',
      `Record the reason in the history: the deployment \`${CAUSA}\` annotation must be \`rollback do deploy das 18h\`.`,
      'The deployment may not be deleted or recreated.',
    ],
  },
  hints: [
    { pt: '`oc rollout history deployment/checkout` lista as revisões com o CHANGE-CAUSE; `--revision=N` mostra a imagem e as variáveis de cada uma.', en: '`oc rollout history deployment/checkout` lists revisions with their CHANGE-CAUSE; `--revision=N` shows the image and variables of each one.' },
    { pt: 'Os logs mostram por que a revisão atual cai. A anterior pode ter o mesmo problema.', en: 'The logs show why the current revision crashes. The previous one may have the same problem.' },
    { pt: '`oc rollout undo deployment/checkout --to-revision=N` volta para uma revisão específica.', en: '`oc rollout undo deployment/checkout --to-revision=N` goes back to a specific revision.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    const d = deployment('checkout', NS, 'nimbus/billing-api:1.0', { env: { DB_HOST: 'db.store-api.svc' } });
    d.metadata.annotations = { [CAUSA]: 'primeira versão' };
    c.create(d);
    c.tick(20);
    const muda = (fn, causa) => {
      const x = JSON.parse(JSON.stringify(c.get('Deployment', 'checkout', NS)));
      fn(x.spec.template.spec.containers[0]);
      x.metadata.annotations[CAUSA] = causa;
      c.update(x);
      c.tick(20);
    };
    muda((ct) => (ct.image = ct.image.replace('1.0', '1.1')), 'versão 1.1');
    muda((ct) => (ct.env = []), 'remove variáveis antigas');
    muda((ct) => (ct.image = ct.image.replace('1.1', 'latest')), 'deploy das 18h');
    w.fs.mkdir('/home/student/store', true);
    c.tick(20);
    c.side.missao = { uid: c.get('Deployment', 'checkout', NS).metadata.uid };
  },
  checks: [
    {
      text: { pt: 'checkout voltou para a revisão 2 (1.1 com DB_HOST) e está pronto', en: 'checkout went back to revision 2 (1.1 with DB_HOST) and is ready' },
      test: (w) => {
        const d = w.get('Deployment', 'checkout', NS);
        const ct = d?.spec.template.spec.containers[0];
        return w.ready('checkout', NS) && imagem(w).endsWith(':1.1') && (ct.env || []).some((e) => e.name === 'DB_HOST');
      },
    },
    {
      text: { pt: 'O deployment é o mesmo e a volta virou uma revisão nova', en: 'The deployment is the same one and the rollback became a new revision' },
      test: (w) => {
        const d = w.get('Deployment', 'checkout', NS);
        return d?.metadata.uid === w.cluster.side.missao.uid && Number(d.metadata.annotations['deployment.kubernetes.io/revision']) >= 5;
      },
    },
    {
      text: { pt: 'revisao.txt tem o número 2', en: 'revisao.txt holds the number 2' },
      test: (w) => w.file('store/revisao.txt') === '2',
    },
    {
      text: { pt: 'O motivo está no histórico', en: 'The reason is in the history' },
      test: (w) => w.get('Deployment', 'checkout', NS)?.metadata.annotations?.[CAUSA] === 'rollback do deploy das 18h',
    },
  ],
  solution: [
    { cmd: 'oc project store-api', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc logs deployment/checkout', pt: 'Falta `DB_HOST`.', en: '`DB_HOST` is missing.' },
    { cmd: 'oc rollout history deployment/checkout', pt: 'Quatro revisões; a 3 tirou as variáveis.', en: 'Four revisions; revision 3 removed the variables.' },
    { cmd: 'oc rollout history deployment/checkout --revision=2', pt: 'A 2 tem a imagem 1.1 e o `DB_HOST`.', en: 'Revision 2 has image 1.1 and `DB_HOST`.' },
    { cmd: 'oc rollout undo deployment/checkout --to-revision=2', pt: 'Volta para a 2.', en: 'Goes back to revision 2.' },
    { cmd: 'echo 2 > ~/store/revisao.txt', pt: 'Grava a revisão.', en: 'Writes the revision down.' },
    { cmd: 'oc annotate deployment/checkout kubernetes.io/change-cause="rollback do deploy das 18h" --overwrite', pt: 'Registra o motivo.', en: 'Records the reason.' },
    { cmd: 'sleep 15; oc rollout history deployment/checkout', pt: 'A revisão 2 virou a 5, com o motivo.', en: 'Revision 2 became 5, with the reason.' },
  ],
};
