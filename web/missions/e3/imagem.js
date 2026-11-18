const NS = 'intranet';
const IMG = 'registry.lab.example.com:8443/nimbus/notes:1.0';

export default {
  id: 'e3-imagem',
  minutes: 15,
  xp: 150,
  difficulty: 1,
  objectives: ['Implantar aplicações a partir de uma imagem e de um template'],
  title: { pt: 'Bloco de notas da intranet', en: 'Intranet notepad' },
  startNamespace: NS,
  story: {
    pt: 'O RH quer um bloco de notas compartilhado na intranet. A imagem já foi homologada pela segurança; falta colocar no ar, com o título certo.',
    en: 'HR wants a shared notepad on the intranet. Security already approved the image; it just needs to go live, with the right title.',
  },
  tasks: {
    pt: [
      `No projeto \`intranet\`, implante a aplicação \`notes\` a partir da imagem \`${IMG}\`, com um deployment e um service, ambos chamados \`notes\`.`,
      'O contêiner deve ter a variável `NOTES_TITLE` com o valor `Intranet Nimbus`.',
      'O service deve atender na porta `8080` e ter endpoints.',
    ],
    en: [
      `In the \`intranet\` project, deploy the \`notes\` application from the \`${IMG}\` image, with a deployment and a service, both named \`notes\`.`,
      'The container must have the `NOTES_TITLE` variable set to `Intranet Nimbus`.',
      'The service must listen on port `8080` and have endpoints.',
    ],
  },
  hints: [
    { pt: '`oc new-app --image IMAGEM --name NOME` cria deployment e service (quando a imagem expõe porta).', en: '`oc new-app --image IMAGE --name NAME` creates a deployment and a service (when the image exposes a port).' },
    { pt: '`oc new-app` aceita `-e VAR=valor`; depois, `oc set env` também resolve.', en: '`oc new-app` accepts `-e VAR=value`; afterwards, `oc set env` also works.' },
    { pt: '`oc get endpoints notes` (ou `oc describe svc notes`) mostra se o service achou os pods.', en: '`oc get endpoints notes` (or `oc describe svc notes`) shows whether the service found the pods.' },
  ],
  setup(w) {
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
  },
  checks: [
    {
      text: { pt: 'O deployment notes usa a imagem e tem NOTES_TITLE', en: 'The notes deployment uses the image and has NOTES_TITLE' },
      test: (w) => {
        const ct = w.get('Deployment', 'notes', NS)?.spec.template.spec.containers[0];
        return ct?.image.startsWith('registry.lab.example.com:8443/nimbus/notes') && (ct.env || []).some((e) => e.name === 'NOTES_TITLE' && e.value === 'Intranet Nimbus') && w.ready('notes', NS);
      },
    },
    {
      text: { pt: 'O service notes atende na 8080 e tem endpoints', en: 'The notes service listens on 8080 and has endpoints' },
      test: (w) => {
        const s = w.get('Service', 'notes', NS);
        const ep = w.get('Endpoints', 'notes', NS);
        return s?.spec.ports.some((p) => p.port === 8080) && (ep?.subsets || []).some((x) => x.addresses?.length);
      },
    },
  ],
  solution: [
    { cmd: 'oc project intranet', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: `oc new-app --image ${IMG} --name notes -e NOTES_TITLE='Intranet Nimbus'`, pt: 'Deployment e service de uma vez.', en: 'Deployment and service at once.' },
    { cmd: 'oc rollout status deployment/notes', pt: 'Espera o pod.', en: 'Waits for the pod.' },
    { cmd: 'oc get svc,endpoints notes', pt: 'Porta 8080 e um endpoint.', en: 'Port 8080 and one endpoint.' },
  ],
};
