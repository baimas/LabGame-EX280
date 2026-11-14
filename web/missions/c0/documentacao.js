import { deployment } from '../../engine/world.js';

const NS = 'manual';

export default {
  id: 'c0-documentacao',
  minutes: 15,
  xp: 160,
  difficulty: 1,
  objectives: ['Usar a documentação do produto', 'Usar a CLI para gerenciar o cluster'],
  title: { pt: 'Só o manual', en: 'Just the manual' },
  story: {
    pt: 'Na prova não há internet, só a documentação do produto e a ajuda embutida no `oc`. Hoje o seu mentor tirou o navegador da sua frente: tudo tem de sair de `oc explain` e de `--help`.',
    en: 'In the exam there is no internet, only the product documentation and the help built into `oc`. Today your mentor took the browser away: everything has to come from `oc explain` and `--help`.',
  },
  tasks: {
    pt: [
      'O deployment `docs-portal`, no projeto `manual`, deve guardar no máximo 3 replica sets antigos para rollback. Descubra o campo e configure-o.',
      'Grave em `~/manual/campo.txt` o caminho completo, a partir de `spec`, do campo de um Job que define quantas vezes ele tenta de novo antes de falhar (formato `spec.campo`).',
      'Grave em `~/manual/padrao.txt` só o valor padrão desse campo.',
      'Grave em `~/manual/flag.txt` a opção do `oc create cronjob` que define quando o cron job roda (formato `--opcao`).',
    ],
    en: [
      'The `docs-portal` deployment, in the `manual` project, must keep at most 3 old replica sets for rollback. Find the field and configure it.',
      'Write to `~/manual/campo.txt` the full path, from `spec`, of the Job field that sets how many times it retries before failing (`spec.field` format).',
      'Write to `~/manual/padrao.txt` only the default value of that field.',
      'Write to `~/manual/flag.txt` the `oc create cronjob` option that sets when the cron job runs (`--option` format).',
    ],
  },
  hints: [
    { pt: '`oc explain deployment.spec` lista os campos com a descrição; procure por "rollback".', en: '`oc explain deployment.spec` lists the fields with descriptions; look for "rollback".' },
    { pt: '`oc explain job.spec` mostra a descrição de cada campo, com o valor padrão quando houver.', en: '`oc explain job.spec` shows each field description, with the default value when there is one.' },
    { pt: '`oc create cronjob --help` mostra exemplos e opções.', en: '`oc create cronjob --help` shows examples and options.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('docs-portal', NS, 'nimbus/portal:1.1'));
    w.fs.mkdir('/home/student/manual', true);
  },
  checks: [
    {
      text: { pt: 'docs-portal guarda 3 replica sets antigos', en: 'docs-portal keeps 3 old replica sets' },
      test: (w) => w.get('Deployment', 'docs-portal', NS)?.spec?.revisionHistoryLimit === 3,
    },
    {
      text: { pt: 'campo.txt e padrao.txt: spec.backoffLimit, padrão 6', en: 'campo.txt and padrao.txt: spec.backoffLimit, default 6' },
      test: (w) => w.file('manual/campo.txt') === 'spec.backoffLimit' && w.file('manual/padrao.txt') === '6',
    },
    {
      text: { pt: 'flag.txt: --schedule', en: 'flag.txt: --schedule' },
      test: (w) => w.file('manual/flag.txt') === '--schedule',
    },
  ],
  solution: [
    { cmd: 'oc explain deployment.spec | grep -A2 revisionHistoryLimit', pt: '"The number of old ReplicaSets to retain to allow rollback."', en: '"The number of old ReplicaSets to retain to allow rollback."' },
    { cmd: 'oc patch deployment docs-portal -n manual -p \'{"spec":{"revisionHistoryLimit":3}}\'', pt: 'Configura o campo.', en: 'Sets the field.' },
    { cmd: 'oc explain job.spec | grep -A2 backoffLimit', pt: 'Número de tentativas antes de falhar; padrão 6.', en: 'Number of retries before failing; default 6.' },
    { cmd: 'echo spec.backoffLimit > ~/manual/campo.txt; echo 6 > ~/manual/padrao.txt', pt: 'Grava as respostas.', en: 'Writes the answers.' },
    { cmd: 'oc create cronjob --help | grep schedule', pt: 'A opção `--schedule`.', en: 'The `--schedule` option.' },
    { cmd: 'echo --schedule > ~/manual/flag.txt', pt: 'Grava a opção.', en: 'Writes the option.' },
  ],
};
