// Varredura do oc: todo tipo de recurso em todas as saídas, describe e
// explain, e a ajuda de todo subcomando, sem erro interno nem lixo de formatação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../web/missions/index.js';
import { startMission } from '../web/engine/game.js';
import { KINDS } from '../web/sim/resources.js';
import { SUBS } from '../web/sim/oc/index.js';

const LIXO = /\bundefined\b|\bNaN\b|\[object Object\]|erro interno|internal error:|TypeError|ReferenceError|Cannot read/;

// Um cluster que passou por todas as missões resolvidas: tem de tudo um pouco.
async function clusterCheio() {
  const w = await startMission(MISSIONS[0]);
  for (const m of MISSIONS) {
    if (m.setup) {
      try {
        await m.setup(w);
      } catch {
        // setups que criam o mesmo objeto global de outra missão: ignorados aqui
      }
    }
  }
  w.cluster.tick(120);
  return w;
}

test('get, describe e explain de todos os tipos', async () => {
  const w = await clusterCheio();
  const problemas = [];
  for (const k of KINDS) {
    for (const cmd of [`oc get ${k.plural} -A`, `oc get ${k.plural} -A -o wide`, `oc get ${k.plural} -A -o yaml`, `oc get ${k.plural} -A -o json`, `oc get ${k.plural} -A -o name`, `oc describe ${k.plural} -A`, `oc explain ${k.plural}`]) {
      if (k.kind === 'Event' && cmd.startsWith('oc describe')) continue;
      let r;
      try {
        r = await w.sh(cmd);
      } catch (e) {
        problemas.push(`${cmd} → exceção ${e.message}`);
        continue;
      }
      if (LIXO.test(r.out)) problemas.push(`${cmd} → ${r.out.split('\n').find((l) => LIXO.test(l))}`);
      if (/-o json$/.test(cmd) && r.code === 0) {
        try {
          JSON.parse(r.out);
        } catch {
          problemas.push(`${cmd} → JSON inválido`);
        }
      }
    }
  }
  assert.deepEqual(problemas, []);
});

test('ajuda de todos os subcomandos do oc', async () => {
  const w = await startMission(MISSIONS[0]);
  const problemas = [];
  for (const sub of Object.keys(SUBS)) {
    const r = await w.sh(`oc ${sub} --help`);
    if (r.code !== 0 || /\[simulador\]/.test(r.out) || LIXO.test(r.out)) problemas.push(`oc ${sub} --help → ${r.out.split('\n')[0]}`);
  }
  assert.deepEqual(problemas, []);
});
