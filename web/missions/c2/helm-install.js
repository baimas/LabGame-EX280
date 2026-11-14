import { REGISTRY } from '../../engine/world.js';
import { releases } from '../../sim/helm.js';
import { REPO_URL } from '../../sim/charts.js';

const NS = 'stock';
const HOST = 'stock.apps.lab.example.com';

const release = (w) => releases(w.cluster, NS).find((r) => r.name === 'stock' && r.info.status === 'deployed');
const dep = (w) => w.get('Deployment', 'stock-inventory', NS);

export default {
  id: 'c2-helm-install',
  minutes: 20,
  xp: 200,
  difficulty: 2,
  objectives: ['Implantar aplicações a partir de Helm charts', 'Expor aplicações para acesso externo'],
  title: { pt: 'Helm: o primeiro chart', en: 'Helm: the first chart' },
  story: {
    pt: 'O fornecedor do sistema de estoque passou a entregar o software como um chart do Helm, publicado no repositório interno da Nimbus. Você vai fazer a primeira instalação, com as configurações do ambiente guardadas num arquivo de valores.',
    en: 'The inventory system vendor now ships the software as a Helm chart, published in the Nimbus internal repository. You will do the first installation, with the environment settings kept in a values file.',
  },
  tasks: {
    pt: [
      `Adicione o repositório de charts \`${REPO_URL}\` com o nome \`nimbus\`.`,
      'Instale a versão `0.2.0` do chart `inventory` como a release `stock`, no projeto `stock`.',
      'As configurações devem vir do arquivo `~/labs/stock/values.yaml`, que você deve completar: 2 réplicas, route habilitada com o host `stock.apps.lab.example.com` e a variável de ambiente `TZ=America/Sao_Paulo`.',
      `Os pods devem ficar prontos e \`http://${HOST}\` deve responder.`,
    ],
    en: [
      `Add the \`${REPO_URL}\` chart repository with the \`nimbus\` name.`,
      'Install version `0.2.0` of the `inventory` chart as the `stock` release, in the `stock` project.',
      'The settings must come from the `~/labs/stock/values.yaml` file, which you must complete: 2 replicas, route enabled with the `stock.apps.lab.example.com` host, and the `TZ=America/Sao_Paulo` environment variable.',
      `The pods must become ready and \`http://${HOST}\` must answer.`,
    ],
  },
  hints: [
    { pt: '`helm repo add`, `helm search repo --versions` e `helm show values REPO/CHART` mostram o que existe e quais valores o chart aceita.', en: '`helm repo add`, `helm search repo --versions`, and `helm show values REPO/CHART` show what exists and which values the chart accepts.' },
    { pt: 'O arquivo de valores só precisa das chaves que mudam: `replicaCount`, `route.enabled`, `route.host` e `env`.', en: 'The values file only needs the keys that change: `replicaCount`, `route.enabled`, `route.host`, and `env`.' },
    { pt: '`helm install stock nimbus/inventory --version 0.2.0 -f ARQUIVO -n stock` (crie o projeto antes, ou use `--create-namespace`).', en: '`helm install stock nimbus/inventory --version 0.2.0 -f FILE -n stock` (create the project first, or use `--create-namespace`).' },
  ],
  setup(w) {
    w.fs.put('/home/student/labs/stock/values.yaml', '# Valores do ambiente de produção do estoque.\n# Complete com as configurações pedidas no chamado.\n');
  },
  checks: [
    {
      text: { pt: 'O repositório nimbus está configurado', en: 'The nimbus repository is configured' },
      test: (w) => (w.file('.config/helm/repositories.yaml') || '').includes(`name: nimbus\n    url: ${REPO_URL}`),
    },
    {
      text: { pt: 'A release stock está implantada com o chart inventory-0.2.0', en: 'The stock release is deployed with the inventory-0.2.0 chart' },
      test: (w) => release(w)?.chart.metadata.name === 'inventory' && release(w).chart.metadata.version === '0.2.0',
    },
    {
      text: { pt: 'Os valores vieram do arquivo values.yaml', en: 'The values came from the values.yaml file' },
      test: (w) => {
        const conf = release(w).config;
        const arquivo = w.file('labs/stock/values.yaml') || '';
        return conf.replicaCount === 2 && conf.route?.host === HOST && /replicaCount:\s*2/.test(arquivo) && arquivo.includes(HOST) && arquivo.includes('America/Sao_Paulo');
      },
    },
    {
      text: { pt: 'stock-inventory tem 2 réplicas prontas da versão 3.3 com TZ definido', en: 'stock-inventory has 2 ready replicas of version 3.3 with TZ set' },
      test: (w) => {
        const ct = dep(w).spec.template.spec.containers[0];
        return dep(w).spec.replicas === 2 && ct.image === `${REGISTRY}/nimbus/inventory:3.3` && ct.env?.some((e) => e.name === 'TZ' && e.value === 'America/Sao_Paulo') && w.ready('stock-inventory', NS);
      },
    },
    {
      text: { pt: `http://${HOST} responde`, en: `http://${HOST} answers` },
      test: (w) => w.http(`http://${HOST}`).status === 200,
    },
  ],
  solution: [
    { cmd: `helm repo add nimbus ${REPO_URL}`, pt: 'Registra o repositório.', en: 'Registers the repository.' },
    { cmd: 'helm search repo nimbus/inventory --versions', pt: 'Confere as versões disponíveis do chart.', en: 'Checks the available chart versions.' },
    { cmd: 'helm show values nimbus/inventory --version 0.2.0', pt: 'Descobre os nomes dos valores configuráveis.', en: 'Finds the names of the configurable values.' },
    { cmd: `cat >> ~/labs/stock/values.yaml <<EOF\nreplicaCount: 2\nroute:\n  enabled: true\n  host: ${HOST}\nenv:\n  TZ: America/Sao_Paulo\nEOF`, pt: 'Completa o arquivo de valores. No jogo você também pode usar `vi`.', en: 'Completes the values file. In the game you can also use `vi`.' },
    { cmd: 'oc new-project stock', pt: 'Cria o projeto da release.', en: 'Creates the release project.' },
    { cmd: 'helm install stock nimbus/inventory --version 0.2.0 -f ~/labs/stock/values.yaml', pt: 'Instala a release no projeto atual.', en: 'Installs the release in the current project.' },
    { cmd: 'helm list', pt: 'A release aparece como deployed.', en: 'The release shows up as deployed.' },
    { cmd: 'oc rollout status deployment/stock-inventory', pt: 'O nome do deployment vem do chart: release + nome do chart.', en: 'The deployment name comes from the chart: release + chart name.' },
    { cmd: `curl -s http://${HOST}`, pt: 'Confere a route.', en: 'Checks the route.' },
  ],
};
