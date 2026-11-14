// Formatação das saídas do oc: tabelas de `get`, YAML/JSON e `describe`.
import yaml from '../../vendor/js-yaml.mjs';
import { age, table, labelsText } from '../util.js';
import { endpoints, resolveEnv } from '../controllers.js';

const idade = (o, c) => age(c.now - Date.parse(o.metadata.creationTimestamp) / 1000);
const desde = (iso, c) => age(c.now - Date.parse(iso) / 1000);
const cond = (o, tipo) => (o.status?.conditions || []).find((x) => x.type === tipo) || {};

export function podResumo(p) {
  const cs = p.status?.containerStatuses || [];
  let status = p.status?.phase || 'Pending';
  for (const s of cs) {
    if (s.state.waiting?.reason) {
      status = s.state.waiting.reason;
      break;
    }
    if (s.state.terminated) status = s.state.terminated.reason;
  }
  if (p.status?.phase === 'Succeeded') status = 'Completed';
  return {
    ready: `${cs.filter((x) => x.ready).length}/${p.spec.containers.length}`,
    status,
    restarts: cs.reduce((n, x) => n + (x.restartCount || 0), 0),
  };
}

const portasSvc = (s) => (s.spec.ports || []).map((p) => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol}`).join(',') || '<none>';

const COLUNAS = {
  Pod: {
    head: ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'],
    row: (o, c) => {
      const r = podResumo(o);
      return [r.ready, r.status, r.restarts, idade(o, c)];
    },
    wideHead: ['IP', 'NODE', 'NOMINATED NODE', 'READINESS GATES'],
    wide: (o) => [o.status?.podIP || '<none>', o.spec.nodeName || '<none>', '<none>', '<none>'],
  },
  Deployment: {
    head: ['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE'],
    row: (o, c) => [`${o.status?.readyReplicas || 0}/${o.spec.replicas}`, o.status?.updatedReplicas || 0, o.status?.availableReplicas || 0, idade(o, c)],
    wideHead: ['CONTAINERS', 'IMAGES', 'SELECTOR'],
    wide: (o) => [o.spec.template.spec.containers.map((x) => x.name).join(','), o.spec.template.spec.containers.map((x) => x.image).join(','), labelsText(o.spec.selector.matchLabels)],
  },
  ReplicaSet: {
    head: ['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'],
    row: (o, c) => [o.spec.replicas, o.status?.replicas || 0, o.status?.readyReplicas || 0, idade(o, c)],
  },
  Service: {
    head: ['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
    row: (o, c) => [o.spec.type, o.spec.clusterIP || '<none>', o.status?.loadBalancer?.ingress?.[0]?.ip || (o.spec.type === 'LoadBalancer' ? '<pending>' : '<none>'), portasSvc(o), idade(o, c)],
    wideHead: ['SELECTOR'],
    wide: (o) => [labelsText(o.spec.selector)],
  },
  Route: {
    head: ['NAME', 'HOST/PORT', 'PATH', 'SERVICES', 'PORT', 'TERMINATION', 'WILDCARD'],
    row: (o) => [o.spec.host, o.spec.path || '', o.spec.to.name, o.spec.port?.targetPort ?? '<all>', o.spec.tls ? o.spec.tls.termination + (o.spec.tls.insecureEdgeTerminationPolicy ? '/' + o.spec.tls.insecureEdgeTerminationPolicy : '') : '', o.spec.wildcardPolicy],
  },
  ConfigMap: { head: ['NAME', 'DATA', 'AGE'], row: (o, c) => [Object.keys(o.data || {}).length, idade(o, c)] },
  Secret: { head: ['NAME', 'TYPE', 'DATA', 'AGE'], row: (o, c) => [o.type, Object.keys(o.data || {}).length, idade(o, c)] },
  ServiceAccount: { head: ['NAME', 'SECRETS', 'AGE'], row: (o, c) => [1, idade(o, c)] },
  Namespace: { head: ['NAME', 'STATUS', 'AGE'], row: (o, c) => [o.status?.phase || 'Active', idade(o, c)] },
  Project: { head: ['NAME', 'DISPLAY NAME', 'STATUS'], row: (o) => [o.metadata.annotations?.['openshift.io/display-name'] || '', o.status?.phase || 'Active'] },
  Node: {
    head: ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'],
    row: (o, c) => [
      cond(o, 'Ready').status === 'True' ? 'Ready' : 'NotReady',
      Object.keys(o.metadata.labels || {}).filter((l) => l.startsWith('node-role.kubernetes.io/')).map((l) => l.split('/')[1]).sort().join(',') || '<none>',
      idade(o, c),
      o.status.nodeInfo.kubeletVersion,
    ],
    wideHead: ['INTERNAL-IP', 'OS-IMAGE', 'CONTAINER-RUNTIME'],
    wide: (o) => [o.status.addresses[0].address, o.status.nodeInfo.osImage, o.status.nodeInfo.containerRuntimeVersion],
  },
  ClusterOperator: {
    head: ['NAME', 'VERSION', 'AVAILABLE', 'PROGRESSING', 'DEGRADED', 'SINCE', 'MESSAGE'],
    row: (o, c) => {
      const ruim = ['Degraded', 'Progressing'].map((t) => cond(o, t)).find((x) => x.status === 'True') || (cond(o, 'Available').status !== 'True' ? cond(o, 'Available') : {});
      return [o.status.versions?.[0]?.version || '', cond(o, 'Available').status, cond(o, 'Progressing').status, cond(o, 'Degraded').status, desde(cond(o, 'Available').lastTransitionTime, c), ruim.message || ''];
    },
  },
  ClusterVersion: {
    head: ['NAME', 'VERSION', 'AVAILABLE', 'PROGRESSING', 'SINCE', 'STATUS'],
    row: (o, c) => [o.status.desired.version, cond(o, 'Available').status, cond(o, 'Progressing').status, desde(cond(o, 'Progressing').lastTransitionTime, c), cond(o, 'Progressing').message || ''],
  },
  Event: {
    head: ['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'],
    semNome: true,
    row: (o, c) => [desde(o.lastTimestamp, c), o.type, o.reason, `${o.involvedObject.kind.toLowerCase()}/${o.involvedObject.name}`, o.message],
  },
};

const PADRAO = { head: ['NAME', 'AGE'], row: (o, c) => [idade(o, c)] };

// Monta a tabela de um grupo de objetos do mesmo tipo.
export function tabela(k, itens, c, { wide, labels, todosNs, prefixo, semCabecalho }) {
  const col = COLUNAS[k.kind] || PADRAO;
  if (k.kind === 'Event') itens = [...itens].sort((a, b) => Date.parse(a.lastTimestamp) - Date.parse(b.lastTimestamp));
  const head = [...(todosNs && k.namespaced ? ['NAMESPACE'] : []), ...(col.semNome ? col.head : col.head), ...(wide && col.wideHead ? col.wideHead : []), ...(labels ? ['LABELS'] : [])];
  const linhas = itens.map((o) => [
    ...(todosNs && k.namespaced ? [o.metadata.namespace] : []),
    ...(col.semNome ? [] : [(prefixo ? `${k.out}/` : '') + o.metadata.name]),
    ...col.row(o, c),
    ...(wide && col.wide ? col.wide(o, c) : []),
    ...(labels ? [labelsText(o.metadata.labels)] : []),
  ]);
  return table(semCabecalho ? linhas : [head, ...linhas]);
}

// Reordena as chaves como o servidor de API devolve.
export function ordena(o) {
  const { apiVersion, kind, metadata, spec, status, ...resto } = o;
  const out = { apiVersion };
  for (const [k, v] of Object.entries(resto)) if (k !== 'involvedObject') out[k] = v;
  if (o.involvedObject) out.involvedObject = o.involvedObject;
  out.kind = kind;
  out.metadata = metadata;
  if (spec !== undefined) out.spec = spec;
  if (status !== undefined) out.status = status;
  return out;
}

export const paraYaml = (o) => yaml.dump(o, { lineWidth: -1, noRefs: true, sortKeys: true, quotingType: '"' });
export const paraJson = (o) => JSON.stringify(o, null, 4) + '\n';

// ---------------------------------------------------------------- describe

const campo = (rotulo, valor) => `${(rotulo + ':').padEnd(Math.max(18, rotulo.length + 3))}${valor}\n`;

function multi(rotulo, mapa) {
  const pares = Object.entries(mapa || {}).map(([k, v]) => `${k}=${v}`);
  if (!pares.length) return campo(rotulo, '<none>');
  return pares.map((p, i) => (i === 0 ? campo(rotulo, p) : ' '.repeat(18) + p + '\n')).join('');
}

function eventosDe(o, c) {
  const evs = c.list('Event', o.metadata.namespace || 'default').filter((e) => e.involvedObject.uid === o.metadata.uid).sort((a, b) => Date.parse(a.lastTimestamp) - Date.parse(b.lastTimestamp));
  if (!evs.length) return 'Events:            <none>\n';
  const linhas = [['Type', 'Reason', 'Age', 'From', 'Message'], ['----', '------', '----', '----', '-------']];
  for (const e of evs) linhas.push([e.type, e.reason, desde(e.lastTimestamp, c), e.source.component, e.message]);
  return 'Events:\n' + table(linhas).split('\n').filter(Boolean).map((l) => '  ' + l).join('\n') + '\n';
}

function conteineres(lista, estados, pod, c) {
  let s = '';
  for (const ct of lista) {
    s += `  ${ct.name}:\n`;
    s += `    Image:          ${ct.image}\n`;
    const portas = (ct.ports || []).map((p) => `${p.containerPort}/${p.protocol || 'TCP'}`).join(', ');
    s += `    Port:           ${portas || '<none>'}\n`;
    if (ct.command) s += `    Command:\n${ct.command.map((x) => `      ${x}\n`).join('')}`;
    if (ct.args) s += `    Args:\n${ct.args.map((x) => `      ${x}\n`).join('')}`;
    const st = (estados || []).find((x) => x.name === ct.name);
    if (st) {
      const [tipo, det] = Object.entries(st.state)[0];
      s += `    State:          ${tipo[0].toUpperCase() + tipo.slice(1)}\n`;
      if (det.reason) s += `      Reason:       ${det.reason}\n`;
      if (det.exitCode !== undefined) s += `      Exit Code:    ${det.exitCode}\n`;
      if (det.startedAt) s += `      Started:      ${det.startedAt}\n`;
      if (st.lastState?.terminated) s += `    Last State:     Terminated\n      Reason:       ${st.lastState.terminated.reason}\n      Exit Code:    ${st.lastState.terminated.exitCode}\n`;
      s += `    Ready:          ${st.ready ? 'True' : 'False'}\n`;
      s += `    Restart Count:  ${st.restartCount}\n`;
    }
    for (const tipo of ['limits', 'requests']) {
      const r = ct.resources?.[tipo];
      if (r) s += `    ${tipo[0].toUpperCase() + tipo.slice(1)}:\n${Object.entries(r).map(([k, v]) => `      ${k}:     ${v}\n`).join('')}`;
    }
    for (const f of ct.envFrom || []) {
      const [nome, tipo] = f.configMapRef ? [f.configMapRef.name, 'ConfigMap'] : [f.secretRef.name, 'Secret'];
      s += `    Environment Variables from:\n      ${nome}  ${tipo}  Optional: false\n`;
    }
    if (ct.env?.length) {
      s += '    Environment:\n';
      for (const e of ct.env) {
        const r = e.valueFrom?.configMapKeyRef || e.valueFrom?.secretKeyRef;
        const v = r ? `<set to the key '${r.key}' ${e.valueFrom.configMapKeyRef ? 'of config map' : 'in secret'} '${r.name}'>  Optional: false` : e.value ?? '';
        s += `      ${e.name}:  ${v}\n`;
      }
    } else s += '    Environment:    <none>\n';
    const montagens = (ct.volumeMounts || []).map((m) => `      ${m.mountPath} from ${m.name} (${m.readOnly ? 'ro' : 'rw'})\n`).join('');
    s += montagens ? `    Mounts:\n${montagens}` : '    Mounts:         <none>\n';
  }
  return s;
}

function volumes(lista) {
  if (!lista?.length) return 'Volumes:          <none>\n';
  let s = 'Volumes:\n';
  for (const v of lista) {
    s += `  ${v.name}:\n`;
    if (v.configMap) s += `    Type:      ConfigMap (a volume populated by a ConfigMap)\n    Name:      ${v.configMap.name}\n`;
    else if (v.secret) s += `    Type:        Secret (a volume populated by a Secret)\n    SecretName:  ${v.secret.secretName}\n`;
    else if (v.persistentVolumeClaim) s += `    Type:       PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)\n    ClaimName:  ${v.persistentVolumeClaim.claimName}\n`;
    else if (v.emptyDir) s += "    Type:       EmptyDir (a temporary directory that shares a pod's lifetime)\n";
  }
  return s;
}

const DESCRICOES = {
  Pod(o, c) {
    const dono = o.metadata.ownerReferences?.[0];
    let s = campo('Name', o.metadata.name) + campo('Namespace', o.metadata.namespace) + campo('Priority', 0);
    s += campo('Service Account', o.spec.serviceAccountName);
    s += campo('Node', o.spec.nodeName ? `${o.spec.nodeName}/${o.status.hostIP}` : '<none>');
    if (o.status.startTime) s += campo('Start Time', o.status.startTime);
    s += multi('Labels', o.metadata.labels) + multi('Annotations', o.metadata.annotations);
    s += campo('Status', o.status.phase) + campo('IP', o.status.podIP || '');
    if (dono) s += campo('Controlled By', `${dono.kind}/${dono.name}`);
    s += 'Containers:\n' + conteineres(o.spec.containers, o.status.containerStatuses, o, c);
    s += 'Conditions:\n  Type              Status\n' + (o.status.conditions || []).map((x) => `  ${x.type.padEnd(18)}${x.status}\n`).join('');
    s += volumes(o.spec.volumes);
    s += multi('Node-Selectors', o.spec.nodeSelector);
    return s + eventosDe(o, c);
  },
  Deployment(o, c) {
    const st = o.status || {};
    let s = campo('Name', o.metadata.name) + campo('Namespace', o.metadata.namespace) + campo('CreationTimestamp', o.metadata.creationTimestamp);
    s += multi('Labels', o.metadata.labels) + multi('Annotations', o.metadata.annotations);
    s += campo('Selector', labelsText(o.spec.selector.matchLabels));
    s += campo('Replicas', `${o.spec.replicas} desired | ${st.updatedReplicas || 0} updated | ${st.replicas || 0} total | ${st.availableReplicas || 0} available | ${st.unavailableReplicas || 0} unavailable`);
    s += campo('StrategyType', o.spec.strategy.type);
    s += 'Pod Template:\n' + multi('  Labels', o.spec.template.metadata?.labels).replace(/^/gm, '').replace(/^ {18}/gm, ' '.repeat(18));
    s += '  Containers:\n' + conteineres(o.spec.template.spec.containers, null, o, c).replace(/^/gm, ' ').replace(/ $/, '');
    s += volumes(o.spec.template.spec.volumes).replace(/^/gm, '  ').replace(/ {2}$/, '');
    if (o.spec.template.spec.nodeSelector) s += multi('  Node-Selectors', o.spec.template.spec.nodeSelector);
    s += 'Conditions:\n  Type           Status  Reason\n' + (st.conditions || []).map((x) => `  ${x.type.padEnd(15)}${x.status.padEnd(8)}${x.reason}\n`).join('');
    const rs = c.list('ReplicaSet', o.metadata.namespace).filter((r) => (r.metadata.ownerReferences || []).some((x) => x.uid === o.metadata.uid));
    const novo = rs.find((r) => r.metadata.annotations?.['deployment.kubernetes.io/revision'] === o.metadata.annotations?.['deployment.kubernetes.io/revision']);
    const velhos = rs.filter((r) => r !== novo && r.spec.replicas > 0);
    s += campo('OldReplicaSets', velhos.map((r) => `${r.metadata.name} (${r.status.replicas}/${r.spec.replicas} replicas created)`).join(', ') || '<none>');
    if (novo) s += campo('NewReplicaSet', `${novo.metadata.name} (${novo.status.replicas}/${novo.spec.replicas} replicas created)`);
    return s + eventosDe(o, c);
  },
  Service(o, c) {
    let s = campo('Name', o.metadata.name) + campo('Namespace', o.metadata.namespace) + multi('Labels', o.metadata.labels) + multi('Annotations', o.metadata.annotations);
    s += campo('Selector', labelsText(o.spec.selector)) + campo('Type', o.spec.type) + campo('IP Family Policy', 'SingleStack') + campo('IP Families', 'IPv4');
    s += campo('IP', o.spec.clusterIP) + campo('IPs', o.spec.clusterIP);
    const pods = endpoints(c, o);
    for (const p of o.spec.ports || []) {
      s += campo('Port', `${p.name || '<unset>'}  ${p.port}/${p.protocol}`) + campo('TargetPort', `${p.targetPort}/${p.protocol}`);
      s += campo('Endpoints', pods.map((x) => `${x.status.podIP}:${p.targetPort}`).join(',') || '<none>');
    }
    return s + campo('Session Affinity', 'None') + eventosDe(o, c);
  },
  Node(o, c) {
    let s = campo('Name', o.metadata.name) + campo('Roles', 'control-plane,master,worker') + multi('Labels', o.metadata.labels);
    s += campo('CreationTimestamp', o.metadata.creationTimestamp) + campo('Unschedulable', 'false');
    s += 'Conditions:\n' + table([['  Type', 'Status', 'Reason'], ...o.status.conditions.map((x) => ['  ' + x.type, x.status, x.reason])]);
    s += 'Capacity:\n' + Object.entries(o.status.capacity).map(([k, v]) => `  ${(k + ':').padEnd(10)}${v}\n`).join('');
    s += 'Allocatable:\n' + Object.entries(o.status.allocatable).map(([k, v]) => `  ${(k + ':').padEnd(10)}${v}\n`).join('');
    s += 'System Info:\n' + `  Kubelet Version:            ${o.status.nodeInfo.kubeletVersion}\n  OS Image:                   ${o.status.nodeInfo.osImage}\n  Container Runtime Version:  ${o.status.nodeInfo.containerRuntimeVersion}\n`;
    const pods = c.list('Pod').filter((p) => p.spec.nodeName === o.metadata.name);
    s += `Non-terminated Pods:          (${pods.length} in total)\n`;
    return s + eventosDe(o, c);
  },
  ConfigMap(o, c) {
    let s = campo('Name', o.metadata.name) + campo('Namespace', o.metadata.namespace) + multi('Labels', o.metadata.labels) + multi('Annotations', o.metadata.annotations);
    s += '\nData\n====\n' + Object.entries(o.data || {}).map(([k, v]) => `${k}:\n----\n${v}\n\n`).join('');
    return s + eventosDe(o, c);
  },
  Secret(o) {
    let s = campo('Name', o.metadata.name) + campo('Namespace', o.metadata.namespace) + multi('Labels', o.metadata.labels) + multi('Annotations', o.metadata.annotations);
    s += `\nType:  ${o.type}\n\nData\n====\n` + Object.entries(o.data || {}).map(([k, v]) => `${k}:  ${atob(v).length} bytes\n`).join('');
    return s;
  },
  ClusterOperator(o) {
    let s = campo('Name', o.metadata.name) + campo('Kind', 'ClusterOperator') + 'Status:\n  Conditions:\n';
    for (const x of o.status.conditions) {
      s += `    Last Transition Time:  ${x.lastTransitionTime}\n`;
      if (x.message) s += `    Message:               ${x.message}\n`;
      s += `    Reason:                ${x.reason}\n    Status:                ${x.status}\n    Type:                  ${x.type}\n`;
    }
    return s + `  Versions:\n    Name:     operator\n    Version:  ${o.status.versions?.[0]?.version}\n`;
  },
};

export function descreve(o, c) {
  if (DESCRICOES[o.kind]) return DESCRICOES[o.kind](o, c);
  let s = campo('Name', o.metadata.name);
  if (o.metadata.namespace) s += campo('Namespace', o.metadata.namespace);
  s += multi('Labels', o.metadata.labels) + multi('Annotations', o.metadata.annotations);
  for (const chave of ['spec', 'data', 'rules', 'subjects', 'roleRef', 'status']) {
    if (o[chave] !== undefined) s += `${chave[0].toUpperCase() + chave.slice(1)}:\n${paraYaml(o[chave]).replace(/^/gm, '  ').replace(/ {2}$/, '')}`;
  }
  return s + eventosDe(o, c);
}

export { resolveEnv };
