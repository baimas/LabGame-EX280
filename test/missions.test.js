// Para cada missão: o ambiente recém-preparado deve reprovar, e a solução
// documentada, executada no shell simulado, deve aprovar 100%.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../web/missions/index.js';
import { startMission, grade } from '../web/engine/game.js';

for (const missao of MISSIONS) {
  test(`missão ${missao.id}`, async () => {
    for (const idioma of ['pt', 'en']) {
      assert.ok(missao.title[idioma] && missao.story[idioma] && missao.tasks[idioma].length, `textos em ${idioma}`);
      for (const h of missao.hints) assert.ok(h[idioma], `dica em ${idioma}`);
      for (const c of missao.checks) assert.ok(c.text[idioma], `check em ${idioma}`);
      for (const s of missao.solution) assert.ok(s[idioma], `solução em ${idioma}`);
    }

    const w = await startMission(missao);
    const antes = await grade(missao, w);
    assert.ok(antes.some((r) => !r.ok), 'o ambiente inicial não pode já estar aprovado');

    for (const passo of missao.solution) {
      const r = await w.sh(passo.cmd);
      assert.ok(!/\[simulador\]|erro interno/.test(r.out), `"${passo.cmd}" → ${r.out}`);
      // Passos marcados com `falha` demonstram um erro de propósito.
      if (passo.falha) assert.notEqual(r.code, 0, `"${passo.cmd}" deveria falhar`);
      else assert.equal(r.code, 0, `"${passo.cmd}" saiu com ${r.code}: ${r.out}`);
    }
    w.cluster.tick(10);
    const depois = await grade(missao, w);
    assert.deepEqual(depois.filter((r) => !r.ok).map((r) => r.text.pt), [], 'a solução deve aprovar todos os itens');
  });
}
