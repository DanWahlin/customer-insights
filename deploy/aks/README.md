# Optional AKS deployment path

This folder contains a **separate, opt-in azd project** for running the Angular client, Express API, and PostgreSQL on Azure Kubernetes Service. It does **not** replace or modify the root `azure.yaml` flow. Run every `azd` command for this path from `deploy/aks/`.

## What this path provisions

- A dedicated resource group
- An AKS Standard-mode cluster (dev-sized: 2-node system pool, `Standard_D2s_v5`)
- Azure CNI Overlay with Cilium
- AKS Web App Routing, OIDC issuer, and Workload Identity enabled at cluster creation
- Azure Container Registry (Basic)
- Azure Database for PostgreSQL Flexible Server using PostgreSQL 18

This path **does not** provision Azure AI, Azure AI Search, ACS, or Entra app registrations. Reuse the values from your existing root deployment (or equivalent resources you manage yourself).

## Prerequisites

- Azure CLI
- Azure Developer CLI (`azd`)
- `kubectl`
- Docker
- Access to an Azure subscription

Recommended version checks:

```bash
az version
azd version
kubectl version --client
docker version
```

## 1) Create a separate azd environment

```bash
cd deploy/aks
az login
azd auth login
azd env new <aks-environment-name>
azd env set AZURE_LOCATION <azure-region>
azd env set AZURE_RESOURCE_GROUP rg-customer-insights-aks-<aks-environment-name>
azd env set POSTGRES_ADMIN_PASSWORD '<strong-postgres-password>'
```

Set the SPA build-time values that the client image needs:

```bash
azd env set NG_APP_API_URL /
azd env set ENTRAID_CLIENT_ID <spa-client-id>
azd env set ENTRAID_TENANT_ID <tenant-id>
azd env set ENTRAID_API_SCOPE <api-scope>
azd env set API_PORT 3000
azd env set TEAM_ID <optional-team-id>
azd env set CHANNEL_ID <optional-channel-id>
azd env set ACS_PHONE_NUMBER <optional-public-caller-id>
azd env set ACS_EMAIL_ADDRESS <optional-public-sender-address>
azd env set NG_APP_AI_ENABLED true
azd env set NG_APP_ACS_ENABLED true
azd env set NG_APP_ACS_EMAIL_ENABLED true
azd env set NG_APP_FOUNDRY_IQ_ENABLED true
```

> `NG_APP_API_URL=/` is intentional. It keeps the Angular app on the same origin and routes API traffic through the ingress `/api` path instead of trying to call port `3000` directly from the browser.

## 2) Provision the separate AKS infrastructure

For a first-time bootstrap, provision infrastructure first so you have the cluster, ACR, and PostgreSQL host values available before applying manifests and creating secrets:

```bash
azd provision
```

After the first bootstrap is complete, `azd up` from `deploy/aks/` is the end-to-end command for this AKS project.

Get the generated outputs:

```bash
azd env get-value AZURE_RESOURCE_GROUP
azd env get-value AZURE_AKS_CLUSTER_NAME
azd env get-value AZURE_CONTAINER_REGISTRY_ENDPOINT
azd env get-value ACR_NAME
azd env get-value POSTGRES_HOST
azd env get-value POSTGRES_DATABASE
```

Then attach your local kubeconfig to the new cluster:

```bash
az aks get-credentials \
  --resource-group "$(azd env get-value AZURE_RESOURCE_GROUP)" \
  --name "$(azd env get-value AZURE_AKS_CLUSTER_NAME)" \
  --overwrite-existing
```

## 3) Build and push the images to ACR

Choose a tag, then build the two images in ACR:

```bash
ACR_NAME="$(azd env get-value ACR_NAME)"
IMAGE_TAG="$(git rev-parse --short HEAD)"

az acr build \
  --registry "$ACR_NAME" \
  --image "server:${IMAGE_TAG}" \
  --file ../../server/typescript/Dockerfile \
  ../../server/typescript

az acr build \
  --registry "$ACR_NAME" \
  --image "client:${IMAGE_TAG}" \
  --file ../../client/Dockerfile \
  --build-arg NG_APP_API_URL=/ \
  --build-arg ENTRAID_CLIENT_ID="$(azd env get-value ENTRAID_CLIENT_ID)" \
  --build-arg ENTRAID_TENANT_ID="$(azd env get-value ENTRAID_TENANT_ID)" \
  --build-arg ENTRAID_API_SCOPE="$(azd env get-value ENTRAID_API_SCOPE)" \
  --build-arg API_PORT="$(azd env get-value API_PORT)" \
  --build-arg TEAM_ID="$(azd env get-value TEAM_ID)" \
  --build-arg CHANNEL_ID="$(azd env get-value CHANNEL_ID)" \
  --build-arg ACS_PHONE_NUMBER="$(azd env get-value ACS_PHONE_NUMBER)" \
  --build-arg ACS_EMAIL_ADDRESS="$(azd env get-value ACS_EMAIL_ADDRESS)" \
  --build-arg NG_APP_AI_ENABLED="$(azd env get-value NG_APP_AI_ENABLED)" \
  --build-arg NG_APP_ACS_ENABLED="$(azd env get-value NG_APP_ACS_ENABLED)" \
  --build-arg NG_APP_ACS_EMAIL_ENABLED="$(azd env get-value NG_APP_ACS_EMAIL_ENABLED)" \
  --build-arg NG_APP_FOUNDRY_IQ_ENABLED="$(azd env get-value NG_APP_FOUNDRY_IQ_ENABLED)" \
  ../../client
```

