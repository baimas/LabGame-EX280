// Consumo de CPU e memória dos pods e o HorizontalPodAutoscaler.
// A carga vem de pods geradores (imagem nimbus/loadgen) que chamam um service:
// cada gerador rodando soma LOAD_MILLICORES (padrão 600m), dividido entre os
// pods prontos do service. O HPA recalcula a cada 15 s e só reduz depois de
// 5 minutos de recomendação menor, como o padrão do Kubernetes.
import { findImage } from './images.js';
import { parseCpu, parseMem, hashNum, matchLabels } from './util.js';
import { podPronto, resolveEnv } from './controllers.js';

const PERIODO = 15;
const ESTABILIZA = 300;

// Carga (em milicores) que chega a cada pod pronto, vinda dos geradores.
function cargas(c) {
  const mapa = new Map();
  for (const g of c.list('Pod')) {
    if (g.status?.phase !== 'Running' || !findImage(g.spec.containers[0].image).image?.loadgen) continue;
    const env = resolveEnv(c, g, g.spec.containers[0]).env;
    const alvo = String(env.TARGET_URL || '').replace(/^https?:\/\//, '').split(/[:/]/)[0];
    const [svcNome, svcNs = g.metadata.namespace] = alvo.split('.');
    const svc = c.get('Service', svcNome, svcNs);
    if (!svc?.spec.selector) continue;
    const pods = c.list('Pod', svcNs).filter((p) => podPronto(p) && matchLabels(p.metadata.labels, svc.spec.selector));
    const total = Number(env.LOAD_MILLICORES || 600);
    for (const p of pods) mapa.set(p.metadata.uid, (mapa.get(p.metadata.uid) || 0) + total / pods.length);
  }
  return mapa;
}

// Uso atual de um pod: { cpu (milicores), mem (bytes) }.
export function usoPod(c, p, mapa = cargas(c)) {
  let cpu = 0;
  let mem = 0;
  for (const ct of p.spec.containers) {
    const img = findImage(ct.image).image || {};
    cpu += img.cpu ?? 2 + (hashNum(p.metadata.name + ct.name) % 6);
    mem += parseMem(img.mem || `${40 + (hashNum(p.metadata.uid + ct.name) % 90)}Mi`);
  }
  cpu += mapa.get(p.metadata.uid) || 0;
  return { cpu: Math.round(cpu), mem };
}

const alvoDe = (c, h) => {
  const r = h.spec.scaleTargetRef || {};
  return ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(r.kind) ? c.get(r.kind, r.name, h.metadata.namespace) : null;
};

const podsDoAlvo = (c, alvo) => c.list('Pod', alvo.metadata.namespace).filter((p) => matchLabels(p.metadata.labels, alvo.spec.selector) && !['Succeeded', 'Failed'].includes(p.status?.phase));

export function hpaCtl(c) {
  const mapa = cargas(c);
  for (const h of c.list('HorizontalPodAutoscaler')) {
    const st = (c.side[h.metadata.uid] ??= { ev: {} });
    const alvo = alvoDe(c, h);
    const min = h.spec.minReplicas ?? 1;
    const max = h.spec.maxReplicas;
    const metrica = (h.spec.metrics || []).find((m) => m.type === 'Resource') || { resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } } };
    const recurso = metrica.resource.name;
    const meta = metrica.resource.target.averageUtilization;
    const condicoes = [];
    const agora = c.iso();
    if (!alvo) {
      h.status = { currentReplicas: 0, desiredReplicas: 0, conditions: [{ type: 'AbleToScale', status: 'False', reason: 'FailedGetScale', message: `the HPA controller was unable to get the target's current scale: ${(h.spec.scaleTargetRef?.kind || '').toLowerCase()}s.apps "${h.spec.scaleTargetRef?.name}" not found`, lastTransitionTime: agora }] };
      continue;
    }
    const pods = podsDoAlvo(c, alvo);
    const prontos = pods.filter(podPronto);
    const atual = alvo.spec.replicas ?? 1;
    // Todos os contêineres precisam de request do recurso medido.
    const semRequest = pods.flatMap((p) => p.spec.containers.filter((ct) => !ct.resources?.requests?.[recurso]).map((ct) => [p, ct]))[0];
    let desejado = atual;
    let utilizacao = null;
    if (semRequest) {
      const msg = `the HPA was unable to compute the replica count: failed to get ${recurso} utilization: missing request for ${recurso} in container ${semRequest[1].name} of Pod ${semRequest[0].metadata.name}`;
      if (!st.ev.semRequest) {
        st.ev.semRequest = 1;
        c.event(h, 'Warning', 'FailedGetResourceMetric', `failed to get ${recurso} utilization: missing request for ${recurso} in container ${semRequest[1].name} of Pod ${semRequest[0].metadata.name}`, 'horizontal-pod-autoscaler');
      }
      condicoes.push({ type: 'AbleToScale', status: 'True', reason: 'SucceededGetScale', message: "the HPA controller was able to get the target's current scale" });
      condicoes.push({ type: 'ScalingActive', status: 'False', reason: 'FailedGetResourceMetric', message: msg });
    } else if (prontos.length) {
      delete st.ev.semRequest;
      let soma = 0;
      for (const p of prontos) {
        const u = usoPod(c, p, mapa);
        const req = p.spec.containers.reduce((n, ct) => n + (recurso === 'cpu' ? parseCpu(ct.resources.requests.cpu) : parseMem(ct.resources.requests.memory)), 0);
        soma += ((recurso === 'cpu' ? u.cpu / 1000 : u.mem) / req) * 100;
      }
      utilizacao = Math.round(soma / prontos.length);
      const razao = utilizacao / meta;
      // Tolerância de 10%, como no controller real.
      const sugerido = Math.abs(razao - 1) <= 0.1 ? atual : Math.ceil(prontos.length * razao);
      desejado = Math.min(max, Math.max(min, sugerido));
      condicoes.push({ type: 'AbleToScale', status: 'True', reason: 'ReadyForNewScale', message: 'recommended size matches current size' });
      condicoes.push({ type: 'ScalingActive', status: 'True', reason: 'ValidMetricFound', message: `the HPA was able to successfully calculate a replica count from ${recurso} resource utilization (percentage of request)` });
      if (sugerido > max || sugerido < min) condicoes.push({ type: 'ScalingLimited', status: 'True', reason: sugerido > max ? 'TooManyReplicas' : 'TooFewReplicas', message: `the desired replica count is ${sugerido > max ? 'more than the maximum' : 'less than the minimum'} replica count` });
      else condicoes.push({ type: 'ScalingLimited', status: 'False', reason: 'DesiredWithinRange', message: 'the desired count is within the acceptable range' });
    }
    if (atual < min) desejado = min;
    if (atual > max) desejado = max;

    // Respeita o período do controller e a janela de estabilização para reduzir.
    const pode = st.ultimo === undefined || c.now - st.ultimo >= PERIODO;
    if (desejado < atual) {
      st.abaixoDesde ??= c.now;
      if (c.now - st.abaixoDesde < ESTABILIZA && atual <= max) desejado = atual;
    } else delete st.abaixoDesde;
    if (pode && desejado !== atual) {
      const o = alvo;
      o.spec.replicas = desejado;
      c.event(h, 'Normal', 'SuccessfulRescale', `New size: ${desejado}; reason: ${desejado > atual ? (atual < min ? 'Current number of replicas below Spec.MinReplicas' : `${recurso} resource utilization (percentage of request) above target`) : atual > max ? 'Current number of replicas above Spec.MaxReplicas' : 'All metrics below target'}`, 'horizontal-pod-autoscaler');
      st.ultimo = c.now;
      h.status = { ...h.status, lastScaleTime: agora };
    }
    h.status = {
      ...(h.status?.lastScaleTime ? { lastScaleTime: h.status.lastScaleTime } : {}),
      currentReplicas: atual,
      desiredReplicas: desejado,
      currentMetrics: utilizacao === null ? [] : [{ type: 'Resource', resource: { name: recurso, current: { averageUtilization: utilizacao, ...(recurso === 'cpu' ? { averageValue: `${Math.round(prontos.reduce((n, p) => n + usoPod(c, p, mapa).cpu, 0) / prontos.length)}m` } : {}) } } }],
      conditions: condicoes.map((x) => ({ ...x, lastTransitionTime: agora })),
    };
  }
}

// Padrões do servidor para um HPA.
export function padroesHpa(o) {
  o.spec.minReplicas ??= 1;
  o.spec.behavior ??= {
    scaleDown: { policies: [{ periodSeconds: 15, type: 'Percent', value: 100 }], selectPolicy: 'Max', stabilizationWindowSeconds: 300 },
    scaleUp: { policies: [{ periodSeconds: 15, type: 'Pods', value: 4 }, { periodSeconds: 15, type: 'Percent', value: 100 }], selectPolicy: 'Max', stabilizationWindowSeconds: 0 },
  };
}
