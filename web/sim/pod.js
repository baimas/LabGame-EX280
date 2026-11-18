// Shell dentro de um contêiner, usado por `oc rsh` e `oc exec`.
import { FS } from './fs.js';
import { builtins } from './builtins.js';
import { curl } from './curl.js';
import { resolveEnv } from './controllers.js';
import { findImage } from './images.js';
import { b64, hashNum } from './util.js';
import { DNS_IP, KUBE_IP } from './net.js';
import { KUBE_CA, SERVICE_CA, openssl } from './tls.js';
import { nc, mysql, psql } from './tcp.js';
import { uidDoProjeto, uidEfetivo } from './scc.js';
import { dadosDoVolume } from './storage.js';
import { tar } from './arquivos.js';

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
    const a = this.armazem(p);
    if (a) {
      a.store.files[a.rel] = conteudo;
      // Quem gravou: permite saber se o arquivo sobreviveu ao pod.
      (a.store.autor ??= {})[a.rel] = this.podUid;
    }
  }

  mkdir(p, pais) {
    if (!this.exists(p)) this.podeGravar(p);
    const novos = [];
    for (let x = p; x !== '/' && !this.exists(x); x = this.pai(x)) novos.push(x);
    super.mkdir(p, pais);
    for (const x of novos) {
      const a = this.armazem(x);
      if (a && a.rel && !a.store.dirs.includes(a.rel)) a.store.dirs.push(a.rel);
    }
  }

  // Onde fica guardado o que se grava em `p`: o volume persistente montado
  // ali ou a camada gravável do contêiner (que some com o pod).
  armazem(p) {
    if (this.montando || !this.armazens) return null;
    const a = this.armazens.filter((x) => p === x.base || p.startsWith(x.base === '/' ? '/' : x.base + '/')).sort((x, y) => y.base.length - x.base.length)[0];
    if (!a) return null;
    return { store: a.store, rel: a.base === '/' ? p : p.slice(a.base.length).replace(/^\//, '') };
  }

  rm(p, recursivo) {
    if (this.exists(p)) this.podeGravar(p);
    super.rm(p, recursivo);
    const a = this.armazem(p);
    if (!a) return;
    const casa = (x) => x === a.rel || (a.rel ? x.startsWith(a.rel + '/') : true);
    for (const k of Object.keys(a.store.files)) if (casa(k)) delete a.store.files[k];
    a.store.dirs = a.store.dirs.filter((d) => !casa(d));
  }
}

export { uidDoProjeto };

function montaFs(c, pod, ct) {
  const fs = new PodFS();
  const ns = pod.metadata.namespace;
  const sa = pod.spec.serviceAccountName || 'default';
  fs.montando = true;
  const armazens = [];
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
      // Volume persistente: os arquivos ficam no volume, não no pod.
      const store = v.persistentVolumeClaim ? dadosDoVolume(c, ns, v.persistentVolumeClaim.claimName) : v.emptyDir ? (((c.side.pods ??= {})[pod.metadata.uid] ??= {}).emptyDir ??= {})[v.name] ??= { files: {}, dirs: [] } : null;
      if (store) armazens.push({ base, store });
    }
  }
  // Camada gravável do contêiner: dura enquanto o pod existir.
  const camada = ((((c.side.pods ??= {})[pod.metadata.uid] ??= {}).camadas ??= {})[ct.name] ??= { files: {}, dirs: [] });
  armazens.push({ base: '/', store: camada });
  for (const a of armazens) {
    const abs = (rel) => (a.base === '/' ? rel : `${a.base}/${rel}`);
    for (const d of a.store.dirs) fs.mkdir(abs(d), true);
    for (const [rel, conteudo] of Object.entries(a.store.files)) fs.put(abs(rel), conteudo);
  }
  fs.armazens = armazens;
  fs.podUid = pod.metadata.uid;
  fs.montando = false;
  return fs;
}

const ok = (out = '') => ({ out, code: 0 });

