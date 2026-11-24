param(
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [string]$Commit = ""
)

$ErrorActionPreference = "Stop"
$Region = "us-east-2"
$Repository = "programa-cajas"
$Registry = "919800783621.dkr.ecr.$Region.amazonaws.com"
$Image = "$Registry/$Repository"

if ($Tag -notmatch '^(v\d+\.\d+\.\d+|build-[A-Za-z0-9._-]+)$') {
  throw "Tag invalido. Usa vMAJOR.MINOR.PATCH o build-<identificador>."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop no esta ejecutando el motor Linux. Abre Docker Desktop y espera a que indique 'Running'."
}

aws ecr get-login-password --region $Region |
  docker login --username AWS --password-stdin $Registry
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo autenticar Docker contra ECR."
}

docker build --tag "$Repository`:$Tag" .
if ($LASTEXITCODE -ne 0) {
  throw "La construccion de la imagen fallo."
}

docker tag "$Repository`:$Tag" "$Image`:$Tag"
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo etiquetar la imagen para ECR."
}

docker push "$Image`:$Tag"
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo publicar la imagen versionada en ECR."
}

if ($Commit -ne "") {
  if ($Commit -notmatch '^[A-Za-z0-9._-]+$') {
    throw "Commit invalido. Usa solo letras, numeros, punto, guion o guion bajo."
  }
  $CommitTag = "commit-$Commit"
  docker tag "$Repository`:$Tag" "$Image`:$CommitTag"
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo crear el tag de commit."
  }

  docker push "$Image`:$CommitTag"
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo publicar el tag de commit en ECR."
  }
}

aws ecr describe-images --repository-name $Repository --image-ids imageTag=$Tag --region $Region
