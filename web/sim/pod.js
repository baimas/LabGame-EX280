// Shell dentro de um contêiner, usado por `oc rsh` e `oc exec`.
import { FS } from './fs.js';
import { builtins } from './builtins.js';
import { curl } from './curl.js';
import { resolveEnv } from './controllers.js';
import { findImage } from './images.js';
import { b64, hashNum } from './util.js';
import { DNS_IP, KUBE_IP } from './net.js';
import { KUBE_CA, SERVICE_CA, openssl } from './tls.js';
import { nc, mysql } from './tcp.js';
import { uidDoProjeto, uidEfetivo } from './scc.js';

const WORKDIR = '/opt/app-root/src';
const SA = '/var/run/secrets/kubernetes.io/serviceaccount';

// Sistema de arquivos do contêiner: raiz somente leitura para o usuário do
// pod, volumes de config map e secret somente leitura.
class PodFS extends FS {
  constructor() {
    super();
    this.gravaveis = ['/tmp', WORKDIR];
    this.somenteLeitura = [];
  }

  podeGravar(p) {
    if (this.montando) return;
    if (this.somenteLeitura.some((x) => p === x || p.startsWith(x + '/'))) throw new Error('Read-only file system');
    if (!this.gravaveis.some((x) => p === x || p.startsWith(x + '/'))) throw new Error('Permission denied');
  }

  write(p, conteudo) {
    this.podeGravar(p);
    super.write(p, conteudo);
  }

  mkdir(p, pais) {
    if (!this.exists(p)) this.podeGravar(p);
    super.mkdir(p, pais);
  }

  rm(p, recursivo) {
    if (this.exists(p)) this.podeGravar(p);
    super.rm(p, recursivo);
  }
}

export { uidDoProjeto };

function montaFs(c, pod, ct) {
  const fs = new PodFS();
  const ns = pod.metadata.namespace;
  const sa = pod.spec.serviceAccountName || 'default';
  fs.montando = true;
  const put = (p, t) => fs.put(p, t);
  const uid = uidDoProjeto(ns);
  put('/etc/hostname', pod.metadata.name + '\n');
  put('/etc/os-release', 'NAME="Red Hat Enterprise Linux"\nVERSION="9.4 (Plow)"\nID="rhel"\nVERSION_ID="9.4"\nPRETTY_NAME="Red Hat Enterprise Linux 9.4 (Plow)"\n');
  put('/etc/redhat-release', 'Red Hat Enterprise Linux release 9.4 (Plow)\n');
  put('/etc/resolv.conf', `search ${ns}.svc.cluster.local svc.cluster.local cluster.local\nnameserver ${DNS_IP}\noptions ndots:5\n`);
  put('/etc/passwd', `root:x:0:0:root:/root:/bin/bash\ndefault:x:${uid}:0:Default Application User:${WORKDIR}:/sbin/nologin\n`);
  put(`${SA}/namespace`, ns);
  put(`${SA}/token`, `eyJhbGciOiJSUzI1NiIsImtpZCI6InNpbXVsYWRvIn0.${b64.enc(JSON.stringify({ sub: `system:serviceaccount:${ns}:${sa}` })).replace(/=+$/, '')}.assinatura-simulada`);
  put(`${SA}/ca.crt`, KUBE_CA.pem);
  put(`${SA}/service-ca.crt`, SERVICE_CA.pem);
  fs.mkdir('/tmp', true);
  fs.mkdir(WORKDIR, true);
  fs.somenteLeitura.push(SA);

  for (const m of ct.volumeMounts || []) {
    const v = (pod.spec.volumes || []).find((x) => x.name === m.name);
    if (!v) continue;
    const base = m.mountPath.replace(/\/$/, '');
    const fonte = v.configMap ? c.get('ConfigMap', v.configMap.name, ns) : v.secret ? c.get('Secret', v.secret.secretName, ns) : null;
    if (fonte) {
      let dados = Object.fromEntries(Object.entries(fonte.data || {}).map(([k, val]) => [k, fonte.kind === 'Secret' ? b64.dec(val) : val]));
      const itens = (v.configMap || v.secret).items;
      if (itens) dados = Object.fromEntries(itens.filter((i) => i.key in dados).map((i) => [i.path, dados[i.key]]));
      if (m.subPath) {
        if (m.subPath in dados) put(base, dados[m.subPath]);
      } else {
        fs.mkdir(base, true);
        for (const [k, val] of Object.entries(dados)) put(`${base}/${k}`, val);
      }
      fs.somenteLeitura.push(base);
    } else {
      fs.mkdir(base, true);
      if (!m.readOnly) fs.gravaveis.push(base);
      else fs.somenteLeitura.push(base);
    }
  }
  fs.montando = false;
  return fs;
}

