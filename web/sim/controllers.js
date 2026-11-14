// Controllers do cluster simulado: deployment → replicaset → pod, e o ciclo
// de vida dos pods (agendamento, pull de imagem, configuração, execução).
import { clone, rand, hashId, matchLabels, parseCpu, parseMem, b64 } from './util.js';
import { findImage } from './images.js';

export function reconcile(c) {
  for (let i = 0; i < 4; i++) {
    deployments(c);
    replicasets(c);
    pods(c);
  }
  deployments(c);
  endpointsCtl(c);
}

// Mantém um objeto Endpoints por service, com os pods prontos e não prontos.
function endpointsCtl(c) {
  const servicos = new Set();
  for (const svc of c.list('Service')) {
    if (svc.spec.type === 'ExternalName') continue;
    const ns = svc.metadata.namespace;
    servicos.add(`${ns}/${svc.metadata.name}`);
    const selecionados = svc.spec.selector ? c.list('Pod', ns).filter((p) => p.status?.podIP && p.status.phase === 'Running' && matchLabels(p.metadata.labels, svc.spec.selector)) : [];
    const endereco = (p) => ({ ip: p.status.podIP, nodeName: p.spec.nodeName, targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns, uid: p.metadata.uid } });
    const portas = (svc.spec.ports || []).map((sp) => {
      let porta = sp.targetPort;
      if (typeof porta === 'string' && !/^\d+$/.test(porta)) porta = selecionados[0]?.spec.containers.flatMap((x) => x.ports || []).find((x) => x.name === porta)?.containerPort;
      return { ...(sp.name ? { name: sp.name } : {}), port: Number(porta), protocol: sp.protocol || 'TCP' };
    }).filter((p) => p.port);
    const prontos = selecionados.filter(podPronto).map(endereco);
    const naoProntos = selecionados.filter((p) => !podPronto(p)).map(endereco);
    const subsets = prontos.length || naoProntos.length ? [{ ...(prontos.length ? { addresses: prontos } : {}), ...(naoProntos.length ? { notReadyAddresses: naoProntos } : {}), ports: portas }] : [];
    const atual = c.get('Endpoints', svc.metadata.name, ns);
    if (!atual) c.create({ kind: 'Endpoints', metadata: { name: svc.metadata.name, namespace: ns, labels: clone(svc.metadata.labels) }, subsets });
    else if (JSON.stringify(atual.subsets || []) !== JSON.stringify(subsets)) {
      atual.subsets = subsets;
      atual.metadata.resourceVersion = String(1000 + c.seq++);
    }
  }
  for (const ep of c.list('Endpoints')) {
    if (!servicos.has(`${ep.metadata.namespace}/${ep.metadata.name}`)) c.objs.delete(`Endpoints/${ep.metadata.namespace}/${ep.metadata.name}`);
  }
}

const donoDe = (filho, pai) => (filho.metadata.ownerReferences || []).some((r) => r.uid === pai.metadata.uid);
const ref = (o) => ({ apiVersion: o.apiVersion, kind: o.kind, name: o.metadata.name, uid: o.metadata.uid, controller: true, blockOwnerDeletion: true });
export const podPronto = (p) => (p.status?.conditions || []).some((x) => x.type === 'Ready' && x.status === 'True');
const REV = 'deployment.kubernetes.io/revision';
const rev = (o) => Number(o.metadata.annotations?.[REV] || 0);

