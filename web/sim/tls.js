// Certificados simulados: chaves, CSRs e certificados em PEM, CAs do
// cluster, verificação de cadeia e de nome, e o comando `openssl`.
import { b64, hashId, hashNum, rand } from './util.js';

const ROTULOS = { cert: 'CERTIFICATE', key: 'PRIVATE KEY', rsa: 'RSA PRIVATE KEY', csr: 'CERTIFICATE REQUEST' };

function pem(tipo, dados) {
  const corpo = b64.enc(JSON.stringify(dados)).match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${ROTULOS[tipo]}-----\n${corpo}\n-----END ${ROTULOS[tipo]}-----\n`;
}

// Lê todos os blocos PEM de um texto.
export function lePem(texto) {
  const out = [];
  for (const m of String(texto || '').matchAll(/-----BEGIN ([A-Z ]+)-----\s*([\s\S]*?)-----END \1-----/g)) {
    try {
      const d = JSON.parse(b64.dec(m[2].replace(/\s+/g, '')));
      if (d && d.t) out.push({ ...d, rotulo: m[1], pem: m[0] + '\n' });
    } catch {
      out.push({ t: 'invalido', rotulo: m[1] });
    }
  }
  return out;
}

export const umCert = (texto) => lePem(texto).find((x) => x.t === 'cert') || null;
export const umaChave = (texto) => lePem(texto).find((x) => x.t === 'key') || null;

export function novaChave(bits = 2048, rsa = false) {
  return pem(rsa ? 'rsa' : 'key', { t: 'key', id: rand(16), bits });
}

const dataTxt = (s) => {
  const d = new Date(s * 1000);
  const m = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[d.getUTCMonth()];
  return `${m} ${String(d.getUTCDate()).padStart(2)} ${d.toISOString().slice(11, 19)} ${d.getUTCFullYear()} GMT`;
};

export const nomeTxt = (n) => Object.entries(n || {}).map(([k, v]) => `${k} = ${v}`).join(', ');

export function parseSubj(s) {
  const out = {};
  for (const p of String(s || '').split('/').filter(Boolean)) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  return out;
}

export function parseSan(txt) {
  return String(txt || '').replace(/^\s*subjectAltName\s*=\s*/, '').split(',').map((x) => x.trim()).filter(Boolean);
}

// Emite um certificado. `assinante` = { subject, chaveId } da CA (ou do próprio, se autoassinado).
export function emite({ subject, san = [], chaveId, assinante, dias = 365, ca = false, agora }) {
  const dados = {
    t: 'cert',
    serial: hashId(rand(8), 16),
    subject,
    issuer: assinante ? assinante.subject : subject,
    san,
    pub: chaveId,
    assinadoPor: assinante ? assinante.chaveId : chaveId,
    notBefore: agora,
    notAfter: agora + dias * 86400,
    ca,
  };
  return pem('cert', dados);
}

// ------------------------------------------------------------- CAs fixas

const INSTALACAO = Math.floor(Date.UTC(2026, 9, 15) / 1000);
const DEZ_ANOS = 3650;

function caFixa(cn, chave, extra = {}) {
  const subject = { CN: cn, ...extra };
  return { subject, chaveId: chave, pem: emite({ subject, chaveId: chave, dias: DEZ_ANOS, ca: true, agora: INSTALACAO }), chavePem: pem('rsa', { t: 'key', id: chave, bits: 2048 }) };
}

export const INGRESS_CA = caFixa('ingress-operator@1760500000', 'ingressoperatorca');
export const SERVICE_CA = caFixa('openshift-service-serving-signer@1760500000', 'serviceservingsigner');
export const KUBE_CA = caFixa('kube-apiserver-lb-signer', 'kubeapiserverlbsigner', { OU: 'openshift' });
export const TRAINING_CA = caFixa('Nimbus Training CA', 'nimbustrainingca', { C: 'BR', O: 'Nimbus Tecnologia' });

export const ROUTER_CERT = emite({ subject: { CN: '*.apps.lab.example.com' }, san: ['DNS:*.apps.lab.example.com'], chaveId: 'routerdefaultkey', assinante: INGRESS_CA, dias: 730, agora: INSTALACAO });
export const API_CERT = emite({ subject: { CN: 'api.lab.example.com' }, san: ['DNS:api.lab.example.com', 'DNS:kubernetes', 'DNS:kubernetes.default', 'DNS:kubernetes.default.svc', 'DNS:kubernetes.default.svc.cluster.local', 'IP Address:172.30.0.1'], chaveId: 'apiserverkey', assinante: KUBE_CA, dias: 730, agora: INSTALACAO });

// Certificado de serviço emitido pela service CA para `svc.ns.svc`.
export function certDeServico(svc, ns, agora) {
  const chave = rand(16);
  const host = `${svc}.${ns}.svc`;
  return {
    crt: emite({ subject: { CN: host }, san: [`DNS:${host}`, `DNS:${host}.cluster.local`], chaveId: chave, assinante: SERVICE_CA, dias: 730, agora }),
    key: pem('rsa', { t: 'key', id: chave, bits: 2048 }),
  };
}

// --------------------------------------------------------------- verificação

const casaHost = (padrao, host) => {
  if (padrao.startsWith('*.')) {
    const resto = host.split('.').slice(1).join('.');
    return resto === padrao.slice(2) && host.split('.').length === padrao.split('.').length;
  }
  return padrao.toLowerCase() === host.toLowerCase();
};

export function hostConfere(cert, host) {
  const dns = (cert.san || []).filter((s) => s.startsWith('DNS:')).map((s) => s.slice(4));
  const ips = (cert.san || []).filter((s) => /^IP( Address)?:/.test(s)).map((s) => s.split(':').pop());
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return ips.includes(host);
  if (dns.length) return dns.some((d) => casaHost(d, host));
  return Boolean(cert.subject?.CN) && casaHost(cert.subject.CN, host);
}

// Confere a cadeia, a validade e o nome. Devolve null ou a mensagem de erro do OpenSSL.
export function verifica(certPem, confiaveis, host, agora) {
  const cert = umCert(certPem);
  if (!cert) return 'unable to get local issuer certificate';
  const ancoras = confiaveis.flatMap((t) => lePem(t)).filter((x) => x.t === 'cert');
  const autoassinado = cert.assinadoPor === cert.pub;
  const confiavel = ancoras.some((a) => a.pub === cert.assinadoPor && JSON.stringify(a.subject) === JSON.stringify(cert.issuer)) || ancoras.some((a) => a.serial === cert.serial);
  if (!confiavel) return autoassinado ? 'self-signed certificate' : 'unable to get local issuer certificate';
  if (agora > cert.notAfter) return 'certificate has expired';
  if (agora < cert.notBefore) return 'certificate is not yet valid';
  if (host && !hostConfere(cert, host)) return `no alternative certificate subject name matches target host name '${host}'`;
  return null;
}

// ------------------------------------------------------------------- openssl

function opcoes(args) {
  const BOOL = new Set(['noout', 'text', 'subject', 'issuer', 'dates', 'enddate', 'startdate', 'fingerprint', 'nodes', 'noenc', 'x509', 'new', 'req', 'CAcreateserial', 'modulus', 'check', 'showcerts', 'brief', 'pubkey', 'serial', 'sha256', 'sha1', 'md5', 'quiet', 'verify']);
  const o = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (/^-[A-Za-z]/.test(a)) {
      const k = a.slice(1);
      if (BOOL.has(k)) o[k] = true;
      else if (k === 'addext') (o.addext ??= []).push(args[++i]);
      else o[k] = args[++i];
    } else pos.push(a);
  }
  return { o, pos };
}

function leArquivo(ctx, caminho) {
  const p = ctx.env.fs.resolve(ctx.sh.cwd, caminho);
  if (!ctx.env.fs.isFile(p)) throw new Error(`Could not open file or uri for loading from ${caminho}`);
  return ctx.env.fs.read(p);
}

function grava(ctx, caminho, texto) {
  if (!caminho) return texto;
  ctx.env.fs.write(ctx.env.fs.resolve(ctx.sh.cwd, caminho), texto);
  return '';
}

// SANs vindos de um arquivo de extensões (`subjectAltName = DNS:a` ou `@alt_names`).
function sanDeArquivo(texto, secao) {
  let alvo = texto;
  if (secao) {
    const m = texto.match(new RegExp(`\\[\\s*${secao}\\s*\\]([\\s\\S]*?)(\\n\\s*\\[|$)`));
    alvo = m ? m[1] : texto;
  }
  const linha = alvo.match(/subjectAltName\s*=\s*(.+)/);
  if (!linha) return [];
  const v = linha[1].trim();
  if (v.startsWith('@')) {
    const m = texto.match(new RegExp(`\\[\\s*${v.slice(1)}\\s*\\]([\\s\\S]*?)(\\n\\s*\\[|$)`));
    if (!m) return [];
    return [...m[1].matchAll(/^\s*(DNS|IP)\.\d+\s*=\s*(\S+)/gm)].map((x) => `${x[1] === 'IP' ? 'IP Address' : 'DNS'}:${x[2]}`);
  }
  return parseSan(v).map((s) => s.replace(/^IP:/, 'IP Address:'));
}

function textoCert(c) {
  return `Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number:
            ${c.serial.match(/.{1,2}/g).join(':')}
        Signature Algorithm: sha256WithRSAEncryption
        Issuer: ${nomeTxt(c.issuer)}
        Validity
            Not Before: ${dataTxt(c.notBefore)}
            Not After : ${dataTxt(c.notAfter)}
        Subject: ${nomeTxt(c.subject)}
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                Public-Key: (2048 bit)
        X509v3 extensions:
            X509v3 Basic Constraints: critical
                CA:${c.ca ? 'TRUE' : 'FALSE'}
${c.san?.length ? `            X509v3 Subject Alternative Name: \n                ${c.san.join(', ')}\n` : ''}    Signature Algorithm: sha256WithRSAEncryption
`;
}

const digest = (txt, n = 32) => hashId(txt, n).split('').map((ch) => ch.charCodeAt(0).toString(16).slice(-1)).join('');
const modulo = (id) => (digest(`mod:${id}`, 64) + digest(`mod2:${id}`, 64)).toUpperCase();

export async function openssl(ctx) {
  const [sub, ...args] = ctx.args;
  const { o, pos } = opcoes(args);
  const agora = ctx.env.cluster.now;
  const ok = (out) => ({ out, code: 0 });
  try {
    switch (sub) {
      case 'version':
        return ok('OpenSSL 3.0.7 1 Nov 2022 (Library: OpenSSL 3.0.7 1 Nov 2022)\n');
      case 'genrsa': {
        const bits = Number(pos[0] || 2048);
        return ok(grava(ctx, o.out, novaChave(bits, true)));
      }
      case 'genpkey':
        return ok(grava(ctx, o.out, novaChave(2048)));
      case 'req': {
        let chave;
        if (o.newkey) {
          chave = umaChave(novaChave(Number(String(o.newkey).split(':')[1] || 2048)));
          grava(ctx, o.keyout || 'privkey.pem', chave.pem);
        } else if (o.key) chave = umaChave(leArquivo(ctx, o.key));
        else if (o.in) {
          const csr = lePem(leArquivo(ctx, o.in)).find((x) => x.t === 'csr');
          if (!csr) throw new Error('unable to load X509 request');
          if (o.noout && o.text) return ok(`Certificate Request:\n    Data:\n        Subject: ${nomeTxt(csr.subject)}\n${csr.san.length ? `        Requested Extensions:\n            X509v3 Subject Alternative Name: \n                ${csr.san.join(', ')}\n` : ''}`);
          if (o.noout && o.subject) return ok(`subject=${nomeTxt(csr.subject)}\n`);
          return ok(csr.pem);
        }
        if (!chave) throw new Error('req: no private key given (-key or -newkey)');
        if (!o.subj) return { err: 'req: interactive prompts are not simulated, use -subj "/C=BR/O=.../CN=..."\n', code: 1 };
        const subject = parseSubj(o.subj);
        let san = (o.addext || []).flatMap((e) => (/subjectAltName/.test(e) ? parseSan(e) : [])).map((s) => s.replace(/^IP:/, 'IP Address:'));
        if (o.config) san = san.concat(sanDeArquivo(leArquivo(ctx, o.config), o.extensions || o.reqexts));
        if (o.x509) return ok(grava(ctx, o.out, emite({ subject, san, chaveId: chave.id, dias: Number(o.days || 30), agora, ca: !san.length })));
        return ok(grava(ctx, o.out, pem('csr', { t: 'csr', subject, san, pub: chave.id })));
      }
      case 'x509': {
        if (o.req) {
          const csr = lePem(leArquivo(ctx, o.in)).find((x) => x.t === 'csr');
          if (!csr) throw new Error('unable to load X509 request');
          let assinante;
          if (o.CA) {
            const ca = umCert(leArquivo(ctx, o.CA));
            const chaveCa = umaChave(leArquivo(ctx, o.CAkey || o.CA));
            if (!ca || !chaveCa) throw new Error('unable to load CA certificate or key');
            if (chaveCa.id !== ca.pub) throw new Error('Certificate and private key do not match');
            assinante = { subject: ca.subject, chaveId: ca.pub };
          } else if (o.signkey) assinante = { subject: csr.subject, chaveId: umaChave(leArquivo(ctx, o.signkey)).id };
          let san = [];
          if (o.copy_extensions === 'copy' || o.copy_extensions === 'copyall') san = csr.san;
          if (o.extfile) san = san.concat(sanDeArquivo(leArquivo(ctx, o.extfile), o.extensions));
          const cert = emite({ subject: csr.subject, san, chaveId: csr.pub, assinante, dias: Number(o.days || 30), agora });
          return { out: grava(ctx, o.out, cert), err: `Certificate request self-signature ok\nsubject=${nomeTxt(csr.subject)}\n`, code: 0 };
        }
        const fonte = o.in ? leArquivo(ctx, o.in) : ctx.stdin;
        const c = umCert(fonte);
        if (!c) throw new Error('Could not read certificate from ' + (o.in || '<stdin>'));
        let out = '';
        if (o.text) out += textoCert(c);
        if (o.subject) out += `subject=${nomeTxt(c.subject)}\n`;
        if (o.issuer) out += `issuer=${nomeTxt(c.issuer)}\n`;
        if (o.serial) out += `serial=${c.serial.toUpperCase()}\n`;
        if (o.dates || o.startdate) out += `notBefore=${dataTxt(c.notBefore)}\n`;
        if (o.dates || o.enddate) out += `notAfter=${dataTxt(c.notAfter)}\n`;
        if (o.ext) out += c.san?.length ? `X509v3 Subject Alternative Name: \n    ${c.san.join(', ')}\n` : 'No extensions in certificate\n';
        if (o.fingerprint) out += `${o.sha256 ? 'sha256' : 'SHA1'} Fingerprint=${digest(c.serial, o.sha256 ? 32 : 20).toUpperCase().match(/.{2}/g).join(':')}\n`;
        if (o.modulus) out += `Modulus=${modulo(c.pub)}\n`;
        if (!o.noout) out += c.pem.trimEnd() + '\n';
        return ok(out);
      }
      case 'rsa':
      case 'pkey': {
        const k = umaChave(o.in ? leArquivo(ctx, o.in) : ctx.stdin);
        if (!k) throw new Error('Could not read private key');
        let out = '';
        if (o.modulus) out += `Modulus=${modulo(k.id)}\n`;
        if (o.check) out += 'RSA key ok\n';
        if (!o.noout) out += k.pem.trimEnd() + '\n';
        return ok(out);
      }
      case 'md5':
      case 'sha256':
        return ok(`${sub.toUpperCase()}(stdin)= ${digest(ctx.stdin, sub === 'md5' ? 32 : 64)}\n`);
      case 'verify': {
        const confiaveis = o.CAfile ? [leArquivo(ctx, o.CAfile)] : [];
        let out = '';
        let code = 0;
        for (const arq of pos) {
          const c = umCert(leArquivo(ctx, arq));
          const erro = verifica(c?.pem, confiaveis, null, agora);
          if (!erro) out += `${arq}: OK\n`;
          else {
            const num = { 'self-signed certificate': 18, 'certificate has expired': 10 }[erro] ?? 20;
            out += `${nomeTxt(c?.subject)}\nerror ${num} at 0 depth lookup: ${erro}\nerror ${arq}: verification failed\n`;
            code = 2;
          }
        }
        return { out, code };
      }
      case 's_client': {
        const { requisicao } = await import('./net.js');
        const [host, porta] = String(o.connect || '').split(':');
        if (!host) throw new Error('s_client: -connect host:port is required');
        const noPod = ctx.sh.pod ? ctx.env.cluster.get('Pod', ctx.sh.pod.nome, ctx.sh.pod.ns) : null;
        const r = requisicao(ctx.env.cluster, noPod, { host: o.servername || host, porta: Number(porta || 443), caminho: '/', https: true });
        if (r.erro || !r.cert) return { out: `${r.erro === 'dns' ? `BIO_lookup_ex:system lib:` : 'CONNECTED(00000003)\n'}\n`, err: `${r.erro === 'dns' ? `getaddrinfo: Name or service not known` : 'error:0A00010B:SSL routines::wrong version number'}\n`, code: 1 };
        const c = umCert(r.cert);
        const confiaveis = o.CAfile ? [leArquivo(ctx, o.CAfile)] : noPod ? [] : [INGRESS_CA.pem];
        const erro = verifica(r.cert, confiaveis, null, agora);
        return ok(`CONNECTED(00000003)\ndepth=0 ${nomeTxt(c.subject)}\n---\nCertificate chain\n 0 s:${nomeTxt(c.subject)}\n   i:${nomeTxt(c.issuer)}\n---\nServer certificate\n${c.pem.trimEnd()}\nsubject=${nomeTxt(c.subject)}\nissuer=${nomeTxt(c.issuer)}\n---\nSSL handshake has read 1842 bytes and written 393 bytes\nVerification${erro ? ' error' : ''}: ${erro || 'OK'}\n---\nNew, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384\n    Verify return code: ${erro ? `${erro === 'self-signed certificate' ? 18 : 20} (${erro})` : '0 (ok)'}\n---\nDONE\n`);
      }
      default:
        return { err: ctx.env.t(`[simulador] "openssl ${sub ?? ''}" ainda não é simulado neste jogo.\n`, `[simulator] "openssl ${sub ?? ''}" is not simulated in this game yet.\n`), code: 1 };
    }
  } catch (e) {
    return { err: `${e.message}\n`, code: 1 };
  }
}

export { hashNum };
