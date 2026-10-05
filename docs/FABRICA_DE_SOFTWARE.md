# Fábrica de software — do card à produção, passo a passo

> **Para quem é:** para você, que faz os papéis de **gerente** (cria os cards), **aprovador** (revisa e libera para produção) e dos **dois devs** (fazem o trabalho). Cada passo diz **quem** faz, **o que** faz, **por que** faz e **como** faz: pela tela do GitHub (navegador) e pela linha de comando (CLI).
>
> **Exemplo usado do começo ao fim:** o card **#37 — Buscar cliente por nome, cidade ou e-mail na lista**, do **Dev 1**. Siga o guia com ele e você terá passado por uma entrega completa.
>
> Guias complementares: `docs/SIMULANDO_2_DEVS.md` (pastas e portas dos devs), `docs/BACKLOG_KANBAN.md` (board), `docs/COLABORACAO_EQUIPE.md` (regras do time) e `docs/EXERCICIO_MULTIPLOS_DEVS.md` (conflito de merge).

---

## Sumário

- **Parte A — Entendendo a fábrica**
  - A1. A analogia da fábrica
  - A2. Glossário: card, branch, commit, Pull Request, CI, merge, container...
  - A3. Quem é quem (papéis e contas)
  - A4. Os ambientes desta máquina (devs e produção)
  - A5. O mapa do fluxo completo
- **Parte B — A linha de produção, etapa por etapa**
  - Etapa 1. Gerente cria o card
  - Etapa 2. Dev aceita o card
  - Etapa 3. Dev cria a branch
  - Etapa 4. Dev sobe o ambiente dele (containers)
  - Etapa 5. Dev programa e testa
  - Etapa 6. Dev faz o commit e o push
  - Etapa 7. Dev abre o Pull Request
  - Etapa 8. O CI confere o trabalho
  - Etapa 9. O revisor analisa e aprova
  - Etapa 10. Dev corrige o que o revisor pediu
  - Etapa 11. Dev atualiza a branch (quando a `main` andou)
  - Etapa 12. Merge: o código entra na `main`
  - Etapa 13. Todo mundo atualiza as pastas e os containers
  - Etapa 14. Gerente marca a versão (tag)
  - Etapa 15. Deploy em produção (com aprovação)
  - Etapa 16. Rollback: voltar para a versão anterior
- **Parte C — Operação**
  - C1. Containers: levantar, atualizar, parar (devs e produção)
  - C2. Banco de dados: acessar, backup, restaurar, zerar
  - C3. Bug urgente em produção (hotfix)
  - C4. Checklists: "pronto para começar" e "pronto de verdade"
  - C5. Problemas comuns
  - C6. Cola rápida por papel

---

# Parte A — Entendendo a fábrica

## A1. A analogia da fábrica

Pense numa fábrica de móveis:

| Na fábrica de móveis | Na fábrica de software | Onde fica aqui |
|---|---|---|
| A **ordem de produção** pendurada no quadro | O **card** (issue) | GitHub → Issues |
| O **quadro** com as colunas "a fazer / fazendo / pronto" | O **board Kanban** | GitHub → Projects |
| A **bancada** de cada marceneiro | A **branch** de cada dev | Git |
| O **molde aprovado** de onde saem todos os móveis | A branch **`main`** | Git / GitHub |
| A **máquina de inspeção** que mede tudo automaticamente | O **CI** (testes automáticos) | GitHub Actions |
| O **inspetor de qualidade** humano | O **revisor** do Pull Request | GitHub → Pull requests |
| O **pedido de inspeção** ("terminei, pode conferir?") | O **Pull Request** | GitHub → Pull requests |
| A **loja**, onde o cliente usa o móvel | **Produção** | Aqui: http://localhost:3000 |
| A **nota de lote** ("lote 1.2.0 saiu dia tal") | A **tag** de versão | Git / GitHub → Releases |

A regra mais importante da fábrica: **ninguém mexe direto no molde (`main`)**. Todo trabalho é feito numa bancada separada (branch), passa pela inspeção automática (CI) e pela inspeção humana (revisão), e só então entra no molde (merge). Só o que está no molde vai para a loja (produção).

## A2. Glossário

### O que é um card (issue)

É a **ordem de serviço** de uma tarefa. No GitHub ela se chama **issue** e tem um número (`#37`). Um bom card responde a três perguntas:

1. **Qual é o problema?** (contexto)
2. **Como saber que ficou pronto?** (critérios de aceite, uma lista que dá para conferir item por item)
3. **Onde mexer?** (área afetada)

O card é também o **registro histórico**: daqui a um ano, quem perguntar "por que a tela de clientes tem uma busca?" encontra a resposta nele, com o PR e o código ligados a ele.

Cada card vive no **board** e anda pelas colunas:

```
Backlog  →  To Do  →  Em Progresso  →  Em Revisão  →  Concluído
(ideia)    (priorizado)  (alguém pegou)   (PR aberto)    (está na main)
```

### O que é um repositório

A **pasta do projeto com toda a sua história**. Cada alteração já feita fica guardada, com autor, data e motivo. Existe uma cópia central no GitHub (`ScaTecnologia-Lab2/laboratorio-claude-code`) e cada dev tem uma cópia no próprio computador (o **clone**).

### O que é uma branch

É uma **linha de trabalho paralela**. Imagine que a `main` é o documento oficial. Criar uma branch é tirar uma **cópia de trabalho** desse documento, em que você pode escrever à vontade sem afetar o oficial nem o trabalho dos colegas.

```
main:        A───B───C───────────────M        (M = merge: a branch entra na main)
                      \             /
branch #37:            D───E───F───           (commits do Dev 1)
```

- Cada card ganha **a sua própria branch** (ex.: `37-buscar-cliente-por-nome-cidade-ou-e-mail`).
- Branches são **curtas**: nascem com o card e morrem depois do merge.
- Enquanto o Dev 1 trabalha na branch do #37, o Dev 2 trabalha em outra branch. Um não vê as mudanças do outro até o merge.

### O que é um commit

Uma **foto** das alterações num momento, com uma mensagem explicando o que mudou. Uma branch é uma sequência de commits. Mensagens seguem o padrão `tipo(área): descrição`:

| Tipo | Quando usar | Exemplo |
|---|---|---|
| `feat` | funcionalidade nova | `feat(clientes): busca por nome, cidade ou e-mail` |
| `fix` | correção de bug | `fix(login): mensagem de erro com senha vazia` |
| `docs` | só documentação | `docs(status): registra o card #37` |
| `chore` | manutenção (dependências, configuração) | `chore(deps): atualiza pg para 8.14` |
| `refactor` | reorganiza código sem mudar o comportamento | `refactor(clientes): extrai renderizar()` |

### O que é push e pull

