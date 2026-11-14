// Pedido de projetos: o template de projeto, a mensagem de recusa e o
// reinício do openshift-apiserver quando `projects.config.openshift.io` muda.
import { ApiError } from './cluster.js';
import { PROJECT_CONFIG } from './resources.js';
import { processa } from './template.js';
import { clone } from './util.js';

export const ESPERA_APISERVER = 60;
const RBAC = 'rbac.authorization.k8s.io';
const AUTOUPDATE = 'rbac.authorization.kubernetes.io/autoupdate';

// O template que `oc adm create-bootstrap-project-template` imprime.
export function templateInicial(nome = 'project-request') {
  return {
    apiVersion: 'template.openshift.io/v1',
    kind: 'Template',
    metadata: { creationTimestamp: null, name: nome },
    objects: [
      {
        apiVersion: 'project.openshift.io/v1',
        kind: 'Project',
        metadata: {
          annotations: { 'openshift.io/description': '${PROJECT_DESCRIPTION}', 'openshift.io/display-name': '${PROJECT_DISPLAYNAME}', 'openshift.io/requester': '${PROJECT_REQUESTING_USER}' },
          creationTimestamp: null,
          name: '${PROJECT_NAME}',
        },
        spec: {},
        status: {},
      },
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata: { creationTimestamp: null, name: 'admin', namespace: '${PROJECT_NAME}' },
        roleRef: { apiGroup: RBAC, kind: 'ClusterRole', name: 'admin' },
        subjects: [{ apiGroup: RBAC, kind: 'User', name: '${PROJECT_ADMIN_USER}' }],
      },
    ],
    parameters: ['PROJECT_NAME', 'PROJECT_DISPLAYNAME', 'PROJECT_DESCRIPTION', 'PROJECT_ADMIN_USER', 'PROJECT_REQUESTING_USER'].map((name) => ({ name })),
  };
}

const configAtual = (c) => clone(c.get(PROJECT_CONFIG, 'cluster')?.spec || {});

// A configuração que o openshift-apiserver está usando agora.
export function configProjetos(c) {
  return c.side.projetos?.ativo || configAtual(c);
}

// Na partida, o servidor de API recoloca os bindings padrão que não tenham
// `autoupdate: "false"`.
export function reconciliaPapeisPadrao(c) {
  const grupo = { apiGroup: RBAC, kind: 'Group', name: 'system:authenticated:oauth' };
  const b = c.get('ClusterRoleBinding', 'self-provisioners');
  if (!b) {
    c.create({ kind: 'ClusterRoleBinding', metadata: { name: 'self-provisioners', annotations: { [AUTOUPDATE]: 'true' } }, roleRef: { apiGroup: RBAC, kind: 'ClusterRole', name: 'self-provisioner' }, subjects: [grupo] });
    return;
  }
  if (b.metadata.annotations?.[AUTOUPDATE] === 'false') return;
  if ((b.subjects || []).some((s) => s.kind === 'Group' && s.name === grupo.name)) return;
  const novo = clone(b);
  novo.subjects = [...(novo.subjects || []), grupo];
  c.update(novo);
}

// Controller: mudança na configuração reinicia o openshift-apiserver, e a
// configuração nova só vale depois do rollout.
export function projetoCtl(c) {
  if (!c.get(PROJECT_CONFIG, 'cluster')) return;
  const cfg = configAtual(c);
  const fp = JSON.stringify(cfg);
  const s = (c.side.projetos ??= { ativo: cfg, fp });
  if (fp !== s.fp) {
    s.fp = fp;
    s.pendente = cfg;
    s.em = c.now + ESPERA_APISERVER;
    const d = c.get('Deployment', 'apiserver', 'openshift-apiserver');
    if (d) {
      const novo = clone(d);
      ((novo.spec.template.metadata ??= {}).annotations ??= {})['operator.openshift.io/dep-openshift-apiserver.config'] = fp.length.toString(36) + c.now.toString(36);
      c.update(novo);
    }
  }
  if (s.pendente && c.now >= s.em) {
    s.ativo = s.pendente;
    s.pendente = null;
    reconciliaPapeisPadrao(c);
  }
}

// Cria o projeto pedido por `oc new-project`, pelo template configurado ou
// pelo padrão embutido.
export function criaProjeto(c, { nome, usuario, display = '', descricao = '' }) {
  const cfg = configProjetos(c);
  const nomeTpl = cfg.projectRequestTemplate?.name;
  let tpl = templateInicial();
  if (nomeTpl) {
    tpl = c.get('Template', nomeTpl, 'openshift-config');
    if (!tpl) throw new ApiError(`Error from server (InternalError): Internal error occurred: template.template.openshift.io "${nomeTpl}" not found`, 'InternalError');
  }
  const valores = { PROJECT_NAME: nome, PROJECT_DISPLAYNAME: display, PROJECT_DESCRIPTION: descricao, PROJECT_ADMIN_USER: usuario, PROJECT_REQUESTING_USER: usuario };
  const definidos = new Set((tpl.parameters || []).map((p) => p.name));
  const { objetos } = processa(tpl, Object.fromEntries(Object.entries(valores).filter(([k]) => definidos.has(k))));
  const projeto = objetos.find((o) => o.kind === 'Project' || o.kind === 'Namespace');
  if (!projeto) throw new ApiError('Error from server (InternalError): Internal error occurred: the project template has no Project object', 'InternalError');
  const ns = { kind: 'Namespace', metadata: { ...projeto.metadata, name: nome } };
  delete ns.metadata.creationTimestamp;
  ns.metadata.annotations = Object.fromEntries(Object.entries(ns.metadata.annotations || {}).filter(([, v]) => v !== ''));
  ns.metadata.annotations['openshift.io/requester'] ??= usuario;
  c.create(ns);
  for (const o of objetos) {
    if (o === projeto) continue;
    const x = clone(o);
    delete x.metadata.creationTimestamp;
    if (c.tipo(x.kind).namespaced) x.metadata.namespace = nome;
    c.create(x);
  }
}
