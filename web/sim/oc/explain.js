// `oc explain`: esquema resumido dos recursos que a prova cobra.
import { kindOf } from '../resources.js';

// Construtores de nós do esquema.
const obj = (d, f, extra = {}) => ({ t: 'Object', d, f, ...extra });
const lista = (d, f, extra = {}) => ({ t: '[]Object', d, f, ...extra });
const str = (d, extra = {}) => ({ t: 'string', d, ...extra });
const int = (d, extra = {}) => ({ t: 'integer', d, ...extra });
const bool = (d) => ({ t: 'boolean', d });
const mapa = (d) => ({ t: 'map[string]string', d });
const strs = (d) => ({ t: '[]string', d });
const ios = (d) => ({ t: 'IntOrString', d });
const req = { r: true };

const LABEL_SELECTOR = (d) => obj(d, {
  matchExpressions: lista('matchExpressions is a list of label selector requirements. The requirements are ANDed.', { key: str('key is the label key that the selector applies to.', req), operator: str('operator represents a key\'s relationship to a set of values. Valid operators are In, NotIn, Exists and DoesNotExist.', req), values: strs('values is an array of string values.') }),
  matchLabels: mapa('matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions.'),
});

const METADATA = obj('Standard object\'s metadata.', {
  annotations: mapa('Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata.'),
  creationTimestamp: str('CreationTimestamp is a timestamp representing the server time when this object was created.'),
  generateName: str('GenerateName is an optional prefix, used by the server, to generate a unique name ONLY IF the Name field has not been provided.'),
  labels: mapa('Map of string keys and values that can be used to organize and categorize (scope and select) objects.'),
  name: str('Name must be unique within a namespace.'),
  namespace: str('Namespace defines the space within which each name must be unique.'),
  ownerReferences: lista('List of objects depended by this object.', { apiVersion: str('API version of the referent.', req), kind: str('Kind of the referent.', req), name: str('Name of the referent.', req), uid: str('UID of the referent.', req) }),
  uid: str('UID is the unique in time and space value for this object.'),
});

const RESOURCES = obj('Compute Resources required by this container.', {
  limits: { t: 'map[string]Quantity', d: 'Limits describes the maximum amount of compute resources allowed.' },
  requests: { t: 'map[string]Quantity', d: 'Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value.' },
});

const REF_CHAVE = (tipo) => obj(`Selects a key of a ${tipo}.`, { key: str(`The key to select.`, req), name: str(`Name of the referent.`), optional: bool(`Specify whether the ${tipo} or its key must be defined`) });

const PROBE = obj('Periodic probe of container liveness or readiness.', {
  exec: obj('Exec specifies a command to execute in the container.', { command: strs('Command is the command line to execute inside the container.') }),
  failureThreshold: int('Minimum consecutive failures for the probe to be considered failed after having succeeded. Defaults to 3.'),
  httpGet: obj('HTTPGet specifies an HTTP GET request to perform.', { path: str('Path to access on the HTTP server.'), port: ios('Name or number of the port to access on the container.'), scheme: str('Scheme to use for connecting to the host. Defaults to HTTP.') }),
  initialDelaySeconds: int('Number of seconds after the container has started before liveness probes are initiated.'),
  periodSeconds: int('How often (in seconds) to perform the probe. Default to 10 seconds.'),
  tcpSocket: obj('TCPSocket specifies a connection to a TCP port.', { port: ios('Number or name of the port to access on the container.') }),
  timeoutSeconds: int('Number of seconds after which the probe times out. Defaults to 1 second.'),
});

const SEC_CTX = obj('SecurityContext defines the security options the container should be run with.', {
  allowPrivilegeEscalation: bool('AllowPrivilegeEscalation controls whether a process can gain more privileges than its parent process.'),
  capabilities: obj('The capabilities to add/drop when running containers.', { add: strs('Added capabilities'), drop: strs('Removed capabilities') }),
  privileged: bool('Run container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host.'),
  readOnlyRootFilesystem: bool('Whether this container has a read-only root filesystem.'),
  runAsGroup: int('The GID to run the entrypoint of the container process.'),
  runAsNonRoot: bool('Indicates that the container must run as a non-root user.'),
  runAsUser: int('The UID to run the entrypoint of the container process.'),
});

