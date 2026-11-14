import { deployment } from '../../engine/world.js';
import { requisicao } from '../../sim/net.js';
import { SERVICE_CA, verifica, umCert } from '../../sim/tls.js';
import { b64, deDentro } from './comum.js';

const NS = 'ledger';
const HOST = 'ledger.apps.ocp4.example.com';
const ANOT = 'service.beta.openshift.io/serving-cert-secret-name';

const spec = (w, n) => w.get('Deployment', n, NS).spec.template.spec;
const montado = (w, n, filtro, caminho) => {
  const s = spec(w, n);
  const vol = (s.volumes || []).find(filtro);
  return Boolean(vol) && (s.containers[0].volumeMounts || []).some((m) => m.name === vol.name && m.mountPath.replace(/\/$/, '') === caminho);
};

export default {
  id: 'c4-service-ca',
  minutes: 30,
  xp: 280,
  difficulty: 3,
  objectives: ['Proteger tráfego externo e interno com certificados TLS', 'Criar e editar routes externas', 'Criar e usar config maps'],
  title: { pt: 'TLS também por dentro', en: 'TLS on the inside too' },
  story: {
    pt: 'O razão contábil conversa com os clientes internos em texto puro dentro do cluster, e a nova política exige TLS ponta a ponta. Ninguém quer gerenciar certificados à mão: a ordem é usar a CA de serviço do próprio OpenShift.',
    en: 'The ledger talks to internal clients in plain text inside the cluster, and the new policy demands end-to-end TLS. Nobody wants to manage certificates by hand: the order is to use the OpenShift service CA.',
  },
  tasks: {
    pt: [
      'Trabalhe no projeto `ledger`.',
      'Faça o OpenShift emitir um certificado para o service `ledger-api`, guardado no secret `ledger-api-tls`.',
      'Monte esse secret no deployment `ledger-api` em `/etc/pki/nimbus` e defina `TLS_DIR=/etc/pki/nimbus`, para a aplicação servir HTTPS na porta 8443.',
      'Crie o config map `service-ca` com o CA bundle de serviço injetado pelo OpenShift e monte-o no deployment `ledger-client` em `/etc/pki/service-ca`.',
      'De dentro do `ledger-client`, `curl --cacert /etc/pki/service-ca/service-ca.crt https://ledger-api.ledger.svc:8443` deve funcionar.',
      `Exponha o \`ledger-api\` com uma route reencrypt \`ledger-api\` no host \`${HOST}\`.`,
    ],
    en: [
      'Work in the `ledger` project.',
      'Make OpenShift issue a certificate for the `ledger-api` service, stored in the `ledger-api-tls` secret.',
      'Mount that secret in the `ledger-api` deployment at `/etc/pki/nimbus` and set `TLS_DIR=/etc/pki/nimbus`, so the application serves HTTPS on port 8443.',
      'Create the `service-ca` config map with the service CA bundle injected by OpenShift and mount it in the `ledger-client` deployment at `/etc/pki/service-ca`.',
      'From inside `ledger-client`, `curl --cacert /etc/pki/service-ca/service-ca.crt https://ledger-api.ledger.svc:8443` must work.',
      `Expose \`ledger-api\` with a \`ledger-api\` reencrypt route on the \`${HOST}\` host.`,
    ],
  },
  hints: [
    { pt: `A anotação \`${ANOT}=NOME\` no service faz a service CA criar o secret TLS. A anotação \`service.beta.openshift.io/inject-cabundle=true\` num config map injeta a chave \`service-ca.crt\`.`, en: `The \`${ANOT}=NAME\` annotation on the service makes the service CA create the TLS secret. The \`service.beta.openshift.io/inject-cabundle=true\` annotation on a config map injects the \`service-ca.crt\` key.` },
    { pt: '`oc annotate`, `oc create configmap` (vazio) e `oc set volume --add --type secret|configmap`. Teste com `oc exec deploy/ledger-client -- curl ...`.', en: '`oc annotate`, `oc create configmap` (empty), and `oc set volume --add --type secret|configmap`. Test with `oc exec deploy/ledger-client -- curl ...`.' },
    { pt: 'Na route reencrypt o roteador já confia na service CA, então não precisa de `--dest-ca-cert`.', en: 'On a reencrypt route the router already trusts the service CA, so `--dest-ca-cert` is not needed.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('ledger-api', NS, 'nimbus/billing-api:1.1', { env: { DB_HOST: 'ledger-db' } }));
    c.create({ kind: 'Service', metadata: { name: 'ledger-api', namespace: NS, labels: { app: 'ledger-api' } }, spec: { selector: { app: 'ledger-api' }, ports: [{ name: 'https', port: 8443, targetPort: 8443 }] } });
    c.create(deployment('ledger-client', NS, 'nimbus/portal:1.1'));
  },
  checks: [
    {
      text: { pt: 'O secret ledger-api-tls foi emitido pela service CA para ledger-api', en: 'The ledger-api-tls secret was issued by the service CA for ledger-api' },
      test: (w) => {
        const s = w.get('Secret', 'ledger-api-tls', NS);
        return w.get('Service', 'ledger-api', NS).metadata.annotations?.[ANOT] === 'ledger-api-tls' && !verifica(b64.dec(s.data['tls.crt']), [SERVICE_CA.pem], 'ledger-api.ledger.svc', w.cluster.now);
      },
    },
    {
      text: { pt: 'ledger-api monta o certificado, tem TLS_DIR e está pronto', en: 'ledger-api mounts the certificate, has TLS_DIR, and is ready' },
      test: (w) => montado(w, 'ledger-api', (v) => v.secret?.secretName === 'ledger-api-tls', '/etc/pki/nimbus') && spec(w, 'ledger-api').containers[0].env.some((e) => e.name === 'TLS_DIR') && w.ready('ledger-api', NS),
    },
    {
      text: { pt: 'O config map service-ca recebe o CA bundle e está montado no ledger-client', en: 'The service-ca config map gets the CA bundle and is mounted in ledger-client' },
      test: (w) => w.get('ConfigMap', 'service-ca', NS).data?.['service-ca.crt'] === SERVICE_CA.pem && montado(w, 'ledger-client', (v) => v.configMap?.name === 'service-ca', '/etc/pki/service-ca') && w.ready('ledger-client', NS),
    },
    {
      text: { pt: 'ledger-client fala HTTPS com ledger-api e confia no certificado', en: 'ledger-client talks HTTPS to ledger-api and trusts the certificate' },
      test: (w) => {
        const r = requisicao(w.cluster, deDentro(w, NS, 'ledger-client'), { host: 'ledger-api.ledger.svc', porta: 8443, caminho: '/', https: true });
        return r.status === 200 && !verifica(r.cert, [SERVICE_CA.pem], 'ledger-api.ledger.svc', w.cluster.now);
      },
    },
    {
      text: { pt: `A route reencrypt responde em https://${HOST}`, en: `The reencrypt route answers at https://${HOST}` },
      test: (w) => w.get('Route', 'ledger-api', NS).spec.tls?.termination === 'reencrypt' && w.http(`https://${HOST}`).status === 200 && umCert(w.http(`https://${HOST}`).cert)?.subject.CN === '*.apps.ocp4.example.com',
    },
  ],
  solution: [
    { cmd: 'oc project ledger', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc annotate service ledger-api ${ANOT}=ledger-api-tls`, pt: 'A service CA emite o certificado no secret.', en: 'The service CA issues the certificate into the secret.' },
    { cmd: 'oc get secret ledger-api-tls', pt: 'O secret TLS já existe.', en: 'The TLS secret already exists.' },
    { cmd: 'oc set volume deployment/ledger-api --add --type secret --secret-name ledger-api-tls --mount-path /etc/pki/nimbus', pt: 'Monta o certificado na API.', en: 'Mounts the certificate in the API.' },
    { cmd: 'oc set env deployment/ledger-api TLS_DIR=/etc/pki/nimbus', pt: 'Liga o HTTPS na 8443.', en: 'Turns HTTPS on at 8443.' },
    { cmd: 'oc create configmap service-ca', pt: 'Config map vazio, que vai receber o CA bundle.', en: 'Empty config map that will receive the CA bundle.' },
    { cmd: 'oc annotate configmap service-ca service.beta.openshift.io/inject-cabundle=true', pt: 'O OpenShift injeta a chave `service-ca.crt`.', en: 'OpenShift injects the `service-ca.crt` key.' },
    { cmd: 'oc set volume deployment/ledger-client --add --type configmap --configmap-name service-ca --mount-path /etc/pki/service-ca', pt: 'O cliente passa a ter a CA para confiar.', en: 'The client now has the CA to trust.' },
    { cmd: 'oc rollout status deployment/ledger-api && oc rollout status deployment/ledger-client', pt: 'Aguarda os dois.', en: 'Waits for both.' },
    { cmd: 'oc exec deployment/ledger-client -- curl -s --cacert /etc/pki/service-ca/service-ca.crt https://ledger-api.ledger.svc:8443', pt: 'TLS de ponta a ponta dentro do cluster.', en: 'End-to-end TLS inside the cluster.' },
    { cmd: `oc create route reencrypt ledger-api --service ledger-api --port https --hostname ${HOST}`, pt: 'O roteador abre um TLS novo até o pod.', en: 'The router opens a new TLS connection to the pod.' },
    { cmd: `curl -s https://${HOST}`, pt: 'Acesso externo pela route.', en: 'External access through the route.' },
  ],
};
