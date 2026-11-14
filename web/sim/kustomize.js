// Subconjunto do Kustomize: resources (arquivos e bases), namespace,
// namePrefix/nameSuffix, commonLabels/labels, commonAnnotations, images,
// replicas, patches e geradores de config map e secret.
import yaml from '../vendor/js-yaml.mjs';
import { ApiError } from './cluster.js';
import { kindOf } from './resources.js';
import { parseRef } from './images.js';
import { hashId, b64, clone } from './util.js';
import { fusaoEstrategica, jsonPatch } from './patch.js';

const NOMES = ['kustomization.yaml', 'kustomization.yml', 'Kustomization'];
const CAMPOS = new Set(['apiVersion', 'kind', 'metadata', 'resources', 'bases', 'namespace', 'namePrefix', 'nameSuffix', 'commonLabels', 'labels', 'commonAnnotations', 'images', 'replicas', 'patches', 'patchesStrategicMerge', 'configMapGenerator', 'secretGenerator', 'generatorOptions']);

const falha = (msg) => new ApiError(`error: ${msg}`);

function carrega(fs, caminho, rotulo) {
  try {
    return yaml.loadAll(fs.read(caminho)).filter(Boolean);
  } catch (e) {
    throw falha(`accumulating resources: accumulation err='accumulating resources from '${rotulo}': yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || e.message}'`);
  }
}

// Todas as especificações de pod dentro de um objeto.
function podSpecs(o) {
  if (o.kind === 'Pod') return [o.spec];
  if (o.kind === 'CronJob') return [o.spec?.jobTemplate?.spec?.template?.spec].filter(Boolean);
  return [o.spec?.template?.spec].filter(Boolean);
}

// Atualiza referências a config maps, secrets e services renomeados.
function renomeiaRefs(objs, mapa) {
  const troca = (tipo, ref, campo = 'name') => {
    if (ref && mapa[`${tipo}/${ref[campo]}`]) ref[campo] = mapa[`${tipo}/${ref[campo]}`];
  };
  for (const o of objs) {
    for (const spec of podSpecs(o)) {
      for (const ct of [...(spec.containers || []), ...(spec.initContainers || [])]) {
        for (const f of ct.envFrom || []) {
          troca('ConfigMap', f.configMapRef);
          troca('Secret', f.secretRef);
        }
        for (const e of ct.env || []) {
          troca('ConfigMap', e.valueFrom?.configMapKeyRef);
          troca('Secret', e.valueFrom?.secretKeyRef);
        }
      }
      for (const v of spec.volumes || []) {
        troca('ConfigMap', v.configMap);
        troca('Secret', v.secret, 'secretName');
      }
    }
    if (o.kind === 'Route') troca('Service', o.spec?.to);
  }
}

function gera(fs, dir, lista, kind, opcoes, objs, mapa) {
  for (const g of lista || []) {
    if (!g.name) throw falha(`${kind} generator requires a name`);
    const dados = {};
    for (const l of g.literals || []) {
      const i = String(l).indexOf('=');
      if (i < 1) throw falha(`invalid literal source ${l}, expected key=value`);
      dados[l.slice(0, i)] = l.slice(i + 1);
    }
    for (const a of g.files || []) {
      const i = String(a).indexOf('=');
      const [chave, arq] = i > 0 ? [a.slice(0, i), a.slice(i + 1)] : [String(a).split('/').pop(), a];
      const p = fs.resolve(dir, arq);
      if (!fs.isFile(p)) throw falha(`loading KV pairs: file sources: [${a}]: evalsymlink failure on '${p}' : lstat ${p}: no such file or directory`);
      dados[chave] = fs.read(p);
    }
    for (const a of g.envs || []) {
      const p = fs.resolve(dir, a);
      if (!fs.isFile(p)) throw falha(`loading KV pairs: env source files: [${a}]: evalsymlink failure on '${p}' : lstat ${p}: no such file or directory`);
      for (const l of fs.read(p).split('\n')) {
        const i = l.indexOf('=');
        if (i > 0 && !l.trim().startsWith('#')) dados[l.slice(0, i).trim()] = l.slice(i + 1);
      }
    }
    const o = { apiVersion: 'v1', kind, metadata: { name: g.name }, data: kind === 'Secret' ? Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, b64.enc(v)])) : dados };
    if (g.namespace) o.metadata.namespace = g.namespace;
    if (kind === 'Secret') o.type = g.type || 'Opaque';
    const semHash = g.options?.disableNameSuffixHash ?? opcoes?.disableNameSuffixHash;
    if (!semHash) {
      o.metadata.name = `${g.name}-${hashId(JSON.stringify([kind, g.name, o.data]))}`;
      mapa[`${kind}/${g.name}`] = o.metadata.name;
    }
    const rotulos = { ...(opcoes?.labels || {}), ...(g.options?.labels || {}) };
    if (Object.keys(rotulos).length) o.metadata.labels = rotulos;
    objs.push(o);
  }
}

