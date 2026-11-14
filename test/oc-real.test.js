// Comportamento do `oc` conferido no cliente oficial 4.22.22: Tab, mensagens de
// erro de opções, ajuda e versão. Os valores esperados vieram do binário real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatos } from '../web/sim/oc/completar.js';
import { OC_REAL } from '../web/sim/oc/oc-real.js';
import { createWorld } from '../web/engine/world.js';

const ctx = { namespaces: () => ['default', 'portal-dev'], nomes: () => ['web'], arquivos: () => ['a.yaml', 'b.txt', 'pasta/'], diretorios: () => ['pasta/'] };
const tab = (linha) => {
  const p = linha.split(' ');
  const atual = p.at(-1);
  return [...new Set(candidatos(p.slice(1, -1), atual, ctx))].filter((c) => c.startsWith(atual)).sort();
};

test('Tab igual ao oc 4.22', () => {
  assert.deepEqual(tab('oc new-project portal-dev --d'), ['--description', '--disable-compression', '--display-name']);
  assert.deepEqual(tab('oc create route '), ['edge', 'passthrough', 'reencrypt']);
  assert.deepEqual(tab('oc create route edge --'), ['--service']);
  assert.ok(tab('oc create route edge --service x --').includes('--hostname'));
  assert.deepEqual(tab('oc create deployment web --'), ['--image']);
  assert.deepEqual(tab('oc get pods -o j'), ['json', 'jsonpath', 'jsonpath-as-json', 'jsonpath-file']);
  assert.deepEqual(tab('oc get pods --output=y'), ['--output=yaml']);
  assert.deepEqual(tab('oc -n '), ['default', 'portal-dev']);
  assert.deepEqual(tab('oc apply -f '), ['a.yaml', 'pasta/']);
  assert.deepEqual(tab('oc set vol'), ['volumes']);
  assert.deepEqual(tab('oc adm upgrade '), ['channel', 'recommend', 'status']);
  assert.deepEqual(tab('oc logs d'), ['daemonsets/', 'deployments/']);
  assert.equal(tab('oc ').length, OC_REAL.comandos[''].subs.length);
});

test('erros de opção e de comando iguais aos do oc 4.22', async () => {
  const w = createWorld();
  const casos = [
    ['oc --version', "error: unknown flag: --version\nSee 'oc --help' for usage.\n"],
    ['oc get -x', "error: unknown shorthand flag: 'x' in -x\nSee 'oc get --help' for usage.\n"],
    ['oc get pods -Ax', "error: unknown shorthand flag: 'x' in -x\nSee 'oc get --help' for usage.\n"],
    ['oc get pods -n', "error: flag needs an argument: 'n' in -n\nSee 'oc get --help' for usage.\n"],
    ['oc new-project x --display-name', "error: flag needs an argument: --display-name\nSee 'oc new-project --help' for usage.\n"],
    ['oc create route edge --nada', "error: unknown flag: --nada\nSee 'oc create route edge --help' for usage.\n"],
    ['oc nada', 'error: unknown command "nada" for "oc"\n\nDid you mean this?\n\tadm\n'],
    ['oc xyzzy', 'error: unknown command "xyzzy" for "oc"\n'],
  ];
  for (const [cmd, esperado] of casos) {
    const r = await w.sh(cmd);
    assert.equal(r.code, 1, cmd);
    assert.equal(r.out, esperado, cmd);
  }
});

test('ajuda, opções e versão iguais às do oc 4.22', async () => {
  const w = createWorld();
  assert.equal((await w.sh('oc new-project --help')).out, OC_REAL.comandos['new-project'].ajuda);
  assert.equal((await w.sh('oc create cronjob -h')).out, OC_REAL.comandos['create cronjob'].ajuda);
  assert.equal((await w.sh('oc help adm upgrade')).out, OC_REAL.comandos['adm upgrade'].ajuda);
  assert.equal((await w.sh('oc set volume --help')).out, OC_REAL.comandos['set volumes'].ajuda);
  assert.equal((await w.sh('oc --help')).out, OC_REAL.raiz);
  assert.equal((await w.sh('oc options')).out, OC_REAL.options);
  assert.match((await w.sh('oc version')).out, /^Client Version: 4\.22\.22\nKustomize Version: v5\.7\.1\nServer Version: 4\.22\.4\nKubernetes Version: v1\.35\.5\n$/);
});