- **push** = enviar os commits da sua pasta **para o GitHub**.
- **pull** = trazer os commits novos **do GitHub para a sua pasta**.
- **fetch** = só *olhar* o que há de novo no GitHub, sem mexer nos seus arquivos.

### O que é um Pull Request (PR)

É o **pedido formal** de "terminei minha branch, por favor confiram e coloquem na `main`". O nome vem de "puxe (pull) as minhas alterações". Num PR:

- aparecem **todas as linhas alteradas** (aba *Files changed*);
- o **CI roda sozinho** e mostra se os testes passaram;
- o **revisor** comenta, pede mudanças ou aprova;
- quando tudo está verde **e** aprovado, alguém clica em **Merge**.

O PR é o **portão de qualidade** da fábrica. Neste repositório o GitHub **não deixa** colocar nada na `main` sem PR, sem CI verde e sem a aprovação de **outra** pessoa.

### O que é CI (Integração Contínua)

Robôs do GitHub (**GitHub Actions**) que, a cada push e a cada PR, rodam o lint, os testes e os scans de segurança. É a máquina de inspeção automática: ela não se cansa, não esquece e não aprova "por amizade". Os arquivos que definem esses robôs ficam em `.github/workflows/`.

### O que é merge

**Juntar** a branch na `main`. Depois do merge, o trabalho do card faz parte do produto oficial.

### O que é rebase

**Reaplicar** os seus commits em cima da versão mais nova da `main`. Serve para quando a `main` andou (outro dev fez merge) enquanto você trabalhava. É como atualizar a sua cópia de trabalho com as mudanças do documento oficial, sem perder o que você escreveu.

### O que é conflito de merge

Quando **duas pessoas mudaram as mesmas linhas** do mesmo arquivo, o Git não sabe qual versão manter e pergunta a você. Não é erro de ninguém; é uma decisão que só um humano pode tomar. Passo a passo com exemplo real: `docs/EXERCICIO_MULTIPLOS_DEVS.md`.

### O que são imagem, container e volume (Docker)

| Termo | Analogia | Neste projeto |
|---|---|---|
| **Imagem** | A **receita congelada** do sistema: código + Node/Python + tudo que ele precisa | Gerada pelo `Dockerfile` e pelo `Dockerfile.python` |
| **Container** | O **prato servido**: a imagem rodando de verdade | `node`, `fornecedores`, `postgres` |
| **Volume** | A **despensa**: onde os dados ficam guardados, mesmo se o container for jogado fora | O banco de dados (`..._labsystem_postgres_data`) |
| **Compose** | O **cardápio** que diz quais containers sobem juntos e como se conectam | `docker-compose.yml` |

Ponto crucial: **o container leva uma cópia do código de quando a imagem foi construída.** Se você mudar o código (ou fizer `git pull`), o container continua com a versão antiga até você reconstruir com `up --build`.

### O que são ambientes

Cópias do sistema rodando para finalidades diferentes:

- **Desenvolvimento (dev):** onde cada dev testa o que está fazendo. Pode quebrar à vontade. Banco com dados de teste.
- **Produção:** onde o "cliente" usa o sistema. **Só roda o que está na `main`** e passou por tudo. Banco com dados reais.

### O que é deploy, tag e rollback

- **Deploy:** colocar uma versão nova em produção.
- **Tag (versão):** uma etiqueta permanente num commit (`v1.1.0`). Serve para saber **exatamente** o que está em produção e para onde voltar se der problema.
- **Rollback:** voltar produção para a versão anterior quando a nova deu problema.

## A3. Quem é quem

| Papel | Quem faz aqui | Conta no GitHub | O que faz |
|---|---|---|---|
| **Gerente / Product Owner** | Você | **ScaTecnologia** | Cria e prioriza os cards, decide o que vai para produção, marca versões |
| **Dev 1** | Você, na pasta do Dev 1 | **sca-dev1** | Aceita cards, programa, abre PRs, revisa PRs do Dev 2 |
| **Dev 2** | Você, na pasta do Dev 2 | **sca-dev2** | Aceita cards, programa, abre PRs, revisa PRs do Dev 1 |
| **Revisor** | Qualquer conta que **não** seja a autora do PR | sca-dev1, sca-dev2 ou ScaTecnologia | Lê o código, pede mudanças ou aprova |
| **Aprovador de deploy** | Você | **ScaTecnologia** (único revisor do Environment `production`) | Libera a publicação em produção |

**Regra de ouro:** ninguém aprova o próprio trabalho. O GitHub bloqueia isso; e, se você usar o Claude Code, ele também se recusa a aprovar um PR que ele mesmo escreveu. A aprovação é sempre de um humano diferente de quem fez.

### Como "virar" cada papel nesta máquina

**No terminal, o que define quem você é é a pasta.** Cada pasta tem o próprio autor de commit e a própria chave SSH:

```bash
cd ~/devs/dev1/laboratorio-claude-code    # agora você é o Dev 1 (commits e push como sca-dev1)
cd ~/devs/dev2/laboratorio-claude-code    # agora você é o Dev 2 (commits e push como sca-dev2)
cd ~/Documentos/laboratorio-claude-code   # agora você é o gerente, na pasta de produção
```

**No `gh` (CLI do GitHub), o que define quem você é é a conta ativa**, que é a mesma para todas as pastas. Troque antes de agir:

```bash
gh auth switch -u sca-dev1        # agir como Dev 1
gh auth switch -u sca-dev2        # agir como Dev 2
gh auth switch -u ScaTecnologia   # agir como gerente/aprovador
gh auth status                    # mostra qual está ativa ("Active account: true")
```

> ⚠️ O erro mais comum é trocar de pasta e esquecer de trocar a conta do `gh`: você acaba abrindo um PR "como ScaTecnologia" com o código do Dev 1. Antes de cada comando `gh`, confira a conta ativa.

**No navegador**, use uma janela para cada conta: a janela normal logada como **ScaTecnologia**, e uma **janela anônima** (Ctrl+Shift+N) ou outro perfil do Chrome logado como **sca-dev1** ou **sca-dev2**.

## A4. Os ambientes desta máquina

Numa empresa, cada dev tem um computador e produção fica num servidor. Aqui, tudo está na mesma máquina, separado por **pastas** e **portas**:

| | Dev 1 | Dev 2 | Produção |
|---|---|---|---|
| Pasta | `~/devs/dev1/laboratorio-claude-code` | `~/devs/dev2/laboratorio-claude-code` | `~/Documentos/laboratorio-claude-code` |
| Branch que roda | a do card dele | a do card dele | **só a `main`** (ou uma tag, no rollback) |
| Sistema | http://localhost:3010 | http://localhost:3020 | http://localhost:3000 |
| Login | `admin@labsystem.com` / `admin123` | `admin@labsystem.com` / `admin123` | `Alexaugusto2@gmail.com` / `admin123` |
| Banco (Postgres) | porta 5161, só do Dev 1 | porta 5162, só do Dev 2 | porta 5151, **dados "reais"** |
| Comandos Docker | `docker compose --env-file portas.env ...` | `docker compose --env-file portas.env ...` | `docker compose ...` (sem `--env-file`) |
| Containers | `dev1-node-1`, `dev1-postgres-1`... | `dev2-node-1`, `dev2-postgres-1`... | `laboratorio-claude-code-node-1`... |

