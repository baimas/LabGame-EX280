// Comandos básicos de shell disponíveis no terminal simulado.
import { b64 } from './util.js';

const ok = (out = '') => ({ out, code: 0 });
const falha = (err, code = 1) => ({ err: err.endsWith('\n') ? err : err + '\n', code });
const linhasDe = (txt) => (txt === '' ? [] : txt.replace(/\n$/, '').split('\n'));
const junta = (ls) => (ls.length ? ls.join('\n') + '\n' : '');

// Separa opções curtas simples (-n 5, -i) dos argumentos posicionais.
function opcoes(args, comValor = '') {
  const o = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      pos.push(...args.slice(i + 1));
      break;
    }
    if (/^--\w/.test(a)) {
      const [k, v] = a.slice(2).split('=');
      o[k] = v ?? true;
    } else if (/^-[A-Za-z]/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j];
        if (comValor.includes(f)) {
          o[f] = a.slice(j + 1) || args[++i];
          break;
        }
        o[f] = true;
      }
    } else if (/^-\d+$/.test(a)) o.n = a.slice(1);
    else pos.push(a);
  }
  return { o, pos };
}

// Lê os arquivos indicados ou, na falta deles, a entrada padrão.
function entrada(ctx, arquivos, nome) {
  if (!arquivos.length) return { texto: ctx.stdin };
  let texto = '';
  for (const a of arquivos) {
    try {
      texto += ctx.env.fs.read(ctx.env.fs.resolve(ctx.sh.cwd, a));
    } catch (e) {
      return { erro: falha(`${nome}: ${a}: ${e.message}`) };
    }
  }
  return { texto };
}

function regex(padrao, flags) {
  return new RegExp(padrao.replace(/\\\|/g, '|').replace(/\\([(){}+?])/g, '$1'), flags);
}

async function editor(ctx) {
  const arq = ctx.args.find((a) => !a.startsWith('-'));
  if (!arq) return falha(`${ctx.nome}: informe o arquivo a editar`);
  if (!ctx.env.openEditor) return falha(`${ctx.nome}: editor indisponível`);
  const caminho = ctx.env.fs.resolve(ctx.sh.cwd, arq);
  if (ctx.env.fs.isDir(caminho)) return falha(`${ctx.nome}: ${arq}: Is a directory`);
  const atual = ctx.env.fs.isFile(caminho) ? ctx.env.fs.read(caminho) : '';
  const novo = await ctx.env.openEditor(caminho, atual);
  if (novo === null || novo === undefined) return ok();
  try {
    ctx.env.fs.write(caminho, novo.endsWith('\n') || novo === '' ? novo : novo + '\n');
  } catch (e) {
    return falha(`${ctx.nome}: ${arq}: ${e.message}`);
  }
  return ok();
}

