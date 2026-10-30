#!/bin/sh
# ============================================================================
# criar-cluster.sh — cria o cluster Kubernetes local "labsystem" com k3d
# ----------------------------------------------------------------------------
# 1 servidor (control plane: o "cérebro" que decide onde cada pod roda)
# + 2 agentes (workers: as "máquinas" que executam os pods).
# Cada nó é um container Docker — veja com: docker ps --filter name=k3d-labsystem
#
# Portas publicadas no seu computador pelo load balancer do k3d:
#   8080 → Service LoadBalancer do frontend em PRODUÇÃO (namespace labsystem)
#   8081 → Service LoadBalancer do frontend em DEV      (namespace labsystem-dev)
#
# Traefik (Ingress padrão do k3s) desligado: usamos Service LoadBalancer
# direto, e isso economiza memória.
# Uso: sh scripts/k8s/criar-cluster.sh
# ============================================================================
set -e

if k3d cluster list labsystem >/dev/null 2>&1; then
  echo "Cluster 'labsystem' já existe. Iniciando (se estiver parado)..."
  k3d cluster start labsystem
else
  k3d cluster create labsystem \
    --servers 1 --agents 2 \
    -p "8080:8080@loadbalancer" \
    -p "8081:8081@loadbalancer" \
    --k3s-arg "--disable=traefik@server:0" \
    --wait
fi

kubectl config use-context k3d-labsystem

# O DNS do cluster (CoreDNS) vem com 1 cópia só. Se o nó dele cair, nenhum pod
# novo consegue resolver nomes como "backend" — um ponto único de falha
# descoberto no teste de queda de nó. 2 cópias, em nós diferentes, resolvem.
kubectl scale deployment coredns -n kube-system --replicas=2
kubectl rollout status deployment coredns -n kube-system --timeout=120s
echo
kubectl get nodes -o wide
