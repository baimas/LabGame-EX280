import { mesmos, copia } from './comum.js';
import { criaProjeto, configProjetos } from '../../sim/projetos.js';
import { PROJECT_CONFIG } from '../../sim/resources.js';
import { pode } from '../../sim/rbac.js';

const QUOTA = { pods: '10', 'requests.cpu': '2', 'requests.memory': '4Gi' };
const LIMITE = { default: { cpu: '500m', memory: '512Mi' }, defaultRequest: { cpu: '100m', memory: '128Mi' } };

// O projeto tem a quota e o limit range do padrão, e o dono pode administrá-lo.
function nasceuPronto(c, ns, dono) {
  const q = c.get('ResourceQuota', 'project-quota', ns);
  const lim = (c.get('LimitRange', 'project-limits', ns)?.spec?.limits || []).find((l) => (l.type || 'Container') === 'Container');
  return Boolean(q && lim) && mesmos(q.spec.hard, QUOTA) && mesmos(lim.default, LIMITE.default) && mesmos(lim.defaultRequest, LIMITE.defaultRequest) && pode(c, dono, 'create', 'rolebindings', 'rbac.authorization.k8s.io', ns);
}

export default {
  id: 'c6-template-projeto',
  minutes: 30,
  xp: 280,
  difficulty: 3,
  objectives: ['Configurar o template de criação de projetos', 'Configurar quotas de recursos por projeto', 'Configurar limit ranges por projeto'],
  title: { pt: 'Todo projeto nasce pronto', en: 'Every project is born ready' },
  story: {
    pt: 'Toda semana alguém cria um projeto e esquece da quota. A Plataforma decidiu que isso não depende mais de memória: o cluster vai criar todo projeto novo já com quota e limit range.',
    en: 'Every week someone creates a project and forgets the quota. The Platform team decided this no longer depends on anyone remembering: the cluster will create every new project with a quota and a limit range already in place.',
  },
  tasks: {
    pt: [
      'Crie o template `project-request` no projeto `openshift-config` e configure o cluster para usá-lo em todo pedido de projeto.',
      'Todo projeto novo deve nascer com a quota `project-quota` (no máximo 10 pods, 2 CPUs e 4Gi de memória em requests) e o limit range `project-limits` para contêineres (limit padrão de `500m` e `512Mi`, request padrão de `100m` e `128Mi`).',
      'Quem pede o projeto continua sendo o administrador dele.',
      'Para testar, como `developer` (senha `developer`), crie o projeto `dev-sandbox`.',
    ],
    en: [
      'Create the `project-request` template in the `openshift-config` project and configure the cluster to use it for every project request.',
      'Every new project must be created with the `project-quota` quota (at most 10 pods, 2 CPUs and 4Gi memory in requests) and the `project-limits` limit range for containers (default limit of `500m` and `512Mi`, default request of `100m` and `128Mi`).',
      'Whoever requests the project is still its administrator.',
      'To test it, as `developer` (password `developer`), create the `dev-sandbox` project.',
    ],
  },
  hints: [
    { pt: '`oc adm create-bootstrap-project-template -o yaml > template.yaml` dá o ponto de partida. Acrescente a quota e o limit range na lista `objects`, usando `${PROJECT_NAME}` como namespace.', en: '`oc adm create-bootstrap-project-template -o yaml > template.yaml` gives the starting point. Add the quota and the limit range to the `objects` list, using `${PROJECT_NAME}` as namespace.' },
    { pt: 'A configuração fica em `projects.config.openshift.io/cluster`, campo `spec.projectRequestTemplate.name`.', en: 'The setting lives in `projects.config.openshift.io/cluster`, field `spec.projectRequestTemplate.name`.' },
    { pt: 'Depois da mudança, os pods do `openshift-apiserver` são recriados e a configuração nova leva cerca de um minuto para valer. Projeto criado antes disso nasce sem quota.', en: 'After the change, the `openshift-apiserver` pods are recreated and the new configuration takes about a minute to apply. A project created before that is born without a quota.' },
  ],
  setup(w) {
    w.fs.mkdir('/home/student/template', true);
  },
  checks: [
    {
      text: { pt: 'O cluster usa o template project-request', en: 'The cluster uses the project-request template' },
      test: (w) => w.get(PROJECT_CONFIG, 'cluster')?.spec?.projectRequestTemplate?.name === 'project-request' && Boolean(w.get('Template', 'project-request', 'openshift-config')),
    },
    {
      text: { pt: 'Um projeto novo nasce com quota, limit range e o dono como admin', en: 'A new project is born with quota, limit range, and the owner as admin' },
      test: (w) => {
        const c = copia(w);
        c.side.projetos = { ativo: c.get(PROJECT_CONFIG, 'cluster').spec, fp: JSON.stringify(c.get(PROJECT_CONFIG, 'cluster').spec) };
        try {
          criaProjeto(c, { nome: 'teste-da-correcao', usuario: 'developer' });
        } catch {
          return false;
        }
        return nasceuPronto(c, 'teste-da-correcao', 'developer');
      },
    },
    {
      text: { pt: 'dev-sandbox foi pedido pelo developer e nasceu pronto', en: 'dev-sandbox was requested by developer and was born ready' },
      test: (w) => w.get('Namespace', 'dev-sandbox')?.metadata?.annotations?.['openshift.io/requester'] === 'developer' && nasceuPronto(w.cluster, 'dev-sandbox', 'developer') && Boolean(configProjetos(w.cluster).projectRequestTemplate),
    },
  ],
  solution: [
    { cmd: 'cd ~/template', pt: 'Pasta de trabalho.', en: 'Working folder.' },
    { cmd: 'oc adm create-bootstrap-project-template -o yaml > template.yaml', pt: 'O template padrão: o projeto e o rolebinding `admin`.', en: 'The default template: the project and the `admin` rolebinding.' },
    { cmd: 'cat template.yaml', pt: 'A lista `objects` vem antes de `parameters`.', en: 'The `objects` list comes before `parameters`.' },
    { cmd: `cat > template.yaml <<'EOF'
apiVersion: template.openshift.io/v1
kind: Template
metadata:
  name: project-request
objects:
- apiVersion: project.openshift.io/v1
  kind: Project
  metadata:
    annotations:
      openshift.io/description: \${PROJECT_DESCRIPTION}
      openshift.io/display-name: \${PROJECT_DISPLAYNAME}
      openshift.io/requester: \${PROJECT_REQUESTING_USER}
    name: \${PROJECT_NAME}
- apiVersion: rbac.authorization.k8s.io/v1
  kind: RoleBinding
  metadata:
    name: admin
    namespace: \${PROJECT_NAME}
  roleRef:
    apiGroup: rbac.authorization.k8s.io
    kind: ClusterRole
    name: admin
  subjects:
  - apiGroup: rbac.authorization.k8s.io
    kind: User
    name: \${PROJECT_ADMIN_USER}
- apiVersion: v1
  kind: ResourceQuota
  metadata:
    name: project-quota
    namespace: \${PROJECT_NAME}
  spec:
    hard:
      pods: "10"
      requests.cpu: "2"
      requests.memory: 4Gi
- apiVersion: v1
  kind: LimitRange
  metadata:
    name: project-limits
    namespace: \${PROJECT_NAME}
  spec:
    limits:
    - type: Container
      default:
        cpu: 500m
        memory: 512Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi
parameters:
- name: PROJECT_NAME
- name: PROJECT_DISPLAYNAME
- name: PROJECT_DESCRIPTION
- name: PROJECT_ADMIN_USER
- name: PROJECT_REQUESTING_USER
EOF`, pt: 'O template com a quota e o limit range. As aspas em `EOF` impedem o shell de trocar `${...}`.', en: 'The template with the quota and the limit range. The quotes around `EOF` stop the shell from replacing `${...}`.' },
    { cmd: 'oc create -f template.yaml -n openshift-config', pt: 'O template precisa estar no `openshift-config`.', en: 'The template must live in `openshift-config`.' },
    { cmd: 'oc patch projects.config.openshift.io cluster --type merge -p \'{"spec":{"projectRequestTemplate":{"name":"project-request"}}}\'', pt: 'Aponta o cluster para o template.', en: 'Points the cluster to the template.' },
    { cmd: 'sleep 60', pt: 'Espera o openshift-apiserver reiniciar com a configuração nova.', en: 'Waits for openshift-apiserver to restart with the new configuration.' },
    { cmd: 'oc login -u developer -p developer', pt: 'Testa como usuário comum.', en: 'Tests as a regular user.' },
    { cmd: 'oc new-project dev-sandbox', pt: 'O projeto sai do template.', en: 'The project comes from the template.' },
    { cmd: 'oc get quota,limitrange', pt: 'A quota e o limit range já estão lá.', en: 'The quota and the limit range are already there.' },
    { cmd: 'oc login -u admin -p redhatocp', pt: 'Volta para o admin.', en: 'Back to admin.' },
  ],
};
