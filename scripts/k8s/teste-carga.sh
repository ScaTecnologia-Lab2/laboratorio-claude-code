#!/bin/sh
# ============================================================================
# teste-carga.sh — gera grande demanda e mostra o Kubernetes escalando
# ----------------------------------------------------------------------------
# Uso: sh scripts/k8s/teste-carga.sh [dev|producao] [usuarios_no_pico] [minutos]
#      sh scripts/k8s/teste-carga.sh                 → dev, 60 usuários, 4 min
#      sh scripts/k8s/teste-carga.sh producao 100 6
#
# Recomendado: em OUTRO terminal, assista ao vivo enquanto a carga roda:
#      sh scripts/k8s/assistir.sh dev
#
# Ao terminar, este script grava a evolução das réplicas em
# relatorio-carga-<ambiente>.txt (fora do Git).
# ============================================================================
set -e
cd "$(dirname "$0")/../.."

AMB=${1:-dev}
PICO=${2:-60}
MIN=${3:-4}
case $AMB in
  dev)      NS=labsystem-dev; PORTA=8081 ;;
  producao) NS=labsystem;     PORTA=8080 ;;
  *) echo "Ambiente desconhecido: $AMB (use dev ou producao)"; exit 1 ;;
esac
REL="relatorio-carga-$AMB.txt"

echo "Alvo: http://localhost:$PORTA ($NS) — pico de $PICO usuários, $MIN minutos"
echo "Réplicas ANTES:"; kubectl get hpa -n $NS

# Em segundo plano: anota as réplicas a cada 15s enquanto o k6 roda.
( while :; do
    printf '%s ' "$(date +%T)"
    kubectl get hpa -n $NS --no-headers 2>/dev/null \
      | awk '{printf "%s=%s(cpu %s)  ", $1, $(NF-1), $4}'
    echo
    sleep 15
  done ) > "$REL" &
MONITOR=$!
trap 'kill $MONITOR 2>/dev/null' EXIT

# k6 em container; --network host para enxergar o localhost:<porta> do cluster.
docker run --rm -i --network host \
  -e ALVO="http://localhost:$PORTA" -e PICO="$PICO" -e MINUTOS="$MIN" \
  grafana/k6:2.3.0 run --quiet - < scripts/k8s/carga.js || true

echo
echo "Evolução das réplicas durante o teste ($REL):"
cat "$REL"
echo
echo "A carga acabou. Em ~1-2 min o HPA reduz de volta ao mínimo (2):"
echo "  kubectl get hpa -n $NS -w"
