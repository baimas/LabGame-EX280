// Operator Lifecycle Manager simulado: catálogo, Subscription → InstallPlan →
// ClusterServiceVersion → deployment do operator.
import { clone, rand } from './util.js';

export const CATALOGO_NS = 'openshift-marketplace';
export const CATALOGO = 'redhat-operators';

const SO_PROPRIO = { OwnNamespace: true, SingleNamespace: true, MultiNamespace: false, AllNamespaces: false };
const SO_GLOBAL = { OwnNamespace: false, SingleNamespace: false, MultiNamespace: false, AllNamespaces: true };

// Pacotes do catálogo `redhat-operators`. Versões em ordem crescente.
export const PACOTES = {
  'file-integrity-operator': { display: 'File Integrity Operator', canalPadrao: 'stable', modos: SO_PROPRIO, nsSugerido: 'openshift-file-integrity', canais: { stable: ['1.3.5', '1.3.6'] }, deploy: 'file-integrity-operator' },
  'compliance-operator': { display: 'Compliance Operator', canalPadrao: 'stable', modos: SO_PROPRIO, nsSugerido: 'openshift-compliance', canais: { stable: ['1.6.0', '1.6.1', '1.6.2'] }, deploy: 'compliance-operator' },
  'web-terminal': { display: 'Web Terminal', canalPadrao: 'fast', modos: SO_GLOBAL, canais: { fast: ['1.11.0', '1.12.1'] }, deploy: 'web-terminal-controller', depende: 'devworkspace-operator' },
  'devworkspace-operator': { display: 'DevWorkspace Operator', canalPadrao: 'fast', modos: SO_GLOBAL, canais: { fast: ['0.32.1'] }, deploy: 'devworkspace-controller-manager' },
  'cluster-logging': { display: 'Red Hat OpenShift Logging', canalPadrao: 'stable-6.2', modos: { ...SO_PROPRIO, AllNamespaces: true, OwnNamespace: true }, nsSugerido: 'openshift-logging', canais: { 'stable-6.1': ['6.1.4'], 'stable-6.2': ['6.2.2'] }, deploy: 'cluster-logging-operator' },
};

export const nomeCsv = (pkg, v) => `${pkg}.v${v}`;
const versaoDe = (csv) => csv.split('.v').slice(1).join('.v');
const ref = (o) => ({ apiVersion: o.apiVersion, kind: o.kind, name: o.metadata.name, uid: o.metadata.uid });

// Objetos do catálogo criados na instalação do cluster.
export function objetosCatalogo() {
  const out = [{ kind: 'CatalogSource', metadata: { name: CATALOGO, namespace: CATALOGO_NS }, spec: { displayName: 'Red Hat Operators', publisher: 'Red Hat', sourceType: 'grpc', image: 'registry.redhat.io/redhat/redhat-operator-index:v4.18' }, status: { connectionState: { lastObservedState: 'READY' } } }];
  for (const [nome, p] of Object.entries(PACOTES)) {
    out.push({
      kind: 'PackageManifest',
      metadata: { name: nome, labels: { catalog: CATALOGO, 'catalog-namespace': CATALOGO_NS, provider: 'Red Hat' } },
      status: {
        catalogSource: CATALOGO,
        catalogSourceDisplayName: 'Red Hat Operators',
        catalogSourceNamespace: CATALOGO_NS,
        catalogSourcePublisher: 'Red Hat',
        packageName: nome,
        provider: { name: 'Red Hat' },
        defaultChannel: p.canalPadrao,
        channels: Object.entries(p.canais).map(([canal, vs]) => ({
          name: canal,
          currentCSV: nomeCsv(nome, vs.at(-1)),
          currentCSVDesc: { displayName: p.display, version: vs.at(-1), installModes: Object.entries(p.modos).map(([type, supported]) => ({ type, supported })), ...(p.nsSugerido ? { annotations: { 'operatorframework.io/suggested-namespace': p.nsSugerido } } : {}) },
          entries: [...vs].reverse().map((v) => ({ name: nomeCsv(nome, v), version: v })),
        })),
      },
    });
  }
  return out;
}

// Modo de instalação pedido por um operator group.
export function modoDoGrupo(og, ns) {
  const alvos = og.spec?.targetNamespaces || [];
  if (og.spec?.selector || !alvos.length) return og.spec?.selector ? 'MultiNamespace' : 'AllNamespaces';
  if (alvos.length > 1) return 'MultiNamespace';
  return alvos[0] === ns ? 'OwnNamespace' : 'SingleNamespace';
}