const CONTAINER = lista('List of containers belonging to the pod. Containers cannot currently be added or removed.', {
  args: strs('Arguments to the entrypoint.'),
  command: strs('Entrypoint array. Not executed within a shell. The container image\'s ENTRYPOINT is used if this is not provided.'),
  env: lista('List of environment variables to set in the container.', {
    name: str('Name of the environment variable. Must be a C_IDENTIFIER.', req),
    value: str('Variable references $(VAR_NAME) are expanded using the previously defined environment variables in the container.'),
    valueFrom: obj('Source for the environment variable\'s value. Cannot be used if value is not empty.', { configMapKeyRef: REF_CHAVE('ConfigMap'), fieldRef: obj('Selects a field of the pod.', { fieldPath: str('Path of the field to select in the specified API version.', req) }), secretKeyRef: REF_CHAVE('secret') }),
  }),
  envFrom: lista('List of sources to populate environment variables in the container.', {
    configMapRef: obj('The ConfigMap to select from', { name: str('Name of the referent.'), optional: bool('Specify whether the ConfigMap must be defined') }),
    prefix: str('An optional identifier to prepend to each key in the ConfigMap. Must be a C_IDENTIFIER.'),
    secretRef: obj('The Secret to select from', { name: str('Name of the referent.'), optional: bool('Specify whether the Secret must be defined') }),
  }),
  image: str('Container image name.'),
  imagePullPolicy: str('Image pull policy. One of Always, Never, IfNotPresent. Defaults to Always if :latest tag is specified, or IfNotPresent otherwise.'),
  livenessProbe: PROBE,
  name: str('Name of the container specified as a DNS_LABEL. Each container in a pod must have a unique name (DNS_LABEL).', req),
  ports: lista('List of ports to expose from the container.', { containerPort: int('Number of port to expose on the pod\'s IP address.', req), name: str('If specified, this must be an IANA_SVC_NAME and unique within the pod.'), protocol: str('Protocol for port. Must be UDP, TCP, or SCTP. Defaults to "TCP".') }),
  readinessProbe: PROBE,
  resources: RESOURCES,
  securityContext: SEC_CTX,
  volumeMounts: lista('Pod volumes to mount into the container\'s filesystem.', { mountPath: str('Path within the container at which the volume should be mounted. Must not contain \':\'.', req), name: str('This must match the Name of a Volume.', req), readOnly: bool('Mounted read-only if true, read-write otherwise (false or unspecified).'), subPath: str('Path within the volume from which the container\'s volume should be mounted.') }),
});

const POD_SPEC = obj('Specification of the desired behavior of the pod.', {
  containers: CONTAINER,
  initContainers: { ...CONTAINER, d: 'List of initialization containers belonging to the pod.' },
  nodeName: str('NodeName indicates in which node this pod is scheduled.'),
  nodeSelector: mapa('NodeSelector is a selector which must be true for the pod to fit on a node. Selector which must match a node\'s labels for the pod to be scheduled on that node.'),
  restartPolicy: str('Restart policy for all containers within the pod. One of Always, OnFailure, Never. Default to Always.'),
  securityContext: obj('SecurityContext holds pod-level security attributes and common container settings.', { fsGroup: int('A special supplemental group that applies to all containers in a pod.'), runAsNonRoot: bool('Indicates that the container must run as a non-root user.'), runAsUser: int('The UID to run the entrypoint of the container process.') }),
  serviceAccountName: str('ServiceAccountName is the name of the ServiceAccount to use to run this pod.'),
  tolerations: lista('If specified, the pod\'s tolerations.', { effect: str('Effect indicates the taint effect to match.'), key: str('Key is the taint key that the toleration applies to.'), operator: str('Operator represents a key\'s relationship to the value.'), value: str('Value is the taint value the toleration matches to.') }),
  volumes: lista('List of volumes that can be mounted by containers belonging to the pod.', {
    configMap: obj('configMap represents a configMap that should populate this volume', { defaultMode: int('defaultMode is optional: mode bits used to set permissions on created files by default.'), items: lista('items if unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected into the volume as a file whose name is the key and content is the value.', { key: str('key is the key to project.', req), path: str('path is the relative path of the file to map the key to.', req) }), name: str('Name of the referent.') }),
    emptyDir: obj('emptyDir represents a temporary directory that shares a pod\'s lifetime.', { medium: str('medium represents what type of storage medium should back this directory.'), sizeLimit: { t: 'Quantity', d: 'sizeLimit is the total amount of local storage required for this EmptyDir volume.' } }),
    name: str('name of the volume. Must be a DNS_LABEL and unique within the pod.', req),
    persistentVolumeClaim: obj('persistentVolumeClaimVolumeSource represents a reference to a PersistentVolumeClaim in the same namespace.', { claimName: str('claimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume.', req), readOnly: bool('readOnly Will force the ReadOnly setting in VolumeMounts.') }),
    secret: obj('secret represents a secret that should populate this volume.', { items: lista('items If unspecified, each key-value pair in the Data field of the referenced Secret will be projected into the volume as a file whose name is the key and content is the value.', { key: str('key is the key to project.', req), path: str('path is the relative path of the file to map the key to.', req) }), secretName: str('secretName is the name of the secret in the pod\'s namespace to use.') }),
  }),
});

const POD_TEMPLATE = obj('Template describes the pods that will be created.', { metadata: METADATA, spec: POD_SPEC }, req);

const base = (d, campos) => obj(d, { apiVersion: str('APIVersion defines the versioned schema of this representation of an object.'), kind: str('Kind is a string value representing the REST resource this object represents.'), metadata: METADATA, ...campos });

