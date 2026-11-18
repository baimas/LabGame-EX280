// StatefulSet: pods com nome e volume estáveis (`NOME-0`, `NOME-1`...), criados
// em ordem (cada um espera o anterior ficar pronto) e removidos do maior para o
// menor. Cada réplica ganha um PVC próprio a partir de volumeClaimTemplates, e o
// PVC continua lá quando a réplica some.
import { clone, hashId } from './util.js';
import { podPronto } from './controllers.js';

const dono = (o) => ({ apiVersion: 'apps/v1', kind: 'StatefulSet', name: o.metadata.name, uid: o.metadata.uid, controller: true, blockOwnerDeletion: true });
const ehDele = (p, sts) => (p.metadata.ownerReferences || []).some((r) => r.uid === sts.metadata.uid);
const indice = (p) => Number(p.metadata.name.split('-').pop());

export function stsCtl(c) {
  for (const sts of c.list('StatefulSet')) {
    const ns = sts.metadata.namespace;
    const nome = sts.metadata.name;
    const revisao = `${nome}-${hashId(JSON.stringify(sts.spec.template), 10)}`;
    const desejado = sts.spec.replicas ?? 1;
    const paralelo = sts.spec.podManagementPolicy === 'Parallel';
    let meus = c.list('Pod', ns).filter((p) => ehDele(p, sts));

    // Remove do maior índice para o menor.
    for (const p of [...meus].sort((a, b) => indice(b) - indice(a))) {
      if (indice(p) < desejado) continue;
      c.delete('Pod', p.metadata.name, ns);
      c.event(sts, 'Normal', 'SuccessfulDelete', `delete Pod ${p.metadata.name} in StatefulSet ${nome} successful`, 'statefulset-controller');
      if (!paralelo) break;
    }
    meus = c.list('Pod', ns).filter((p) => ehDele(p, sts));

    // Cria em ordem; sem Parallel, só depois de o anterior ficar pronto.
    for (let i = 0; i < desejado; i++) {
      const nomePod = `${nome}-${i}`;
      const existente = meus.find((p) => p.metadata.name === nomePod);
      if (existente) {
        if (!paralelo && !podPronto(existente)) break;
        continue;
      }
      if (meus.some((p) => indice(p) >= desejado)) break;
      for (const t of sts.spec.volumeClaimTemplates || []) {
        const claim = `${t.metadata.name}-${nomePod}`;
        if (c.get('PersistentVolumeClaim', claim, ns)) continue;
        c.create({
          kind: 'PersistentVolumeClaim',
          metadata: { name: claim, namespace: ns, labels: clone(sts.spec.selector?.matchLabels || {}) },
          spec: clone(t.spec),
        });
        c.event(sts, 'Normal', 'SuccessfulCreate', `create Claim ${claim} Pod ${nomePod} in StatefulSet ${nome} success`, 'statefulset-controller');
      }
      const spec = clone(sts.spec.template.spec);
      spec.hostname = nomePod;
      if (sts.spec.serviceName) spec.subdomain = sts.spec.serviceName;
      for (const t of sts.spec.volumeClaimTemplates || []) {
        spec.volumes = (spec.volumes || []).filter((v) => v.name !== t.metadata.name);
        spec.volumes.push({ name: t.metadata.name, persistentVolumeClaim: { claimName: `${t.metadata.name}-${nomePod}` } });
      }
      let p;
      try {
        p = c.create({
          kind: 'Pod',
          metadata: {
            name: nomePod,
            namespace: ns,
            labels: { ...clone(sts.spec.template.metadata?.labels || {}), 'apps.kubernetes.io/pod-index': String(i), 'controller-revision-hash': revisao, 'statefulset.kubernetes.io/pod-name': nomePod },
            annotations: clone(sts.spec.template.metadata?.annotations),
            ownerReferences: [dono(sts)],
          },
          spec,
        });
      } catch (e) {
        if (!e.reason) throw e;
        const st = (c.side[sts.metadata.uid] ??= {});
        if (st.falha !== e.message) c.event(sts, 'Warning', 'FailedCreate', `create Pod ${nomePod} in StatefulSet ${nome} failed error: ${e.message.replace(/^Error from server \([A-Za-z]+\): /, '')}`, 'statefulset-controller');
        st.falha = e.message;
        break;
      }
      c.event(sts, 'Normal', 'SuccessfulCreate', `create Pod ${nomePod} in StatefulSet ${nome} successful`, 'statefulset-controller');
      meus.push(p);
      if (!paralelo) break;
    }

    // Atualização contínua: troca um pod desatualizado por vez, do maior para o menor.
    const todosProntos = meus.length === desejado && meus.every(podPronto);
    if (todosProntos && sts.spec.updateStrategy?.type !== 'OnDelete') {
      const velho = [...meus].sort((a, b) => indice(b) - indice(a)).find((p) => p.metadata.labels?.['controller-revision-hash'] !== revisao);
      if (velho) {
        c.delete('Pod', velho.metadata.name, ns);
        c.event(sts, 'Normal', 'SuccessfulDelete', `delete Pod ${velho.metadata.name} in StatefulSet ${nome} successful`, 'statefulset-controller');
      }
    }

    meus = c.list('Pod', ns).filter((p) => ehDele(p, sts));
    const prontos = meus.filter(podPronto).length;
    const atualizados = meus.filter((p) => p.metadata.labels?.['controller-revision-hash'] === revisao).length;
    sts.status = {
      observedGeneration: sts.metadata.generation,
      replicas: meus.length,
      readyReplicas: prontos,
      currentReplicas: atualizados,
      updatedReplicas: atualizados,
      availableReplicas: prontos,
      currentRevision: revisao,
      updateRevision: revisao,
      collisionCount: 0,
    };
  }
}

// Padrões que o servidor de API preenche num StatefulSet.
export function padroesSts(o) {
  o.spec.replicas ??= 1;
  o.spec.podManagementPolicy ??= 'OrderedReady';
  o.spec.updateStrategy ??= { type: 'RollingUpdate', rollingUpdate: { partition: 0 } };
  o.spec.revisionHistoryLimit ??= 10;
  o.spec.persistentVolumeClaimRetentionPolicy ??= { whenDeleted: 'Retain', whenScaled: 'Retain' };
  for (const t of o.spec.volumeClaimTemplates || []) {
    t.apiVersion ??= 'v1';
    t.kind ??= 'PersistentVolumeClaim';
    t.spec.volumeMode ??= 'Filesystem';
  }
}
