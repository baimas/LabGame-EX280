// Robustez das missões além do caminho feliz: inglês, salvar e retomar a cada
// passo, saídas sem lixo de formatação, correção sem efeito colateral e
// comandos citados nas dicas existindo no simulador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../web/missions/index.js';
import { startMission, grade } from '../web/engine/game.js';
import { createWorld } from '../web/engine/world.js';

const LIXO = /\bundefined\b|\bNaN\b|\[object Object\]|erro interno|internal error:|TypeError|ReferenceError/;
const falhas = (r) => r.filter((x) => !x.ok).map((x) => x.text.pt);

// Recria o mundo a partir do estado salvo, como o navegador faz ao recarregar.
function recarrega(w) {
  const salvo = JSON.parse(JSON.stringify(w.serialize()));
  const novo = createWorld({ lang: w.env.lang, salvo });
  novo.shell.history.push(...w.shell.history);
  return novo;
}

for (const missao of MISSIONS) {
  test(`${missao.id}: em inglês, recarregando a cada passo`, async () => {
    let w = await startMission(missao, { lang: 'en' });
    const inicial = falhas(await grade(missao, w));
    assert.ok(inicial.length, 'o ambiente inicial não pode já estar aprovado');
    // Corrigir não pode mudar o estado: duas correções seguidas dão o mesmo resultado.
    assert.deepEqual(falhas(await grade(missao, w)), inicial, 'correção sem efeito colateral');

    w = recarrega(w);
    assert.deepEqual(falhas(await grade(missao, w)), inicial, 'o estado inicial sobrevive ao recarregamento');

    for (const passo of missao.solution) {
      const r = await w.sh(passo.cmd);
      assert.ok(!LIXO.test(r.out), `"${passo.cmd}" → saída suspeita:\n${r.out}`);
      assert.ok(!/\[simulator\]|\[simulador\]/.test(r.out), `"${passo.cmd}" → ${r.out}`);
      if (passo.falha) assert.notEqual(r.code, 0, `"${passo.cmd}" deveria falhar`);
      else assert.equal(r.code, 0, `"${passo.cmd}" saiu com ${r.code}: ${r.out}`);
      w = recarrega(w);
    }
    w.cluster.tick(10);
    assert.deepEqual(falhas(await grade(missao, w)), [], 'a solução deve aprovar depois de recarregar a cada passo');
    assert.deepEqual(falhas(await grade(missao, recarrega(w))), [], 'a aprovação sobrevive ao recarregamento');
  });
}

// Subcomandos do oc citados em dicas, enunciados e soluções: todos simulados e com ajuda.
test('comandos citados nas missões existem no simulador', async () => {
  const w = createWorld();
  const citados = new Set();
  for (const m of MISSIONS) {
    const textos = [...m.tasks.pt, ...m.tasks.en, ...m.hints.flatMap((h) => [h.pt, h.en]), ...m.solution.map((s) => s.cmd)];
    for (const t of textos) {
      for (const [, sub, sub2] of t.matchAll(/(?:^|[`\s(;|&])oc\s+(?:-n\s+\S+\s+)?([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/g)) {
        const composto = ['adm', 'auth', 'create', 'rollout', 'set', 'policy'].includes(sub) && sub2 ? `${sub} ${sub2}` : sub;
        citados.add(composto);
      }
    }
  }
  const problemas = [];
  for (const c of [...citados].sort()) {
    const r = await w.sh(`oc ${c} --help`);
    if (r.code !== 0 || /\[simulador\]/.test(r.out)) problemas.push(`oc ${c} --help → ${r.out.split('\n')[0]}`);
  }
  assert.deepEqual(problemas, []);
});
