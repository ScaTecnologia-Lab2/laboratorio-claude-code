# Simulando grande demanda — ver o Kubernetes escalar (e aguentar falhas)

> **Pré-requisito:** cluster criado e ambiente dev no ar (`docs/CONTAINERS_K8S_GUIA.md`, Parte 5):
> `sh scripts/k8s/criar-cluster.sh && sh scripts/k8s/dev-deploy.sh`
>
> Todos os números deste guia foram medidos de verdade nesta máquina (4 CPUs, 8 GB) em 2026-10-29.

---

## Parte 1 — Como a autoescala funciona

```
   k6 (gerador de carga) ──► LoadBalancer ──► pods frontend ──► pods backend ──► pods fornecedores
                                                   ▲                 ▲                  ▲
   metrics-server: mede a CPU de cada pod a cada ~15s                │                  │
                                                   │                 │                  │
   HPA: "a média passou da meta?" ── sim ──► aumenta as réplicas do Deployment ─────────┘
                                    não, por 60s ──► diminui (até o mínimo)
```

O **HorizontalPodAutoscaler** (`k8s/base/escala-e-resiliencia.yaml`) compara o uso de CPU com o **`requests.cpu`** declarado em cada Deployment:

| Serviço | `requests.cpu` | Meta | Mín → Máx |
|---|---|---|---|
| backend | 100m (0,1 CPU) | 50% = 50m | 2 → 6 |
| fornecedores | 50m | 50% = 25m | 2 → 4 |
| frontend | 20m | 50% = 10m | 2 → 4 |

**A conta do HPA:** `réplicas desejadas = réplicas atuais × (uso atual ÷ meta)`, arredondado para cima e limitado ao máximo.
Exemplo real do teste: o backend tinha 2 pods a 156% da meta → `2 × 156/50 = 6,2` → **6 pods** (o máximo).

- **Escala horizontal** (mais pods) × **vertical** (pods maiores): o HPA faz a horizontal. Ela só funciona porque os serviços são *stateless* (Parte 1.2 do guia de containers).
- **`requests` são essenciais:** sem eles o HPA não tem com o que comparar. Eles também dizem ao Kubernetes quanto cada pod "reserva" num nó.
- **Para descer, o HPA espera 60s** com uso baixo (`stabilizationWindowSeconds`). O padrão é 300s, e em produção janelas maiores evitam o efeito "sanfona" (sobe/desce sem parar). Aqui reduzimos para a demonstração não demorar.

---

## Parte 2 — Rodar a simulação

**Terminal 1 — o painel ao vivo:**

```bash
sh scripts/k8s/assistir.sh dev        # HPA, pods (e em qual nó) e CPU, a cada 3s
```

**Terminal 2 — a carga:**

```bash
sh scripts/k8s/teste-carga.sh                    # dev, 60 usuários no pico, 4 minutos
sh scripts/k8s/teste-carga.sh dev 100 6          # mais pesado
sh scripts/k8s/teste-carga.sh producao 60 4      # contra a produção (:8080)
```

O que acontece:

1. O **k6** (Grafana) roda num container, sem instalar nada. Ele faz login uma vez e espalha o cookie para todos os "usuários virtuais" (VUs).
2. Cada VU repete sem parar: `GET /clientes` → `GET /fornecedores` → `GET /me`.
3. Os usuários sobem em degraus (`scripts/k8s/carga.js`, `stages`): 25% do tempo aquecendo com 1/3 do pico, 25% subindo até o pico, 35% no pico, 15% caindo a zero.
4. Em segundo plano, o script anota as réplicas a cada 15s e imprime a evolução no fim (também grava `relatorio-carga-<ambiente>.txt`, fora do Git).

**Quer ver no navegador também?** Durante o teste, abra http://localhost:8081 e navegue. O sistema deve continuar respondendo.

---

## Parte 3 — Lendo o resultado do k6

| Linha | Significado | Bom sinal |
|---|---|---|
| `checks` ✓/✗ | % das respostas com status 200 | 100% |
| `http_req_failed` | % de requisições com erro | < 2% (critério do script) |
| `http_req_duration` p(95) | 95% das respostas foram mais rápidas que isto | < 2s (critério do script) |
| `http_reqs` …/s | vazão: requisições por segundo | quanto maior, melhor |
| `vus` | usuários virtuais simultâneos | chegou ao pico configurado |