const ESQUEMAS = {
  Pod: base('Pod is a collection of containers that can run on a host. This resource is created by clients and scheduled onto hosts.', { spec: POD_SPEC, status: obj('Most recently observed status of the pod.', { conditions: lista('Current service state of pod.', { status: str('Status is the status of the condition. Can be True, False, Unknown.', req), type: str('Type is the type of the condition.', req) }), phase: str('The phase of a Pod is a simple, high-level summary of where the Pod is in its lifecycle. Possible values: Pending, Running, Succeeded, Failed, Unknown.'), podIP: str('podIP address allocated to the pod.') }) }),
  Deployment: base('Deployment enables declarative updates for Pods and ReplicaSets.', {
    spec: obj('Specification of the desired behavior of the Deployment.', {
      minReadySeconds: int('Minimum number of seconds for which a newly created pod should be ready without any of its container crashing, for it to be considered available.'),
      paused: bool('Indicates that the deployment is paused.'),
      replicas: int('Number of desired pods. This is a pointer to distinguish between explicit zero and not specified. Defaults to 1.'),
      revisionHistoryLimit: int('The number of old ReplicaSets to retain to allow rollback. Defaults to 10.'),
      selector: LABEL_SELECTOR('Label selector for pods. Existing ReplicaSets whose pods are selected by this will be the ones affected by this deployment. It must match the pod template\'s labels.'),
      strategy: obj('The deployment strategy to use to replace existing pods with new ones.', { rollingUpdate: obj('Rolling update config params. Present only if DeploymentStrategyType = RollingUpdate.', { maxSurge: ios('The maximum number of pods that can be scheduled above the desired number of pods.'), maxUnavailable: ios('The maximum number of pods that can be unavailable during the update.') }), type: str('Type of deployment. Can be "Recreate" or "RollingUpdate". Default is RollingUpdate.') }),
      template: POD_TEMPLATE,
    }, req),
    status: obj('Most recently observed status of the Deployment.', { availableReplicas: int('Total number of available pods (ready for at least minReadySeconds) targeted by this deployment.'), readyReplicas: int('readyReplicas is the number of pods targeted by this Deployment with a Ready Condition.'), replicas: int('Total number of non-terminated pods targeted by this deployment (their labels match the selector).'), updatedReplicas: int('Total number of non-terminated pods targeted by this deployment that have the desired template spec.') }),
  }),
  Service: base('Service is a named abstraction of software service (for example, mysql) consisting of local port (for example 3306) that the proxy listens on, and the selector that determines which pods will answer requests sent through the proxy.', {
    spec: obj('Spec defines the behavior of a service.', {
      clusterIP: str('clusterIP is the IP address of the service and is usually assigned randomly.'),
      externalName: str('externalName is the external reference that discovery mechanisms will return as an alias for this service (e.g. a DNS CNAME record).'),
      ports: lista('The list of ports that are exposed by this service.', { name: str('The name of this port within the service.'), nodePort: int('The port on each node on which this service is exposed when type is NodePort or LoadBalancer.'), port: int('The port that will be exposed by this service.', req), protocol: str('The IP protocol for this port. Supports "TCP", "UDP", and "SCTP". Default is TCP.'), targetPort: ios('Number or name of the port to access on the pods targeted by the service.') }),
      selector: mapa('Route service traffic to pods with label keys and values matching this selector.'),
      sessionAffinity: str('Supports "ClientIP" and "None". Used to maintain session affinity.'),
      type: str('type determines how the Service is exposed. Defaults to ClusterIP. Valid options are ExternalName, ClusterIP, NodePort, and LoadBalancer.'),
    }),
  }),
  Route: base('A route allows developers to expose services through an HTTP(S) aware load balancing and proxy layer via a public DNS entry.', {
    spec: obj('spec is the desired state of the route', {
      host: str('host is an alias/DNS that points to the service. Optional. If not specified a route name will typically be automatically chosen.'),
      path: str('path that the router watches for, to route traffic for to the service. Optional'),
      port: obj('If specified, the port to be used by the router.', { targetPort: ios('The target port on pods selected by the service this route points to. If this is a string, it will be looked up as a named port in the target endpoints port list.', req) }),
      tls: obj('The tls field provides the ability to configure certificates and termination for the route.', {
        caCertificate: str('caCertificate provides the cert authority certificate contents'),
        certificate: str('certificate provides certificate contents. This should be a single serving certificate, not a certificate chain.'),
        destinationCACertificate: str('destinationCACertificate provides the contents of the ca certificate of the final destination. When using reencrypt termination this file should be provided in order to have routers use it for health checks on the secure connection.'),
        insecureEdgeTerminationPolicy: str('insecureEdgeTerminationPolicy indicates the desired behavior for insecure connections to a route. Allow, None, or Redirect.'),
        key: str('key provides key file contents'),
        termination: str('termination indicates termination type. edge, passthrough, or reencrypt.', req),
      }),
      to: obj('to is an object the route should use as the primary backend.', { kind: str('The kind of target that the route is referring to. Currently, only \'Service\' is allowed', req), name: str('name of the service/target that is being referred to.', req), weight: int('weight as an integer between 0 and 256, default 100.') }, req),
      wildcardPolicy: str('Wildcard policy if any for the route. Allowed values are \'Subdomain\' or \'None\'.'),
    }, req),
  }),
  ConfigMap: base('ConfigMap holds configuration data for pods to consume.', { binaryData: { t: 'map[string]string', d: 'BinaryData contains the binary data.' }, data: mapa('Data contains the configuration data. Each key must consist of alphanumeric characters, \'-\', \'_\' or \'.\'.'), immutable: bool('Immutable, if set to true, ensures that data stored in the ConfigMap cannot be updated (only object metadata can be modified).') }),
  Secret: base('Secret holds secret data of a certain type. The total bytes of the values in the Data field must be less than MaxSecretSize bytes.', { data: mapa('Data contains the secret data. The serialized form of the secret data is a base64 encoded string, representing the arbitrary (possibly non-string) data value here.'), immutable: bool('Immutable, if set to true, ensures that data stored in the Secret cannot be updated.'), stringData: mapa('stringData allows specifying non-binary secret data in string form. It is provided as a write-only input field for convenience. All keys and values are merged into the data field on write.'), type: str('Used to facilitate programmatic handling of secret data.') }),
  NetworkPolicy: base('NetworkPolicy describes what network traffic is allowed for a set of Pods', {
    spec: obj('spec represents the specification of the desired behavior for this NetworkPolicy.', {
      egress: lista('egress is a list of egress rules to be applied to the selected pods.', { ports: lista('ports is a list of destination ports for outgoing traffic.', { endPort: int('endPort indicates that the range of ports from port to endPort if set, inclusive, should be allowed by the policy.'), port: ios('port represents the port on the given protocol. This can either be a numerical or named port on a pod.'), protocol: str('protocol represents the protocol (TCP, UDP, or SCTP) which traffic must match. If not specified, this field defaults to TCP.') }), to: lista('to is a list of destinations for outgoing traffic of pods selected for this rule.', { ipBlock: obj('ipBlock defines policy on a particular IPBlock.', { cidr: str('cidr is a string representing the IPBlock', req), except: strs('except is a slice of CIDRs that should not be included within an IPBlock') }), namespaceSelector: LABEL_SELECTOR('namespaceSelector selects namespaces using cluster-scoped labels.'), podSelector: LABEL_SELECTOR('podSelector is a label selector which selects pods.') }) }),
      ingress: lista('ingress is a list of ingress rules to be applied to the selected pods.', { from: lista('from is a list of sources which should be able to access the pods selected for this rule. If this field is empty or missing, this rule matches all sources (traffic not restricted by source).', { ipBlock: obj('ipBlock defines policy on a particular IPBlock.', { cidr: str('cidr is a string representing the IPBlock', req), except: strs('except is a slice of CIDRs that should not be included within an IPBlock') }), namespaceSelector: LABEL_SELECTOR('namespaceSelector selects namespaces using cluster-scoped labels. This field follows standard label selector semantics; if present but empty, it selects all namespaces.'), podSelector: LABEL_SELECTOR('podSelector is a label selector which selects pods. If namespaceSelector is also set, then the NetworkPolicyPeer as a whole selects the pods matching podSelector in the Namespaces selected by NamespaceSelector. Otherwise it selects the pods matching podSelector in the policy\'s own namespace.') }), ports: lista('ports is a list of ports which should be made accessible on the pods selected for this rule.', { endPort: int('endPort indicates that the range of ports from port to endPort if set, inclusive, should be allowed by the policy.'), port: ios('port represents the port on the given protocol. This can either be a numerical or named port on a pod.'), protocol: str('protocol represents the protocol (TCP, UDP, or SCTP) which traffic must match.') }) }),
      podSelector: LABEL_SELECTOR('podSelector selects the pods to which this NetworkPolicy object applies. An empty podSelector matches all pods in this namespace.'),
      policyTypes: strs('policyTypes is a list of rule types that the NetworkPolicy relates to. Valid options are ["Ingress"], ["Egress"], or ["Ingress", "Egress"].'),
    }),
  }),
  ResourceQuota: base('ResourceQuota sets aggregate quota restrictions enforced per namespace', { spec: obj('Spec defines the desired quota.', { hard: { t: 'map[string]Quantity', d: 'hard is the set of desired hard limits for each named resource.' }, scopes: strs('A collection of filters that must match each object tracked by a quota.') }), status: obj('Status defines the actual enforced quota and its current usage.', { hard: { t: 'map[string]Quantity', d: 'Hard is the set of enforced hard limits for each named resource.' }, used: { t: 'map[string]Quantity', d: 'Used is the current observed total usage of the resource in the namespace.' } }) }),
  LimitRange: base('LimitRange sets resource usage limits for each kind of resource in a Namespace.', { spec: obj('Spec defines the limits enforced.', { limits: lista('Limits is the list of LimitRangeItem objects that are enforced.', { default: { t: 'map[string]Quantity', d: 'Default resource requirement limit value by resource name if resource limit is omitted.' }, defaultRequest: { t: 'map[string]Quantity', d: 'DefaultRequest is the default resource requirement request value by resource name if resource request is omitted.' }, max: { t: 'map[string]Quantity', d: 'Max usage constraints on this kind by resource name.' }, maxLimitRequestRatio: { t: 'map[string]Quantity', d: 'MaxLimitRequestRatio if specified, the named resource must have a request and limit that are both non-zero where limit divided by request is less than or equal to the enumerated value.' }, min: { t: 'map[string]Quantity', d: 'Min usage constraints on this kind by resource name.' }, type: str('Type of resource that this limit applies to. Container, Pod, or PersistentVolumeClaim.', req) }, req) }) }),
  Namespace: base('Namespace provides a scope for Names. Use of multiple namespaces is optional.', { spec: obj('Spec defines the behavior of the Namespace.', { finalizers: strs('Finalizers is an opaque list of values that must be empty to permanently remove object from storage.') }) }),
  ServiceAccount: base('ServiceAccount binds together: * a name, understood by users, and perhaps by peripheral systems, for an identity * a principal that can be authenticated and authorized * a set of secrets', { automountServiceAccountToken: bool('AutomountServiceAccountToken indicates whether pods running as this service account should have an API token automatically mounted.'), imagePullSecrets: lista('ImagePullSecrets is a list of references to secrets in the same namespace to use for pulling any images in pods that reference this ServiceAccount.', { name: str('Name of the referent.') }) }),
  PersistentVolumeClaim: base('PersistentVolumeClaim is a user\'s request for and claim to a persistent volume', { spec: obj('spec defines the desired characteristics of a volume requested by a pod author.', { accessModes: strs('accessModes contains the desired access modes the volume should have.'), resources: obj('resources represents the minimum resources the volume should have.', { requests: { t: 'map[string]Quantity', d: 'Requests describes the minimum amount of compute resources required.' } }), storageClassName: str('storageClassName is the name of the StorageClass required by the claim.') }) }),
};