function comandos(contexto) {
  const { pod, ct, env } = contexto;
  const uid = uidEfetivo(pod, ct);
  const img = findImage(ct.image);
  const processo = ct.command?.[0]?.split('/').pop() || (img.image?.repo.includes('mariadb') ? 'mariadbd' : img.image?.repo.includes('mysql') ? 'mysqld' : img.image?.repo.includes('postgres') ? 'postgres' : img.image?.repo.includes('httpd') ? 'httpd' : img.image?.repo.includes('nginx') ? 'nginx' : 'run-app');
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
    tar,
    df: () => {
      const linhas = [['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'], ['overlay', '120G', '38G', '83G', '32%', '/']];
      for (const m of ct.volumeMounts || []) {
        const v = (pod.spec.volumes || []).find((x) => x.name === m.name);
        if (v?.persistentVolumeClaim) {
          const pvc = env.cluster.get('PersistentVolumeClaim', v.persistentVolumeClaim.claimName, pod.metadata.namespace);
          const sc = pvc?.spec.storageClassName === 'nfs-storage';
          linhas.push([sc ? `192.168.50.254:/exports-ocp4/${pod.metadata.namespace}-${v.persistentVolumeClaim.claimName}` : `/dev/topolvm/${(pvc?.spec.volumeName || 'pending').slice(4, 40)}`, pvc?.status?.capacity?.storage?.replace('i', '') || '1G', '33M', '974M', '4%', m.mountPath]);
        } else if (v?.configMap || v?.secret) linhas.push(['tmpfs', '30G', '4.0K', '30G', '1%', m.mountPath]);
        else linhas.push(['/dev/sda4', '120G', '38G', '83G', '32%', m.mountPath]);
      }
      linhas.push(['tmpfs', '30G', '0', '30G', '0%', '/run/secrets/kubernetes.io/serviceaccount']);
      const larg = linhas[0].map((_, i) => Math.max(...linhas.map((l) => String(l[i]).length)));
      return ok(linhas.map((l) => l.map((x, i) => (i === 0 || i === 5 ? String(x).padEnd(larg[i]) : String(x).padStart(larg[i]))).join(' ').trimEnd()).join('\n') + '\n');
    },
    openssl,
    nc,
    mysql,
    mariadb: mysql,
    psql,
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

// Host `utility` do laboratório, na rede de servidores (172.25.150.0/24), com
// clientes de rede. Entra com `ssh utility` e sai com `exit`.
export function contextoUtility(env) {
  const contexto = {
    hostExterno: 'utility',
    ip: '172.25.150.254',
    shell: 'utility',
    prompt: '[student@utility ~]$ ',
    nome: 'utility',
    env,
    vars: { HOME: '/home/student', USER: 'student', HOSTNAME: 'utility.lab.example.com', '?': '0' },
    cwd: '/home/student',
  };
  const sair = ({ args, sh }) => {
    sh.saiPod(Number(args[0] ?? sh.vars['?'] ?? 0));
    return ok();
  };
  const basicos = ['echo', 'printf', 'cat', 'pwd', 'grep', 'head', 'tail', 'wc', 'sleep', 'date', 'clear', 'export'];
  contexto.cmds = {
    ...Object.fromEntries(basicos.map((n) => [n, builtins[n]])),
    hostname: () => ok('utility.lab.example.com\n'),
    ip: ({ args }) => ok(/^a/.test(args[0] || '') ? '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    inet 172.25.250.253/24 brd 172.25.250.255 scope global noprefixroute eth0\n3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000\n    inet 172.25.150.254/24 brd 172.25.150.255 scope global noprefixroute eth1\n' : ''),
    curl,
    nc,
    ncat: nc,
    mysql,
    mariadb: mysql,
    psql,
    exit: sair,
    logout: sair,
    oc: () => ({ err: 'bash: oc: command not found\n', code: 127 }),
    help: () => ok(env.t('No host utility: psql, mysql, nc, curl, ip addr, hostname e comandos básicos. Digite exit para voltar à estação de trabalho.\n', 'On the utility host: psql, mysql, nc, curl, ip addr, hostname, and basic commands. Type exit to go back to the workstation.\n')),
  };
  return contexto;
}
