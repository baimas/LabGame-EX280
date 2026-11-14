// Clientes TCP: `nc` (ncat) e um cliente `mysql` mínimo.
import { destinoTcp } from './net.js';
import { resolveEnv } from './controllers.js';

const origem = (ctx) => (ctx.sh.pod ? ctx.env.cluster.get('Pod', ctx.sh.pod.nome, ctx.sh.pod.ns) : null);
const ipDe = (ctx, host) => (/^\d/.test(host) ? host : host);

// Espera o tempo limite de uma conexão que não responde.
async function esperaTimeout(ctx, segundos) {
  await ctx.env.sleep(Math.min(segundos || 10, 30));
}

export async function nc(ctx) {
  const o = { z: false, v: false, w: null, u: false };
  const pos = [];
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (a === '-w' || a === '--wait') o.w = Number(ctx.args[++i]);
    else if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) o[ch] = true;
    else pos.push(a);
  }
  const [host, portaTxt] = pos;
  if (!host || !portaTxt) return { err: 'Ncat: You must specify a host to connect to. QUITTING.\n', code: 2 };
  if (o.u) return { err: ctx.env.t('[simulador] nc -u (UDP) ainda não é simulado neste jogo.\n', '[simulator] nc -u (UDP) is not simulated in this game yet.\n'), code: 1 };
  const porta = Number(portaTxt);
  const cab = o.v ? 'Ncat: Version 7.92 ( https://nmap.org/ncat )\n' : '';
  const d = destinoTcp(ctx.env.cluster, origem(ctx), host, porta);
  if (d.erro === 'dns') return { err: `${cab}Ncat: Could not resolve hostname "${host}": Name or service not known. QUITTING.\n`, code: 2 };
  if (d.erro === 'recusada') return { err: `${cab}Ncat: Connection refused.\n`, code: 1 };
  if (d.erro) {
    await esperaTimeout(ctx, o.w);
    return { err: `${cab}Ncat: TIMEOUT.\n`, code: 1 };
  }
  const conectado = `${cab}${o.v ? `Ncat: Connected to ${ipDe(ctx, host)}:${porta}.\n` : ''}`;
  if (o.z) return { err: o.v ? `${conectado}Ncat: 0 bytes sent, 0 bytes received in 0.02 seconds.\n` : '', code: 0 };
  let out = '';
  const entrada = ctx.stdin || '';
  if (d.proto === 'chat') {
    const nome = d.pod.metadata.name;
    out = `welcome to nimbus-chat (${nome})\n`;
    for (const linha of entrada.split('\n').filter(Boolean)) out += `[${nome}] echo: ${linha}\n`;
  } else if (d.proto === 'mysql') out = 'J\n8.0.36\u0000\u0001\u0000\u0000\u0000caching_sha2_password\n';
  else if (d.proto === 'http' || d.servidor === 'roteador') out = entrada ? 'HTTP/1.1 400 Bad Request\r\ncontent-length: 0\r\n\r\n' : '';
  return { out, err: o.v ? `${conectado}Ncat: ${entrada.length} bytes sent, ${out.length} bytes received in 0.03 seconds.\n` : '', code: 0 };
}

let formato = { silencioso: false, semCabecalho: false };

function tabela(titulo, linhas) {
  if (formato.silencioso || formato.semCabecalho) return (formato.semCabecalho ? '' : `${titulo}\n`) + linhas.map((l) => `${l}\n`).join('');
  const larg = Math.max(titulo.length, ...linhas.map((l) => String(l).length));
  const borda = `+${'-'.repeat(larg + 2)}+`;
  return [borda, `| ${titulo.padEnd(larg)} |`, borda, ...linhas.map((l) => `| ${String(l).padEnd(larg)} |`), borda].join('\n') + '\n';
}

