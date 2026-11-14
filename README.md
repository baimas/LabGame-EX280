# LabGame EX280

Labs gamificados para estudar para a prova **Red Hat EX280** (Red Hat Certified OpenShift
Administrator). Você é o administrador OpenShift de uma empresa fictícia e resolve chamados
no formato dos labs da Red Hat: uma especificação do que precisa estar pronto, um terminal
com `oc` e uma correção item a item (`lab grade`).

O cluster é **simulado em JavaScript dentro do navegador**. É gratuito, roda offline e não
exige OpenShift, Docker nem conta Red Hat.

> Os 10 capítulos estão jogáveis; falta o modo prova. Veja [Estado atual](#estado-atual).

## Como rodar

Requer apenas [Node.js](https://nodejs.org) 20 ou mais recente, usado como servidor de
arquivos estáticos. Não há dependências para instalar.

```bash
git clone https://github.com/baimas/LabGame-EX280.git
```

```bash
cd LabGame-EX280
```

```bash
npm start
```

Abra http://localhost:8280 no navegador.

## Como jogar

1. Escolha uma missão na lista e clique em **Iniciar missão**. O ambiente é preparado como
   no `lab start`, muitas vezes já com algo quebrado.
2. Resolva no terminal com `oc`. A tecla Tab completa comandos, tipos e nomes de recursos,
   e `vi arquivo` abre um editor.
3. Clique em **Corrigir** ou rode `lab grade` para ver o que passou e o que falta.
4. Cada dica custa parte do XP. A solução comentada fica disponível depois da primeira
   correção, e cada passo pode ser executado direto no terminal.

O botão no canto superior alterna entre português e inglês. A prova é aplicada em inglês,
então vale treinar a leitura dos enunciados nesse idioma. O progresso fica salvo no
navegador.

## Estado atual

| Capítulo | Domínio da prova | Situação |
|---|---|---|
| 0. Primeiro dia | Gerenciar o OpenShift Container Platform | 5 missões |
| 1. Gestão declarativa | Manifestos, Kustomize, secrets, config maps | 4 missões |
| 2. Aplicações empacotadas | Templates, Helm, services, labels | 6 missões |
| 3. Identidade | HTPasswd, usuários, grupos, RBAC | 5 missões |
| 4. Segurança de rede | Routes, TLS, network policies | 5 missões |
| 5. Além do HTTP | LoadBalancer, acesso externo | 4 missões |
| 6. Autosserviço | Quotas, limit ranges, project template | 5 missões |
| 7. Operators | Instalar e remover operators | 4 missões |
| 8. Segurança de aplicações | Service accounts, SCC, jobs, cron jobs | 4 missões |
| 9. Updates | Atualização do cluster e de operators | 4 missões |

Também está planejado um modo prova: 3 horas, tarefas de todos os domínios e sem dicas.

### Missões disponíveis

**Capítulo 0 — Primeiro dia**

- **Primeiro dia na Nimbus:** criar projeto, deployment, service e route.
- **Inventário para a auditoria:** consultas com labels e `jsonpath`.
- **Tag não é contrato:** examinar imagens e referenciá-las por digest.
- **Plantão: três aplicações fora do ar:** troubleshooting com logs, eventos e `describe`.
- **Checagem de saúde:** cluster operators, versão do cluster e eventos de aviso.

**Capítulo 1 — Gestão declarativa**

- **O que vale é o arquivo:** corrigir e aplicar manifestos com `oc apply` e `oc diff`.
- **Configuração fora da imagem:** config maps e secrets como variáveis e como arquivos.
- **Kustomize: a base:** escrever uma `kustomization.yaml` com geradores e labels.
- **Kustomize: uma base, dois ambientes:** overlays com `namespace`, `replicas`, `images` e `patches`.

**Capítulo 2 — Aplicações empacotadas**

- **Um pod em quarentena:** replica set, seletor e labels, e um service que ignora o pod isolado.
- **Loja fora do ar:** troubleshooting de route, service, seletor e `targetPort`.
- **Banco de dados pelo catálogo:** `oc process --parameters` e `oc new-app --template` com parâmetros gerados.
- **Um template para o time de Catálogo:** publicar um template no projeto e usá-lo com `--param-file`.
- **Helm: o primeiro chart:** `helm repo add`, `helm show values` e `helm install` com arquivo de valores.
- **Helm: atualizar, voltar e atualizar de novo:** `helm upgrade`, `helm rollback` e a armadilha do `--reuse-values`.

**Capítulo 3 — Identidade**

- **Crachás para o time novo:** `htpasswd`, secret em `openshift-config` e um segundo provedor HTPasswd no OAuth.
- **Entra um, sai outro:** trocar senha, remover usuário (com `user` e `identity`) e acrescentar outro.
- **Cada time no seu quadrado:** grupos e os papéis `admin`, `edit` e `view` por projeto.
- **Um papel sob medida:** `role`, `rolebinding`, `clusterrole` e `clusterrolebinding` próprios.
- **Fechando a porta dos fundos:** `cluster-admin` para um grupo e remoção do `kubeadmin`.

**Capítulo 4 — Segurança de rede**

- **Cadeado no pagamento:** chave, CSR e certificado com `openssl`, e route edge com redirecionamento.
- **O cofre fala TLS sozinho:** secret TLS montado no pod e route passthrough.
- **TLS também por dentro:** service CA, CA bundle injetado em config map e route reencrypt.
- **Ninguém entra sem convite:** `deny-all` e liberações por pod, por namespace e para o roteador.
- **Políticas que bloquearam demais:** troubleshooting de network policies com seletor e porta errados.

**Capítulo 5 — Além do HTTP**

- **Um banco para o parceiro:** service LoadBalancer para MySQL e acesso com o cliente `mysql`.
- **Endereços para o fliperama:** `IPAddressPool`, `L2Advertisement` e IP fixo no MetalLB.
- **Uma porta no nó:** services NodePort, inclusive trocando o tipo de um service existente.
- **O IP que ninguém alcança:** troubleshooting de MetalLB (pool, anúncio) e network policy para tráfego externo.

**Capítulo 6 — Autosserviço**

- **Teto de gastos:** `ResourceQuota` e `oc set resources` para pods recusados pela quota.
- **Padrão para quem esquece:** `LimitRange` com valores padrão e máximo, e pods que passam do limite.
- **Um orçamento para o time Órion:** `ClusterResourceQuota` por label de projeto.
- **Todo projeto nasce pronto:** template de criação de projetos com quota e limit range.
- **Projeto só com pedido:** self-provisioner restrito a um grupo, à prova de reinício do servidor de API.

**Capítulo 7 — Operators**

- **Um vigia para os arquivos:** instalação pela CLI com `OperatorGroup` e `Subscription`.
- **Versão homologada:** `startingCSV`, aprovação manual e install plans.
- **O terminal que nunca chegou:** subscription travada (canal errado, modo de instalação não suportado) e dependências.
- **Desligando o que ninguém usa:** remoção completa de um operator (subscription e CSV).

A instalação de operators pelo console web não é simulada; o jogo cobre o caminho pela CLI.

**Capítulo 8 — Segurança de aplicações**

- **O legado que exige root:** service account própria com a SCC `anyuid` e `oc set serviceaccount`.
- **Ninguém aqui precisa de root:** pod recusado por todas as SCCs e `oc adm policy scc-subject-review`.
- **Quem vigia os pods:** aplicação que lê a API do cluster com uma service account e o papel `view` em dois projetos.
- **A conciliação da madrugada:** cron job com agenda, histórico e concorrência, e um job disparado a partir dele.

**Capítulo 9 — Updates**

- **Patch de segurança:** `oc adm upgrade` dentro da mesma minor, acompanhando a ClusterVersion e os cluster operators.
- **Rumo à 4.19:** `apirequestcounts`, admin-ack para APIs removidas, troca de canal e atualização de minor.
- **Um canal à frente:** troca de canal de um operator com aprovação manual.
- **Prova oral da Plataforma:** cinco perguntas sobre canais, rollback, EUS e atualização de operators.

## Usuários do laboratório

O jogo começa logado como `admin` (senha `redhatocp`), que é administrador do cluster.
Também existe o usuário comum `developer` (senha `developer`). As permissões valem de
verdade: um usuário sem papel no projeto recebe `Forbidden`, como no OpenShift.

## Limites do simulador

Simulador não é cluster. Ele reproduz os comandos, as saídas e as regras que a prova cobra,
e responde "ainda não é simulado" quando um comando está fora do escopo, em vez de inventar
uma saída. Não reproduz tempos reais de rollout, problemas de infraestrutura nem o console
web. Use-o para ganhar fluência e, se puder, complemente com prática em um cluster real
antes da prova.

O simulador se apresenta como OpenShift 4.18. Confira na
[página oficial da prova](https://www.redhat.com/en/services/training/red-hat-certified-openshift-administrator-exam)
a versão e os objetivos vigentes.

## Como o projeto é organizado

- `web/sim/` — o cluster simulado: armazenamento de recursos, controllers, shell virtual e `oc`.
- `web/engine/` — preparação e correção das missões, pontuação e progresso.
- `web/missions/` — as missões. Cada uma traz enunciado, dicas, checks e solução em PT-BR e inglês.
- `web/ui/` e `web/app.js` — a interface e o terminal.
- `test/` — para cada missão, garante que o ambiente inicial reprova e que a solução documentada aprova.

Para rodar os testes:

```bash
npm test
```

## Contribuindo

Encontrou um comando que se comporta diferente do OpenShift real, ou quer propor uma missão?
Abra uma issue. Missões novas seguem o formato dos arquivos em `web/missions/` e precisam
passar no `npm test`.

## Aviso

Projeto independente, sem vínculo com a Red Hat. Os cenários são originais e cobrem os
objetivos públicos da prova; não há conteúdo de provas reais nem de material de curso.
Red Hat e OpenShift são marcas da Red Hat, Inc.
