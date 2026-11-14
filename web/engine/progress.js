// Progresso do jogador, guardado no navegador.
const CHAVE = 'labgame-ex280.progresso';
const CHAVE_SESSAO = 'labgame-ex280.sessao';

function le(chave, padrao) {
  try {
    return JSON.parse(localStorage.getItem(chave)) ?? padrao;
  } catch {
    return padrao;
  }
}

function grava(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch { /* armazenamento indisponível: o jogo segue sem salvar */ }
}

export const progress = {
  data: le(CHAVE, { lang: 'pt-BR', missions: {} }),
  save() {
    grava(CHAVE, this.data);
  },
  get lang() {
    return this.data.lang;
  },
  set lang(v) {
    this.data.lang = v;
    this.save();
  },
  of(id) {
    return this.data.missions[id] || { xp: 0, done: false, tries: 0 };
  },
  record(id, { xp, passou }) {
    const m = this.of(id);
    m.tries++;
    m.xp = Math.max(m.xp, xp);
    m.done = m.done || passou;
    this.data.missions[id] = m;
    this.save();
  },
  // Simulados: melhor nota e número de tentativas.
  ofExam(id) {
    return this.data.exames?.[id] || { melhor: 0, tentativas: 0, passou: false };
  },
  recordExam(id, nota, passou) {
    const e = this.ofExam(id);
    e.tentativas++;
    e.melhor = Math.max(e.melhor, nota);
    e.passou = e.passou || passou;
    e.ultima = nota;
    (this.data.exames ??= {})[id] = e;
    this.save();
  },
  totalXp() {
    return Object.values(this.data.missions).reduce((n, m) => n + m.xp, 0);
  },
  reset() {
    this.data = { lang: this.data.lang, missions: {}, exames: {} };
    this.save();
    grava(CHAVE_SESSAO, null);
  },
  // Missão em andamento (cluster, arquivos, dicas), para sobreviver a um recarregamento.
  loadSession: () => le(CHAVE_SESSAO, null),
  saveSession: (s) => grava(CHAVE_SESSAO, s),
};
