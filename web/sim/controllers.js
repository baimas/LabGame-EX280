// Controllers do cluster simulado: deployment → replicaset → pod, e o ciclo
// de vida dos pods (agendamento, pull de imagem, configuração, execução).
import { clone, rand, hashId, matchLabels, parseCpu, parseMem, b64 } from './util.js';
import { findImage } from './images.js';
import { oauthCtl } from './rbac.js';
import { umCert, umaChave, certDeServico, SERVICE_CA } from './tls.js';
import { quotaCtl } from './quota.js';
import { projetoCtl } from './projetos.js';
import { olmCtl } from './olm.js';
import { jobsCtl, cronCtl } from './jobs.js';
import { updatesCtl } from './updates.js';
import { redesCtl, problemaDeRede, ligaRedes } from './redes.js';
import { uidEfetivo } from './scc.js';
import { pode } from './rbac.js';

export function reconcile(c) {
  for (let i = 0; i < 4; i++) {
    olmCtl(c);
    redesCtl(c);
    cronCtl(c);
    jobsCtl(c);
    deployments(c);
    replicasets(c);
    pods(c);
  }
  deployments(c);
  endpointsCtl(c);
  oauthCtl(c);
  serviceCaCtl(c);
  metallbCtl(c);
  quotaCtl(c);
  projetoCtl(c);
  updatesCtl(c);
}

// Endereços de um pool: faixas `a.b.c.d-a.b.c.e` ou CIDR.
export function enderecosDoPool(pool) {
  const num = (ip) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
  const ip = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
  const out = [];
  for (const faixa of pool.spec?.addresses || []) {
    let [ini, fim] = faixa.split('-').map((x) => x.trim());
    if (!fim && ini.includes('/')) {
      const [base, bits] = ini.split('/');
      const tam = 2 ** (32 - Number(bits));
      ini = ip(num(base));
      fim = ip(num(base) + tam - 1);
    }
    fim ??= ini;
    for (let n = num(ini); n <= num(fim) && out.length < 1024; n++) out.push(ip(n));
  }
  return out;
}

// MetalLB: dá IPs dos pools aos services LoadBalancer e marca quais são anunciados.
function metallbCtl(c) {
  const NS = 'metallb-system';
  const ativo = c.list('MetalLB', NS).length > 0;
  const pools = c.list('IPAddressPool', NS);
  const anuncios = c.list('L2Advertisement', NS);
  const usados = new Map();
  for (const s of c.list('Service')) if (s.spec.type !== 'LoadBalancer' && s.status?.loadBalancer) delete s.status.loadBalancer;
  const lbs = c.list('Service').filter((s) => s.spec.type === 'LoadBalancer');
  for (const s of lbs) {
    const ip = s.status?.loadBalancer?.ingress?.[0]?.ip;
    if (ip) usados.set(ip, s.metadata.uid);
  }
  c.side.anunciados = {};
  for (const svc of lbs) {
    const anot = svc.metadata.annotations || {};
    // Aceita as anotações novas (metallb.io/*), as antigas (metallb.universe.tf/*) e spec.loadBalancerIP.
    const pedidos = (anot['metallb.io/loadBalancerIPs'] || anot['metallb.universe.tf/loadBalancerIPs'] || svc.spec.loadBalancerIP || '').split(',').map((x) => x.trim()).filter(Boolean);
    const poolPedido = anot['metallb.io/address-pool'] || anot['metallb.universe.tf/address-pool'];
    const atual = svc.status?.loadBalancer?.ingress?.[0]?.ip;
    const poolDe = (ip) => pools.find((p) => enderecosDoPool(p).includes(ip));
    const valido = (ip) => {
      const p = poolDe(ip);
      if (!p || (poolPedido && p.metadata.name !== poolPedido)) return false;
      return !pedidos.length || pedidos.includes(ip);
    };
    let ip = ativo && atual && valido(atual) ? atual : null;
    if (atual && !ip) {
      usados.delete(atual);
      delete svc.status.loadBalancer;
    }
    if (ativo && !ip) {
      const candidatos = pedidos.length ? pedidos : pools.filter((p) => (poolPedido ? p.metadata.name === poolPedido : p.spec.autoAssign !== false)).flatMap(enderecosDoPool);
      ip = candidatos.find((x) => poolDe(x) && (!poolPedido || poolDe(x).metadata.name === poolPedido) && (!usados.has(x) || usados.get(x) === svc.metadata.uid));
      const st = (c.side[svc.metadata.uid] ??= { ev: {} });
      if (ip) {
        usados.set(ip, svc.metadata.uid);
        svc.status = { ...(svc.status || {}), loadBalancer: { ingress: [{ ip, ipMode: 'VIP' }] } };
        c.event(svc, 'Normal', 'IPAllocated', `Assigned IP ["${ip}"]`, 'metallb-controller');
      } else {
        const motivo = pedidos.length ? `["${pedidos.join('", "')}"] is not allowed in config` : poolPedido && !pools.some((p) => p.metadata.name === poolPedido) ? `pool ${poolPedido} does not exist` : 'no available IPs';
        const chave = `falha:${motivo}`;
        if (!st.ev[chave]) {
          st.ev[chave] = 1;
          c.event(svc, 'Warning', 'AllocationFailed', `Failed to allocate IP for "${svc.metadata.namespace}/${svc.metadata.name}": ${motivo}`, 'metallb-controller');
        }
      }
    }
    if (!ip) continue;
    const pool = poolDe(ip);
    const anunciado = anuncios.some((a) => !(a.spec?.ipAddressPools || []).length || a.spec.ipAddressPools.includes(pool.metadata.name));
    c.side.anunciados[ip] = anunciado;
    const st = (c.side[svc.metadata.uid] ??= { ev: {} });
    if (anunciado && !st.ev[`anuncio:${ip}`]) {
      st.ev[`anuncio:${ip}`] = 1;
      c.event(svc, 'Normal', 'nodeAssigned', 'announcing from node "master01" with protocol "layer2"', 'metallb-speaker');
    }
  }
}

