// Terminal do jogo: edição de linha, histórico e autocompletar sobre o xterm.js,
// ligado ao shell simulado.
import { Abort } from '../sim/shell.js';
import { candidatos as candidatosOc } from '../sim/oc/completar.js';
import { KINDS, kindOf } from '../sim/resources.js';

const TEMA = {
  background: '#1f252f', foreground: '#e8f1f9', cursor: '#b9aef0', cursorAccent: '#1f252f', selectionBackground: '#57449a',
  black: '#0b0f14', red: '#ef6b6b', green: '#6cc98a', yellow: '#e5c06b', blue: '#6ba6ef', magenta: '#c08bef', cyan: '#5fc7c7', white: '#d7dde5',
  brightBlack: '#5c6773', brightRed: '#ff8a8a', brightGreen: '#8be3a6', brightYellow: '#f5d68a', brightBlue: '#8cbcff', brightMagenta: '#d3a8ff', brightCyan: '#84e0e0', brightWhite: '#ffffff',
};

export class GameTerminal {
  constructor(el) {
    this.term = new window.Terminal({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13, cursorBlink: true, theme: TEMA, scrollback: 5000, convertEol: false });
    this.fit = new window.FitAddon.FitAddon();
    this.term.loadAddon(this.fit);
    this.term.open(el);
    this.ajusta();
    new ResizeObserver(() => this.ajusta()).observe(el);
    this.buf = '';
    this.cur = 0;
    this.pendente = ''; // linhas anteriores de um comando de várias linhas
    this.linhasDesenhadas = 0;
    this.hist = -1;
    this.ocupado = false;
    this.fila = [];
    this.world = null;
    this.cancelar = null;
    this.onCommand = null;
    this.term.onData((d) => this.entrada(d));
  }

  ajusta() {
    try {
      this.fit.fit();
    } catch { /* o terminal ainda não tem tamanho */ }
  }

  focus() {
    this.term.focus();
  }

  write(txt) {
    txt = String(txt);
    if (!txt) return;
    this.ultimo = txt.includes('\x1b[2J') ? '\n' : txt.at(-1);
    this.term.write(txt.replace(/\r?\n/g, '\r\n'));
  }

  attach(world, mensagem = '') {
    this.world = world;
    this.term.reset();
    this.buf = '';
    this.cur = 0;
    this.pendente = '';
    this.ocupado = false;
    if (mensagem) this.write(mensagem);
    this.novoPrompt();
  }

  detach(mensagem = '') {
    this.world = null;
    this.term.reset();
    if (mensagem) this.write(mensagem);
  }

  prompt() {
    return this.pendente ? '> ' : this.world.shell.prompt();
  }

  novoPrompt() {
    this.linhasDesenhadas = 0;
    this.desenha();
  }

  // Redesenha a linha em edição, considerando quebras por largura.
  desenha() {
    const cols = this.term.cols;
    const p = this.prompt();
    let s = '';
    if (this.linhasDesenhadas > 0) s += `\x1b[${this.linhasDesenhadas}A`;
    s += '\r\x1b[J' + `\x1b[38;5;110m${p}\x1b[0m` + this.buf;
    const fim = p.length + this.buf.length;
    if (fim > 0 && fim % cols === 0) s += ' \r';
    const linhaFim = Math.floor(fim / cols);
    const alvo = p.length + this.cur;
    const linhaAlvo = Math.floor(alvo / cols);
    if (linhaFim > linhaAlvo) s += `\x1b[${linhaFim - linhaAlvo}A`;
    s += `\x1b[${(alvo % cols) + 1}G`;
    this.linhasDesenhadas = linhaAlvo;
    this.term.write(s);
  }

  insere(txt) {
    this.buf = this.buf.slice(0, this.cur) + txt + this.buf.slice(this.cur);
    this.cur += txt.length;
  }

  // Pergunta algo ao jogador durante um comando (por exemplo, a senha do oc login).
  ask(texto, secreto = false) {
    return new Promise((resolve, reject) => {
      this.write(texto);
      this.pergunta = { resolve, reject, secreto, buf: '' };
    });
  }

