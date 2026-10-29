#!/bin/sh
# ============================================================================
# destruir-cluster.sh — para ou apaga o cluster local
# ----------------------------------------------------------------------------
#   sh scripts/k8s/destruir-cluster.sh        → só PARA (libera CPU/RAM; dados ficam)
#   sh scripts/k8s/destruir-cluster.sh tudo   → APAGA o cluster e seus dados
# Para voltar depois de parar: sh scripts/k8s/criar-cluster.sh
# ============================================================================
set -e
if [ "$1" = "tudo" ]; then
  k3d cluster delete labsystem
else
  k3d cluster stop labsystem
fi
