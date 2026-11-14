// curl simulado. Na estação de trabalho só alcança o que está fora do
// cluster (routes, API); dentro de um pod alcança services e pods.
import { requisicao } from './net.js';

const FRASES = { 200: 'OK', 302: 'Found', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 503: 'Service Unavailable' };

function opcoes(args) {
  const o = { headers: [] };
  const urls = [];
  const comValor = { o: 'saida', w: 'formato', m: 'max', H: 'header', X: 'metodo', d: 'dados', u: 'usuario', A: 'agente', e: 'referer' };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const [nome, valor] = a.slice(2).split(/=(.*)/s);
      const pega = () => valor ?? args[++i];
      if (['insecure'].includes(nome)) o.k = true;
      else if (nome === 'silent') o.s = true;
      else if (nome === 'show-error') o.S = true;
      else if (nome === 'verbose') o.v = true;
      else if (nome === 'head') o.I = true;
      else if (nome === 'include') o.i = true;
      else if (nome === 'location') o.L = true;
      else if (nome === 'fail') o.f = true;
      else if (nome === 'output') o.saida = pega();
      else if (nome === 'write-out') o.formato = pega();
      else if (nome === 'max-time') o.max = pega();
      else if (nome === 'connect-timeout') o.conexao = pega();
      else if (nome === 'cacert') o.cacert = pega();
      else if (nome === 'header') o.headers.push(pega());
      else if (['request', 'data', 'data-raw', 'user', 'user-agent', 'resolve', 'cert', 'key'].includes(nome)) pega();
      else return { erro: `curl: option --${nome}: is unknown\ncurl: try 'curl --help' or 'curl --manual' for more information\n` };
    } else if (/^-[A-Za-z]/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (comValor[ch]) {
          const v = a.slice(j + 1) || args[++i];
          if (ch === 'H') o.headers.push(v);
          else o[comValor[ch]] = v;
          break;
        }
        if ('ksSvIiLf'.includes(ch)) o[ch] = true;
        else return { erro: `curl: option -${ch}: is unknown\ncurl: try 'curl --help' or 'curl --manual' for more information\n` };
      }
    } else urls.push(a);
  }
  return { o, urls };
}

