const NS = 'orders-migration';
const IMG = 'registry.lab.example.com:8443/ubi9/ubi:9.4';
const cond = (j, t) => (j?.status?.conditions || []).some((x) => x.type === t && x.status === 'True');
const comando = (j) => [...(j?.spec.template.spec.containers[0].command || []), ...(j?.spec.template.spec.containers[0].args || [])].join(' ');

export default {
  id: 'c8-job',
  minutes: 20,
  xp: 220,
  difficulty: 2,
  objectives: ['Executar tarefas únicas com jobs', 'Solucionar problemas comuns de contêineres e pods'],
  title: { pt: 'Migração de uma vez só', en: 'A one-time migration' },
  story: {
    pt: 'A noite é de migração: os pedidos antigos vão para o banco novo em três lotes, e o índice de busca precisa ser refeito. São tarefas que rodam uma vez e terminam, nada de deployment. O job do índice já foi tentado e falhou.',
    en: 'Tonight is migration night: the old orders move to the new database in three batches, and the search index must be rebuilt. These tasks run once and finish, no deployment. The index job was already tried and failed.',
  },
  tasks: {
    pt: [
      `No projeto \`orders-migration\`, o job \`reindex\` falhou. Ele deve rodar o comando \`echo reindex ok\` com a imagem \`${IMG}\` e terminar com sucesso, mantendo o nome \`reindex\`.`,
      `Crie o job \`migrate-orders\` com a imagem \`${IMG}\` e o comando \`echo lote migrado\`. Ele deve completar 3 execuções, rodando as 3 ao mesmo tempo, e desistir depois de 2 falhas.`,
      'Os dois jobs devem terminar como `Complete`.',
    ],
    en: [
      `In the \`orders-migration\` project, the \`reindex\` job failed. It must run the \`echo reindex ok\` command with the \`${IMG}\` image and finish successfully, keeping the \`reindex\` name.`,
      `Create the \`migrate-orders\` job with the \`${IMG}\` image and the \`echo lote migrado\` command. It must complete 3 runs, running all 3 at the same time, and give up after 2 failures.`,
      'Both jobs must end up `Complete`.',
    ],
  },
  hints: [
    { pt: 'O template de um job é imutável: para trocar o comando, apague o job e crie de novo com o mesmo nome.', en: 'A job template is immutable: to change the command, delete the job and create it again with the same name.' },
    { pt: '`oc create job` não tem opção para completions; gere o YAML com `--dry-run=client -o yaml`, ajuste e aplique.', en: '`oc create job` has no completions option; generate the YAML with `--dry-run=client -o yaml`, adjust it, and apply it.' },
    { pt: 'Os campos são `spec.completions`, `spec.parallelism` e `spec.backoffLimit` (veja `oc explain job.spec`).', en: 'The fields are `spec.completions`, `spec.parallelism`, and `spec.backoffLimit` (see `oc explain job.spec`).' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    c.create({ kind: 'Job', metadata: { name: 'reindex', namespace: NS }, spec: { backoffLimit: 1, template: { spec: { restartPolicy: 'Never', containers: [{ name: 'reindex', image: IMG, command: ['sh', '-c', 'echo reindexando; exit 3'] }] } } } });
    c.tick(30);
  },
  checks: [
    {
      text: { pt: 'reindex roda echo reindex ok e terminou', en: 'reindex runs echo reindex ok and finished' },
      test: (w) => {
        const j = w.get('Job', 'reindex', NS);
        return cond(j, 'Complete') && comando(j).includes('echo reindex ok');
      },
    },
    {
      text: { pt: 'migrate-orders tem 3 completions em paralelo e backoffLimit 2', en: 'migrate-orders has 3 parallel completions and backoffLimit 2' },
      test: (w) => {
        const s = w.get('Job', 'migrate-orders', NS)?.spec;
        return s?.completions === 3 && s.parallelism === 3 && s.backoffLimit === 2 && s.template.spec.containers[0].image === IMG && comando(w.get('Job', 'migrate-orders', NS)).includes('echo lote migrado');
      },
    },
    {
      text: { pt: 'migrate-orders terminou com 3 sucessos', en: 'migrate-orders finished with 3 successes' },
      test: (w) => {
        const j = w.get('Job', 'migrate-orders', NS);
        return cond(j, 'Complete') && j.status.succeeded === 3;
      },
    },
  ],
  solution: [
    { cmd: 'oc project orders-migration', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get jobs; oc logs job/reindex', pt: '`Failed`: o comando sai com código 3.', en: '`Failed`: the command exits with code 3.' },
    { cmd: 'oc patch job reindex --type json -p \'[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["echo","reindex ok"]}]\'', pt: 'Recusado: o template do job é imutável.', en: 'Refused: the job template is immutable.', falha: true },
    { cmd: 'oc delete job reindex', pt: 'Apaga o job antigo.', en: 'Deletes the old job.' },
    { cmd: `oc create job reindex --image ${IMG} -- echo reindex ok`, pt: 'Recria com o comando certo.', en: 'Recreates it with the right command.' },
    { cmd: `oc create job migrate-orders --image ${IMG} --dry-run=client -o yaml -- echo lote migrado > migrate.yaml`, pt: 'Gera o YAML do job.', en: 'Generates the job YAML.' },
    { cmd: "sed -i 's/^spec:$/spec:\\n  completions: 3\\n  parallelism: 3\\n  backoffLimit: 2/' migrate.yaml", pt: 'Acrescenta os três campos no `spec` do job.', en: 'Adds the three fields to the job `spec`.' },
    { cmd: 'oc apply -f migrate.yaml', pt: 'Cria o job.', en: 'Creates the job.' },
    { cmd: 'sleep 15; oc get jobs', pt: '`reindex` 1/1 e `migrate-orders` 3/3.', en: '`reindex` 1/1 and `migrate-orders` 3/3.' },
  ],
};
