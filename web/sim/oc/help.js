// Textos de `oc <comando> --help`, no formato do oc real e restritos às
// opções que o simulador entende.

const H = {
  oc: {
    d: 'OpenShift Client\n\nThis client helps you develop, build, deploy, and run your applications on any\nOpenShift or Kubernetes cluster.',
    grupos: [
      ['Basic Commands', [['login', 'Log in to a server'], ['new-project', 'Request a new project'], ['new-app', 'Create a new application'], ['status', 'Show a high level overview of the current project'], ['project', 'Switch to another project'], ['projects', 'Display existing projects'], ['explain', 'Get documentation for a resource']]],
      ['Build and Deploy Commands', [['rollout', 'Manage a Kubernetes deployment']]],
      ['Application Management Commands', [['create', 'Create a resource from a file or from stdin'], ['apply', 'Apply a configuration to a resource by file name or stdin'], ['get', 'Display one or many resources'], ['set', 'Commands that help set specific features on objects'], ['label', 'Update the labels on a resource'], ['annotate', 'Update the annotations on a resource'], ['expose', 'Expose a replicated application as a service or route'], ['delete', 'Delete resources by file names, stdin, resources and names, or by resources and label selector'], ['scale', 'Set a new size for a deployment or replica set'], ['patch', 'Update fields of a resource'], ['edit', 'Edit a resource on the server'], ['kustomize', 'Build a kustomization target from a directory or URL'], ['diff', 'Diff the live version against a would-be applied version'], ['extract', 'Extract secrets or config maps to disk']]],
      ['Troubleshooting and Debugging Commands', [['logs', 'Print the logs for a container in a pod'], ['rsh', 'Start a shell session in a container'], ['exec', 'Execute a command in a container'], ['describe', 'Show details of a specific resource or group of resources'], ['wait', 'Experimental: Wait for a specific condition on one or many resources'], ['events', 'List events']]],
      ['Advanced Commands', [['adm', 'Tools for managing a cluster'], ['image', 'Useful commands for managing images'], ['api-resources', 'Print the supported API resources on the server']]],
      ['Other Commands', [['version', 'Print the client and server version information'], ['whoami', 'Return information about the current session']]],
    ],
    u: 'oc [flags]',
  },
  get: {
    d: 'Display one or many resources.\n\nPossible resources include builds, deployments, pods, services, routes, and more.',
    e: [['List all pods in ps output format', 'oc get pods'], ['List all pods in ps output format with more information (such as node name)', 'oc get pods -o wide'], ['List a single deployment in YAML output format', 'oc get deployment web -o yaml'], ['List resource information in custom columns', 'oc get pod test-pod -o custom-columns=CONTAINER:.spec.containers[0].name,IMAGE:.spec.containers[0].image'], ['List all pods with a label, across all namespaces', 'oc get pods -l app=web -A'], ['Extract a field with JSONPath', "oc get pods -o jsonpath='{.items[*].metadata.name}'"]],
    o: [['-A, --all-namespaces=false', 'If present, list the requested object(s) across all namespaces.'], ['--field-selector=\'\'', 'Selector (field query) to filter on, supports \'=\', \'==\', and \'!=\'.'], ['--no-headers=false', 'When using the default or custom-column output format, don\'t print headers.'], ['-o, --output=\'\'', 'Output format. One of: (json, yaml, name, custom-columns, jsonpath, wide).'], ['-l, --selector=\'\'', 'Selector (label query) to filter on, supports \'=\', \'==\', \'!=\', \'in\', \'notin\'.'], ['--show-labels=false', 'When printing, show all labels as the last column.'], ['--sort-by=\'\'', 'If non-empty, sort list types using this field specification (JSONPath expression).'], ['-w, --watch=false', 'After listing/getting the requested object, watch for changes.']],
    u: 'oc get [(-o|--output=)json|yaml|name|go-template|go-template-file|template|templatefile|jsonpath|jsonpath-as-json|jsonpath-file|custom-columns|custom-columns-file|wide] (TYPE[.VERSION][.GROUP] [NAME | -l label] | TYPE[.VERSION][.GROUP]/NAME ...) [flags] [options]',
  },
  describe: {
    d: 'Show details of a specific resource or group of resources.\n\nPrint a detailed description of the selected resources, including related resources such as events or controllers.',
    e: [['Describe a node', 'oc describe nodes master01'], ['Describe a pod', 'oc describe pods/nginx'], ['Describe pods by label name=myLabel', 'oc describe pods -l name=myLabel'], ['Describe all pods managed by the \'frontend\' replication controller', 'oc describe pods frontend']],
    o: [['-A, --all-namespaces=false', 'If present, list the requested object(s) across all namespaces.'], ['-l, --selector=\'\'', 'Selector (label query) to filter on.']],
    u: 'oc describe (-f FILENAME | TYPE [NAME_PREFIX | -l label] | TYPE/NAME) [options]',
  },
  create: {
    d: 'Create a resource from a file or from stdin.\n\nJSON and YAML formats are accepted.',
    e: [['Create a pod using the data in pod.json', 'oc create -f ./pod.json'], ['Create a pod based on the JSON passed into stdin', 'cat pod.json | oc create -f -']],
    s: [['clusterresourcequota', 'Create a cluster resource quota'], ['clusterrole', 'Create a cluster role'], ['clusterrolebinding', 'Create a cluster role binding for a particular cluster role'], ['configmap', 'Create a config map from a local file, directory or literal value'], ['cronjob', 'Create a cron job with the specified name'], ['job', 'Create a job with the specified name'], ['quota', 'Create a quota with the specified name'], ['role', 'Create a role with single rule'], ['rolebinding', 'Create a role binding for a particular role or cluster role'], ['deployment', 'Create a deployment with the specified name'], ['namespace', 'Create a namespace with the specified name'], ['route', 'Expose containers externally via secured routes'], ['secret', 'Create a secret using a specified subcommand'], ['service', 'Create a service using a specified subcommand'], ['serviceaccount', 'Create a service account with the specified name']],
    o: [['--dry-run=\'none\'', 'Must be "none", "server", or "client". If client strategy, only print the object that would be sent, without sending it.'], ['-f, --filename=[]', 'Filename, directory, or URL to files to use to create the resource'], ['-o, --output=\'\'', 'Output format. One of: (json, yaml, name).']],
    u: 'oc create -f FILENAME [options]',
  },
  'create deployment': {
    d: 'Create a deployment with the specified name.',
    e: [['Create a deployment named my-dep that runs the busybox image', 'oc create deployment my-dep --image=busybox'], ['Create a deployment with a command', 'oc create deployment my-dep --image=busybox -- date'], ['Create a deployment named my-dep that runs the nginx image with 3 replicas', 'oc create deployment my-dep --image=nginx --replicas=3'], ['Create a deployment named my-dep that runs the busybox image and expose port 5701', 'oc create deployment my-dep --image=busybox --port=5701']],
    o: [['--image=[]', 'Image names to run.'], ['--port=-1', 'The containerPort that this deployment exposes.'], ['-r, --replicas=1', 'Number of replicas to create. Default is 1.'], ['--dry-run=\'none\'', 'Must be "none", "server", or "client".'], ['-o, --output=\'\'', 'Output format.']],
    u: 'oc create deployment NAME --image=image -- [COMMAND] [args...] [options]',
  },
  'create configmap': {
    d: 'Create a config map based on a file, directory, or specified literal value.\n\nA single config map may package one or more key/value pairs.',
    e: [['Create a new config map named my-config based on folder bar', 'oc create configmap my-config --from-file=path/to/bar'], ['Create a new config map named my-config with specified keys instead of file basenames on disk', 'oc create configmap my-config --from-file=key1=/path/to/bar/file1.txt --from-file=key2=/path/to/bar/file2.txt'], ['Create a new config map named my-config with key1=config1 and key2=config2', 'oc create configmap my-config --from-literal=key1=config1 --from-literal=key2=config2'], ['Create a new config map named my-config from an env file', 'oc create configmap my-config --from-env-file=path/to/foo.env']],
    o: [['--from-env-file=[]', 'Specify the path to a file to read lines of key=val pairs to create a config map.'], ['--from-file=[]', 'Key file can be specified using its file path, in which case file basename will be used as config map key, or optionally with a key and file path, in which case the given key will be used.'], ['--from-literal=[]', 'Specify a key and literal value to insert in configmap (i.e. mykey=somevalue)']],
    u: 'oc create configmap NAME [--from-file=[key=]source] [--from-literal=key1=value1] [--dry-run=server|client|none] [options]',
  },
  'create secret': {
    d: 'Create a secret with specified type.\n\nA docker-registry type secret is for accessing a container registry.\n\nA generic type secret indicate an Opaque secret type.\n\nA tls type secret holds TLS certificate and its associated key.',
    s: [['docker-registry', 'Create a secret for use with a Docker registry'], ['generic', 'Create a secret from a local file, directory, or literal value'], ['tls', 'Create a TLS secret']],
    u: 'oc create secret (docker-registry | generic | tls) [options]',
  },
  'create secret generic': {
    d: 'Create a secret based on a file, directory, or specified literal value.',
    e: [['Create a new secret named my-secret with keys for each file in folder bar', 'oc create secret generic my-secret --from-file=path/to/bar'], ['Create a new secret named my-secret with key1=supersecret and key2=topsecret', 'oc create secret generic my-secret --from-literal=key1=supersecret --from-literal=key2=topsecret'], ['Create a new secret named my-secret from env files', 'oc create secret generic my-secret --from-env-file=path/to/foo.env']],
    o: [['--from-env-file=[]', 'Specify the path to a file to read lines of key=val pairs to create a secret.'], ['--from-file=[]', 'Key files can be specified using their file path.'], ['--from-literal=[]', 'Specify a key and literal value to insert in secret (i.e. mykey=somevalue)'], ['--type=\'\'', 'The type of secret to create']],
    u: 'oc create secret generic NAME [--type=string] [--from-file=[key=]source] [--from-literal=key1=value1] [options]',
  },
  'create secret tls': {
    d: 'Create a TLS secret from the given public/private key pair.',
    e: [['Create a new TLS secret named tls-secret with the given key pair', 'oc create secret tls tls-secret --cert=path/to/tls.crt --key=path/to/tls.key']],
    o: [['--cert=\'\'', 'Path to PEM encoded public key certificate.'], ['--key=\'\'', 'Path to private key associated with given certificate.']],
    u: 'oc create secret tls NAME --cert=path/to/cert/file --key=path/to/key/file [options]',
  },
  'create secret docker-registry': {
    d: 'Create a new secret for use with Docker registries.',
    e: [['Create a new secret named my-secret for use with Docker registries', 'oc create secret docker-registry my-secret --docker-server=DOCKER_REGISTRY_SERVER --docker-username=DOCKER_USER --docker-password=DOCKER_PASSWORD --docker-email=DOCKER_EMAIL']],
    o: [['--docker-email=\'\'', 'Email for Docker registry'], ['--docker-password=\'\'', 'Password for Docker registry authentication'], ['--docker-server=\'https://index.docker.io/v1/\'', 'Server location for Docker registry'], ['--docker-username=\'\'', 'Username for Docker registry authentication']],
    u: 'oc create secret docker-registry NAME --docker-username=user --docker-password=password --docker-email=email [--docker-server=string] [options]',
  },
  'create service': {
    d: 'Create a service using a specified subcommand.',
    s: [['clusterip', 'Create a ClusterIP service'], ['externalname', 'Create an ExternalName service'], ['loadbalancer', 'Create a LoadBalancer service'], ['nodeport', 'Create a NodePort service']],
    u: 'oc create service [flags] [options]',
  },
  'create service clusterip': {
    d: 'Create a ClusterIP service with the specified name.',
    e: [['Create a new ClusterIP service named my-cs', 'oc create service clusterip my-cs --tcp=5678:8080'], ['Create a new ClusterIP service named my-cs (in headless mode)', 'oc create service clusterip my-cs --clusterip="None"']],
    o: [['--tcp=[]', 'Port pairs can be specified as \'<port>:<targetPort>\'.']],
    u: 'oc create service clusterip NAME [--tcp=<port>:<targetPort>] [options]',
  },
  'create service nodeport': {
    d: 'Create a NodePort service with the specified name.',
    e: [['Create a new NodePort service named my-ns', 'oc create service nodeport my-ns --tcp=5678:8080']],
    o: [['--node-port=0', 'Port used to expose the service on each node in a cluster.'], ['--tcp=[]', 'Port pairs can be specified as \'<port>:<targetPort>\'.']],
    u: 'oc create service nodeport NAME [--tcp=port:targetPort] [options]',
  },
  'create service loadbalancer': {
    d: 'Create a LoadBalancer service with the specified name.',
    e: [['Create a new LoadBalancer service named my-lbs', 'oc create service loadbalancer my-lbs --tcp=5678:8080']],
    o: [['--tcp=[]', 'Port pairs can be specified as \'<port>:<targetPort>\'.']],
    u: 'oc create service loadbalancer NAME [--tcp=port:targetPort] [options]',
  },
  'create service externalname': {
    d: 'Create an ExternalName service with the specified name.\n\nExternalName service references to an external DNS address instead of only pods.',
    e: [['Create a new ExternalName service named my-ns', 'oc create service externalname my-ns --external-name bar.com']],
    o: [['--external-name=\'\'', 'External name of service']],
    u: 'oc create service externalname NAME --external-name external.name [options]',
  },
  'create route': {
    d: 'Expose containers externally via secured routes.\n\nThree types of secured routes are supported: edge, passthrough, and reencrypt.',
    s: [['edge', 'Create a route that uses edge TLS termination'], ['passthrough', 'Create a route that uses passthrough TLS termination'], ['reencrypt', 'Create a route that uses reencrypt TLS termination']],
    u: 'oc create route [flags] [options]',
  },
  'create route edge': {
    d: 'Create a route that uses edge TLS termination.\n\nSpecify the service (either just its name or using type/name syntax) that the generated route should expose via the --service flag.',
    e: [['Create an edge route named "my-route" that exposes the frontend service', 'oc create route edge my-route --service=frontend'], ['Create an edge route that exposes the frontend service and specify a path; if the route name is omitted, the service name will be used', 'oc create route edge --service=frontend --path /assets'], ['Create an edge route with a custom certificate', 'oc create route edge --service=frontend --cert=tls.crt --key=tls.key --hostname=www.example.com']],
    o: [['--ca-cert=\'\'', 'Path to a CA certificate file.'], ['--cert=\'\'', 'Path to a certificate file.'], ['--hostname=\'\'', 'Set a hostname for the new route'], ['--insecure-policy=\'\'', 'Set an insecure policy for the new route (Allow, None, Redirect)'], ['--key=\'\'', 'Path to a key file.'], ['--path=\'\'', 'Path that the router watches to route traffic to the service.'], ['--port=\'\'', 'Name of the service port or number of the container port the route will route traffic to'], ['--service=\'\'', 'Name of the service that the new route is exposing']],
    u: 'oc create route edge [NAME] --service=SERVICE [flags] [options]',
  },
  'create route passthrough': {
    d: 'Create a route that uses passthrough TLS termination.',
    e: [['Create a passthrough route named "my-route" that exposes the frontend service', 'oc create route passthrough my-route --service=frontend']],
    o: [['--hostname=\'\'', 'Set a hostname for the new route'], ['--insecure-policy=\'\'', 'Set an insecure policy for the new route (Allow, None, Redirect)'], ['--port=\'\'', 'Name of the service port or number of the container port the route will route traffic to'], ['--service=\'\'', 'Name of the service that the new route is exposing']],
    u: 'oc create route passthrough [NAME] --service=SERVICE [flags] [options]',
  },
  'create route reencrypt': {
    d: 'Create a route that uses reencrypt TLS termination.',
    e: [['Create a route named "my-route" that exposes the frontend service', 'oc create route reencrypt my-route --service=frontend --dest-ca-cert cert.cert']],
    o: [['--ca-cert=\'\'', 'Path to a CA certificate file.'], ['--cert=\'\'', 'Path to a certificate file.'], ['--dest-ca-cert=\'\'', 'Path to a CA certificate file, used for securing the connection from the router to the destination.'], ['--hostname=\'\'', 'Set a hostname for the new route'], ['--key=\'\'', 'Path to a key file.'], ['--service=\'\'', 'Name of the service that the new route is exposing']],
    u: 'oc create route reencrypt [NAME] --dest-ca-cert=FILENAME --service=SERVICE [flags] [options]',
  },
  apply: {
    d: 'Apply a configuration to a resource by file name or stdin.\n\nThe resource name must be specified. This resource will be created if it doesn\'t exist yet.',
    e: [['Apply the configuration in pod.json to a pod', 'oc apply -f ./pod.json'], ['Apply resources from a directory containing kustomization.yaml', 'oc apply -k dir/'], ['Apply the JSON passed into stdin to a pod', 'cat pod.json | oc apply -f -']],
    o: [['-f, --filename=[]', 'The files that contain the configurations to apply.'], ['-k, --kustomize=\'\'', 'Process a kustomization directory.'], ['--dry-run=\'none\'', 'Must be "none", "server", or "client".']],
    u: 'oc apply (-f FILENAME | -k DIRECTORY) [options]',
  },
  delete: {
    d: 'Delete resources by file names, stdin, resources and names, or by resources and label selector.',
    e: [['Delete a pod using the type and name specified in pod.json', 'oc delete -f ./pod.json'], ['Delete resources from a directory containing kustomization.yaml', 'oc delete -k dir'], ['Delete pods and services with same names "baz" and "foo"', 'oc delete pod,service baz foo'], ['Delete pods and services with label name=myLabel', 'oc delete pods,services -l name=myLabel'], ['Delete all pods', 'oc delete pods --all']],
    o: [['--all=false', 'Delete all resources, in the namespace of the specified resource types.'], ['-f, --filename=[]', 'containing the resource to delete.'], ['-k, --kustomize=\'\'', 'Process a kustomization directory.'], ['-l, --selector=\'\'', 'Selector (label query) to filter on.']],
    u: 'oc delete ([-f FILENAME] | [-k DIRECTORY] | TYPE [(NAME | -l label | --all)]) [options]',
  },
  expose: {
    d: 'Expose containers internally as services or externally via routes.\n\nThere is also the ability to expose a deployment configuration, replication controller, service, or pod as a new service on a specified port.',
    e: [['Create a route based on service nginx. The new route will reuse nginx\'s labels', 'oc expose service nginx'], ['Create a route and specify your own label and route name', 'oc expose service nginx -l name=myroute --name=fromdowntown'], ['Create a route and specify a host name', 'oc expose service nginx --hostname=www.example.com'], ['Expose a deployment configuration as a service and use the specified port', 'oc expose deployment nginx --port=443 --target-port=8443']],
    o: [['--hostname=\'\'', 'Set a hostname for the new route'], ['--name=\'\'', 'The name for the newly created object.'], ['--path=\'\'', 'Set a path for the new route'], ['--port=\'\'', 'The port that the service should serve on.'], ['--target-port=\'\'', 'Name or number for the port on the container that the service should direct traffic to.'], ['--type=\'\'', 'Type for this service: ClusterIP, NodePort, LoadBalancer, or ExternalName.']],
    u: 'oc expose (-f FILENAME | TYPE NAME) [--port=port] [--protocol=TCP|UDP|SCTP] [--target-port=number-or-name] [--name=name] [--type=type] [options]',
  },
  set: {
    d: 'Configure application resources.\n\nThese commands help you make changes to existing application resources.',
    s: [['env', 'Update environment variables on a pod template'], ['image', 'Update the image of a pod template'], ['resources', 'Update resource requests/limits on objects with pod templates'], ['volumes', 'Update volumes on a pod template']],
    u: 'oc set COMMAND [options]',
  },
  'set env': {
    d: 'Update environment variables on a pod template or a build config.\n\nList environment variable definitions in one or more pods, pod templates. Add, update, or remove container environment variable definitions in one or more pod templates.',
    e: [['Update deployment config \'myapp\' with a new environment variable', 'oc set env deployment/myapp STORAGE_DIR=/local'], ['List the environment variables defined on a deployment', 'oc set env deployment/myapp --list'], ['Import environment from a secret', 'oc set env --from=secret/mysecret deployment/myapp'], ['Import environment from a config map with a prefix', 'oc set env --from=configmap/myconfigmap --prefix=MYSQL_ deployment/myapp'], ['Remove the environment variable ENV from container \'c1\' in all deployment configs', 'oc set env deployments --all --containers="c1" ENV-']],
    o: [['-c, --containers=\'*\'', 'The names of containers in the selected pod templates to change.'], ['--from=\'\'', 'The name of a resource from which to inject environment variables'], ['--list=false', 'If true, display the environment and any changes in the standard format.'], ['--prefix=\'\'', 'Prefix to append to variable names'], ['--overwrite=true', 'If true, allow environment to be overwritten.']],
    u: 'oc set env RESOURCE/NAME KEY_1=VAL_1 ... KEY_N=VAL_N [options]',
  },
  'set image': {
    d: 'Update existing container image(s) of resources.',
    e: [['Set a deployment config\'s nginx container image to \'nginx:1.9.1\'', 'oc set image deployment/nginx busybox=busybox nginx=nginx:1.9.1'], ['Update all containers of all deployments to \'nginx:1.9.1\'', "oc set image deployments --all '*=nginx:1.9.1'"]],
    u: 'oc set image (-f FILENAME | TYPE NAME) CONTAINER_NAME_1=CONTAINER_IMAGE_1 ... CONTAINER_NAME_N=CONTAINER_IMAGE_N [options]',
  },
  'set resources': {
    d: 'Specify compute resource requirements (CPU, memory) for any resource that defines a pod template.',
    e: [['Set a deployments nginx container CPU limits to "200m and memory to 512Mi"', 'oc set resources deployment nginx -c=nginx --limits=cpu=200m,memory=512Mi'], ['Set the resource request and limits for all containers in nginx', 'oc set resources deployment nginx --limits=cpu=200m,memory=512Mi --requests=cpu=100m,memory=256Mi']],
    o: [['-c, --containers=\'*\'', 'The names of containers in the selected pod templates to change.'], ['--limits=\'\'', 'The resource requirement requests for this container. For example, \'cpu=100m,memory=256Mi\'.'], ['--requests=\'\'', 'The resource requirement requests for this container. For example, \'cpu=100m,memory=256Mi\'.']],
    u: 'oc set resources (-f FILENAME | TYPE NAME) ([--limits=LIMITS & --requests=REQUESTS] [options]',
  },
  'set volume': {
    d: 'Update volumes on a pod template.\n\nThis command can add, update, or remove volumes from containers for any object that has a pod template.',
    e: [['List volumes defined on all deployments in the current project', 'oc set volume deployment --all'], ['Add a new empty dir volume to deployment \'myapp\' mounted under /var/lib/myapp', 'oc set volume deployment/myapp --add --mount-path=/var/lib/myapp'], ['Use an existing persistent volume claim (PVC) to overwrite an existing volume \'v1\'', 'oc set volume deployment/myapp --add --name=v1 -t pvc --claim-name=pvc1 --overwrite'], ['Remove volume \'v1\' from deployment config \'myapp\'', 'oc set volume deployment/myapp --remove --name=v1'], ['Add a config map volume', 'oc set volume deployment/myapp --add --type=configmap --configmap-name=myconfig --mount-path=/etc/myapp']],
    o: [['--add=false', 'If true, add volume and/or volume mounts for containers'], ['--claim-name=\'\'', 'Persistent volume claim name.'], ['--configmap-name=\'\'', 'Name of the persisted config map.'], ['-m, --mount-path=\'\'', 'Mount path inside the container.'], ['--name=\'\'', 'Name of the volume.'], ['--overwrite=false', 'If true, replace existing volume source with the provided name and/or volume mount for the given resource'], ['--read-only=false', 'Mount volume as read-only.'], ['--remove=false', 'If true, remove volume and/or volume mounts for containers'], ['--secret-name=\'\'', 'Name of the persisted secret.'], ['--sub-path=\'\'', 'Path within the local volume from which the container\'s volume should be mounted.'], ['-t, --type=\'\'', 'Type of the volume source for add operation. Supported options: emptyDir, hostPath, secret, configmap, persistentVolumeClaim']],
    u: 'oc set volume RESOURCE/NAME [--add|--remove|--list] [options]',
  },
  scale: {
    d: 'Set a new size for a deployment, replica set, replication controller, or stateful set.',
    e: [['Scale a replica set named \'foo\' to 3', 'oc scale --replicas=3 rs/foo'], ['Scale a deployment named \'mysql\' to 3', 'oc scale --replicas=3 deployment/mysql']],
    o: [['--replicas=0', 'The new desired number of replicas. Required.']],
    u: 'oc scale [--resource-version=version] [--current-replicas=count] --replicas=COUNT (-f FILENAME | TYPE NAME) [options]',
  },
  label: {
    d: 'Update the labels on a resource.',
    e: [['Update pod \'foo\' with the label \'unhealthy\' and the value \'true\'', 'oc label pods foo unhealthy=true'], ['Update pod \'foo\' with the label \'status\' and the value \'unhealthy\', overwriting any existing value', 'oc label --overwrite pods foo status=unhealthy'], ['Update all pods in the namespace', 'oc label pods --all status=unhealthy'], ['Update pod \'foo\' by removing a label named \'bar\' if it exists', 'oc label pods foo bar-']],
    o: [['--all=false', 'Select all resources, in the namespace of the specified resource types'], ['--overwrite=false', 'If true, allow labels to be overwritten, otherwise reject label updates that overwrite existing labels.'], ['-l, --selector=\'\'', 'Selector (label query) to filter on.']],
    u: 'oc label [--overwrite] (-f FILENAME | TYPE NAME) KEY_1=VAL_1 ... KEY_N=VAL_N [options]',
  },
  annotate: {
    d: 'Update the annotations on one or more resources.',
    e: [['Update pod \'foo\' with the annotation \'description\' and the value \'my frontend\'', "oc annotate pods foo description='my frontend'"], ['Update pod \'foo\' by removing an annotation named \'description\' if it exists', 'oc annotate pods foo description-']],
    o: [['--overwrite=false', 'If true, allow annotations to be overwritten.']],
    u: 'oc annotate [--overwrite] (-f FILENAME | TYPE NAME) KEY_1=VAL_1 ... KEY_N=VAL_N [options]',
  },
  patch: {
    d: 'Update fields of a resource using strategic merge patch, a JSON merge patch, or a JSON patch.',
    e: [['Partially update a node using a strategic merge patch, specifying the patch as JSON', 'oc patch node k8s-node-1 -p \'{"spec":{"unschedulable":true}}\''], ['Update a container\'s image using a JSON patch with positional arrays', 'oc patch pod valid-pod --type=\'json\' -p=\'[{"op": "replace", "path": "/spec/containers/0/image", "value":"new image"}]\''], ['Update a deployment\'s replicas through a merge patch', 'oc patch deployment nginx --type merge -p \'{"spec":{"replicas":2}}\'']],
    o: [['-p, --patch=\'\'', 'The patch to be applied to the resource JSON file.'], ['--type=\'strategic\'', 'The type of patch being provided; one of [json merge strategic]']],
    u: 'oc patch (-f FILENAME | TYPE NAME) [-p PATCH|--patch-file FILE] [options]',
  },
  edit: {
    d: 'Edit a resource from the default editor.\n\nThe edit command allows you to directly edit any API resource you can retrieve via the command-line tools.',
    e: [['Edit the service named \'docker-registry\'', 'oc edit svc/docker-registry'], ['Edit the deployment \'mydeployment\' in YAML', 'oc edit deployment/mydeployment']],
    u: 'oc edit (RESOURCE/NAME | -f FILENAME) [options]',
  },
  rollout: {
    d: 'Manage the rollout of one or many resources.',
    s: [['history', 'View rollout history'], ['pause', 'Mark the provided resource as paused'], ['restart', 'Restart a resource'], ['resume', 'Resume a paused resource'], ['status', 'Show the status of the rollout'], ['undo', 'Undo a previous rollout']],
    e: [['Rollback to the previous deployment', 'oc rollout undo deployment/abc'], ['Check the rollout status of a deployment', 'oc rollout status deployment/abc'], ['Restart a deployment', 'oc rollout restart deployment/abc']],
    u: 'oc rollout SUBCOMMAND [options]',
  },
  logs: {
    d: 'Print the logs for a resource.\n\nSupported resources are builds, build configs (bc), deployment configs (dc), and pods. When a pod is specified and has more than one container, the container name should be specified via -c.',
    e: [['Start streaming the logs of the most recent build of the openldap build config', 'oc logs -f bc/openldap'], ['Get the logs of the first pod of a deployment', 'oc logs deployment/mysql'], ['Return snapshot logs from pod nginx with only one container', 'oc logs nginx'], ['Display only the most recent 20 lines of output in pod nginx', 'oc logs --tail=20 nginx']],
    o: [['-c, --container=\'\'', 'Print the logs of this container'], ['-f, --follow=false', 'Specify if the logs should be streamed.'], ['-p, --previous=false', 'If true, print the logs for the previous instance of the container in a pod if it exists.'], ['--tail=-1', 'Lines of recent log file to display.']],
    u: 'oc logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER] [options]',
  },
  rsh: {
    d: 'Open a remote shell session to a container.\n\nThis command will attempt to start a shell session in a pod for the specified resource. It works with pods, deployment configs, deployments, jobs, daemon sets, replication controllers and replica sets. Any of the aforementioned resources (apart from pods) will be resolved to a ready pod. It will default to the first container if none is specified, and will attempt to use \'/bin/sh\' as the default shell.',
    e: [['Open a shell session on the first container in pod \'foo\'', 'oc rsh foo'], ['Open a shell session on the first container in pod \'foo\' and namespace \'bar\'', 'oc rsh -n bar foo'], ['Run the command \'cat /etc/resolv.conf\' inside pod \'foo\'', 'oc rsh foo cat /etc/resolv.conf'], ['Open a shell session on the first container in deployment \'mydeployment\'', 'oc rsh deployment/mydeployment']],
    o: [['-c, --container=\'\'', 'Container name; defaults to first container'], ['--shell=\'/bin/sh\'', 'Path to the shell command']],
    u: 'oc rsh [options] POD [COMMAND] [options]',
  },
  exec: {
    d: 'Execute a command in a container.',
    e: [['Get output from running \'date\' command from the first pod of the deployment mydeployment', 'oc exec deploy/mydeployment -- date'], ['Get output from running \'ls\' command in container ruby-container from pod mypod', 'oc exec mypod -c ruby-container -- ls'], ['Switch to raw terminal mode; sends stdin to \'bash\' in ruby-container from pod mypod', 'oc exec mypod -c ruby-container -i -t -- bash -il'], ['Run a shell pipeline inside the container', "oc exec mypod -- sh -c 'cat /etc/os-release | head -1'"]],
    o: [['-c, --container=\'\'', 'Container name. If omitted, the first container in the pod will be chosen'], ['-i, --stdin=false', 'Pass stdin to the container'], ['-t, --tty=false', 'Stdin is a TTY']],
    u: 'oc exec (POD | TYPE/NAME) [-c CONTAINER] [flags] -- COMMAND [args...] [options]',
  },
  'new-project': {
    d: 'Create a new project for yourself.\n\nIf your administrator allows self-service, this command will create a new project for you and assign you as the project admin.',
    e: [['Create a new project with minimal information', 'oc new-project web-team-dev'], ['Create a new project with a display name and description', 'oc new-project web-team-dev --display-name="Web Team Development" --description="Development project for the web team."']],
    o: [['--description=\'\'', 'Project description'], ['--display-name=\'\'', 'Project display name']],
    u: 'oc new-project NAME [--display-name=DISPLAYNAME] [--description=DESCRIPTION] [options]',
  },
  'new-app': {
    d: 'Create a new application by specifying source code, templates, and/or images.',
    e: [['Create an application based on the source code in the current git repository (with a public remote) and a container image', 'oc new-app . --image=registry/repo/langimage'], ['Create an application from a remote image', 'oc new-app --image=registry.example.com/team/app:1.0 --name=app'], ['Set environment variables', 'oc new-app --image=mysql MYSQL_USER=user MYSQL_PASSWORD=pass MYSQL_DATABASE=testdb']],
    o: [['-e, --env=[]', 'Specify a key-value pair for an environment variable to set into each container.'], ['--image=[]', 'Name of a container image to include in the app.'], ['-l, --labels=\'\'', 'Label to set in all resources for this application.'], ['--name=\'\'', 'Set name to use for generated application artifacts']],
    u: 'oc new-app (IMAGE | IMAGESTREAM | TEMPLATE | PATH | URL ...) [flags] [options]',
  },
  project: { d: 'Switch to another project and make it the default in your configuration.', e: [['Switch to the \'myapp\' project', 'oc project myapp'], ['Display the project currently in use', 'oc project']], u: 'oc project [NAME] [options]' },
  login: {
    d: 'Log in to your server and save login for subsequent use.\n\nFirst-time users of the client should run this command to connect to a server, establish an authenticated session, and save connection to the configuration file.',
    e: [['Log in interactively', 'oc login --username=myuser'], ['Log in to the given server with the given credentials (will not prompt interactively)', 'oc login localhost:8443 --username=myuser --password=mypass']],
    o: [['-p, --password=\'\'', 'Password for server'], ['-u, --username=\'\'', 'Username for server'], ['--server=\'\'', 'The address and port of the Kubernetes API server']],
    u: 'oc login [URL] [options]',
  },
  wait: {
    d: 'Experimental: Wait for a specific condition on one or many resources.',
    e: [['Wait for the pod "busybox1" to contain the status condition of type "Ready"', 'oc wait --for=condition=Ready pod/busybox1'], ['Wait for the pod "busybox1" to contain the status phase to be "Running"', "oc wait --for=jsonpath='{.status.phase}'=Running pod/busybox1"], ['Wait for the pod "busybox1" to be deleted, with a timeout of 60s', 'oc wait --for=delete pod/busybox1 --timeout=60s']],
    o: [['--for=\'\'', 'The condition to wait on: [delete|condition=condition-name[=condition-value]|jsonpath=\'{JSONPath expression}\'=JSONPath Condition].'], ['--timeout=30s', 'The length of time to wait before giving up.']],
    u: 'oc wait ([-f FILENAME] | resource.group/resource.name | resource.group [(-l label | --all)]) [--for=delete|--for condition=available|--for=jsonpath=\'{}\'=value] [options]',
  },
  explain: {
    d: 'Describe fields and structure of various resources.\n\nThis command describes the fields associated with each supported API resource. Fields are identified via a simple JSONPath identifier:\n\n        <type>.<fieldName>[.<fieldName>]',
    e: [['Get the documentation of the resource and its fields', 'oc explain pods'], ['Get the documentation of a specific field of a resource', 'oc explain pods.spec.containers'], ['Get all the fields in the resource', 'oc explain pods --recursive']],
    o: [['--recursive=false', 'When true, print the name of all the fields recursively.']],
    u: 'oc explain TYPE [--recursive=FALSE|TRUE] [options]',
  },
  kustomize: { d: 'Build a set of KRM resources using a \'kustomization.yaml\' file.', e: [['Build the current working directory', 'oc kustomize'], ['Build some shared configuration directory', 'oc kustomize /home/config/production']], u: 'oc kustomize DIR [flags] [options]' },
  diff: { d: 'Diff configurations specified by file name or stdin between the current online configuration, and the configuration as it would be if applied.\n\nExit status:\n 0 No differences were found.\n 1 Differences were found.\n >1 Kubectl or diff failed with an error.', e: [['Diff resources included in pod.json', 'oc diff -f pod.json'], ['Diff a kustomization', 'oc diff -k dir/']], u: 'oc diff -f FILENAME [options]' },
  extract: { d: 'Extract files out of secrets and config maps.\n\nThe extract command makes it easy to download the contents of a config map or secret into a directory.', e: [['Extract the secret "test" to the current directory', 'oc extract secret/test'], ['Extract the config map "nginx" to the /tmp directory', 'oc extract configmap/nginx --to=/tmp'], ['Extract the config map "nginx" to STDOUT', 'oc extract configmap/nginx --to=-'], ['Extract only the key "nginx.conf" from config map "nginx" to the /tmp directory', 'oc extract configmap/nginx --to=/tmp --keys=nginx.conf']], o: [['--confirm=false', 'If true, overwrite files that already exist.'], ['--keys=[]', 'An optional list of keys to extract (default is all keys).'], ['--to=\'.\'', 'Directory to extract files to.']], u: 'oc extract RESOURCE/NAME [--to=DIRECTORY] [--keys=KEY ...] [options]' },
  status: { d: 'Show a high level overview of the current project.', e: [['See an overview of the current project', 'oc status']], u: 'oc status [-o dot | --suggest ] [options]' },
  whoami: { d: 'Show information about the current session.', e: [['Display the currently authenticated user', 'oc whoami'], ['Display the API server URL', 'oc whoami --show-server']], u: 'oc whoami [options]' },
  adm: { d: 'Administrative Commands\n\nActions for administering an OpenShift cluster are exposed here.', s: [['create-bootstrap-project-template', 'Create a bootstrap project template'], ['groups', 'Manage groups'], ['policy', 'Manage cluster authorization and security policy'], ['top', 'Show usage statistics of resources on the server'], ['upgrade', 'Upgrade a cluster or adjust the upgrade channel']], u: 'oc adm [flags]' },
  'adm upgrade': {
    d: 'Upgrade the cluster to a newer version.\n\nCheck on upgrade status or upgrade the cluster to a newer version.\n\nThis command assists with cluster upgrades. If run without arguments it will display the current version and any available updates. Use --to-latest to upgrade to the newest recommended version, or --to with a version to upgrade to a specific one.',
    s: [['channel', 'Set or clear the update channel']],
    e: [['View the update status and available cluster updates', 'oc adm upgrade'], ['Update to the latest recommended version', 'oc adm upgrade --to-latest=true'], ['Update to a specific version', 'oc adm upgrade --to=4.18.12'], ['Change the update channel', 'oc adm upgrade channel stable-4.19']],
    o: [['--clear=false', 'If true, remove a pending update request.'], ['--to=\'\'', 'Specify the version to upgrade to. The version must be on the list of available updates.'], ['--to-latest=false', 'Use the next available version.']],
    u: 'oc adm upgrade [flags] [options]',
  },
  'adm upgrade channel': { d: 'Set or clear the update channel.\n\nThe channel determines the recommended updates for the cluster.', e: [['Set the update channel to stable-4.19', 'oc adm upgrade channel stable-4.19'], ['Clear the update channel', 'oc adm upgrade channel']], u: 'oc adm upgrade channel CHANNEL [options]' },
  'adm create-bootstrap-project-template': { d: 'Create a bootstrap project template.\n\nProvides a template that can be used as the default project template for the "oc new-project" and "oc create projectrequest" commands.', e: [['Output a bootstrap project template in YAML format to stdout', 'oc adm create-bootstrap-project-template -o yaml']], o: [['--name=\'project-request\'', 'The name of the template to output.'], ['-o, --output=\'\'', 'Output format. One of: (json, yaml, name).']], u: 'oc adm create-bootstrap-project-template [-o FORMAT] [options]' },
  'adm policy': {
    d: 'Manage cluster authorization and security policy.',
    s: [['add-cluster-role-to-group', 'Add a role to groups for all projects in the cluster'], ['add-cluster-role-to-user', 'Add a role to users for all projects in the cluster'], ['add-role-to-group', 'Add a role to groups for the current project'], ['add-role-to-user', 'Add a role to users or service accounts for the current project'], ['add-scc-to-group', 'Add a security context constraint to groups'], ['add-scc-to-user', 'Add a security context constraint to users or a service account'], ['remove-cluster-role-from-group', 'Remove a role from groups for all projects in the cluster'], ['remove-cluster-role-from-user', 'Remove a role from users for all projects in the cluster'], ['remove-role-from-group', 'Remove a role from groups for the current project'], ['remove-role-from-user', 'Remove a role from users for the current project'], ['remove-scc-from-group', 'Remove group from scc'], ['remove-scc-from-user', 'Remove user from scc'], ['scc-subject-review', 'Check whether a user or a service account can create a pod'], ['who-can', 'List who can perform the specified action on a resource']],
    u: 'oc adm policy [flags]',
  },
  'adm policy add-scc-to-user': { d: 'Add a security context constraint to users or a service account.', e: [['Add the \'restricted\' security context constraint to user1 and user2', 'oc adm policy add-scc-to-user restricted user1 user2'], ['Add the \'privileged\' security context constraint to serviceaccount1 in the current namespace', 'oc adm policy add-scc-to-user privileged -z serviceaccount1']], o: [['-z, --serviceaccount=[]', 'service account in the current namespace to use as a user']], u: 'oc adm policy add-scc-to-user SCC (USER | -z SERVICEACCOUNT) [USER ...] [options]' },
  'adm policy scc-subject-review': { d: 'Check whether a user or a service account can create a pod.\n\nIt returns a list of security context constraints that will admit the resource.', e: [['Check whether user bob can create a pod specified in myresource.yaml', 'oc adm policy scc-subject-review -u bob -f myresource.yaml'], ['Check whether the service account set in a pod template can create it', 'oc get deployment web -o yaml | oc adm policy scc-subject-review -f -']], o: [['-f, --filename=[]', 'Filename, directory, or URL to files containing the resource to analyze'], ['-z, --serviceaccount=\'\'', 'service account in the current namespace to use as a user']], u: 'oc adm policy scc-subject-review [options]' },
  'create job': { d: 'Create a job with the specified name.', e: [['Create a job', 'oc create job my-job --image=busybox'], ['Create a job with a command', 'oc create job my-job --image=busybox -- date'], ['Create a job from a cron job named "a-cronjob"', 'oc create job test-job --from=cronjob/a-cronjob']], o: [['--dry-run=\'none\'', 'Must be "none", "server", or "client". If client strategy, only print the object that would be sent, without sending it.'], ['--from=\'\'', 'The name of the resource to create a Job from (only cronjob is supported).'], ['--image=\'\'', 'Image name to run.'], ['-o, --output=\'\'', 'Output format. One of: (json, yaml, name).']], u: 'oc create job NAME --image=image [--from=cronjob/name] -- [COMMAND] [args...] [options]' },
  'create cronjob': { d: 'Create a cron job with the specified name.', e: [['Create a cron job', 'oc create cronjob my-job --image=busybox --schedule="*/1 * * * *"'], ['Create a cron job with a command', 'oc create cronjob my-job --image=busybox --schedule="*/1 * * * *" -- date']], o: [['--dry-run=\'none\'', 'Must be "none", "server", or "client".'], ['--image=\'\'', 'Image name to run.'], ['-o, --output=\'\'', 'Output format. One of: (json, yaml, name).'], ['--restart=\'\'', 'job\'s restart policy. supported values: OnFailure, Never'], ['--schedule=\'\'', 'A schedule in the Cron format the job should be run with.']], u: 'oc create cronjob NAME --image=image --schedule=\'0/5 * * * ?\' -- [COMMAND] [args...] [flags] [options]' },
  'create quota': { d: 'Create a resource quota with the specified name, hard limits, and optional scopes.', e: [['Create a new resource quota named my-quota', 'oc create quota my-quota --hard=cpu=1,memory=1G,pods=2,services=3,replicationcontrollers=2,resourcequotas=1,secrets=5,persistentvolumeclaims=10'], ['Create a new resource quota named best-effort', 'oc create quota best-effort --hard=pods=100 --scopes=BestEffort']], o: [['--hard=\'\'', 'A comma-delimited set of resource=quantity pairs that define a hard limit.'], ['--scopes=\'\'', 'A comma-delimited set of quota scopes that must all match each object tracked by the quota.']], u: 'oc create quota NAME [--hard=key1=value1,key2=value2] [--scopes=Scope1,Scope2] [--dry-run=server|client|none] [options]' },
  'create clusterresourcequota': { d: 'Create a cluster resource quota that controls certain resources.\n\nCluster resource quota objects defined quota restrictions that span multiple projects based on label selectors.', e: [['Create a cluster resource quota limited to 10 pods', 'oc create clusterresourcequota limit-bob --project-annotation-selector=openshift.io/requester=user-bob --hard=pods=10']], o: [['--hard=[]', 'The resource to constrain: RESOURCE=QUANTITY (pods=10)'], ['--project-annotation-selector=\'\'', 'The project annotation selector for the cluster resource quota'], ['--project-label-selector=\'\'', 'The project label selector for the cluster resource quota']], u: 'oc create clusterresourcequota NAME --project-label-selector=key=value [--hard=RESOURCE=QUANTITY]... [options]' },
  'create serviceaccount': { d: 'Create a service account with the specified name.', e: [['Create a new service account named my-service-account', 'oc create serviceaccount my-service-account']], u: 'oc create serviceaccount NAME [--dry-run=server|client|none] [options]' },
  'set serviceaccount': { d: 'Update the service account of pod template resources.', e: [['Set deployment nginx-deployment\'s service account to serviceaccount1', 'oc set serviceaccount deployment nginx-deployment serviceaccount1']], u: 'oc set serviceaccount (-f FILENAME | TYPE NAME) SERVICE_ACCOUNT [options]' },
  image: { d: 'Manage images on OpenShift.', s: [['info', 'Display information about an image']], u: 'oc image COMMAND [flags]' },
};

