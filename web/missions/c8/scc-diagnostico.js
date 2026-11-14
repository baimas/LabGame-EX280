import { deployment } from '../../engine/world.js';

const NS = 'metrics';
const ehSa = (s) => s.kind === 'ServiceAccount' || String(s.name).startsWith('system:serviceaccount');

export default {
  id: 'c8-scc-diagnostico',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Gerenciar e aplicar permissões com security context constraints', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'Ninguém aqui precisa de root', en: 'Nobody here needs root' },
  story: {
    pt: 'O deployment do coletor de métricas não cria pod nenhum desde ontem. O desenvolvedor copiou um trecho de YAML de um blog e jura que “só mexeu na segurança para ficar mais seguro”. A Segurança avisa: nada de SCC extra para resolver isso.',
    en: 'The metrics collector deployment has not created a single pod since yesterday. The developer copied a YAML snippet from a blog and swears he “only touched security to make it safer”. Security warns: no extra SCC to fix this.',
  },
  tasks: {
    pt: [
      'No projeto `metrics`, o deployment `collector` deve voltar a rodar com 2 réplicas prontas.',
      'Os pods devem ser admitidos pela SCC `restricted-v2`.',
      'Não conceda SCC nenhuma a service accounts.',
    ],
    en: [
      'In the `metrics` project, the `collector` deployment must run again with 2 ready replicas.',
      'The pods must be admitted by the `restricted-v2` SCC.',
      'Do not grant any SCC to service accounts.',
    ],
  },
  hints: [
    { pt: 'Deployment sem pods: procure `FailedCreate` em `oc get events` ou em `oc describe rs`.', en: 'Deployment without pods: look for `FailedCreate` in `oc get events` or in `oc describe rs`.' },
    { pt: 'A mensagem lista, SCC por SCC, por que nenhuma aceitou o pod. A `restricted-v2` recusou um `runAsUser` fora da faixa do projeto.', en: 'The message lists, SCC by SCC, why none accepted the pod. `restricted-v2` refused a `runAsUser` outside the project range.' },
    { pt: 'A aplicação não precisa de UID fixo. Remover o campo com `oc patch --type json` (operação `remove`) basta.', en: 'The application does not need a fixed UID. Removing the field with `oc patch --type json` (`remove` operation) is enough.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('collector', NS, 'nimbus/reports:4.1', { replicas: 2, extra: { container: { securityContext: { runAsUser: 0, allowPrivilegeEscalation: false } } } }));
  },
  checks: [
    {
      text: { pt: 'collector roda com 2 réplicas prontas', en: 'collector runs with 2 ready replicas' },
      test: (w) => w.ready('collector', NS) && w.get('Deployment', 'collector', NS).spec.replicas === 2,
    },
    {
      text: { pt: 'Os pods foram admitidos pela restricted-v2', en: 'The pods were admitted by restricted-v2' },
      test: (w) => w.pods(NS, { app: 'collector' }).every((p) => p.metadata.annotations?.['openshift.io/scc'] === 'restricted-v2'),
    },
    {
      text: { pt: 'Nenhuma SCC foi concedida a service accounts', en: 'No SCC was granted to service accounts' },
      test: (w) => !w.list('ClusterRoleBinding').some((b) => b.roleRef.name.startsWith('system:openshift:scc:') && b.roleRef.name !== 'system:openshift:scc:restricted-v2' && (b.subjects || []).some(ehSa)) && !w.list('RoleBinding', NS).some((b) => b.roleRef.name.startsWith('system:openshift:scc:')),
    },
  ],
  solution: [
    { cmd: 'oc project metrics', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get deployment collector', pt: '0/2 e nenhum pod.', en: '0/2 and no pods.' },
    { cmd: 'oc get events | grep FailedCreate | tail -1', pt: 'A `restricted-v2` recusa `runAsUser: 0`.', en: '`restricted-v2` refuses `runAsUser: 0`.' },
    { cmd: "oc get deployment collector -o jsonpath='{.spec.template.spec.containers[0].securityContext}'", pt: 'O UID fixo veio do YAML copiado.', en: 'The fixed UID came from the copied YAML.' },
    { cmd: 'oc patch deployment collector --type json -p \'[{"op":"remove","path":"/spec/template/spec/containers/0/securityContext/runAsUser"}]\'', pt: 'Tira o UID fixo e mantém o resto.', en: 'Removes the fixed UID and keeps the rest.' },
    { cmd: 'sleep 15; oc get pods', pt: 'Os dois pods rodando.', en: 'Both pods running.' },
    { cmd: 'oc get pod -l app=collector -o yaml | grep openshift.io/scc', pt: 'Admitidos pela `restricted-v2`.', en: 'Admitted by `restricted-v2`.' },
  ],
};