function condicao(o, tipo, status, reason, message) {
  o.status ??= {};
  const outras = (o.status.conditions || []).filter((x) => x.type !== tipo);
  o.status.conditions = status ? [...outras, { type: tipo, status: 'True', reason, message }] : outras;
}

function assinaturas(c) {
  for (const s of c.list('Subscription')) {
    const ns = s.metadata.namespace;
    const nome = s.spec?.name;
    const p = PACOTES[nome];
    const st = (s.status ??= {});
    if (!p || s.spec.source !== CATALOGO || (s.spec.sourceNamespace || CATALOGO_NS) !== CATALOGO_NS) {
      condicao(s, 'ResolutionFailed', true, 'ConstraintsNotSatisfiable', `constraints not satisfiable: no operators found from catalog ${s.spec.source} in namespace ${s.spec.sourceNamespace} referenced by subscription ${s.metadata.name}, subscription ${s.metadata.name} exists`);
      continue;
    }
    const canal = s.spec.channel || p.canalPadrao;
    const versoes = p.canais[canal];
    if (!versoes) {
      condicao(s, 'ResolutionFailed', true, 'ConstraintsNotSatisfiable', `constraints not satisfiable: no operators found in channel ${canal} of package ${nome} in the catalog referenced by subscription ${s.metadata.name}, subscription ${s.metadata.name} exists`);
      continue;
    }
    condicao(s, 'ResolutionFailed', false);
    // Dependência: o OLM assina o pacote exigido no mesmo namespace.
    if (p.depende && !c.list('Subscription', ns).some((x) => x.spec?.name === p.depende)) {
      const d = PACOTES[p.depende];
      c.create({ kind: 'Subscription', metadata: { name: `${p.depende}-${d.canalPadrao}-${CATALOGO}-${CATALOGO_NS}`, namespace: ns }, spec: { channel: d.canalPadrao, name: p.depende, source: CATALOGO, sourceNamespace: CATALOGO_NS, installPlanApproval: s.spec.installPlanApproval || 'Automatic' } });
    }
    const pendente = st.installPlanRef && c.get('InstallPlan', st.installPlanRef.name, ns);
    if (pendente && pendente.status?.phase !== 'Complete') {
      st.state = 'UpgradePending';
      continue;
    }
    const instalada = st.installedCSV ? versaoDe(st.installedCSV) : null;
    let alvo;
    if (!instalada) {
      const inicio = s.spec.startingCSV && versoes.find((v) => nomeCsv(nome, v) === s.spec.startingCSV);
      alvo = inicio || versoes.at(-1);
    } else {
      // Atualiza de uma versão para a seguinte, como o grafo `replaces`.
      const i = versoes.indexOf(instalada);
      alvo = i >= 0 && i < versoes.length - 1 ? versoes[i + 1] : null;
    }
    if (!alvo) {
      st.state = 'AtLatestKnown';
      st.currentCSV = st.installedCSV;
      continue;
    }
    const auto = (s.spec.installPlanApproval || 'Automatic') === 'Automatic';
    const plano = c.create({
      kind: 'InstallPlan',
      metadata: { name: `install-${rand(5)}`, namespace: ns, ownerReferences: [ref(s)], labels: { [`operators.coreos.com/${nome}.${ns}`]: '' } },
      spec: { approval: auto ? 'Automatic' : 'Manual', approved: auto, clusterServiceVersionNames: [nomeCsv(nome, alvo)], generation: 1 },
      status: { phase: auto ? 'Installing' : 'RequiresApproval' },
    });
    Object.assign(st, { currentCSV: nomeCsv(nome, alvo), installPlanRef: { apiVersion: plano.apiVersion, kind: 'InstallPlan', name: plano.metadata.name, namespace: ns, uid: plano.metadata.uid }, installplan: { apiVersion: plano.apiVersion, kind: 'InstallPlan', name: plano.metadata.name }, state: 'UpgradePending', catalogHealth: [{ catalogSourceRef: { name: CATALOGO, namespace: CATALOGO_NS }, healthy: true }] });
  }
}

