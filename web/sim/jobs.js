// Controllers de jobs e cron jobs, no relógio simulado.
import { clone, rand } from './util.js';

const donoDe = (filho, pai) => (filho.metadata.ownerReferences || []).some((r) => r.uid === pai.metadata.uid);
const ref = (o) => ({ apiVersion: o.apiVersion, kind: o.kind, name: o.metadata.name, uid: o.metadata.uid, controller: true, blockOwnerDeletion: true });
const cond = (o, tipo) => (o.status?.conditions || []).find((x) => x.type === tipo && x.status === 'True');
export const terminou = (job) => Boolean(cond(job, 'Complete') || cond(job, 'Failed'));

export function jobsCtl(c) {
  for (const job of c.list('Job')) {
    const ns = job.metadata.namespace;
    const st = (job.status ??= {});
    if (terminou(job)) continue;
    st.startTime ??= c.iso();
    const meus = c.list('Pod', ns).filter((p) => donoDe(p, job));
    const ok = meus.filter((p) => p.status?.phase === 'Succeeded').length;
    const falhos = meus.filter((p) => p.status?.phase === 'Failed').length + meus.reduce((n, p) => n + Math.max(0, ...(p.status?.containerStatuses || []).map((x) => x.restartCount || 0)), 0);
    const ativos = meus.filter((p) => !['Succeeded', 'Failed'].includes(p.status?.phase));
    const total = job.spec.completions ?? 1;
    const paralelo = job.spec.parallelism ?? 1;
    const limite = job.spec.backoffLimit ?? 6;
    Object.assign(st, { active: ativos.length || undefined, succeeded: ok || undefined, failed: falhos || undefined, ready: ativos.length ? 0 : undefined });
    if (ok >= total) {
      st.completionTime = c.iso();
      delete st.active;
      st.conditions = [{ type: 'SuccessCriteriaMet', status: 'True' }, { type: 'Complete', status: 'True', lastTransitionTime: c.iso() }];
      c.event(job, 'Normal', 'Completed', 'Job completed', 'job-controller');
      continue;
    }
    if (falhos > limite) {
      for (const p of ativos) c.delete('Pod', p.metadata.name, ns);
      delete st.active;
      st.conditions = [{ type: 'FailureTarget', status: 'True' }, { type: 'Failed', status: 'True', reason: 'BackoffLimitExceeded', message: 'Job has reached the specified backoff limit', lastTransitionTime: c.iso() }];
      c.event(job, 'Warning', 'BackoffLimitExceeded', 'Job has reached the specified backoff limit', 'job-controller');
      continue;
    }
    let ativosN = ativos.length;
    while (ativosN < paralelo && ok + ativosN < total) {
      const tpl = job.spec.template;
      const nome = `${job.metadata.name}-${rand(5)}`;
      const rotulos = { ...(tpl.metadata?.labels || {}), 'batch.kubernetes.io/job-name': job.metadata.name, 'job-name': job.metadata.name, 'batch.kubernetes.io/controller-uid': job.metadata.uid, 'controller-uid': job.metadata.uid };
      try {
        c.create({ kind: 'Pod', metadata: { name: nome, namespace: ns, labels: rotulos, annotations: clone(tpl.metadata?.annotations), ownerReferences: [ref(job)] }, spec: clone(tpl.spec) });
      } catch (e) {
        if (!e.reason) throw e;
        c.event(job, 'Warning', 'FailedCreate', `Error creating: ${e.message.replace(/^Error from server \([A-Za-z]+\): /, '')}`, 'job-controller');
        break;
      }
      c.event(job, 'Normal', 'SuccessfulCreate', `Created pod: ${nome}`, 'job-controller');
      ativosN++;
    }
  }
}

// --------------------------------------------------------------- cron

function campo(txt, min, max) {
  const valores = new Set();
  for (const parte of String(txt).split(',')) {
    const [faixa, passoTxt] = parte.split('/');
    const passo = passoTxt === undefined ? 1 : Number(passoTxt);
    let ini = min;
    let fim = max;
    if (faixa !== '*') {
      const [a, b] = faixa.split('-').map(Number);
      ini = a;
      fim = b ?? (passoTxt === undefined ? a : max);
    }
    if (![ini, fim, passo].every(Number.isInteger) || passo < 1 || ini < min || fim > max || ini > fim) return null;
    for (let v = ini; v <= fim; v += passo) valores.add(v);
  }
  return valores;
}