// Service CA: emite certificados para services anotados e injeta o CA bundle em config maps.
function serviceCaCtl(c) {
  const ANOT = 'service.beta.openshift.io/serving-cert-secret-name';
  for (const svc of c.list('Service')) {
    const nome = svc.metadata.annotations?.[ANOT];
    if (!nome) continue;
    const ns = svc.metadata.namespace;
    if (!c.get('Secret', nome, ns)) {
      const { crt, key } = certDeServico(svc.metadata.name, ns, c.now);
      c.create({ kind: 'Secret', metadata: { name: nome, namespace: ns, annotations: { 'service.beta.openshift.io/originating-service-name': svc.metadata.name, 'service.beta.openshift.io/originating-service-uid': svc.metadata.uid, 'service.beta.openshift.io/expiry': c.iso(c.now + 730 * 86400) } }, type: 'kubernetes.io/tls', data: { 'tls.crt': b64.enc(crt), 'tls.key': b64.enc(key) } });
      svc.metadata.annotations['service.beta.openshift.io/serving-cert-signed-by'] = SERVICE_CA.subject.CN;
    }
  }
  for (const cm of c.list('ConfigMap')) {
    if (cm.metadata.annotations?.['service.beta.openshift.io/inject-cabundle'] !== 'true') continue;
    if (cm.data?.['service-ca.crt'] !== SERVICE_CA.pem) {
      cm.data = { ...(cm.data || {}), 'service-ca.crt': SERVICE_CA.pem };
      cm.metadata.resourceVersion = String(1000 + c.seq++);
    }
  }
}

// Conteúdo dos config maps e secrets montados no contêiner, por caminho.
export function arquivosMontados(c, pod, ct) {
  const out = {};
  const ns = pod.metadata.namespace;
  for (const m of ct.volumeMounts || []) {
    const v = (pod.spec.volumes || []).find((x) => x.name === m.name);
    const fonte = v?.configMap ? c.get('ConfigMap', v.configMap.name, ns) : v?.secret ? c.get('Secret', v.secret.secretName, ns) : null;
    if (!fonte) continue;
    let dados = Object.fromEntries(Object.entries(fonte.data || {}).map(([k, val]) => [k, fonte.kind === 'Secret' ? b64.dec(val) : val]));
    const itens = (v.configMap || v.secret).items;
    if (itens) dados = Object.fromEntries(itens.filter((i) => i.key in dados).map((i) => [i.path, dados[i.key]]));
    const base = m.mountPath.replace(/\/$/, '');
    if (m.subPath) {
      if (m.subPath in dados) out[base] = dados[m.subPath];
    } else for (const [k, val] of Object.entries(dados)) out[`${base}/${k}`] = val;
  }
  return out;
}

