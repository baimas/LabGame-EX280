// Sistema de arquivos virtual da estação de trabalho do jogador.
export const HOME = '/home/student';

export class FS {
  constructor() {
    this.files = new Map();
    this.dirs = new Set(['/', '/home', HOME, '/tmp']);
  }

  resolve(cwd, p) {
    if (!p) return cwd;
    if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
    if (!p.startsWith('/')) p = `${cwd}/${p}`;
    const out = [];
    for (const parte of p.split('/')) {
      if (!parte || parte === '.') continue;
      if (parte === '..') out.pop();
      else out.push(parte);
    }
    return '/' + out.join('/');
  }

  pai(p) {
    return p.slice(0, p.lastIndexOf('/')) || '/';
  }

  isDir(p) {
    return this.dirs.has(p);
  }

  isFile(p) {
    return this.files.has(p);
  }

  exists(p) {
    return this.isDir(p) || this.isFile(p);
  }

  read(p) {
    if (this.isDir(p)) throw new Error('Is a directory');
    if (!this.isFile(p)) throw new Error('No such file or directory');
    return this.files.get(p);
  }

  write(p, conteudo) {
    if (this.isDir(p)) throw new Error('Is a directory');
    if (!this.isDir(this.pai(p))) throw new Error('No such file or directory');
    this.files.set(p, conteudo);
  }

  mkdir(p, pais = false) {
    if (this.exists(p)) {
      if (pais && this.isDir(p)) return;
      throw new Error('File exists');
    }
    if (!this.isDir(this.pai(p))) {
      if (!pais) throw new Error('No such file or directory');
      this.mkdir(this.pai(p), true);
    }
    this.dirs.add(p);
  }

  // Grava criando os diretórios necessários (usado na preparação das missões).
  put(p, conteudo) {
    this.mkdir(this.pai(p), true);
    this.files.set(p, conteudo);
  }

  ls(p) {
    const prefixo = p === '/' ? '/' : p + '/';
    const nomes = new Set();
    for (const x of [...this.dirs, ...this.files.keys()]) {
      if (x !== p && x.startsWith(prefixo)) nomes.add(x.slice(prefixo.length).split('/')[0]);
    }
    return [...nomes].sort();
  }

  // Todos os arquivos abaixo de um diretório, em ordem.
  walk(p) {
    const prefixo = p === '/' ? '/' : p + '/';
    return [...this.files.keys()].filter((x) => x.startsWith(prefixo)).sort();
  }

  rm(p, recursivo = false) {
    if (this.isFile(p)) {
      this.files.delete(p);
      return;
    }
    if (!this.isDir(p)) throw new Error('No such file or directory');
    if (!recursivo) throw new Error('Is a directory');
    const prefixo = p + '/';
    for (const x of [...this.files.keys()]) if (x.startsWith(prefixo)) this.files.delete(x);
    for (const x of [...this.dirs]) if (x === p || x.startsWith(prefixo)) this.dirs.delete(x);
  }

  serialize() {
    return { files: [...this.files.entries()], dirs: [...this.dirs] };
  }

  static restore(d) {
    const f = new FS();
    f.files = new Map(d.files);
    f.dirs = new Set(d.dirs);
    return f;
  }
}
