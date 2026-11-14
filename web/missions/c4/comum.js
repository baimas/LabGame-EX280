// Preparação compartilhada pelas missões de segurança de rede.
import { TRAINING_CA, emite, novaChave, umaChave, umCert } from '../../sim/tls.js';
import { b64 } from '../../sim/util.js';

export const CERTS = '/home/student/certs';

// Coloca a CA de treinamento (certificado e chave) em ~/certs.
export function caDeTreinamento(w) {
  w.fs.put(`${CERTS}/training-CA.pem`, TRAINING_CA.pem);
  w.fs.put(`${CERTS}/training-CA.key`, TRAINING_CA.chavePem);
}

// Gera chave e certificado para `host`, assinados pela CA de treinamento.
export function certificadoPara(w, host, base) {
  const chave = novaChave(2048, true);
  const cert = emite({ subject: { C: 'BR', O: 'Nimbus Tecnologia', CN: host }, san: [`DNS:${host}`], chaveId: umaChave(chave).id, assinante: TRAINING_CA, dias: 365, agora: w.cluster.now });
  w.fs.put(`${CERTS}/${base}.key`, chave);
  w.fs.put(`${CERTS}/${base}.crt`, cert);
}

// Requisição HTTP feita de dentro do primeiro pod pronto de um deployment.
export function deDentro(w, ns, app) {
  return w.pods(ns, { app }).find(w.podPronto) || null;
}

export const issuerCN = (pem) => umCert(pem)?.issuer?.CN;
export const subjectCN = (pem) => umCert(pem)?.subject?.CN;
export { b64, TRAINING_CA };
