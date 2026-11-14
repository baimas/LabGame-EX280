// Um "mundo" é o conjunto cluster + arquivos + shell de uma sessão de jogo.
import { Cluster } from '../sim/cluster.js';
import { FS, HOME } from '../sim/fs.js';
import { Shell } from '../sim/shell.js';
import { podPronto } from '../sim/controllers.js';
import { REGISTRY } from '../sim/images.js';

export { REGISTRY, HOME };

export function createWorld({ lang = 'pt-BR', openEditor, sleep, write, ask, salvo } = {}) {
  const cluster = salvo ? Cluster.restore(salvo.cluster) : new Cluster();
  const fs = salvo ? FS.restore(salvo.fs) : new FS();
  const env = {
    cluster,
    fs,
    lang,
    session: salvo?.session || { user: 'admin', namespace: 'default' },
    t: (pt, en) => (env.lang === 'en' ? en : pt),
    openEditor,
    write,
    ask,
    // Fora do navegador o tempo simulado avança na hora.
    sleep: sleep || (async (s) => cluster.tick(s)),
  };
  const shell = new Shell(env);
  if (salvo?.cwd) shell.cwd = salvo.cwd;

  const w = {
    env,
    cluster,
    fs,
    shell,
    sh: (cmd) => shell.run(cmd),
    get: (kind, nome, ns) => cluster.get(kind, nome, ns),
    list: (kind, ns) => cluster.list(kind, ns),
    // Conteúdo de um arquivo (sem espaços nas pontas) ou null.
    file: (caminho) => {
      const p = fs.resolve(HOME, caminho);
      return fs.isFile(p) ? fs.read(p).trim() : null;
    },
    lines: (caminho) => (w.file(caminho) ?? '').split('\n').map((l) => l.trim()).filter(Boolean).sort(),
    // Deployment com todas as réplicas prontas e atualizadas.
    ready: (nome, ns) => {
      const d = cluster.get('Deployment', nome, ns);
      return Boolean(d) && d.spec.replicas > 0 && (d.status?.readyReplicas || 0) === d.spec.replicas && (d.status?.updatedReplicas || 0) === d.spec.replicas;
    },
    pods: (ns, rotulos = {}) => cluster.list('Pod', ns).filter((p) => Object.entries(rotulos).every(([k, v]) => p.metadata.labels?.[k] === v)),
    podPronto,
    serialize: () => ({ cluster: cluster.serialize(), fs: fs.serialize(), session: env.session, cwd: shell.cwdEstacao() }),
  };
  return w;
}

// Atalho para montar um deployment simples na preparação das missões.
export function deployment(nome, ns, imagem, { replicas = 1, labels = {}, env = {}, extra = {}, container = nome } = {}) {
  const rotulos = { app: nome, ...labels };
  const ct = { name: container, image: /^[^/]+[.:][^/]*\//.test(imagem) ? imagem : `${REGISTRY}/${imagem}`, ports: [{ containerPort: 8080, protocol: 'TCP' }] };
  const vars = Object.entries(env).map(([name, value]) => ({ name, value }));
  if (vars.length) ct.env = vars;
  Object.assign(ct, extra.container || {});
  return {
    kind: 'Deployment',
    metadata: { name: nome, namespace: ns, labels: rotulos },
    spec: { replicas, selector: { matchLabels: { app: nome } }, template: { metadata: { labels: rotulos }, spec: { containers: [ct], ...(extra.pod || {}) } } },
  };
}

export function service(nome, ns, porta = 8080) {
  return { kind: 'Service', metadata: { name: nome, namespace: ns, labels: { app: nome } }, spec: { selector: { app: nome }, ports: [{ port: porta, targetPort: porta }] } };
}
