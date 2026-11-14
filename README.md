# LabGame EX280

Labs gamificados para estudar para a prova **Red Hat EX280** (OpenShift Administration).
Você é o administrador OpenShift de uma empresa fictícia e resolve chamados no formato dos
labs da Red Hat: uma especificação do que precisa estar pronto, um terminal com `oc` e uma
correção item a item (`lab grade`).

O cluster é **simulado em JavaScript dentro do navegador**. É gratuito, roda offline e não
exige OpenShift, Docker nem conta Red Hat.

## Como rodar

Requer apenas Node 20 ou mais recente, usado como servidor de arquivos estáticos.

```bash
npm start
```

Abra http://localhost:8280. Para rodar os testes:

```bash
npm test
```

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

## Limites do simulador

Simulador não é cluster. Ele reproduz os comandos, as saídas e as regras que a prova cobra,
e responde "ainda não é simulado" quando um comando está fora do escopo, em vez de inventar
uma saída. Não reproduz tempos reais de rollout, problemas de infraestrutura nem o console
web completo. Use-o para ganhar fluência e, se puder, complemente com prática em um cluster
real antes da prova.

## Como o projeto é organizado

- `web/sim/` — o cluster simulado: armazenamento de recursos, controllers, shell virtual e `oc`.
- `web/engine/` — preparação e correção das missões, pontuação e progresso.
- `web/missions/` — as missões. Cada uma traz enunciado, dicas, checks e solução em PT-BR e inglês.
- `test/` — para cada missão, garante que o ambiente inicial reprova e que a solução documentada aprova.

## Aviso

Projeto independente, sem vínculo com a Red Hat. Os cenários são originais e cobrem os
objetivos públicos da prova; não há conteúdo de provas reais nem de material de curso.
Red Hat e OpenShift são marcas da Red Hat, Inc.