const REGRAS = lista('Rules holds all the PolicyRules for this Role', { apiGroups: strs('APIGroups is the name of the APIGroup that contains the resources.'), resourceNames: strs('ResourceNames is an optional white list of names that the rule applies to.'), resources: strs('Resources is a list of resources this rule applies to. \'*\' represents all resources.'), verbs: strs('Verbs is a list of Verbs that apply to ALL the ResourceKinds contained in this rule. \'*\' represents all verbs.', ) });
const SUJEITOS = lista('Subjects holds references to the objects the role applies to.', { apiGroup: str('APIGroup holds the API group of the referenced subject.'), kind: str('Kind of object being referenced. Values defined by this API group are "User", "Group", and "ServiceAccount".', req), name: str('Name of the object being referenced.', req), namespace: str('Namespace of the referenced object.') });
const ROLE_REF = obj('RoleRef can reference a Role in the current namespace or a ClusterRole in the global namespace.', { apiGroup: str('APIGroup is the group for the resource being referenced', req), kind: str('Kind is the type of resource being referenced', req), name: str('Name is the name of resource being referenced', req) }, req);
ESQUEMAS.Role = base('Role is a namespaced, logical grouping of PolicyRules that can be referenced as a unit by a RoleBinding.', { rules: REGRAS });
ESQUEMAS.ClusterRole = base('ClusterRole is a cluster level, logical grouping of PolicyRules that can be referenced as a unit by a RoleBinding or ClusterRoleBinding.', { rules: REGRAS });
ESQUEMAS.RoleBinding = base('RoleBinding references a role, but does not contain it. It can reference a Role in the same namespace or a ClusterRole in the global namespace.', { roleRef: ROLE_REF, subjects: SUJEITOS });
ESQUEMAS.ClusterRoleBinding = base('ClusterRoleBinding references a ClusterRole, but not contain it.', { roleRef: ROLE_REF, subjects: SUJEITOS });
ESQUEMAS.ReplicaSet = base('ReplicaSet ensures that a specified number of pod replicas are running at any given time.', { spec: obj('Spec defines the specification of the desired behavior of the ReplicaSet.', { replicas: int('Replicas is the number of desired replicas.'), selector: LABEL_SELECTOR('Selector is a label query over pods that should match the replica count.'), template: POD_TEMPLATE }) });
const JOB_SPEC = obj('Specification of the desired behavior of a job.', { activeDeadlineSeconds: int('Specifies the duration in seconds relative to the startTime that the job may be continuously active before the system tries to terminate it.'), backoffLimit: int('Specifies the number of retries before marking this job failed. Defaults to 6'), completions: int('Specifies the desired number of successfully finished pods the job should be run with.'), parallelism: int('Specifies the maximum desired number of pods the job should run at any given time.'), template: POD_TEMPLATE, ttlSecondsAfterFinished: int('ttlSecondsAfterFinished limits the lifetime of a Job that has finished execution.') });
ESQUEMAS.Job = base('Job represents the configuration of a single job.', { spec: JOB_SPEC });
ESQUEMAS.CronJob = base('CronJob represents the configuration of a single cron job.', { spec: obj('Specification of the desired behavior of a cron job, including the schedule.', { concurrencyPolicy: str('Specifies how to treat concurrent executions of a Job. Valid values are: "Allow", "Forbid", "Replace".'), failedJobsHistoryLimit: int('The number of failed finished jobs to retain. Defaults to 1.'), jobTemplate: obj('Specifies the job that will be created when executing a CronJob.', { metadata: METADATA, spec: JOB_SPEC }, req), schedule: str('The schedule in Cron format, see https://en.wikipedia.org/wiki/Cron.', req), successfulJobsHistoryLimit: int('The number of successful finished jobs to retain. Defaults to 3.'), suspend: bool('This flag tells the controller to suspend subsequent executions. Defaults to false.'), timeZone: str('The time zone name for the given schedule. If not specified, this will default to the time zone of the kube-controller-manager process.') }) });

