import { csvDe, subDe, instalado } from './comum.js';
import { modoDoGrupo } from '../../sim/olm.js';

const NS = 'openshift-file-integrity';
const PKG = 'file-integrity-operator';

export default {
  id: 'c7-instalar',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Instalar operators', 'Usar a CLI para gerenciar o cluster'],
  title: { pt: 'Um vigia para os arquivos', en: 'A watchman for the files' },
  story: {
    pt: 'A auditoria quer saber se alguém mexe nos arquivos dos nós. O time de Segurança escolheu o File Integrity Operator, do catálogo da Red Hat, e o console web está fora do ar: a instalação vai ser pela linha de comando.',
    en: 'The auditors want to know whether anyone changes files on the nodes. The Security team picked the File Integrity Operator, from the Red Hat catalog, and the web console is down: the installation goes through the command line.',
  },
  tasks: {
    pt: [
      'Instale o operator `file-integrity-operator` do catálogo `redhat-operators`, no canal `stable`, com atualização automática.',
      'Use o projeto `openshift-file-integrity` (crie se precisar). O operator deve vigiar só o próprio projeto.',
      'O CSV deve chegar à fase `Succeeded`, na versão mais nova do canal.',
    ],
    en: [
      'Install the `file-integrity-operator` operator from the `redhat-operators` catalog, on the `stable` channel, with automatic updates.',
      'Use the `openshift-file-integrity` project (create it if needed). The operator must watch only its own project.',
      'The CSV must reach the `Succeeded` phase, at the newest version of the channel.',
    ],
  },
  hints: [
    { pt: '`oc get packagemanifests` lista o catálogo; `oc describe packagemanifest NOME` mostra os canais, as versões e os modos de instalação.', en: '`oc get packagemanifests` lists the catalog; `oc describe packagemanifest NAME` shows channels, versions, and install modes.' },
    { pt: 'Pela CLI são três objetos: o projeto, um `OperatorGroup` (com `targetNamespaces` igual ao próprio projeto) e uma `Subscription`.', en: 'Through the CLI there are three objects: the project, an `OperatorGroup` (with `targetNamespaces` set to its own project), and a `Subscription`.' },
    { pt: 'Acompanhe com `oc get sub,installplan,csv -n openshift-file-integrity`. Com aprovação automática, o OLM instala e já atualiza até a última versão.', en: 'Follow with `oc get sub,installplan,csv -n openshift-file-integrity`. With automatic approval, OLM installs and updates up to the latest version.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'O operator group vigia só o projeto do operator', en: 'The operator group watches only the operator project' },
      test: (w) => {
        const ogs = w.list('OperatorGroup', NS);
        return ogs.length === 1 && modoDoGrupo(ogs[0], NS) === 'OwnNamespace';
      },
    },
    {
      text: { pt: 'A subscription usa o canal stable do redhat-operators, com aprovação automática', en: 'The subscription uses the redhat-operators stable channel, with automatic approval' },
      test: (w) => {
        const s = subDe(w, PKG, NS);
        return Boolean(s) && s.spec.channel === 'stable' && s.spec.source === 'redhat-operators' && (s.spec.installPlanApproval || 'Automatic') === 'Automatic';
      },
    },
    {
      text: { pt: 'O CSV da versão 1.3.6 está Succeeded e o operator roda', en: 'The 1.3.6 CSV is Succeeded and the operator runs' },
      test: (w) => instalado(w, 'file-integrity-operator.v1.3.6', NS) && csvDe(w, PKG, NS).length === 1 && w.ready('file-integrity-operator', NS),
    },
  ],
  solution: [
    { cmd: 'oc get packagemanifests', pt: 'O catálogo disponível.', en: 'The available catalog.' },
    { cmd: 'oc describe packagemanifest file-integrity-operator | grep -A3 -i "name: stable\\|suggested\\|OwnNamespace"', pt: 'Canal `stable`, projeto sugerido e modo OwnNamespace suportado.', en: 'The `stable` channel, the suggested project, and the supported OwnNamespace mode.' },
    { cmd: 'oc create namespace openshift-file-integrity', pt: 'O projeto do operator.', en: 'The operator project.' },
    { cmd: `cat > fio.yaml <<EOF
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: file-integrity-operator
  namespace: openshift-file-integrity
spec:
  targetNamespaces:
    - openshift-file-integrity
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: file-integrity-operator
  namespace: openshift-file-integrity
spec:
  channel: stable
  name: file-integrity-operator
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
EOF`, pt: 'Operator group e subscription.', en: 'Operator group and subscription.' },
    { cmd: 'oc apply -f fio.yaml', pt: 'O OLM resolve o pacote e cria o install plan.', en: 'OLM resolves the package and creates the install plan.' },
    { cmd: 'sleep 30', pt: 'Espera a instalação e a atualização automática.', en: 'Waits for the installation and the automatic update.' },
    { cmd: 'oc get sub,installplan,csv -n openshift-file-integrity', pt: 'Dois install plans (1.3.5 e 1.3.6) e o CSV 1.3.6 em `Succeeded`.', en: 'Two install plans (1.3.5 and 1.3.6) and the 1.3.6 CSV in `Succeeded`.' },
    { cmd: 'oc get deployment -n openshift-file-integrity', pt: 'O deployment do operator, criado pelo CSV.', en: 'The operator deployment, created by the CSV.' },
  ],
};
