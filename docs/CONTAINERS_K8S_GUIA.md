# Containers, Docker Compose, Docker Hub e Kubernetes — guia prático do LabSystem

> **Para quem é:** quem quer entender, mexendo no próprio projeto, o que são containers, pods, load balancers e autoescala.
> **O que você vai fazer:** rodar cada container sozinho, depois todos juntos com o compose, publicar no Docker Hub, e por fim colocar tudo num cluster Kubernetes com 3 "servidores", balanceamento e auto-cura.
> **Continuação:** como alterar e levar para produção → `docs/K8S_FLUXO_DEV_CICD.md`. Simulação de grande demanda → `docs/K8S_TESTE_DE_CARGA.md`.
>
> Todos os comandos e resultados deste guia foram executados de verdade nesta máquina em 2026-10-29.

---

## Parte 0 — O que foi construído (mapa)

```
                         ┌──────────────── seu computador ────────────────┐
  navegador ──► :3000 ──►│  docker compose (desenvolvimento)              │
                         │   frontend ─► backend ─► fornecedores          │
                         │   (nginx)     (Node)     (Python)              │
                         │                  └────┬─────┘                  │
                         │                    postgres                    │
                         └────────────────────────────────────────────────┘

                         ┌──────── cluster Kubernetes "labsystem" (k3d) ─────────┐
  navegador ──► :8081 ──►│ namespace labsystem-dev  (você aplica à mão)          │
  navegador ──► :8080 ──►│ namespace labsystem      (produção, aplicada pelo     │
                         │                           Argo CD a partir do Git)    │
                         │ nós: server-0 · agent-0 · agent-1 (3 "máquinas")      │
                         └───────────────────────────────────────────────────────┘
```

| Peça | Arquivo(s) | Para quê |
|---|---|---|
| Imagem frontend | `Dockerfile.frontend`, `frontend/default.conf.template` | nginx entrega o HTML e repassa a API ao backend |
| Imagem backend | `Dockerfile` | API Node (login, clientes, usuários…) |
| Imagem fornecedores | `Dockerfile.python` | API Python de fornecedores |
| Banco | imagem oficial `postgres:16-alpine` | dados |
| Compose (dev) | `docker-compose.yml` | sobe os 4 containers construindo do código |
| Compose (Docker Hub) | `docker-compose.hub.yml` | sobe os 4 **baixando** imagens prontas |
| Kubernetes | `k8s/base/*.yaml`, `k8s/overlays/{dev,producao}` | Deployments, Services, LoadBalancer, HPA… |
| GitOps | `k8s/argocd/application.yaml` | Argo CD mantém a produção igual ao Git |
| Scripts | `scripts/k8s/*.sh` | criar cluster, deploy dev, Docker Hub, Argo CD, carga |
| Esteira | `.github/workflows/docker-build.yml` | build/scan → Docker Hub → produção (com aprovação) |

---

## Parte 1 — Conceitos (com analogias)

### 1.1 Imagem × container

- **Imagem** = uma "receita congelada": sistema operacional mínimo + runtime (Node/Python/nginx) + seu código + o comando que inicia. É **imutável** e tem nome e versão (`labsystem-backend:dev`).
- **Container** = a imagem **em execução**. Da mesma imagem você cria quantos containers quiser — como várias tortas a partir da mesma receita.
- **Dockerfile** = o arquivo que descreve como montar a imagem, camada por camada (`FROM`, `COPY`, `RUN`, `CMD`).
- **Registry** = "loja" de imagens. **Docker Hub** é o mais conhecido; GHCR (GitHub) e ECR (AWS) são outros. `docker push` envia; `docker pull` baixa.

Por que isso importa: a imagem que passou nos testes é **exatamente** a que vai para produção. Acabou o "na minha máquina funciona".

### 1.2 Um container, uma responsabilidade

Antes, o Node fazia tudo: entregava páginas **e** respondia a API. Agora:

| Container | Responsabilidade | Tem estado? |
|---|---|---|
| `frontend` | arquivos estáticos + *reverse proxy* | não |
| `backend` | regras de negócio (API) | não* |
| `fornecedores` | microsserviço de fornecedores | não |
| `postgres` | guardar dados | **sim** |

