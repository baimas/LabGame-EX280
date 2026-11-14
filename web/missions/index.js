// Catálogo de capítulos e missões. Cada capítulo espelha um domínio dos
// objetivos oficiais da EX280.
import primeiroDia from './c0/primeiro-dia.js';
import inventario from './c0/inventario.js';
import plantao from './c0/plantao.js';
import imagens from './c0/imagens.js';
import saude from './c0/saude.js';
import manifestos from './c1/manifestos.js';
import configuracao from './c1/configuracao.js';
import kustomizeBase from './c1/kustomize-base.js';
import overlays from './c1/overlays.js';
import replicasets from './c2/replicasets.js';
import servicos from './c2/services.js';
import templates from './c2/templates.js';
import templateProprio from './c2/template-proprio.js';
import helmInstall from './c2/helm-install.js';
import helmUpgrade from './c2/helm-upgrade.js';
import htpasswdMissao from './c3/htpasswd.js';
import usuarios from './c3/usuarios.js';
import gruposMissao from './c3/grupos.js';
import papelProprio from './c3/papel-proprio.js';
import kubeadmin from './c3/kubeadmin.js';
import edge from './c4/edge.js';
import passthrough from './c4/passthrough.js';
import serviceCa from './c4/service-ca.js';
import netpolIsola from './c4/netpol-isola.js';
import netpolConserto from './c4/netpol-conserto.js';
import loadbalancer from './c5/loadbalancer.js';
import metallb from './c5/metallb.js';
import nodeport from './c5/nodeport.js';
import troubleshootLb from './c5/troubleshoot.js';
import quotaMissao from './c6/quota.js';
import limitrange from './c6/limitrange.js';
import clusterquota from './c6/clusterquota.js';
import templateProjeto from './c6/template-projeto.js';
import selfProvisioner from './c6/self-provisioner.js';
import instalarOp from './c7/instalar.js';
import manualOp from './c7/manual.js';
import travadoOp from './c7/travado.js';
import removerOp from './c7/remover.js';
import anyuid from './c8/anyuid.js';
import sccDiagnostico from './c8/scc-diagnostico.js';
import apiAcesso from './c8/api.js';
import cronjobMissao from './c8/cronjob.js';
import zstream from './c9/zstream.js';
import minorUp from './c9/minor.js';
import operadorUp from './c9/operador.js';
import quizUp from './c9/quiz.js';
import { SIMULADOS, montaExame } from './exames.js';
import documentacao from './c0/documentacao.js';
import exportar from './c1/exportar.js';
import rollback from './c2/rollback.js';
import jobMissao from './c8/job.js';
import privilegiado from './c8/privilegiado.js';

export const CHAPTERS = [
  { id: 'c0', title: { pt: 'Primeiro dia', en: 'First day' }, domain: { pt: 'Gerenciar o OpenShift Container Platform', en: 'Manage OpenShift Container Platform' }, missions: [primeiroDia, inventario, imagens, plantao, saude, documentacao] },
  { id: 'c1', title: { pt: 'Gestão declarativa', en: 'Declarative management' }, domain: { pt: 'Manifestos, Kustomize, secrets e config maps', en: 'Manifests, Kustomize, secrets, and config maps' }, missions: [manifestos, configuracao, kustomizeBase, overlays, exportar] },
  { id: 'c2', title: { pt: 'Aplicações empacotadas', en: 'Packaged applications' }, domain: { pt: 'Templates, Helm, services e labels', en: 'Templates, Helm, services, and labels' }, missions: [replicasets, servicos, rollback, templates, templateProprio, helmInstall, helmUpgrade] },
  { id: 'c3', title: { pt: 'Identidade', en: 'Identity' }, domain: { pt: 'HTPasswd, usuários, grupos e RBAC', en: 'HTPasswd, users, groups, and RBAC' }, missions: [htpasswdMissao, usuarios, gruposMissao, papelProprio, kubeadmin] },
  { id: 'c4', title: { pt: 'Segurança de rede', en: 'Network security' }, domain: { pt: 'Routes, TLS e network policies', en: 'Routes, TLS, and network policies' }, missions: [edge, passthrough, serviceCa, netpolIsola, netpolConserto] },
  { id: 'c5', title: { pt: 'Além do HTTP', en: 'Beyond HTTP' }, domain: { pt: 'LoadBalancer e acesso externo', en: 'LoadBalancer and external access' }, missions: [loadbalancer, metallb, nodeport, troubleshootLb] },
  { id: 'c6', title: { pt: 'Autosserviço', en: 'Self-service' }, domain: { pt: 'Quotas, limit ranges e project template', en: 'Quotas, limit ranges, and project template' }, missions: [quotaMissao, limitrange, clusterquota, templateProjeto, selfProvisioner] },
  { id: 'c7', title: { pt: 'Operators', en: 'Operators' }, domain: { pt: 'Instalar e remover operators', en: 'Install and remove operators' }, missions: [instalarOp, manualOp, travadoOp, removerOp] },
  { id: 'c8', title: { pt: 'Segurança de aplicações', en: 'Application security' }, domain: { pt: 'Service accounts, SCC, jobs e cron jobs', en: 'Service accounts, SCCs, jobs, and cron jobs' }, missions: [anyuid, privilegiado, sccDiagnostico, apiAcesso, jobMissao, cronjobMissao] },
  { id: 'c9', title: { pt: 'Updates', en: 'Updates' }, domain: { pt: 'Atualização do cluster e de operators', en: 'Cluster and operator updates' }, missions: [zstream, minorUp, operadorUp, quizUp] },
];

export const MISSIONS = CHAPTERS.flatMap((c) => c.missions.map((m) => ({ ...m, chapter: c.id })));
export const EXAMS = SIMULADOS.map((d) => montaExame(d, MISSIONS));
export const byId = (id) => MISSIONS.find((m) => m.id === id) || EXAMS.find((m) => m.id === id);
export const chapterOf = (id) => CHAPTERS.find((c) => c.missions.some((m) => m.id === id));

// Rótulos das missões e o texto oficial em inglês (web/missions/objetivos.js).
import { OBJETIVOS_EN } from './objetivos.js';
export const objective = (texto, idioma) => (idioma === 'en' ? OBJETIVOS_EN[texto] || texto : texto);
