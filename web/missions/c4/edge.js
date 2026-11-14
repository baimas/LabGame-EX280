import { deployment, service } from '../../engine/world.js';
import { umCert, umaChave, verifica } from '../../sim/tls.js';
import { CERTS, caDeTreinamento, TRAINING_CA } from './comum.js';

const NS = 'payments';
const HOST = 'payments.apps.lab.example.com';

const arquivo = (w, n) => (w.fs.isFile(`${CERTS}/${n}`) ? w.fs.read(`${CERTS}/${n}`) : '');

export default {
  id: 'c4-edge',
  minutes: 25,
  xp: 240,
  difficulty: 2,
  objectives: ['Proteger tráfego externo e interno com certificados TLS', 'Criar e editar routes externas'],
  title: { pt: 'Cadeado no pagamento', en: 'A padlock on payments' },
  story: {
    pt: 'A página de pagamento ainda responde em HTTP puro, e a auditoria de PCI vence na sexta. O time de Segurança liberou a CA interna de treinamento para emitir o certificado do domínio.',
    en: 'The payment page still answers over plain HTTP, and the PCI audit is due on Friday. The Security team released the internal training CA to issue the domain certificate.',
  },
  tasks: {
    pt: [
      `A CA de treinamento está em \`~/certs/training-CA.pem\`, com a chave em \`~/certs/training-CA.key\`.`,
      `Gere a chave \`~/certs/payments.key\` e o certificado \`~/certs/payments.crt\` para \`${HOST}\`, assinado por essa CA e válido por 365 dias.`,
      `No projeto \`payments\`, troque a route \`payments\` por uma route edge com o mesmo nome e host, usando esse certificado.`,
      'Acessos por HTTP devem ser redirecionados para HTTPS.',
      `\`curl --cacert ~/certs/training-CA.pem https://${HOST}\` deve funcionar.`,
    ],
    en: [
      `The training CA is in \`~/certs/training-CA.pem\`, with its key in \`~/certs/training-CA.key\`.`,
      `Generate the \`~/certs/payments.key\` key and the \`~/certs/payments.crt\` certificate for \`${HOST}\`, signed by that CA and valid for 365 days.`,
      `In the \`payments\` project, replace the \`payments\` route with an edge route with the same name and host, using that certificate.`,
      'HTTP requests must be redirected to HTTPS.',
      `\`curl --cacert ~/certs/training-CA.pem https://${HOST}\` must work.`,
    ],
  },
  hints: [
    { pt: 'O caminho clássico é: `openssl genrsa` para a chave, `openssl req -new -subj "/CN=..."` para o CSR e `openssl x509 -req -CA ... -CAkey ...` para assinar.', en: 'The classic path is: `openssl genrsa` for the key, `openssl req -new -subj "/CN=..."` for the CSR, and `openssl x509 -req -CA ... -CAkey ...` to sign.' },
    { pt: 'Uma route não muda de tipo: apague a route `payments` e crie de novo com `oc create route edge`, passando `--cert`, `--key` e `--hostname`.', en: 'A route does not change type: delete the `payments` route and create it again with `oc create route edge`, passing `--cert`, `--key`, and `--hostname`.' },
    { pt: '`--insecure-policy Redirect` faz o HTTP responder 302 para o HTTPS. Confira o certificado com `openssl s_client -connect HOST:443`.', en: '`--insecure-policy Redirect` makes HTTP answer 302 to HTTPS. Check the certificate with `openssl s_client -connect HOST:443`.' },
  ],
  setup(w) {
    caDeTreinamento(w);
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('payments', NS, 'nimbus/portal:1.1', { replicas: 2 }));
    w.cluster.create(service('payments', NS));
    w.cluster.create({ kind: 'Route', metadata: { name: 'payments', namespace: NS, labels: { app: 'payments' } }, spec: { host: HOST, to: { kind: 'Service', name: 'payments' } } });
  },
  checks: [
    {
      text: { pt: 'payments.crt é para o host certo, assinado pela CA, e combina com payments.key', en: 'payments.crt is for the right host, signed by the CA, and matches payments.key' },
      test: (w) => {
        const crt = arquivo(w, 'payments.crt');
        return !verifica(crt, [TRAINING_CA.pem], HOST, w.cluster.now) && umaChave(arquivo(w, 'payments.key'))?.id === umCert(crt).pub;
      },
    },
    {
      text: { pt: 'O certificado vale por 365 dias', en: 'The certificate is valid for 365 days' },
      test: (w) => {
        const c = umCert(arquivo(w, 'payments.crt'));
        return Math.round((c.notAfter - c.notBefore) / 86400) === 365;
      },
    },
    {
      text: { pt: 'A route payments é edge, com esse certificado e admitida pelo roteador', en: 'The payments route is edge, uses that certificate, and is admitted by the router' },
      test: (w) => {
        const r = w.get('Route', 'payments', NS);
        return r.spec.host === HOST && r.spec.tls?.termination === 'edge' && umCert(r.spec.tls.certificate)?.serial === umCert(arquivo(w, 'payments.crt')).serial && r.status.ingress[0].conditions[0].status === 'True';
      },
    },
    {
      text: { pt: 'HTTP é redirecionado para HTTPS', en: 'HTTP is redirected to HTTPS' },
      test: (w) => w.http(`http://${HOST}`).status === 302,
    },
    {
      text: { pt: 'HTTPS responde com o certificado da CA de treinamento', en: 'HTTPS answers with the training CA certificate' },
      test: (w) => {
        const r = w.http(`https://${HOST}`);
        return r.status === 200 && !verifica(r.cert, [TRAINING_CA.pem], HOST, w.cluster.now);
      },
    },
  ],
  solution: [
    { cmd: 'cd ~/certs', pt: 'Trabalha no diretório dos certificados.', en: 'Works in the certificates directory.' },
    { cmd: 'openssl genrsa -out payments.key 2048', pt: 'Gera a chave privada.', en: 'Generates the private key.' },
    { cmd: `openssl req -new -key payments.key -subj "/C=BR/O=Nimbus Tecnologia/CN=${HOST}" -out payments.csr`, pt: 'Gera o pedido de certificado com o host no CN.', en: 'Generates the certificate request with the host in the CN.' },
    { cmd: 'openssl x509 -req -in payments.csr -CA training-CA.pem -CAkey training-CA.key -CAcreateserial -days 365 -out payments.crt', pt: 'A CA assina o pedido.', en: 'The CA signs the request.' },
    { cmd: 'openssl verify -CAfile training-CA.pem payments.crt', pt: 'Confere a cadeia.', en: 'Checks the chain.' },
    { cmd: 'oc delete route payments -n payments', pt: 'A route HTTP sai.', en: 'The HTTP route goes away.' },
    { cmd: `oc create route edge payments --service payments --hostname ${HOST} --cert payments.crt --key payments.key --insecure-policy Redirect -n payments`, pt: 'Cria a route edge com o certificado e o redirecionamento.', en: 'Creates the edge route with the certificate and the redirect.' },
    { cmd: `curl -s --cacert training-CA.pem https://${HOST}`, pt: 'Confere o HTTPS.', en: 'Checks HTTPS.' },
    { cmd: `curl -sI http://${HOST}`, pt: 'HTTP responde 302.', en: 'HTTP answers 302.' },
    { cmd: 'cd ~', pt: 'Volta para a pasta pessoal.', en: 'Goes back home.' },
  ],
};