Separar permite **escalar e atualizar cada parte de forma independente** — mais frontends não exigem mais bancos.

\* O backend guarda a sessão de login no Postgres (tabela `sessoes`), então qualquer cópia dele atende qualquer usuário. **Exceção didática:** o "Redis" e o "Mongo" deste projeto são simulados **na memória** do processo (`src/redis.js`, `src/mongo.js`). Com 2+ cópias do backend, reservas de estoque e avaliações ficam diferentes em cada cópia. Esse é o motivo de, no mundo real, cache e filas serem serviços separados (um Redis de verdade): **o que precisa ser compartilhado não pode morar dentro da cópia**.

### 1.3 Reverse proxy (o que o nginx faz)

`frontend/default.conf.template`, em uma frase: *"se o arquivo existe (ex.: `/clientes.html`), eu entrego; se não existe (ex.: `/clientes`), é API — repasso para `http://backend:3000`"*. O navegador só conhece um endereço; quem divide o trabalho é o nginx. Por isso nenhum JavaScript das páginas precisou mudar.

**Uma armadilha real que apareceu durante a construção:** na configuração padrão, o nginx descobre o IP do backend **uma única vez, ao iniciar**. Quando o backend foi recriado (`docker compose up -d --build backend`) e voltou com outro IP (172.22.0.4 → 172.22.0.6), o nginx continuou batendo no IP antigo e devolvendo **502**. Correção: `resolver` + o endereço numa variável (`set $backend ...`), o que faz o nginx consultar o DNS a cada 10s. O arquivo é um *template*: ao iniciar, a imagem oficial do nginx preenche o DNS do ambiente (o do Docker, `127.0.0.11`, ou o do Kubernetes, `10.43.0.10`) e o nome do backend (`BACKEND_HOST`). Lição: **em containers, IPs são descartáveis — confie em nomes, e resolva-os de novo.**

### 1.4 Kubernetes em 10 palavras

O Kubernetes (k8s) gerencia containers **em várias máquinas**. Você não diz "rode este container ali"; você declara um **estado desejado** ("quero 2 backends saudáveis") e ele trabalha sem parar para que a realidade bata com o declarado — se um pod morre, ele cria outro.

| Objeto | O que é | Analogia | Neste projeto |
|---|---|---|---|
| **Cluster** | conjunto de máquinas gerenciadas juntas | a empresa | `labsystem` (k3d) |
| **Nó** (node) | uma máquina do cluster | uma filial | `server-0`, `agent-0`, `agent-1` |
| **Control plane** | o "cérebro": decide onde cada pod roda | a diretoria | dentro do `server-0` |
| **Pod** | menor unidade: 1+ containers juntos, com IP próprio | um funcionário | `backend-6c5c…-rx576` |
| **Deployment** | mantém N pods iguais; troca versão sem parar | gerente de turno | `backend`, `frontend`, `fornecedores` |
| **ReplicaSet** | criado pelo Deployment; um por versão | a escala do turno | aparece no nome do pod |
| **Service** | nome DNS fixo + balanceamento entre pods | o ramal da central | `backend:3000` |
| **Service LoadBalancer** | expõe o serviço para fora do cluster | o telefone público | `frontend` (8080/8081) |
| **StatefulSet** | pods com identidade e disco fixos | o arquivo morto | `postgres-0` |
| **PersistentVolumeClaim** | pedido de disco que sobrevive ao pod | a gaveta com chave | `dados-postgres-0` |
| **ConfigMap / Secret** | configuração / senhas fora da imagem | manual / cofre | `labsystem-config`, `labsystem-db` |
| **Probes** | perguntas de saúde: "vivo?" "pronto?" | o supervisor | `/health`, `/pronto` |
| **HPA** | aumenta/diminui pods pelo uso de CPU | temporários na Black Friday | 2→6 backends |
| **PodDisruptionBudget** | mínimo de pods durante manutenção | "sempre alguém no balcão" | `minAvailable: 1` |
| **Namespace** | "pasta" isolada dentro do cluster | departamento | `labsystem-dev`, `labsystem`, `argocd` |