  responde(d) {
    const p = this.pergunta;
    for (const ch of d.replace(/\r\n?|\n/g, '\r')) {
      if (ch === '\r') {
        this.term.write('\r\n');
        this.pergunta = null;
        p.resolve(p.buf);
        return;
      }
      if (ch === '\x03') {
        this.term.write('^C\r\n');
        this.pergunta = null;
        p.reject(new Abort());
        return;
      }
      if (ch === '\x7f') {
        if (p.buf) {
          p.buf = p.buf.slice(0, -1);
          if (!p.secreto) this.term.write('\b \b');
        }
      } else if (ch >= ' ') {
        p.buf += ch;
        if (!p.secreto) this.term.write(ch);
      }
    }
  }

  async entrada(d) {
    if (!this.world) return;
    if (this.pergunta) {
      this.responde(d);
      return;
    }
    if (this.ocupado) {
      // Ctrl+C interrompe; o resto fica guardado e é digitado quando o comando terminar.
      if (d === '\x03') {
        this.fila = [];
        this.cancelar?.();
      } else this.fila.push(d);
      return;
    }
    // Texto colado ou entregue em bloco: trata caractere a caractere, para que
    // Enter e Tab no meio do bloco funcionem como se tivessem sido digitados.
    if (d.length > 1 && !d.startsWith('\x1b') && /[\r\n\t]/.test(d)) {
      for (const ch of d.replace(/\r\n?|\n/g, '\r')) {
        while (this.ocupado) await new Promise((r) => setTimeout(r, 30));
        if (!this.world) return;
        await this.entrada(ch);
      }
      return;
    }
    const h = this.world.shell.history;
    switch (d) {
      case '\r': await this.enter(); return;
      case '\x7f': if (this.cur > 0) { this.buf = this.buf.slice(0, this.cur - 1) + this.buf.slice(this.cur); this.cur--; } break;
      case '\x1b[3~': this.buf = this.buf.slice(0, this.cur) + this.buf.slice(this.cur + 1); break;
      case '\x1b[D': case '\x02': if (this.cur > 0) this.cur--; break;
      case '\x1b[C': case '\x06': if (this.cur < this.buf.length) this.cur++; break;
      case '\x1b[H': case '\x1bOH': case '\x01': this.cur = 0; break;
      case '\x1b[F': case '\x1bOF': case '\x05': this.cur = this.buf.length; break;
      case '\x1b[A': case '\x10':
        if (h.length && this.hist !== 0) { this.hist = this.hist < 0 ? h.length - 1 : this.hist - 1; this.buf = h[this.hist].split('\n')[0]; this.cur = this.buf.length; }
        break;
      case '\x1b[B': case '\x0e':
        if (this.hist >= 0) { this.hist++; if (this.hist >= h.length) { this.hist = -1; this.buf = ''; } else this.buf = h[this.hist].split('\n')[0]; this.cur = this.buf.length; }
        break;
      case '\x15': this.buf = this.buf.slice(this.cur); this.cur = 0; break;
      case '\x0b': this.buf = this.buf.slice(0, this.cur); break;
      case '\x17': { const antes = this.buf.slice(0, this.cur).replace(/\S+\s*$/, ''); this.buf = antes + this.buf.slice(this.cur); this.cur = antes.length; break; }
      case '\x1bb': case '\x1b[1;5D': case '\x1b[1;3D': this.cur = this.buf.slice(0, this.cur).replace(/\S+\s*$/, '').length; break;
      case '\x1bf': case '\x1b[1;5C': case '\x1b[1;3C': { const m = this.buf.slice(this.cur).match(/^\s*\S+/); this.cur += m ? m[0].length : 0; break; }
      case '\x03': this.term.write('^C\r\n'); this.buf = ''; this.cur = 0; this.pendente = ''; this.hist = -1; this.novoPrompt(); return;
      case '\x0c': this.term.write('\x1b[2J\x1b[3J\x1b[H'); this.linhasDesenhadas = 0; break;
      case '\x04':
        // Ctrl+D com a linha vazia encerra o shell do pod, como no terminal real.
        if (!this.buf && this.world.shell.pod) {
          this.buf = 'exit';
          this.cur = 4;
          await this.enter();
          return;
        }
        break;
      case '\t': this.completa(); return;
      default:
        if (d.startsWith('\x1b') || d < ' ') return;
        this.insere(d);
    }
    this.desenha();
  }

