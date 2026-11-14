// Templates disponíveis no namespace `openshift` do cluster simulado.
import { REGISTRY } from './images.js';

const MYSQL = {
  kind: 'Template',
  metadata: {
    name: 'mysql-ephemeral',
    namespace: 'openshift',
    labels: { 'samples.operator.openshift.io/managed': 'true' },
    annotations: {
      description: 'MySQL database service, without persistent storage. WARNING: Any data stored will be lost upon pod destruction. Only use this template for testing',
      'openshift.io/display-name': 'MySQL (Ephemeral)',
      tags: 'database,mysql',
    },
  },
  labels: { template: 'mysql-ephemeral-template' },
  message: 'The following service(s) have been created in your project: ${DATABASE_SERVICE_NAME}.\n\n       Username: ${MYSQL_USER}\n       Password: ${MYSQL_PASSWORD}\n  Database Name: ${MYSQL_DATABASE}\n Connection URL: mysql://${DATABASE_SERVICE_NAME}:3306/',
  parameters: [
    { name: 'MEMORY_LIMIT', displayName: 'Memory Limit', description: 'Maximum amount of memory the container can use.', value: '512Mi', required: true },
    { name: 'DATABASE_SERVICE_NAME', displayName: 'Database Service Name', description: 'The name of the OpenShift Service exposed for the database.', value: 'mysql', required: true },
    { name: 'MYSQL_USER', displayName: 'MySQL Connection Username', description: 'Username for MySQL user that will be used for accessing the database.', generate: 'expression', from: 'user[A-Z0-9]{3}', required: true },
    { name: 'MYSQL_PASSWORD', displayName: 'MySQL Connection Password', description: 'Password for the MySQL connection user.', generate: 'expression', from: '[a-zA-Z0-9]{16}', required: true },
    { name: 'MYSQL_ROOT_PASSWORD', displayName: 'MySQL root user Password', description: 'Password for the MySQL root user.', generate: 'expression', from: '[a-zA-Z0-9]{16}', required: true },
    { name: 'MYSQL_DATABASE', displayName: 'MySQL Database Name', description: 'Name of the MySQL database accessed.', value: 'sampledb', required: true },
  ],
  objects: [
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: '${DATABASE_SERVICE_NAME}', annotations: { 'template.openshift.io/expose-username': "{.data['database-user']}", 'template.openshift.io/expose-password': "{.data['database-password']}" } },
      stringData: { 'database-user': '${MYSQL_USER}', 'database-password': '${MYSQL_PASSWORD}', 'database-root-password': '${MYSQL_ROOT_PASSWORD}', 'database-name': '${MYSQL_DATABASE}' },
    },
    {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: '${DATABASE_SERVICE_NAME}' },
      spec: { ports: [{ name: 'mysql', port: 3306 }], selector: { name: '${DATABASE_SERVICE_NAME}' } },
    },
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: '${DATABASE_SERVICE_NAME}', annotations: { 'template.alpha.openshift.io/wait-for-ready': 'true' } },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        selector: { matchLabels: { name: '${DATABASE_SERVICE_NAME}' } },
        template: {
          metadata: { labels: { name: '${DATABASE_SERVICE_NAME}' } },
          spec: {
            containers: [{
              name: 'mysql',
              image: `${REGISTRY}/rhel9/mysql-80:1-228`,
              ports: [{ containerPort: 3306 }],
              env: [
                { name: 'MYSQL_USER', valueFrom: { secretKeyRef: { name: '${DATABASE_SERVICE_NAME}', key: 'database-user' } } },
                { name: 'MYSQL_PASSWORD', valueFrom: { secretKeyRef: { name: '${DATABASE_SERVICE_NAME}', key: 'database-password' } } },
                { name: 'MYSQL_ROOT_PASSWORD', valueFrom: { secretKeyRef: { name: '${DATABASE_SERVICE_NAME}', key: 'database-root-password' } } },
                { name: 'MYSQL_DATABASE', valueFrom: { secretKeyRef: { name: '${DATABASE_SERVICE_NAME}', key: 'database-name' } } },
              ],
              resources: { limits: { memory: '${MEMORY_LIMIT}' } },
            }],
          },
        },
      },
    },
  ],
};

