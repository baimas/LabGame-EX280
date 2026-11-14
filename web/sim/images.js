// Registro de imagens simulado. O comportamento de cada imagem (porta, variáveis
// obrigatórias, logs) define o que acontece com o pod que a usa.
import { fakeDigest } from './util.js';

export const REGISTRY = 'registry.ocp4.example.com:8443';

function img(nome, tags, extra = {}) {
  const repo = `${REGISTRY}/${nome}`;
  const mapa = {};
  for (const t of tags) {
    const [tag, igualA] = t.split('=');
    mapa[tag] = igualA ? mapa[igualA] : fakeDigest(`${repo}:${tag}`);
  }
  return { repo, tags: mapa, port: 8080, user: '1001', size: '98.4MB', ...extra };
}

const VALIDA_MYSQL = [
  '=> sourcing 20-validate-variables.sh ...',
  'You must either specify the following environment variables:',
  '  MYSQL_USER',
  '  MYSQL_PASSWORD',
  '  MYSQL_DATABASE',
  'Or the following environment variable:',
  '  MYSQL_ROOT_PASSWORD',
];

const VALIDA_PG = [
  'For general container run, you must either specify the following environment variables:',
  '  POSTGRESQL_USER  POSTGRESQL_PASSWORD  POSTGRESQL_DATABASE',
  'Or the following environment variable:',
  '  POSTGRESQL_ADMIN_PASSWORD',
];

export const IMAGES = [
  img('nimbus/portal', ['1.0', '1.1', '2.0', 'latest=2.0'], {
    logs: (v) => [`[portal] starting version ${v.tag}`, '[portal] listening on 0.0.0.0:8080', '[portal] ready'],
  }),
  img('nimbus/billing-api', ['1.0', '1.1', 'latest=1.1'], {
    requires: [['DB_HOST']],
    crashLog: ['[billing-api] loading configuration', '[billing-api] FATAL: environment variable DB_HOST is not set', '[billing-api] exiting with status 1'],
    logs: (v) => [`[billing-api] connecting to database at ${v.env.DB_HOST}`, '[billing-api] listening on 0.0.0.0:8080'],
  }),
  img('nimbus/inventory', ['3.2', '3.3', 'latest=3.3'], {
    logs: () => ['[inventory] cache warm-up done', '[inventory] listening on 0.0.0.0:8080'],
  }),
  img('nimbus/reports', ['4.0', '4.1', 'latest=4.1'], {
    logs: () => ['[reports] scheduler started', '[reports] listening on 0.0.0.0:8080'],
  }),
  img('rhel9/mysql-80', ['1-228', 'latest=1-228'], {
    port: 3306,
    user: '27',
    size: '172.1MB',
    requires: [['MYSQL_ROOT_PASSWORD'], ['MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']],
    crashLog: VALIDA_MYSQL,
    logs: () => ['=> sourcing 20-validate-variables.sh ...', '=> sourcing 25-validate-replication-variables.sh ...', "[System] [MY-010931] [Server] /usr/libexec/mysqld: ready for connections. Version: '8.0.36'  port: 3306"],
  }),
  img('rhel9/postgresql-13', ['1-150', 'latest=1-150'], {
    port: 5432,
    user: '26',
    size: '120.3MB',
    requires: [['POSTGRESQL_ADMIN_PASSWORD'], ['POSTGRESQL_USER', 'POSTGRESQL_PASSWORD', 'POSTGRESQL_DATABASE']],
    crashLog: VALIDA_PG,
    logs: () => ['Starting server...', 'LOG:  listening on IPv4 address "0.0.0.0", port 5432', 'LOG:  database system is ready to accept connections'],
  }),
  img('ubi9/httpd-24', ['1-321', 'latest=1-321'], {
    logs: () => ['=> sourcing 10-set-mpm.sh ...', "AH00558: httpd: Could not reliably determine the server's fully qualified domain name", '[mpm_event:notice] AH00489: Apache/2.4.57 (Red Hat Enterprise Linux) configured -- resuming normal operations'],
  }),
  img('ubi9/nginx-120', ['1-148', 'latest=1-148'], {
    logs: () => ['[notice] 1#1: nginx/1.20.1', '[notice] 1#1: start worker processes'],
  }),
  img('ubi9/ubi', ['9.4', 'latest=9.4'], { port: null, user: '0', exits: 0, size: '78.2MB', logs: () => [] }),
];

// Imagens de componentes do próprio cluster: sempre válidas.
const SISTEMA = { repo: 'quay.io/openshift-release-dev/ocp-v4.0-art-dev', tags: {}, port: null, user: '0', size: '150MB', logs: () => ['I0101 00:00:00.000000       1 start.go:42] component started'] };

export function parseRef(ref) {
  let r = String(ref);
  let digest = null;
  let tag = null;
  const arroba = r.indexOf('@');
  if (arroba >= 0) {
    digest = r.slice(arroba + 1);
    r = r.slice(0, arroba);
  }
  const barra = r.lastIndexOf('/');
  const doisPontos = r.lastIndexOf(':');
  if (doisPontos > barra) {
    tag = r.slice(doisPontos + 1);
    r = r.slice(0, doisPontos);
  }
  if (!tag && !digest) tag = 'latest';
  return { repo: r, tag, digest };
}

// Devolve {image, tag, digest} ou {error: 'repo' | 'manifest'}.
export function findImage(ref) {
  const { repo, tag, digest } = parseRef(ref);
  if (repo.startsWith('quay.io/openshift-release-dev/')) return { image: SISTEMA, tag: 'latest', digest: fakeDigest(ref) };
  const image = IMAGES.find((i) => i.repo === repo);
  if (!image) return { error: 'repo', repo, tag, digest };
  if (digest) {
    const t = Object.keys(image.tags).find((x) => image.tags[x] === digest);
    if (!t) return { error: 'manifest', image, repo, tag, digest };
    return { image, tag: t, digest };
  }
  if (!(tag in image.tags)) return { error: 'manifest', image, repo, tag, digest };
  return { image, tag, digest: image.tags[tag] };
}
