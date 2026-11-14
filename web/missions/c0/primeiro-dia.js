import { REGISTRY } from '../../engine/world.js';

const IMG = `${REGISTRY}/nimbus/portal:1.0`;

export default {
  id: 'c0-primeiro-dia',
  minutes: 10,
  xp: 100,
  difficulty: 1,
  objectives: ['Criar e excluir projetos', 'Usar a CLI para gerenciar o cluster', 'Expor aplicações para acesso externo'],
  title: { pt: 'Primeiro dia na Nimbus', en: 'First day at Nimbus' },
  story: {
    pt: 'Bem-vindo à Nimbus Tecnologia. Você acaba de assumir a administração do cluster OpenShift da empresa. O time do Portal precisa de um ambiente de desenvolvimento ainda hoje, e o chamado caiu na sua fila.',
    en: 'Welcome to Nimbus Tecnologia. You have just taken over the administration of the company OpenShift cluster. The Portal team needs a development environment today, and the ticket landed in your queue.',
  },
  tasks: {
    pt: [
      'Crie o projeto `portal-dev` com o nome de exibição `Portal Dev`.',
      `No projeto, crie o deployment \`portal\` com a imagem \`${IMG}\` e 2 réplicas.`,
      'Crie o service `portal` expondo a porta 8080 do deployment.',
      'Crie a route `portal` com o host `portal.apps.ocp4.example.com`.',
    ],
    en: [
      'Create the `portal-dev` project with the display name `Portal Dev`.',
      `In that project, create the \`portal\` deployment from the \`${IMG}\` image with 2 replicas.`,
      'Create the `portal` service exposing port 8080 of the deployment.',
      'Create the `portal` route with the `portal.apps.ocp4.example.com` host.',
    ],
  },
  hints: [
    { pt: '`oc new-project` aceita `--display-name`.', en: '`oc new-project` accepts `--display-name`.' },
    { pt: '`oc create deployment NOME --image=... --replicas=N` cria o deployment sem escrever YAML.', en: '`oc create deployment NAME --image=... --replicas=N` creates the deployment without writing YAML.' },
    { pt: '`oc expose deployment` cria o service; `oc expose service` cria a route (use `--hostname`).', en: '`oc expose deployment` creates the service; `oc expose service` creates the route (use `--hostname`).' },
  ],
  checks: [
    {
      text: { pt: 'O projeto portal-dev existe com o nome de exibição correto', en: 'The portal-dev project exists with the right display name' },
      test: (w) => w.get('Namespace', 'portal-dev')?.metadata.annotations?.['openshift.io/display-name'] === 'Portal Dev',
    },
    {
      text: { pt: 'O deployment portal usa a imagem pedida', en: 'The portal deployment uses the requested image' },
      test: (w) => w.get('Deployment', 'portal', 'portal-dev').spec.template.spec.containers[0].image === IMG,
    },
    {
      text: { pt: 'O deployment portal tem 2 réplicas prontas', en: 'The portal deployment has 2 ready replicas' },
      test: (w) => w.get('Deployment', 'portal', 'portal-dev').spec.replicas === 2 && w.ready('portal', 'portal-dev'),
    },
    {
      text: { pt: 'O service portal encaminha a porta 8080 para os pods', en: 'The portal service forwards port 8080 to the pods' },
      test: (w) => {
        const s = w.get('Service', 'portal', 'portal-dev');
        return s.spec.ports[0].port === 8080 && w.pods('portal-dev', s.spec.selector).length === 2;
      },
    },
    {
      text: { pt: 'A route portal usa o host pedido e aponta para o service', en: 'The portal route uses the requested host and targets the service' },
      test: (w) => {
        const r = w.get('Route', 'portal', 'portal-dev');
        return r.spec.host === 'portal.apps.ocp4.example.com' && r.spec.to.name === 'portal';
      },
    },
  ],
  solution: [
    { cmd: 'oc new-project portal-dev --display-name "Portal Dev"', pt: 'Cria o projeto e já passa a usá-lo.', en: 'Creates the project and switches to it.' },
    { cmd: `oc create deployment portal --image ${IMG} --replicas 2`, pt: 'Cria o deployment direto pela linha de comando.', en: 'Creates the deployment straight from the command line.' },
    { cmd: 'oc expose deployment portal --port 8080', pt: 'Gera um service com o mesmo seletor do deployment.', en: 'Generates a service with the same selector as the deployment.' },
    { cmd: 'oc expose service portal --hostname portal.apps.ocp4.example.com', pt: 'Gera a route apontando para o service.', en: 'Generates the route targeting the service.' },
    { cmd: 'oc rollout status deployment/portal', pt: 'Confirma que as réplicas subiram antes de dar a tarefa por encerrada.', en: 'Confirms the replicas are up before calling the task done.' },
  ],
};