// Aplicações do jogo servem HTTPS na 8443 quando TLS_DIR aponta para tls.crt e tls.key.
export function tlsDaAplicacao(c, pod, ct, env) {
  const dir = env.TLS_DIR?.replace(/\/$/, '');
  if (!dir) return null;
  const arqs = arquivosMontados(c, pod, ct);
  const crt = umCert(arqs[`${dir}/tls.crt`]);
  const key = umaChave(arqs[`${dir}/tls.key`]);
  if (!crt || !key) return { erro: `open ${dir}/${crt ? 'tls.key' : 'tls.crt'}: no such file or directory` };
  if (crt.pub !== key.id) return { erro: 'tls: private key does not match public key' };
  return { porta: 8443, cert: crt.pem };
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
    const causa = d.metadata.annotations['kubernetes.io/change-cause'];
    if (causa !== undefined) atual.metadata.annotations['kubernetes.io/change-cause'] = causa;
    atual.spec.replicas = d.spec.replicas;

    // Os replica sets antigos descem conforme os pods novos ficam prontos,
    // respeitando o maxUnavailable (25%, arredondado para baixo).
    const recreate = d.spec.strategy?.type === 'Recreate';
    const novosProntos = atual.status?.readyReplicas || 0;
    let sobra = recreate ? 0 : Math.max(0, d.spec.replicas - Math.floor(d.spec.replicas * 0.25) - novosProntos);
    if (novosProntos >= d.spec.replicas) sobra = 0;
    for (const velho of [...meus].sort((a, b) => rev(b) - rev(a))) {
      if (velho === atual || velho.spec.replicas === 0) continue;
      const alvo = Math.min(velho.spec.replicas, sobra);
      sobra -= alvo;
      if (alvo < velho.spec.replicas) {
        c.event(d, 'Normal', 'ScalingReplicaSet', `Scaled down replica set ${velho.metadata.name} from ${velho.spec.replicas} to ${alvo}`, 'deployment-controller');
        velho.spec.replicas = alvo;
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
        ...(atual.status?.conditions || []).filter((x) => x.type === 'ReplicaFailure'),
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
    let falha = null;
    while (meus.length < rs.spec.replicas) {
      const tpl = rs.spec.template;
      const pedido = {
        kind: 'Pod',
        metadata: {
          name: `${rs.metadata.name}-${rand(5)}`,
          namespace: ns,
          labels: clone(tpl.metadata?.labels || {}),
          annotations: clone(tpl.metadata?.annotations),
          ownerReferences: [ref(rs)],
        },
        spec: clone(tpl.spec),
      };
      let p;
      try {
        p = c.create(pedido);
      } catch (e) {
        if (!e.reason) throw e;
        // Admissão recusou (quota, limit range): o controller tenta de novo depois.
        falha = e.message.replace(/^Error from server \([A-Za-z]+\): /, '');
        const st = (c.side[rs.metadata.uid] ??= {});
        const chave = falha.replace(/^pods "[^"]*"/, 'pods');
        if (st.falha !== chave) c.event(rs, 'Warning', 'FailedCreate', `Error creating: ${falha}`, 'replicaset-controller');
        st.falha = chave;
        break;
      }
      if (c.side[rs.metadata.uid]) delete c.side[rs.metadata.uid].falha;
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
    if (falha) rs.status.conditions = [{ type: 'ReplicaFailure', status: 'True', reason: 'FailedCreate', message: falha }];
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
  // Imagem que só funciona como root.
  if (img.root && uidEfetivo(pod, ct) !== 0) return { tipo: 'sai', codigo: 1, apos: 0, logs: img.rootLog };
  // Aplicação que consulta a API com a service account do pod.
  if (img.api) {
    const ns = pod.metadata.namespace;
    const sa = `system:serviceaccount:${ns}:${pod.spec.serviceAccountName || 'default'}`;
    const alvos = String(r.env.WATCH_NAMESPACES || ns).split(',').map((x) => x.trim()).filter(Boolean);
    const negado = alvos.find((n) => !pode(c, sa, 'list', 'pods', '', n));
    if (negado) return { tipo: 'sai', codigo: 1, apos: 1, logs: ['[pod-watcher] using in-cluster configuration', `[pod-watcher] Error: pods is forbidden: User "${sa}" cannot list resource "pods" in API group "" in the namespace "${negado}"`] };
    return { tipo: 'roda', logs: ['[pod-watcher] using in-cluster configuration', ...alvos.map((n) => `[pod-watcher] watching ${c.list('Pod', n).length} pods in namespace ${n}`)] };
  }
  if (img.exits !== undefined) return { tipo: 'sai', codigo: img.exits, apos: 1, logs: img.logs(contexto) };
  const tls = img.repo.includes('/nimbus/') ? tlsDaAplicacao(c, pod, ct, r.env) : null;
  if (tls?.erro) return { tipo: 'sai', codigo: 1, apos: 0, logs: [`[${img.repo.split('/').pop()}] loading TLS certificate from ${r.env.TLS_DIR}`, `[${img.repo.split('/').pop()}] FATAL: ${tls.erro}`] };
  const linhas = img.logs(contexto);
  if (tls) linhas.push(`[${img.repo.split('/').pop()}] listening on 0.0.0.0:8443 (TLS)`);
  return { tipo: 'roda', logs: linhas };
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
    // Sem rede o sandbox do pod não sobe: fica em ContainerCreating.
    const rede = problemaDeRede(c, p);
    if (rede) {
      uma(`rede:${rede.slice(0, 80)}`, () => c.event(p, 'Warning', 'FailedCreatePodSandBox', rede));
      p.status = { ...p.status, phase: 'Pending', hostIP: node.status.addresses[0].address, containerStatuses: p.spec.containers.map((ct) => ({ name: ct.name, image: ct.image, ready: false, restartCount: 0, started: false, state: { waiting: { reason: 'ContainerCreating' } } })) };
      continue;
    }
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
    if (p.status.podIP) ligaRedes(c, p);
  }
}

// Pods (prontos) selecionados por um service.
export function endpoints(c, svc) {
  if (!svc.spec.selector) return [];
  return c.list('Pod', svc.metadata.namespace).filter((p) => podPronto(p) && matchLabels(p.metadata.labels, svc.spec.selector));
}
