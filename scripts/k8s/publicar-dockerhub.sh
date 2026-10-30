#!/bin/sh
# ============================================================================
# publicar-dockerhub.sh — publica as 3 imagens no Docker Hub À MÃO
# ----------------------------------------------------------------------------
# Serve para entender o que o job `publish` do CI faz, e para a 1ª carga.
# No dia a dia, quem publica é a esteira (docker-build.yml, disparo manual).
#
# Antes, uma vez: docker login   (usuário + access token do Docker Hub)
# Uso: sh scripts/k8s/publicar-dockerhub.sh <usuario> [tag]
#      tag padrão: SHA curto do commit atual. Também publica a tag "latest".
# Depois: https://hub.docker.com/u/<usuario>
# ============================================================================
set -e
cd "$(dirname "$0")/../.."

USUARIO=$1
[ -n "$USUARIO" ] || { echo "Uso: $0 <usuario-dockerhub> [tag]"; exit 1; }
TAG=${2:-$(git rev-parse --short HEAD)}

for par in frontend:Dockerfile.frontend backend:Dockerfile fornecedores:Dockerfile.python; do
  s=${par%%:*}; arq=${par##*:}
  img=docker.io/$USUARIO/labsystem-$s
  echo "==> $img:$TAG  ($arq)"
  docker build -q -f "$arq" -t "$img:$TAG" -t "$img:latest" . >/dev/null
  docker push -q "$img:$TAG"
  docker push -q "$img:latest"
done
echo
echo "Publicado. Teste em qualquer máquina com Docker:"
echo "  DOCKERHUB_USUARIO=$USUARIO TAG=$TAG docker compose -f docker-compose.hub.yml up -d"
