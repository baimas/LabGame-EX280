import { instalaPacote } from '../../sim/olm.js';

const NS = 'openshift-logging';
const NOVO = 'cluster-logging.v6.2.2';

export default {
  id: 'c9-operador',
  minutes: 20,
  xp: 240,
  difficulty: 3,
  objectives: ['Atualizar operators', 'Instalar operators'],
  title: { pt: 'Um canal à frente', en: 'One channel ahead' },
  story: {
    pt: 'O operator de Logging está no canal `stable-6.1`, com aprovação manual por exigência da auditoria. O fornecedor encerrou o suporte à 6.1, e a Plataforma pediu a migração para a 6.2.',
    en: 'The Logging operator is on the `stable-6.1` channel, with manual approval as required by the auditors. The vendor ended support for 6.1, and the Platform team asked for the move to 6.2.',
  },
  tasks: {
    pt: [
      'No projeto `openshift-logging`, mude a subscription `cluster-logging` para o canal `stable-6.2`.',
      `Aprove a atualização: o CSV \`${NOVO}\` deve chegar a \`Succeeded\` e o da 6.1 deve sumir.`,
      'A aprovação manual deve continuar valendo.',
    ],
    en: [
      'In the `openshift-logging` project, move the `cluster-logging` subscription to the `stable-6.2` channel.',
      `Approve the update: the \`${NOVO}\` CSV must reach \`Succeeded\` and the 6.1 one must go away.`,
      'Manual approval must remain in effect.',
    ],
  },
  hints: [
    { pt: 'O canal fica em `spec.channel` da subscription: `oc patch sub cluster-logging --type merge -p ...`.', en: 'The channel is in the subscription `spec.channel`: `oc patch sub cluster-logging --type merge -p ...`.' },
    { pt: 'Com aprovação manual, a troca de canal só cria um install plan esperando aprovação. Veja em `oc get installplan`.', en: 'With manual approval, the channel change only creates an install plan waiting for approval. Check `oc get installplan`.' },
    { pt: 'Aprove com `oc patch installplan NOME --type merge -p \'{"spec":{"approved":true}}\'`.', en: 'Approve with `oc patch installplan NAME --type merge -p \'{"spec":{"approved":true}}\'`.' },
  ],
  setup(w) {
    const c = w.cluster;
    instalaPacote(c, 'cluster-logging', NS, { canal: 'stable-6.1' });
    const s = c.get('Subscription', 'cluster-logging', NS);
    c.update({ ...JSON.parse(JSON.stringify(s)), spec: { ...s.spec, installPlanApproval: 'Manual' } });
    c.tick(5);
  },
  checks: [
    {
      text: { pt: 'A subscription está no stable-6.2 com aprovação manual', en: 'The subscription is on stable-6.2 with manual approval' },
      test: (w) => {
        const s = w.get('Subscription', 'cluster-logging', NS);
        return s?.spec.channel === 'stable-6.2' && s.spec.installPlanApproval === 'Manual';
      },
    },
    {
      text: { pt: `${NOVO} está Succeeded e a 6.1 saiu`, en: `${NOVO} is Succeeded and 6.1 is gone` },
      test: (w) => w.get('ClusterServiceVersion', NOVO, NS)?.status?.phase === 'Succeeded' && !w.get('ClusterServiceVersion', 'cluster-logging.v6.1.4', NS) && w.ready('cluster-logging-operator', NS),
    },
  ],
  solution: [
    { cmd: 'oc project openshift-logging', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get sub,csv', pt: 'Canal `stable-6.1`, CSV 6.1.4.', en: '`stable-6.1` channel, 6.1.4 CSV.' },
    { cmd: 'oc describe packagemanifest cluster-logging | grep -i "name: stable\\|currentCSV:"', pt: 'O canal `stable-6.2` tem a 6.2.2.', en: 'The `stable-6.2` channel has 6.2.2.' },
    { cmd: 'oc patch sub cluster-logging --type merge -p \'{"spec":{"channel":"stable-6.2"}}\'', pt: 'Troca o canal.', en: 'Switches the channel.' },
    { cmd: 'oc get installplan', pt: 'Um plano para a 6.2.2, com `APPROVED` em `false`.', en: 'A plan for 6.2.2, with `APPROVED` set to `false`.' },
    { cmd: "oc patch installplan $(oc get installplan -o jsonpath='{.items[?(@.spec.approved==false)].metadata.name}') --type merge -p '{\"spec\":{\"approved\":true}}'", pt: 'Aprova o plano pendente.', en: 'Approves the pending plan.' },
    { cmd: 'sleep 20; oc get csv', pt: 'Só a 6.2.2, em `Succeeded`.', en: 'Only 6.2.2, in `Succeeded`.' },
  ],
};