const ok = (out = '') => ({ out, code: 0 });

function comandos(contexto) {
  const { pod, ct, env } = contexto;
  const uid = uidEfetivo(pod, ct);
  const img = findImage(ct.image);
  const processo = ct.command?.[0]?.split('/').pop() || (img.image?.repo.includes('mysql') ? 'mysqld' : img.image?.repo.includes('postgres') ? 'postgres' : img.image?.repo.includes('httpd') ? 'httpd' : img.image?.repo.includes('nginx') ? 'nginx' : 'run-app');
  const permitidos = ['echo', 'printf', 'cat', 'pwd', 'cd', 'ls', 'mkdir', 'touch', 'rm', 'cp', 'mv', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'awk', 'sed', 'base64', 'export', 'true', 'false', 'sleep', 'date', 'clear'];
  const cmds = Object.fromEntries(permitidos.map((n) => [n, builtins[n]]));
  const sair = ({ args, sh }) => {
    sh.saiPod(Number(args[0] ?? sh.vars['?'] ?? 0));
    return ok();
  };
  Object.assign(cmds, {
    env: () => ok(Object.entries(contexto.vars).filter(([k]) => k !== '?').map(([k, v]) => `${k}=${v}\n`).join('')),
    printenv: ({ args }) => {
      if (!args.length) return cmds.env();
      return args[0] in contexto.vars ? ok(contexto.vars[args[0]] + '\n') : { code: 1 };
    },
    hostname: () => ok(pod.metadata.name + '\n'),
    id: () => ok(`uid=${uid}(${uid}) gid=0(root) groups=0(root),${uid}\n`),
    whoami: () => (uid === 0 ? ok('root\n') : { err: `whoami: cannot find name for user ID ${uid}\n`, code: 1 }),
    uname: ({ args }) => ok(args.includes('-a') ? `Linux ${pod.metadata.name} 5.14.0-427.el9.x86_64 #1 SMP x86_64 x86_64 x86_64 GNU/Linux\n` : 'Linux\n'),
    ps: () => ok(`    PID TTY          TIME CMD\n      1 ?        00:00:02 ${processo}\n     42 pts/0    00:00:00 sh\n     57 pts/0    00:00:00 ps\n`),
    curl,
    openssl,
    nc,
    mysql,
    exit: sair,
    logout: sair,
    sh: async (ctx) => shellAninhado(ctx),
    bash: async (ctx) => shellAninhado(ctx),
    vi: () => ({ err: 'sh: vi: command not found\n', code: 127 }),
    oc: () => ({ err: 'sh: oc: command not found\n', code: 127 }),
    kubectl: () => ({ err: 'sh: kubectl: command not found\n', code: 127 }),
    help: () => ok(env.t('Dentro do pod: env, printenv, cat, ls, cd, pwd, id, hostname, ps, curl, grep, head, tail e outros comandos básicos. Digite exit para voltar à estação de trabalho.\n', 'Inside the pod: env, printenv, cat, ls, cd, pwd, id, hostname, ps, curl, grep, head, tail, and other basic commands. Type exit to go back to the workstation.\n')),
  });
  return cmds;
}

// `sh -c '...'` executa o script; `sh` sozinho apenas continua no shell atual.
async function shellAninhado({ args, sh }) {
  const i = args.indexOf('-c');
  if (i >= 0 && args[i + 1] !== undefined) return sh.run(args[i + 1], { sub: true });
  return ok();
}

// Monta o contexto de execução dentro do contêiner `ct` do pod.
export function contextoPod(env, pod, ct, shell = 'sh') {
  // A rede e os arquivos do contêiner não dependem de quem está logado.
  const c = env.clusterReal || env.cluster;
  const fs = montaFs(c, pod, ct);
  const contexto = {
    nome: pod.metadata.name,
    ns: pod.metadata.namespace,
    container: ct.name,
    pod,
    ct,
    shell,
    env: Object.assign(Object.create(env), { fs, cluster: c }),
    vars: {
      PATH: '/opt/app-root/src/bin:/opt/app-root/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin',
      HOSTNAME: pod.metadata.name,
      HOME: WORKDIR,
      KUBERNETES_SERVICE_HOST: KUBE_IP,
      KUBERNETES_SERVICE_PORT: '443',
      KUBERNETES_SERVICE_PORT_HTTPS: '443',
      ...resolveEnv(c, pod, ct).env,
      '?': '0',
    },
    cwd: WORKDIR,
  };
  contexto.cmds = comandos(contexto);
  return contexto;
}
