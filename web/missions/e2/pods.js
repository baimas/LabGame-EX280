const NS = 'sandbox';
const HTTPD = 'registry.lab.example.com:8443/ubi9/httpd-24:1-321';
const UBI = 'registry.lab.example.com:8443/ubi9/ubi:9.4';
const PAGINA = '<h1>Nimbus sandbox</h1>\n';

const camada = (w, pod, caminho) => w.cluster.side.pods?.[pod?.metadata.uid]?.camadas?.[pod.spec.containers[0].name]?.files?.[caminho];

export default {
  id: 'e2-pods',
  minutes: 20,
  xp: 180,
  difficulty: 1,
  objectives: ['Criar contêineres Linux e pods do Kubernetes'],
  title: { pt: 'Caixa de areia', en: 'Sandbox' },
  startNamespace: NS,
  story: {
    pt: 'O time de desenvolvimento quer um projeto de testes rápidos, sem deployment nem nada definitivo: só pods avulsos para experimentar uma imagem, copiar um arquivo e rodar um comando de uma vez.',
    en: 'The development team wants a quick-test project, with no deployment or anything permanent: just bare pods to try an image, copy a file, and run a one-off command.',
  },
  tasks: {
    pt: [
      `No projeto \`sandbox\`, crie o pod \`web-test\` com a imagem \`${HTTPD}\`, rodando.`,
      'Grave em `~/sandbox/hostname.txt` a saída do comando `hostname` executado dentro do pod `web-test`.',
      'Copie o arquivo `~/sandbox/index.html` da estação para `/opt/app-root/src/index.html` dentro do pod `web-test`.',
      `Crie o pod \`one-shot\` com a imagem \`${UBI}\` que roda \`echo pronto\` uma única vez e termina como \`Completed\` (sem reiniciar).`,
    ],
    en: [
      `In the \`sandbox\` project, create the \`web-test\` pod with the \`${HTTPD}\` image, running.`,
      'Write to `~/sandbox/hostname.txt` the output of the `hostname` command run inside the `web-test` pod.',
      'Copy the `~/sandbox/index.html` file from the workstation to `/opt/app-root/src/index.html` inside the `web-test` pod.',
      `Create the \`one-shot\` pod with the \`${UBI}\` image that runs \`echo pronto\` once and ends as \`Completed\` (no restarts).`,
    ],
  },
  hints: [
    { pt: '`oc run NOME --image IMAGEM` cria um pod avulso. Com `--restart Never` e um comando depois de `--`, ele roda uma vez e termina.', en: '`oc run NAME --image IMAGE` creates a bare pod. With `--restart Never` and a command after `--`, it runs once and finishes.' },
    { pt: '`oc exec POD -- COMANDO` roda um comando no contêiner; a saída pode ir para um arquivo da estação com `>`.', en: '`oc exec POD -- COMMAND` runs a command in the container; the output can go to a workstation file with `>`.' },
    { pt: '`oc cp ARQUIVO POD:/caminho` copia da estação para o pod (e o contrário também).', en: '`oc cp FILE POD:/path` copies from the workstation to the pod (and the other way around).' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.fs.put('/home/student/sandbox/index.html', PAGINA);
  },
  checks: [
    {
      text: { pt: 'O pod web-test roda com a imagem do httpd', en: 'The web-test pod runs with the httpd image' },
      test: (w) => {
        const p = w.get('Pod', 'web-test', NS);
        return p?.spec.containers[0].image === HTTPD && w.podPronto(p);
      },
    },
    { text: { pt: 'hostname.txt tem o hostname do pod', en: 'hostname.txt has the pod hostname' }, test: (w) => w.file('sandbox/hostname.txt') === 'web-test' },
    { text: { pt: 'index.html foi copiado para o pod', en: 'index.html was copied into the pod' }, test: (w) => camada(w, w.get('Pod', 'web-test', NS), '/opt/app-root/src/index.html') === PAGINA },
    {
      text: { pt: 'O pod one-shot rodou echo pronto e terminou', en: 'The one-shot pod ran echo pronto and finished' },
      test: (w) => {
        const p = w.get('Pod', 'one-shot', NS);
        const cmd = [...(p?.spec.containers[0].command || []), ...(p?.spec.containers[0].args || [])].join(' ');
        return p?.status.phase === 'Succeeded' && p.spec.restartPolicy !== 'Always' && cmd.includes('echo pronto') && p.spec.containers[0].image === UBI;
      },
    },
  ],
  solution: [
    { cmd: 'oc project sandbox', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc run web-test --image ${HTTPD}`, pt: 'Cria o pod.', en: 'Creates the pod.' },
    { cmd: 'oc wait pod/web-test --for condition=Ready --timeout 60s', pt: 'Espera ficar pronto.', en: 'Waits until it is ready.' },
    { cmd: 'oc exec web-test -- hostname > ~/sandbox/hostname.txt', pt: 'Saída do comando no pod.', en: 'Command output from the pod.' },
    { cmd: 'oc cp ~/sandbox/index.html web-test:/opt/app-root/src/index.html', pt: 'Copia o arquivo para o pod.', en: 'Copies the file into the pod.' },
    { cmd: 'oc exec web-test -- cat /opt/app-root/src/index.html', pt: 'Confere a cópia.', en: 'Checks the copy.' },
    { cmd: `oc run one-shot --image ${UBI} --restart Never -- echo pronto`, pt: 'Pod de uma execução só.', en: 'A run-once pod.' },
    { cmd: 'sleep 10; oc get pods; oc logs one-shot', pt: '`Completed` e o log `pronto`.', en: '`Completed` and the `pronto` log.' },
  ],
};
