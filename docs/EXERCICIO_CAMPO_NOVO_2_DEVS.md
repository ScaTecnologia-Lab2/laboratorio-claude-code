# Exercício: dois devs, um campo novo cada, do backend ao front — sem conflito

> Pré-requisito: `docs/SIMULANDO_2_DEVS.md` (pastas `~/devs/dev1` e `~/devs/dev2`, contas, portas). Para o conflito de merge "de propósito", veja `docs/EXERCICIO_MULTIPLOS_DEVS.md`. Deploy e rollback: `docs/FABRICA_DE_SOFTWARE.md`.

## 1. O cenário

| | Dev 1 (sca-dev1) | Dev 2 (sca-dev2) |
|---|---|---|
| Cadastro | Clientes | Fornecedores |
| Campo novo | `observacoes` (texto livre) | `site` (endereço do site) |
| Onde roda | http://localhost:3010 | http://localhost:3020 |
| Backend | Node: `src/clientes.js` | Python: `src/fornecedores_api.py` |
| Frontend | `clientes.html` + `js/clientes.js` | `fornecedores.html` + `js/fornecedores.js` |

Duas fases, cada uma com **um PR por dev** (quatro PRs no total):

1. **Backend** — o campo existe no banco e na API.
2. **Frontend** — o formulário e a lista mostram o campo.

> Por que dois PRs e não um? PR pequeno é revisado mais rápido, o CI aponta o erro mais perto da causa e a chance de conflito cai. O front só funciona depois que o backend da fase 1 está na `main`.

**Desafio:** os dois mexem na "mesma funcionalidade" (cadastro + tela), mas em arquivos diferentes. Se cada um ficar no seu domínio, não há conflito. Os pontos de atrito reais estão na seção 7.

## 2. Preparação (uma vez por dev)

Siga `docs/SIMULANDO_2_DEVS.md`, seção 3.1 (atualizar a pasta, `down --remove-orphans`, `up --build -d`, `npm ci`). Confira antes de qualquer commit:

```bash
cd ~/devs/dev2/laboratorio-claude-code        # (ou dev1)
git config user.name && git config user.email && git branch --show-current
docker compose --env-file portas.env ps       # frontend, backend, fornecedores, postgres: Up
```

RAM: pare o cluster k3d ou o Compose principal antes de subir os dois stacks (`sh scripts/k8s/destruir-cluster.sh` / `docker compose down`).

Janelas do navegador: uma logada como **sca-dev1** e outra (anônima) como **sca-dev2**. Login nos sistemas dos devs: `admin@labsystem.com` / `admin123`.

## 3. Os cards (quem organiza o board)

