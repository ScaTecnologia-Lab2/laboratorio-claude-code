# Do código à produção no Kubernetes — alterar cada container, CI/CD e ver produção

> **Pré-requisito:** `docs/CONTAINERS_K8S_GUIA.md` (o que é cada container, compose, Docker Hub e o cluster k3d).
> **O que você vai fazer:** baixar uma cópia, alterar **um** container de cada vez, testar localmente (compose e cluster dev), enviar pela esteira de CI/CD, aprovar o deploy e ver a nova versão rodando em produção.

---

## Parte 0 — O caminho de uma mudança

```
 1. DEV (sua máquina)                          2. GITHUB                         3. CLUSTER
 ───────────────────                           ─────────                         ─────────
 git clone / git pull
 branch do card ─► altera ─► testa:
   docker compose (:3000)
   cluster dev   (:8081)
        │ git push
        ▼
                                  PR ─► CI automático (ci.yml + docker-build.yml):
                                        lint · testes · build + scan Trivy das 3 imagens
                                  revisão de OUTRA conta (CODEOWNERS) ─► merge na main
                                        │
                                  Actions ▸ "Run workflow" (manual):
                                        publish ─► Docker Hub  <usuario>/labsystem-*:<sha>
                                        deploy-production ─► ⏸ aguarda APROVAÇÃO humana
                                        │ aprovado
                                        ▼
                                  branch `producao` ◄── grava a nova tag (<sha>)
                                                                  │  Argo CD observa
                                                                  ▼  (a cada ~3 min)
                                                         namespace labsystem (:8080)
                                                         rolling update, sem tempo fora do ar
```

Três ambientes, três propósitos:

| Ambiente | Onde | Quem coloca código lá | Para quê |
|---|---|---|---|
| compose | `localhost:3000` | você, `docker compose up --build` | desenvolver rápido |
| cluster **dev** | `localhost:8081` (namespace `labsystem-dev`) | você, `scripts/k8s/dev-deploy.sh` | ver o comportamento em Kubernetes (réplicas, balanceamento) |
| cluster **produção** | `localhost:8080` (namespace `labsystem`) | **só o Argo CD**, a partir do Git | o "oficial" — só muda por esteira + aprovação |

---

## Parte 1 — Pegar uma cópia do projeto

```bash
git clone git@github.com:ScaTecnologia-Lab2/laboratorio-claude-code.git
cd laboratorio-claude-code
docker compose up --build -d        # o sistema inteiro, idêntico ao de todo o time
```

Já tem a cópia? Atualize antes de começar qualquer card:

```bash
git switch main && git pull
docker compose up --build -d        # reconstrói com o código novo
```

**Vários devs na mesma máquina** (pastas `~/devs/dev1` e `~/devs/dev2`, cada uma com containers e portas próprias): `docs/SIMULANDO_2_DEVS.md`. A partir desta versão, cada `portas.env` também precisa de `BACKEND_PORT` (3012 / 3022) — já adicionado nas duas pastas desta máquina.

---

## Parte 2 — Alterar cada container separadamente

Regra de ouro: **reconstrua e reinicie só o que mudou.** O compose e o `dev-deploy.sh` aceitam o nome do serviço.

| Mudei… | Container | Testar no compose | Testar no cluster dev |
|---|---|---|---|
| `src/public/**` (HTML, CSS, JS do navegador) | `frontend` | `docker compose up -d --build frontend` | `sh scripts/k8s/dev-deploy.sh frontend` |
| `frontend/default.conf.template` (nginx) | `frontend` | idem | idem |
| `src/**/*.js` (exceto `public/`), `package.json` | `backend` | `docker compose up -d --build backend` | `sh scripts/k8s/dev-deploy.sh backend` |
| `src/fornecedores_api.py`, `requirements.txt` | `fornecedores` | `docker compose up -d --build fornecedores` | `sh scripts/k8s/dev-deploy.sh fornecedores` |
| versão do Postgres (`postgres:16-alpine`) | `postgres` | editar `docker-compose.yml` e `k8s/base/postgres.yaml` | `kubectl apply -k k8s/overlays/dev` |
| tabelas/colunas | — | o código cria (`CREATE TABLE IF NOT EXISTS` / `ALTER ... IF NOT EXISTS` no `inicializar()`) | idem |
| `k8s/**` (réplicas, limites, probes) | — | — | `kubectl apply -k k8s/overlays/dev` |

