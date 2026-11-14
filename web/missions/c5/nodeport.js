import { deployment, service } from '../../engine/world.js';
import { deFora } from './comum.js';

const NS = 'legacy';
const NO = '192.168.50.10';

export default {
  id: 'c5-nodeport',
  minutes: 15,
  xp: 180,
  difficulty: 2,
  objectives: ['Configurar acesso externo às aplicações', 'Expor aplicações não HTTP/SNI', 'Configurar services'],
  title: { pt: 'Uma porta no nó', en: 'A port on the node' },
  story: {
    pt: 'O terminal de atendimento antigo só sabe se conectar a um IP fixo e a uma porta fixa, e os IPs do MetalLB estão reservados para produção. A saída é publicar as aplicações direto numa porta do nó.',
    en: 'The old service terminal only knows how to connect to a fixed IP and a fixed port, and the MetalLB IPs are reserved for production. The way out is to publish the applications straight on a node port.',
  },
  tasks: {
    pt: [
      'No projeto `legacy`, crie o service `legacy-chat` do tipo NodePort, porta 9000, que publique o deployment `legacy-chat` na porta `30900` do nó.',
      'O service `legacy-web` já existe como ClusterIP. Troque-o para NodePort, publicando a porta 8080 na porta `30080` do nó, sem recriá-lo.',
      `Da estação de trabalho, \`echo oi | nc ${NO} 30900\` e \`curl http://${NO}:30080\` devem responder.`,
    ],
    en: [
      'In the `legacy` project, create the `legacy-chat` NodePort service, port 9000, publishing the `legacy-chat` deployment on node port `30900`.',
      'The `legacy-web` service already exists as ClusterIP. Change it to NodePort, publishing port 8080 on node port `30080`, without recreating it.',
      `From the workstation, \`echo hi | nc ${NO} 30900\` and \`curl http://${NO}:30080\` must answer.`,
    ],
  },
  hints: [
    { pt: '`oc create service nodeport NOME --tcp 9000:9000 --node-port 30900` cria o service com seletor `app=NOME`.', en: '`oc create service nodeport NAME --tcp 9000:9000 --node-port 30900` creates the service with the `app=NAME` selector.' },
    { pt: 'Para mudar o tipo sem recriar, use `oc patch` (ou `oc edit`) em `spec.type` e `spec.ports[0].nodePort`.', en: 'To change the type without recreating, use `oc patch` (or `oc edit`) on `spec.type` and `spec.ports[0].nodePort`.' },
    { pt: `O IP do nó aparece em \`oc get nodes -o wide\`: ${NO}.`, en: `The node IP shows up in \`oc get nodes -o wide\`: ${NO}.` },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create(deployment('legacy-chat', NS, 'nimbus/chat:1.0', { extra: { container: { ports: [{ containerPort: 9000 }] } } }));
    c.create(deployment('legacy-web', NS, 'nimbus/portal:1.0'));
    c.create(service('legacy-web', NS));
    c.side.missao = { web: c.get('Service', 'legacy-web', NS).metadata.uid };
  },
  checks: [
    {
      text: { pt: 'legacy-chat é NodePort 9000 → 30900', en: 'legacy-chat is NodePort 9000 → 30900' },
      test: (w) => {
        const s = w.get('Service', 'legacy-chat', NS);
        return s.spec.type === 'NodePort' && s.spec.ports.some((p) => p.port === 9000 && p.nodePort === 30900);
      },
    },
    {
      text: { pt: 'legacy-web virou NodePort 8080 → 30080 sem ser recriado', en: 'legacy-web became NodePort 8080 → 30080 without being recreated' },
      test: (w) => {
        const s = w.get('Service', 'legacy-web', NS);
        return s.metadata.uid === w.cluster.side.missao.web && s.spec.type === 'NodePort' && s.spec.ports.some((p) => p.port === 8080 && p.nodePort === 30080);
      },
    },
    {
      text: { pt: 'Os dois respondem pelo IP do nó', en: 'Both answer through the node IP' },
      test: (w) => deFora(w, NO, 30900).proto === 'chat' && w.http(`http://${NO}:30080`).status === 200,
    },
  ],
  solution: [
    { cmd: 'oc project legacy', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc create service nodeport legacy-chat --tcp 9000:9000 --node-port 30900', pt: 'O seletor `app=legacy-chat` casa com o deployment.', en: 'The `app=legacy-chat` selector matches the deployment.' },
    { cmd: 'oc patch svc legacy-web --type json -p \'[{"op":"replace","path":"/spec/type","value":"NodePort"},{"op":"add","path":"/spec/ports/0/nodePort","value":30080}]\'', pt: 'Troca o tipo e fixa a porta do nó.', en: 'Changes the type and pins the node port.' },
    { cmd: 'oc get svc', pt: 'PORT(S) mostra `porta:nodePort`.', en: 'PORT(S) shows `port:nodePort`.' },
    { cmd: `echo oi | nc ${NO} 30900`, pt: 'O chat responde no nó.', en: 'The chat answers on the node.' },
    { cmd: `curl -s http://${NO}:30080`, pt: 'E o portal também.', en: 'And so does the portal.' },
  ],
};
