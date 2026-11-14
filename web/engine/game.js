// Ciclo de uma missão: preparar (lab start), corrigir (lab grade) e pontuar.
import { createWorld } from './world.js';

export const HINT_COST = 0.15; // fração do XP perdida por dica revelada

export async function startMission(missao, opcoes = {}) {
  const w = createWorld(opcoes);
  if (missao.setup) await missao.setup(w);
  // Deixa o ambiente assentar: pods quebrados já aparecem quebrados.
  w.cluster.tick(45);
  w.env.session.namespace = missao.startNamespace || 'default';
  return w;
}

export async function grade(missao, w) {
  const resultado = [];
  for (const check of missao.checks) {
    let passou = false;
    try {
      passou = Boolean(await check.test(w));
    } catch {
      passou = false;
    }
    resultado.push({ text: check.text, ok: passou });
  }
  return resultado;
}

export function score(missao, resultado, dicasUsadas = 0) {
  const acertos = resultado.filter((r) => r.ok).length;
  const fracao = acertos / resultado.length;
  const xp = Math.round(missao.xp * fracao * Math.max(0, 1 - dicasUsadas * HINT_COST));
  return { acertos, total: resultado.length, passou: acertos === resultado.length, xp };
}

const NIVEIS = [
  [0, 'Estagiário de plataforma', 'Platform intern'],
  [300, 'Analista de plataforma', 'Platform analyst'],
  [900, 'Administrador OpenShift', 'OpenShift administrator'],
  [1800, 'Engenheiro de confiabilidade', 'Reliability engineer'],
  [3000, 'Arquiteto de plataforma', 'Platform architect'],
];

export function level(xp) {
  let i = 0;
  while (i + 1 < NIVEIS.length && xp >= NIVEIS[i + 1][0]) i++;
  return { n: i + 1, pt: NIVEIS[i][1], en: NIVEIS[i][2], atual: NIVEIS[i][0], proximo: NIVEIS[i + 1]?.[0] ?? null };
}
