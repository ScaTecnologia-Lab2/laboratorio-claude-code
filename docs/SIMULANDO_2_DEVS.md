# Simulando 2 desenvolvedores na mesma máquina (com containers)

> Para quem nunca usou containers. Pré-requisito: Docker funcionando (`docker compose version`). Contexto do fluxo card → branch → PR: `docs/BACKLOG_KANBAN.md`.

---

## 1. A ideia em 30 segundos

**O container não é "do desenvolvedor".** Cada dev tem a **própria cópia do código** (uma pasta com o clone do repositório, na branch dele). O container é só **a forma de rodar o sistema** a partir daquela cópia.

```
Pasta do Dev 1 (branch dele)            Pasta do Dev 2 (branch dele)
└─ docker compose ... up                └─ docker compose ... up
   → postgres + node + fornecedores        → postgres + node + fornecedores
     banco SÓ do Dev 1                       banco SÓ do Dev 2
     http://localhost:3010                   http://localhost:3020
                 \                          /
                  \── git push → PR ───────/
                     GitHub (main, CI, board Kanban)
```

- Os containers são **idênticos** para todos (mesmo Node, Python e Postgres, definidos no `Dockerfile` e no `docker-compose.yml`) — por isso não existe mais "na minha máquina funciona".
- O código dos dois **só se encontra no GitHub**, via Pull Request. Os containers nunca conversam entre si.
- Numa empresa, cada dev faz isso no próprio computador. Aqui você faz os dois papéis, com duas pastas.

## 2. O que já está preparado

| | Dev 1 | Dev 2 | (pasta principal) |
|---|---|---|---|
| Pasta | `~/devs/dev1/laboratorio-claude-code` | `~/devs/dev2/laboratorio-claude-code` | `~/Documentos/laboratorio-claude-code` |
| Conta no GitHub | **sca-dev1** | **sca-dev2** | **ScaTecnologia** (tech lead/admin) |
| Chave SSH usada no push | `~/.ssh/id_ed25519_dev1` | `~/.ssh/id_ed25519_dev2` | `~/.ssh/id_ed25519` |
| Autor dos commits | `Dev 1` (ligado ao perfil sca-dev1) | `Dev 2` (ligado ao perfil sca-dev2) | `alexaugusto2` |
| Sistema (navegador) | http://localhost:3010 | http://localhost:3020 | http://localhost:3000 |
| API Python (só local) | 3011 | 3021 | 3001 |
| Postgres (só local) | 5161 | 5162 | 5151 |
| Nome dos containers | `dev1-...` | `dev2-...` | `laboratorio-claude-code-...` |

As portas e o nome ficam no arquivo `portas.env` de cada pasta (fora do Git). Por isso **todo comando do compose leva `--env-file portas.env`**.

**Quem é quem é decidido pela pasta**, sem você precisar fazer nada: cada pasta tem seu `user.name`/`user.email` e sua chave SSH (`git config core.sshCommand`). Um `git push` feito em `~/devs/dev1/...` chega ao GitHub como **sca-dev1**.

**No navegador**, use uma janela para cada conta — por exemplo, a janela normal logada como ScaTecnologia e uma **janela anônima** (ou outro perfil do Chrome) logada como sca-dev1 ou sca-dev2.

**No `gh` (terminal)**, as 3 contas estão conectadas; escolha a ativa antes de usar:

```bash
gh auth switch -u sca-dev1        # agir como Dev 1 (assumir card, abrir PR...)
gh auth switch -u sca-dev2        # agir como Dev 2 (ex.: aprovar o PR do Dev 1)
gh auth switch -u ScaTecnologia   # voltar a ser o admin
gh auth status                    # mostra qual está ativa
```

**Login em um banco novo:** `admin@labsystem.com` / `admin123` (o sistema cria esse admin sozinho quando o banco está vazio).

## 3. Comandos do dia a dia

Sempre **entre na pasta do dev primeiro** — é isso que define "quem você é":

```bash
cd ~/devs/dev1/laboratorio-claude-code      # agora você é o Dev 1
```

| Quero... | Comando |
|---|---|
| Subir o sistema com o código atual da pasta | `docker compose --env-file portas.env up --build -d` |
| Ver se está rodando | `docker compose --env-file portas.env ps` |
| Ver os logs do app (Ctrl+C sai) | `docker compose --env-file portas.env logs -f node` |
| Parar (os dados do banco ficam guardados) | `docker compose --env-file portas.env down` |
| Parar e **apagar o banco** deste dev | `docker compose --env-file portas.env down -v` |
| Ver **todos** os containers da máquina | `docker ps` |
| Conferir quem eu sou e em que branch estou | `git config user.name && git branch --show-current` |

**Mudou o código? Rode o `up --build -d` de novo** — o container é reconstruído com a versão nova. Páginas HTML/JS e o servidor Node só mudam no container depois desse comando.

## 4. Roteiro: dois devs, dois cards, ao mesmo tempo

1. **Crie (ou escolha) dois cards** no board — https://github.com/orgs/ScaTecnologia-Lab2/projects/1. Ex.: o #27 (quantidade de clientes) para o Dev 1 e outro para o Dev 2.

2. **Dev 1 pega o card e cria a branch** — na janela logada como **sca-dev1**, abra a issue, *Assignees* → *assign yourself*; mova o card para **Em Progresso**; *Development → Create a branch*. Depois:
   ```bash
   cd ~/devs/dev1/laboratorio-claude-code
   git fetch origin
   git checkout <nome-da-branch-que-o-github-mostrou>
   docker compose --env-file portas.env up --build -d
   ```
   Abra http://localhost:3010, altere o código, rode o `up --build -d` de novo e veja a mudança.