**Pod × container:** no compose você pensa em containers; no Kubernetes, em pods. Aqui cada pod tem exatamente 1 container, então na prática "1 pod = 1 cópia do serviço".

**As três probes** (em `k8s/base/backend.yaml`):

| Probe | Pergunta | Se falhar |
|---|---|---|
| `startupProbe` `/health` | "já terminou de iniciar?" | espera (até 60s) antes de cobrar as outras |
| `livenessProbe` `/health` | "o processo está vivo?" | **reinicia** o container |
| `readinessProbe` `/pronto` | "consegue atender? (fala com o banco?)" | **tira do balanceamento**, sem reiniciar |

### 1.5 Load balancing: onde acontece

```
navegador → LoadBalancer (porta 8080/8081 do seu PC)
          → um dos pods frontend      ← balanceamento 1
          → Service "backend"
          → um dos pods backend       ← balanceamento 2
          → Service "fornecedores"
          → um dos pods fornecedores  ← balanceamento 3
```

Cada resposta carrega dois cabeçalhos criados para você **ver** isso: `X-Frontend-Pod` (qual nginx) e `X-Servido-Por` (qual backend).

### 1.6 k3d, kubectl e Kustomize

- **k3d** cria um cluster Kubernetes de verdade (k3s, certificado pela CNCF) onde **cada nó é um container Docker**. Ele já traz LoadBalancer funcional e o *metrics-server* (que o HPA precisa).
- **kubectl** é o controle remoto: todo comando ao cluster passa por ele.
- **Kustomize** (embutido no `kubectl`): uma `base` comum + **overlays** por ambiente que mudam só o necessário (namespace, imagens, porta). Veja o YAML final de um ambiente: `kubectl kustomize k8s/overlays/dev`.

Instalação (já feita nesta máquina, em `~/.local/bin`, binários oficiais conferidos por checksum): ver `docs/SETUP_NOVA_MAQUINA.md`.

---

## Parte 2 — Cada container separado, na mão

Objetivo: entender **o que o compose faz por você**. Vamos subir os 4 containers um a um, ligando-os por uma rede Docker.

> Pare o compose antes (`docker compose down`) para liberar a porta 3000.

```bash
# 0. Construir as 3 imagens do projeto (o postgres vem pronto do Docker Hub)
docker build -f Dockerfile.frontend -t labsystem-frontend:dev .
docker build -f Dockerfile          -t labsystem-backend:dev .
docker build -f Dockerfile.python   -t labsystem-fornecedores:dev .
docker images | grep labsystem       # tamanhos: frontend ~90MB, backend ~243MB, python ~218MB

# 1. Uma rede: containers na mesma rede se acham pelo NOME (DNS do Docker)
docker network create labnet
docker volume create labdados        # disco do banco, sobrevive ao container

# 2. Banco (--network-alias = o nome pelo qual os outros o encontram)
docker run -d --name lab-postgres --network labnet --network-alias postgres \
  -e POSTGRES_PASSWORD=5151 -e POSTGRES_DB=laboratorio \
  -v labdados:/var/lib/postgresql/data postgres:16-alpine
docker exec lab-postgres pg_isready -U postgres     # repita até "accepting connections"

# 3. API Python (sem -p: NÃO fica acessível de fora, só pela rede labnet)
docker run -d --name lab-fornecedores --network labnet --network-alias fornecedores \
  -e DB_HOST=postgres -e DB_PORT=5432 -e FLASK_HOST=0.0.0.0 labsystem-fornecedores:dev

# 4. Backend (publicado só em 127.0.0.1:3002, para você testá-lo direto)
docker run -d --name lab-backend --network labnet --network-alias backend \
  -e DB_HOST=postgres -e DB_PORT=5432 -e FORNECEDORES_HOST=fornecedores \
  -p 127.0.0.1:3002:3000 labsystem-backend:dev
curl localhost:3002/health        # {"status":"ok"}
curl localhost:3002/pronto        # {"status":"pronto"}  ← conseguiu falar com o banco

# 5. Frontend (a porta de entrada)
docker run -d --name lab-frontend --network labnet -p 3000:8080 labsystem-frontend:dev
```

