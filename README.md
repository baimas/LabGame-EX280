# LabGame EX280

Labs gamificados para estudar para a prova **Red Hat EX280** (Red Hat Certified OpenShift
Administrator). Você é o administrador OpenShift de uma empresa fictícia e resolve chamados
no formato dos labs da Red Hat: uma especificação do que precisa estar pronto, um terminal
com `oc` e uma correção item a item (`lab grade`).

O cluster é **simulado em JavaScript dentro do navegador**. É gratuito, roda offline e não
exige OpenShift, Docker nem conta Red Hat.

> Projeto em construção: 2 de 10 capítulos estão jogáveis. Veja [Estado atual](#estado-atual).

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
| 2. Aplicações empacotadas | Templates, Helm, services, labels | em construção |
| 3. Identidade | HTPasswd, usuários, grupos, RBAC | em construção |
| 4. Segurança de rede | Routes, TLS, network policies | em construção |
| 5. Além do HTTP | LoadBalancer, acesso externo | em construção |
| 6. Autosserviço | Quotas, limit ranges, project template | em construção |
| 7. Operators | Instalar e remover operators | em construção |
| 8. Segurança de aplicações | Service accounts, SCC, jobs, cron jobs | em construção |
| 9. Updates | Atualização do cluster e de operators | em construção |

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
