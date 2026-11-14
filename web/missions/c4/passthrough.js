import { deployment } from '../../engine/world.js';
import { verifica, umCert } from '../../sim/tls.js';
import { caDeTreinamento, certificadoPara, TRAINING_CA, b64, CERTS } from './comum.js';

const NS = 'vault';
const HOST = 'vault.apps.lab.example.com';

const ct = (w) => w.get('Deployment', 'vault', NS).spec.template.spec.containers[0];

export default {
  id: 'c4-passthrough',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Proteger tráfego externo e interno com certificados TLS', 'Criar e editar routes externas', 'Criar e aplicar secrets para informações sensíveis'],
  title: { pt: 'O cofre fala TLS sozinho', en: 'The vault speaks TLS on its own' },
  story: {
    pt: 'O cofre de senhas não pode ter o TLS aberto no roteador: a criptografia tem de ir até o pod. O fornecedor já entregou o certificado e a chave; falta montar tudo no OpenShift.',
    en: 'The password vault cannot have TLS terminated at the router: encryption must go all the way to the pod. The vendor already delivered the certificate and the key; it is all about wiring it up in OpenShift.',
  },
  tasks: {
    pt: [
      `O certificado e a chave de \`${HOST}\` estão em \`~/certs/vault.crt\` e \`~/certs/vault.key\`, assinados pela CA \`~/certs/training-CA.pem\`.`,
      'No projeto `vault`, crie o secret TLS `vault-tls` com esse certificado e essa chave.',
      'Monte o secret no deployment `vault` em `/etc/pki/nimbus` e defina a variável `TLS_DIR=/etc/pki/nimbus`. Com isso a aplicação passa a servir HTTPS na porta 8443.',
      'Exponha a porta HTTPS do service `vault` com uma route passthrough chamada `vault`, com o host do certificado.',
      `\`curl --cacert ~/certs/training-CA.pem https://${HOST}\` deve funcionar, com o certificado apresentado pelo próprio pod.`,
    ],
    en: [
      `The \`${HOST}\` certificate and key are in \`~/certs/vault.crt\` and \`~/certs/vault.key\`, signed by the \`~/certs/training-CA.pem\` CA.`,
      'In the `vault` project, create the `vault-tls` TLS secret with that certificate and key.',
      'Mount the secret in the `vault` deployment at `/etc/pki/nimbus` and set the `TLS_DIR=/etc/pki/nimbus` variable. The application then serves HTTPS on port 8443.',
      'Expose the HTTPS port of the `vault` service with a passthrough route named `vault`, using the certificate host.',
      `\`curl --cacert ~/certs/training-CA.pem https://${HOST}\` must work, with the certificate presented by the pod itself.`,
    ],
  },
  hints: [
    { pt: '`oc create secret tls NOME --cert ARQUIVO --key ARQUIVO` cria um secret do tipo `kubernetes.io/tls` com as chaves `tls.crt` e `tls.key`.', en: '`oc create secret tls NAME --cert FILE --key FILE` creates a `kubernetes.io/tls` secret with the `tls.crt` and `tls.key` keys.' },
    { pt: '`oc set volume ... --add --type secret --secret-name ... --mount-path ...` e `oc set env`. Se o pod entrar em CrashLoopBackOff, leia o `oc logs`.', en: '`oc set volume ... --add --type secret --secret-name ... --mount-path ...` and `oc set env`. If the pod goes into CrashLoopBackOff, read `oc logs`.' },
    { pt: 'Uma route passthrough não recebe certificado: `oc create route passthrough NOME --service vault --port https --hostname ...`.', en: 'A passthrough route takes no certificate: `oc create route passthrough NAME --service vault --port https --hostname ...`.' },
  ],
  setup(w) {
    caDeTreinamento(w);
    certificadoPara(w, HOST, 'vault');
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('vault', NS, 'nimbus/portal:2.0'));
    w.cluster.create({ kind: 'Service', metadata: { name: 'vault', namespace: NS, labels: { app: 'vault' } }, spec: { selector: { app: 'vault' }, ports: [{ name: 'https', port: 8443, targetPort: 8443 }] } });
  },
  checks: [
    {
      text: { pt: 'O secret vault-tls é do tipo TLS e tem o certificado entregue', en: 'The vault-tls secret is a TLS secret holding the delivered certificate' },
      test: (w) => {
        const s = w.get('Secret', 'vault-tls', NS);
        return s.type === 'kubernetes.io/tls' && umCert(b64.dec(s.data['tls.crt']))?.serial === umCert(w.fs.read(`${CERTS}/vault.crt`)).serial;
      },
    },
    {
      text: { pt: 'O deployment monta o secret em /etc/pki/nimbus com TLS_DIR definido', en: 'The deployment mounts the secret at /etc/pki/nimbus with TLS_DIR set' },
      test: (w) => {
        const spec = w.get('Deployment', 'vault', NS).spec.template.spec;
        const vol = (spec.volumes || []).find((v) => v.secret?.secretName === 'vault-tls');
        return Boolean(vol) && (ct(w).volumeMounts || []).some((m) => m.name === vol.name && m.mountPath.replace(/\/$/, '') === '/etc/pki/nimbus') && (ct(w).env || []).some((e) => e.name === 'TLS_DIR' && e.value.replace(/\/$/, '') === '/etc/pki/nimbus');
      },
    },
    {
      text: { pt: 'O deployment vault está pronto', en: 'The vault deployment is ready' },
      test: (w) => w.ready('vault', NS),
    },
    {
      text: { pt: 'A route vault é passthrough, com o host do certificado', en: 'The vault route is passthrough, with the certificate host' },
      test: (w) => {
        const r = w.get('Route', 'vault', NS);
        return r.spec.tls?.termination === 'passthrough' && r.spec.host === HOST;
      },
    },
    {
      text: { pt: 'HTTPS responde e o certificado vem do pod', en: 'HTTPS answers and the certificate comes from the pod' },
      test: (w) => {
        const r = w.http(`https://${HOST}`);
        return r.status === 200 && !verifica(r.cert, [TRAINING_CA.pem], HOST, w.cluster.now);
      },
    },
  ],
  solution: [
    { cmd: 'oc project vault', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc create secret tls vault-tls --cert ~/certs/vault.crt --key ~/certs/vault.key', pt: 'Guarda o par de chaves num secret TLS.', en: 'Stores the key pair in a TLS secret.' },
    { cmd: 'oc set volume deployment/vault --add --type secret --secret-name vault-tls --mount-path /etc/pki/nimbus', pt: 'Monta o certificado no contêiner.', en: 'Mounts the certificate in the container.' },
    { cmd: 'oc set env deployment/vault TLS_DIR=/etc/pki/nimbus', pt: 'Diz à aplicação onde estão os arquivos.', en: 'Tells the application where the files are.' },
    { cmd: 'oc rollout status deployment/vault', pt: 'Aguarda o pod novo.', en: 'Waits for the new pod.' },
    { cmd: 'oc logs deployment/vault', pt: 'A aplicação agora escuta na 8443 com TLS.', en: 'The application now listens on 8443 with TLS.' },
    { cmd: `oc create route passthrough vault --service vault --port https --hostname ${HOST}`, pt: 'O roteador só repassa o TLS.', en: 'The router only passes TLS through.' },
    { cmd: `curl -s --cacert ~/certs/training-CA.pem https://${HOST}`, pt: 'Confere o acesso.', en: 'Checks the access.' },
    { cmd: `openssl s_client -connect ${HOST}:443 -CAfile ~/certs/training-CA.pem | grep -E 'subject|issuer'`, pt: 'O certificado apresentado é o do pod.', en: 'The presented certificate is the pod one.' },
  ],
};
