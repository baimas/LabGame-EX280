// Image streams: tags que apontam para imagens do registro (por digest), o
// histórico de cada tag, a resolução local de nomes curtos (`lookupPolicy`) e os
// gatilhos de imagem dos deployments (`image.openshift.io/triggers`).
import { findImage, parseRef } from './images.js';

export const REGISTRO_INTERNO = 'image-registry.openshift-image-registry.svc:5000';
export const ANOTACAO_GATILHOS = 'image.openshift.io/triggers';

// Imagem atual de uma tag: { ref, digest } ou null.
export function imagemDaTag(c, ns, nome, tag) {
  const is = c.get('ImageStream', nome, ns);
  const st = is?.status?.tags?.find((t) => t.tag === tag);
  const item = st?.items?.[0];
  return item ? { ref: item.dockerImageReference, digest: item.image, is } : null;
}

// Para onde aponta a origem de uma tag: referência de registro ou null.
function origem(c, ns, from) {
  if (!from) return null;
  if (from.kind === 'DockerImage') {
    const a = findImage(from.name);
    if (a.error) return { erro: a.error === 'repo' ? `repository ${a.repo} not found` : `manifest unknown: ${a.tag || a.digest}` };
    return { ref: `${a.image.repo}@${a.digest}`, digest: a.digest };
  }
  if (from.kind === 'ImageStreamImage') {
    const [isNome, digest] = from.name.split('@');
    const fonte = c.get('ImageStream', isNome, from.namespace || ns);
    const item = (fonte?.status?.tags || []).flatMap((t) => t.items || []).find((i) => i.image === digest);
    return item ? { ref: item.dockerImageReference, digest } : { erro: `imagestreamimage ${from.name} not found` };
  }
  if (from.kind === 'ImageStreamTag') {
    const [isNome, tag = 'latest'] = from.name.split(':');
    const atual = imagemDaTag(c, from.namespace || ns, isNome, tag);
    return atual || { erro: `imagestreamtag ${from.name} not found` };
  }
  return null;
}

export function isCtl(c) {
  for (const is of c.list('ImageStream')) {
    const ns = is.metadata.namespace;
    is.spec ??= {};
    is.spec.lookupPolicy ??= { local: false };
    const status = (is.status ??= {});
    status.dockerImageRepository = `${REGISTRO_INTERNO}/${ns}/${is.metadata.name}`;
    status.tags ??= [];
    for (const t of is.spec.tags || []) {
      const o = origem(c, ns, t.from);
      if (!o) continue;
      let st = status.tags.find((x) => x.tag === t.name);
      if (!st) {
        st = { tag: t.name, items: [] };
        status.tags.push(st);
      }
      if (o.erro) {
        st.conditions = [{ type: 'ImportSuccess', status: 'False', reason: 'NotFound', message: o.erro, generation: is.metadata.generation, lastTransitionTime: c.iso() }];
        continue;
      }
      delete st.conditions;
      st.items ??= [];
      if (st.items[0]?.image !== o.digest) st.items.unshift({ created: c.iso(), dockerImageReference: o.ref, image: o.digest, generation: is.metadata.generation || 1 });
    }
    // Tags removidas do spec somem do status.
    status.tags = status.tags.filter((x) => (is.spec.tags || []).some((t) => t.name === x.tag) || x.manual);
    status.tags.sort((a, b) => a.tag.localeCompare(b.tag));
  }
  sincronizaIstags(c);
  gatilhosCtl(c);
}

// Mantém os objetos ImageStreamTag (`oc get istag`) iguais aos streams.
function sincronizaIstags(c) {
  const vistos = new Set();
  for (const is of c.list('ImageStream')) {
    const ns = is.metadata.namespace;
    for (const st of is.status?.tags || []) {
      const item = st.items?.[0];
      if (!item) continue;
      const nome = `${is.metadata.name}:${st.tag}`;
      vistos.add(`${ns}/${nome}`);
      const spec = (is.spec.tags || []).find((t) => t.name === st.tag);
      const dados = {
        image: { metadata: { name: item.image, creationTimestamp: item.created }, dockerImageReference: item.dockerImageReference },
        generation: item.generation,
        lookupPolicy: { local: Boolean(is.spec.lookupPolicy?.local) },
        tag: spec ? { name: spec.name, from: spec.from, importPolicy: spec.importPolicy || { importMode: 'Legacy' }, referencePolicy: spec.referencePolicy || { type: 'Source' }, generation: item.generation, annotations: null } : null,
      };
      const atual = c.get('ImageStreamTag', nome, ns);
      if (!atual) c.create({ kind: 'ImageStreamTag', metadata: { name: nome, namespace: ns, ownerReferences: [{ apiVersion: 'image.openshift.io/v1', kind: 'ImageStream', name: is.metadata.name, uid: is.metadata.uid }] }, ...dados });
      else if (atual.image?.metadata?.name !== item.image) Object.assign(atual, dados);
      else atual.lookupPolicy = dados.lookupPolicy;
    }
  }
  for (const t of c.list('ImageStreamTag')) if (!vistos.has(`${t.metadata.namespace}/${t.metadata.name}`)) c.delete('ImageStreamTag', t.metadata.name, t.metadata.namespace);
}

// Lê os gatilhos de um objeto: [{ from: {kind, name, namespace}, fieldPath, paused }].
export function gatilhos(o) {
  try {
    return JSON.parse(o.metadata.annotations?.[ANOTACAO_GATILHOS] || '[]');
  } catch {
    return [];
  }
}

const conteinerDoCaminho = (caminho) => /name=="([^"]+)"/.exec(caminho || '')?.[1];

function gatilhosCtl(c) {
  for (const d of [...c.list('Deployment'), ...c.list('StatefulSet')]) {
    const lista = gatilhos(d);
    if (!lista.length) continue;
    let mudou = false;
    for (const g of lista) {
      if (g.paused === 'true' || g.paused === true || g.from?.kind !== 'ImageStreamTag') continue;
      const [nome, tag = 'latest'] = g.from.name.split(':');
      const atual = imagemDaTag(c, g.from.namespace || d.metadata.namespace, nome, tag);
      if (!atual) continue;
      const alvo = conteinerDoCaminho(g.fieldPath);
      for (const ct of d.spec.template.spec.containers) {
        if (alvo && ct.name !== alvo) continue;
        if (ct.image !== atual.ref) {
          ct.image = atual.ref;
          mudou = true;
        }
      }
    }
    if (mudou) {
      d.metadata.generation = (d.metadata.generation || 1) + 1;
    }
  }
}

// Resolve `nome:tag` de um contêiner pelo image stream do projeto, quando o
// stream tem lookupPolicy.local (`oc set image-lookup`).
export function resolveNomeCurto(c, ns, imagem) {
  const ref = String(imagem || '');
  if (ref.includes('/') || ref.includes('@')) return imagem;
  const { repo, tag } = parseRef(ref);
  const is = c.get('ImageStream', repo, ns);
  if (!is?.spec?.lookupPolicy?.local) return imagem;
  return imagemDaTag(c, ns, repo, tag)?.ref || imagem;
}