// MariaDB com armazenamento persistente (o template que o curso 4.22 usa).
const MARIADB = JSON.parse(JSON.stringify(MYSQL)
  .replaceAll('MySQL (Ephemeral)', 'MariaDB')
  .replaceAll('MySQL database service, without persistent storage. WARNING: Any data stored will be lost upon pod destruction. Only use this template for testing', 'MariaDB database service, with persistent storage. For more information about using this database image, including OpenShift considerations, see https://github.com/sclorg/mariadb-container/blob/master/README.md.')
  .replaceAll('database,mysql', 'database,mariadb')
  .replaceAll('mysql-ephemeral-template', 'mariadb-persistent-template')
  .replaceAll('mysql-ephemeral', 'mariadb-persistent')
  .replaceAll('MySQL Connection', 'MariaDB Connection')
  .replaceAll('MySQL root user Password', 'MariaDB root Password')
  .replaceAll('Password for the MySQL', 'Password for the MariaDB')
  .replaceAll('Username for MySQL', 'Username for MariaDB')
  .replaceAll('MySQL Database Name', 'MariaDB Database Name')
  .replaceAll('Name of the MySQL database', 'Name of the MariaDB database')
  .replaceAll('"value":"mysql"', '"value":"mariadb"')
  .replaceAll('"name":"mysql"', '"name":"mariadb"')
  .replaceAll(`${REGISTRY}/rhel9/mysql-80:1-228`, `${REGISTRY}/rhel10/mariadb-118:\${MARIADB_VERSION}`));
MARIADB.parameters.push(
  { name: 'MARIADB_VERSION', displayName: 'Version of MariaDB Image', description: 'Version of MariaDB image to be used (10.1-6, or latest).', value: 'latest', required: true },
  { name: 'VOLUME_CAPACITY', displayName: 'Volume Capacity', description: 'Volume space available for data, e.g. 512Mi, 2Gi.', value: '1Gi', required: true },
);
MARIADB.objects.splice(2, 0, { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { name: '${DATABASE_SERVICE_NAME}' }, spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '${VOLUME_CAPACITY}' } } } });
const dep = MARIADB.objects.find((o) => o.kind === 'Deployment').spec.template.spec;
dep.containers[0].volumeMounts = [{ name: '${DATABASE_SERVICE_NAME}-data', mountPath: '/var/lib/mysql/data' }];
dep.volumes = [{ name: '${DATABASE_SERVICE_NAME}-data', persistentVolumeClaim: { claimName: '${DATABASE_SERVICE_NAME}' } }];

const WEBAPP = {
  kind: 'Template',
  metadata: {
    name: 'nimbus-webapp',
    namespace: 'openshift',
    annotations: {
      description: 'Nimbus web application with a deployment, a service, and a route.',
      'openshift.io/display-name': 'Nimbus Web Application',
      tags: 'nimbus,web',
    },
  },
  labels: { template: 'nimbus-webapp' },
  message: 'The application ${NAME} is available at http://${HOSTNAME}',
  parameters: [
    { name: 'NAME', displayName: 'Application Name', description: 'Name used for the deployment, service, and route.', required: true },
    { name: 'APP_IMAGE', displayName: 'Image', description: 'Image repository of the application.', value: `${REGISTRY}/nimbus/portal`, required: true },
    { name: 'APP_VERSION', displayName: 'Version', description: 'Image tag to deploy.', value: '1.1', required: true },
    { name: 'REPLICAS', displayName: 'Replicas', description: 'Number of pods.', value: '1' },
    { name: 'HOSTNAME', displayName: 'Route Host', description: 'Host name of the route. Leave empty to use the default host.' },
  ],
  objects: [
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: '${NAME}', labels: { app: '${NAME}' } },
      spec: {
        replicas: '${{REPLICAS}}',
        selector: { matchLabels: { app: '${NAME}' } },
        template: { metadata: { labels: { app: '${NAME}' } }, spec: { containers: [{ name: 'web', image: '${APP_IMAGE}:${APP_VERSION}', ports: [{ containerPort: 8080, name: 'http' }] }] } },
      },
    },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: '${NAME}', labels: { app: '${NAME}' } }, spec: { selector: { app: '${NAME}' }, ports: [{ name: 'http', port: 8080, targetPort: 'http' }] } },
    { apiVersion: 'route.openshift.io/v1', kind: 'Route', metadata: { name: '${NAME}', labels: { app: '${NAME}' } }, spec: { host: '${HOSTNAME}', to: { kind: 'Service', name: '${NAME}' }, port: { targetPort: 'http' } } },
  ],
};

export const TEMPLATES = [MARIADB, MYSQL, WEBAPP];