Se algum critério falhar, o k6 avisa `thresholds ... have been crossed`. É o equivalente a um teste vermelho.

---

## Parte 4 — O que aconteceu de verdade (e a lição mais importante)

### 1ª rodada: escalou, mas falhou

```
17:22:24 backend=2(cpu 66%)   fornecedores=2(cpu 266%)  frontend=2(cpu 42%)
17:22:40 backend=3(cpu 113%)  fornecedores=4(cpu 352%)  frontend=2(cpu 95%)
17:22:55 backend=5(cpu 89%)   fornecedores=4(cpu 433%)  frontend=4(cpu 90%)
...
http_req_failed: 3.13% (476 de 15.178)   p(95)=2.18s   84 req/s    ✗ critérios
/fornecedores: 92% de sucesso
```

O HPA fez a parte dele (2→5 backends, 2→4 nos outros dois). Mesmo assim, o `fornecedores` ficou a **433% da meta já no máximo de pods**, e 8% das chamadas a ele falharam. Nos logs:

```
psycopg2.OperationalError: could not translate host name "postgres" to address
```

**Diagnóstico:** a API Python abria **uma conexão nova com o banco a cada requisição**. Cada conexão nova = consulta DNS + handshake + autenticação. Sob carga, foram milhares de consultas DNS por minuto: o DNS do cluster engasgou, e a CPU do Python foi gasta abrindo conexões. Mais pods abriam ainda **mais** conexões, ou seja, escalar piorava o problema.

**Correção (no código, não no Kubernetes):** um *pool* de conexões (`psycopg2.pool.ThreadedConnectionPool`, que já vem no `psycopg2`). Poucas conexões abertas, reaproveitadas, mais um semáforo para requisições excedentes esperarem a vez em vez de falhar. O backend Node já fazia isso (`pg.Pool`), por isso não sofreu.

### 2ª rodada, mesma carga: passou

```
17:27:41 backend=2(cpu 156%)  fornecedores=2(cpu 254%)  frontend=2(cpu 72%)
17:27:57 backend=6(cpu 168%)  fornecedores=4(cpu 401%)  frontend=3(cpu 225%)
17:28:27 backend=6(cpu 74%)   fornecedores=4(cpu 214%)  frontend=4(cpu 123%)
...
http_req_failed: 0.00% (0 de 26.587)   p(95)=1.32s   147 req/s   ✓ critérios
```

| | Antes do pool | Depois do pool |
|---|---|---|
| Erros | 3,13% | **0,00%** |
| Vazão | 84 req/s | **147 req/s** (+75%) |
| p95 | 2,18s ❌ | **1,32s** ✅ |

> **A lição:** autoescala multiplica o que o seu código faz, inclusive o que ele faz de errado. Antes de aumentar `maxReplicas`, descubra **qual recurso** está saturando (CPU? conexões? DNS? banco?). Testes de carga existem exatamente para achar isso **antes** dos usuários.

**Por que o `fornecedores` continua acima da meta?** Ele atingiu o máximo (4) e esta máquina tem só 4 CPUs para tudo: os 3 nós, o Argo CD **e** o próprio gerador de carga. Num cluster real, os próximos passos seriam aumentar `maxReplicas`, adicionar nós (*Cluster Autoscaler*) ou otimizar o código (gunicorn com vários workers no lugar do servidor de desenvolvimento do Flask).

### Depois da carga

Em ~1–2 minutos sem carga, o HPA volta tudo a 2 réplicas (`kubectl get hpa -n labsystem-dev -w`). Escalar para baixo é tão importante quanto escalar para cima: na nuvem, cada pod parado é dinheiro economizado.

---

## Parte 5 — Testes de resiliência (falhas de propósito)

Para cada teste, gere tráfego contínuo num terminal e cause a falha em outro:

