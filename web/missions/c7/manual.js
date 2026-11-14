import { csvDe, subDe, instalado } from './comum.js';

const NS = 'openshift-compliance';
const PKG = 'compliance-operator';
const CSV = 'compliance-operator.v1.6.0';

export default {
  id: 'c7-manual',
  minutes: 20,
  xp: 240,
  difficulty: 3,
  objectives: ['Instalar operators', 'Atualizar operators'],
  title: { pt: 'Versão homologada', en: 'Certified version' },
  story: {
    pt: 'O Compliance Operator foi homologado pela auditoria na versão 1.6.0, e só ela. Qualquer atualização precisa passar por uma janela de mudança, então o cluster não pode atualizar o operator por conta própria.',
    en: 'The Compliance Operator was certified by the auditors at version 1.6.0, and only that one. Any update must go through a change window, so the cluster may not update the operator on its own.',
  },
  tasks: {
    pt: [
      'Instale o `compliance-operator` do catálogo `redhat-operators`, canal `stable`, no projeto `openshift-compliance`, vigiando só o próprio projeto.',
      'A versão instalada deve ser a `1.6.0` (CSV `compliance-operator.v1.6.0`, fase `Succeeded`).',
      'Atualizações só com aprovação manual: a versão nova pode ficar esperando aprovação, mas não pode ser instalada.',
    ],
    en: [
      'Install `compliance-operator` from the `redhat-operators` catalog, `stable` channel, in the `openshift-compliance` project, watching only its own project.',
      'The installed version must be `1.6.0` (CSV `compliance-operator.v1.6.0`, `Succeeded` phase).',
      'Updates only with manual approval: the new version may wait for approval, but must not be installed.',
    ],
  },
  hints: [
    { pt: 'Na subscription, `startingCSV` escolhe a versão inicial e `installPlanApproval: Manual` segura as atualizações.', en: 'In the subscription, `startingCSV` picks the initial version and `installPlanApproval: Manual` holds the updates.' },
    { pt: 'Com aprovação manual, até a primeira instalação espera: aprove o install plan com `oc patch installplan NOME --type merge -p \'{"spec":{"approved":true}}\'`.', en: 'With manual approval, even the first installation waits: approve the install plan with `oc patch installplan NAME --type merge -p \'{"spec":{"approved":true}}\'`.' },
    { pt: 'Logo depois de instalar, o OLM cria outro install plan para a 1.6.1. Esse não deve ser aprovado. Confira na coluna CSV de `oc get installplan` qual é qual.', en: 'Right after installing, OLM creates another install plan for 1.6.1. That one must not be approved. Check the CSV column of `oc get installplan` to tell them apart.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'A subscription exige aprovação manual', en: 'The subscription requires manual approval' },
      test: (w) => {
        const s = subDe(w, PKG, NS);
        return Boolean(s) && s.spec.installPlanApproval === 'Manual' && s.spec.channel === 'stable';
      },
    },
    {
      text: { pt: 'O CSV 1.6.0 está Succeeded e o operator roda', en: 'The 1.6.0 CSV is Succeeded and the operator runs' },
      test: (w) => instalado(w, CSV, NS) && w.ready('compliance-operator', NS),
    },
    {
      text: { pt: 'Nenhuma versão mais nova foi instalada', en: 'No newer version was installed' },
      test: (w) => csvDe(w, PKG, NS).length === 1 && Boolean(w.get('ClusterServiceVersion', CSV, NS)) && !w.list('InstallPlan', NS).some((ip) => ip.spec.approved && !ip.spec.clusterServiceVersionNames.includes(CSV)),
    },
  ],
  solution: [
    { cmd: 'oc create namespace openshift-compliance', pt: 'O projeto do operator.', en: 'The operator project.' },
    { cmd: `cat > co.yaml <<EOF
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: compliance-operator
  namespace: openshift-compliance
spec:
  targetNamespaces:
    - openshift-compliance
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: compliance-operator
  namespace: openshift-compliance
spec:
  channel: stable
  name: compliance-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Manual
  startingCSV: ${CSV}
EOF`, pt: 'Versão inicial fixa e aprovação manual.', en: 'Fixed initial version and manual approval.' },
    { cmd: 'oc apply -f co.yaml', pt: 'Cria o operator group e a subscription.', en: 'Creates the operator group and the subscription.' },
    { cmd: 'oc get installplan -n openshift-compliance', pt: 'Um install plan para a 1.6.0, com `APPROVED` em `false`.', en: 'An install plan for 1.6.0, with `APPROVED` set to `false`.' },
    { cmd: "oc patch installplan $(oc get installplan -n openshift-compliance -o jsonpath='{.items[0].metadata.name}') -n openshift-compliance --type merge -p '{\"spec\":{\"approved\":true}}'", pt: 'Aprova só a instalação inicial.', en: 'Approves only the initial installation.' },
    { cmd: 'sleep 20', pt: 'Espera o operator subir.', en: 'Waits for the operator to start.' },
    { cmd: 'oc get installplan,csv -n openshift-compliance', pt: 'CSV 1.6.0 em `Succeeded`; o plano da 1.6.1 fica esperando.', en: '1.6.0 CSV in `Succeeded`; the 1.6.1 plan stays waiting.' },
  ],
};
