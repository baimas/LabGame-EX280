import { deployment } from '../../engine/world.js';
import { pool, anuncio, ipDe, noPool, deFora } from './comum.js';

const NS = 'partners';
const SENHA = 'Parc3ir0-2026';

export default {
  id: 'c5-loadbalancer',
  minutes: 15,
  xp: 200,
  difficulty: 2,
  objectives: ['Configurar um service do tipo load balancer', 'Expor aplicações não HTTP/SNI'],
  title: { pt: 'Um banco para o parceiro', en: 'A database for the partner' },
  story: {
    pt: 'Um parceiro de logística precisa consultar o banco de pedidos direto da rede dele. MySQL não fala HTTP, então route não resolve: o banco precisa de um IP próprio na rede do laboratório, entregue pelo MetalLB.',
    en: 'A logistics partner needs to query the orders database straight from their network. MySQL does not speak HTTP, so a route will not do: the database needs its own IP on the lab network, handed out by MetalLB.',
  },
  tasks: {
    pt: [
      'O MetalLB já está configurado com o pool `lab-pool` (192.168.50.20 a 192.168.50.29) e o anúncio `lab-l2`.',
      'No projeto `partners`, crie o service `partner-db-lb` do tipo LoadBalancer, na porta 3306, para os pods do deployment `partner-db`.',
      'Grave em `~/partners/db-ip.txt` o IP externo que o service recebeu.',
      `Da estação de trabalho, conecte no banco com \`mysql -h IP -u partner -p'${SENHA}'\` e grave em \`~/partners/hostname.txt\` só o resultado de \`SELECT @@hostname\` (sem cabeçalho).`,
    ],
    en: [
      'MetalLB is already configured with the `lab-pool` pool (192.168.50.20 to 192.168.50.29) and the `lab-l2` advertisement.',
      'In the `partners` project, create the `partner-db-lb` LoadBalancer service, on port 3306, for the pods of the `partner-db` deployment.',
      'Write the external IP the service received to `~/partners/db-ip.txt`.',
      `From the workstation, connect to the database with \`mysql -h IP -u partner -p'${SENHA}'\` and write to \`~/partners/hostname.txt\` only the result of \`SELECT @@hostname\` (no header).`,
    ],
  },
  hints: [
    { pt: '`oc expose deployment NOME --type LoadBalancer --port 3306 --name ...` cria o service.', en: '`oc expose deployment NAME --type LoadBalancer --port 3306 --name ...` creates the service.' },
    { pt: 'O IP aparece na coluna EXTERNAL-IP de `oc get svc`, ou em `.status.loadBalancer.ingress[0].ip`.', en: 'The IP shows up in the EXTERNAL-IP column of `oc get svc`, or at `.status.loadBalancer.ingress[0].ip`.' },
    { pt: 'No cliente mysql, `-sN` tira bordas e cabeçalho: `mysql ... -sN -e "SELECT @@hostname"`.', en: 'In the mysql client, `-sN` removes borders and header: `mysql ... -sN -e "SELECT @@hostname"`.' },
  ],
  setup(w) {
    pool(w, 'lab-pool', '192.168.50.20-192.168.50.29');
    anuncio(w, 'lab-l2', ['lab-pool']);
    w.cluster.create({ kind: 'Namespace', metadata: { name: NS } });
    w.cluster.create(deployment('partner-db', NS, 'rhel9/mysql-80:1-228', { env: { MYSQL_USER: 'partner', MYSQL_PASSWORD: SENHA, MYSQL_DATABASE: 'orders' } }));
    w.fs.mkdir('/home/student/partners', true);
  },
  checks: [
    {
      text: { pt: 'partner-db-lb é LoadBalancer na porta 3306 e seleciona os pods do banco', en: 'partner-db-lb is a LoadBalancer on port 3306 selecting the database pods' },
      test: (w) => {
        const s = w.get('Service', 'partner-db-lb', NS);
        const ep = w.get('Endpoints', 'partner-db-lb', NS);
        return s.spec.type === 'LoadBalancer' && s.spec.ports.some((p) => p.port === 3306) && (ep?.subsets || []).some((x) => x.addresses?.length);
      },
    },
    {
      text: { pt: 'O service recebeu um IP do lab-pool, gravado em db-ip.txt', en: 'The service got an IP from lab-pool, written to db-ip.txt' },
      test: (w) => noPool(w, ipDe(w, 'partner-db-lb', NS), 'lab-pool') && w.file('partners/db-ip.txt') === ipDe(w, 'partner-db-lb', NS),
    },
    {
      text: { pt: 'O banco responde de fora do cluster nesse IP', en: 'The database answers from outside the cluster on that IP' },
      test: (w) => deFora(w, ipDe(w, 'partner-db-lb', NS), 3306).proto === 'mysql',
    },
    {
      text: { pt: 'hostname.txt tem o nome do pod do banco', en: 'hostname.txt holds the database pod name' },
      test: (w) => w.pods(NS, { app: 'partner-db' }).some((p) => p.metadata.name === w.file('partners/hostname.txt')),
    },
  ],
  solution: [
    { cmd: 'oc project partners', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get ipaddresspools,l2advertisements -n metallb-system', pt: 'Confere a configuração do MetalLB.', en: 'Checks the MetalLB configuration.' },
    { cmd: 'oc expose deployment partner-db --type LoadBalancer --port 3306 --name partner-db-lb', pt: 'Cria o service LoadBalancer.', en: 'Creates the LoadBalancer service.' },
    { cmd: 'oc get svc partner-db-lb', pt: 'O EXTERNAL-IP vem do pool.', en: 'The EXTERNAL-IP comes from the pool.' },
    { cmd: "oc get svc partner-db-lb -o jsonpath='{.status.loadBalancer.ingress[0].ip}' > ~/partners/db-ip.txt", pt: 'Grava o IP.', en: 'Writes the IP down.' },
    { cmd: `mysql -h $(cat ~/partners/db-ip.txt) -u partner -p'${SENHA}' -sN -e 'SELECT @@hostname' > ~/partners/hostname.txt`, pt: 'Consulta pelo IP externo, sem cabeçalho.', en: 'Queries through the external IP, without a header.' },
    { cmd: 'cat ~/partners/hostname.txt', pt: 'Quem respondeu foi o pod do banco.', en: 'The answer came from the database pod.' },
  ],
};
