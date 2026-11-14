import { deployment } from '../../engine/world.js';
import { destinoTcp } from '../../sim/net.js';
import { ANOT_STATUS } from '../../sim/redes.js';

const NS = 'payroll';
const IP = '172.25.150.140';
const UTILITY = { hostExterno: 'utility', ip: '172.25.150.254' };

function interfaces(p) {
  try {
    return JSON.parse(p.metadata.annotations?.[ANOT_STATUS] || '[]');
  } catch {
    return [];
  }
}

export default {
  id: 'c5-nad',
  minutes: 25,
  xp: 260,
  difficulty: 3,
  objectives: ['Configurar componentes de rede', 'Expor aplicações não HTTP/SNI', 'Solucionar problemas de rede definida por software (SDN)'],
  title: { pt: 'O banco na rede de servidores', en: 'The database on the server network' },
  story: {
    pt: 'O sistema de folha de pagamento roda fora do cluster, na rede de servidores (172.25.150.0/24), e precisa falar com o PostgreSQL do projeto `payroll`. A rede de servidores não passa pelo roteador do cluster: o banco precisa de uma interface própria nela, pela segunda placa do nó (`ens4`). Alguém começou a configurar e o pod não sobe.',
    en: 'The payroll system runs outside the cluster, on the server network (172.25.150.0/24), and must talk to the PostgreSQL database of the `payroll` project. The server network does not go through the cluster router: the database needs its own interface on it, through the node second NIC (`ens4`). Someone started configuring it and the pod does not start.',
  },
  tasks: {
    pt: [
      `No projeto \`payroll\`, crie a NetworkAttachmentDefinition \`servers\`, do tipo \`host-device\` sobre a interface \`ens4\` do nó, com o IP estático \`${IP}/24\`.`,
      'O deployment `payroll-db` deve rodar com uma segunda interface nessa rede, sem perder a rede padrão do cluster.',
      `Do host \`utility\` (\`ssh utility\`), o banco deve responder em \`${IP}\` na porta 5432 (usuário \`payroll\`, senha \`Folha@2026\`, banco \`payroll\`). Da estação de trabalho, esse IP não é alcançável.`,
    ],
    en: [
      `In the \`payroll\` project, create the \`servers\` NetworkAttachmentDefinition, of type \`host-device\` on the node \`ens4\` interface, with the static IP \`${IP}/24\`.`,
      'The `payroll-db` deployment must run with a second interface on that network, without losing the cluster default network.',
      `From the \`utility\` host (\`ssh utility\`), the database must answer on \`${IP}\` port 5432 (user \`payroll\`, password \`Folha@2026\`, database \`payroll\`). From the workstation that IP is not reachable.`,
    ],
  },
  hints: [
    { pt: 'O pod está em ContainerCreating: os eventos (`oc get events`) mostram o que o Multus não encontrou.', en: 'The pod is in ContainerCreating: the events (`oc get events`) show what Multus could not find.' },
    { pt: 'A NAD é do grupo `k8s.cni.cncf.io/v1` e o `spec.config` é um JSON de CNI: `type`, `device` e o `ipam` com `"type": "static"` e `addresses`.', en: 'The NAD belongs to `k8s.cni.cncf.io/v1` and `spec.config` is a CNI JSON: `type`, `device`, and the `ipam` with `"type": "static"` and `addresses`.' },
    { pt: 'O pod pede a rede pela anotação `k8s.v1.cni.cncf.io/networks` no template do deployment, com o nome da NAD. No utility, `PGPASSWORD=... psql -h IP -U usuario banco -c "SELECT 1;"`.', en: 'The pod asks for the network through the `k8s.v1.cni.cncf.io/networks` annotation on the deployment template, with the NAD name. On utility, `PGPASSWORD=... psql -h IP -U user database -c "SELECT 1;"`.' },
  ],
  setup(w) {
    const c = w.cluster;
    c.create({ kind: 'Namespace', metadata: { name: NS } });
    const d = deployment('payroll-db', NS, 'rhel10/postgresql-18', { env: { POSTGRESQL_USER: 'payroll', POSTGRESQL_PASSWORD: 'Folha@2026', POSTGRESQL_DATABASE: 'payroll' } });
    d.spec.template.spec.containers[0].ports = [{ containerPort: 5432, protocol: 'TCP' }];
    d.spec.strategy = { type: 'Recreate' };
    d.spec.template.metadata.annotations = { 'k8s.v1.cni.cncf.io/networks': 'server' };
    c.create(d);
  },
  checks: [
    {
      text: { pt: 'A NAD servers é host-device em ens4 com o IP estático', en: 'The servers NAD is host-device on ens4 with the static IP' },
      test: (w) => {
        try {
          const cfg = JSON.parse(w.get('NetworkAttachmentDefinition', 'servers', NS)?.spec?.config || '{}');
          return cfg.type === 'host-device' && cfg.device === 'ens4' && cfg.ipam?.type === 'static' && (cfg.ipam.addresses || []).some((a) => a.address === `${IP}/24`);
        } catch {
          return false;
        }
      },
    },
    {
      text: { pt: 'payroll-db roda com eth0 e a interface na rede servers', en: 'payroll-db runs with eth0 and the interface on the servers network' },
      test: (w) => w.ready('payroll-db', NS) && w.pods(NS, { app: 'payroll-db' }).every((p) => {
        const ifs = interfaces(p);
        return ifs.some((x) => x.interface === 'eth0') && ifs.some((x) => x.name === `${NS}/servers` && x.ips?.includes(IP));
      }),
    },
    {
      text: { pt: 'O banco responde do utility e não da estação de trabalho', en: 'The database answers from utility and not from the workstation' },
      test: (w) => destinoTcp(w.cluster, UTILITY, IP, 5432).proto === 'postgresql' && Boolean(destinoTcp(w.cluster, null, IP, 5432).erro),
    },
  ],
  solution: [
    { cmd: 'oc project payroll', pt: 'Entra no projeto.', en: 'Switches to the project.' },
    { cmd: 'oc get pods; oc get events | grep Sandbox | tail -1', pt: 'O pod pede a rede `server`, que não existe.', en: 'The pod asks for the `server` network, which does not exist.' },
    { cmd: `cat > servers.yaml <<EOF
apiVersion: k8s.cni.cncf.io/v1
kind: NetworkAttachmentDefinition
metadata:
  name: servers
spec:
  config: |-
    {
      "cniVersion": "0.3.1",
      "name": "servers",
      "type": "host-device",
      "device": "ens4",
      "ipam": {
        "type": "static",
        "addresses": [
          {"address": "${IP}/24"}
        ]
      }
    }
EOF`, pt: 'A NAD com o IP estático.', en: 'The NAD with the static IP.' },
    { cmd: 'oc create -f servers.yaml', pt: 'Cria a NAD.', en: 'Creates the NAD.' },
    { cmd: 'oc patch deployment payroll-db --type merge -p \'{"spec":{"template":{"metadata":{"annotations":{"k8s.v1.cni.cncf.io/networks":"servers"}}}}}\'', pt: 'Corrige o nome da rede no template.', en: 'Fixes the network name in the template.' },
    { cmd: 'sleep 15; oc get pods', pt: 'O pod novo sobe.', en: 'The new pod starts.' },
    { cmd: "oc get pod -l app=payroll-db -o jsonpath='{.items[0].metadata.annotations.k8s\\.v1\\.cni\\.cncf\\.io/network-status}'", pt: '`eth0` na rede padrão e `net1` em 172.25.150.140.', en: '`eth0` on the default network and `net1` on 172.25.150.140.' },
    { cmd: `PGCONNECT_TIMEOUT=3 PGPASSWORD='Folha@2026' psql -h ${IP} -U payroll payroll -c 'SELECT 1;'`, pt: 'Da estação de trabalho não alcança.', en: 'Not reachable from the workstation.', falha: true },
    { cmd: `ssh utility "PGPASSWORD='Folha@2026' psql -h ${IP} -U payroll payroll -c 'SELECT 1;'"`, pt: 'Do host utility, na rede de servidores, o banco responde. (Também dá para entrar com `ssh utility` e sair com `exit`.)', en: 'From the utility host, on the server network, the database answers. (You can also log in with `ssh utility` and leave with `exit`.)' },
  ],
};