function render(chave, h) {
  let s = h.d + '\n';
  if (h.grupos) for (const [g, l] of h.grupos) s += `\n${g}:\n${l.map(([n, d]) => `  ${n.padEnd(15)} ${d}`).join('\n')}\n`;
  if (h.s) s += `\nAvailable Commands:\n${[...h.s].sort((a, b) => a[0].localeCompare(b[0])).map(([n, d]) => `  ${n.padEnd(17)} ${d}`).join('\n')}\n`;
  if (h.e) s += `\nExamples:\n${h.e.map(([c, cmd]) => `  # ${c}\n  ${cmd}`).join('\n\n')}\n`;
  if (h.o) s += `\nOptions:\n${h.o.map(([n, d]) => `    ${n}:\n\t${d}`).join('\n\n')}\n`;
  s += `\nUsage:\n  ${h.u}\n\n`;
  if (h.s) s += `Use "${h.u.split(' ').slice(0, chave.split(' ').length + 1).join(' ')} <command> --help" for more information about a given command.\n`;
  s += 'Use "oc options" for a list of global command-line options (applies to all commands).\n';
  return s;
}

// Ajuda para `oc a b c`: usa a entrada mais específica que existir.
export function ajuda(caminho) {
  const partes = caminho.filter((p) => !p.startsWith('-'));
  for (let n = Math.min(3, partes.length); n >= 0; n--) {
    const chave = n === 0 ? 'oc' : partes.slice(0, n).join(' ');
    const alias = { 'set volumes': 'set volume', 'create cm': 'create configmap', 'create deploy': 'create deployment', 'create svc': 'create service', 'create ns': 'create namespace', 'create sa': 'create serviceaccount', 'create cj': 'create cronjob', 'set sa': 'set serviceaccount', 'create resourcequota': 'create quota' }[chave] || chave;
    if (H[alias]) return render(alias, H[alias]);
  }
  return null;
}