const APELIDOS = { '@hourly': '0 * * * *', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@weekly': '0 0 * * 0', '@monthly': '0 0 1 * *', '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *' };

// Interpreta uma expressão cron de 5 campos. Devolve null se for inválida.
export function cron(expr) {
  const partes = (APELIDOS[String(expr).trim()] || String(expr)).trim().split(/\s+/);
  if (partes.length !== 5) return null;
  const limites = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const conj = partes.map((p, i) => campo(p.replace(/^\?$/, '*'), ...limites[i]));
  if (conj.some((x) => !x)) return null;
  const [mi, h, dia, mes, sem] = conj;
  return (t) => {
    const d = new Date(t * 1000);
    return mi.has(d.getUTCMinutes()) && h.has(d.getUTCHours()) && dia.has(d.getUTCDate()) && mes.has(d.getUTCMonth() + 1) && sem.has(d.getUTCDay());
  };
}

// Job criado a partir de um cron job (pelo controller ou por `oc create job --from`).
export function jobDoCron(cj, nome, manual = false) {
  const tpl = clone(cj.spec.jobTemplate || {});
  return {
    kind: 'Job',
    metadata: { name: nome, namespace: cj.metadata.namespace, labels: tpl.metadata?.labels, annotations: { ...(tpl.metadata?.annotations || {}), ...(manual ? { 'cronjob.kubernetes.io/instantiate': 'manual' } : { 'batch.kubernetes.io/cronjob-scheduled-timestamp': '' }) }, ownerReferences: [{ ...ref(cj), ...(manual ? { controller: false } : {}) }] },
    spec: tpl.spec,
  };
}

export function cronCtl(c) {
  for (const cj of c.list('CronJob')) {
    const ns = cj.metadata.namespace;
    const st = (c.side[cj.metadata.uid] ??= {});
    const casa = cron(cj.spec.schedule);
    const agora = Math.floor(c.now / 60) * 60;
    st.ultimo ??= Math.floor(Date.parse(cj.metadata.creationTimestamp) / 60000) * 60;
    const meus = () => c.list('Job', ns).filter((j) => donoDe(j, cj) && j.metadata.annotations?.['cronjob.kubernetes.io/instantiate'] !== 'manual');
    if (casa && !cj.spec.suspend && agora > st.ultimo) {
      // Só a execução mais recente que passou é disparada.
      let hora = null;
      for (let t = agora; t > st.ultimo && t > agora - 86400; t -= 60) {
        if (casa(t)) {
          hora = t;
          break;
        }
      }
      if (hora !== null) {
        const ativos = meus().filter((j) => !terminou(j));
        const politica = cj.spec.concurrencyPolicy || 'Allow';
        if (politica === 'Forbid' && ativos.length) c.event(cj, 'Normal', 'JobAlreadyActive', 'Not starting job because prior execution is running and concurrency policy is Forbid', 'cronjob-controller');
        else {
          if (politica === 'Replace') for (const j of ativos) c.delete('Job', j.metadata.name, ns);
          const nome = `${cj.metadata.name}-${Math.floor(hora / 60)}`;
          if (!c.get('Job', nome, ns)) {
            const j = jobDoCron(cj, nome);
            j.metadata.annotations['batch.kubernetes.io/cronjob-scheduled-timestamp'] = new Date(hora * 1000).toISOString().replace('.000Z', 'Z');
            c.create(j);
            c.event(cj, 'Normal', 'SuccessfulCreate', `Created job ${nome}`, 'cronjob-controller');
          }
          (cj.status ??= {}).lastScheduleTime = new Date(hora * 1000).toISOString().replace('.000Z', 'Z');
        }
      }
      st.ultimo = agora;
    }
    // Histórico: mantém os N mais recentes de cada resultado.
    const todos = meus().sort((a, b) => Date.parse(a.metadata.creationTimestamp) - Date.parse(b.metadata.creationTimestamp) || a.metadata.name.localeCompare(b.metadata.name));
    const poda = (lista, n) => {
      for (const j of lista.slice(0, Math.max(0, lista.length - n))) c.delete('Job', j.metadata.name, ns);
    };
    poda(todos.filter((j) => cond(j, 'Complete')), cj.spec.successfulJobsHistoryLimit ?? 3);
    poda(todos.filter((j) => cond(j, 'Failed')), cj.spec.failedJobsHistoryLimit ?? 1);
    const ativos = meus().filter((j) => !terminou(j));
    cj.status ??= {};
    if (ativos.length) cj.status.active = ativos.map((j) => ({ apiVersion: 'batch/v1', kind: 'Job', name: j.metadata.name, namespace: ns, uid: j.metadata.uid }));
    else delete cj.status.active;
    const sucesso = todos.filter((j) => cond(j, 'Complete')).at(-1);
    if (sucesso) cj.status.lastSuccessfulTime = sucesso.status.completionTime;
  }
}