```bash
# Terminal A — tráfego contínuo, contando sucessos e falhas por 50s
curl -s -c /tmp/cj -H 'Content-Type: application/json' \
  -d '{"email":"admin@labsystem.com","senha":"admin123"}' localhost:8081/login
ok=0; err=0; fim=$(( $(date +%s) + 50 ))
while [ $(date +%s) -lt $fim ]; do
  c=$(curl -s -m 2 -b /tmp/cj -o /dev/null -w '%{http_code}' localhost:8081/clientes)
  [ "$c" = 200 ] && ok=$((ok+1)) || err=$((err+1))
done; echo "$ok OK, $err falhas"
```

| # | Falha (Terminal B) | Resultado medido | O que entra em ação |
|---|---|---|---|
| 1 | `kubectl delete pod -n labsystem-dev <um pod backend>` | **509 OK, 0 falhas** | Service tira o pod do balanceamento; Deployment recria |
| 2 | `kubectl rollout restart deploy/backend deploy/fornecedores deploy/frontend -n labsystem-dev` | **1.571 OK, 0 falhas** | rolling update (`maxUnavailable: 0`) + readiness + `preStop` |
| 3 | `kubectl drain k3d-labsystem-agent-0 --ignore-daemonsets --delete-emptydir-data` (manutenção de um nó) e depois `kubectl uncordon k3d-labsystem-agent-0` | **2.828 OK, 0 falhas** | PodDisruptionBudget (`minAvailable: 1`) + `preStop` |
| 4 | `docker stop k3d-labsystem-agent-1` (um "servidor" morre de repente) e depois `docker start k3d-labsystem-agent-1` | ~45s com a maioria falhando; depois 100% | detecção de nó morto (~40s) + reagendamento (30s) |

### O que cada teste ensinou durante a construção

- **Teste 3, primeira tentativa: 294 falhas (11%).** O pod recebia o sinal de desligar e parava **na hora**, enquanto o Service ainda levava alguns segundos para tirá-lo do balanceamento. Correção: `lifecycle.preStop: sleep 5` — o pod continua atendendo por 5s enquanto sai da lista. Resultado: 0 falhas.
- **Teste 4: perder uma máquina não é como perder um pod.** Com o nó desligado em silêncio, ninguém avisa o cluster. O Kubernetes espera ~40s para declará-lo `NotReady`, para não reagir a um soluço de rede, e até lá ainda manda tráfego para os pods mortos. Em produção real, isso é amenizado com *retries* no cliente, health checks no balanceador da nuvem e nós em **zonas diferentes**.
- **Teste 4 também revelou um ponto único de falha na infraestrutura:** o DNS do cluster (CoreDNS) tinha **1 cópia, no nó desligado**. Pods novos não conseguiam resolver `backend`. Correção: CoreDNS com 2 cópias (`criar-cluster.sh`), e o nginx passou a resolver nomes em tempo de execução. Alta disponibilidade vale para tudo de que a aplicação depende.

---

## Parte 6 — Experimentos para fazer sozinho

| Experimento | Como | O que observar |
|---|---|---|
| Meta de CPU mais agressiva | em `escala-e-resiliencia.yaml`, `averageUtilization: 30`; `kubectl apply -k k8s/overlays/dev` | escala mais cedo e com mais pods |
| Sem limite de crescimento | `maxReplicas: 10` no backend | até onde a máquina aguenta? (pods `Pending` = faltou recurso no nó) |
| Sem autoescala | `kubectl delete hpa backend -n labsystem-dev` e rode a carga | latência sobe e erros aparecem; recrie com o `apply` |
| Pods "magros" | `limits.cpu: 100m` no backend | *throttling*: CPU travada no limite, respostas lentas |
| Pouca memória | `limits.memory: 40Mi` no backend | `OOMKilled` em `kubectl describe pod`; o Kubernetes reinicia |
| Carga em produção | `sh scripts/k8s/teste-carga.sh producao 60 4` + `assistir.sh producao` | mesmo comportamento: é a mesma base de manifestos |

> Experimentos em `k8s/` feitos direto no cluster de **produção** são **desfeitos pelo Argo CD** (`selfHeal`). Para mudar a produção de verdade, altere os arquivos, abra um PR e faça o deploy pela esteira (`docs/K8S_FLUXO_DEV_CICD.md`).
