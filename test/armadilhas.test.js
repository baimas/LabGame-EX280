// Atalhos errados que parecem resolver: a correção precisa reprová-los.
import test from 'node:test';
import assert from 'node:assert/strict';
import { byId } from '../web/missions/index.js';
import { startMission, grade } from '../web/engine/game.js';

async function tenta(id, comandos, segundos = 60) {
  const m = byId(id);
  const w = await startMission(m);
  for (const c of comandos) await w.sh(c);
  w.cluster.tick(segundos);
  return (await grade(m, w)).filter((r) => !r.ok).map((r) => r.text.pt);
}

const ARMADILHAS = [
  ['c8-scc-diagnostico', 'dar anyuid à conta default em vez de corrigir o pod', ['oc project metrics', 'oc adm policy add-scc-to-user anyuid -z default', 'oc rollout restart deployment collector']],
  ['c8-anyuid', 'dar anyuid à conta default', ['oc project legacy-files', 'oc adm policy add-scc-to-user anyuid -z default', 'oc rollout restart deployment ftp-legacy']],
  ['c8-privilegiado', 'tirar o privileged do contêiner', ['oc project node-tools', 'oc patch deployment node-agent --type json -p \'[{"op":"remove","path":"/spec/template/spec/containers/0/securityContext/privileged"}]\'']],
  ['c8-api', 'dar view no cluster todo', ['oc project observability', 'oc create sa pod-watcher', 'oc adm policy add-cluster-role-to-user view -z pod-watcher', 'oc set sa deployment/pod-watcher pod-watcher']],
  ['c7-remover', 'apagar só a subscription', ['oc delete sub cluster-logging -n openshift-logging']],
  ['c6-self-provisioner', 'apagar o binding em vez de anotar autoupdate', ['oc adm policy remove-cluster-role-from-group self-provisioner system:authenticated:oauth', 'oc adm groups new project-leads ana', 'oc adm policy add-cluster-role-to-group self-provisioner project-leads', 'oc patch projects.config.openshift.io cluster --type merge -p \'{"spec":{"projectRequestMessage":"Projetos novos são pedidos pelo portal da Plataforma Nimbus."}}\'']],
  ['c6-template-projeto', 'criar o projeto antes do apiserver reiniciar', ['oc adm create-bootstrap-project-template -o yaml > t.yaml', 'oc create -f t.yaml -n openshift-config', 'oc patch projects.config.openshift.io cluster --type merge -p \'{"spec":{"projectRequestTemplate":{"name":"project-request"}}}\'', 'oc login -u developer -p developer', 'oc new-project dev-sandbox', 'oc login -u admin -p redhatocp'], 0],
  ['c2-rollback', 'voltar só uma revisão (para a que também quebra)', ['oc rollout undo deployment/checkout -n store-api']],
  ['c2-rollback', 'apagar e recriar o deployment', ['oc project store-api', 'oc get deploy checkout -o yaml > d.yaml', 'oc delete deploy checkout', "sed -i 's/billing-api:latest/billing-api:1.1/' d.yaml", "grep -v resourceVersion d.yaml > d2.yaml", 'oc apply -f d2.yaml']],
  ['c1-exportar', 'importar sem limpar os campos do cluster', ['oc get cm wiki-config -n wiki-legacy -o yaml > ~/wiki/cm.yaml', 'oc apply -f ~/wiki/cm.yaml -n wiki-legacy']],
  ['c9-minor', 'pedir a 4.19 sem o admin-ack', ['oc adm upgrade channel stable-4.19', 'oc adm upgrade --to 4.19.5'], 400],
  ['c7-manual', 'aprovar todos os install plans', ['oc create namespace openshift-compliance', `printf 'apiVersion: operators.coreos.com/v1\\nkind: OperatorGroup\\nmetadata:\\n  name: co\\n  namespace: openshift-compliance\\nspec:\\n  targetNamespaces:\\n  - openshift-compliance\\n' > og.yaml`, 'oc apply -f og.yaml', `printf 'apiVersion: operators.coreos.com/v1alpha1\\nkind: Subscription\\nmetadata:\\n  name: compliance-operator\\n  namespace: openshift-compliance\\nspec:\\n  channel: stable\\n  name: compliance-operator\\n  source: redhat-operators\\n  sourceNamespace: openshift-marketplace\\n  installPlanApproval: Automatic\\n  startingCSV: compliance-operator.v1.6.0\\n' > sub.yaml`, 'oc apply -f sub.yaml']],
  ['c6-quota', 'só escalar, sem definir recursos', ['oc project marketing', 'oc create quota marketing-quota --hard pods=6,requests.cpu=1500m,requests.memory=2Gi,limits.cpu=3,limits.memory=4Gi', 'oc scale deployment campaign --replicas 4']],
];

for (const [id, descricao, comandos, segundos] of ARMADILHAS) {
  test(`${id}: ${descricao} reprova`, async () => {
    const f = await tenta(id, comandos, segundos ?? 60);
    assert.ok(f.length > 0, 'a correção aprovou um atalho errado');
  });
}