Abra http://localhost:3000. Banco novo → o login inicial é **`admin@labsystem.com` / `admin123`** (criado automaticamente pelo backend).

### 2.1 Olhar dentro de cada container

| O que ver | Comando | O que você aprende |
|---|---|---|
| Arquivos do frontend | `docker exec lab-frontend ls /usr/share/nginx/html` | o HTML está **dentro** da imagem |
| Config do nginx | `docker exec lab-frontend cat /etc/nginx/conf.d/default.conf` | o proxy para `backend:3000` |
| Usuário do backend | `docker exec lab-backend whoami` | `app` — não roda como root |
| Código no backend | `docker exec lab-backend ls src` | o código copiado pelo `COPY src` |
| Tabelas do banco | `docker exec lab-postgres psql -U postgres -d laboratorio -c '\dt'` | categorias, clientes, estoque, fornecedores, produtos… |
| Um shell interativo | `docker exec -it lab-backend sh` (saia com `exit`) | "entrar" no container |
| Logs | `docker logs -f lab-backend` (Ctrl+C sai) | o `console.log` do Node |
| Consumo | `docker stats` (Ctrl+C sai) | CPU/RAM de cada container |
| Tudo sobre um container | `docker inspect lab-backend` | IP, variáveis, rede, volumes |
| Camadas da imagem | `docker history labsystem-backend:dev` | cada linha do Dockerfile vira uma camada |
| A rede | `docker network inspect labnet` | quem está conectado e com que IP |

Experimentos rápidos:

```bash
curl -I localhost:3000/               # veja o cabeçalho X-Frontend-Pod (= id do container)
docker stop lab-backend               # o frontend continua no ar...
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/me   # ...mas a API dá 502
docker start lab-backend              # volta — o nginx reencontra o backend pelo nome (resolver, Parte 1.3)
```

### 2.2 Limpar

```bash
docker rm -f lab-frontend lab-backend lab-fornecedores lab-postgres
docker network rm labnet
docker volume rm labdados             # apaga os dados do banco desta experiência
```

---

## Parte 3 — Os mesmos 4 containers com Docker Compose

Tudo da Parte 2 (rede, nomes, variáveis, volume, ordem de subida) está descrito **uma vez** em `docker-compose.yml`:

| Na mão (Parte 2) | No `docker-compose.yml` |
|---|---|
| `docker network create labnet` | rede criada sozinha |
| `--network-alias backend` | o nome do serviço (`backend:`) |
| `-e DB_HOST=postgres` | `environment:` |
| `-v labdados:/var/lib/...` | `volumes:` |
| "esperar o banco ficar pronto" | `depends_on: condition: service_healthy` |
| `docker build ...` | `build:` |

```bash
docker compose up --build -d      # constrói e sobe os 4
docker compose ps                 # estado e saúde ("healthy")
docker compose logs -f backend    # logs de um serviço
docker compose exec backend sh    # shell dentro do backend
docker compose exec postgres psql -U postgres -d laboratorio
docker compose up -d --build frontend   # reconstrói/reinicia SÓ o frontend
docker compose down               # derruba (o volume com os dados fica)
```

| URL | Container |
|---|---|
| http://localhost:3000 | frontend (entrada do sistema) |
| http://localhost:3002/health | backend direto, sem nginx (só desta máquina) |
| http://localhost:3001/health | fornecedores direto (só desta máquina, sem auth) |
| `localhost:5151` | Postgres (só desta máquina) |

> O volume do compose é o banco "antigo" do laboratório: lá o login é o do `CLAUDE.md` (`Alexaugusto2@gmail.com` / `admin123`).

---

## Parte 4 — Docker Hub

### 4.1 Preparar (uma vez)

1. Crie/entre na sua conta em https://hub.docker.com.
2. **Account settings → Personal access tokens → Generate new token**, permissão **Read & Write**. Copie o token (ele só aparece uma vez). Use o token, não a senha.
3. No terminal: `docker login` → usuário + **token**. (No Claude Code: `! docker login`.)

### 4.2 Publicar à mão

```bash
sh scripts/k8s/publicar-dockerhub.sh <seu-usuario>
```