function parseUrl(bruto) {
  const m = bruto.match(/^(?:(https?):\/\/)?(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?([^?#]*)?(\?[^#]*)?/i);
  if (!m || !m[2]) return null;
  const https = (m[1] || 'http').toLowerCase() === 'https';
  return { https, host: m[2], porta: m[3] ? Number(m[3]) : null, caminho: (m[4] || '/') + (m[5] || ''), texto: bruto };
}

const ERROS = {
  dns: (u) => [6, `Could not resolve host: ${u.host}`],
  recusada: (u, ip) => [7, `Failed to connect to ${u.host} port ${u.porta ?? (u.https ? 443 : 80)} after 1 ms: Couldn't connect to server`],
  bloqueada: (u, ip, ms) => [28, ms ? `Connection timed out after ${ms} milliseconds` : `Failed to connect to ${u.host} port ${u.porta ?? (u.https ? 443 : 80)} after 130120 ms: Couldn't connect to server`],
  mysql: () => [1, 'Received HTTP/0.9 when not allowed'],
  vazia: () => [52, 'Empty reply from server'],
  'tls-versao': () => [35, 'OpenSSL/3.0.7: error:0A00010B:SSL routines::wrong version number'],
};

// O certificado apresentado é confiável para este cliente?
function confiavel(ctx, cert, o, noPod) {
  if (!cert || o.k) return null;
  if (cert === 'api') return noPod ? 'self-signed certificate in certificate chain' : null;
  if (cert === 'padrao') return noPod ? 'self-signed certificate in certificate chain' : null;
  if (o.cacert) {
    try {
      const pem = ctx.env.fs.read(ctx.env.fs.resolve(ctx.sh.cwd, o.cacert)).trim();
      if (pem && (pem === (cert.ca || '').trim() || pem === cert.pem.trim())) return null;
    } catch {
      return `error setting certificate file: ${o.cacert}`;
    }
  }
  return 'unable to get local issuer certificate';
}

export async function curl(ctx) {
  const { o, urls, erro } = opcoes(ctx.args);
  if (erro) return { err: erro, code: 2 };
  if (!urls.length) return { err: "curl: try 'curl --help' or 'curl --manual' for more information\n", code: 2 };
  const c = ctx.env.cluster;
  const noPod = ctx.sh.pod ? c.get('Pod', ctx.sh.pod.nome, ctx.sh.pod.ns) : null;
  let out = '';
  let err = '';
  let code = 0;
  for (const bruto of urls) {
    let u = parseUrl(bruto);
    if (!u) {
      err += `curl: (3) URL rejected: Malformed input to a URL function\n`;
      code = 3;
      continue;
    }
    let r;
    for (let saltos = 0; saltos < 5; saltos++) {
      const token = o.headers.map((h) => h.match(/^authorization:\s*bearer\s+(\S+)/i)?.[1]).find(Boolean);
      r = requisicao(c, noPod, { host: u.host, porta: u.porta, caminho: u.caminho, https: u.https, token });
      if (!o.L || r.status !== 302) break;
      u = parseUrl(r.local);
    }
    if (r.erro === 'bloqueada') {
      // A conexão some no vazio: espera o tempo limite, como na vida real.
      const limite = Number(o.max ?? o.conexao ?? 0);
      await ctx.env.sleep(limite > 0 ? Math.min(limite, 30) : 10);
      const [n, msg] = ERROS.bloqueada(u, r.ip, limite > 0 ? Math.round(limite * 1000) : 0);
      if (!o.s || o.S) err += `curl: (${n}) ${msg}\n`;
      code = n;
      continue;
    }
    if (r.erro) {
      const [n, msg] = ERROS[r.erro](u, r.ip);
      if (!o.s || o.S) err += `curl: (${n}) ${msg}\n`;
      code = n;
      continue;
    }
    if (u.https) {
      const problema = confiavel(ctx, r.cert, o, Boolean(noPod));
      if (problema) {
        if (!o.s || o.S) err += `curl: (60) SSL certificate problem: ${problema}\nMore details here: https://curl.se/docs/sslcerts.html\n\ncurl failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above.\n`;
        code = 60;
        continue;
      }
    }
    if (o.f && r.status >= 400) {
      if (!o.s || o.S) err += `curl: (22) The requested URL returned error: ${r.status}\n`;
      code = 22;
      continue;
    }
    const cabecalho = `HTTP/1.1 ${r.status} ${FRASES[r.status] || ''}\r\ncontent-type: ${r.tipo}\r\ncontent-length: ${new TextEncoder().encode(r.corpo).length}\r\n${r.local ? `location: ${r.local}\r\n` : ''}${r.status === 503 ? 'cache-control: private, max-age=0, no-cache, no-store\r\n' : ''}\r\n`;
    if (o.v) err += `*   Trying ${u.host}:${u.porta ?? (u.https ? 443 : 80)}...\n* Connected to ${u.host}\n> GET ${u.caminho} HTTP/1.1\n> Host: ${u.host}\n> User-Agent: curl/7.76.1\n> Accept: */*\n>\n${cabecalho.trimEnd().split('\r\n').map((l) => '< ' + l).join('\n')}\n<\n`;
    let corpo = o.I ? cabecalho : (o.i ? cabecalho : '') + r.corpo;
    if (o.formato) {
      const fmt = o.formato.replace(/\\n/g, '\n').replace(/%\{http_code\}|%\{response_code\}/g, String(r.status)).replace(/%\{content_type\}/g, r.tipo).replace(/%\{url_effective\}/g, u.texto);
      if (o.saida) corpo = fmt;
      else corpo += fmt;
    }
    if (o.saida && o.saida !== '-') {
      if (o.saida !== '/dev/null') {
        try {
          ctx.env.fs.write(ctx.env.fs.resolve(ctx.sh.cwd, o.saida), o.formato ? r.corpo : corpo);
        } catch (e) {
          err += `curl: (23) Failure writing output to destination\n`;
          code = 23;
          continue;
        }
      }
      if (o.formato) out += corpo;
      continue;
    }
    out += corpo;
  }
  return { out, err, code };
}