3. **Dev 2 faz o mesmo** — na janela logada como **sca-dev2**, e na pasta dele:
   ```bash
   cd ~/devs/dev2/laboratorio-claude-code
   git fetch origin
   git checkout <branch-do-card-do-dev-2>
   docker compose --env-file portas.env up --build -d
   ```
   Abra http://localhost:3020 — **lado a lado** com a do Dev 1, cada uma com o código da sua branch e o seu próprio banco.

4. **Cada dev sobe a sua atualização** (na pasta dele):
   ```bash
   npm ci              # só na 1ª vez, para ter o lint local
   npm run lint
   git add <arquivos>
   git commit -m "feat: ..."
   git push
   ```
   Abra o PR com `Resolve #<número do card>` (na janela do próprio dev). O CI roda; o card vai para **Em Revisão**.

5. **O outro dev revisa e aprova** — ninguém aprova o próprio PR, e a `main` exige 1 aprovação de code owner. Na janela logada como **sca-dev2**, abra o PR do Dev 1 → aba *Files changed* → leia, comente se precisar → **Review changes → Approve**. (E o Dev 1 faz o mesmo com o PR do Dev 2.) Pelo terminal: `gh auth switch -u sca-dev2 && gh pr review <n> --approve`.

6. **Merge** — com CI verde **e** aprovação, o botão **Merge pull request** libera (para qualquer um do time). A issue fecha e o card vai para **Concluído**.

7. **Quem chegar depois atualiza a branch antes do merge** — se o outro dev já mesclou:
   ```bash
   git fetch origin
   git rebase origin/main      # se der conflito: docs/EXERCICIO_MULTIPLOS_DEVS.md, passos 5 a 7
   git push --force-with-lease
   ```

8. **Depois do merge, volte para a main atualizada** antes de pegar o próximo card:
   ```bash
   git checkout main && git pull
   ```

## 5. Problemas comuns

| Sintoma | Causa | O que fazer |
|---|---|---|
| `port is already allocated` | Outra cópia já usa a porta, ou esqueceu o `--env-file portas.env` (aí ele tenta 3000/3001/5151, que são da pasta principal) | Use sempre `--env-file portas.env`; confira com `docker ps` |
| A mudança no código não aparece no navegador | O container ainda roda a versão antiga | `docker compose --env-file portas.env up --build -d` e recarregue com Ctrl+F5 |
| O login não funciona | Cada dev tem seu próprio banco | Use `admin@labsystem.com` / `admin123`, ou o usuário que você criou **naquele** banco |
| Commit saiu com o autor errado | Comando rodado na pasta errada | `pwd` e `git config user.name` antes de commitar |
| Quero começar do zero o banco de um dev | — | `docker compose --env-file portas.env down -v` e `up --build -d` de novo |
| Botão de merge bloqueado: "Review required" | Falta a aprovação de **outra** conta | Aprove na janela do outro dev (seção 4, passo 5) |
| `Permission denied (publickey)` no push | A chave da pasta não está cadastrada na conta do dev | `ssh -i ~/.ssh/id_ed25519_devN -o IdentitiesOnly=yes -T git@github.com` deve responder `Hi sca-devN!` |
| O `gh` fez algo com a conta errada | A conta ativa é outra | `gh auth status` e `gh auth switch -u <conta>` |

## 6. Como isto foi montado (para refazer em outra máquina)

```bash
for n in 1 2; do
  mkdir -p ~/devs/dev$n && cd ~/devs/dev$n
  git clone git@github.com:ScaTecnologia-Lab2/laboratorio-claude-code.git
  cd laboratorio-claude-code
  git config user.name "Dev $n"
  git config user.email "dev$n@example.invalid"
  printf 'COMPOSE_PROJECT_NAME=dev%s\nAPP_PORT=30%s0\nAPI_PY_PORT=30%s1\nPG_PORT=516%s\n' $n $n $n $n > portas.env
done
```

Depois, para cada dev com **conta própria no GitHub** (feito em 2026-09-28 com sca-dev1 e sca-dev2):

```bash
# 1. Chave SSH do dev, usada só pela pasta dele
ssh-keygen -t ed25519 -N "" -C "devN@laboratorio-claude-code" -f ~/.ssh/id_ed25519_devN
git -C ~/devs/devN/laboratorio-claude-code config core.sshCommand "ssh -i ~/.ssh/id_ed25519_devN -o IdentitiesOnly=yes"
#    → cadastrar o .pub em https://github.com/settings/ssh/new, logado na conta do dev

# 2. E-mail interno do GitHub (liga os commits ao perfil sem expor o e-mail real)
git -C ~/devs/devN/laboratorio-claude-code config user.email "<id>+<usuário>@users.noreply.github.com"

# 3. Colaborador com permissão Write (admin) e login do gh (cada conta autoriza o próprio código)
gh api -X PUT repos/ScaTecnologia-Lab2/laboratorio-claude-code/collaborators/<usuário> -f permission=push
gh auth login -h github.com -p ssh --skip-ssh-key -w
```

Contas criadas com e-mails `alexaugusto2+dev1@gmail.com` / `+dev2` — o Gmail entrega tudo na mesma caixa.
