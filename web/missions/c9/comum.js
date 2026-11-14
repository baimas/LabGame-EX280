// Utilidades das missões de atualização.
import { versaoAtual, imagemDa, kubeDa } from '../../sim/updates.js';

// Põe o cluster numa versão já instalada, como se a atualização tivesse acontecido antes.
export function emVersao(w, v) {
  const c = w.cluster;
  const cv = c.get('ClusterVersion', 'version');
  cv.status.history.unshift({ state: 'Completed', version: v, image: imagemDa(v), startedTime: c.iso(c.now - 86400), completionTime: c.iso(c.now - 80000), verified: true });
  cv.status.desired = { version: v, image: imagemDa(v) };
  for (const co of c.list('ClusterOperator')) co.status.versions = [{ name: 'operator', version: v }];
  for (const n of c.list('Node')) n.status.nodeInfo.kubeletVersion = kubeDa(v);
  c.tick(1);
}

// A atualização para `v` terminou: versão concluída e todos os operators nela.
export function atualizado(w, v) {
  return versaoAtual(w.cluster) === v && w.list('ClusterOperator').every((co) => co.status.versions?.[0]?.version === v) && !(w.get('ClusterVersion', 'version').status.conditions || []).some((x) => x.type === 'Progressing' && x.status === 'True');
}
