// Armazenamento de recursos do cluster simulado: CRUD, validação, valores
// padrão e relógio. As regras de comportamento ficam em controllers.js.
import { clone, uuid, b64 } from './util.js';
import { kindOf } from './resources.js';
import { reconcile } from './controllers.js';
import { seed } from './seed.js';

export const SERVER = 'https://api.ocp4.example.com:6443';
export const APPS_DOMAIN = 'apps.ocp4.example.com';

export class ApiError extends Error {
  constructor(message, reason = 'Error') {
    super(message);
    this.reason = reason;
  }
}

const doServidor = (razao, msg) => new ApiError(`Error from server (${razao}): ${msg}`, razao);
const invalido = (o, campo) => new ApiError(`The ${o.kind} "${o.metadata.name}" is invalid: ${campo}`, 'Invalid');

const real = (k) => (k && k.alias ? kindOf(k.alias) : k);

export class Cluster {
  constructor({ vazio = false } = {}) {
    this.objs = new Map();
    this.side = {}; // estado interno dos controllers, por uid
    this.users = { admin: 'redhatocp', developer: 'developer' };
    this.now = Math.floor(Date.now() / 1000);
    this.seq = 1;
    this.ipSeq = 20;
    this.ocupado = false;
    if (!vazio) seed(this);
  }

  iso(t = this.now) {
    return new Date(t * 1000).toISOString().replace('.000Z', 'Z');
  }

  tipo(kind) {
    const k = real(kindOf(kind));
    if (!k) throw new ApiError(`error: the server doesn't have a resource type "${kind}"`, 'NoMatch');
    return k;
  }

  chave(k, ns, nome) {
    return `${k.kind}/${k.namespaced ? ns || '' : ''}/${nome}`;
  }

  get(kind, nome, ns) {
    const k = this.tipo(kind);
    return this.objs.get(this.chave(k, ns, nome));
  }

  must(kind, nome, ns) {
    const o = this.get(kind, nome, ns);
    if (!o) throw doServidor('NotFound', `${this.tipo(kind).resource} "${nome}" not found`);
    return o;
  }

  // ns == null lista todos os namespaces.
  list(kind, ns = null) {
    const k = this.tipo(kind);
    const out = [];
    for (const o of this.objs.values()) {
      if (o.kind !== k.kind) continue;
      if (k.namespaced && ns != null && o.metadata.namespace !== ns) continue;
      out.push(o);
    }
    return out.sort((a, b) => (a.metadata.namespace || '').localeCompare(b.metadata.namespace || '') || a.metadata.name.localeCompare(b.metadata.name));
  }

  create(entrada) {
    const o = clone(entrada);
    if (!o || !o.kind) throw new ApiError('error: unable to decode: Object \'Kind\' is missing', 'Invalid');
    const k = this.tipo(o.kind);
    o.kind = k.kind;
    o.apiVersion = k.apiVersion;
    o.metadata ??= {};
    if (!o.metadata.name && o.metadata.generateName) o.metadata.name = o.metadata.generateName + String(this.seq).padStart(5, '0');
    if (!o.metadata.name) throw new ApiError('error: resource name may not be empty', 'Invalid');
    if (k.namespaced) {
      o.metadata.namespace ??= 'default';
      if (!this.get('Namespace', o.metadata.namespace)) throw doServidor('NotFound', `namespaces "${o.metadata.namespace}" not found`);
    } else delete o.metadata.namespace;
    const chave = this.chave(k, o.metadata.namespace, o.metadata.name);
    if (this.objs.has(chave)) throw doServidor('AlreadyExists', `${k.resource} "${o.metadata.name}" already exists`);
    this.validar(o);
    this.padroes(o);
    o.metadata.uid = uuid(`${chave}#${this.seq++}`);
    o.metadata.creationTimestamp = this.iso();
    o.metadata.resourceVersion = String(1000 + this.seq);
    this.objs.set(chave, o);
    if (k.kind === 'Namespace') this.aoCriarNamespace(o);
    this.reconcile();
    return o;
  }

  update(o) {
    const k = this.tipo(o.kind);
    const chave = this.chave(k, o.metadata.namespace, o.metadata.name);
    const atual = this.objs.get(chave);
    if (!atual) throw doServidor('NotFound', `${k.resource} "${o.metadata.name}" not found`);
    this.validar(o);
    this.padroes(o);
    o.metadata.uid = atual.metadata.uid;
    o.metadata.creationTimestamp = atual.metadata.creationTimestamp;
    o.metadata.resourceVersion = String(1000 + this.seq++);
    if (o.spec && JSON.stringify(o.spec) !== JSON.stringify(atual.spec)) o.metadata.generation = (atual.metadata.generation || 1) + 1;
    this.objs.set(chave, o);
    this.reconcile();
    return o;
  }

  delete(kind, nome, ns) {
    const k = this.tipo(kind);
    const o = this.must(kind, nome, ns);
    this.objs.delete(this.chave(k, ns, nome));
    delete this.side[o.metadata.uid];
    for (const outro of [...this.objs.values()]) {
      const filho = (outro.metadata.ownerReferences || []).some((r) => r.uid === o.metadata.uid);
      const doNamespace = k.kind === 'Namespace' && outro.metadata.namespace === nome;
      const doObjeto = outro.kind === 'Event' && outro.involvedObject?.uid === o.metadata.uid;
      if (filho || doNamespace || doObjeto) {
        if (this.objs.has(this.chave(this.tipo(outro.kind), outro.metadata.namespace, outro.metadata.name))) {
          this.delete(outro.kind, outro.metadata.name, outro.metadata.namespace);
        }
      }
    }
    this.reconcile();
    return o;
  }

