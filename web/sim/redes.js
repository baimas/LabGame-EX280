// Redes adicionais de pods: UserDefinedNetwork (UDN), ClusterUserDefinedNetwork
// (CUDN) e NetworkAttachmentDefinition (NAD), com as regras da documentação do
// OpenShift 4.22 (guia "Multiple networks").
import { clone, matchLabels, fakeDigest } from './util.js';

export const ROTULO_UDN = 'k8s.ovn.org/primary-user-defined-network';
export const ROTULO_NAD = 'k8s.ovn.org/user-defined-network';
export const ANOT_REDES = 'k8s.v1.cni.cncf.io/networks';
export const ANOT_STATUS = 'k8s.v1.cni.cncf.io/network-status';
// Rede do laboratório onde fica o host `utility` (rede de servidores do curso).
export const REDE_SERVIDORES = '172.25.150';

const tem = (ns, rotulo) => ns && Object.prototype.hasOwnProperty.call(ns.metadata.labels || {}, rotulo);
const cond = (tipo, status, reason, message, c) => ({ type: tipo, status, reason, message, lastTransitionTime: c.iso() });

function seletorCasa(ns, sel) {
  if (!sel) return false;
  const rotulos = ns.metadata.labels || {};
  if (sel.matchLabels && !matchLabels(rotulos, { matchLabels: sel.matchLabels })) return false;
  for (const e of sel.matchExpressions || []) {
    const v = rotulos[e.key];
    if (e.operator === 'In' && !(e.values || []).includes(v)) return false;
    if (e.operator === 'NotIn' && (e.values || []).includes(v)) return false;
    if (e.operator === 'Exists' && v === undefined) return false;
    if (e.operator === 'DoesNotExist' && v !== undefined) return false;
  }
  return Boolean(sel.matchLabels || sel.matchExpressions);
}

// Configuração de rede de um UDN (`spec`) ou de um CUDN (`spec.network`).
const configDe = (rede) => {
  const topologia = rede?.topology || 'Layer2';
  const camada = rede?.[topologia === 'Layer3' ? 'layer3' : 'layer2'] || {};
  const subredes = (camada.subnets || []).map((s) => (typeof s === 'string' ? s : s.cidr)).filter(Boolean);
  return { topologia, papel: camada.role || 'Primary', subredes };
};

function nadDeUdn(c, dono, ns, nome, cfg) {
  return {
    kind: 'NetworkAttachmentDefinition',
    metadata: { name: nome, namespace: ns, labels: { [ROTULO_NAD]: '' }, ownerReferences: [{ apiVersion: dono.apiVersion, kind: dono.kind, name: dono.metadata.name, uid: dono.metadata.uid, controller: true, blockOwnerDeletion: true }], finalizers: ['k8s.ovn.org/user-defined-network-protection'] },
    spec: { config: JSON.stringify({ cniVersion: '1.1.0', name: dono.kind === 'UserDefinedNetwork' ? `${ns}.${nome}` : `cluster_udn_${nome}`, netAttachDefName: `${ns}/${nome}`, role: cfg.papel.toLowerCase(), subnets: cfg.subredes.join(','), topology: cfg.topologia.toLowerCase(), type: 'ovn-k8s-cni-overlay' }) },
  };
}

// Garante o NAD gerado por um UDN/CUDN. Devolve null ou a mensagem de erro.
function garanteNad(c, dono, ns, nome, cfg) {
  const existente = c.get('NetworkAttachmentDefinition', nome, ns);
  if (existente && !(existente.metadata.ownerReferences || []).some((r) => r.uid === dono.metadata.uid)) return `foreign NetworkAttachmentDefinition with the desired name already exist [${ns}/${nome}]`;
  if (!existente) c.create(nadDeUdn(c, dono, ns, nome, cfg));
  return null;
}