The checked-in deployments use the portable image names `server` and `client`. Do not commit environment-specific ACR names or tags. `azd deploy` replaces these names with the images it publishes. For the manual bootstrap flow below, update the live Deployments with `kubectl set image` after applying the manifests.

## 4) Create the namespace and the server Secret

Create the namespace first:

```bash
kubectl apply -f k8s/namespace.yaml
```

`examples/server-secret.yaml` is a reference template outside the applied manifest tree. Create the real `server-secrets` secret instead:

```bash
kubectl create secret generic server-secrets \
  --namespace customer-insights \
  --from-literal=POSTGRES_USER=<postgres-admin-username> \
  --from-literal=POSTGRES_PASSWORD='<postgres-admin-password>' \
  --from-literal=POSTGRES_HOST="$(azd env get-value POSTGRES_HOST)" \
  --from-literal=POSTGRES_DATABASE="$(azd env get-value POSTGRES_DATABASE)" \
  --from-literal=POSTGRES_PORT=5432 \
  --from-literal=ENTRAID_TENANT_ID=<tenant-id> \
  --from-literal=ENTRAID_API_CLIENT_ID=<api-app-client-id> \
  --from-literal=ENTRAID_CLIENT_ID=<spa-client-id> \
  --from-literal=ENTRAID_API_SCOPE=<api-scope> \
  --from-literal=AI_ENDPOINT=<optional-model-endpoint> \
  --from-literal=AI_API_KEY=<optional-model-api-key> \
  --from-literal=AI_MODEL=gpt-5-mini \
  --from-literal=AI_EMBEDDING_MODEL=text-embedding-3-small \
  --from-literal=AZURE_AI_SEARCH_ENDPOINT=<optional-search-endpoint> \
  --from-literal=AZURE_AI_SEARCH_KEY=<optional-search-key> \
  --from-literal=AZURE_AI_SEARCH_INDEX=customer-documents-index \
  --from-literal=AZURE_AI_SEARCH_KNOWLEDGE_SOURCE=customer-documents-ks \
  --from-literal=AZURE_AI_SEARCH_KNOWLEDGE_BASE=customer-documents-kb \
  --from-literal=DOCUMENT_REPOSITORY_URL=https://github.com/DanWahlin/customer-insights/blob/main/ \
  --from-literal=ACS_CONNECTION_STRING=<optional-acs-connection-string> \
  --from-literal=ACS_PHONE_NUMBER=<optional-acs-phone-number> \
  --from-literal=ACS_EMAIL_ADDRESS=<optional-acs-email-address> \
  --from-literal=CUSTOMER_EMAIL_ADDRESS=<optional-approved-test-email> \
  --from-literal=CUSTOMER_PHONE_NUMBER=<optional-approved-test-phone>
```

The current Express startup path still runs `initializeDb()` before the API begins listening, so the deployment needs the PostgreSQL administrator login/password. The code creates or updates the `app_runtime` role internally using that password.

## 5) Run the existing DB schema/seed once

The repository already contains the DB bootstrap logic in `server/typescript/initDatabase.ts`. This Docker/AKS path adds `npm run init-db` and compiles it into the server image so you can run the same initializer as a one-off job:

```bash
kubectl create job init-db \
  --namespace customer-insights \
  --image "<acr-login-server>/server:${IMAGE_TAG}" \
  -- /bin/sh -c "node dist/scripts/init-db.js"
kubectl logs --namespace customer-insights job/init-db
```

> The server pods also perform the same initialization during startup. Running the one-off job first just removes that work from the first readiness cycle and makes failures easier to inspect.

## 6) Apply the manifests

```bash
kubectl apply -f k8s/ --recursive

ACR_ENDPOINT="$(azd env get-value AZURE_CONTAINER_REGISTRY_ENDPOINT)"
kubectl set image deployment/server \
  --namespace customer-insights \
  server="${ACR_ENDPOINT}/server:${IMAGE_TAG}"
kubectl set image deployment/client \
  --namespace customer-insights \
  client="${ACR_ENDPOINT}/client:${IMAGE_TAG}"
```

The manifests include:

- namespace
- service accounts
- config maps
- deployments
- services
- ingresses
- HPAs
- PDBs
- network policies

The two ingress resources intentionally omit `host` so the first deployment can be reached through the external IP. Add a hostname and TLS later if needed.

## 7) Verify the deployment

Get the ingress address:

```bash
kubectl get ingress -n customer-insights
```

Verify:

```bash
curl "http://<external-ip>/api/health"
open "http://<external-ip>/"
```

The browser and API share the ingress origin, so no environment-specific CORS origin is required. `/api/health` returns `503` while `initializeDb()` is running, then `200` when the API is ready.

## 8) Cleanup

This is a **separate azd environment and resource group** from the root project. Clean it up only from `deploy/aks/`:

```bash
azd down
```

That removes only the AKS-path resource group for this environment. It does not touch the root `azure.yaml` deployment unless you explicitly run commands from the repository root against that other environment.