function planos(c) {
  for (const ip of c.list('InstallPlan')) {
    const ns = ip.metadata.namespace;
    if (ip.status?.phase === 'Complete') continue;
    if (!ip.spec.approved) {
      ip.status = { ...ip.status, phase: 'RequiresApproval' };
      continue;
    }
    for (const csvNome of ip.spec.clusterServiceVersionNames || []) {
      const [pkg] = csvNome.split('.v');
      const p = PACOTES[pkg];
      const versao = versaoDe(csvNome);
      const anterior = c.list('ClusterServiceVersion', ns).find((x) => x.metadata.name.startsWith(`${pkg}.v`) && x.metadata.name !== csvNome);
      if (anterior) c.delete('ClusterServiceVersion', anterior.metadata.name, ns);
      if (!c.get('ClusterServiceVersion', csvNome, ns)) {
        c.create({
          kind: 'ClusterServiceVersion',
          metadata: { name: csvNome, namespace: ns, labels: { [`operators.coreos.com/${pkg}.${ns}`]: '' }, annotations: { 'olm.operatorNamespace': ns } },
          spec: {
            displayName: p.display,
            version: versao,
            ...(anterior ? { replaces: anterior.metadata.name } : {}),
            provider: { name: 'Red Hat' },
            installModes: Object.entries(p.modos).map(([type, supported]) => ({ type, supported })),
            install: { strategy: 'deployment', spec: { deployments: [{ name: p.deploy }] } },
          },
          status: { phase: 'Pending' },
        });
      }
      const sub = c.list('Subscription', ns).find((x) => x.spec?.name === pkg);
      if (sub) sub.status.installedCSV = csvNome;
    }
    ip.status = { ...ip.status, phase: 'Complete' };
  }
}

function csvs(c) {
  for (const csv of c.list('ClusterServiceVersion')) {
    const ns = csv.metadata.namespace;
    const [pkg] = csv.metadata.name.split('.v');
    const p = PACOTES[pkg];
    if (!p) continue;
    const grupos = c.list('OperatorGroup', ns);
    let falha = null;
    if (!grupos.length) falha = ['NoOperatorGroup', 'csv in namespace with no operatorgroups'];
    else if (grupos.length > 1) falha = ['TooManyOperatorGroups', `csv created in namespace with multiple operatorgroups, can't pick one automatically`];
    else {
      const modo = modoDoGrupo(grupos[0], ns);
      if (!p.modos[modo]) falha = ['UnsupportedOperatorGroup', `${modo} InstallModeType not supported, cannot configure to watch ${modo === 'AllNamespaces' ? 'all namespaces' : (grupos[0].spec.targetNamespaces || []).join(',')}`];
    }
    const nomeDep = p.deploy;
    let dep = c.get('Deployment', nomeDep, ns);
    if (falha) {
      if (dep && (dep.metadata.ownerReferences || []).some((r) => r.uid === csv.metadata.uid)) c.delete('Deployment', nomeDep, ns);
      csv.status = { phase: 'Failed', reason: falha[0], message: falha[1] };
      continue;
    }
    if (!dep) {
      dep = c.create({
        kind: 'Deployment',
        metadata: { name: nomeDep, namespace: ns, labels: { 'olm.owner': csv.metadata.name, 'olm.owner.kind': 'ClusterServiceVersion', 'olm.owner.namespace': ns }, ownerReferences: [{ ...ref(csv), controller: false, blockOwnerDeletion: false }] },
        spec: { replicas: 1, selector: { matchLabels: { name: nomeDep } }, template: { metadata: { labels: { name: nomeDep } }, spec: { containers: [{ name: 'manager', image: `registry.redhat.io/${pkg}/${nomeDep}-rhel9:v${csv.spec.version}` }] } } },
      });
    }
    const pronto = (dep.status?.readyReplicas || 0) >= 1;
    csv.status = pronto ? { phase: 'Succeeded', reason: 'InstallSucceeded', message: 'install strategy completed with no errors' } : { phase: 'Installing', reason: 'InstallWaiting', message: `installing: waiting for deployment ${nomeDep} to become ready: deployment "${nomeDep}" not available: Deployment does not have minimum availability.` };
  }
}

export function olmCtl(c) {
  assinaturas(c);
  planos(c);
  csvs(c);
}

// Atalho das missões: instala um pacote e espera o operator subir.
export function instalaPacote(c, pkg, ns, { canal, aprovacao = 'Automatic', inicio, grupo = true } = {}) {
  if (!c.get('Namespace', ns)) c.create({ kind: 'Namespace', metadata: { name: ns } });
  if (grupo && !c.list('OperatorGroup', ns).length) c.create({ kind: 'OperatorGroup', metadata: { name: `${ns}-og`, namespace: ns }, spec: PACOTES[pkg].modos.OwnNamespace ? { targetNamespaces: [ns] } : {} });
  c.create({ kind: 'Subscription', metadata: { name: pkg, namespace: ns }, spec: { channel: canal || PACOTES[pkg].canalPadrao, name: pkg, source: CATALOGO, sourceNamespace: CATALOGO_NS, installPlanApproval: aprovacao, ...(inicio ? { startingCSV: inicio } : {}) } });
  c.tick(30);
  return clone(c.list('Subscription', ns).find((s) => s.spec.name === pkg));
}