export function redesCtl(c) {
  for (const u of c.list('UserDefinedNetwork')) {
    const ns = u.metadata.namespace;
    const cfg = configDe(u.spec);
    let erro = null;
    if (cfg.papel === 'Primary' && !tem(c.get('Namespace', ns), ROTULO_UDN)) erro = `failed to generate NetworkAttachmentDefinition: namespace "${ns}" is missing the "${ROTULO_UDN}" label required for a primary user-defined network`;
    else if (!cfg.subredes.length && cfg.topologia === 'Layer3') erro = 'failed to generate NetworkAttachmentDefinition: subnets are required for Layer3 topology';
    erro ??= garanteNad(c, u, ns, u.metadata.name, cfg);
    u.status = {
      conditions: erro
        ? [cond('NetworkCreated', 'False', 'SyncError', erro, c)]
        : [cond('NetworkCreated', 'True', 'NetworkAttachmentDefinitionCreated', 'NetworkAttachmentDefinition has been created', c), cond('NetworkAllocationSucceeded', 'True', 'NetworkAllocationSucceeded', 'Network allocation succeeded for all synced nodes.', c)],
    };
  }
  for (const cu of c.list('ClusterUserDefinedNetwork')) {
    const cfg = configDe(cu.spec?.network);
    const alvos = c.list('Namespace').filter((n) => seletorCasa(n, cu.spec?.namespaceSelector));
    const criados = [];
    const erros = [];
    for (const n of alvos) {
      const nome = n.metadata.name;
      if (cfg.papel === 'Primary' && !tem(n, ROTULO_UDN)) {
        erros.push(`failed to generate NetworkAttachmentDefinition for namespace "${nome}": the "${ROTULO_UDN}" label is missing`);
        continue;
      }
      const e = garanteNad(c, cu, nome, cu.metadata.name, cfg);
      if (e) erros.push(e);
      else criados.push(nome);
    }
    // NADs de namespaces que deixaram de ser escolhidos saem.
    for (const nad of c.list('NetworkAttachmentDefinition')) {
      if ((nad.metadata.ownerReferences || []).some((r) => r.uid === cu.metadata.uid) && !criados.includes(nad.metadata.namespace)) c.delete('NetworkAttachmentDefinition', nad.metadata.name, nad.metadata.namespace);
    }
    cu.status = {
      conditions: erros.length
        ? [cond('NetworkCreated', 'False', 'NetworkAttachmentDefinitionSyncError', erros.join('; '), c)]
        : [cond('NetworkCreated', 'True', 'NetworkAttachmentDefinitionCreated', `NetworkAttachmentDefinition has been created in following namespaces: [${criados.join(', ')}]`, c)],
    };
  }
}

const configNad = (nad) => {
  try {
    return JSON.parse(nad?.spec?.config || '{}');
  } catch {
    return null;
  }
};

// NAD da rede primária do namespace (gerado por um UDN ou CUDN), ou null.
export function redePrimaria(c, ns) {
  return c.list('NetworkAttachmentDefinition', ns).find((n) => n.metadata.labels?.[ROTULO_NAD] !== undefined && configNad(n)?.role === 'primary') || null;
}

// Identificador da rede primária do pod: `default` ou o nome da rede de usuário.
export function redeDoPod(c, pod) {
  if (!pod?.metadata) return 'default';
  const nad = c.side.redesPod?.[pod.metadata.uid]?.primaria;
  return nad || 'default';
}

// Redes secundárias pedidas na anotação `k8s.v1.cni.cncf.io/networks`.
function pedidas(pod) {
  const txt = pod.metadata.annotations?.[ANOT_REDES];
  if (!txt) return [];
  const ns = pod.metadata.namespace;
  if (txt.trim().startsWith('[')) {
    try {
      return JSON.parse(txt).map((r) => ({ ns: r.namespace || ns, nome: r.name, ips: r.ips }));
    } catch {
      return [{ invalida: txt }];
    }
  }
  return txt.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [a, b] = s.split('/');
    return b ? { ns: a, nome: b } : { ns, nome: a };
  });
}

// Problema que impede o sandbox de rede do pod (o pod fica em ContainerCreating).
export function problemaDeRede(c, pod) {
  const ns = pod.metadata.namespace;
  if (tem(c.get('Namespace', ns), ROTULO_UDN) && !redePrimaria(c, ns)) {
    return `Failed to create pod sandbox: rpc error: code = Unknown desc = failed to create pod network sandbox k8s_${pod.metadata.name}_${ns}: error adding container to network "ovn-kubernetes": CNI request failed with status 400: '[${ns}/${pod.metadata.name}] addLogicalPort failed for ${ns}/${pod.metadata.name}: invalid primary network state for namespace "${ns}": a valid primary user defined network or network attachment definition custom resource, and required namespace label "${ROTULO_UDN}" must both be present'`;
  }
  for (const r of pedidas(pod)) {
    if (r.invalida) return `Failed to create pod sandbox: error adding pod ${ns}_${pod.metadata.name} to CNI network "multus-cni-network": failed to parse the network selection annotation: ${r.invalida}`;
    const nad = c.get('NetworkAttachmentDefinition', r.nome, r.ns);
    if (!nad) return `Failed to create pod sandbox: error adding pod ${ns}_${pod.metadata.name} to CNI network "multus-cni-network": Multus: [${ns}/${pod.metadata.name}]: error loading k8s delegates k8s args: TryLoadPodDelegates: error in getting k8s network for pod: GetNetworkDelegates: failed getting the delegate: getKubernetesDelegate: cannot find a network-attachment-definition (${r.nome}) in namespace (${r.ns}): network-attachment-definitions.k8s.cni.cncf.io "${r.nome}" not found`;
    const cfg = configNad(nad);
    if (!cfg) return `Failed to create pod sandbox: error adding pod ${ns}_${pod.metadata.name} to CNI network "multus-cni-network": invalid network configuration in network-attachment-definition ${r.ns}/${r.nome}`;
    if (cfg.type === 'host-device') {
      const dono = c.list('Pod').find((p) => p !== pod && p.metadata.uid !== pod.metadata.uid && !['Succeeded', 'Failed'].includes(p.status?.phase) && (c.side.redesPod?.[p.metadata.uid]?.secundarias || []).some((s) => s.device === cfg.device));
      if (dono) return `Failed to create pod sandbox: error adding container to network "${r.nome}": failed to find host device: Link not found (device "${cfg.device}" is in use by pod ${dono.metadata.namespace}/${dono.metadata.name})`;
    }
  }
  return null;
}