export const builtins = {
  echo({ args }) {
    let nl = true;
    let esc = false;
    while (args.length && /^-[ne]+$/.test(args[0])) {
      if (args[0].includes('n')) nl = false;
      if (args[0].includes('e')) esc = true;
      args = args.slice(1);
    }
    let t = args.join(' ');
    if (esc) t = t.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    return ok(t + (nl ? '\n' : ''));
  },

  printf({ args }) {
    const [fmt = '', ...resto] = args;
    let i = 0;
    return ok(fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/%s/g, () => resto[i++] ?? ''));
  },

  cat(ctx) {
    const { pos } = opcoes(ctx.args);
    const e = entrada(ctx, pos, 'cat');
    return e.erro || ok(e.texto);
  },

  pwd: ({ sh }) => ok(sh.cwd + '\n'),

  cd({ args, sh, env }) {
    const alvo = env.fs.resolve(sh.cwd, args[0] || '~');
    if (!env.fs.isDir(alvo)) return falha(`bash: cd: ${args[0]}: ${env.fs.isFile(alvo) ? 'Not a directory' : 'No such file or directory'}`);
    sh.cwd = alvo;
    return ok();
  },

  ls({ args, sh, env }) {
    const { o, pos } = opcoes(args);
    const alvos = pos.length ? pos : ['.'];
    let out = '';
    let err = '';
    for (const a of alvos) {
      const p = env.fs.resolve(sh.cwd, a);
      if (env.fs.isFile(p)) out += a + '\n';
      else if (env.fs.isDir(p)) {
        if (alvos.length > 1) out += `${a}:\n`;
        const nomes = env.fs.ls(p).filter((n) => o.a || !n.startsWith('.'));
        if (o.l) {
          for (const n of nomes) {
            const filho = p === '/' ? `/${n}` : `${p}/${n}`;
            const dir = env.fs.isDir(filho);
            out += `${dir ? 'drwxr-xr-x.' : '-rw-r--r--.'} 1 student student ${String(dir ? 4096 : env.fs.read(filho).length).padStart(6)} ${n}\n`;
          }
        } else if (nomes.length) out += nomes.join('  ') + '\n';
      } else err += `ls: cannot access '${a}': No such file or directory\n`;
    }
    return { out, err, code: err ? 2 : 0 };
  },

  mkdir({ args, sh, env }) {
    const { o, pos } = opcoes(args);
    if (!pos.length) return falha('mkdir: missing operand');
    for (const a of pos) {
      try {
        env.fs.mkdir(env.fs.resolve(sh.cwd, a), Boolean(o.p));
      } catch (e) {
        return falha(`mkdir: cannot create directory '${a}': ${e.message}`);
      }
    }
    return ok();
  },

  touch({ args, sh, env }) {
    for (const a of args) {
      const p = env.fs.resolve(sh.cwd, a);
      try {
        if (!env.fs.exists(p)) env.fs.write(p, '');
      } catch (e) {
        return falha(`touch: cannot touch '${a}': ${e.message}`);
      }
    }
    return ok();
  },

  rm({ args, sh, env }) {
    const { o, pos } = opcoes(args);
    for (const a of pos) {
      try {
        env.fs.rm(env.fs.resolve(sh.cwd, a), Boolean(o.r || o.R));
      } catch (e) {
        if (!o.f) return falha(`rm: cannot remove '${a}': ${e.message}`);
      }
    }
    return ok();
  },

  cp({ args, sh, env }) {
    const { o, pos } = opcoes(args);
    if (pos.length < 2) return falha('cp: missing file operand');
    const fs = env.fs;
    const origem = fs.resolve(sh.cwd, pos[0]);
    let destino = fs.resolve(sh.cwd, pos[1]);
    try {
      if (fs.isDir(origem)) {
        if (!o.r && !o.R) return falha(`cp: -r not specified; omitting directory '${pos[0]}'`);
        if (fs.isDir(destino)) destino += '/' + origem.split('/').pop();
        fs.mkdir(destino, true);
        for (const d of [...fs.dirs]) if (d.startsWith(origem + '/')) fs.mkdir(destino + d.slice(origem.length), true);
        for (const f of fs.walk(origem)) fs.put(destino + f.slice(origem.length), fs.read(f));
      } else {
        if (fs.isDir(destino)) destino += '/' + origem.split('/').pop();
        fs.write(destino, fs.read(origem));
      }
    } catch (e) {
      return falha(`cp: cannot copy '${pos[0]}': ${e.message}`);
    }
    return ok();
  },

  mv(ctx) {
    const { pos } = opcoes(ctx.args);
    const r = builtins.cp({ ...ctx, args: ['-r', ...pos] });
    if (r.code) return falha(r.err.replace(/^cp:/, 'mv:').replace('cannot copy', 'cannot move'));
    ctx.env.fs.rm(ctx.env.fs.resolve(ctx.sh.cwd, pos[0]), true);
    return ok();
  },

  grep(ctx) {
    const { o, pos } = opcoes(ctx.args, 'eABC');
    const padrao = o.e ?? pos.shift();
    if (padrao === undefined) return falha('Usage: grep [OPTION]... PATTERNS [FILE]...', 2);
    const e = entrada(ctx, pos, 'grep');
    if (e.erro) return { ...e.erro, code: 2 };
    let re;
    try {
      re = o.F ? null : regex(padrao, o.i ? 'i' : '');
    } catch {
      return falha(`grep: expressão inválida: ${padrao}`, 2);
    }
    const bate = (l) => (re ? re.test(l) : o.i ? l.toLowerCase().includes(padrao.toLowerCase()) : l.includes(padrao));
    const todas = linhasDe(e.texto);
    const depois = Number(o.A ?? o.C ?? 0);
    const antes = Number(o.B ?? o.C ?? 0);
    const marcadas = new Set();
    let achou = 0;
    todas.forEach((l, i) => {
      if (bate(l) !== Boolean(o.v)) {
        achou++;
        for (let j = Math.max(0, i - antes); j <= Math.min(todas.length - 1, i + depois); j++) marcadas.add(j);
      }
    });
    if (o.q) return { code: achou ? 0 : 1 };
    if (o.c) return { out: achou + '\n', code: achou ? 0 : 1 };
    const out = [...marcadas].sort((a, b) => a - b).map((i) => (o.n ? `${i + 1}:` : '') + todas[i]);
    return { out: junta(out), code: achou ? 0 : 1 };
  },

  head(ctx) {
    const { o, pos } = opcoes(ctx.args, 'n');
    const e = entrada(ctx, pos, 'head');
    return e.erro || ok(junta(linhasDe(e.texto).slice(0, Number(o.n ?? 10))));
  },

  tail(ctx) {
    const { o, pos } = opcoes(ctx.args, 'n');
    const e = entrada(ctx, pos, 'tail');
    if (e.erro) return e.erro;
    const ls = linhasDe(e.texto);
    const n = String(o.n ?? 10);
    return ok(junta(n.startsWith('+') ? ls.slice(Number(n) - 1) : ls.slice(-Number(n))));
  },

  wc(ctx) {
    const { o, pos } = opcoes(ctx.args);
    const e = entrada(ctx, pos, 'wc');
    if (e.erro) return e.erro;
    const l = linhasDe(e.texto).length;
    const w = e.texto.split(/\s+/).filter(Boolean).length;
    const sufixo = pos.length ? ' ' + pos[0] : '';
    if (o.l) return ok(`${l}${sufixo}\n`);
    if (o.w) return ok(`${w}${sufixo}\n`);
    if (o.c) return ok(`${e.texto.length}${sufixo}\n`);
    return ok(`${l} ${w} ${e.texto.length}${sufixo}\n`);
  },

  sort(ctx) {
    const { o, pos } = opcoes(ctx.args, 'k');
    const e = entrada(ctx, pos, 'sort');
    if (e.erro) return e.erro;
    let ls = linhasDe(e.texto);
    const chave = o.k ? (l) => l.trim().split(/\s+/).slice(Number(String(o.k).split(',')[0]) - 1).join(' ') : (l) => l;
    ls.sort((a, b) => (o.n ? parseFloat(chave(a)) - parseFloat(chave(b)) : chave(a) < chave(b) ? -1 : chave(a) > chave(b) ? 1 : 0));
    if (o.r) ls.reverse();
    if (o.u) ls = ls.filter((l, i) => i === 0 || l !== ls[i - 1]);
    return ok(junta(ls));
  },

  uniq(ctx) {
    const { o, pos } = opcoes(ctx.args);
    const e = entrada(ctx, pos, 'uniq');
    if (e.erro) return e.erro;
    const grupos = [];
    for (const l of linhasDe(e.texto)) {
      if (grupos.length && grupos.at(-1).l === l) grupos.at(-1).n++;
      else grupos.push({ l, n: 1 });
    }
    return ok(junta(grupos.map((g) => (o.c ? `${String(g.n).padStart(7)} ${g.l}` : g.l))));
  },

  cut(ctx) {
    const { o, pos } = opcoes(ctx.args, 'df');
    if (!o.f) return falha('cut: you must specify a list of fields');
    const e = entrada(ctx, pos, 'cut');
    if (e.erro) return e.erro;
    const d = o.d ?? '\t';
    const campos = String(o.f).split(',').flatMap((f) => {
      const [a, b] = f.split('-');
      if (b === undefined) return [Number(a)];
      const out = [];
      for (let i = Number(a || 1); i <= Number(b || 50); i++) out.push(i);
      return out;
    });
    return ok(junta(linhasDe(e.texto).map((l) => {
      const p = l.split(d);
      return campos.map((c) => p[c - 1]).filter((x) => x !== undefined).join(d);
    })));
  },

  tr(ctx) {
    const { o, pos } = opcoes(ctx.args);
    const mapa = (s) => (s || '').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (o.d) {
      const chars = new Set(mapa(pos[0]));
      return ok([...ctx.stdin].filter((c) => !chars.has(c)).join(''));
    }
    const de = mapa(pos[0]);
    const para = mapa(pos[1]);
    if (de === 'a-z' && para === 'A-Z') return ok(ctx.stdin.toUpperCase());
    if (de === 'A-Z' && para === 'a-z') return ok(ctx.stdin.toLowerCase());
    return ok([...ctx.stdin].map((c) => (de.includes(c) ? para[Math.min(de.indexOf(c), para.length - 1)] ?? c : c)).join(''));
  },

  awk(ctx) {
    const { o, pos } = opcoes(ctx.args, 'F');
    const prog = pos.shift() ?? '';
    const m = prog.match(/^\s*(NR\s*(>|==|>=)\s*(\d+)\s*)?\{\s*print\s*(.*?)\s*;?\s*\}\s*$/);
    if (!m) return falha(ctx.env.t('[simulador] awk: só o formato \'{print $N, ...}\' é simulado.', "[simulator] awk: only the '{print $N, ...}' form is simulated."));
    const e = entrada(ctx, pos, 'awk');
    if (e.erro) return e.erro;
    const sep = o.F ? new RegExp(o.F.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : /\s+/;
    const itens = m[4] ? m[4].split(',').map((x) => x.trim()) : ['$0'];
    const out = [];
    linhasDe(e.texto).forEach((l, i) => {
      const nr = i + 1;
      if (m[1]) {
        const n = Number(m[3]);
        if (!(m[2] === '>' ? nr > n : m[2] === '>=' ? nr >= n : nr === n)) return;
      }
      const campos = (o.F ? l : l.trim()).split(sep);
      out.push(itens.map((it) => {
        if (it === '$0') return l;
        if (it === '$NF') return campos.at(-1) ?? '';
        if (/^\$\d+$/.test(it)) return campos[Number(it.slice(1)) - 1] ?? '';
        return it.replace(/^"|"$/g, '');
      }).join(' '));
    });
    return ok(junta(out));
  },

  sed(ctx) {
    const { o, pos } = opcoes(ctx.args, 'e');
    const expr = o.e ?? pos.shift() ?? '';
    const sep = expr[1];
    const p = expr[0] === 's' && sep ? expr.slice(2).split(sep) : null;
    if (!p || p.length < 2) return falha(ctx.env.t("[simulador] sed: só substituições 's/a/b/[g]' são simuladas.", "[simulator] sed: only 's/a/b/[g]' substitutions are simulated."));
    let re;
    try {
      re = regex(p[0], (p[2] || '').includes('g') ? 'g' : '');
    } catch {
      return falha(`sed: expressão inválida: ${p[0]}`);
    }
    const troca = (t) => junta(linhasDe(t).map((l) => l.replace(re, p[1].replace(/\\(\d)/g, '$$$1').replace(/&/g, '$$&'))));
    if (o.i) {
      for (const a of pos) {
        const c = ctx.env.fs.resolve(ctx.sh.cwd, a);
        try {
          ctx.env.fs.write(c, troca(ctx.env.fs.read(c)));
        } catch (e) {
          return falha(`sed: can't read ${a}: ${e.message}`);
        }
      }
      return ok();
    }
    const e = entrada(ctx, pos, 'sed');
    return e.erro || ok(troca(e.texto));
  },

  base64(ctx) {
    const { o, pos } = opcoes(ctx.args, 'w');
    const e = entrada(ctx, pos, 'base64');
    if (e.erro) return e.erro;
    if (o.d || o.decode || o.D) {
      try {
        return ok(b64.dec(e.texto.replace(/\s+/g, '')));
      } catch {
        return falha('base64: invalid input');
      }
    }
    return ok(b64.enc(e.texto) + '\n');
  },

  export({ args, sh }) {
    for (const a of args) {
      const i = a.indexOf('=');
      if (i > 0) sh.vars[a.slice(0, i)] = a.slice(i + 1);
    }
    return ok();
  },

  env: ({ sh }) => ok(junta(Object.entries(sh.vars).filter(([k]) => k !== '?').map(([k, v]) => `${k}=${v}`))),
  history: ({ sh }) => ok(junta(sh.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`))),
  clear: () => ({ out: '\x1b[2J\x1b[3J\x1b[H', code: 0 }),
  true: () => ok(),
  false: () => ({ code: 1 }),
  whoami: () => ok('student\n'),
  hostname: () => ok('workstation.lab.example.com\n'),
  date: ({ env }) => ok(new Date(env.cluster.now * 1000).toUTCString() + '\n'),

  async sleep({ args, env }) {
    await env.sleep(Math.min(Number(args[0]) || 1, 120));
    return ok();
  },

  watch(ctx) {
    const resto = ctx.args.filter((a, i, l) => !/^-/.test(a) && !/^-n$/.test(l[i - 1] || ''));
    return falha(ctx.env.t(`[simulador] watch não é simulado. Repita o comando: ${resto.join(' ')}`, `[simulator] watch is not simulated. Re-run the command: ${resto.join(' ')}`));
  },

  vi: editor,
  vim: editor,
  nano: editor,
  edit: editor,

  lab(ctx) {
    if (!ctx.env.lab) return falha('lab: indisponível fora de uma missão');
    return ctx.env.lab(ctx.args);
  },

  help({ env }) {
    return ok(env.t(
      'Comandos simulados: oc (kubectl), cat, ls, cd, pwd, mkdir, rm, cp, mv, touch, echo, grep, head, tail, wc, sort, uniq, cut, tr, awk, sed, base64, export, env, history, clear, sleep, vi/vim/nano, lab.\nUse `oc --help` para ver os subcomandos do oc disponíveis e `lab grade` para corrigir a missão.\n',
      'Simulated commands: oc (kubectl), cat, ls, cd, pwd, mkdir, rm, cp, mv, touch, echo, grep, head, tail, wc, sort, uniq, cut, tr, awk, sed, base64, export, env, history, clear, sleep, vi/vim/nano, lab.\nUse `oc --help` to list the available oc subcommands and `lab grade` to grade the mission.\n',
    ));
  },
};