O script faz, para cada serviço, o que você faria à mão:

```bash
docker build -f Dockerfile -t docker.io/<usuario>/labsystem-backend:<sha> .
docker push docker.io/<usuario>/labsystem-backend:<sha>
```

- **Tag = SHA curto do commit** (ex.: `a28dfec`): toda imagem fica ligada ao código exato que a gerou. Também publica `latest` ("a mais recente"), útil para testes — **produção nunca usa `latest`**, porque ele muda sem avisar.
- Veja em `https://hub.docker.com/u/<usuario>`: 3 repositórios, cada um com suas tags.
- O repositório deste projeto é público, então as imagens também são públicas (qualquer um pode `docker pull`). Nada de senha real dentro de imagem — por isso a senha vem de variável de ambiente.

### 4.3 Usar as imagens publicadas (sem código-fonte)

```bash
docker compose down        # libera a porta 3000
DOCKERHUB_USUARIO=<usuario> docker compose -f docker-compose.hub.yml up -d
DOCKERHUB_USUARIO=<usuario> TAG=<sha> docker compose -f docker-compose.hub.yml up -d  # versão exata
docker compose -f docker-compose.hub.yml down
```

`docker-compose.hub.yml` não tem `build:` — só `image:`. É assim que um colega, um servidor ou o Kubernetes usam o que a esteira publicou.

---

## Parte 5 — Kubernetes local (k3d)

### 5.1 Criar o cluster e fazer o deploy de dev

```bash
docker compose down                     # libera RAM (o cluster usa ~1,8 GB com Argo CD)
sh scripts/k8s/criar-cluster.sh         # 1 servidor + 2 agentes, ~1 min
sh scripts/k8s/dev-deploy.sh            # build → importa no cluster → apply → espera
```

Abra http://localhost:8081 → login `admin@labsystem.com` / `admin123`.

O `dev-deploy.sh` mostra o ciclo de um desenvolvedor: `docker build` → `k3d image import` (copia a imagem para os nós, dispensando Docker Hub em dev) → `kubectl apply -k k8s/overlays/dev` → `kubectl rollout restart`.

> **Na 1ª subida, backend e fornecedores reiniciam algumas vezes** (`RESTARTS 3-4`). Não é bug: o Kubernetes não tem `depends_on`. Eles subiram antes do Postgres, não acharam o banco, morreram e foram recriados até o banco ficar pronto — **auto-cura**. Lição: no mundo distribuído, cada serviço precisa tolerar dependências ainda indisponíveis.

### 5.2 Explorar o cluster

```bash
kubectl get nodes -o wide                         # as 3 "máquinas"
docker ps --filter name=k3d-labsystem             # ...que são containers Docker
kubectl get all -n labsystem-dev                  # pods, services, deployments, replicasets, hpa
kubectl get pods -n labsystem-dev -o wide         # em qual NÓ cada pod roda
kubectl describe pod -n labsystem-dev <pod>       # detalhes + eventos (por que falhou?)
kubectl logs -n labsystem-dev deploy/backend      # logs (de um dos pods)
kubectl logs -n labsystem-dev -l app=backend --prefix   # logs de TODOS os backends
kubectl exec -it -n labsystem-dev deploy/backend -- sh  # shell dentro de um pod
kubectl top pods -n labsystem-dev                 # CPU/RAM real
kubectl get hpa -n labsystem-dev                  # autoescala: uso/meta e réplicas
kubectl get pvc -n labsystem-dev                  # o disco do Postgres
kubectl get events -n labsystem-dev --sort-by=.lastTimestamp   # o "diário" do cluster
kubectl port-forward -n labsystem-dev svc/backend 3002:3000    # túnel até um Service interno
kubectl exec -n labsystem-dev postgres-0 -- psql -U postgres -d laboratorio -c '\dt'
```

### 5.3 Ver o load balancer distribuindo

```bash
curl -s -c /tmp/cj -H 'Content-Type: application/json' \
  -d '{"email":"admin@labsystem.com","senha":"admin123"}' localhost:8081/login
for i in $(seq 1 10); do
  curl -s -b /tmp/cj -D - -o /dev/null localhost:8081/clientes | grep -iE 'x-servido|x-frontend'
done
```

