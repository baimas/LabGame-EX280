import { deployment, service } from '../../engine/world.js';
import { requisicao } from '../../sim/net.js';
import { deDentro } from './comum.js';

const NS = 'catalogo';
const HOST = 'catalogo.apps.ocp4.example.com';

const acessa = (w, ns, app, alvo) => requisicao(w.cluster, deDentro(w, ns, app), { host: alvo, porta: 8080, caminho: '/', https: false }).status === 200;

const POLICIES = [
  { name: 'deny-all', spec: { podSelector: {} } },
  {
    name: 'allow-router',
    spec: {
      podSelector: { matchLabels: { app: 'frontend' } },
      ingress: [{ from: [{ namespaceSelector: { matchLabels: { 'network.openshift.io/policy-group': 'router' } } }], ports: [{ port: 8080 }] }],
    },
  },
  {
    name: 'allow-api',
    spec: {
      podSelector: { matchLabels: { app: 'api' } },
      ingress: [{ from: [{ podSelector: { matchLabels: { app: 'front' } } }], ports: [{ port: 8443 }] }],
    },
  },
];

export default {
  id: 'c4-netpol-conserto',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Configurar network policies de aplicações', 'Solucionar problemas de rede definida por software (SDN)'],
  title: { pt: 'Políticas que bloquearam demais', en: 'Policies that blocked too much' },
  story: {
    pt: 'Ontem à noite alguém aplicou as network policies do catálogo e foi dormir. Hoje cedo a loja amanheceu fora do ar: a route devolve 503 e o frontend não fala com a API. O deny-all foi aprovado pela segurança e tem de ficar.',
    en: 'Last night someone applied the catalog network policies and went to bed. This morning the store is down: the route returns 503 and the frontend cannot talk to the API. The deny-all was approved by security and must stay.',
  },
  tasks: {
    pt: [
      `No projeto \`catalogo\`, faça \`http://${HOST}\` voltar a responder.`,
      'O `frontend` deve voltar a alcançar a `api` na porta 8080.',
      'Não apague a policy `deny-all`, e não abra o projeto para tudo: pods de outros projetos continuam sem acesso à `api`.',
      'Corrija as policies existentes em vez de criar outras.',
    ],
    en: [
      `In the \`catalogo\` project, make \`http://${HOST}\` answer again.`,
      'The `frontend` must reach the `api` on port 8080 again.',
      'Do not delete the `deny-all` policy, and do not open the project to everything: pods from other projects still have no access to the `api`.',
      'Fix the existing policies instead of creating new ones.',
    ],
  },
  hints: [
    { pt: 'Compare cada seletor das policies com os labels reais: `oc get pods --show-labels` e `oc get ns openshift-ingress --show-labels`.', en: 'Compare each policy selector with the real labels: `oc get pods --show-labels` and `oc get ns openshift-ingress --show-labels`.' },
    { pt: 'Confira também as portas: em que porta a aplicação escuta de verdade?', en: 'Check the ports too: which port does the application really listen on?' },
    { pt: '`oc edit networkpolicy NOME` ou `oc patch` corrigem sem recriar. Teste com `oc exec deploy/frontend -- curl -s -m 3 api:8080`.', en: '`oc edit networkpolicy NAME` or `oc patch` fix them without recreating. Test with `oc exec deploy/frontend -- curl -s -m 3 api:8080`.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create({ kind: 'Namespace', metadata: { name: 'visitante' } });
    c.create(deployment('frontend', NS, 'nimbus/portal:1.1'));
    c.create(deployment('api', NS, 'nimbus/inventory:3.3'));
    c.create(service('frontend', NS));
    c.create(service('api', NS));
    c.create({ kind: 'Route', metadata: { name: 'frontend', namespace: NS }, spec: { host: HOST, to: { kind: 'Service', name: 'frontend' } } });
    c.create(deployment('visitante', 'visitante', 'nimbus/portal:1.1'));
    for (const p of POLICIES) c.create({ kind: 'NetworkPolicy', metadata: { name: p.name, namespace: NS }, spec: p.spec });
    c.side.missao = { uids: Object.fromEntries(POLICIES.map((p) => [p.name, c.get('NetworkPolicy', p.name, NS).metadata.uid])) };
  },
  checks: [
    {
      text: { pt: `http://${HOST} responde`, en: `http://${HOST} answers` },
      test: (w) => w.http(`http://${HOST}`).status === 200,
    },
    {
      text: { pt: 'frontend alcança a api', en: 'frontend reaches the api' },
      test: (w) => acessa(w, NS, 'frontend', 'api'),
    },
    {
      text: { pt: 'Outros projetos continuam sem acesso à api e ao frontend', en: 'Other projects still have no access to the api or the frontend' },
      test: (w) => !acessa(w, 'visitante', 'visitante', 'api.catalogo') && !acessa(w, 'visitante', 'visitante', 'frontend.catalogo'),
    },
    {
      text: { pt: 'As três policies originais foram corrigidas, não recriadas', en: 'The three original policies were fixed, not recreated' },
      test: (w) => {
        const uids = w.cluster.side.missao.uids;
        const atuais = w.list('NetworkPolicy', NS);
        return atuais.length === 3 && Object.entries(uids).every(([n, uid]) => w.get('NetworkPolicy', n, NS)?.metadata.uid === uid);
      },
    },
  ],
  solution: [
    { cmd: 'oc project catalogo', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get networkpolicies', pt: 'Três policies: deny-all, allow-router e allow-api.', en: 'Three policies: deny-all, allow-router, and allow-api.' },
    { cmd: 'oc get ns openshift-ingress --show-labels', pt: 'O label do roteador é `network.openshift.io/policy-group=ingress`, e não `router`.', en: 'The router label is `network.openshift.io/policy-group=ingress`, not `router`.' },
    { cmd: 'oc patch networkpolicy allow-router --type json -p \'[{"op":"replace","path":"/spec/ingress/0/from/0/namespaceSelector/matchLabels","value":{"network.openshift.io/policy-group":"ingress"}}]\'', pt: 'Corrige o seletor do roteador.', en: 'Fixes the router selector.' },
    { cmd: 'oc get pods --show-labels', pt: 'Os pods se chamam `app=frontend`, mas a allow-api espera `app=front`.', en: 'The pods are labeled `app=frontend`, but allow-api expects `app=front`.' },
    { cmd: 'oc patch networkpolicy allow-api --type json -p \'[{"op":"replace","path":"/spec/ingress/0/from/0/podSelector/matchLabels/app","value":"frontend"},{"op":"replace","path":"/spec/ingress/0/ports/0/port","value":8080}]\'', pt: 'Corrige o seletor e a porta: a api escuta na 8080.', en: 'Fixes the selector and the port: the api listens on 8080.' },
    { cmd: 'oc exec deploy/frontend -- curl -s -m 3 api:8080', pt: 'O frontend volta a falar com a api.', en: 'The frontend talks to the api again.' },
    { cmd: `curl -s http://${HOST}`, pt: 'A loja volta ao ar.', en: 'The store is back up.' },
  ],
};
