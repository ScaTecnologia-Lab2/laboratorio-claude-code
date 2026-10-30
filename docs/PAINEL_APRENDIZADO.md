# Painel de Aprendizado — ver containers, Kubernetes e banco por dentro

Um conjunto de telas para **enxergar e acompanhar** o que o LabSystem faz por baixo: containers do Docker, nós e pods do Kubernetes, e um console para conversar com o banco de dados em SQL. Cada tela tem um quadro azul **"O que você está vendo nesta tela"** explicando os termos, e as colunas das tabelas têm dicas (passe o mouse).

```bash
npm run painel            # ou: node painel/servidor.js
# abra http://localhost:3100
```

Não precisa instalar nada: usa só o Node, o `pg` que o projeto já tem, e os comandos `docker` e `kubectl` da sua máquina.

---

## 1. Por que ele roda fora dos containers?

Para listar containers e pods é preciso falar com o Docker e com o `kubectl`. Dentro do app isso exigiria montar o `docker.sock` no backend — e quem invadisse o app teria controle total da máquina. Por isso o painel é um programa **separado**, que roda no seu computador e só aceita conexões dele (`127.0.0.1:3100`). O app (`localhost:3000`) não ganhou nenhuma permissão nova.

---

## 2. As telas

| Tela | O que mostra | O que aprender |
|---|---|---|
| **Início** (`/`) | Mapa da aplicação (frontend → backend → fornecedores/postgres) com o estado de cada peça no Compose, no K8s dev e no K8s produção; roteiro de estudo | Quem conversa com quem; Compose × Kubernetes |
| **Containers** (`/containers.html`) | Todos os containers do Docker: situação, saúde, portas, CPU, memória; botão **Logs** | O que é imagem/container/healthcheck; por que um container fica reiniciando |
| **Kubernetes** (`/kubernetes.html`) | Mapa de nós com seus pods, tabelas de Pods, Deployments/StatefulSets, Services, HPA e eventos do cluster; logs de pod; seletor `labsystem-dev` / `labsystem` | Nó, pod, réplica, Service, autoescala, probes |
| **Console SQL** (`/sql.html`) | Tabelas e colunas do banco, editor SQL, exemplos prontos com explicação, resultado em tabela | SELECT/JOIN/GROUP BY, INSERT/UPDATE/DELETE, transação e ROLLBACK |

As telas de Containers e Kubernetes se atualizam sozinhas a cada 5 segundos (dá para desligar). O link **API Docs** leva ao Swagger (seção 5).

### Os 3 modos do Console SQL

| Modo | O que acontece | Quando usar |
|---|---|---|
| **Somente leitura** (padrão) | O próprio PostgreSQL recusa qualquer `INSERT/UPDATE/DELETE/CREATE…` (`BEGIN READ ONLY`) | Explorar à vontade |
| **Simular escrita** | Executa, mostra as linhas afetadas e **desfaz tudo** (`ROLLBACK`) | Testar um `UPDATE`/`DELETE` antes de valer |
| **Gravar de verdade** | `COMMIT` — permanente; exige marcar uma confirmação | Quando tiver certeza |

Regras fixas: **uma instrução por vez**, limite de **10 s** por consulta, no máximo **500 linhas** na tela, a coluna `senha` aparece sempre oculta, e comandos que mexem em arquivos do servidor do banco (`COPY`, `pg_read_file`, `lo_import`…) são bloqueados.