  event(obj, type, reason, message, source = 'kubelet') {
    const ns = obj.metadata.namespace || 'default';
    if (!this.get('Namespace', ns)) return;
    const nome = `${obj.metadata.name}.${(this.seq++).toString(16).padStart(8, '0')}`;
    this.objs.set(`Event/${ns}/${nome}`, {
      apiVersion: 'v1',
      kind: 'Event',
      metadata: { name: nome, namespace: ns, uid: uuid(nome), creationTimestamp: this.iso() },
      involvedObject: { kind: obj.kind, name: obj.metadata.name, namespace: obj.metadata.namespace, uid: obj.metadata.uid },
      type,
      reason,
      message,
      source: { component: source },
      firstTimestamp: this.iso(),
      lastTimestamp: this.iso(),
      count: 1,
    });
  }

  tick(segundos = 1) {
    this.now += segundos;
    this.reconcile();
  }

  reconcile() {
    if (this.ocupado) return;
    this.ocupado = true;
    try {
      reconcile(this);
    } finally {
      this.ocupado = false;
    }
  }

  novoIp(prefixo) {
    const n = this.ipSeq++;
    return `${prefixo}.${Math.floor(n / 250)}.${(n % 250) + 2}`;
  }

  aoCriarNamespace(ns) {
    for (const nome of ['builder', 'default', 'deployer']) {
      this.create({ kind: 'ServiceAccount', metadata: { name: nome, namespace: ns.metadata.name } });
    }
  }

  validar(o) {
    const nome = o.metadata.name;
    if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(nome) && !['User', 'Group', 'Identity', 'ClusterRole', 'ClusterRoleBinding', 'Role', 'RoleBinding', 'SecurityContextConstraints'].includes(o.kind)) {
      throw invalido(o, `metadata.name: Invalid value: "${nome}": a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character`);
    }
    const conteineres = (spec, caminho) => {
      if (!spec?.containers?.length) throw invalido(o, `${caminho}.containers: Required value`);
      spec.containers.forEach((c, i) => {
        if (!c.name) throw invalido(o, `${caminho}.containers[${i}].name: Required value`);
        if (!c.image) throw invalido(o, `${caminho}.containers[${i}].image: Required value`);
      });
    };
    if (o.kind === 'Pod') conteineres(o.spec, 'spec');
    if (o.kind === 'Deployment' || o.kind === 'ReplicaSet') {
      const sel = o.spec?.selector?.matchLabels;
      if (!sel) throw invalido(o, 'spec.selector: Required value');
      const rotulos = o.spec.template?.metadata?.labels || {};
      for (const [k, v] of Object.entries(sel)) {
        if (rotulos[k] !== v) throw invalido(o, `spec.template.metadata.labels: Invalid value: map[string]string{${Object.entries(rotulos).map(([x, y]) => `"${x}":"${y}"`).join(', ')}}: \`selector\` does not match template \`labels\``);
      }
      conteineres(o.spec.template?.spec, 'spec.template.spec');
    }
    if (o.kind === 'Service' && o.spec?.type !== 'ExternalName' && !o.spec?.ports?.length) throw invalido(o, 'spec.ports: Required value');
    if (o.kind === 'Route' && !o.spec?.to?.name) throw invalido(o, 'spec.to.name: Required value');
  }

  padroes(o) {
    if (o.kind === 'Namespace') {
      o.metadata.labels = { 'kubernetes.io/metadata.name': o.metadata.name, ...(o.metadata.labels || {}) };
      o.status ??= { phase: 'Active' };
    }
    if (o.kind === 'Deployment') {
      o.spec.replicas ??= 1;
      o.spec.strategy ??= { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } };
      o.metadata.generation ??= 1;
      o.status ??= {};
    }
    if (o.kind === 'ReplicaSet') {
      o.spec.replicas ??= 1;
      o.status ??= { replicas: 0 };
    }
    if (o.kind === 'Pod') {
      o.spec.restartPolicy ??= 'Always';
      o.spec.serviceAccountName ??= 'default';
      o.status ??= { phase: 'Pending' };
    }
    if (o.kind === 'Service') {
      o.spec.type ??= 'ClusterIP';
      if (o.spec.type !== 'ExternalName') o.spec.clusterIP ??= this.novoIp('172.30');
      for (const p of o.spec.ports || []) {
        p.protocol ??= 'TCP';
        p.targetPort ??= p.port;
      }
    }
    if (o.kind === 'Route') {
      o.spec.host ??= `${o.metadata.name}-${o.metadata.namespace}.${APPS_DOMAIN}`;
      o.spec.to.kind ??= 'Service';
      o.spec.to.weight ??= 100;
      o.spec.wildcardPolicy ??= 'None';
      o.status = { ingress: [{ host: o.spec.host, routerName: 'default', conditions: [{ type: 'Admitted', status: 'True' }] }] };
    }
    if (o.kind === 'Secret') {
      o.type ??= 'Opaque';
      if (o.stringData) {
        o.data ??= {};
        for (const [k, v] of Object.entries(o.stringData)) o.data[k] = b64.enc(String(v));
        delete o.stringData;
      }
    }
  }

  serialize() {
    return { objs: [...this.objs.entries()], side: this.side, users: this.users, now: this.now, seq: this.seq, ipSeq: this.ipSeq };
  }

  static restore(d) {
    const c = new Cluster({ vazio: true });
    c.objs = new Map(d.objs);
    Object.assign(c, { side: d.side, users: d.users, seq: d.seq, ipSeq: d.ipSeq });
    // O relógio retoma de onde parou; o tempo fora do jogo não conta.
    c.now = d.now;
    return c;
  }
}