- Os bancos são **independentes**: um cliente criado em 3010 não aparece em 3020 nem em 3000.
- Por isso o login é diferente: o banco dos devs foi criado vazio e o sistema criou sozinho o `admin@labsystem.com`; o banco de produção tem o seu usuário real.
- **Nunca programe na pasta de produção.** Ela só recebe código que já passou pela fábrica inteira.

## A5. O mapa do fluxo completo

```
 GERENTE                 DEV                          GITHUB (robôs)          REVISOR            GERENTE
 ───────                 ───                          ──────────────          ───────            ───────
 1 cria o card ──▶ 2 aceita o card
   (To Do)           (Em Progresso)
                   3 cria a branch
                   4 sobe os containers dele
                   5 programa e testa (3010/3020)
                   6 commit + push ─────────────▶ CI roda na branch
                   7 abre o PR ─────────────────▶ 8 CI roda no PR ──▶ 9 revisa
                     (Em Revisão)                   (8 checks)          aprova ou pede
                   10 corrige, se pedido ◀─────────────────────────────── mudanças
                   11 atualiza com a main, se preciso
                                                  12 MERGE na main  ◀── (CI verde + aprovado)
                                                     card → Concluído
                   13 todos atualizam pastas e containers
                                                                                           14 marca a versão (tag)
                                                                                           15 deploy em produção
                                                                                              (aprovação + backup)
                                                                                           16 rollback, se der problema
```

---

# Parte B — A linha de produção, etapa por etapa

## Etapa 1 — Gerente cria o card

**Quem:** Gerente (ScaTecnologia). **Por quê:** trabalho sem card é trabalho invisível. O card diz o que fazer, como saber que terminou e quem está fazendo.

### Pela tela

1. Abra o repositório: https://github.com/ScaTecnologia-Lab2/laboratorio-claude-code
2. Aba **Issues** → botão verde **New issue**.
3. **Tela "Create new issue"**: escolha o modelo **Tarefa (backlog)** (para bugs, **Bug**). O modelo já traz os campos certos e aplica o rótulo `tarefa`.
4. Preencha:
   - **Título:** o que será feito, em uma frase. Ex.: `[Tarefa] Buscar cliente por nome, cidade ou e-mail na lista`.
   - **Contexto / problema:** o que existe hoje e por que precisa mudar.
   - **Critérios de aceite:** itens objetivos, em forma de checklist (`- [ ] ...`). Se não dá para conferir um item com "sim" ou "não", ele está vago demais.
   - **Área afetada:** Frontend, Backend Node, API Python etc.
5. Na lateral direita:
   - **Projects** → selecione **LabSystem — Esteira**. É isso que coloca o card no board.
   - **Assignees:** deixe **vazio**. Quem se atribui é o dev, ao aceitar (Etapa 2).
