import { REGISTRY } from '../../engine/world.js';

const NS = 'catalog';
const DIR = '/home/student/labs/catalog';
const HOST = 'catalog.apps.lab.example.com';

const TEMPLATE = `apiVersion: template.openshift.io/v1
kind: Template
metadata:
  name: catalog-app
  annotations:
    description: Catalog microservice with a deployment, a service, and a route.
    openshift.io/display-name: Catalog microservice
labels:
  team: catalog
parameters:
  - name: NAME
    displayName: Application name
    description: Name of the deployment, service, and route.
    required: true
  - name: IMAGE
    displayName: Image
    description: Image repository of the application.
    value: ${REGISTRY}/nimbus/inventory
  - name: VERSION
    displayName: Version
    description: Image tag.
    value: "3.2"
  - name: REPLICAS
    displayName: Replicas
    description: Number of pods.
    value: "1"
  - name: HOSTNAME
    displayName: Route host
    description: Route host name. Leave empty for the default host.
objects:
  - apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: \${NAME}
      labels:
        app: \${NAME}
    spec:
      replicas: \${{REPLICAS}}
      selector:
        matchLabels:
          app: \${NAME}
      template:
        metadata:
          labels:
            app: \${NAME}
        spec:
          containers:
            - name: app
              image: \${IMAGE}:\${VERSION}
              ports:
                - containerPort: 8080
                  name: http
  - apiVersion: v1
    kind: Service
    metadata:
      name: \${NAME}
      labels:
        app: \${NAME}
    spec:
      selector:
        app: \${NAME}
      ports:
        - name: http
          port: 8080
          targetPort: http
  - apiVersion: route.openshift.io/v1
    kind: Route
    metadata:
      name: \${NAME}
      labels:
        app: \${NAME}
    spec:
      host: \${HOSTNAME}
      to:
        kind: Service
        name: \${NAME}
      port:
        targetPort: http
`;

const PARAMS = `NAME=catalog-web
IMAGE=${REGISTRY}/nimbus/portal
VERSION=1.1
HOSTNAME=${HOST}
`;

const imagem = (w, nome) => w.get('Deployment', nome, NS).spec.template.spec.containers[0].image;

export default {
  id: 'c2-template-proprio',
  minutes: 20,
  xp: 180,
  difficulty: 2,
  objectives: ['Implantar aplicações a partir de templates', 'Expor aplicações para acesso externo'],
  title: { pt: 'Um template para o time de Catálogo', en: 'A template for the Catalog team' },
  story: {
    pt: 'O time de Catálogo escreveu um template para padronizar seus microsserviços e quer que ele fique disponível no projeto deles. Você vai publicá-lo e usá-lo para as duas primeiras aplicações.',
    en: 'The Catalog team wrote a template to standardize their microservices and wants it available in their project. You will publish it and use it for the first two applications.',
  },
  tasks: {
    pt: [
      'Crie o projeto `catalog` e publique nele o template de `~/labs/catalog/catalog-app.yaml`. O template deve ficar guardado no projeto.',
      'Usando esse template, crie a aplicação `catalog-api` com 2 réplicas da versão `3.3` da imagem padrão do template.',
      'Usando o mesmo template e os parâmetros do arquivo `~/labs/catalog/catalog-web.env`, crie a aplicação `catalog-web`.',
      `Todos os pods devem ficar prontos, e \`http://${HOST}\` deve responder.`,
    ],
    en: [
      'Create the `catalog` project and publish in it the template from `~/labs/catalog/catalog-app.yaml`. The template must be stored in the project.',
      'Using that template, create the `catalog-api` application with 2 replicas of version `3.3` of the template default image.',
      'Using the same template and the parameters from the `~/labs/catalog/catalog-web.env` file, create the `catalog-web` application.',
      `Every pod must become ready, and \`http://${HOST}\` must answer.`,
    ],
  },
  hints: [
    { pt: '`oc create -f` grava o template no projeto; `oc get templates` confirma.', en: '`oc create -f` stores the template in the project; `oc get templates` confirms it.' },
    { pt: '`oc new-app --template catalog-app -p NAME=... -p VERSION=... -p REPLICAS=...` usa o template do projeto atual.', en: '`oc new-app --template catalog-app -p NAME=... -p VERSION=... -p REPLICAS=...` uses the template in the current project.' },
    { pt: '`oc process catalog-app --param-file ARQUIVO | oc apply -f -` também funciona e permite revisar o YAML antes.', en: '`oc process catalog-app --param-file FILE | oc apply -f -` also works and lets you review the YAML first.' },
  ],
  setup(w) {
    w.fs.put(`${DIR}/catalog-app.yaml`, TEMPLATE);
    w.fs.put(`${DIR}/catalog-web.env`, PARAMS);
  },
  checks: [
    {
      text: { pt: 'O template catalog-app está guardado no projeto catalog', en: 'The catalog-app template is stored in the catalog project' },
      test: (w) => Boolean(w.get('Template', 'catalog-app', NS)),
    },
    {
      text: { pt: 'catalog-api tem 2 réplicas prontas da imagem inventory:3.3', en: 'catalog-api has 2 ready replicas of the inventory:3.3 image' },
      test: (w) => w.get('Deployment', 'catalog-api', NS).spec.replicas === 2 && imagem(w, 'catalog-api') === `${REGISTRY}/nimbus/inventory:3.3` && w.ready('catalog-api', NS),
    },
    {
      text: { pt: 'catalog-web usa os parâmetros do arquivo e está pronta', en: 'catalog-web uses the parameters from the file and is ready' },
      test: (w) => imagem(w, 'catalog-web') === `${REGISTRY}/nimbus/portal:1.1` && w.get('Route', 'catalog-web', NS).spec.host === HOST && w.ready('catalog-web', NS),
    },
    {
      text: { pt: 'Os recursos têm o label team=catalog do template', en: 'The resources have the team=catalog label from the template' },
      test: (w) => ['catalog-api', 'catalog-web'].every((n) => w.get('Deployment', n, NS).metadata.labels?.team === 'catalog'),
    },
    {
      text: { pt: `http://${HOST} responde`, en: `http://${HOST} answers` },
      test: (w) => w.http(`http://${HOST}`).status === 200,
    },
  ],
  solution: [
    { cmd: 'oc new-project catalog', pt: 'Cria o projeto do time.', en: 'Creates the team project.' },
    { cmd: 'oc create -f ~/labs/catalog/catalog-app.yaml', pt: 'Publica o template no projeto.', en: 'Publishes the template in the project.' },
    { cmd: 'oc process --parameters catalog-app', pt: 'Revisa os parâmetros disponíveis.', en: 'Reviews the available parameters.' },
    { cmd: 'oc new-app --template catalog-app -p NAME=catalog-api -p VERSION=3.3 -p REPLICAS=2', pt: 'Cria a primeira aplicação; IMAGE fica com o valor padrão.', en: 'Creates the first application; IMAGE keeps its default value.' },
    { cmd: 'oc process catalog-app --param-file ~/labs/catalog/catalog-web.env | oc apply -f -', pt: 'Cria a segunda aplicação a partir do arquivo de parâmetros.', en: 'Creates the second application from the parameter file.' },
    { cmd: 'oc rollout status deployment/catalog-api && oc rollout status deployment/catalog-web', pt: 'Aguarda as duas.', en: 'Waits for both.' },
    { cmd: `curl -s http://${HOST}`, pt: 'Confere a route.', en: 'Checks the route.' },
  ],
};
