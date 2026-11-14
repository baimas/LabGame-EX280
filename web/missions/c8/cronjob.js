import { cron } from '../../sim/jobs.js';

const NS = 'finance-batch';
const IMG = 'registry.ocp4.example.com:8443/ubi9/ubi:9.4';
const MSG = 'faturas conciliadas';

const conteiner = (o) => o?.spec?.jobTemplate?.spec?.template?.spec?.containers?.[0];
const juntos = (ct) => [...(ct?.command || []), ...(ct?.args || [])].join(' ');

export default {
  id: 'c8-cronjob',
  minutes: 25,
  xp: 240,
  difficulty: 2,
  objectives: ['Agendar tarefas com jobs e cron jobs', 'Usar a CLI para gerenciar o cluster'],
  title: { pt: 'A conciliação da madrugada', en: 'The overnight reconciliation' },
  story: {
    pt: 'O Financeiro concilia as faturas todo dia útil, às 2h da manhã, com um script que roda num servidor esquecido embaixo de uma mesa. A tarefa vai para o cluster. Hoje, excepcionalmente, a conciliação precisa rodar já.',
    en: 'Finance reconciles invoices every business day at 2 AM, with a script running on a forgotten server under a desk. The task moves to the cluster. Today, exceptionally, the reconciliation must run right now.',
  },
  tasks: {
    pt: [
      `No projeto \`finance-batch\`, crie o cron job \`reconcile\` com a imagem \`${IMG}\`, rodando o comando \`echo ${MSG}\`.`,
      'Ele deve rodar às 2h00, de segunda a sexta (horário do cluster).',
      'Guarde o histórico de só 2 execuções bem-sucedidas, e uma execução nunca pode começar enquanto a anterior ainda roda.',
      'Rode agora, uma vez, um job `reconcile-now` a partir do cron job, e grave em `~/finance/saida.txt` o log dele.',
    ],
    en: [
      `In the \`finance-batch\` project, create the \`reconcile\` cron job with the \`${IMG}\` image, running the \`echo ${MSG}\` command.`,
      'It must run at 2:00 AM, Monday to Friday (cluster time).',
      'Keep the history of only 2 successful runs, and a run may never start while the previous one is still running.',
      'Run now, once, a `reconcile-now` job from the cron job, and write its log to `~/finance/saida.txt`.',
    ],
  },
  hints: [
    { pt: '`oc create cronjob NOME --image IMG --schedule \'MIN HORA DIA MÊS DIA-DA-SEMANA\' -- COMANDO`. Segunda a sexta é `1-5` no último campo.', en: '`oc create cronjob NAME --image IMG --schedule \'MIN HOUR DAY MONTH WEEKDAY\' -- COMMAND`. Monday to Friday is `1-5` in the last field.' },
    { pt: 'O histórico e a concorrência ficam em `spec.successfulJobsHistoryLimit` e `spec.concurrencyPolicy` (`Forbid`). Ajuste com `oc patch` ou `oc edit`.', en: 'History and concurrency live in `spec.successfulJobsHistoryLimit` and `spec.concurrencyPolicy` (`Forbid`). Adjust them with `oc patch` or `oc edit`.' },
    { pt: '`oc create job NOME --from cronjob/reconcile` dispara uma execução fora do horário; `oc logs job/NOME` mostra a saída.', en: '`oc create job NAME --from cronjob/reconcile` triggers an off-schedule run; `oc logs job/NAME` shows the output.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.fs.mkdir('/home/student/finance', true);
  },
  checks: [
    {
      text: { pt: 'reconcile roda a imagem e o comando pedidos', en: 'reconcile runs the requested image and command' },
      test: (w) => {
        const ct = conteiner(w.get('CronJob', 'reconcile', NS));
        return ct?.image === IMG && juntos(ct).includes(`echo ${MSG}`);
      },
    },
    {
      text: { pt: 'O agendamento é 2h00, de segunda a sexta', en: 'The schedule is 2:00 AM, Monday to Friday' },
      test: (w) => {
        const casa = cron(w.get('CronJob', 'reconcile', NS)?.spec?.schedule || '');
        if (!casa) return false;
        // Semana de 2 a 8 de novembro de 2026 (segunda a domingo), minuto a minuto.
        const ini = Date.UTC(2026, 10, 2) / 1000;
        const horas = [];
        for (let t = ini; t < ini + 7 * 86400; t += 60) if (casa(t)) horas.push(t);
        return horas.length === 5 && horas.every((t, i) => t === ini + i * 86400 + 2 * 3600);
      },
    },
    {
      text: { pt: 'Histórico de 2 sucessos e concorrência proibida', en: 'History of 2 successes and concurrency forbidden' },
      test: (w) => {
        const s = w.get('CronJob', 'reconcile', NS)?.spec;
        return s?.successfulJobsHistoryLimit === 2 && s?.concurrencyPolicy === 'Forbid';
      },
    },
    {
      text: { pt: 'reconcile-now terminou e o log foi gravado', en: 'reconcile-now finished and its log was saved' },
      test: (w) => {
        const j = w.get('Job', 'reconcile-now', NS);
        return Boolean((j?.status?.conditions || []).some((x) => x.type === 'Complete' && x.status === 'True')) && j.metadata.annotations?.['cronjob.kubernetes.io/instantiate'] === 'manual' && w.file('finance/saida.txt') === MSG;
      },
    },
  ],
  solution: [
    { cmd: 'oc project finance-batch', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc create cronjob reconcile --image ${IMG} --schedule '0 2 * * 1-5' -- echo ${MSG}`, pt: 'Minuto 0, hora 2, segunda a sexta.', en: 'Minute 0, hour 2, Monday to Friday.' },
    { cmd: 'oc patch cronjob reconcile -p \'{"spec":{"successfulJobsHistoryLimit":2,"concurrencyPolicy":"Forbid"}}\'', pt: 'Histórico e concorrência.', en: 'History and concurrency.' },
    { cmd: 'oc get cronjob reconcile', pt: 'Ainda sem execução: `LAST SCHEDULE` em `<none>`.', en: 'No run yet: `LAST SCHEDULE` is `<none>`.' },
    { cmd: 'oc create job reconcile-now --from cronjob/reconcile', pt: 'Uma execução agora, com o mesmo template.', en: 'A run right now, with the same template.' },
    { cmd: 'sleep 10; oc get job reconcile-now', pt: '`Complete`, 1/1.', en: '`Complete`, 1/1.' },
    { cmd: 'oc logs job/reconcile-now > ~/finance/saida.txt', pt: 'Grava a saída.', en: 'Writes the output.' },
    { cmd: 'cat ~/finance/saida.txt', pt: 'A mensagem do script.', en: 'The script message.' },
  ],
};