6. **Create**.
7. Abra o board (https://github.com/orgs/ScaTecnologia-Lab2/projects/1) e arraste o card de **Backlog** para **To Do**. Isso significa "priorizado, pode pegar".

### Pela CLI

```bash
gh auth switch -u ScaTecnologia
gh issue create --label tarefa \
  --title "[Tarefa] Buscar cliente por nome, cidade ou e-mail na lista" \
  --body-file card.md                     # arquivo com contexto, critérios e área
gh project item-add 1 --owner ScaTecnologia-Lab2 \
  --url https://github.com/ScaTecnologia-Lab2/laboratorio-claude-code/issues/<número>
```

(Mudar a coluna pela CLI exige IDs internos do board; pela tela é só arrastar.)

> ✅ **Exemplo real:** o card **#37** já foi criado assim, está em **To Do** e sem responsável, esperando o Dev 1.

## Etapa 2 — Dev aceita o card

**Quem:** Dev 1 (sca-dev1). **Por quê:** atribuir-se ao card é o aviso público de "estou nisso". Evita que dois devs façam a mesma coisa sem saber.

### Pela tela (janela logada como sca-dev1)

1. Abra o board e clique no card **#37** (ou abra a issue direto: `.../issues/37`).
2. **Lateral direita → Assignees → "assign yourself"**. Seu avatar aparece ali.
3. No board, arraste o card para **Em Progresso**.
4. Se tiver dúvida sobre o card, **comente na própria issue** antes de começar. A conversa fica registrada junto da tarefa.

### Pela CLI

```bash
gh auth switch -u sca-dev1
gh issue edit 37 --add-assignee @me
gh issue view 37                 # lê o card no terminal
```

## Etapa 3 — Dev cria a branch

**Quem:** Dev 1. **Por quê:** a branch é a bancada isolada do card. Tudo que o Dev 1 fizer fica nela até o merge, sem risco para a `main` ou para o Dev 2.

**Regra:** a branch sempre nasce da **`main` atualizada**. Criar a partir de uma `main` velha é pedir conflito mais tarde.

### Pela tela + terminal

1. Na issue #37, **lateral direita → Development → "Create a branch"**.
2. **Janela "Create a branch for this issue":** o GitHub sugere o nome (`37-buscar-cliente-por-nome-cidade-ou-e-mail`). Mantenha *Branch source* = **main** e escolha **"Checkout locally"** → **Create branch**.
3. O GitHub mostra os comandos. Rode-os na pasta do Dev 1:

```bash
cd ~/devs/dev1/laboratorio-claude-code
git switch main && git pull              # garante a main mais nova
git fetch origin
git checkout 37-buscar-cliente-por-nome-cidade-ou-e-mail
```

### Só pela CLI (faz tudo de uma vez)

```bash
cd ~/devs/dev1/laboratorio-claude-code
gh auth switch -u sca-dev1
git switch main && git pull
gh issue develop 37 --checkout           # cria a branch no GitHub, liga à issue e já muda para ela
```

### Conferindo

```bash
git config user.name          # deve mostrar: Dev 1
git branch --show-current     # deve mostrar: 37-buscar-cliente-...
```

## Etapa 4 — Dev sobe o ambiente dele (containers)

**Quem:** Dev 1. **Por quê:** para ver o sistema rodando **com o código da branch dele**, no banco só dele, sem atrapalhar ninguém.

```bash
cd ~/devs/dev1/laboratorio-claude-code
docker compose --env-file portas.env up --build -d
docker compose --env-file portas.env ps          # os 3 serviços devem aparecer como "Up"
```

O que cada parte do comando significa:

| Parte | Significado |
|---|---|
| `docker compose` | usa o "cardápio" `docker-compose.yml` |
| `--env-file portas.env` | usa as portas do Dev 1 (3010, 3011, 5161) em vez das de produção |
| `up` | sobe os containers |
| `--build` | **reconstrói a imagem** com o código atual da pasta (sem isso, roda a versão antiga!) |
| `-d` | roda em segundo plano e devolve o terminal |

Abra http://localhost:3010/login.html e entre com `admin@labsystem.com` / `admin123`.

## Etapa 5 — Dev programa e testa

**Quem:** Dev 1. **Por quê:** é aqui que o card vira código.

1. **Programe** nos arquivos indicados no card (#37: `src/public/clientes.html` e `src/public/js/clientes.js`). Você pode usar o Claude Code: abra-o **na pasta do Dev 1** (`cd ~/devs/dev1/laboratorio-claude-code && claude`) e peça "implemente o card #37". Ele lê o card, explica o plano e programa. **Você continua responsável** por testar e por abrir o PR.
2. **Reconstrua o container** para ver a mudança:
   ```bash
   docker compose --env-file portas.env up --build -d
   ```
   No navegador, recarregue com **Ctrl+Shift+R** (ignora o cache).
3. **Teste cada critério de aceite do card**, um por um. Ex. no #37: busque por parte de um nome, por uma cidade, por um e-mail, por algo que não existe; confira o título `(3 de 10)`; cadastre, edite e exclua com o filtro preenchido.
4. **Rode o lint e os testes locais**. São os mesmos que o CI vai rodar; achar o erro aqui é mais rápido do que esperar o CI:
   ```bash
   npm ci                 # só na primeira vez nesta pasta (instala as ferramentas)
   npm run lint           # deve terminar sem erros
   npm run test:unit
   ```
5. Se algo der errado, olhe os logs do app:
   ```bash
   docker compose --env-file portas.env logs -f node      # Ctrl+C para sair
   ```

## Etapa 6 — Dev faz o commit e o push

**Quem:** Dev 1. **Por quê:** o commit registra a alteração; o push manda para o GitHub, onde o time e o CI conseguem ver.

```bash
cd ~/devs/dev1/laboratorio-claude-code
git status                         # lista o que mudou: confira se são só os arquivos do card
git diff                           # mostra as linhas alteradas: revise você mesmo primeiro
git add src/public/clientes.html src/public/js/clientes.js
git commit -m "feat(clientes): busca por nome, cidade ou e-mail na lista" -m "Closes #37"
git push -u origin 37-buscar-cliente-por-nome-cidade-ou-e-mail
```

- `git add <arquivos>`: escolhe **exatamente** o que vai no commit. Evite `git add .`: ele pega tudo, inclusive arquivos que você não queria (logs, backups, `portas.env`).
- Cada `-m` vira um parágrafo da mensagem: o primeiro é o título, o segundo o corpo.
- `Closes #37` na mensagem liga o commit ao card e fecha o card quando o commit chegar à `main`.
- `-u origin <branch>` só é necessário no **primeiro** push da branch; nos próximos, basta `git push`.

Pode (e deve) haver **vários commits** numa branch: um por passo lógico. Todos entram juntos no PR.

## Etapa 7 — Dev abre o Pull Request

**Quem:** Dev 1 (sca-dev1). **Por quê:** é o pedido formal de inspeção. Sem PR, nada entra na `main`.

### Pela tela (janela logada como sca-dev1)

1. Logo depois do push, o repositório mostra uma faixa amarela: **"37-buscar-cliente... had recent pushes"** → botão **Compare & pull request**. (Ou: aba **Pull requests → New pull request**, *base:* `main` ← *compare:* sua branch.)
2. **Tela "Open a pull request":**
   - **Título:** igual ao do commit principal. Ex.: `feat(clientes): busca por nome, cidade ou e-mail na lista`.
   - **Descrição:** o modelo do projeto já aparece. Preencha:
     - **O que este PR faz**, em 1 a 3 frases.
     - **Issue relacionada:** `Resolve #37`. Essa palavra-chave liga o PR ao card, e o merge fecha o card sozinho.
     - **Como testar:** os passos que o revisor deve seguir.
     - O **checklist** (lint, testes, sem segredos).
3. **Create pull request**.
4. No board, o card vai para **Em Revisão**. Se a automação não mover, arraste você mesmo.

### Pela CLI

```bash
gh auth switch -u sca-dev1
gh pr create --base main --title "feat(clientes): busca por nome, cidade ou e-mail na lista" \
  --body "Resolve #37 ..."        # ou: gh pr create --fill  (usa a mensagem do commit)
gh pr view --web                  # abre o PR no navegador
```

## Etapa 8 — O CI confere o trabalho

**Quem:** os robôs do GitHub (ninguém precisa fazer nada, só acompanhar). **Por quê:** garante, sem depender de boa vontade, que o código novo não quebra o que já existia.

Ao abrir o PR (e a cada novo push nele), rodam dois workflows:

| Workflow | O que confere |
|---|---|
| **CI** (`ci.yml`) | Lint JavaScript (ESLint) e Python (Flake8), testes unitários Node e Python, testes de integração com Postgres de verdade, scan de segurança |
| **Docker Build, Scan & Deploy** (`docker-build.yml`) | Constrói as imagens Docker e procura vulnerabilidades graves nelas (Trivy). O *publish* e o *deploy* aparecem como **"skipped"**: é o esperado, porque eles só rodam manualmente (Etapa 15) |

São **8 checks obrigatórios**. Se um falhar, o botão de merge fica bloqueado.

### Pela tela

No PR, role até o fim: a caixa **"All checks have passed"** (verde) ou **"Some checks were not successful"** (vermelho). Clique em **Details** ao lado de um check vermelho para ver o log e a linha exata do erro.

### Pela CLI

```bash
gh pr checks 37-buscar-cliente-por-nome-cidade-ou-e-mail --watch    # acompanha até terminar
gh run list --branch 37-buscar-cliente-por-nome-cidade-ou-e-mail     # lista as execuções e seus números
gh run view <número-da-execução> --log-failed                        # mostra só o log do que falhou
```

**Check vermelho?** Corrija na sua pasta, faça commit e push de novo. O CI roda sozinho outra vez.

> ⚠️ **Espere todos os checks aparecerem.** Os dois workflows começam em momentos diferentes. Logo depois de abrir o PR, a lista pode mostrar só os checks do CI, todos verdes, enquanto os do Docker ainda nem começaram. Só considere "tudo verde" quando a caixa do PR disser **"All checks have passed"** e não houver nenhum check "Pending" ou "Expected". Às vezes o vermelho também não é culpa do PR: veja "Scan de vulnerabilidades" em C5.

## Etapa 9 — O revisor analisa e aprova

**Quem:** **outra pessoa** que não o autor. Para um PR do Dev 1: o Dev 2 ou o gerente. **Por quê:** um segundo par de olhos pega o que o autor não vê (erro de lógica, falha de segurança, código confuso) e espalha o conhecimento pelo time.

### O que o revisor confere

1. **O PR faz o que o card pede?** Leia os critérios de aceite do card e confira um por um.
2. **O código está claro?** Nomes compreensíveis, sem código morto, segue o estilo do resto do projeto.
3. **Segurança:** sem senha no código, sem SQL montado com texto concatenado (o projeto exige `$1, $2...`), sem retornar o campo `senha`, com dados do banco escapados antes de ir para o HTML.
4. **O CI está verde?**
5. **Testou?** Idealmente, o revisor roda a branch na própria pasta:
   ```bash
   cd ~/devs/dev2/laboratorio-claude-code        # revisor = Dev 2
   git fetch origin
   git switch 37-buscar-cliente-por-nome-cidade-ou-e-mail
   docker compose --env-file portas.env up --build -d
   # testar em http://localhost:3020; depois voltar:
   git switch main
   ```
   (Ou, mais rápido: `gh pr checkout <número-do-PR>`.)

### Pela tela (janela logada como o revisor, ex. sca-dev2)

1. Abra o PR → aba **Files changed**. Linhas verdes (`+`) foram adicionadas; vermelhas (`-`) foram removidas.
2. Para comentar uma linha: passe o mouse sobre ela → clique no **+** azul → escreva → **Start a review** (junta vários comentários num envio só).
3. Terminou? Botão **Review changes** (canto superior direito) → escolha:
   - **Comment:** só observações, sem decidir.
   - **Approve:** "está bom, pode entrar".
   - **Request changes:** "precisa ajustar antes de entrar". Explique **o quê** e **por quê**.
4. **Submit review**.

### Pela CLI

```bash
gh auth switch -u sca-dev2
gh pr list                                   # PRs abertos
gh pr view <número>                          # descrição
gh pr diff <número>                          # linhas alteradas
gh pr review <número> --approve --body "Conferi os critérios do #37 em localhost:3020."
gh pr review <número> --request-changes --body "O título não mostra (x de y) com filtro ativo."
gh auth switch -u ScaTecnologia              # volte para a sua conta principal
```

> **Regras que o GitHub aplica neste repositório:**
> - É preciso **1 aprovação** de um code owner (sca-dev1, sca-dev2 ou ScaTecnologia, que não seja o autor).
> - Todas as **conversas** (comentários) precisam estar marcadas como **Resolved** antes do merge.
> - Se o autor fizer um **novo push depois da aprovação**, a aprovação **cai** e o revisor precisa aprovar de novo. Assim ninguém aprova uma versão e faz merge de outra.

## Etapa 10 — Dev corrige o que o revisor pediu

**Quem:** Dev 1. **Por quê:** a revisão só funciona se o que foi apontado for resolvido (ou discutido).

1. Leia os comentários no PR (aba **Conversation**).
2. Corrija na mesma branch, na sua pasta:
   ```bash
   cd ~/devs/dev1/laboratorio-claude-code
   # ... edite ...
   npm run lint
   git add <arquivos>
   git commit -m "fix(clientes): mostra (x de y) no título com filtro ativo"
   git push                              # o PR se atualiza sozinho; o CI roda de novo
   ```
3. Responda cada comentário (ex.: "Corrigido em <commit>") e clique em **Resolve conversation**.
4. Se discordar de um pedido, **responda explicando**. Revisão é conversa, não ordem.
5. Peça nova revisão: no PR, **Reviewers** → ícone 🔄 ao lado do nome do revisor.

## Etapa 11 — Dev atualiza a branch (quando a `main` andou)

**Quem:** Dev 1. **Quando:** outro PR foi mergeado depois que você criou a sua branch. O PR mostra *"This branch is out-of-date with the base branch"*, ou você quer testar com o código mais novo.

**Por quê:** para garantir que o seu código funciona **junto** com o que os colegas já entregaram, e para resolver eventuais conflitos na sua bancada, não na `main`.

```bash
cd ~/devs/dev1/laboratorio-claude-code
git fetch origin
git rebase origin/main              # reaplica seus commits sobre a main nova
# se aparecer CONFLICT: resolva (ver docs/EXERCICIO_MULTIPLOS_DEVS.md, passos 5 a 7)
npm run lint                        # confira que nada quebrou
git push --force-with-lease         # obrigatório depois de rebase
```

- **Por que `--force-with-lease`?** O rebase reescreve os seus commits, e o GitHub recusa o push normal. O `--force-with-lease` força **só se ninguém mais** tiver mexido na sua branch nesse meio tempo. Nunca use `--force` puro, e **nunca** em `main` (o GitHub bloqueia).
- **Pela tela:** no PR, o botão **Update branch** faz um merge da `main` na sua branch. Funciona, mas cria um commit extra; o rebase deixa o histórico mais limpo.

## Etapa 12 — Merge: o código entra na `main`

**Quem:** o autor, o revisor ou o gerente. **Quando:** CI verde **e** aprovado **e** conversas resolvidas. **Por quê:** é o momento em que o card vira parte do produto.

### Pela tela

1. No fim do PR, a caixa mostra **"Changes approved"** e **"All checks have passed"**. O botão **Merge pull request** fica verde.
2. Clique na seta ao lado do botão e escolha **Create a merge commit**. É o padrão do projeto: preserva cada commit e o autor de cada um.
3. **Merge pull request → Confirm merge**.
4. O que acontece sozinho:
   - a issue **#37 fecha** (por causa do `Resolve #37`);
   - a branch é **apagada no GitHub** (configuração do repositório);
   - o card deve ir para **Concluído**. Se não for, arraste.
   - o CI roda de novo, agora na `main`.

### Pela CLI

```bash
gh pr merge <número> --merge --delete-branch
```

## Etapa 13 — Todo mundo atualiza as pastas e os containers

**Quem:** **todos** os devs (e a pasta de produção, na Etapa 15). **Por quê:** depois do merge, a `main` do GitHub está mais nova que a de cada pasta. Quem não atualizar vai criar a próxima branch a partir de código velho.

```bash
# em cada pasta de dev (repita para dev1 e dev2):
cd ~/devs/dev1/laboratorio-claude-code
git switch main
git pull                                        # traz o que foi mergeado
git branch -d 37-buscar-cliente-por-nome-cidade-ou-e-mail   # apaga a branch local (já está na main)
git fetch --prune                               # esquece as branches apagadas no GitHub
docker compose --env-file portas.env up --build -d          # container com o código novo!
```

- `git branch -d` (d minúsculo) **só apaga se a branch já estiver na `main`**. É seguro: se você errar, o Git recusa.
- **Não esqueça o `up --build`.** O `git pull` muda os arquivos da pasta, mas o container continua com a cópia antiga até ser reconstruído. Foi o que aconteceu com o Dev 2 depois do #27: a pasta estava atualizada e a tela em 3020 não.

## Etapa 14 — Gerente marca a versão (tag)

**Quem:** Gerente (ScaTecnologia). **Quando:** antes de cada deploy. **Por quê:** a tag é a etiqueta do lote. Com ela você sabe exatamente o que está em produção e para onde voltar se der problema.

**Numeração (SemVer):** `vMAIOR.MENOR.CORREÇÃO`

| Mudou o quê | Sobe qual número | Exemplo |
|---|---|---|
| Correção de bug | CORREÇÃO | `v1.1.0` → `v1.1.1` |
| Funcionalidade nova (ex.: a busca do #37) | MENOR | `v1.1.1` → `v1.2.0` |
| Mudança que quebra algo existente | MAIOR | `v1.2.0` → `v2.0.0` |

> 💡 O repositório ainda **não tem nenhuma tag**. Sugestão: antes do primeiro deploy guiado por este documento, marque o estado atual de produção como **`v1.0.0`**. Assim o rollback da Etapa 16 tem para onde voltar.

### Pela tela

1. Repositório → lateral direita **Releases → Create a new release** (ou *Draft a new release*).
2. **Choose a tag** → digite `v1.1.0` → **Create new tag: v1.1.0 on publish**. *Target:* **main**.
3. **Release title:** `v1.1.0`. Clique em **Generate release notes**: o GitHub lista os PRs desde a versão anterior.
4. **Publish release**.

### Pela CLI (na pasta de produção, que é da conta ScaTecnologia)

```bash
cd ~/Documentos/laboratorio-claude-code
git switch main && git pull
git tag -a v1.1.0 -m "v1.1.0 — busca de clientes (#37)"
git push origin v1.1.0
gh release create v1.1.0 --generate-notes      # opcional: página de release no GitHub
git tag                                        # lista as versões existentes
```

## Etapa 15 — Deploy em produção (com aprovação)

**Quem:** Gerente/aprovador (ScaTecnologia). **Por quê:** produção é onde o cliente trabalha. Nada vai para lá automaticamente: uma **pessoa** decide, com backup feito e plano de volta pronto.

O deploy tem **duas partes**:

- **15a (GitHub):** o portão formal. Fica registrado quem aprovou, quando e qual versão.
- **15b (esta máquina):** a publicação de verdade. Neste laboratório o job de deploy do GitHub é **simulado** (só imprime mensagens), porque não existe um servidor de produção na internet. Numa empresa, o próprio job faria os comandos da 15b no servidor, via SSH ou Kubernetes.

### 15a. Disparar e aprovar o deploy no GitHub

**Pela tela (logado como ScaTecnologia):**

1. Aba **Actions** → na lista da esquerda, **Docker Build, Scan & Deploy**.
2. Botão **Run workflow** (à direita) → *Use workflow from:* **main** → marque **"Rodar o deploy em produção..."** → **Run workflow**.
3. Abra a execução que apareceu. Build e scan rodam; o job **Deploy em produção (requer aprovação)** fica em **Waiting**, com a faixa *"This workflow is waiting for review"*.
4. Botão **Review deployments** → marque **production** → comentário opcional → **Approve and deploy**.
5. O job roda e fica verde. O registro fica em **Actions** e em **Deployments** (lateral do repositório).

> O Environment `production` só aceita execuções vindas de **branch protegida**, ou seja, da `main`. Disparar a partir de uma branch de card ou de uma tag é recusado. Por isso a tag (Etapa 14) é criada na `main` **antes** do deploy: a `main` e a tag apontam para o mesmo commit.

**Pela CLI:**

```bash
gh auth switch -u ScaTecnologia
gh workflow run docker-build.yml --ref main -f deploy_production=true
gh run list --workflow docker-build.yml --limit 1      # pega o número da execução
gh run watch <id-da-execução>
```

A **aprovação** (passo 4) é feita na tela. É de propósito: é a decisão humana do processo.

> Se o build ou o scan falharem, o deploy **nem chega a pedir aprovação**. Imagem com vulnerabilidade grave não vai para produção.

### 15b. Publicar em produção (pasta de produção)

```bash
cd ~/Documentos/laboratorio-claude-code

# 1. BACKUP do banco de produção ANTES de qualquer mudança (ver C2)
mkdir -p ~/backups/labsystem
docker compose exec -T postgres pg_dump -U postgres --clean --if-exists laboratorio \
  > ~/backups/labsystem/antes-v1.1.0-$(date +%F-%H%M).sql
ls -lh ~/backups/labsystem | tail -1            # o arquivo precisa ter tamanho > 0

# 2. Trazer a versão aprovada
git switch main
git pull
git log --oneline -1                            # confira: é o commit da tag?  (git describe --tags)

# 3. Reconstruir e subir
docker compose up --build -d
docker compose ps                               # tudo "Up"; o postgres "(healthy)"

# 4. SMOKE TEST: teste rápido do essencial
docker compose logs --tail 20 node              # sem erros
#   navegador: http://localhost:3000 → login → abrir Clientes, Fornecedores
#   e testar a novidade da versão (ex.: a busca do #37)
```

**Por que cada passo:**

- **Backup:** se a versão nova estragar dados, você tem como restaurar. Deploy sem backup é trapézio sem rede.
- **`git pull` só na `main`:** produção nunca roda uma branch de card.
- **`up --build`:** só o container `node`/`fornecedores` é recriado com o código novo. O **volume** do banco continua o mesmo: **os dados de produção não são apagados**.
- **Smoke test:** confere em 2 minutos que o básico funciona, antes que o cliente descubra.

> ⛔ **Nunca rode `docker compose down -v` na pasta de produção.** O `-v` apaga o volume, ou seja, **todos os dados de produção**.

## Etapa 16 — Rollback: voltar para a versão anterior

**Quem:** Gerente. **Quando:** o smoke test falhou, ou o cliente reclamou de um problema grave logo depois do deploy. **Por quê:** primeiro volta-se ao que funcionava; depois investiga-se com calma.

```bash
cd ~/Documentos/laboratorio-claude-code
git fetch --tags
git checkout v1.0.0                  # a última versão boa (a pasta fica "detached HEAD": normal aqui)
docker compose up --build -d         # produção volta a rodar o código da v1.0.0
```

Se o problema **estragou dados**, restaure o backup feito na Etapa 15b (ver C2, "Restaurar").

Depois:

1. Abra um card de **Bug** descrevendo o que aconteceu e siga o fluxo normal (ou o hotfix, C3).
2. Quando a correção estiver na `main` e com tag nova, faça o deploy normalmente. `git switch main && git pull` tira a pasta do modo "detached HEAD".

> **Por que não "desfazer o commit" direto na `main`?** Porque a `main` é protegida e a correção também precisa passar pela fábrica. Voltar produção por tag é imediato e não mexe no histórico.

---

# Parte C — Operação

## C1. Containers: levantar, atualizar, parar

### Ambientes dos devs (em `~/devs/dev1/...` ou `~/devs/dev2/...`)

| Quero... | Comando |
|---|---|
| Subir (ou atualizar depois de mudar código ou fazer `git pull`) | `docker compose --env-file portas.env up --build -d` |
| Ver o estado | `docker compose --env-file portas.env ps` |
| Ver logs do app | `docker compose --env-file portas.env logs -f node` |
| Ver logs da API Python | `docker compose --env-file portas.env logs -f fornecedores` |
| Reconstruir só o app Node (mais rápido) | `docker compose --env-file portas.env up --build -d node` |
| Parar (dados ficam guardados) | `docker compose --env-file portas.env down` |
| Parar e **zerar o banco** deste dev | `docker compose --env-file portas.env down -v` |

### Produção (em `~/Documentos/laboratorio-claude-code`)

Os mesmos comandos, **sem** `--env-file portas.env`:

| Quero... | Comando |
|---|---|
| Subir ou atualizar (depois de backup + `git pull`) | `docker compose up --build -d` |
| Estado e logs | `docker compose ps` · `docker compose logs -f node` |
| Reiniciar o app sem reconstruir | `docker compose restart node` |
| Parar (dados ficam) | `docker compose down` |
| ~~Zerar o banco~~ | ⛔ **Não.** Em produção, nunca `down -v`. |

### Visão geral da máquina

```bash
docker ps                                          # todos os containers rodando
docker volume ls | grep labsystem                  # os 3 bancos: dev1_, dev2_ e laboratorio-claude-code_
docker system df                                   # quanto espaço o Docker está usando
docker image prune                                 # apaga imagens velhas sem uso (libera disco)
```

**Os containers sobem sozinhos depois de reiniciar o computador?** Sim: o app e a API têm `restart: unless-stopped`. O que você parou com `down` fica parado.

## C2. Banco de dados: acessar, backup, restaurar, zerar

Todos os comandos abaixo foram testados neste projeto. Nos **devs**, acrescente `--env-file portas.env` depois de `docker compose` e rode na pasta do dev. Em **produção**, rode na pasta de produção, sem ele.

### Entrar no banco (terminal SQL)

```bash
docker compose exec postgres psql -U postgres laboratorio
```

Dentro do `psql`:

```sql
\dt                                   -- lista as tabelas
SELECT id, nome, cidade FROM clientes ORDER BY id DESC LIMIT 5;
SELECT id, nome, email, role FROM usuarios;   -- nunca selecione a senha à toa
\q                                    -- sair
```

> Em produção, **só leia** (`SELECT`). Alterar dados à mão em produção (`UPDATE`/`DELETE`) sem card, sem backup e sem uma segunda pessoa conferindo é a receita clássica de incidente.

### Backup

```bash
mkdir -p ~/backups/labsystem
docker compose exec -T postgres pg_dump -U postgres --clean --if-exists laboratorio \
  > ~/backups/labsystem/labsystem-$(date +%F-%H%M).sql
```

- `-T`: não cria um terminal interativo; necessário quando a saída vai para um arquivo.
- `--clean --if-exists`: o arquivo já inclui "apague a tabela antes de recriar". Assim ele restaura por cima de um banco existente.
- Guarde os backups **fora da pasta do projeto** (`~/backups/...`), para nunca irem para o Git por acidente. Backup tem dados reais.

### Restaurar

```bash
docker compose exec -T postgres psql -q -U postgres laboratorio < ~/backups/labsystem/<arquivo>.sql
docker compose restart node fornecedores       # os apps reconectam ao banco restaurado
```

Mensagens `... does not exist, skipping` são normais.

### Zerar o banco (só em dev)

```bash
docker compose --env-file portas.env down -v
docker compose --env-file portas.env up --build -d
```

O sistema recria as tabelas e o usuário `admin@labsystem.com` sozinho, no primeiro start.

### Copiar os dados de produção para o dev

Útil para reproduzir um bug com dados reais:

```bash
cd ~/Documentos/laboratorio-claude-code
docker compose exec -T postgres pg_dump -U postgres --clean --if-exists laboratorio > ~/backups/labsystem/prod-para-dev.sql
cd ~/devs/dev1/laboratorio-claude-code
docker compose --env-file portas.env exec -T postgres psql -q -U postgres laboratorio < ~/backups/labsystem/prod-para-dev.sql
docker compose --env-file portas.env restart node fornecedores
```

Depois disso, o login no ambiente do dev passa a ser o de produção. Numa empresa de verdade, os dados pessoais seriam **anonimizados** antes de ir para um ambiente de dev (LGPD).

### Mudanças na estrutura do banco (novas tabelas e colunas)

Este projeto **não usa ferramenta de migração**: cada módulo cria as próprias tabelas ao iniciar, com `CREATE TABLE IF NOT EXISTS` (ex.: `src/clientes.js`, `src/usuarios.js`, `src/fornecedores_api.py`). Consequência importante:

- **Tabela nova:** basta criar no código com `CREATE TABLE IF NOT EXISTS`. Ela aparece em todos os bancos no próximo start.
- **Coluna nova numa tabela que já existe:** o `CREATE TABLE IF NOT EXISTS` **não** adiciona colunas a uma tabela existente. O código precisa rodar também:
  ```sql
  ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);
  ```
  Senão funciona no dev (banco zerado) e **quebra em produção** (banco antigo). O card deve dizer isso, e o revisor deve conferir.
- **Nunca** apague ou renomeie coluna com dados em produção sem backup e sem um plano aprovado.

## C3. Bug urgente em produção (hotfix)

Mesmo com pressa, **o fluxo é o mesmo**, só que mais rápido. Pular a revisão "só desta vez" é exatamente quando o segundo erro acontece.

1. **Gerente:** cria um card com o modelo **Bug** e o coloca direto em **To Do**, no topo. Se o problema for grave, faça antes o **rollback** (Etapa 16) para estancar.
2. **Dev:** `git switch main && git pull`, cria a branch (`gh issue develop <n> --checkout`), corrige **só o bug** (nada de "aproveitar e melhorar outra coisa"), faz commit `fix(...)`, push e abre o PR.
3. **Revisor:** revisa **na hora**, focado no bug.
4. **Merge → tag de correção** (`v1.2.0` → `v1.2.1`) **→ deploy** (Etapa 15, com backup).

## C4. Checklists

### "Pronto para começar" (Definition of Ready): o card pode ir para To Do?

- [ ] O título diz o que será feito
- [ ] O contexto explica o problema
- [ ] Os critérios de aceite são objetivos (dá para responder "sim" ou "não")
- [ ] A área afetada está indicada
- [ ] Cabe em uma branch curta (algumas horas a 1 dia). Se não, quebre em cards menores

### "Pronto de verdade" (Definition of Done): o card pode ir para Concluído?

- [ ] Todos os critérios de aceite foram testados pelo dev **e** conferidos pelo revisor
- [ ] `npm run lint` e os testes passam; CI verde
- [ ] PR aprovado por outra pessoa, conversas resolvidas
- [ ] Merge feito na `main`, card fechado
- [ ] Documentação atualizada, se a mudança pede (`docs/`, `CLAUDE.md`)
- [ ] Pastas e containers dos devs atualizados (Etapa 13)
- [ ] (Quando for a produção) tag criada, backup feito, deploy aprovado, smoke test ok

## C5. Problemas comuns

| Sintoma | Causa | O que fazer |
|---|---|---|
| A mudança não aparece no navegador | O container roda a imagem antiga | `up --build -d` e **Ctrl+Shift+R** |
| `port is already allocated` | Esqueceu o `--env-file portas.env` (tentou usar a porta de produção) | Use sempre `--env-file portas.env` nas pastas dos devs |
| Login não funciona | Cada ambiente tem o próprio banco | Devs: `admin@labsystem.com`; produção: `Alexaugusto2@gmail.com` (ver A4) |
| Commit saiu com o autor errado | Comando rodado na pasta errada | `pwd` e `git config user.name` antes de commitar |
| PR aberto pela conta errada | Conta ativa do `gh` era outra | `gh auth status` antes de cada comando `gh`; feche o PR e abra de novo com a conta certa |
| Merge bloqueado: *"Review required"* | Falta aprovação de **outra** conta | Aprove na janela do outro dev (Etapa 9) |
| Merge bloqueado depois de aprovado | Houve push depois da aprovação (a aprovação caiu) ou há conversa não resolvida | Peça nova aprovação; resolva as conversas |
| *"This branch is out-of-date"* ou conflito | A `main` andou | Etapa 11 (rebase) |
| `git push` recusado depois de rebase | O rebase reescreveu os commits | `git push --force-with-lease` |
| `Permission denied (publickey)` no push | A chave SSH da pasta não está cadastrada na conta | Ver `docs/SIMULANDO_2_DEVS.md`, seção 5 |
| Merge bloqueado: **"Scan de vulnerabilidades — imagem ..."** vermelho, mesmo sem o PR mexer em Docker | Saiu uma falha de segurança nova (CVE) num pacote da imagem base, e o scan barra tudo que já tem correção. Afeta **todos** os PRs (aconteceu no #39, CVE-2026-103111 na `libpcre2`) | Não enfraqueça o scan. Abra um card de Bug, corrija o `Dockerfile*` num PR próprio e, depois do merge, rode de novo os checks dos PRs parados (*Checks → Re-run all jobs*, ou `gh run rerun <id> --failed`) |
| Commit aparece no GitHub com o avatar de **outra pessoa** | `user.email` da pasta com o ID errado: no e-mail `<ID>+<conta>@users.noreply.github.com`, o GitHub identifica o autor pelo **número**, não pelo nome (aconteceu no #37, vindo de outra máquina) | `gh api users/<conta> --jq .id` mostra o ID certo; corrija com `git config user.email` e, se o PR ainda não foi aberto, `git commit --amend --no-edit --reset-author` + `git push --force-with-lease` |
| Card não saiu da coluna sozinho | Automação do board não disparou (aconteceu com #27, #29 e #37) | Arraste o card manualmente; confira *Projects → ⋯ → Workflows* |
| Deploy em "Waiting" para sempre | Ninguém aprovou no Environment `production` | Etapa 15a, passo 4 (logado como ScaTecnologia) |
| `git branch -d` recusa apagar | A branch ainda não foi mergeada | Confira se o PR foi mesmo mergeado; não use `-D` sem ter certeza |

## C6. Cola rápida por papel

### Gerente (ScaTecnologia)

```bash
gh auth switch -u ScaTecnologia
gh issue create --label tarefa --title "[Tarefa] ..." --body-file card.md    # criar card
gh project item-add 1 --owner ScaTecnologia-Lab2 --url <url-da-issue>        # pôr no board
gh pr list                                                                   # o que está em revisão
# deploy:
cd ~/Documentos/laboratorio-claude-code && git switch main && git pull
git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z
gh workflow run docker-build.yml --ref main -f deploy_production=true        # e aprovar na tela
docker compose exec -T postgres pg_dump -U postgres --clean --if-exists laboratorio > ~/backups/labsystem/antes-vX.Y.Z.sql
docker compose up --build -d && docker compose ps
```

### Dev (exemplo: Dev 1, card #37)

```bash
cd ~/devs/dev1/laboratorio-claude-code && gh auth switch -u sca-dev1
gh issue edit 37 --add-assignee @me                  # aceitar
git switch main && git pull && gh issue develop 37 --checkout      # branch
docker compose --env-file portas.env up --build -d   # ambiente (repita após cada mudança)
npm run lint && npm run test:unit                    # conferir
git add <arquivos> && git commit -m "feat(...): ..." -m "Closes #37"          # entregar
git push -u origin HEAD
gh pr create --fill                                  # abrir PR (edite: "Resolve #37")
# depois do merge:
git switch main && git pull && git branch -d <branch> && git fetch --prune
docker compose --env-file portas.env up --build -d
```

### Revisor (exemplo: Dev 2 revisando o Dev 1)

```bash
cd ~/devs/dev2/laboratorio-claude-code && gh auth switch -u sca-dev2
gh pr list && gh pr view <n> && gh pr diff <n>
gh pr checkout <n> && docker compose --env-file portas.env up --build -d    # testar em 3020
gh pr review <n> --approve --body "..."     # ou --request-changes
git switch main
gh auth switch -u ScaTecnologia
```

---

## Exercício: faça agora com o card #37

0. **Gerente** (Etapa 14): **antes de tudo**, marque o estado atual de produção como `v1.0.0`, para ter para onde voltar:
   ```bash
   cd ~/Documentos/laboratorio-claude-code && git switch main && git pull
   git tag -a v1.0.0 -m "v1.0.0 — estado de produção antes do #37" && git push origin v1.0.0
   ```
1. **Dev 1** (Etapas 2 a 7): aceite o #37, crie a branch, implemente, teste em http://localhost:3010 e abra o PR.
2. **Dev 2** (Etapa 9): revise. Na primeira vez, **peça uma mudança de propósito** (ex.: "o placeholder do campo poderia citar os três campos"), para praticar a Etapa 10.
3. **Dev 1** (Etapa 10): corrija e responda. **Dev 2** aprova de novo.
4. **Merge** (Etapa 12) e **atualização das duas pastas** (Etapa 13).
5. **Gerente** (Etapas 14 e 15): crie a tag `v1.1.0` na `main` nova; faça backup, dispare e aprove o deploy, atualize produção e faça o smoke test em http://localhost:3000.
6. **Bônus** (Etapa 16): faça um rollback para `v1.0.0`, confira que a busca sumiu em 3000 e volte com `git switch main && docker compose up --build -d`.