O console conecta no banco do **Docker Compose** (`localhost:5151`, banco `laboratorio`). Para apontar para outro: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` ao iniciar (`DB_PORT=5199 npm run painel`). O Postgres do Kubernetes é outro banco e **não** é acessado por este console.

---

## 3. Segurança (tudo é conferido no servidor)

| Ameaça | Proteção |
|---|---|
| Outro computador da rede usar o painel | Escuta só em `127.0.0.1` |
| Um site aberto no navegador mandar comandos ao painel (CSRF) | Pedidos à API precisam do cabeçalho `X-Painel` e de `Origin` do próprio painel — site de fora recebe 403 |
| DNS rebinding | O cabeçalho `Host` precisa ser `localhost`/`127.0.0.1` na porta do painel |
| Injeção de comando | Comandos rodam com `execFile` (sem shell); nomes de container/pod seguem `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$` (nunca começam com `-`); só os namespaces `labsystem` e `labsystem-dev` |
| Escapar do modo somente leitura (`COMMIT; DROP TABLE x`) | O pg usa *prepared statement* nomeado: o Postgres aceita **uma** instrução; cada pedido usa uma conexão nova, descartada no fim |
| Escrever sem querer | Modo padrão é leitura; "Gravar" exige confirmação; "Simular" faz ROLLBACK |
| Vazar hash de senha | Colunas `senha` são mascaradas no resultado |

O console conecta como `postgres` (superusuário), então o bloqueio de `COPY` & cia. é proteção contra acidente, não contra quem já é dono do banco. O painel **não tem login**: a barreira é ser local. Não o exponha (proxy, túnel, `0.0.0.0`).

Testes das travas: `node painel/lib.test.js` (roda também no `npm run test:unit` do CI).

---

## 4. Como testar o painel

1. `docker compose up -d` **ou** `sh scripts/k8s/criar-cluster.sh` + `sh scripts/k8s/dev-deploy.sh` (um de cada vez, por causa da RAM).
2. `npm run painel` → http://localhost:3100.
3. **Containers:** pare o banco (`docker compose stop postgres`) e veja o backend virar *Reiniciando*; abra os **Logs** (`getaddrinfo EAI_AGAIN postgres`); religue com `docker compose up -d postgres`.
4. **Kubernetes:** `kubectl delete pod <um-pod> -n labsystem-dev` e veja o pod novo aparecer; `sh scripts/k8s/teste-carga.sh dev 60 4` e veja o HPA subir as réplicas.
5. **SQL:** escolha *Testar um DELETE sem gravar* nos exemplos, execute, depois rode `SELECT count(*) FROM clientes` e confirme que nada mudou.

**Se uma tela mostrar erro vermelho,** ele traz a causa e a dica (Docker parado, cluster desligado, banco fora do ar…).

---

## 5. Swagger atualizado (`/api-docs`)

O `src/public/swagger.json` agora cobre **todas** as rotas (antes só Auth, Usuários, Clientes e Fornecedores): Produtos (com `X-Cache`), Categorias, Estoque (reservas), Carrinho e checkout, Avaliações, Eventos, Relatório e as rotas de Saúde (`/health`, `/pronto`, `/redis-status`).

- A página abre com um **passo a passo**: faça `POST /login` (o exemplo já vem preenchido) e todas as outras rotas passam a enviar o cookie sozinhas.
- O endereço do servidor agora é relativo (`/`), então o "Try it out" funciona igual no Compose (`:3000`), no K8s dev (`:8081`) e na produção (`:8080`).
- Rotas de **Admin** estão marcadas no título; sem permissão você vê o `403`.
- Dica: execute `GET /produtos` duas vezes e compare o cabeçalho `X-Cache` (`MISS` → `HIT`).

---

## 6. Arquivos

| Arquivo | Função |
|---|---|
| `painel/servidor.js` | Servidor (porta 3100): API de containers, K8s e SQL + arquivos estáticos |
| `painel/lib.js` / `lib.test.js` | Funções puras e travas de segurança, com testes |
| `painel/public/*.html`, `js/`, `css/painel.css` | As 4 telas (reaproveitam o `styles.css` do LabSystem) |
| `src/public/swagger.json`, `swagger.html` | Documentação interativa da API |

## 7. Limitações conhecidas

- Console SQL só do banco do Compose (não do Postgres do cluster).
- Mostra o que o Docker/`kubectl` da sua máquina enxergam; precisa de permissão para rodar `docker` e de um `kubeconfig` válido.
- `kubectl top` depende do metrics-server (já vem no k3d); sem ele o painel mostra tudo, menos CPU/memória.
