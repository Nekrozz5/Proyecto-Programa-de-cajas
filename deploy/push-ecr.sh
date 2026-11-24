#!/usr/bin/env bash
set -euo pipefail

TAG="${1:-}"
COMMIT="${2:-}"
REGION="us-east-2"
REPOSITORY="programa-cajas"
REGISTRY="919800783621.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${REPOSITORY}"

if command -v aws >/dev/null 2>&1; then
  AWS_CLI="aws"
elif command -v aws.exe >/dev/null 2>&1; then
  AWS_CLI="aws.exe"
else
  echo "No se encontro AWS CLI. Instala aws en WSL o habilita aws.exe." >&2
  exit 1
fi

# Evita el helper de credenciales de Windows, que puede fallar desde WSL.
DOCKER_CONFIG_TMP="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG_TMP"' EXIT
export DOCKER_CONFIG="$DOCKER_CONFIG_TMP"

if [[ -z "$TAG" || ! "$TAG" =~ ^(v[0-9]+\.[0-9]+\.[0-9]+|build-[A-Za-z0-9._-]+)$ ]]; then
  echo "Uso: $0 vMAJOR.MINOR.PATCH [commit]" >&2
  exit 1
fi

docker info >/dev/null
"$AWS_CLI" ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

docker build -t "${REPOSITORY}:${TAG}" .
docker tag "${REPOSITORY}:${TAG}" "${IMAGE}:${TAG}"
docker push "${IMAGE}:${TAG}"

if [[ -n "$COMMIT" ]]; then
  if [[ ! "$COMMIT" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Commit invalido." >&2
    exit 1
  fi
  docker tag "${REPOSITORY}:${TAG}" "${IMAGE}:commit-${COMMIT}"
  docker push "${IMAGE}:commit-${COMMIT}"
fi

"$AWS_CLI" ecr describe-images \
  --repository-name "$REPOSITORY" \
  --image-ids "imageTag=${TAG}" \
  --region "$REGION"
