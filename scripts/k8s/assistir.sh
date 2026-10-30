#!/bin/sh
# ============================================================================
# assistir.sh — painel ao vivo no terminal: HPA, pods (e em qual nó), CPU
# ----------------------------------------------------------------------------
# Uso: sh scripts/k8s/assistir.sh [dev|producao]     (Ctrl+C para sair)
# ============================================================================
case ${1:-dev} in
  dev)      NS=labsystem-dev ;;
  producao) NS=labsystem ;;
  *) echo "Use dev ou producao"; exit 1 ;;
esac
while :; do
  clear
  echo "=== $NS — $(date +%T)   (Ctrl+C para sair) ==="
  echo; echo "--- Autoescala (HPA): uso de CPU / meta e réplicas ---"
  kubectl get hpa -n $NS
  echo; echo "--- Pods e o nó onde cada um roda ---"
  kubectl get pods -n $NS -o wide --no-headers | awk '{printf "%-34s %-18s %s\n", $1, $3, $7}'
  echo; echo "--- Consumo real dos pods (metrics-server) ---"
  kubectl top pods -n $NS 2>/dev/null
  sleep 3
done
