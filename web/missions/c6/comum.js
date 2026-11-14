// Utilidades das missões de autosserviço.
import { valor } from '../../sim/quota.js';
import { Cluster } from '../../sim/cluster.js';

// Os limites batem com o esperado, aceitando grafias equivalentes (1 = 1000m).
export function mesmos(hard, esperado) {
  if (!hard) return false;
  const chaves = Object.keys(esperado);
  if (Object.keys(hard).length !== chaves.length) return false;
  return chaves.every((r) => hard[r] !== undefined && valor(r, hard[r]) === valor(r, esperado[r]));
}

// Recursos de um contêiner batem com o esperado.
export function recursos(ct, esperado) {
  return ['requests', 'limits'].every((t) => mesmos(ct?.resources?.[t] || {}, esperado[t] || {}));
}

// Cópia descartável do cluster, para a correção simular algo sem mexer no jogo.
export const copia = (w) => Cluster.restore(JSON.parse(JSON.stringify(w.cluster.serialize())));
