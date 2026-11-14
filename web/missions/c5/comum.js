// Preparação compartilhada pelas missões de services fora do HTTP.
import { destinoTcp } from '../../sim/net.js';
import { enderecosDoPool } from '../../sim/controllers.js';

const NS = 'metallb-system';

export function pool(w, nome, faixa, extra = {}) {
  w.cluster.create({ kind: 'IPAddressPool', metadata: { name: nome, namespace: NS }, spec: { addresses: [faixa], ...extra } });
}

export function anuncio(w, nome, pools) {
  w.cluster.create({ kind: 'L2Advertisement', metadata: { name: nome, namespace: NS }, spec: pools ? { ipAddressPools: pools } : {} });
}

export const ipDe = (w, svc, ns) => w.get('Service', svc, ns)?.status?.loadBalancer?.ingress?.[0]?.ip;
export const noPool = (w, ip, nome) => Boolean(ip) && enderecosDoPool(w.get('IPAddressPool', nome, NS)).includes(ip);

// Conexão TCP feita da estação de trabalho.
export const deFora = (w, host, porta) => destinoTcp(w.cluster, null, host, porta);