function deployments(c) {
  for (const d of c.list('Deployment')) {
    const ns = d.metadata.namespace;
    const hash = hashId(JSON.stringify(d.spec.template));
    const meus = c.list('ReplicaSet', ns).filter((r) => donoDe(r, d));
    const maior = Math.max(0, ...meus.map(rev));
    let atual = meus.find((r) => r.metadata.labels?.['pod-template-hash'] === hash);
    // Deployment pausado: mudanças no template esperam o `oc rollout resume`.
    if (!atual && d.spec.paused && meus.length) atual = meus.reduce((a, b) => (rev(b) > rev(a) ? b : a));
    if (!atual) {
      const tpl = clone(d.spec.template);
      tpl.metadata ??= {};
      tpl.metadata.labels = { ...tpl.metadata.labels, 'pod-template-hash': hash };
      atual = c.create({
        kind: 'ReplicaSet',
        metadata: {
          name: `${d.metadata.name}-${hash}`,
          namespace: ns,
          labels: tpl.metadata.labels,
          annotations: { [REV]: String(maior + 1) },
          ownerReferences: [ref(d)],
        },
        spec: { replicas: 0, selector: { matchLabels: { ...d.spec.selector.matchLabels, 'pod-template-hash': hash } }, template: tpl },
      });
      meus.push(atual);
      c.event(d, 'Normal', 'ScalingReplicaSet', `Scaled up replica set ${atual.metadata.name} from 0 to ${d.spec.replicas}`, 'deployment-controller');
    } else if (rev(atual) < maior) {
      atual.metadata.annotations[REV] = String(maior + 1);
    }
    (d.metadata.annotations ??= {})[REV] = String(rev(atual));
    atual.spec.replicas = d.spec.replicas;

    const novoPronto = (atual.status?.readyReplicas || 0) >= d.spec.replicas || d.spec.strategy?.type === 'Recreate';
    for (const velho of meus) {
      if (velho !== atual && velho.spec.replicas > 0 && novoPronto) {
        c.event(d, 'Normal', 'ScalingReplicaSet', `Scaled down replica set ${velho.metadata.name} from ${velho.spec.replicas} to 0`, 'deployment-controller');
        velho.spec.replicas = 0;
      }
    }

    const todos = c.list('Pod', ns).filter((p) => meus.some((r) => donoDe(p, r)));
    const prontos = todos.filter(podPronto).length;
    const desejado = d.spec.replicas;
    const minimo = desejado - Math.floor(desejado * 0.25);
    d.status = {
      observedGeneration: d.metadata.generation,
      replicas: todos.length,
      updatedReplicas: todos.filter((p) => donoDe(p, atual)).length,
      readyReplicas: prontos,
      availableReplicas: prontos,
      unavailableReplicas: Math.max(0, desejado - prontos),
      conditions: [
        prontos >= minimo
          ? { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable', message: 'Deployment has minimum availability.' }
          : { type: 'Available', status: 'False', reason: 'MinimumReplicasUnavailable', message: 'Deployment does not have minimum availability.' },
        { type: 'Progressing', status: 'True', reason: prontos >= desejado ? 'NewReplicaSetAvailable' : 'ReplicaSetUpdated', message: `ReplicaSet "${atual.metadata.name}" ${prontos >= desejado ? 'has successfully progressed.' : 'is progressing.'}` },
      ],
    };
  }
}

const temControlador = (p) => (p.metadata.ownerReferences || []).some((r) => r.controller);

function replicasets(c) {
  for (const rs of c.list('ReplicaSet')) {
    const ns = rs.metadata.namespace;
    const sel = rs.spec.selector;
    // Como no Kubernetes, o replica set solta os pods que deixaram de casar
    // com o seletor e adota pods órfãos que passaram a casar.
    for (const p of c.list('Pod', ns)) {
      const casa = matchLabels(p.metadata.labels || {}, sel);
      if (donoDe(p, rs) && !casa) {
        p.metadata.ownerReferences = p.metadata.ownerReferences.filter((r) => r.uid !== rs.metadata.uid);
        if (!p.metadata.ownerReferences.length) delete p.metadata.ownerReferences;
      } else if (!temControlador(p) && casa && !['Succeeded', 'Failed'].includes(p.status?.phase)) {
        p.metadata.ownerReferences = [...(p.metadata.ownerReferences || []), ref(rs)];
      }
    }
    let meus = c.list('Pod', ns).filter((p) => donoDe(p, rs));
    while (meus.length < rs.spec.replicas) {
      const tpl = rs.spec.template;
      const p = c.create({
        kind: 'Pod',
        metadata: {
          name: `${rs.metadata.name}-${rand(5)}`,
          namespace: ns,
          labels: clone(tpl.metadata?.labels || {}),
          annotations: clone(tpl.metadata?.annotations),
          ownerReferences: [ref(rs)],
        },
        spec: clone(tpl.spec),
      });
      c.event(rs, 'Normal', 'SuccessfulCreate', `Created pod: ${p.metadata.name}`, 'replicaset-controller');
      meus.push(p);
    }
    if (meus.length > rs.spec.replicas) {
      // Remove primeiro os pods que não estão prontos.
      const ordem = [...meus].sort((a, b) => Number(podPronto(a)) - Number(podPronto(b)));
      for (const p of ordem.slice(0, meus.length - rs.spec.replicas)) {
        c.delete('Pod', p.metadata.name, ns);
        c.event(rs, 'Normal', 'SuccessfulDelete', `Deleted pod: ${p.metadata.name}`, 'replicaset-controller');
      }
      meus = c.list('Pod', ns).filter((p) => donoDe(p, rs));
    }
    const prontos = meus.filter(podPronto).length;
    rs.status = { replicas: meus.length, readyReplicas: prontos, availableReplicas: prontos, fullyLabeledReplicas: meus.length };
  }
}

// Resolve as variáveis de ambiente de um contêiner, incluindo referências a
// config maps e secrets. Devolve {env, error}.
export function resolveEnv(c, pod, ct) {
  const ns = pod.metadata.namespace;
  const env = {};
  for (const fonte of ct.envFrom || []) {
    const [tipo, r] = fonte.configMapRef ? ['ConfigMap', fonte.configMapRef] : ['Secret', fonte.secretRef || {}];
    const o = c.get(tipo, r.name, ns);
    if (!o) {
      if (r.optional) continue;
      return { env, error: `${tipo.toLowerCase()} "${r.name}" not found` };
    }
    for (const [k, v] of Object.entries(o.data || {})) env[(fonte.prefix || '') + k] = tipo === 'Secret' ? b64.dec(v) : v;
  }
  for (const e of ct.env || []) {
    if (e.valueFrom) {
      const [tipo, r] = e.valueFrom.configMapKeyRef ? ['ConfigMap', e.valueFrom.configMapKeyRef] : ['Secret', e.valueFrom.secretKeyRef || {}];
      const o = c.get(tipo, r.name, ns);
      if (!o) {
        if (r.optional) continue;
        return { env, error: `${tipo.toLowerCase()} "${r.name}" not found` };
      }
      if (!(r.key in (o.data || {}))) {
        if (r.optional) continue;
        return { env, error: `couldn't find key ${r.key} in ${tipo} ${ns}/${r.name}` };
      }
      env[e.name] = tipo === 'Secret' ? b64.dec(o.data[r.key]) : o.data[r.key];
    } else env[e.name] = e.value ?? '';
  }
  return { env };
}

function volumeAusente(c, pod) {
  const ns = pod.metadata.namespace;
  for (const v of pod.spec.volumes || []) {
    if (v.configMap && !v.configMap.optional && !c.get('ConfigMap', v.configMap.name, ns)) return `MountVolume.SetUp failed for volume "${v.name}" : configmap "${v.configMap.name}" not found`;
    if (v.secret && !v.secret.optional && !c.get('Secret', v.secret.secretName, ns)) return `MountVolume.SetUp failed for volume "${v.name}" : secret "${v.secret.secretName}" not found`;
    if (v.persistentVolumeClaim && !c.get('PersistentVolumeClaim', v.persistentVolumeClaim.claimName, ns)) return `persistentvolumeclaim "${v.persistentVolumeClaim.claimName}" not found`;
  }
  return null;
}

function naoAgendavel(pod, node) {
  const sufixo = ' preemption: 0/1 nodes are available: 1 Preemption is not helpful for scheduling.';
  for (const [k, v] of Object.entries(pod.spec.nodeSelector || {})) {
    if (node.metadata.labels?.[k] !== v) return `0/1 nodes are available: 1 node(s) didn't match Pod's node affinity/selector.${sufixo}`;
  }
  let cpu = 0;
  let mem = 0;
  for (const ct of pod.spec.containers) {
    cpu += parseCpu(ct.resources?.requests?.cpu);
    mem += parseMem(ct.resources?.requests?.memory);
  }
  if (cpu > parseCpu(node.status.allocatable.cpu)) return `0/1 nodes are available: 1 Insufficient cpu.${sufixo}`;
  if (mem > parseMem(node.status.allocatable.memory)) return `0/1 nodes are available: 1 Insufficient memory.${sufixo}`;
  return null;
}

// Interpreta um comando explícito do contêiner (command/args).
function peloComando(linha) {
  const s = linha.join(' ');
  const ecos = [...s.matchAll(/echo\s+(?:"([^"]*)"|'([^']*)'|([^;&|]+))/g)].map((m) => (m[1] ?? m[2] ?? m[3]).trim());
  if (/sleep\s+(infinity|inf|\d{4,})/.test(s) || /while\s+true/.test(s) || /tail\s+-f/.test(s)) return { tipo: 'roda', logs: ecos };
  const dorme = s.match(/sleep\s+(\d+)/);
  const sai = s.match(/\bexit\s+(\d+)/);
  return { tipo: 'sai', codigo: sai ? Number(sai[1]) : 0, apos: dorme ? Number(dorme[1]) : 2, logs: ecos };
}

function diagnosticar(c, pod, ct) {
  const achada = findImage(ct.image);
  if (achada.error) {
    const alvo = achada.tag || achada.digest;
    return { tipo: 'pull', msg: achada.error === 'repo' ? `reading manifest ${alvo} in ${achada.repo}: name unknown: repository not found` : `reading manifest ${alvo} in ${achada.repo}: manifest unknown` };
  }
  const r = resolveEnv(c, pod, ct);
  if (r.error) return { tipo: 'config', msg: r.error };
  const img = achada.image;
  const contexto = { tag: achada.tag, env: r.env, pod };
  if (ct.command || ct.args) return peloComando([...(ct.command || []), ...(ct.args || [])]);
  if (img.requires && !img.requires.some((grupo) => grupo.every((v) => r.env[v]))) return { tipo: 'sai', codigo: 1, apos: 0, logs: img.crashLog };
  if (img.exits !== undefined) return { tipo: 'sai', codigo: img.exits, apos: 1, logs: img.logs(contexto) };
  return { tipo: 'roda', logs: img.logs(contexto) };
}

function pods(c) {
  const node = c.list('Node')[0];
  for (const p of c.list('Pod')) {
    if (p.status.phase === 'Succeeded' || p.status.phase === 'Failed') continue;
    const st = (c.side[p.metadata.uid] ??= { ev: {}, logs: {} });
    const uma = (chave, fn) => {
      if (!st.ev[chave]) {
        st.ev[chave] = 1;
        fn();
      }
    };

    if (!p.spec.nodeName) {
      const motivo = naoAgendavel(p, node);
      if (motivo) {
        uma('naoAgendado', () => c.event(p, 'Warning', 'FailedScheduling', motivo, 'default-scheduler'));
        p.status = { phase: 'Pending', conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable', message: motivo }] };
        continue;
      }
      p.spec.nodeName = node.metadata.name;
      st.inicio = c.now;
      c.event(p, 'Normal', 'Scheduled', `Successfully assigned ${p.metadata.namespace}/${p.metadata.name} to ${node.metadata.name}`, 'default-scheduler');
    }

    const t = c.now - st.inicio;
    const montagem = volumeAusente(c, p);
    const politica = p.spec.restartPolicy;
    const estados = [];
    for (const ct of p.spec.containers) {
      const base = { name: ct.name, image: ct.image, ready: false, restartCount: 0, started: false };
      if (t < 2 || montagem) {
        if (montagem) uma('montagem', () => c.event(p, 'Warning', 'FailedMount', montagem));
        estados.push({ ...base, state: { waiting: { reason: 'ContainerCreating' } } });
        continue;
      }
      const d = diagnosticar(c, p, ct);
      const n = ct.name;
      if (d.tipo === 'pull') {
        uma(`puxa:${n}`, () => c.event(p, 'Normal', 'Pulling', `Pulling image "${ct.image}"`));
        uma(`falha:${n}`, () => {
          c.event(p, 'Warning', 'Failed', `Failed to pull image "${ct.image}": ${d.msg}`);
          c.event(p, 'Warning', 'Failed', 'Error: ErrImagePull');
        });
        if (t >= 6) uma(`recuo:${n}`, () => c.event(p, 'Normal', 'BackOff', `Back-off pulling image "${ct.image}"`));
        st.logs[n] = { espera: 'trying and failing to pull image' };
        estados.push({ ...base, state: { waiting: t < 6 ? { reason: 'ErrImagePull', message: d.msg } : { reason: 'ImagePullBackOff', message: `Back-off pulling image "${ct.image}"` } } });
      } else if (d.tipo === 'config') {
        uma(`config:${n}:${d.msg}`, () => c.event(p, 'Warning', 'Failed', `Error: ${d.msg}`));
        st.logs[n] = { espera: 'CreateContainerConfigError' };
        estados.push({ ...base, state: { waiting: { reason: 'CreateContainerConfigError', message: d.msg } } });
      } else {
        uma(`sobe:${n}`, () => {
          c.event(p, 'Normal', 'Pulled', `Container image "${ct.image}" already present on machine`);
          c.event(p, 'Normal', 'Created', `Created container ${n}`);
          c.event(p, 'Normal', 'Started', `Started container ${n}`);
        });
        st.logs[n] = { linhas: d.logs || [] };
        const rodando = { ...base, ready: true, started: true, state: { running: { startedAt: c.iso(st.inicio + 2) } } };
        if (d.tipo === 'roda' || t < 2 + d.apos) estados.push(rodando);
        else if (politica === 'Always' || (politica === 'OnFailure' && d.codigo !== 0)) {
          uma(`volta:${n}`, () => c.event(p, 'Warning', 'BackOff', `Back-off restarting failed container ${n} in pod ${p.metadata.name}_${p.metadata.namespace}(${p.metadata.uid})`));
          const reinicios = 1 + Math.min(40, Math.floor((t - 2 - d.apos) / 20));
          estados.push({
            ...base,
            restartCount: reinicios,
            state: { waiting: { reason: 'CrashLoopBackOff', message: `back-off 5m0s restarting failed container=${n} pod=${p.metadata.name}_${p.metadata.namespace}(${p.metadata.uid})` } },
            lastState: { terminated: { exitCode: d.codigo, reason: d.codigo ? 'Error' : 'Completed' } },
          });
        } else estados.push({ ...base, state: { terminated: { exitCode: d.codigo, reason: d.codigo ? 'Error' : 'Completed' } } });
      }
    }

    const terminados = estados.every((e) => e.state.terminated);
    const iniciou = estados.some((e) => e.state.running || e.state.terminated || e.lastState);
    let fase = 'Pending';
    if (terminados) fase = estados.every((e) => e.state.terminated.exitCode === 0) ? 'Succeeded' : 'Failed';
    else if (iniciou) fase = 'Running';
    const pronto = estados.every((e) => e.ready);
    if (iniciou && !p.status.podIP) st.ip = c.novoIp('10.8');
    p.status = {
      phase: fase,
      hostIP: node.status.addresses[0].address,
      ...(st.ip ? { podIP: st.ip, podIPs: [{ ip: st.ip }] } : {}),
      startTime: c.iso(st.inicio),
      conditions: [
        { type: 'Initialized', status: 'True' },
        { type: 'Ready', status: pronto ? 'True' : 'False', ...(pronto ? {} : { reason: terminados ? 'PodCompleted' : 'ContainersNotReady' }) },
        { type: 'ContainersReady', status: pronto ? 'True' : 'False' },
        { type: 'PodScheduled', status: 'True' },
      ],
      containerStatuses: estados,
    };
  }
}

// Pods (prontos) selecionados por um service.
export function endpoints(c, svc) {
  if (!svc.spec.selector) return [];
  return c.list('Pod', svc.metadata.namespace).filter((p) => podPronto(p) && matchLabels(p.metadata.labels, svc.spec.selector));
}