> **Atenção (banco):** o Postgres guarda **estado**. Trocar a versão *major* (16 → 17) não é só trocar a imagem — os arquivos de dados são incompatíveis e exigem `pg_dump`/`pg_restore`. Por isso ele fica fixo e muda com planejamento. Mudanças de **esquema** devem ser compatíveis com a versão anterior do código (adicionar coluna sim; renomear/remover, em duas etapas), porque durante o rolling update as duas versões rodam juntas.

### 2.1 Exemplo guiado: frontend

```bash
git switch -c feat/titulo-landing
# edite src/public/index.html (ex.: o texto do título)
docker compose up -d --build frontend          # só o nginx é reconstruído (~5s)
# abra http://localhost:3000 e confira (Ctrl+F5)
sh scripts/k8s/dev-deploy.sh frontend          # agora no cluster dev
# abra http://localhost:8081
```

Repare: backend, fornecedores e banco **nem reiniciaram**. Esse é o ganho de separar os containers.

### 2.2 Exemplo guiado: backend

```bash
# edite um arquivo de src/routes/ (ex.: uma mensagem de erro)
docker compose up -d --build backend
curl -s localhost:3002/health                  # backend direto, sem passar pelo nginx
npm run lint && npm run test:unit
sh scripts/k8s/dev-deploy.sh backend
kubectl get pods -n labsystem-dev -l app=backend -w   # veja o rolling update (Ctrl+C sai)
```

> ⚠️ `npm run test:integration` (`src/usuarios.test.js`) faz **`TRUNCATE` na tabela `usuarios`**. Nunca rode contra o Postgres do compose (5151) — use um descartável:
> `docker run --rm -d --name pg-teste -p 127.0.0.1:5199:5432 -e POSTGRES_PASSWORD=5151 postgres:16-alpine`, depois `DB_PORT=5199 npm run test:integration` e `docker rm -f pg-teste`.

### 2.3 Exemplo guiado: fornecedores (Python)

```bash
# edite src/fornecedores_api.py
docker compose up -d --build fornecedores
curl -s localhost:3001/health                  # {"servido_por": "...", "status": "ok"}
docker run --rm -v "$PWD":/w -w /w python:3.13-slim sh -c \
  "pip install -q -r requirements.txt -r requirements-dev.txt && flake8 src/ tests/ --config=.flake8 && pytest tests/ -q"
sh scripts/k8s/dev-deploy.sh fornecedores
```

### 2.4 Por que o `dev-deploy.sh` faz `rollout restart`?

A imagem de dev sempre se chama `labsystem-backend:dev`. Para o Kubernetes, "mesmo nome = mesma coisa", então um `apply` não mudaria nada. O `rollout restart` força pods novos, que pegam a imagem recém-importada. **Em produção é diferente:** cada versão tem uma tag única (o SHA do commit), então trocar a tag no Git **é** o deploy. Esse é o motivo de produção nunca usar `latest` nem `dev`.

---

## Parte 3 — Enviar a mudança (PR e CI)

```bash
git add -A && git commit -m "feat(landing): novo título"
git push -u origin feat/titulo-landing
gh pr create --fill                 # ou pelo site do GitHub
```

No PR, rodam **automaticamente**:

| Workflow | Jobs | Barra o merge se… |
|---|---|---|
| `ci.yml` | ESLint, Flake8, testes Node (unit + integração com Postgres descartável), pytest, scan de segurança | qualquer um falhar |
| `docker-build.yml` | build das 3 imagens + **scan Trivy** de cada uma | alguma imagem tiver CVE CRITICAL/HIGH com correção disponível |

