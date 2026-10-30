#!/bin/sh
# ============================================================================
# instalar-argocd.sh — instala o Argo CD no cluster e registra a produção
# ----------------------------------------------------------------------------
# 1. Instala o Argo CD (versão fixa) no namespace argocd, a partir do
#    manifesto oficial do projeto.
# 2. Registra a Application k8s/argocd/application.yaml (produção GitOps).
# 3. Mostra a senha inicial do usuário admin do painel.
# Painel: sh scripts/k8s/painel-argocd.sh → https://localhost:8443
# ============================================================================
set -e
cd "$(dirname "$0")/../.."
VERSAO=v3.5.6

kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
# --server-side: os CRDs do Argo CD são grandes demais para o apply comum.
kubectl apply -n argocd --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/$VERSAO/manifests/install.yaml" >/dev/null
echo "Aguardando o Argo CD subir (1-3 min)..."
kubectl rollout status deployment/argocd-server -n argocd --timeout=300s
kubectl rollout status deployment/argocd-repo-server -n argocd --timeout=300s
kubectl rollout status statefulset/argocd-application-controller -n argocd --timeout=300s

kubectl apply -f k8s/argocd/application.yaml

echo
echo "Argo CD instalado. Usuário: admin   Senha inicial:"
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
echo
echo
echo "Abra o painel: sh scripts/k8s/painel-argocd.sh  →  https://localhost:8443"