// Recursos do OpenShift e de operators que a prova pede para escrever.
const QUANTIDADES = (d) => ({ t: 'map[string]Quantity', d });
const IDP = lista('identityProviders is an ordered list of ways for a user to identify themselves.', {
  htpasswd: obj('htpasswd enables user authentication using an HTPasswd file to validate credentials', { fileData: obj('fileData is a required reference to a secret by name containing the data to use as the htpasswd file. The key "htpasswd" is used to locate the data. The namespace for this config map is openshift-config.', { name: str('name is the metadata.name of the referenced secret', req) }, req) }),
  mappingMethod: str('mappingMethod determines how identities from this provider are mapped to users. Defaults to "claim".'),
  name: str('name is used to qualify the identities returned by this provider.'),
  type: str('type identifies the identity provider type for this entry.'),
});
Object.assign(ESQUEMAS, {
  OAuth: base('OAuth holds cluster-wide information about OAuth. The canonical name is `cluster`.', { spec: obj('spec holds user settable values for configuration', { identityProviders: IDP, tokenConfig: obj('tokenConfig contains options for authorization and access tokens', { accessTokenMaxAgeSeconds: int('accessTokenMaxAgeSeconds defines the maximum age of access tokens') }) }, req) }),
  Group: base('Group represents a referenceable set of Users', { users: strs('Users is the list of users in this group.') }),
  User: base('Upon log in, every user of the system receives a User and Identity resource.', { fullName: str('FullName is the full name of user'), groups: strs('Groups specifies group names this user is a member of.'), identities: strs('Identities are the identities associated with this user') }),
  Identity: base('Identity records a successful authentication of a user with an identity provider.', { providerName: str('ProviderName is the source of identity information', req), providerUserName: str('ProviderUserName uniquely represents this identity in the scope of the provider', req), user: obj('User is a reference to the user this identity is associated with.', { name: str('Name of the referent.'), uid: str('UID of the referent.') }) }),
  Template: base('Template contains the inputs needed to produce a Config.', { labels: mapa('labels is a optional set of labels that are applied to every object during the Template to Config transformation.'), message: str('message is an optional instructional message that will be displayed when this template is instantiated.'), objects: { t: '[]RawExtension', d: 'objects is an array of resources to include in this template.', r: true }, parameters: lista('parameters is an optional array of Parameters used during the Template to Config transformation.', { description: str('Description of a parameter.'), from: str('From is an input value for the generator.'), generate: str('generate specifies the generator to be used to generate random string from an input value specified by From field.'), name: str('Name must be set and it can be referenced in Template Items using ${PARAMETER_NAME}.', req), required: bool('Optional: Indicates the parameter must have a value.'), value: str('Value holds the Parameter data.') }) }),
  ClusterResourceQuota: base('ClusterResourceQuota mirrors ResourceQuota at a cluster scope. This object is easily convertible to synthetic ResourceQuota object to allow quota evaluation re-use.', { spec: obj('Spec defines the desired quota', { quota: obj('Quota defines the desired quota', { hard: QUANTIDADES('hard is the set of desired hard limits for each named resource.'), scopes: strs('A collection of filters that must match each object tracked by a quota.') }, req), selector: obj('Selector is the selector used to match projects. It should only select active projects on the scale of dozens (though it can select many more less active projects).', { annotations: mapa('AnnotationSelector is used to select projects by annotation.'), labels: LABEL_SELECTOR('LabelSelector is used to select projects by label.') }, req) }, req), status: obj('Status defines the actual enforced quota and its current usage', { namespaces: lista('Namespaces slices the usage by project.', { namespace: str('Namespace the project this status applies to', req), status: obj('Status indicates how many resources have been consumed by this project', {}) }), total: obj('Total defines the actual enforced quota and its current usage across all projects', { hard: QUANTIDADES('Hard is the set of enforced hard limits for each named resource.'), used: QUANTIDADES('Used is the current observed total usage of the resource.') }) }) }),
  SecurityContextConstraints: base('SecurityContextConstraints governs the ability to make requests that affect the SecurityContext that will be applied to a container.', { allowHostNetwork: bool('AllowHostNetwork determines if the policy allows the use of HostNetwork in the pod spec.'), allowPrivilegeEscalation: bool('AllowPrivilegeEscalation determines if a pod can request to allow privilege escalation.'), allowPrivilegedContainer: bool('AllowPrivilegedContainer determines if a container can request to be run as privileged.'), groups: strs('The groups that have permission to use this security context constraints'), priority: int('Priority influences the sort order of SCCs when evaluating which SCCs to try first for a given pod request based on access in the Users and Groups fields.'), runAsUser: obj('RunAsUser is the strategy that will dictate what RunAsUser is used in the SecurityContext.', { type: str('type is the strategy that will dictate what RunAsUser is used in the SecurityContext. MustRunAs, MustRunAsRange, MustRunAsNonRoot, RunAsAny.'), uidRangeMax: int('UIDRangeMax defines the max value for a strategy that allocates by range.'), uidRangeMin: int('UIDRangeMin defines the min value for a strategy that allocates by range.') }), users: strs('The users who have permissions to use this security context constraints'), volumes: strs('Volumes is a white list of allowed volume plugins.') }),
  ClusterVersion: base('ClusterVersion is the configuration for the ClusterVersionOperator. This is where parameters related to automatic updates can be set.', { spec: obj('spec is the desired state of the cluster version - the operator will work to ensure that the desired version is applied to the cluster.', { channel: str('channel is an identifier for explicitly requesting that a non-default set of updates be applied to this cluster. The default channel will be contain stable updates that are appropriate for production clusters.'), clusterID: str('clusterID uniquely identifies this cluster.', req), desiredUpdate: obj('desiredUpdate is an optional field that indicates the desired value of the cluster version. Setting this value will trigger an upgrade (if the current version does not match the desired version).', { force: bool('force allows an administrator to update to an image that has failed verification or upgradeable checks.'), image: str('image is a container image location that contains the update.'), version: str('version is a semantic version identifying the update version.') }), upstream: str('upstream may be used to specify the preferred update server.') }, req), status: obj('status contains information about the available updates and any in-progress updates.', { availableUpdates: lista('availableUpdates contains updates recommended for this cluster.', { image: str('image is a container image location that contains the update.'), version: str('version is a semantic version identifying the update version.') }), desired: obj('desired is the version that the cluster is reconciling towards.', { version: str('version is a semantic version identifying the update version.') }), history: lista('history contains a list of the most recent versions applied to the cluster.', { state: str('state reflects whether the update was fully applied. The Partial state indicates the update is not fully applied, while the Completed state indicates the update was successfully rolled out at least once.', req), version: str('version is a semantic version identifying the update version.') }) }) }),
  OperatorGroup: base('OperatorGroup is the unit of multitenancy for OLM managed operators. It constrains the installation of operators in its namespace to a specified set of target namespaces.', { spec: obj('OperatorGroupSpec is the spec for an OperatorGroup resource.', { selector: LABEL_SELECTOR('Selector selects the OperatorGroup\'s target namespaces.'), targetNamespaces: strs('TargetNamespaces is an explicit set of namespaces to target. If it is set, Selector is ignored.'), upgradeStrategy: obj('UpgradeStrategy defines the upgrade strategy for operators in the namespace.', { name: str('Default or TechPreviewUnsafeFailForward') }) }) }),
  Subscription: base('Subscription keeps operators up to date by tracking changes to Catalogs.', { spec: obj('SubscriptionSpec defines an Application that can be installed', { channel: str('The channel of the package to subscribe to.'), config: obj('SubscriptionConfig contains configuration specified for a subscription.', { env: lista('Env is a list of environment variables to set in the container.', { name: str('Name of the environment variable.', req), value: str('Variable references.') }) }), installPlanApproval: str('Approval is the user approval policy for an InstallPlan. It must be one of "Automatic" or "Manual".'), name: str('The name of the package.', req), source: str('The name of the CatalogSource.', req), sourceNamespace: str('The namespace of the CatalogSource.', req), startingCSV: str('The ClusterServiceVersion to install first.') }), status: obj('', { currentCSV: str('CurrentCSV is the CSV the Subscription is progressing to.'), installPlanRef: obj('InstallPlanRef is a reference to the latest InstallPlan that contains the Subscription\'s current CSV.', { name: str('Name of the referent.') }), installedCSV: str('InstalledCSV is the CSV currently installed by the Subscription.'), state: str('State represents the current state of the Subscription') }) }),
  InstallPlan: base('InstallPlan defines the installation of a set of operators.', { spec: obj('InstallPlanSpec defines a set of Application resources to be installed', { approval: str('Approval is the user approval policy for an InstallPlan. It must be one of "Automatic" or "Manual".', req), approved: bool('', req), clusterServiceVersionNames: strs('', req) }), status: obj('InstallPlanStatus represents the information about the status of steps required to complete installation.', { phase: str('InstallPlanPhase is the current status of a InstallPlan as a whole.', req) }) }),
  ClusterServiceVersion: base('ClusterServiceVersion is a Custom Resource of type `ClusterServiceVersionSpec`.', { spec: obj('ClusterServiceVersionSpec declarations tell OLM how to install an operator that can manage apps for a given version.', { displayName: str('', req), installModes: lista('InstallModes specify supported installation types', { supported: bool('', req), type: str('InstallModeType is a supported type of install mode for CSV installation', req) }), replaces: str('The name of a CSV this one replaces. Should match the `metadata.Name` field of the old CSV.'), version: str('') }), status: obj('ClusterServiceVersionStatus represents information about the status of a CSV.', { message: str('A human readable message indicating details about why the ClusterServiceVersion is in this condition.'), phase: str('Current condition of the ClusterServiceVersion'), reason: str('A brief CamelCase message indicating details about why the ClusterServiceVersion is in this state.') }) }),
  IPAddressPool: base('IPAddressPool represents a pool of IP addresses that can be allocated to LoadBalancer services.', { spec: obj('IPAddressPoolSpec defines the desired state of IPAddressPool.', { addresses: strs('A list of IP address ranges over which MetalLB has authority. You can list multiple ranges in a single pool, they will all share the same settings. Each range can be either a CIDR prefix, or an explicit start-end range of IPs.'), autoAssign: bool('AutoAssign flag used to prevent MetallB from automatic allocation for a pool.'), avoidBuggyIPs: bool('AvoidBuggyIPs prevents addresses ending with .0 and .255 to be used by a pool.') }, req) }),
  L2Advertisement: base('L2Advertisement allows to advertise the LoadBalancer IPs provided by the selected pools via L2.', { spec: obj('L2AdvertisementSpec defines the desired state of L2Advertisement.', { interfaces: strs('A list of interfaces to announce from.'), ipAddressPoolSelectors: lista('A selector for the IPAddressPools which would get advertised via this advertisement.', { matchLabels: mapa('matchLabels is a map of {key,value} pairs.') }), ipAddressPools: strs('The list of IPAddressPools to advertise via this advertisement, selected by name.'), nodeSelectors: lista('NodeSelectors allows to limit the nodes to announce as next hops for the LoadBalancer IP.', { matchLabels: mapa('matchLabels is a map of {key,value} pairs.') }) }) }),
  ImageStream: base('An ImageStream stores a mapping of tags to images, metadata overrides that are applied when images are tagged in a stream, and an optional reference to a container image repository on a registry.', { spec: obj('Spec describes the desired state of this stream', { lookupPolicy: obj('lookupPolicy controls how other resources reference images within this namespace.', { local: bool('local will change the docker short image references (like "mysql" or "php:latest") on objects in this namespace to the image ID whenever they match this image stream.', req) }), tags: lista('tags map arbitrary string values to specific image locators', { from: obj('Optional; if specified, a reference to another image that this tag should point to.', { kind: str('Kind of the referent.'), name: str('Name of the referent.') }), name: str('Name of the tag', req) }) }) }),
  Node: base('Node is a worker node in Kubernetes. Each node will have a unique identifier in the cache (i.e. in etcd).', { spec: obj('Spec defines the behavior of a node.', { taints: lista('If specified, the node\'s taints.', { effect: str('Required. The effect of the taint on pods that do not tolerate the taint.', req), key: str('Required. The taint key to be applied to a node.', req), value: str('The taint value corresponding to the taint key.') }), unschedulable: bool('Unschedulable controls node schedulability of new pods. By default, node is schedulable.') }), status: obj('Most recently observed status of the node.', { addresses: lista('List of addresses reachable to the node.', { address: str('The node address.', req), type: str('Node address type, one of Hostname, ExternalIP or InternalIP.', req) }), allocatable: QUANTIDADES('Allocatable represents the resources of a node that are available for scheduling.'), capacity: QUANTIDADES('Capacity represents the total resources of a node.') }) }),
  APIRequestCount: base('APIRequestCount tracks requests made to an API. The instance name must be of the form `resource.version.group`, matching the resource.', { spec: obj('spec defines the characteristics of the resource.', { numberOfUsersToReport: int('numberOfUsersToReport is the number of users to include in the report.') }), status: obj('status contains the observed state of the resource.', { currentHour: obj('currentHour contains request history for the current hour.', { requestCount: int('requestCount is a sum of all requestCounts across nodes.') }), last24h: lista('last24h contains request history for the last 24 hours, indexed by the hour.', { byNode: lista('byNode contains logs of requests per node.', { byUser: lista('byUser contains request details by top .spec.numberOfUsersToReport users.', { requestCount: int('requestCount of requests by the user across all verbs.'), userAgent: str('userAgent that made the request.'), username: str('userName that made the request.') }), nodeName: str('nodeName where the request are being handled.') }), requestCount: int('requestCount is a sum of all requestCounts across nodes.') }), removedInRelease: str('removedInRelease is when the API will be removed.'), requestCount: int('requestCount is a sum of all requestCounts across all current hours, nodes, and users.') }) }),
});