Depois: **revisão por outra conta** (ninguém aprova o próprio PR; ver `docs/SIMULANDO_2_DEVS.md`), e merge. **O merge não muda a produção** — só a `main`.

---

## Parte 4 — Configurar a entrega (uma vez só)

### 4.1 Docker Hub ↔ GitHub

1. Docker Hub → **Account settings → Personal access tokens → Generate new token** (Read & Write). Copie.
2. GitHub → repositório → **Settings → Secrets and variables → Actions**:
   - aba **Secrets** → *New repository secret*: `DOCKERHUB_TOKEN` = o token.
   - aba **Variables** → *New repository variable*: `DOCKERHUB_USERNAME` = seu usuário.

Nunca cole o token no chat, num arquivo ou num commit. O workflow lê `${{ secrets.DOCKERHUB_TOKEN }}`, e o GitHub o esconde nos logs.

> O usuário **não** precisa ser editado em `k8s/overlays/producao/kustomization.yaml`: o job de deploy troca `SEU_USUARIO_DOCKERHUB` pelo valor da variável ao gravar a branch `producao`.

### 4.2 Argo CD no cluster

```bash
sh scripts/k8s/criar-cluster.sh        # se o cluster não estiver de pé
sh scripts/k8s/instalar-argocd.sh      # ~2 min; mostra a senha do admin no final
```

Até o primeiro deploy, a aplicação `labsystem-producao` fica com o aviso `unable to resolve 'producao' to a commit SHA` — normal: a branch `producao` ainda não existe. O próprio primeiro deploy a cria.

### 4.3 O que já estava pronto

- Environment **`production`** com *required reviewer* (Settings → Environments). É ele que pausa o deploy até alguém aprovar.
- Ruleset da `main` (PR obrigatório + checks + code owners).

---

## Parte 5 — Levar para produção

1. GitHub → **Actions → Docker Build, Scan & Deploy → Run workflow**, branch `main`.
2. Marque **"Publicar as 3 imagens no Docker Hub"** e **"Deploy em produção"** → *Run workflow*.
3. O run faz build → scan → publish. O job **"Deploy em produção (requer aprovação)"** para em **Waiting**: um revisor do Environment `production` clica **Review deployments → production → Approve and deploy**.
4. O job grava em `k8s/overlays/producao/kustomization.yaml` a tag `<sha>` e o seu usuário, e faz push na branch **`producao`**. O resumo do run mostra a versão gravada.
5. O Argo CD percebe em até ~3 minutos (ou clique **Refresh** no painel) e aplica. Os Deployments trocam os pods um a um (`maxUnavailable: 0`), sem tempo fora do ar.

Acompanhe no terminal:

```bash
kubectl get pods -n labsystem -w                       # pods novos chegando, antigos saindo
kubectl rollout status deploy/backend -n labsystem
kubectl get application -n argocd labsystem-producao   # SYNC STATUS / HEALTH STATUS
```

### Por que GitOps (e não o GitHub rodando `kubectl`)?

- O GitHub está na internet e o cluster está na sua máquina. O GitHub **não alcança** o cluster, e não deve: abrir o cluster para a internet, ou deixar a credencial dele num secret do GitHub, é um risco grande. No GitOps, **o cluster puxa** do Git.
- **O Git é a verdade:** o que roda em produção é exatamente o que está na branch `producao`. `git log origin/producao` é o histórico de deploys (quem, quando, qual versão).
- **Auto-correção (`selfHeal`):** se alguém alterar algo à mão no cluster, o Argo desfaz. Teste:
  ```bash
  kubectl delete service frontend -n labsystem     # "acidente"
  kubectl get application -n argocd labsystem-producao -w    # OutOfSync → Synced: o Argo recria
  ```

---

## Parte 6 — Ver os ambientes em produção