  async enter() {
    const linha = this.buf;
    this.cur = this.buf.length;
    this.desenha();
    this.term.write('\r\n');
    this.buf = '';
    this.cur = 0;
    this.hist = -1;
    const completo = this.pendente ? `${this.pendente}\n${linha}` : linha;
    const sh = this.world.shell;
    if (sh.needsMore(completo)) {
      this.pendente = completo;
      this.novoPrompt();
      return;
    }
    this.pendente = '';
    if (completo.trim()) {
      if (sh.history.at(-1) !== completo) sh.history.push(completo);
      await this.executa(completo);
    }
    if (this.world) this.novoPrompt();
    if (this.fila.length && this.world) {
      const pendente = this.fila.join('');
      this.fila = [];
      await this.entrada(pendente);
    }
  }

  async executa(cmd) {
    this.ocupado = true;
    try {
      this.ultimo = '\n';
      const r = await this.world.shell.run(cmd);
      this.write(r.out);
      // Saídas sem quebra de linha final (jsonpath, por exemplo) não colam no prompt.
      if (this.ultimo !== '\n') this.write('\n');
    } catch (e) {
      if (e instanceof Abort) {
        this.fila = [];
        this.term.write('^C\r\n');
      }
      else {
        console.error(e);
        this.write(`[simulador] erro interno: ${e.message}\n`);
      }
    } finally {
      this.ocupado = false;
      this.onCommand?.(cmd);
    }
  }

  // Digita e executa um comando como se o jogador o tivesse escrito.
  async type(cmd) {
    if (!this.world || this.ocupado) return;
    this.buf = cmd;
    this.cur = cmd.length;
    this.desenha();
    await this.enter();
  }

  candidatos(palavras, atual) {
    const { shell, cluster, fs, env } = this.world;
    const arquivos = () => {
      const i = atual.lastIndexOf('/');
      const dir = i >= 0 ? atual.slice(0, i + 1) : '';
      const base = fs.resolve(shell.cwd, dir || '.');
      if (!fs.isDir(base)) return [];
      return fs.ls(base).map((n) => dir + n + (fs.isDir(`${base === '/' ? '' : base}/${n}`) ? '/' : ''));
    };
    if (palavras.length === 1) return Object.keys(shell.cmds);
    if (palavras[0] !== 'oc' && palavras[0] !== 'kubectl') return arquivos();
    // Mesmo comportamento do Tab com o `oc` 4.22 real (dados do binário oficial).
    const ns = env.session.namespace;
    return candidatosOc(palavras.slice(1, -1), atual, {
      namespaces: () => cluster.list('Namespace').map((n) => n.metadata.name),
      nomes: (tipo) => {
        const k = kindOf(tipo.replace(/\/$/, ''));
        if (!k) return [];
        return cluster.list(k.alias || k.kind, k.namespaced ? ns : null).map((o) => o.metadata.name);
      },
      arquivos,
      diretorios: () => arquivos().filter((a) => a.endsWith('/')),
    });
  }

  completa() {
    const antes = this.buf.slice(0, this.cur);
    const palavras = antes.split(/\s+/);
    const atual = palavras.at(-1);
    const ops = [...new Set(this.candidatos(palavras, atual).filter((c) => c.startsWith(atual)))].sort();
    if (!ops.length) return;
    let comum = ops[0];
    for (const o of ops) while (!o.startsWith(comum)) comum = comum.slice(0, -1);
    if (ops.length === 1) {
      this.insere(comum.slice(atual.length) + (comum.endsWith('/') ? '' : ' '));
    } else if (comum.length > atual.length) {
      this.insere(comum.slice(atual.length));
    } else {
      this.cur = this.buf.length;
      this.desenha();
      this.term.write('\r\n' + ops.join('  ') + '\r\n');
      this.linhasDesenhadas = 0;
      this.cur = antes.length;
    }
    this.desenha();
  }
}