function quebra(texto, recuo) {
  const larg = 76;
  const out = [];
  for (const par of texto.split('\n')) {
    let linha = '';
    for (const p of par.split(' ')) {
      if (linha && (linha + ' ' + p).length > larg) {
        out.push(recuo + linha);
        linha = p;
      } else linha = linha ? `${linha} ${p}` : p;
    }
    out.push(recuo + linha);
  }
  return out.join('\n');
}

const tipoTxt = (n) => `<${n.t}>${n.r ? ' -required-' : ''}`;

function recursivo(f, nivel) {
  return Object.entries(f).sort().map(([k, n]) => `${'  '.repeat(nivel)}${k}\t${tipoTxt(n)}\n${n.f ? recursivo(n.f, nivel + 1) : ''}`).join('');
}

export function explain(alvo, recursivoFlag) {
  const [tipoNome, ...caminho] = alvo.split('.');
  const k = kindOf(tipoNome);
  const real = k?.alias ? kindOf(k.alias) : k;
  if (!real) return { erro: `error: the server doesn't have a resource type "${tipoNome}"` };
  const esquema = ESQUEMAS[real.kind];
  if (!esquema) return { erro: `[simulador] oc explain ${real.plural}` };
  let no = esquema;
  for (const parte of caminho) {
    if (!no.f?.[parte]) return { erro: `error: field "${parte}" does not exist` };
    no = no.f[parte];
  }
  let s = real.group ? `GROUP:      ${real.group}\n` : '';
  s += `KIND:       ${real.kind}\nVERSION:    ${real.apiVersion.split('/').pop()}\n\n`;
  if (caminho.length) s += `FIELD: ${caminho.at(-1)} ${tipoTxt(no)}\n\n`;
  s += `DESCRIPTION:\n${quebra(no.d, '    ')}\n    \n`;
  if (no.f) {
    s += 'FIELDS:\n';
    s += recursivoFlag ? recursivo(no.f, 1) : Object.entries(no.f).sort().map(([nome, n]) => `  ${nome}\t${tipoTxt(n)}\n${quebra(n.d, '    ')}\n`).join('\n');
  }
  return { out: s + '\n' };
}
