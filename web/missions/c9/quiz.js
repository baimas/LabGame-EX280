// Perguntas sobre o processo de atualização que não dá para praticar no terminal.
const RESPOSTAS = { 1: 'b', 2: 'c', 3: 'a', 4: 'c', 5: 'b' };

const lidas = (w) => {
  const out = {};
  for (const l of w.lines('quiz/respostas.txt')) {
    const m = l.match(/^(\d+)\s*[=:)-]\s*([a-d])$/i);
    if (m) out[m[1]] = m[2].toLowerCase();
  }
  return out;
};
const certa = (n) => (w) => lidas(w)[n] === RESPOSTAS[n];

export default {
  id: 'c9-quiz',
  minutes: 15,
  xp: 150,
  difficulty: 1,
  objectives: ['Atualizar o cluster OpenShift', 'Atualizar operators'],
  title: { pt: 'Prova oral da Plataforma', en: 'Platform oral exam' },
  story: {
    pt: 'Antes de assumir as janelas de atualização sozinho, o líder da Plataforma faz cinco perguntas. Responda em `~/quiz/respostas.txt`, uma por linha, no formato `1=a`.',
    en: 'Before you run update windows on your own, the Platform lead asks five questions. Answer in `~/quiz/respostas.txt`, one per line, in the `1=a` format.',
  },
  tasks: {
    pt: [
      '1. Qual canal recebe uma versão só depois de ela ter rodado bem nos clusters do canal fast? (a) candidate (b) stable (c) eus (d) fast',
      '2. Uma atualização do cluster deu problema no meio. Qual é o caminho suportado? (a) `oc adm upgrade --to` para a versão anterior (b) restaurar o etcd sem falar com ninguém (c) seguir em frente e corrigir, com o suporte da Red Hat se preciso; não existe rollback (d) apagar a ClusterVersion',
      '3. Em que canal uma versão par (por exemplo 4.22) tem suporte estendido e permite pular a minor ímpar entre duas EUS? (a) eus (b) stable (c) fast (d) candidate',
      '4. Um operator com `installPlanApproval: Automatic` recebe uma versão nova no canal. O que acontece? (a) nada, até o administrador aprovar (b) o cluster todo reinicia (c) o OLM cria e aprova o install plan e atualiza o operator (d) o CSV antigo fica Failed',
      '5. Antes de ir para uma minor que remove APIs, o que deve ser conferido? (a) só o canal (b) `apirequestcounts` e o admin-ack (c) o número de nós (d) a versão do oc',
    ],
    en: [
      '1. Which channel only receives a version after it ran well on fast channel clusters? (a) candidate (b) stable (c) eus (d) fast',
      '2. A cluster update went wrong halfway. What is the supported path? (a) `oc adm upgrade --to` the previous version (b) restore etcd without telling anyone (c) move forward and fix it, with Red Hat support if needed; there is no rollback (d) delete the ClusterVersion',
      '3. In which channel does an even version (for example 4.22) get extended support and allow skipping the odd minor between two EUS releases? (a) eus (b) stable (c) fast (d) candidate',
      '4. An operator with `installPlanApproval: Automatic` gets a new version in its channel. What happens? (a) nothing, until the administrator approves (b) the whole cluster restarts (c) OLM creates and approves the install plan and updates the operator (d) the old CSV turns Failed',
      '5. Before moving to a minor that removes APIs, what must be checked? (a) only the channel (b) `apirequestcounts` and the admin-ack (c) the number of nodes (d) the oc version',
    ],
  },
  hints: [
    { pt: 'Ordem dos canais, do mais novo ao mais testado: candidate, fast, stable. EUS é um caso à parte, para versões pares.', en: 'Channel order, from newest to most tested: candidate, fast, stable. EUS is a separate case, for even versions.' },
    { pt: 'O OpenShift não suporta voltar a versão do cluster.', en: 'OpenShift does not support rolling back the cluster version.' },
    { pt: 'O capítulo tem uma missão prática para a pergunta 5.', en: 'The chapter has a hands-on mission for question 5.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/quiz', true);
  },
  checks: [1, 2, 3, 4, 5].map((n) => ({ text: { pt: `Pergunta ${n}`, en: `Question ${n}` }, test: certa(n) })),
  solution: [
    { cmd: "printf '1=b\\n2=c\\n3=a\\n4=c\\n5=b\\n' > ~/quiz/respostas.txt", pt: 'stable; não há rollback; eus; o OLM atualiza sozinho; apirequestcounts e admin-ack.', en: 'stable; no rollback; eus; OLM updates on its own; apirequestcounts and admin-ack.' },
    { cmd: 'cat ~/quiz/respostas.txt', pt: 'Confere o arquivo.', en: 'Checks the file.' },
  ],
};
