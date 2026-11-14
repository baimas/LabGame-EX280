import yaml from '../../vendor/js-yaml.mjs';
import { deployment, service } from '../../engine/world.js';

const VELHO = 'wiki-legacy';
const NOVO = 'wiki';
const PROIBIDOS = ['uid', 'resourceVersion', 'creationTimestamp', 'namespace'];

// Objetos dos arquivos exportados em ~/wiki (ou null se algum não for YAML válido).
function exportados(w) {
  const dir = '/home/student/wiki';
  if (!w.fs.isDir(dir)) return null;
  const objs = [];
  for (const n of w.fs.ls(dir).filter((x) => /\.ya?ml$/.test(x))) {
    try {
      for (const d of yaml.loadAll(w.fs.read(`${dir}/${n}`))) if (d) objs.push(...(d.kind === 'List' ? d.items || [] : [d]));
    } catch {
      return null;
    }
  }
  return objs;
}
const limpo = (o) => !o.status && PROIBIDOS.every((c) => o.metadata?.[c] === undefined);

export default {
  id: 'c1-exportar',
  minutes: 25,
  xp: 240,
  difficulty: 3,
  objectives: ['Importar, exportar e configurar recursos', 'Trabalhar com manifestos de recursos', 'Implantar aplicações a partir de manifestos YAML'],
  title: { pt: 'Mudança de casa', en: 'Moving house' },
  story: {
    pt: 'A wiki interna foi criada na mão, comando por comando, e ninguém tem os manifestos. O time de Documentação quer versionar tudo no Git e subir uma cópia no projeto novo, com duas réplicas. O projeto antigo continua no ar até a virada.',
    en: 'The internal wiki was created by hand, command by command, and nobody has the manifests. The Documentation team wants everything versioned in Git and a copy running in the new project, with two replicas. The old project stays up until the switch.',
  },
  tasks: {
    pt: [
      'Exporte o config map `wiki-config`, o deployment `wiki` e o service `wiki` do projeto `wiki-legacy` para arquivos YAML em `~/wiki/`.',
      'Os arquivos devem estar prontos para versionar: sem `status` e sem os campos que o cluster preenche (`uid`, `resourceVersion`, `creationTimestamp`) nem `namespace`.',
      'Importe os arquivos no projeto `wiki`, com o deployment em 2 réplicas prontas e o service apontando para os dois pods.',
      'O projeto `wiki-legacy` não pode mudar.',
    ],
    en: [
      'Export the `wiki-config` config map, the `wiki` deployment, and the `wiki` service of the `wiki-legacy` project to YAML files in `~/wiki/`.',
      'The files must be ready for versioning: no `status`, and none of the fields the cluster fills in (`uid`, `resourceVersion`, `creationTimestamp`), nor `namespace`.',
      'Import the files into the `wiki` project, with the deployment at 2 ready replicas and the service pointing to both pods.',
      'The `wiki-legacy` project must not change.',
    ],
  },
  hints: [
    { pt: '`oc get TIPO NOME -o yaml > arquivo` exporta. Tente importar do jeito que saiu e leia os erros: namespace diferente, `resourceVersion` e o IP do service já em uso.', en: '`oc get TYPE NAME -o yaml > file` exports. Try importing it as is and read the errors: a different namespace, `resourceVersion`, and the service IP already in use.' },
    { pt: 'Limpe com o editor (`vi`) ou com `grep -v` e `sed`: `sed \'/^status:/,$d\'` apaga do `status:` até o fim do arquivo.', en: 'Clean up with the editor (`vi`) or with `grep -v` and `sed`: `sed \'/^status:/,$d\'` deletes from `status:` to the end of the file.' },
    { pt: 'No service, tire também `clusterIP` e `clusterIPs`: o cluster dá um IP novo. Depois, `oc apply -f ~/wiki/ -n wiki` importa a pasta inteira.', en: 'In the service, also remove `clusterIP` and `clusterIPs`: the cluster assigns a new IP. Then `oc apply -f ~/wiki/ -n wiki` imports the whole folder.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: VELHO } });
    c.create({ kind: 'Namespace', metadata: { name: NOVO } });
    c.create({ kind: 'ConfigMap', metadata: { name: 'wiki-config', namespace: VELHO }, data: { THEME: 'nimbus-dark', SITE_TITLE: 'Wiki Nimbus' } });
    const d = deployment('wiki', VELHO, 'nimbus/portal:1.1');
    d.spec.template.spec.containers[0].envFrom = [{ configMapRef: { name: 'wiki-config' } }];
    c.create(d);
    c.create(service('wiki', VELHO));
    w.fs.mkdir('/home/student/wiki', true);
    c.tick(10);
    c.side.missao = { velho: c.get('Deployment', 'wiki', VELHO).metadata.uid };
  },
  checks: [
    {
      text: { pt: 'Os três objetos estão exportados em ~/wiki, sem campos do cluster', en: 'The three objects are exported to ~/wiki, without cluster fields' },
      test: (w) => {
        const objs = exportados(w);
        if (!objs) return false;
        const tem = (k, n) => objs.find((o) => o.kind === k && o.metadata?.name === n);
        const tres = [tem('ConfigMap', 'wiki-config'), tem('Deployment', 'wiki'), tem('Service', 'wiki')];
        return tres.every(Boolean) && tres.every(limpo) && !tres[2].spec?.clusterIP && !tres[2].spec?.clusterIPs;
      },
    },
    {
      text: { pt: 'A wiki roda no projeto wiki com 2 réplicas e a configuração', en: 'The wiki runs in the wiki project with 2 replicas and its configuration' },
      test: (w) => w.ready('wiki', NOVO) && w.get('Deployment', 'wiki', NOVO).spec.replicas === 2 && w.get('ConfigMap', 'wiki-config', NOVO)?.data?.THEME === 'nimbus-dark' && (w.get('Endpoints', 'wiki', NOVO)?.subsets || []).reduce((n, x) => n + (x.addresses || []).length, 0) === 2,
    },
    {
      text: { pt: 'O arquivo do deployment pede 2 réplicas', en: 'The deployment file asks for 2 replicas' },
      test: (w) => (exportados(w) || []).some((o) => o.kind === 'Deployment' && o.spec?.replicas === 2),
    },
    {
      text: { pt: 'O projeto wiki-legacy não mudou', en: 'The wiki-legacy project did not change' },
      test: (w) => {
        const d = w.get('Deployment', 'wiki', VELHO);
        return d?.metadata.uid === w.cluster.side.missao.velho && d.spec.replicas === 1 && w.ready('wiki', VELHO) && Boolean(w.get('Service', 'wiki', VELHO));
      },
    },
  ],
  solution: [
    { cmd: 'oc project wiki-legacy', pt: 'Entra no projeto antigo.', en: 'Switches to the old project.' },
    { cmd: 'oc get cm wiki-config -o yaml > ~/wiki/configmap.yaml', pt: 'Exporta o config map.', en: 'Exports the config map.' },
    { cmd: 'oc apply -f ~/wiki/configmap.yaml -n wiki', pt: 'Recusado: o arquivo diz `namespace: wiki-legacy`.', en: 'Refused: the file says `namespace: wiki-legacy`.', falha: true },
    { cmd: "grep -v -E '^ +(uid|resourceVersion|creationTimestamp|namespace):' ~/wiki/configmap.yaml > ~/wiki/cm.tmp; mv ~/wiki/cm.tmp ~/wiki/configmap.yaml", pt: 'Tira os campos que o cluster preenche.', en: 'Removes the fields the cluster fills in.' },
    { cmd: "oc get deployment wiki -o yaml | grep -v -E '^  (uid|resourceVersion|creationTimestamp|namespace|generation):' | sed '/^status:/,$d' > ~/wiki/deployment.yaml", pt: 'Exporta o deployment já limpo, sem o `status`.', en: 'Exports the deployment already clean, without `status`.' },
    { cmd: "sed -i 's/^  replicas: 1$/  replicas: 2/' ~/wiki/deployment.yaml", pt: 'Configura as 2 réplicas no arquivo.', en: 'Configures 2 replicas in the file.' },
    { cmd: "oc get service wiki -o yaml | grep -v -E '^  (uid|resourceVersion|creationTimestamp|namespace):|^  clusterIPs?:|^  - 172\\.30\\.' | sed '/^status:/,$d' > ~/wiki/service.yaml", pt: 'O service sem o IP antigo.', en: 'The service without the old IP.' },
    { cmd: 'oc apply -f ~/wiki/ -n wiki', pt: 'Importa a pasta no projeto novo.', en: 'Imports the folder into the new project.' },
    { cmd: 'sleep 15; oc get deployment,svc,cm -n wiki', pt: '2/2 e o service com IP novo.', en: '2/2 and the service with a new IP.' },
  ],
};
