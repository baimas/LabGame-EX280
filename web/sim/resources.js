// Catálogo de tipos de recurso que o simulador conhece.

const def = (kind, plural, short, namespaced, apiVersion) => {
  const grupo = apiVersion.includes('/') ? apiVersion.split('/')[0] : '';
  return {
    kind,
    plural,
    singular: kind.toLowerCase(),
    short,
    namespaced,
    apiVersion,
    group: grupo,
    // Nome usado em mensagens de erro: `deployments.apps "x" not found`
    resource: grupo ? `${plural}.${grupo}` : plural,
    // Nome usado em saídas: `deployment.apps/x created`
    out: grupo ? `${kind.toLowerCase()}.${grupo}` : kind.toLowerCase(),
  };
};

export const KINDS = [
  def('Namespace', 'namespaces', ['ns'], false, 'v1'),
  def('Node', 'nodes', ['no'], false, 'v1'),
  def('Pod', 'pods', ['po'], true, 'v1'),
  def('Service', 'services', ['svc'], true, 'v1'),
  def('Endpoints', 'endpoints', ['ep'], true, 'v1'),
  def('ConfigMap', 'configmaps', ['cm'], true, 'v1'),
  def('Secret', 'secrets', [], true, 'v1'),
  def('ServiceAccount', 'serviceaccounts', ['sa'], true, 'v1'),
  def('Event', 'events', ['ev'], true, 'v1'),
  def('PersistentVolumeClaim', 'persistentvolumeclaims', ['pvc'], true, 'v1'),
  def('ResourceQuota', 'resourcequotas', ['quota'], true, 'v1'),
  def('LimitRange', 'limitranges', ['limits'], true, 'v1'),
  def('Deployment', 'deployments', ['deploy'], true, 'apps/v1'),
  def('ReplicaSet', 'replicasets', ['rs'], true, 'apps/v1'),
  def('Job', 'jobs', [], true, 'batch/v1'),
  def('CronJob', 'cronjobs', ['cj'], true, 'batch/v1'),
  def('Route', 'routes', [], true, 'route.openshift.io/v1'),
  def('NetworkPolicy', 'networkpolicies', ['netpol'], true, 'networking.k8s.io/v1'),
  def('Role', 'roles', [], true, 'rbac.authorization.k8s.io/v1'),
  def('RoleBinding', 'rolebindings', [], true, 'rbac.authorization.k8s.io/v1'),
  def('ClusterRole', 'clusterroles', [], false, 'rbac.authorization.k8s.io/v1'),
  def('ClusterRoleBinding', 'clusterrolebindings', [], false, 'rbac.authorization.k8s.io/v1'),
  def('User', 'users', [], false, 'user.openshift.io/v1'),
  def('Group', 'groups', [], false, 'user.openshift.io/v1'),
  def('Identity', 'identities', [], false, 'user.openshift.io/v1'),
  def('OAuth', 'oauths', [], false, 'config.openshift.io/v1'),
  def('ClusterOperator', 'clusteroperators', ['co'], false, 'config.openshift.io/v1'),
  def('ClusterVersion', 'clusterversions', [], false, 'config.openshift.io/v1'),
  def('Template', 'templates', [], true, 'template.openshift.io/v1'),
  def('ImageStream', 'imagestreams', ['is'], true, 'image.openshift.io/v1'),
  def('SecurityContextConstraints', 'securitycontextconstraints', ['scc'], false, 'security.openshift.io/v1'),
  def('MetalLB', 'metallbs', [], true, 'metallb.io/v1beta1'),
  def('IPAddressPool', 'ipaddresspools', [], true, 'metallb.io/v1beta1'),
  def('L2Advertisement', 'l2advertisements', [], true, 'metallb.io/v1beta1'),
  def('CatalogSource', 'catalogsources', ['catsrc'], true, 'operators.coreos.com/v1alpha1'),
  // No OpenShift é namespaced, mas aparece em qualquer namespace; aqui fica global.
  def('PackageManifest', 'packagemanifests', [], false, 'packages.operators.coreos.com/v1'),
  def('OperatorGroup', 'operatorgroups', ['og'], true, 'operators.coreos.com/v1'),
  def('Subscription', 'subscriptions', ['sub', 'subs'], true, 'operators.coreos.com/v1alpha1'),
  def('InstallPlan', 'installplans', ['ip'], true, 'operators.coreos.com/v1alpha1'),
  def('ClusterServiceVersion', 'clusterserviceversions', ['csv', 'csvs'], true, 'operators.coreos.com/v1alpha1'),
  def('FileIntegrity', 'fileintegrities', [], true, 'fileintegrity.openshift.io/v1alpha1'),
  def('APIRequestCount', 'apirequestcounts', [], false, 'apiserver.openshift.io/v1'),
  def('ClusterResourceQuota', 'clusterresourcequotas', ['clusterquota'], false, 'quota.openshift.io/v1'),
];

// `Project` é uma visão de Namespace, como no OpenShift.
export const PROJECT = { ...def('Project', 'projects', [], false, 'project.openshift.io/v1'), alias: 'Namespace' };

// Configuração de projetos do cluster (`projects.config.openshift.io`). Tem
// o mesmo kind de Project, então só responde pelos nomes com o grupo.
// Internamente o kind é ProjectConfig; nas saídas aparece como Project.
export const PROJECT_CONFIG = { ...def('ProjectConfig', 'projects', [], false, 'config.openshift.io/v1'), singular: 'project', out: 'project.config.openshift.io', exibe: 'Project' };

const indice = new Map();
for (const k of [...KINDS, PROJECT]) {
  for (const nome of [k.kind.toLowerCase(), k.plural, ...k.short]) {
    indice.set(nome, k);
    if (k.group) indice.set(`${nome}.${k.group}`, k);
    // `clusterrolebinding.rbac`, `route.route`...
    if (k.group) indice.set(`${nome}.${k.group.split('.')[0]}`, k);
  }
}
for (const nome of ['project', 'projects']) indice.set(`${nome}.config.openshift.io`, PROJECT_CONFIG);
indice.set('projectconfig', PROJECT_CONFIG);

// Tipo de um objeto, olhando também o apiVersion.
export function kindDoObjeto(o) {
  if (o?.kind === 'Project' && String(o.apiVersion || '').startsWith('config.openshift.io')) return PROJECT_CONFIG;
  return kindOf(o?.kind);
}

// Resolve `deploy`, `deployments`, `Deployment`, `deployment.apps`...
export function kindOf(nome) {
  if (!nome) return null;
  if (typeof nome === 'object') return nome;
  return indice.get(String(nome).toLowerCase()) || null;
}

// Tipos incluídos em `oc get all`.
export const ALL = ['Pod', 'Service', 'Deployment', 'ReplicaSet', 'Job', 'CronJob', 'Route'];
