// Armazenamento de recursos do cluster simulado: CRUD, validação, valores
// padrão e relógio. As regras de comportamento ficam em controllers.js.
import { clone, uuid, b64 } from './util.js';
import { kindOf, kindDoObjeto } from './resources.js';
import { admite, padroesLimitRange } from './quota.js';
import { cron } from './jobs.js';
import { reconcile } from './controllers.js';
import { seed } from './seed.js';
import { umCert, umaChave } from './tls.js';

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
    const k = this.tipo(kindDoObjeto(o) || o.kind);
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
    if (o.kind === 'Service' && o.spec?.clusterIP && o.spec.clusterIP !== 'None' && this.list('Service').some((s) => s.spec.clusterIP === o.spec.clusterIP)) {
      throw invalido(o, `spec.clusterIPs: Invalid value: []string{"${o.spec.clusterIP}"}: failed to allocate IP ${o.spec.clusterIP}: provided IP is already allocated`);
    }
    this.padroes(o);
    admite(this, o);
    o.metadata.uid = uuid(`${chave}#${this.seq++}`);
    o.metadata.creationTimestamp = this.iso();
    o.metadata.resourceVersion = String(1000 + this.seq);
    this.objs.set(chave, o);
    if (k.kind === 'Namespace') this.aoCriarNamespace(o);
    this.reconcile();
    return o;
  }

  update(o) {
    const k = this.tipo(kindDoObjeto(o) || o.kind);
    const chave = this.chave(k, o.metadata.namespace, o.metadata.name);
    const atual = this.objs.get(chave);
    if (!atual) throw doServidor('NotFound', `${k.resource} "${o.metadata.name}" not found`);
    this.validar(o);
    this.padroes(o);
    if (o.kind === 'Job' && JSON.stringify(o.spec.template) !== JSON.stringify(atual.spec.template)) {
      throw invalido(o, 'spec.template: Invalid value: core.PodTemplateSpec{...}: field is immutable');
    }
    if (o.kind === 'Job' && o.spec.completions !== atual.spec.completions) throw invalido(o, `spec.completions: Invalid value: ${o.spec.completions}: field is immutable`);
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
        const vistos = new Set();
        (c.volumeMounts || []).forEach((m, j) => {
          if (vistos.has(m.mountPath)) throw invalido(o, `${caminho}.containers[${i}].volumeMounts[${j}].mountPath: Invalid value: "${m.mountPath}": must be unique`);
          vistos.add(m.mountPath);
        });
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
    if (o.kind === 'Job' || o.kind === 'CronJob') {
      const tpl = o.kind === 'Job' ? o.spec?.template : o.spec?.jobTemplate?.spec?.template;
      const caminho = o.kind === 'Job' ? 'spec.template' : 'spec.jobTemplate.spec.template';
      conteineres(tpl?.spec, `${caminho}.spec`);
      const rp = tpl.spec.restartPolicy;
      if (!['OnFailure', 'Never'].includes(rp)) throw invalido(o, `${caminho}.spec.restartPolicy: ${rp ? `Unsupported value: "${rp}"` : 'Required value'}: supported values: "OnFailure", "Never"`);
    }
    if (o.kind === 'CronJob' && !cron(o.spec?.schedule || '')) throw invalido(o, `spec.schedule: Invalid value: "${o.spec?.schedule ?? ''}": ${o.spec?.schedule ? 'invalid schedule format' : 'Required value'}`);
    if (o.kind === 'Service' && o.spec?.type !== 'ExternalName' && !o.spec?.ports?.length) throw invalido(o, 'spec.ports: Required value');
    if (o.kind === 'Route' && !o.spec?.to?.name) throw invalido(o, 'spec.to.name: Required value');
    if (o.kind === 'Route' && o.spec.tls?.termination === 'passthrough' && (o.spec.tls.certificate || o.spec.tls.key)) throw invalido(o, 'spec.tls.certificate: Invalid value: "redacted certificate data": passthrough termination does not support certificates');
    if (o.kind === 'Route' && o.spec.tls && !['edge', 'passthrough', 'reencrypt'].includes(o.spec.tls.termination)) throw invalido(o, `spec.tls.termination: Unsupported value: "${o.spec.tls.termination}": supported values: "edge", "passthrough", "reencrypt"`);
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
      for (const [i, p] of (o.spec.ports || []).entries()) {
        p.protocol ??= 'TCP';
        p.targetPort ??= p.port;
        if (o.spec.type === 'NodePort' || o.spec.type === 'LoadBalancer') p.nodePort ??= 30000 + (this.ipSeq * 7 + i * 13) % 2768;
      }
    }
    if (o.kind === 'Route') {
      if (!o.spec.host) o.spec.host = `${o.metadata.name}-${o.metadata.namespace}.${APPS_DOMAIN}`;
      o.spec.to.kind ??= 'Service';
      o.spec.to.weight ??= 100;
      o.spec.wildcardPolicy ??= 'None';
      // Validação estendida do roteador: certificado legível, par com a chave e dentro da validade.
      const tls = o.spec.tls;
      let problema = null;
      if (tls?.certificate) {
        const cert = umCert(tls.certificate);
        const chave = umaChave(tls.key);
        if (!cert) problema = 'spec.tls.certificate: Invalid value: "redacted certificate data": data does not contain any valid RSA or ECDSA certificates';
        else if (!chave) problema = 'spec.tls.key: Invalid value: "": no key specified';
        else if (chave.id !== cert.pub) problema = 'spec.tls.key: Invalid value: "redacted key data": private key does not match public key';
        else if (cert.notAfter < this.now) problema = 'spec.tls.certificate: Invalid value: "redacted certificate data": error verifying certificate: x509: certificate has expired or is not yet valid';
      }
      o.status = { ingress: [{ host: o.spec.host, routerName: 'default', conditions: [problema ? { type: 'Admitted', status: 'False', reason: 'ExtendedValidationFailed', message: problema } : { type: 'Admitted', status: 'True' }] }] };
    }
    if (o.kind === 'LimitRange') padroesLimitRange(o);
    if (o.kind === 'Job') {
      Object.assign(o.spec, { completions: o.spec.completions ?? 1, parallelism: o.spec.parallelism ?? 1, backoffLimit: o.spec.backoffLimit ?? 6 });
      o.status ??= {};
    }
    if (o.kind === 'CronJob') {
      o.spec = { concurrencyPolicy: 'Allow', suspend: false, successfulJobsHistoryLimit: 3, failedJobsHistoryLimit: 1, ...o.spec };
      o.status ??= {};
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
    return { objs: [...this.objs.entries()], side: this.side, now: this.now, seq: this.seq, ipSeq: this.ipSeq };
  }

  static restore(d) {
    const c = new Cluster({ vazio: true });
    c.objs = new Map(d.objs);
    Object.assign(c, { side: d.side, seq: d.seq, ipSeq: d.ipSeq });
    // O relógio retoma de onde parou; o tempo fora do jogo não conta.
    c.now = d.now;
    return c;
  }
}