Resultado real: as respostas se alternam entre os 2 pods `frontend-…` e os 2 pods `backend-…`.

### 5.4 Ver a auto-cura

```bash
kubectl delete pod -n labsystem-dev -l app=backend --wait=false   # mata os backends
kubectl get pods -n labsystem-dev -w                              # novos surgem em segundos
```

Resultados medidos (requisições contínuas durante cada evento):

| Evento | Resultado | Por quê |
|---|---|---|
| Matar 1 pod do backend | **509 OK, 0 falhas** | o Service tira o pod do balanceamento e o Deployment cria outro |
| Rolling update dos 3 serviços | **1.571 OK, 0 falhas** | `maxUnavailable: 0` + readiness + `preStop` |
| `kubectl drain` (manutenção de um nó) | **2.828 OK, 0 falhas** | PodDisruptionBudget + `preStop` (sem o `preStop`: 294 falhas) |
| Desligar um nó inteiro (`docker stop k3d-labsystem-agent-1`) | ~45s de falhas, depois 100% | ver abaixo |

**Queda de um nó não é instantânea:** o Kubernetes só declara um nó `NotReady` depois de ~40s sem notícias dele (para não reagir a um soluço de rede), e até lá ainda manda tráfego para os pods mortos. Depois, os pods são recriados nos nós vivos (configuramos 30s em `tolerations`; o padrão é 5 min). Nesse teste também descobrimos que o **DNS do cluster (CoreDNS) tinha uma cópia só — justamente no nó desligado**: pods novos não conseguiam achar `backend` pelo nome (e o nginx, que na época resolvia o nome só na partida, nem subia). `criar-cluster.sh` agora sobe o CoreDNS com 2 cópias. Lição: alta disponibilidade vale também para a infraestrutura, não só para a sua aplicação.

Detalhes e roteiros desses testes: `docs/K8S_TESTE_DE_CARGA.md`, Parte 5.

### 5.5 Parar e voltar

```bash
sh scripts/k8s/destruir-cluster.sh        # só para (libera CPU/RAM; dados ficam)
sh scripts/k8s/criar-cluster.sh           # volta de onde parou
sh scripts/k8s/destruir-cluster.sh tudo   # apaga o cluster e todos os dados dele
```

---

## Parte 6 — Limitações conscientes deste laboratório

| Limitação | Por que está assim | Como seria em produção real |
|---|---|---|
| Redis/Mongo simulados na memória de cada pod | herança do projeto; mantém a simplicidade | Redis/Mongo como serviços próprios (ou gerenciados na nuvem) |
| Postgres com 1 réplica | escalar banco exige replicação | operador (ex.: CloudNativePG) ou banco gerenciado (RDS, Cloud SQL) |
| Secret com a senha no Git | senha de laboratório já pública no `CLAUDE.md` | Sealed Secrets / External Secrets / cofre da nuvem |
| Flask com servidor de desenvolvimento | simplicidade | gunicorn/uwsgi com vários workers |
| Cluster numa máquina só (3 nós = 3 containers) | custo zero | nós em máquinas/zonas diferentes na nuvem |
| HTTP sem TLS | ambiente local | Ingress + certificado (cert-manager / Let's Encrypt) |

---

## Referência rápida

| Quero… | Comando |
|---|---|
| Subir em containers (dev) | `docker compose up --build -d` |
| Criar/iniciar o cluster | `sh scripts/k8s/criar-cluster.sh` |
| Meu código no cluster (dev, :8081) | `sh scripts/k8s/dev-deploy.sh [frontend\|backend\|fornecedores]` |
| Painel ao vivo do cluster | `sh scripts/k8s/assistir.sh dev` |
| Publicar no Docker Hub | `sh scripts/k8s/publicar-dockerhub.sh <usuario>` |
| Instalar o Argo CD | `sh scripts/k8s/instalar-argocd.sh` |
| Teste de carga | `sh scripts/k8s/teste-carga.sh dev 60 4` |
| Parar o cluster | `sh scripts/k8s/destruir-cluster.sh` |