export async function mysql(ctx) {
  const o = { h: 'localhost', P: '3306', u: null, p: undefined, e: null, banco: null };
  formato = { silencioso: false, semCabecalho: false };
  for (let i = 0; i < ctx.args.length; i++) {
    const a = ctx.args[i];
    if (/^-[sNB]+$/.test(a) || ['--silent', '--skip-column-names', '--batch'].includes(a)) {
      if (/s|B/.test(a) || a === '--silent' || a === '--batch') formato.silencioso = true;
      if (a.includes('N') || a === '--skip-column-names') formato.semCabecalho = true;
      continue;
    }
    const valor = (curta, longa) => (a === `-${curta}` || a === `--${longa}` ? ctx.args[++i] : a.startsWith(`--${longa}=`) ? a.split('=').slice(1).join('=') : a.slice(2));
    if (a.startsWith('-h') || a.startsWith('--host')) o.h = valor('h', 'host');
    else if (a.startsWith('-P') || a.startsWith('--port')) o.P = valor('P', 'port');
    else if (a.startsWith('-u') || a.startsWith('--user')) o.u = valor('u', 'user');
    else if (a.startsWith('-e') || a.startsWith('--execute')) o.e = valor('e', 'execute');
    else if (a.startsWith('--password=')) o.p = a.slice(11);
    else if (a.startsWith('-p')) o.p = a.length > 2 ? a.slice(2) : '';
    else if (!a.startsWith('-')) o.banco = a;
  }
  const usuario = o.u || 'student';
  let err = o.p ? 'mysql: [Warning] Using a password on the command line interface can be insecure.\n' : '';
  if (o.p === '' && ctx.env.ask) o.p = await ctx.env.ask('Enter password: ', true);
  if (o.h === 'localhost' && !ctx.sh.pod) return { err: err + "ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/lib/mysql/mysql.sock' (2)\n", code: 1 };
  const porta = Number(o.P);
  const d = destinoTcp(ctx.env.cluster, origem(ctx), o.h, porta);
  if (d.erro === 'dns') return { err: err + `ERROR 2005 (HY000): Unknown MySQL server host '${o.h}' (-2)\n`, code: 1 };
  if (d.erro === 'bloqueada') {
    await esperaTimeout(ctx, 10);
    return { err: err + `ERROR 2003 (HY000): Can't connect to MySQL server on '${o.h}:${porta}' (110)\n`, code: 1 };
  }
  if (d.erro || d.proto !== 'mysql') return { err: err + `ERROR 2003 (HY000): Can't connect to MySQL server on '${o.h}:${porta}' (111)\n`, code: 1 };
  const env = resolveEnv(ctx.env.cluster, d.pod, d.pod.spec.containers[0]).env;
  const ehRoot = usuario === 'root' && env.MYSQL_ROOT_PASSWORD && o.p === env.MYSQL_ROOT_PASSWORD;
  const ehUsuario = env.MYSQL_USER && usuario === env.MYSQL_USER && o.p === env.MYSQL_PASSWORD;
  const cliente = ctx.sh.pod ? origem(ctx)?.status.podIP : '172.25.250.9';
  if (!ehRoot && !ehUsuario) return { err: err + `ERROR 1045 (28000): Access denied for user '${usuario}'@'${cliente}' (using password: ${o.p ? 'YES' : 'NO'})\n`, code: 1 };
  const bancos = ['information_schema', ...(ehRoot ? ['mysql', 'performance_schema', 'sys'] : []), ...(env.MYSQL_DATABASE ? [env.MYSQL_DATABASE] : [])].sort();
  if (o.banco && !bancos.includes(o.banco)) return { err: err + `ERROR 1049 (42000): Unknown database '${o.banco}'\n`, code: 1 };
  if (o.e === null) return { err: err + ctx.env.t('[simulador] A sessão interativa do mysql não é simulada: use -e "SELECT ...".\n', '[simulator] The interactive mysql session is not simulated: use -e "SELECT ...".\n'), code: 1 };
  let out = '';
  for (const q of o.e.split(';').map((x) => x.trim()).filter(Boolean)) {
    const ql = q.toLowerCase().replace(/\s+/g, ' ');
    if (ql === 'select version()') out += tabela('version()', ['8.0.36']);
    else if (ql === 'show databases') out += tabela('Database', bancos);
    else if (ql === 'select 1') out += tabela('1', ['1']);
    else if (ql === 'select database()') out += tabela('database()', [o.banco || 'NULL']);
    else if (ql === 'select user()' || ql === 'select current_user()') out += tabela(q.slice(7), [`${usuario}@${cliente}`]);
    else if (ql === 'select @@hostname') out += tabela('@@hostname', [d.pod.metadata.name]);
    else if (ql === 'select now()') out += tabela('now()', [new Date(ctx.env.cluster.now * 1000).toISOString().slice(0, 19).replace('T', ' ')]);
    else if (ql === 'show tables') out += o.banco ? '' : '';
    else return { out, err: err + `ERROR 1064 (42000) at line 1: ${ctx.env.t('[simulador] consulta não simulada. Use SELECT VERSION(), SELECT 1, SHOW DATABASES, SELECT USER() ou SELECT @@HOSTNAME.', '[simulator] query not simulated. Use SELECT VERSION(), SELECT 1, SHOW DATABASES, SELECT USER(), or SELECT @@HOSTNAME.')}\n`, code: 1 };
  }
  return { out, err, code: 0 };
}
