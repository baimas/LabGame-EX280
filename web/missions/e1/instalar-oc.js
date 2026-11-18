import { BINARIO_OC, noPath } from '../../sim/arquivos.js';

const URL = 'https://downloads-openshift-console.apps.lab.example.com/amd64/linux/oc.tar';

export default {
  id: 'e1-instalar-oc',
  minutes: 15,
  xp: 150,
  difficulty: 1,
  objectives: ['Instalar e configurar a CLI do OpenShift'],
  title: { pt: 'Estação nova, CLI nova', en: 'New workstation, new CLI' },
  story: {
    pt: 'Você acabou de receber uma estação de trabalho formatada. Ela não tem o `oc`, e a política da Nimbus diz que a CLI tem de vir do próprio cluster, na versão dele. O console publica os binários na rota de downloads.',
    en: 'You just got a freshly installed workstation. It has no `oc`, and Nimbus policy says the CLI must come from the cluster itself, matching its version. The console publishes the binaries on the downloads route.',
  },
  tasks: {
    pt: [
      `Baixe o \`oc\` para Linux amd64 da rota de downloads do console: \`${URL}\`.`,
      'Instale o binário em `~/bin/oc`, que já faz parte do `PATH`, de modo que `oc version --client` funcione de qualquer diretório.',
      'Gere o script de autocomplete do bash em `~/.oc-completion.bash`.',
      'Faça login no cluster (`https://api.lab.example.com:6443`) com o usuário `developer` (senha `developer`) e crie o projeto `cli-setup`.',
    ],
    en: [
      `Download the Linux amd64 \`oc\` from the console downloads route: \`${URL}\`.`,
      'Install the binary as `~/bin/oc`, which is already on the `PATH`, so that `oc version --client` works from any directory.',
      'Generate the bash completion script in `~/.oc-completion.bash`.',
      'Log in to the cluster (`https://api.lab.example.com:6443`) as the `developer` user (password `developer`) and create the `cli-setup` project.',
    ],
  },
  hints: [
    { pt: '`curl -O URL` grava o arquivo com o nome que está na URL. O pacote é um `.tar`: `tar xvf oc.tar` extrai o `oc` e o `kubectl`.', en: '`curl -O URL` saves the file with the name from the URL. The package is a `.tar`: `tar xvf oc.tar` extracts `oc` and `kubectl`.' },
    { pt: '`echo $PATH` mostra onde o bash procura comandos; `~/bin` está lá, mas o diretório ainda não existe. `which oc` confirma a instalação.', en: '`echo $PATH` shows where bash looks for commands; `~/bin` is there, but the directory does not exist yet. `which oc` confirms the install.' },
    { pt: '`oc completion bash > ARQUIVO` gera o autocomplete; `source ARQUIVO` ativa no shell atual.', en: '`oc completion bash > FILE` generates the completion; `source FILE` enables it in the current shell.' },
  ],
  setup(w) {
    w.cluster.side.semOc = true;
    w.env.session.user = null;
  },
  checks: [
    {
      text: { pt: 'O oc do cluster está em ~/bin/oc e é achado pelo PATH', en: 'The cluster oc is at ~/bin/oc and found through the PATH' },
      test: (w) => w.fs.isFile('/home/student/bin/oc') && w.fs.read('/home/student/bin/oc') === BINARIO_OC && noPath(w.shell, w.fs, 'oc') === '/home/student/bin/oc',
    },
    {
      text: { pt: 'O autocomplete do bash está em ~/.oc-completion.bash', en: 'The bash completion is in ~/.oc-completion.bash' },
      test: (w) => (w.file('.oc-completion.bash') || '').includes('__start_oc'),
    },
    {
      text: { pt: 'Sessão aberta como developer', en: 'Logged in as developer' },
      test: (w) => w.env.session.user === 'developer',
    },
    {
      text: { pt: 'O projeto cli-setup existe', en: 'The cli-setup project exists' },
      test: (w) => Boolean(w.get('Namespace', 'cli-setup')),
    },
  ],
  solution: [
    { cmd: 'oc version', pt: 'Ainda não existe: `command not found`.', en: 'Not there yet: `command not found`.', falha: true },
    { cmd: `curl -O ${URL}`, pt: 'Baixa o pacote da rota de downloads.', en: 'Downloads the package from the downloads route.' },
    { cmd: 'tar xvf oc.tar', pt: 'Extrai o `oc` e o `kubectl`.', en: 'Extracts `oc` and `kubectl`.' },
    { cmd: 'mkdir -p ~/bin && mv oc ~/bin/', pt: 'Instala no `~/bin`, que está no `PATH`.', en: 'Installs into `~/bin`, which is on the `PATH`.' },
    { cmd: 'which oc && oc version --client', pt: 'Cliente 4.22.', en: 'Client 4.22.' },
    { cmd: 'oc completion bash > ~/.oc-completion.bash && source ~/.oc-completion.bash', pt: 'Gera e ativa o autocomplete.', en: 'Generates and enables completion.' },
    { cmd: 'oc login -u developer -p developer https://api.lab.example.com:6443', pt: 'Login como developer.', en: 'Logs in as developer.' },
    { cmd: 'oc new-project cli-setup', pt: 'Cria o projeto.', en: 'Creates the project.' },
    { cmd: 'oc config current-context', pt: 'O contexto atual: projeto, servidor e usuário.', en: 'The current context: project, server, and user.' },
  ],
};