function aplicaPatch(objs, patch, alvo, rotulo) {
  const criterio = alvo || (Array.isArray(patch) ? null : { kind: patch.kind, name: patch.metadata?.name });
  if (!criterio) throw falha(`unable to parse SM or JSON patch from [${rotulo}]: a JSON patch requires a target`);
  const escolhidos = objs.filter((o) => (!criterio.kind || o.kind === criterio.kind) && (!criterio.name || o.metadata.name === criterio.name || o.metadata.name.startsWith(criterio.name + '-') && ['ConfigMap', 'Secret'].includes(o.kind)) && (!criterio.namespace || o.metadata.namespace === criterio.namespace));
  if (!escolhidos.length && !alvo) throw falha(`no matches for Id ${criterio.kind}.${criterio.name}; failed to find unique target for patch ${criterio.kind}.${criterio.name}`);
  for (const o of escolhidos) {
    if (Array.isArray(patch)) jsonPatch(o, patch);
    else {
      const { apiVersion, kind, ...resto } = patch;
      const p = clone(resto);
      if (p.metadata) delete p.metadata.name;
      fusaoEstrategica(o, p);
    }
  }
}

export function kustomize(fs, dir) {
  const arquivo = NOMES.map((n) => `${dir === '/' ? '' : dir}/${n}`).find((p) => fs.isFile(p));
  if (!fs.isDir(dir)) throw falha(`must build at directory: not a valid directory: evalsymlink failure on '${dir}' : lstat ${dir}: no such file or directory`);
  if (!arquivo) throw falha(`unable to find one of 'kustomization.yaml', 'kustomization.yml' or 'Kustomization' in directory '${dir}'`);
  let k;
  try {
    k = yaml.load(fs.read(arquivo)) || {};
  } catch (e) {
    throw falha(`invalid Kustomization: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || e.message}`);
  }
  if (typeof k !== 'object' || Array.isArray(k)) throw falha('invalid Kustomization: json: cannot unmarshal into Go value of type types.Kustomization');
  for (const campo of Object.keys(k)) {
    if (!CAMPOS.has(campo)) throw falha(`invalid Kustomization: json: unknown field "${campo}"`);
  }

  let objs = [];
  for (const r of [...(k.resources || []), ...(k.bases || [])]) {
    if (/^https?:|^github\.com/.test(r)) throw new ApiError('[simulador] Kustomize com recursos remotos não é simulado.');
    const p = fs.resolve(dir, r);
    if (fs.isDir(p)) objs.push(...kustomize(fs, p));
    else if (fs.isFile(p)) {
      for (const d of carrega(fs, p, r)) {
        if (!d.kind || !d.metadata?.name) throw falha(`accumulating resources: accumulation err='accumulating resources from '${r}': missing kind or metadata.name in object'`);
        objs.push(d);
      }
    } else throw falha(`accumulating resources: accumulation err='accumulating resources from '${r}': evalsymlink failure on '${p}' : lstat ${p}: no such file or directory'`);
  }

  const mapa = {};
  gera(fs, dir, k.configMapGenerator, 'ConfigMap', k.generatorOptions, objs, mapa);
  gera(fs, dir, k.secretGenerator, 'Secret', k.generatorOptions, objs, mapa);

  for (const p of k.patchesStrategicMerge || []) {
    const docs = /\n/.test(p) ? yaml.loadAll(p).filter(Boolean) : carrega(fs, fs.resolve(dir, p), p);
    for (const d of docs) aplicaPatch(objs, d, null, p);
  }
  for (const p of k.patches || []) {
    let corpo;
    if (p.path) {
      const caminho = fs.resolve(dir, p.path);
      if (!fs.isFile(caminho)) throw falha(`trouble configuring builtin PatchTransformer with config: \`path: ${p.path}\`: failed to get the patch file from path(${p.path}): evalsymlink failure on '${caminho}' : lstat ${caminho}: no such file or directory`);
      corpo = yaml.load(fs.read(caminho));
    } else if (p.patch) corpo = yaml.load(p.patch);
    else throw falha('trouble configuring builtin PatchTransformer: must specify one of patch and path');
    aplicaPatch(objs, corpo, p.target, p.path || 'patch');
  }

  for (const r of k.replicas || []) {
    const alvos = objs.filter((o) => o.metadata.name === r.name && ['Deployment', 'StatefulSet', 'ReplicaSet'].includes(o.kind));
    if (!alvos.length) throw falha(`resource with name ${r.name} does not match a config with the following GVK [Deployment.apps StatefulSet.apps ReplicaSet.apps]`);
    for (const o of alvos) o.spec.replicas = Number(r.count);
  }

  for (const i of k.images || []) {
    for (const o of objs) {
      for (const spec of podSpecs(o)) {
        for (const ct of [...(spec.containers || []), ...(spec.initContainers || [])]) {
          const ref = parseRef(ct.image);
          if (ref.repo !== i.name) continue;
          const repo = i.newName || ref.repo;
          if (i.digest) ct.image = `${repo}@${i.digest}`;
          else if (i.newTag !== undefined) ct.image = `${repo}:${i.newTag}`;
          else ct.image = ref.digest ? `${repo}@${ref.digest}` : `${repo}:${ref.tag}`;
        }
      }
    }
  }

  if (k.namePrefix || k.nameSuffix) {
    for (const o of objs) {
      if (o.kind === 'Namespace') continue;
      const novo = `${k.namePrefix || ''}${o.metadata.name}${k.nameSuffix || ''}`;
      // Referências podem citar tanto o nome original quanto o já gerado com hash.
      for (const [orig, atual] of Object.entries(mapa)) if (atual === o.metadata.name && orig.startsWith(o.kind + '/')) mapa[orig] = novo;
      mapa[`${o.kind}/${o.metadata.name}`] = novo;
      o.metadata.name = novo;
    }
  }
  renomeiaRefs(objs, mapa);

  if (k.namespace) {
    for (const o of objs) {
      const tipo = kindOf(o.kind);
      if (tipo && !tipo.namespaced && !tipo.alias) continue;
      o.metadata.namespace = k.namespace;
    }
  }

  const rotula = (pares, seletores, templates) => {
    for (const o of objs) {
      o.metadata.labels = { ...(o.metadata.labels || {}), ...pares };
      if (templates || seletores) {
        for (const tpl of [o.spec?.template, o.spec?.jobTemplate?.spec?.template].filter(Boolean)) {
          (tpl.metadata ??= {}).labels = { ...(tpl.metadata.labels || {}), ...pares };
        }
      }
      if (seletores) {
        if (o.spec?.selector?.matchLabels) Object.assign(o.spec.selector.matchLabels, pares);
        else if (o.kind === 'Service' && o.spec?.selector) Object.assign(o.spec.selector, pares);
      }
    }
  };
  if (k.commonLabels) rotula(k.commonLabels, true, true);
  for (const l of k.labels || []) rotula(l.pairs || {}, Boolean(l.includeSelectors), Boolean(l.includeTemplates));
  if (k.commonAnnotations) {
    for (const o of objs) o.metadata.annotations = { ...(o.metadata.annotations || {}), ...k.commonAnnotations };
  }
  return objs;
}
