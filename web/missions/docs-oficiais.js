// Onde procurar na documentação oficial do OpenShift 4.22: o guia (livro) e os
// termos para buscar com Ctrl+F na versão de página única. Os guias foram
// conferidos no índice de docs.redhat.com em novembro de 2026.

export const VERSAO_DOCS = '4.22';
const BASE = `https://docs.redhat.com/en/documentation/openshift_container_platform/${VERSAO_DOCS}`;

export const GUIAS = {
  authentication_and_authorization: 'Authentication and authorization',
  building_applications: 'Building applications',
  cli_tools: 'CLI tools',
  images: 'Images',
  ingress_and_load_balancing: 'Ingress and load balancing',
  multiple_networks: 'Multiple networks',
  network_security: 'Network security',
  nodes: 'Nodes',
  operators: 'Operators',
  security_and_compliance: 'Security and compliance',
  updating_clusters: 'Updating clusters',
};

export const indiceDocs = () => BASE;
export const linkGuia = (slug) => `${BASE}/html-single/${slug}/index`;

// Missão → { guia, termos }.
export const DOCS = {
  'c0-primeiro-dia': { guia: 'cli_tools', termos: ['oc new-project', 'oc create deployment', 'oc expose'] },
  'c0-inventario': { guia: 'cli_tools', termos: ['jsonpath', 'custom-columns', '--selector'] },
  'c0-imagens': { guia: 'images', termos: ['image digest', 'skopeo', 'image pull policy'] },
  'c0-plantao': { guia: 'nodes', termos: ['oc logs', 'CrashLoopBackOff', 'oc describe pod'] },
  'c0-saude': { guia: 'cli_tools', termos: ['oc adm top', 'clusteroperators', 'oc get nodes'] },
  'c0-documentacao': { guia: 'cli_tools', termos: ['oc explain', '--help'] },
  'c1-manifestos': { guia: 'cli_tools', termos: ['oc apply', 'oc diff', 'oc replace'] },
  'c1-configuracao': { guia: 'nodes', termos: ['config map', 'envFrom', 'secret volume'] },
  'c1-kustomize-base': { guia: 'cli_tools', termos: ['kustomization', 'oc apply -k', 'kustomize'] },
  'c1-overlays': { guia: 'cli_tools', termos: ['kustomization', 'overlay', 'oc apply -k'] },
  'c1-exportar': { guia: 'cli_tools', termos: ['-o yaml', 'oc apply', 'oc replace'] },
  'c2-replicasets': { guia: 'building_applications', termos: ['ReplicaSet', 'selector', 'matchLabels'] },
  'c2-services': { guia: 'ingress_and_load_balancing', termos: ['Creating a route', 'targetPort', 'oc expose service'] },
  'c2-rollback': { guia: 'building_applications', termos: ['Rolling back', 'oc rollout undo', 'oc rollout history'] },
  'c2-templates': { guia: 'building_applications', termos: ['oc process', 'oc new-app', 'template'] },
  'c2-template-proprio': { guia: 'building_applications', termos: ['Creating a template', 'param-file', 'oc process'] },
  'c2-helm-install': { guia: 'building_applications', termos: ['Helm', 'helm repo add', 'helm install'] },
  'c2-helm-upgrade': { guia: 'building_applications', termos: ['Helm chart', 'helm list', 'helm install'] },
  'c3-htpasswd': { guia: 'authentication_and_authorization', termos: ['Configuring an htpasswd identity provider', 'Creating an htpasswd file', 'identityProviders'] },
  'c3-usuarios': { guia: 'authentication_and_authorization', termos: ['htpasswd -D', 'Creating an htpasswd file', 'oc delete identity'] },
  'c3-grupos': { guia: 'authentication_and_authorization', termos: ['oc adm groups', 'add-role-to-group', 'default cluster roles'] },
  'c3-papel-proprio': { guia: 'authentication_and_authorization', termos: ['Creating a local role', 'Creating a cluster role', 'rolebinding'] },
  'c3-kubeadmin': { guia: 'authentication_and_authorization', termos: ['Removing the kubeadmin user', 'cluster-admin', 'add-cluster-role-to-group'] },
  'c4-edge': { guia: 'ingress_and_load_balancing', termos: ['edge route with a custom certificate', 'insecureEdgeTerminationPolicy', 'oc create route edge'] },
  'c4-passthrough': { guia: 'ingress_and_load_balancing', termos: ['passthrough route', 'oc create route passthrough'] },
  'c4-service-ca': { guia: 'security_and_compliance', termos: ['service serving certificate', 'serving-cert-secret-name', 'inject-cabundle'] },
  'c4-netpol-isola': { guia: 'network_security', termos: ['deny all', 'allow-from-openshift-ingress', 'namespaceSelector'] },
  'c4-netpol-conserto': { guia: 'network_security', termos: ['network policy', 'podSelector', 'ports:'] },
  'c5-loadbalancer': { guia: 'ingress_and_load_balancing', termos: ['MetalLB', 'type: LoadBalancer', 'EXTERNAL-IP'] },
  'c5-metallb': { guia: 'ingress_and_load_balancing', termos: ['IPAddressPool', 'L2Advertisement', 'loadBalancerIP'] },
  'c5-nodeport': { guia: 'ingress_and_load_balancing', termos: ['NodePort', 'nodePort', 'service type'] },
  'c5-troubleshoot': { guia: 'ingress_and_load_balancing', termos: ['metallb.io/address-pool', 'autoAssign', 'L2Advertisement'] },
  'c5-udn': { guia: 'multiple_networks', termos: ['UserDefinedNetwork', 'k8s.ovn.org/primary-user-defined-network', 'Layer2'] },
  'c5-nad': { guia: 'multiple_networks', termos: ['host-device', 'NetworkAttachmentDefinition', 'k8s.v1.cni.cncf.io/networks'] },
  'c6-quota': { guia: 'building_applications', termos: ['Resource quotas per project', 'requests.cpu', 'oc create quota'] },
  'c6-limitrange': { guia: 'nodes', termos: ['limit range', 'defaultRequest', 'LimitRange'] },
  'c6-clusterquota': { guia: 'building_applications', termos: ['Resource quotas across multiple projects', 'ClusterResourceQuota', 'project-label-selector'] },
  'c6-template-projeto': { guia: 'building_applications', termos: ['Modify the template for new projects', 'create-bootstrap-project-template', 'projectRequestTemplate'] },
  'c6-self-provisioner': { guia: 'building_applications', termos: ['Disabling project self-provisioning', 'self-provisioners', 'projectRequestMessage'] },
  'c7-instalar': { guia: 'operators', termos: ['Installing from software catalog by using the CLI', 'OperatorGroup', 'Subscription'] },
  'c7-manual': { guia: 'operators', termos: ['installPlanApproval', 'startingCSV', 'Manual'] },
  'c7-travado': { guia: 'operators', termos: ['install modes', 'AllNamespaces', 'packagemanifest'] },
  'c7-remover': { guia: 'operators', termos: ['Deleting Operators from a cluster', 'oc delete clusterserviceversion', 'oc delete subscription'] },
  'c8-anyuid': { guia: 'authentication_and_authorization', termos: ['Managing security context constraints', 'add-scc-to-user', 'serviceAccountName'] },
  'c8-privilegiado': { guia: 'authentication_and_authorization', termos: ['privileged', 'add-scc-to-user', 'Role-based access to security context constraints'] },
  'c8-scc-diagnostico': { guia: 'authentication_and_authorization', termos: ['scc-subject-review', 'restricted-v2', 'runAsUser'] },
  'c8-api': { guia: 'authentication_and_authorization', termos: ['Using service accounts in applications', 'system:serviceaccount', 'oc policy add-role-to-user'] },
  'c8-job': { guia: 'nodes', termos: ['Running tasks in pods using jobs', 'completions', 'backoffLimit'] },
  'c8-cronjob': { guia: 'nodes', termos: ['cron job', 'schedule', 'concurrencyPolicy'] },
  'c9-zstream': { guia: 'updating_clusters', termos: ['Updating a cluster using the CLI', 'oc adm upgrade', 'update channels'] },
  'c9-minor': { guia: 'updating_clusters', termos: ['admin-acks', 'apirequestcounts', 'Upgradeable'] },
  'c9-operador': { guia: 'operators', termos: ['Updating installed Operators', 'Changing the update channel', 'Manual approval'] },
  'c9-quiz': { guia: 'updating_clusters', termos: ['update channels', 'EUS', 'rollback'] },
};
