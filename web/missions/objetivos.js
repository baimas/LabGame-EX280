// Objetivos oficiais da EX280, com o texto da página da prova (consultada em
// novembro de 2026, OpenShift 4.22), e os rótulos usados nas missões.
// `pt` lista os rótulos das missões que cobrem o objetivo. `fora` marca o que
// o simulador não reproduz, com o motivo.

export const OFICIAIS = [
  { secao: 'Manage OpenShift Container Platform', itens: [
    { en: 'Use the web console to manage and configure an OpenShift cluster', pt: [], fora: { pt: 'O console web não é simulado; as mesmas tarefas são cobradas pela CLI.', en: 'The web console is not simulated; the same tasks are practiced through the CLI.' } },
    { en: 'Use the command-line interface to manage and configure an OpenShift cluster', pt: ['Usar a CLI para gerenciar o cluster'] },
    { en: 'Create and delete projects', pt: ['Criar e excluir projetos'] },
    { en: 'Locate and examine container images', pt: ['Localizar e examinar imagens de contêiner'] },
    { en: 'Identify images using tags and digests', pt: ['Identificar imagens por tags e digests'] },
    { en: 'Query, format, and filter attributes of Kubernetes resources', pt: ['Consultar, formatar e filtrar atributos de recursos'] },
    { en: 'Import, export, and configure Kubernetes resources', pt: ['Importar, exportar e configurar recursos'] },
    { en: 'Examine resources and cluster status', pt: ['Examinar recursos e o status do cluster'] },
    { en: 'Monitor cluster events and alerts', pt: ['Monitorar eventos e alertas do cluster'], parcial: { pt: 'Eventos são simulados; alertas do Prometheus/Alertmanager não.', en: 'Events are simulated; Prometheus/Alertmanager alerts are not.' } },
    { en: 'View logs', pt: ['Visualizar logs'] },
    { en: 'Assess the health of an OpenShift cluster', pt: ['Avaliar a saúde de um cluster OpenShift'] },
    { en: 'Troubleshoot common container, pod, and cluster events and alerts', pt: ['Solucionar problemas comuns de contêineres e pods'] },
    { en: 'Use product documentation', pt: ['Usar a documentação do produto'], parcial: { pt: 'Treinado com `oc explain` e `--help`; a documentação HTML da Red Hat não está no jogo.', en: 'Practiced with `oc explain` and `--help`; the Red Hat HTML documentation is not in the game.' } },
    { en: 'Be prepared to perform all tasks of a Red Hat Certified Technologist in OpenShift', pt: ['Usar a CLI para gerenciar o cluster', 'Implantar aplicações a partir de manifestos YAML', 'Configurar services'] },
  ] },
  { secao: 'Declarative Resource Management', itens: [
    { en: 'Work with resource manifests', pt: ['Trabalhar com manifestos de recursos'] },
    { en: 'Deploy applications from YAML resource manifests', pt: ['Implantar aplicações a partir de manifestos YAML'] },
    { en: 'Update application deployments', pt: ['Atualizar implantações de aplicações'] },
    { en: 'Deploy applications using Kustomize', pt: ['Implantar aplicações com Kustomize'] },
    { en: 'Work with Kustomize overlays', pt: ['Trabalhar com overlays do Kustomize'] },
    { en: 'Create and use secrets', pt: ['Criar e usar secrets'] },
    { en: 'Create and use configuration maps', pt: ['Criar e usar config maps'] },
  ] },
  { secao: 'Deploy applications', itens: [
    { en: 'Deploy applications from templates and Helm charts', pt: ['Implantar aplicações a partir de templates', 'Implantar aplicações a partir de Helm charts'] },
    { en: 'Manage application deployments', pt: ['Gerenciar implantações de aplicações'] },
    { en: 'Work with replica sets', pt: ['Trabalhar com replica sets'] },
    { en: 'Work with labels and selectors', pt: ['Trabalhar com labels e selectors'] },
    { en: 'Configure services', pt: ['Configurar services'] },
    { en: 'Expose applications to external access', pt: ['Expor aplicações para acesso externo'] },
  ] },
  { secao: 'Manage authentication and authorization', itens: [
    { en: 'Configure the HTPasswd identity provider for authentication', pt: ['Configurar o identity provider HTPasswd'] },
    { en: 'Create and delete users', pt: ['Criar e excluir usuários'] },
    { en: 'Modify user passwords', pt: ['Alterar senhas de usuários'] },
    { en: 'Create and manage groups', pt: ['Criar e gerenciar grupos'] },
    { en: 'Modify user and group permissions', pt: ['Modificar permissões de usuários e grupos'] },
  ] },
  { secao: 'Configure network security', itens: [
    { en: 'Configure networking components', pt: ['Configurar componentes de rede'] },
    { en: 'Troubleshoot software defined networking', pt: ['Solucionar problemas de rede definida por software (SDN)'] },
    { en: 'Create and edit external routes', pt: ['Criar e editar routes externas'] },
    { en: 'Control cluster network ingress', pt: ['Controlar o tráfego de entrada (ingress) do cluster'] },
    { en: 'Secure external and internal traffic using TLS certificates', pt: ['Proteger tráfego externo e interno com certificados TLS'] },
    { en: 'Configure application network policies', pt: ['Configurar network policies de aplicações'] },
  ] },
  { secao: 'Expose non-HTTP/SNI Applications', itens: [
    { en: 'Expose non-HTTP/SNI Applications', pt: ['Expor aplicações não HTTP/SNI'] },
    { en: 'Configure a load balancer service', pt: ['Configurar um service do tipo load balancer'] },
    { en: 'Configure external application access', pt: ['Configurar acesso externo às aplicações'] },
  ] },
  { secao: 'Enable developer self-service', itens: [
    { en: 'Enable developer self-service', pt: ['Configurar o autoprovisionamento de projetos'] },
    { en: 'Configure cluster resource quotas', pt: ['Configurar quotas de recursos para vários projetos'] },
    { en: 'Configure project quotas', pt: ['Configurar quotas de recursos por projeto'] },
    { en: 'Configure project resource requirements', pt: ['Configurar os requisitos de recursos do projeto'] },
    { en: 'Configure project limit ranges', pt: ['Configurar limit ranges por projeto'] },
    { en: 'Configure project templates', pt: ['Configurar o template de criação de projetos'] },
  ] },
  { secao: 'Manage OpenShift operators', itens: [
    { en: 'Install an operator', pt: ['Instalar operators'] },
    { en: 'Uninstall an operator', pt: ['Desinstalar operators'] },
    { en: 'Delete an operator', pt: ['Excluir operators'] },
  ] },
  { secao: 'Configure application security', itens: [
    { en: 'Configure and manage service accounts', pt: ['Criar e usar service accounts'] },
    { en: 'Run privileged applications', pt: ['Executar aplicações privilegiadas'] },
    { en: 'Manage and apply permissions using security context constraints', pt: ['Gerenciar e aplicar permissões com security context constraints'] },
    { en: 'Create and apply secrets to manage sensitive information', pt: ['Criar e aplicar secrets para informações sensíveis'] },
    { en: 'Configure application access to Kubernetes APIs', pt: ['Permitir que aplicações acessem a API do Kubernetes'] },
    { en: 'Deploy jobs to perform one-time tasks', pt: ['Executar tarefas únicas com jobs'] },
    { en: 'Configure Kubernetes cron jobs', pt: ['Configurar cron jobs'] },
  ] },
];

// Conteúdo do curso DO280 que não está na lista atual da prova, mas ajuda.
export const EXTRAS = {
  'Atualizar o cluster OpenShift': 'Update an OpenShift cluster (DO280)',
  'Identificar APIs depreciadas antes de atualizar': 'Identify deprecated Kubernetes API usage (DO280)',
  'Atualizar operators': 'Update operators (DO280)',
};

// Rótulo da missão → texto oficial em inglês.
export const OBJETIVOS_EN = { ...EXTRAS };
for (const s of OFICIAIS) for (const o of s.itens) for (const pt of o.pt) OBJETIVOS_EN[pt] ??= o.en;