Crie 4 issues com o template *Tarefa* e coloque no board (https://github.com/orgs/ScaTecnologia-Lab2/projects/1):

| Card | Responsável | Critério de aceite |
|---|---|---|
| Backend: campo `observacoes` em clientes | Dev 1 | `POST`/`PUT`/`GET /clientes` aceitam e devolvem `observacoes`; banco existente não quebra |
| Backend: campo `site` em fornecedores | Dev 2 | idem para `/fornecedores` e `site` |
| Front: `observacoes` na tela de clientes | Dev 1 | digitar, salvar, editar e ver na lista |
| Front: `site` na tela de fornecedores | Dev 2 | idem |

## 4. Fase 1 — Backend (os dois ao mesmo tempo)

Cada dev: assume o card (*Assignees*), move para *Em Progresso* e usa *Development → Create a branch*. Depois, **na pasta dele**:

```bash
git fetch origin && git checkout <branch-do-card>
```

### 4.1 Dev 1 — `observacoes` em Clientes (`src/clientes.js`)

Há **três** lugares, e o segundo é a armadilha:

1. `CAMPOS`: acrescente `'observacoes'` (usado pelo `atualizar`).
2. `criar()` tem as colunas e os `$1..$7` **escritos à mão**, fora do `CAMPOS`. Acrescente `observacoes` e o `$8`:
   `'INSERT INTO clientes (nome, endereco, bairro, cidade, estado, email, telefone, observacoes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *'`.
   Se esquecer, o campo é aceito no `PUT` mas **some no `POST`** — sem erro nenhum.
3. `inicializar()`: **depois** do `CREATE TABLE IF NOT EXISTS`, acrescente
   `await pool.query('ALTER TABLE clientes ADD COLUMN IF NOT EXISTS observacoes TEXT');`
   (mesmo padrão que `src/usuarios.js` usa para `senha` e `role`).

> **Por que o `ALTER TABLE`?** `CREATE TABLE IF NOT EXISTS` não faz nada se a tabela já existe. No banco do seu stack, no `labsystem-dev` e na produção (todos com dados) a coluna nunca seria criada, e o `INSERT` falharia com `column "observacoes" does not exist`. O `ADD COLUMN IF NOT EXISTS` é idempotente: roda a cada subida e só age na primeira.

Documente também o campo no schema de `Cliente` em `src/public/swagger.json`.

### 4.2 Dev 2 — `site` em Fornecedores (`src/fornecedores_api.py`)

1. `CAMPOS`: acrescente `'site'` (o `INSERT` e o `UPDATE` são montados a partir dele, então não há query para editar à mão).
2. `init_db()`: **depois** do `CREATE TABLE`, no mesmo bloco `cur`:
   `cur.execute("ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS site TEXT")` (o motivo é o mesmo do 4.1).
3. Schema de `Fornecedor` em `src/public/swagger.json`.
4. Se quiser, um teste em `tests/test_fornecedores_api.py`.

### 4.3 Testar (cada um no seu stack)

```bash
docker compose --env-file portas.env up --build -d
```

Sem tela ainda, teste pela API (Swagger do seu stack: `http://localhost:3010/api-docs` ou `:3020/api-docs`, faça `POST /login` e use *Try it out*), ou pelo terminal:

```bash
# login e cookie (troque 3020 por 3010 no Dev 1)
curl -s -c /tmp/c.txt -H 'Content-Type: application/json' \
  -d '{"email":"admin@labsystem.com","senha":"admin123"}' http://localhost:3020/login
curl -s -b /tmp/c.txt -H 'Content-Type: application/json' \
  -d '{"nomeempresa":"Acme","site":"https://acme.example"}' http://localhost:3020/fornecedores
curl -s -b /tmp/c.txt http://localhost:3020/fornecedores     # o campo "site" aparece
```

Dev 1: o mesmo contra `/clientes` com `{"nome":"Ana","observacoes":"VIP"}`. Teste os dois caminhos, **criar e editar** (`PUT`).

Teste também o **banco antigo**: rode `up --build -d` de novo sem apagar o banco. O sistema tem que subir normalmente (o `ALTER` é idempotente) e os registros antigos aparecem com o campo vazio.

Qualidade local antes do commit:

```bash
npm run lint                                         # Dev 1 e Dev 2
flake8 src/ tests/ --config=.flake8 && pytest tests/ -v   # Dev 2 (Python)
```

### 4.4 Subir o PR de backend

```bash
git add src/clientes.js src/public/swagger.json       # Dev 1  (Dev 2: src/fornecedores_api.py + swagger.json)
git commit -m "feat(clientes): campo observacoes"     # Dev 2: "feat(fornecedores): campo site"
git push
gh auth switch -u sca-dev1                            # sca-dev2 para o Dev 2
gh pr create --title "feat(clientes): campo observacoes" --body "Resolve #<card>"
```

Adicione **só os arquivos do seu domínio** (nada de `git add .`): é a regra mais importante contra conflito.

## 5. O que o CI/CD faz com os dois PRs

Ao abrir cada PR, o GitHub roda sozinho (e de novo a cada push):

| Workflow | Checks (obrigatórios para o merge) |
|---|---|
| `ci.yml` | Lint (ESLint), Lint (Flake8), testes unitários Node, testes unitários Python, testes de integração (Postgres descartável **do runner**, não o seu), scan de segurança (npm audit, pip-audit, Bandit) |
| `docker-build.yml` | build das 3 imagens (backend, python, frontend) + scan Trivy |

Os dois PRs rodam **em paralelo e independentes**: cada um é testado como "a `main` + a sua mudança". Isso importa: o CI do Dev 1 **não vê** a mudança do Dev 2 e vice-versa. Se as duas mudanças se atrapalhassem, só apareceria depois do primeiro merge (por isso o passo 6).

Para acompanhar: `gh pr checks <n> --watch` ou a aba *Checks* do PR. Falhou? Leia o log do job que ficou vermelho, corrija no seu stack, faça novo commit e `git push`.

## 6. Revisão, merge e a "corrida" entre os dois PRs

1. **Revisão cruzada.** Ninguém aprova o próprio PR: o Dev 2 aprova o do Dev 1 e vice-versa (aba *Files changed* → *Review changes* → *Approve*, ou `gh auth switch -u sca-dev2 && gh pr review <n> --approve`). Ao revisar, confira se o PR mexeu só no domínio dele e se tem o `ALTER TABLE`.
2. **O primeiro merge** (digamos, o do Dev 1) entra sem surpresa. A issue fecha e o card vai para *Concluído*.
3. **O segundo PR fica "desatualizado"** (a `main` andou). O ruleset **não obriga** a atualizar a branch (`strict_required_status_checks_policy: false`): o GitHub deixaria mesclar assim mesmo, mas o CI nunca teria testado "main + Dev 1 + Dev 2" juntos. Por isso, **por disciplina**, o Dev 2 atualiza antes, na pasta dele:
   ```bash
   git fetch origin
   git rebase origin/main         # sem conflito se cada um ficou no seu domínio
   git push --force-with-lease    # o CI roda de novo, agora "main + Dev 1 + Dev 2"
   ```
4. **CI verde de novo → merge do segundo PR.** Aqui o CI testa a combinação real.
5. **Deploy é outra etapa**, manual e com aprovação (`docs/FABRICA_DE_SOFTWARE.md`): *Actions → Run workflow* (publish + deploy) → aprovar o Environment `production` → commit novo na branch `producao` → o Argo CD aplica no cluster. Os dois campos vão **juntos** num deploy só, e o `ALTER TABLE` roda sozinho quando os pods novos sobem.

## 7. Fase 2 — Frontend (só depois dos dois PRs de backend na `main`)

Cada dev **atualiza a pasta e cria a branch do card de front**:

```bash
git checkout main && git pull
git fetch origin && git checkout <branch-do-card-de-front>
docker compose --env-file portas.env up --build -d    # backend novo + banco já com a coluna
```

### 7.1 Dev 1 — `observacoes` na tela de Clientes

| Arquivo | O que mudar |
|---|---|
| `src/public/clientes.html` | um novo `<div>` com `<label for="observacoes">` e `<textarea id="observacoes">` dentro do formulário (siga o padrão dos campos vizinhos) |
| `src/public/js/clientes.js` → `salvar()` | acrescentar `observacoes: document.getElementById('observacoes').value.trim()` no objeto `body` |
| `clientes.js` → `editar()` | `document.getElementById('observacoes').value = c.observacoes \|\| '';` (junto dos outros campos) |
| `clientes.js` → `cancelarEdicao()` | acrescentar `'observacoes'` na lista de ids que são limpos |
| `clientes.js` → `renderizar()` | opcional: mostrar na lista (se mostrar, use `escHtml(...)`, **sempre**) |

### 7.2 Dev 2 — `site` na tela de Fornecedores

Mesma ideia, nos arquivos de fornecedores: `fornecedores.html` (`<input type="url" id="site">`), `js/fornecedores.js` → `salvar()`, `editar()`, `cancelarEdicao()` (lista de ids) e, se quiser, `renderizar()` (com `escHtml`).

Teste: `up --build -d`, Ctrl+F5, crie e edite um registro e confira que o campo volta preenchido. Teste também a tela com um registro **antigo** (campo vazio deve mostrar vazio, não `null` nem `undefined`).

Depois: lint, commit **só dos seus arquivos**, `git push`, PR com `Resolve #<card>`, revisão cruzada, merge. Mesma corrida do passo 6.

### Onde um conflito pode aparecer, mesmo em arquivos separados

| Arquivo | Quando acontece | O que fazer |
|---|---|---|
| `src/public/swagger.json` | os dois editam; se os trechos (`/clientes` ~linha 458, `/fornecedores` ~277) ficarem longe, o Git junta sozinho; se ficarem colados, conflita | no `git rebase origin/main`, abra o arquivo, mantenha as **duas** mudanças, `git add` e `git rebase --continue` (passos 5 a 7 de `EXERCICIO_MULTIPLOS_DEVS.md`) |
| `DOCS.md`, `docs/*.md` | os dois documentam o campo | idem: mantenha as duas |
| Um arquivo compartilhado (ex.: `src/public/css/styles.css`, menu) | alguém "aproveita" para mexer | evite; se precisar, PR separado e pequeno |
| `package-lock.json` | alguém roda `npm install` sem necessidade | use `npm ci` (não altera o lock) |

**Se quiser forçar o conflito para treinar:** os dois editam a mesma linha do mesmo arquivo (por exemplo, o título da página em `src/public/index.html`) e abrem PR. O segundo a mesclar leva o conflito no `rebase`.

## 8. Limpeza

```bash
git checkout main && git pull
git branch -d <branch-do-card> && git fetch --prune
docker compose --env-file portas.env down        # (ou "down -v" para zerar o banco do dev)
```

## 9. Resumo do fluxo (para colar na parede)

```
card → branch → mudar só o seu domínio → up --build -d → testar (API e tela, banco novo e antigo)
     → lint/testes locais → commit (só seus arquivos) → push → PR "Resolve #n"
     → CI (8 checks) → revisão cruzada → merge (1º)
     → 2º PR: fetch + rebase + push --force-with-lease → CI → merge
     → (manual) deploy com aprovação → Argo CD → produção
```
