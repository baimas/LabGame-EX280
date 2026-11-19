// Repetição espaçada no estilo do Anki (SM-2 simplificado).
// Cada card tem: { ease, intervalo (dias), reps, vence (ms), lapsos }.
// Notas: 0 = De novo, 1 = Difícil, 2 = Bom, 3 = Fácil.

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;
export const NOVOS_POR_DIA = 20;

export const novoEstado = () => ({ ease: 2.5, intervalo: 0, reps: 0, vence: 0, lapsos: 0 });

// Próximo estado depois de responder `nota` em `agora`.
export function responde(estado, nota, agora = Date.now()) {
  const e = { ...novoEstado(), ...estado };
  const aprendendo = e.intervalo === 0;
  if (nota === 0) {
    // Errou: volta para o aprendizado e revê em 1 minuto.
    if (!aprendendo) e.lapsos++;
    e.reps = 0;
    e.intervalo = 0;
    e.ease = Math.max(1.3, e.ease - 0.2);
    e.vence = agora + MIN;
    return e;
  }
  if (aprendendo) {
    if (nota === 1) e.vence = agora + 6 * MIN;
    else if (nota === 2 && e.reps === 0) {
      e.reps = 1;
      e.vence = agora + 10 * MIN;
    } else {
      // Formou: primeiro intervalo em dias.
      e.intervalo = nota === 3 ? 4 : 1;
      e.reps++;
      e.vence = agora + e.intervalo * DIA;
    }
    if (nota === 3) e.ease += 0.15;
    return e;
  }
  // Revisão de um card já aprendido.
  if (nota === 1) {
    e.intervalo = Math.max(1, Math.round(e.intervalo * 1.2));
    e.ease = Math.max(1.3, e.ease - 0.15);
  } else if (nota === 2) e.intervalo = Math.max(e.intervalo + 1, Math.round(e.intervalo * e.ease));
  else {
    e.intervalo = Math.max(e.intervalo + 1, Math.round(e.intervalo * e.ease * 1.3));
    e.ease += 0.15;
  }
  e.reps++;
  e.vence = agora + e.intervalo * DIA;
  return e;
}

// Texto curto do intervalo, como nos botões do Anki: "1 min", "10 min", "4 d", "2 m".
export function rotuloIntervalo(estado, nota, agora = Date.now()) {
  const ms = responde(estado, nota, agora).vence - agora;
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)} min`;
  if (ms < DIA) return `${Math.round(ms / (60 * MIN))} h`;
  const d = Math.round(ms / DIA);
  if (d < 30) return `${d} d`;
  if (d < 365) return `${Math.round(d / 30)} m`;
  return `${(d / 365).toFixed(1)} a`;
}

// Fila da sessão: primeiro os que venceram (os mais atrasados antes), depois
// os novos, até o limite do dia.
export function fila(cards, estados, agora = Date.now(), novosHoje = 0) {
  const vencidos = cards.filter((c) => estados[c.id] && estados[c.id].vence <= agora).sort((a, b) => estados[a.id].vence - estados[b.id].vence);
  const novos = cards.filter((c) => !estados[c.id]).slice(0, Math.max(0, NOVOS_POR_DIA - novosHoje));
  return [...vencidos, ...novos];
}

export function resumo(cards, estados, agora = Date.now()) {
  let novos = 0;
  let aprendendo = 0;
  let vencidos = 0;
  let maduros = 0;
  for (const c of cards) {
    const e = estados[c.id];
    if (!e) novos++;
    else {
      if (e.intervalo === 0) aprendendo++;
      if (e.vence <= agora) vencidos++;
      if (e.intervalo >= 21) maduros++;
    }
  }
  return { total: cards.length, novos, aprendendo, vencidos, maduros };
}