const mac = (semente) => {
  const h = fakeDigest(semente).slice(7);
  return `0a:58:${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}:${h.slice(6, 8)}`;
};

// Próximo IP livre de uma sub-rede IPv4 (`10.42.0.0/16` → 10.42.0.3, .4, ...).
function proximoIp(c, rede, cidr) {
  const base = cidr.split('/')[0].split('.').map(Number);
  const seq = (c.side.ipsRede ??= {});
  seq[rede] = (seq[rede] ?? 2) + 1;
  const n = seq[rede];
  return `${base[0]}.${base[1]}.${base[2] + Math.floor(n / 250)}.${(n % 250) + (base[3] || 0)}`;
}

// Atribui as interfaces de rede do pod e escreve a anotação network-status.
export function ligaRedes(c, pod) {
  const ns = pod.metadata.namespace;
  const st = ((c.side.redesPod ??= {})[pod.metadata.uid] ??= {});
  const status = [{ name: 'ovn-kubernetes', interface: 'eth0', ips: [pod.status.podIP], mac: mac(pod.metadata.uid), default: true, dns: {} }];
  const primaria = redePrimaria(c, ns);
  if (primaria) {
    const cfg = configNad(primaria);
    const id = cfg.netAttachDefName ? `${cfg.name}` : `${ns}/${primaria.metadata.name}`;
    st.primaria = cfg.name;
    const v4 = (cfg.subnets || '').split(',').find((s) => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(s.trim()));
    if (v4) st.ipPrimaria ??= proximoIp(c, id, v4.trim());
    delete status[0].default;
    status.push({ name: 'ovn-kubernetes', interface: 'ovn-udn1', ips: st.ipPrimaria ? [st.ipPrimaria] : [], mac: mac(pod.metadata.uid + 'udn'), default: true, dns: {} });
  } else delete st.primaria;
  st.secundarias = [];
  pedidas(pod).forEach((r, i) => {
    const nad = c.get('NetworkAttachmentDefinition', r.nome, r.ns);
    const cfg = configNad(nad) || {};
    const nome = `${r.ns}/${r.nome}`;
    let ip = r.ips?.[0]?.split('/')[0];
    const ipam = cfg.ipam || {};
    if (!ip && ipam.type === 'static') ip = (ipam.addresses || [])[0]?.address?.split('/')[0];
    if (!ip && cfg.type === 'ovn-k8s-cni-overlay' && cfg.subnets) ip = (st.ipsSec ??= {})[nome] ??= proximoIp(c, nome, cfg.subnets.split(',')[0]);
    if (!ip && ipam.type === 'dhcp') ip = (st.ipsSec ??= {})[nome] ??= `${REDE_SERVIDORES}.${150 + (Object.keys(c.side.redesPod).length % 90)}`;
    st.secundarias.push({ rede: nome, ip, device: cfg.type === 'host-device' ? cfg.device : null, cni: cfg.type });
    status.push({ name: nome, interface: `net${i + 1}`, ips: ip ? [ip] : [], mac: cfg.type === 'host-device' ? '52:54:00:01:96:0a' : mac(pod.metadata.uid + nome), dns: {} });
  });
  pod.metadata.annotations = { ...(pod.metadata.annotations || {}), [ANOT_STATUS]: JSON.stringify(status, null, 4) };
  pod.status.redesSecundarias = st.secundarias.map((s) => ({ ...s }));
}

// IP de rede primária de usuário ou de rede secundária → { pod, tipo, rede }.
export function podPorIp(c, ip) {
  for (const p of c.list('Pod')) {
    const st = c.side.redesPod?.[p.metadata.uid];
    if (!st) continue;
    if (st.ipPrimaria === ip) return { pod: p, tipo: 'udn', rede: st.primaria };
    const s = (st.secundarias || []).find((x) => x.ip === ip);
    if (s) return { pod: p, tipo: 'secundaria', rede: s.rede, cni: s.cni };
  }
  return null;
}

// O pod de origem está ligado a esta rede secundária?
export function naRedeSecundaria(c, pod, rede) {
  return Boolean(pod?.metadata && (c.side.redesPod?.[pod.metadata.uid]?.secundarias || []).some((s) => s.rede === rede));
}

export { clone };