| O quê | Onde |
|---|---|
| O sistema | http://localhost:8080 (banco novo: `admin@labsystem.com` / `admin123`) |
| Painel do Argo CD | `sh scripts/k8s/painel-argocd.sh` → https://localhost:8443 (usuário `admin`; o certificado autoassinado gera aviso no navegador) |
| Versão que está rodando | `kubectl get deploy -n labsystem -o jsonpath='{range .items[*]}{.metadata.name}: {.spec.template.spec.containers[0].image}{"\n"}{end}'` |
| Histórico de deploys | `git fetch && git log --oneline origin/producao` · GitHub → aba **Actions** · Environments → **production** |
| Imagens publicadas | `https://hub.docker.com/u/<usuario>` |
| Pods, nós, autoescala, CPU | `sh scripts/k8s/assistir.sh producao` |
| Logs da produção | `kubectl logs -n labsystem -l app=backend --prefix --tail=50` |
| Qual cópia atendeu | `curl -sI localhost:8080/ \| grep X-Frontend-Pod` |

**No painel do Argo CD:** clique em `labsystem-producao` e veja a árvore Application → Deployments → ReplicaSets → Pods, com a saúde de cada um. **History and rollback** mostra cada sincronização com o commit correspondente. **App diff** mostra a diferença entre o Git e o cluster.

---

## Parte 7 — Deu errado? Rollback

| Situação | O que fazer |
|---|---|
| Versão nova com bug | GitHub → Actions → abra o **run do deploy anterior** (o que estava bom) → **Re-run all jobs**. Ele grava de volta a tag daquele commit (pedindo aprovação de novo) e o Argo aplica. |
| Pod novo não fica pronto | Nada a fazer na hora: com `maxUnavailable: 0`, os pods antigos **continuam atendendo** até os novos passarem na readiness. Investigue: `kubectl describe pod -n labsystem <pod>` e `kubectl logs ...` |
| Imagem não baixa (`ImagePullBackOff`) | Confira a variável `DOCKERHUB_USERNAME` e se a tag existe no Docker Hub. |
| Argo `OutOfSync` sem sincronizar | Painel → **Refresh** / **Sync**; veja a mensagem em *Conditions*. |

Desfazer pelo próprio Git também funciona (`git revert` na `producao`), mas o "Re-run" mantém o padrão: **toda mudança em produção passa pela esteira e pela aprovação**.

---

## Parte 8 — Vários desenvolvedores ao mesmo tempo

- **Cada dev tem os próprios containers** (compose com portas próprias): ninguém derruba o ambiente do outro. Ver `docs/SIMULANDO_2_DEVS.md`.
- **Cada card em uma branch, cada branch em um PR**: o CI testa cada mudança isolada; conflitos aparecem no PR, não em produção (exercício: `docs/EXERCICIO_MULTIPLOS_DEVS.md`).
- **O cluster dev é compartilhado** neste laboratório (namespace `labsystem-dev`): o último `dev-deploy.sh` vence. Times maiores usam *preview environments* — um namespace temporário por PR, criado e destruído pela esteira.
- **Produção só muda por esteira + aprovação**, independentemente de quantos devs existam. Dois deploys seguidos? O último gravado na `producao` é o que vale, e o histórico mostra os dois.

---

## Resolução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `502 Bad Gateway` no navegador | backend fora do ar ou iniciando | `docker compose ps` / `kubectl get pods -n <ns>`; logs do backend |
| Mudança não aparece | container antigo rodando | `--build` no compose; `dev-deploy.sh <serviço>` no cluster; Ctrl+F5 |
| `bind: address already in use` | compose e outra cópia na mesma porta | `docker compose down` na outra pasta, ou portas próprias (`portas.env`) |
| Pods `Pending` | falta CPU/RAM no cluster | `kubectl describe pod` → *Events*; pare o compose; `kubectl top nodes` |
| `CrashLoopBackOff` na 1ª subida | o banco ainda não estava pronto | aguarde (auto-cura); se persistir, `kubectl logs --previous` |
| Login falha no cluster | o banco do cluster é novo | use `admin@labsystem.com` / `admin123` |
