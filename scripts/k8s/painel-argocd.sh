#!/bin/sh
# ============================================================================
# painel-argocd.sh — abre um "túnel" até o painel web do Argo CD
# ----------------------------------------------------------------------------
# port-forward: liga a porta 8443 do seu computador ao Service argocd-server
# dentro do cluster, enquanto este comando estiver rodando (Ctrl+C fecha).
# O certificado é autoassinado: o navegador vai avisar — pode prosseguir.
# Usuário admin; senha:
#   kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
# ============================================================================
echo "Painel do Argo CD em https://localhost:8443  (Ctrl+C para fechar)"
kubectl port-forward -n argocd svc/argocd-server 8443:443
