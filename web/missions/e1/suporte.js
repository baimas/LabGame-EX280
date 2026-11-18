import { ehTar, leTar } from '../../sim/arquivos.js';

const tarDe = (w, caminho) => {
  const t = w.fs.isFile(caminho) ? w.fs.read(caminho) : null;
  return t && ehTar(t) ? leTar(t) : null;
};

export default {
  id: 'e1-suporte',
  minutes: 15,
  xp: 170,
  difficulty: 2,
  objectives: ['Coletar dados de suporte do cluster'],
  title: { pt: 'Chamado na Red Hat', en: 'A Red Hat support case' },
  startNamespace: 'default',
  story: {
    pt: 'O roteador do cluster teve dois picos de erro esta noite e a Nimbus abriu o caso 0451 no suporte da Red Hat. O engenheiro do suporte pediu o pacote do must-gather e um retrato detalhado do operator de ingress, num arquivo só.',
    en: 'The cluster router had two error spikes tonight and Nimbus opened case 0451 with Red Hat support. The support engineer asked for the must-gather package and a detailed snapshot of the ingress operator, in a single file.',
  },
  tasks: {
    pt: [
      'Colete o must-gather do cluster no diretório `~/support/must-gather`.',
      'Colete os dados do cluster operator `ingress` com `oc adm inspect` no diretório `~/support/inspect-ingress`.',
      'Empacote os dois diretórios em `~/support/case-0451.tar.gz`.',
    ],
    en: [
      'Collect the cluster must-gather into the `~/support/must-gather` directory.',
      'Collect the data of the `ingress` cluster operator with `oc adm inspect` into the `~/support/inspect-ingress` directory.',
      'Pack both directories into `~/support/case-0451.tar.gz`.',
    ],
  },
  hints: [
    { pt: '`oc adm must-gather --dest-dir DIR` grava o pacote no diretório; o comando exige cluster-admin.', en: '`oc adm must-gather --dest-dir DIR` writes the package to the directory; the command requires cluster-admin.' },
    { pt: '`oc adm inspect clusteroperator/ingress --dest-dir DIR` junta o operator e os namespaces dele.', en: '`oc adm inspect clusteroperator/ingress --dest-dir DIR` gathers the operator and its namespaces.' },
    { pt: 'Dentro de `~/support`: `tar czf case-0451.tar.gz must-gather inspect-ingress`; `tar tzf` lista o conteúdo.', en: 'Inside `~/support`: `tar czf case-0451.tar.gz must-gather inspect-ingress`; `tar tzf` lists the contents.' },
  ],
  setup() {},
  checks: [
    {
      text: { pt: 'O must-gather está em ~/support/must-gather', en: 'The must-gather is in ~/support/must-gather' },
      test: (w) => w.fs.walk('/home/student/support/must-gather').some((f) => f.endsWith('clusterversions/version.yaml')),
    },
    {
      text: { pt: 'O inspect do ingress está em ~/support/inspect-ingress', en: 'The ingress inspect is in ~/support/inspect-ingress' },
      test: (w) => w.fs.walk('/home/student/support/inspect-ingress').some((f) => f.endsWith('clusteroperators/ingress.yaml')),
    },
    {
      text: { pt: 'case-0451.tar.gz tem os dois diretórios', en: 'case-0451.tar.gz has both directories' },
      test: (w) => {
        const t = tarDe(w, '/home/student/support/case-0451.tar.gz');
        const nomes = Object.keys(t?.arquivos || {});
        return nomes.some((n) => /(^|\/)must-gather\/.*clusterversions\/version\.yaml$/.test(n)) && nomes.some((n) => /(^|\/)inspect-ingress\/.*clusteroperators\/ingress\.yaml$/.test(n));
      },
    },
  ],
  solution: [
    { cmd: 'mkdir -p ~/support && cd ~/support', pt: 'Diretório do caso.', en: 'Case directory.' },
    { cmd: 'oc adm must-gather --dest-dir must-gather', pt: 'Coleta o pacote geral.', en: 'Collects the general package.' },
    { cmd: 'oc adm inspect clusteroperator/ingress --dest-dir inspect-ingress', pt: 'Retrato do operator de ingress.', en: 'Snapshot of the ingress operator.' },
    { cmd: 'tar czf case-0451.tar.gz must-gather inspect-ingress', pt: 'Empacota os dois.', en: 'Packs both.' },
    { cmd: 'tar tzf case-0451.tar.gz | grep ingress.yaml', pt: 'Confere o conteúdo.', en: 'Checks the contents.' },
  ],
};
