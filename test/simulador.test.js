// Comportamentos do simulador que não dependem de uma missão específica.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, deployment, service } from '../web/engine/world.js';

async function mundo() {
  const w = createWorld();
  w.cluster.create({ kind: 'Namespace', metadata: { name: 'loja' } });
  w.cluster.create(deployment('web', 'loja', 'nimbus/portal:1.1', { replicas: 2 }));
  w.cluster.create(service('web', 'loja'));
  w.cluster.create({ kind: 'Namespace', metadata: { name: 'outro' } });
  w.cluster.create(deployment('cliente', 'outro', 'nimbus/portal:1.0'));
  w.cluster.tick(10);
  w.env.session.namespace = 'loja';
  return w;
}

const sem = (r) => assert.ok(!/\[simulador\]/.test(r.out), r.out);

test('erros de uso respondem como o oc real', async () => {
  const w = await mundo();
  let r = await w.sh('oc create service deploy/web');
  assert.equal(r.code, 1);
  assert.match(r.out, /unknown command "deploy\/web"/);
  r = await w.sh('oc expose service deploy/web --port 8080');
  assert.match(r.out, /no need to specify a resource type as a separate argument/);
  r = await w.sh('oc get pod pod/x');
  assert.match(r.out, /no need to specify a resource type/);
  r = await w.sh('oc nada');
  assert.match(r.out, /unknown command "nada" for "oc"/);
});

test('ajuda e explain', async () => {
  const w = await mundo();
  for (const cmd of ['oc -h', 'oc create route edge -h', 'oc set volume --help', 'oc rsh -h', 'oc create service']) {
    const r = await w.sh(cmd);
    sem(r);
    assert.match(r.out, /Usage:/, cmd);
  }
  const r = await w.sh('oc explain networkpolicy.spec.ingress.from');
  assert.match(r.out, /namespaceSelector\t<Object>/);
});

test('oc rsh abre um shell no pod e exit volta para a estação', async () => {
  const w = await mundo();
  await w.sh('oc rsh deployment/web');
  assert.match(w.shell.prompt(), /^sh-5\.1\$ $/);
  let r = await w.sh('hostname');
  assert.match(r.out, /^web-/);
  r = await w.sh('curl -s web:8080');
  assert.match(r.out, /Nimbus Portal/);
  r = await w.sh('oc get pods');
  assert.equal(r.code, 127);
  await w.sh('exit');
  assert.match(w.shell.prompt(), /student@workstation/);
});

test('a sessão no pod cai quando o pod é removido', async () => {
  const w = await mundo();
  const pod = w.pods('loja', { app: 'web' })[0].metadata.name;
  await w.sh(`oc rsh ${pod}`);
  w.cluster.delete('Pod', pod, 'loja');
  const r = await w.sh('ls');
  assert.equal(r.code, 137);
  assert.match(w.shell.prompt(), /student@workstation/);
});

test('oc exec repassa o código de saída', async () => {
  const w = await mundo();
  const r = await w.sh("oc exec deploy/web -- sh -c 'echo oi; exit 3'");
  assert.equal(r.code, 3);
  assert.equal(r.out, 'oi\ncommand terminated with exit code 3\n');
});

test('curl e network policies', async () => {
  const w = await mundo();
  await w.sh('oc expose service web --hostname web.apps.ocp4.example.com');
  let r = await w.sh('curl -s -o /dev/null -w "%{http_code}" http://web.apps.ocp4.example.com');
  assert.equal(r.out, '200');
  r = await w.sh('oc exec -n outro deploy/cliente -- curl -s web.loja:8080');
  assert.match(r.out, /Nimbus Portal/);
  w.cluster.create({ kind: 'NetworkPolicy', metadata: { name: 'fecha', namespace: 'loja' }, spec: { podSelector: {}, ingress: [{ from: [{ podSelector: {} }] }] } });
  r = await w.sh('oc exec -n outro deploy/cliente -- curl -s -m 2 web.loja:8080');
  assert.equal(r.code, 28);
  r = await w.sh('curl -s -o /dev/null -w "%{http_code}" http://web.apps.ocp4.example.com');
  assert.equal(r.out, '503');
  w.cluster.create({ kind: 'NetworkPolicy', metadata: { name: 'roteador', namespace: 'loja' }, spec: { podSelector: {}, ingress: [{ from: [{ namespaceSelector: { matchLabels: { 'policy-group.network.openshift.io/ingress': '' } } }] }] } });
  r = await w.sh('curl -s -o /dev/null -w "%{http_code}" http://web.apps.ocp4.example.com');
  assert.equal(r.out, '200');
});

test('routes TLS', async () => {
  const w = await mundo();
  await w.sh('oc create route edge seguro --service web --hostname seguro.apps.ocp4.example.com');
  let r = await w.sh('curl -s https://seguro.apps.ocp4.example.com');
  assert.match(r.out, /Nimbus Portal/);
  r = await w.sh('curl -s -o /dev/null -w "%{http_code}" http://seguro.apps.ocp4.example.com');
  assert.equal(r.out, '503');
  await w.sh('oc patch route seguro -p \'{"spec":{"tls":{"insecureEdgeTerminationPolicy":"Redirect"}}}\'');
  r = await w.sh('curl -s -o /dev/null -w "%{http_code}" http://seguro.apps.ocp4.example.com');
  assert.equal(r.out, '302');
});

test('rollout pause e resume', async () => {
  const w = await mundo();
  await w.sh('oc rollout pause deploy/web');
  await w.sh('oc set image deploy/web web=registry.ocp4.example.com:8443/nimbus/portal:2.0');
  w.cluster.tick(10);
  assert.equal(w.list('ReplicaSet', 'loja').filter((r) => r.metadata.name.startsWith('web-')).length, 1);
  await w.sh('oc rollout resume deploy/web');
  w.cluster.tick(10);
  assert.ok(w.pods('loja', { app: 'web' }).every((p) => p.spec.containers[0].image.endsWith(':2.0')));
});

test('oc login pergunta usuário e senha', async () => {
  const w = await mundo();
  const respostas = ['developer', 'developer'];
  w.env.ask = async () => respostas.shift();
  const r = await w.sh('oc login https://api.ocp4.example.com:6443');
  assert.match(r.out, /Login successful/);
  assert.equal(w.env.session.user, 'developer');
});
