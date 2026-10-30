#!/bin/sh
# ============================================================================
# dev-deploy.sh — publica o SEU código atual no ambiente DEV do cluster
# ----------------------------------------------------------------------------
# O ciclo de um desenvolvedor, sem Docker Hub e sem CI:
#   1. docker build          → gera as imagens com a tag "dev"
#   2. k3d image import      → copia as imagens para dentro dos nós do cluster
#   3. kubectl apply -k      → aplica os manifestos do overlay dev
#   4. kubectl rollout restart → recria os pods para pegarem a imagem nova
#      (a tag "dev" não muda, então o Kubernetes não perceberia sozinho)
#
# Uso: sh scripts/k8s/dev-deploy.sh            (os 3 serviços)
#      sh scripts/k8s/dev-deploy.sh backend    (só um: frontend|backend|fornecedores)
# Acesse: http://localhost:8081
# ============================================================================
set -e
cd "$(dirname "$0")/../.."

SERVICOS=${1:-"frontend backend fornecedores"}
NS=labsystem-dev

for s in $SERVICOS; do
  case $s in
    frontend)     arq=Dockerfile.frontend ;;
    backend)      arq=Dockerfile ;;
    fornecedores) arq=Dockerfile.python ;;
    *) echo "Serviço desconhecido: $s (use frontend, backend ou fornecedores)"; exit 1 ;;
  esac
  echo "==> [1/2] build de labsystem-$s:dev ($arq)"
  docker build -q -f "$arq" -t "labsystem-$s:dev" . >/dev/null
  echo "==> [2/2] importando labsystem-$s:dev para os nós do cluster"
  k3d image import "labsystem-$s:dev" -c labsystem >/dev/null
done

echo "==> aplicando k8s/overlays/dev no namespace $NS"
kubectl apply -k k8s/overlays/dev

for s in $SERVICOS; do
  kubectl rollout restart deployment/"$s" -n $NS >/dev/null
done
for s in $SERVICOS; do
  kubectl rollout status deployment/"$s" -n $NS --timeout=180s
done

echo
kubectl get pods -n $NS -o wide
echo
echo "Pronto: http://localhost:8081"
