# Customer Insights with Microsoft Graph, Foundry IQ, and ACS

This sample combines customer data with Microsoft 365 context, grounded document answers, generative AI, and customer communications. The web client, API, and PostgreSQL database can be run locally. Azure supplies the AI, search, and communication capabilities.

The sample began as a Microsoft Learn tutorial and has since been modernized:

- Angular 22 and Express 5
- Direct MSAL Browser and Microsoft Graph Client calls instead of the deprecated Microsoft Graph Toolkit
- A native account menu with the signed-in user's name, email, and sign-out action
- Microsoft Foundry models and Foundry IQ instead of Azure OpenAI On Your Data
- Azure AI Search Free for the proof-of-concept document index and knowledge base
- PostgreSQL-backed natural-language queries with read-only generated SQL execution
- Local progress states for document answers and generated email/SMS drafts

## What the app demonstrates

| Area | Capability |
| --- | --- |
| Customer data | Browse seeded PostgreSQL customer and order data; generate a parameterized read-only query from natural language. |
| Microsoft Graph | Search files, mail, calendar events, and Teams messages; post to an explicitly configured Teams channel. |
| Foundry IQ | Ask questions over the repository's customer documents and receive grounded answers with citations. |
| Generative AI | Generate SQL plus customer-specific email and SMS drafts with `gpt-5-mini`. |
| Azure Communication Services | Create browser calling identities and send approved email or SMS messages to server-configured test destinations. |

## Architecture

```text
Local browser
  └─ Angular 22
      ├─ MSAL Browser → Microsoft Graph and local API delegated tokens
      ├─ ACS Calling SDK → Azure Communication Services
      └─ Local Express 5 API
          ├─ Foundry IQ → Azure AI Search Free
          │   └─ gpt-5-mini → grounded answer and citations
          ├─ gpt-5-mini → SQL and email/SMS drafts
          ├─ text-embedding-3-small → document indexing
          ├─ Local PostgreSQL 18
          └─ ACS Email and SMS SDKs
```

The browser receives only public configuration plus delegated Microsoft Graph and Customer Insights API tokens. AI, Search, database, and ACS credentials stay in the local Express process.

## Prerequisites

### Local application

- Node.js 24.15 or later
- npm
- Git
- Docker, Podman, or another Compose-compatible container runtime for PostgreSQL
- A Microsoft 365 tenant for the Graph scenarios

### Azure dependency deployment

These tools are needed only when provisioning or updating Foundry and Search:

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- An Azure subscription with model quota in the selected region

The `azd` project does **not** deploy Angular, Express, PostgreSQL, Entra ID, or Azure Communication Services. Those remain local or separately managed.

The deployment path was validated with Azure CLI 2.88, Azure Developer CLI 1.28, and Bicep CLI 0.46.1. Newer compatible versions are appropriate. Model versions and Global Standard quota must also be available in the selected region and subscription.

## Configure the environment

Copy the template from the repository root:

```bash
cp .env.example .env
```

`.env` and `.azure/` are ignored by Git. Keep `.env` private; it contains credentials.

| Variable | Purpose |
| --- | --- |
| `ENTRAID_CLIENT_ID`, `ENTRAID_TENANT_ID` | SPA registration and tenant used by MSAL Browser. |
| `ENTRAID_API_CLIENT_ID`, `ENTRAID_API_SCOPE` | Protected Express API registration and delegated `access_as_user` scope. |
| `TEAM_ID`, `CHANNEL_ID` | Optional destination for Teams channel posting. |
| `AI_API_KEY`, `AI_ENDPOINT` | Azure AI Services key and OpenAI-compatible endpoint. |
| `AI_MODEL`, `AI_EMBEDDING_MODEL` | Deployment names. Defaults are `gpt-5-mini` and `text-embedding-3-small`. |
| `AZURE_AI_SEARCH_*` | Search endpoint, admin key, index, knowledge source, and knowledge base names. |
| `DOCUMENT_REPOSITORY_URL` | Base URL used for document citation links. |
| `POSTGRES_*` | Local PostgreSQL connection and Compose settings. |
| `ACS_CONNECTION_STRING`, `ACS_PHONE_NUMBER`, `ACS_EMAIL_ADDRESS` | ACS resource configuration. |
| `CUSTOMER_EMAIL_ADDRESS`, `CUSTOMER_PHONE_NUMBER` | Deliberate server-side test destinations for sends. |
| `API_HOST`, `API_PORT`, `CLIENT_ORIGIN`, `NG_APP_API_URL` | Local API binding, CORS origin, and browser API URL. |

The Angular environment generator derives feature flags from these values. It never writes AI, Search, database, or ACS credentials into the browser bundle.

## Provision Foundry and Search with azd

The checked-in Bicep creates only these Azure dependencies:

- Azure AI Services `S0` account with a system-assigned identity
- Microsoft Foundry project
- `gpt-5-mini` Global Standard deployment
- `text-embedding-3-small` Global Standard deployment
- Azure AI Search Free with free semantic and knowledge-retrieval plans

Model deployment capacity is throughput quota, not reserved monthly capacity. Model and embedding usage is consumption billed. Search Free has proof-of-concept limits and no SLA. A subscription can have only one Free Search service.

### Create a fresh environment

From the repository root:

```bash
az login
azd auth login
azd env new talk
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION southcentralus
node scripts/prepare-azd-env.mjs
azd provision --preview
azd up
```

`prepare-azd-env.mjs` creates deterministic, collision-resistant AI and Search names. You can override any generated value before `azd up`:

```bash
azd env set AZURE_RESOURCE_GROUP <dedicated-resource-group>
azd env set AI_ACCOUNT_NAME <globally-unique-ai-account>
azd env set AI_PROJECT_NAME <project-name>
azd env set AZURE_AI_SEARCH_SERVICE_NAME <globally-unique-search-name>
```

`azd up` provisions infrastructure only because the application remains local.

Verify the resulting names with `azd env get-values`, then inspect the resources:

```bash
az cognitiveservices account deployment list --subscription <subscription-id> --resource-group <resource-group> --name <ai-account> --output table
az cognitiveservices account project show --subscription <subscription-id> --resource-group <resource-group> --name <ai-account> --project-name <project-name>
az search service show --subscription <subscription-id> --resource-group <resource-group> --name <search-service>
```

Both model deployments and the project must report `Succeeded`; Search must report `running` with SKU `free`.

### Adopt the existing talk resources

Create or select a separate azd environment, then set the exact subscription, location, resource group, and resource names. Do this only for resources dedicated to this sample:

```bash
azd env new talk-existing
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_RESOURCE_GROUP <existing-resource-group>
azd env set AZURE_LOCATION <existing-resource-location>
azd env set AI_ACCOUNT_NAME <existing-ai-account>
azd env set AI_PROJECT_NAME <existing-project>
azd env set AZURE_AI_SEARCH_SERVICE_NAME <existing-search-service>
azd provision --preview
azd provision
node scripts/configure-local-env.mjs
```

All adopted resources must be in the configured location. The template also manages the resource-group, AI-account, and Search tags. Review the preview before applying it.

**Do not use `azd down` on an environment that adopts live talk resources.** It deletes the entire adopted resource group and purges the AI account. Never point this template at an unrelated or shared resource group.

### Copy provisioned settings into `.env`

After `azd up` or `azd provision` succeeds:

```bash
node scripts/configure-local-env.mjs
```

The script retrieves the AI and Search keys from the subscription selected by azd, updates only the related entries in the ignored root `.env`, enforces file mode `0600` on POSIX systems, and does not print secret values.

### Build the Foundry IQ index

Provisioning creates the Azure resources but does not upload the repository documents. From `server/typescript`:

```bash
npm ci
npm run setup:foundry-iq
```

The repeatable setup command:

1. Extracts text from the sample DOCX and XLSX files.
2. Skips the intentionally empty workbook.
3. Splits the content into overlapping chunks.
4. Generates 1,536-dimension embeddings.
5. Creates or updates the Search index, knowledge source, and knowledge base.
6. Removes stale chunks and uploads the current corpus.
7. Performs a live retrieval and requires at least one reference.

## Configure Microsoft Entra ID and Graph

Create or reuse an Entra app registration with the **Single-page application** platform.

Set `ENTRAID_TENANT_ID` for a single-tenant registration. Leave it empty only when the registration is multitenant and should use the `organizations` authority.

For local development, add this exact SPA redirect URI:

```text
http://localhost:4200
```

`http://localhost` is a browser secure-context exception. Any non-localhost origin, including a LAN or Tailscale hostname, must use HTTPS and must be added as its own exact SPA redirect URI.

Add these delegated Microsoft Graph permissions and grant consent where required:

- `User.Read`
- `Files.Read.All`
- `Mail.Read`
- `Calendars.Read`
- `Chat.Read`
- `ChannelMessage.Read.All`
- `ChannelMessage.Send`

The client uses direct Graph calls. Cached startup is silent-only, and interactive authentication starts only after the user selects **Sign in**. MSAL Browser 5 popup callbacks use its redirect bridge so the authentication popup returns the result to the main window and closes instead of booting a second copy of the app.

Protect the local Express API with a separate, single-tenant Entra app registration:

1. Set its Application ID URI to `api://<API-client-id>`.
2. Add and enable an `access_as_user` delegated scope.
3. Set `api.requestedAccessTokenVersion` to `2` in the API registration manifest.
4. Add that delegated permission to the SPA registration and grant tenant consent.
5. Set `ENTRAID_API_CLIENT_ID` to the API registration's Application client ID and `ENTRAID_API_SCOPE` to `api://<API-client-id>/access_as_user`.

No API client secret is required. The SPA silently acquires a separate API token after Microsoft sign-in. Express accepts that token only in the `Authorization` header and validates its signature, v2 issuer, API audience, tenant, authorized SPA client (`azp`), expiration, and `access_as_user` scope. `/api/health` remains public; every customer, AI, Foundry IQ, and ACS endpoint requires the delegated token and returns `401` or `403` when authorization fails.

`TEAM_ID` and `CHANNEL_ID` are optional. Both are required before the channel-posting feature is enabled.

## Configure Azure Communication Services

Use an existing ACS resource configured with the capabilities you want to demonstrate:

- A phone number for calling and SMS
- A connected email domain and sender address
- An ACS connection string

Set `CUSTOMER_EMAIL_ADDRESS` and `CUSTOMER_PHONE_NUMBER` to deliberate email and SMS test destinations. Those handlers ignore browser-supplied destinations and send only to the server-configured values.

Calling identity/token creation does not contact a customer. Selecting **Call** does place a real outbound call to the number shown in the editable call field, and the browser VoIP token can place PSTN calls allowed by the ACS resource. Calls, email, and SMS can incur charges, so use deliberate test destinations and keep the API private. Phone-number rental and communication usage are billed through the separately managed ACS resource.

The API is loopback-only by default, requires a validated delegated Entra token for every business endpoint, and applies in-memory rate limits to AI and communication endpoints. Codespace setup explicitly keeps ports 3000, 4200, and 5432 private; do not change their visibility to public. Authentication does not make this local demonstration a production hosting architecture. The ACS phone number is public client configuration needed by the calling UI; the ACS connection string remains server-side. Email and SMS handlers wait for real ACS operation results rather than returning fabricated success.

## Run locally

### 1. Install dependencies

```bash
cd server/typescript
npm ci
cd ../../client
npm ci
cd ..
```

### 2. Start PostgreSQL

From the repository root:

```bash
docker compose up -d
docker compose exec postgresDb sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

PostgreSQL 18 listens only on loopback. If local port `5432` is occupied, change `POSTGRES_PORT` in `.env`; Compose and the API use the same value.

The API creates the schema, read-only generated-query role, and four sample customers during startup. Initialization is transactional, idempotent, and protected by a PostgreSQL advisory lock.

Do not mount a data directory from an older PostgreSQL major version. Use `pg_dump` and `pg_restore` when migrating existing data.

### 3. Start the API

In one terminal:

```bash
cd server/typescript
npm run dev
```

Verify readiness:

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{"status":"ok"}
```

The API initializes PostgreSQL before it begins listening. If the health URL refuses the connection, check the API log and PostgreSQL readiness rather than waiting for a `starting` response.

For a production-style local run:

```bash
npm run build
npm start
```

### 4. Start Angular

In another terminal:

```bash
cd client
npm start
```

Open [http://localhost:4200](http://localhost:4200), sign in, and select a customer.

### Stop local services

Stop Angular and the API with `Ctrl+C`, then stop PostgreSQL:

```bash
docker compose down
```

The named database volume remains. `docker compose down -v` permanently deletes the local database volume.

## Verification

Run the deterministic checks from the repository root:

```bash
cd server/typescript
npm test
npm run build
npm audit

cd ../../client
npm run build
npm audit

cd ..
az bicep build --file infra/main.bicep
node --check scripts/run-cli.mjs
node --check scripts/prepare-azd-env.mjs
node --check scripts/configure-local-env.mjs
git diff --check
```

Tenant-dependent smoke tests still require interactive sign-in:

- Account menu and refresh persistence
- Delegated Customer Insights API token acquisition and rejection of unsigned API requests
- Files, mail, calendar, and Teams retrieval
- Teams channel posting
- ACS calling
- Foundry IQ citations

Email and SMS verification is intentionally separate because it contacts real recipients.

## Cost and cleanup

For the checked-in Azure dependency template:

- Azure AI Search Free: no standing monthly charge
- Foundry project: no separate standing charge
- Azure AI Services `S0`: no base charge; model and embedding tokens are pay-as-you-go
- Global Standard capacities: throughput quotas, not reserved capacity

The separately managed ACS phone number can have a monthly rental charge, and calls, SMS, and email are usage billed. The locally hosted Angular, Express, and PostgreSQL processes add no Azure hosting charge.

To delete a **dedicated azd test environment**, first record the selected group:

```bash
azd env get-value AZURE_RESOURCE_GROUP
azd down --purge
az group exists --subscription <subscription-id> --name <recorded-resource-group>
azd env remove <environment-name> --force
```

The `az group exists` command must return `false`. Do not run `azd down` against a shared or manually managed resource group.

## Foundry IQ and Work IQ

Foundry IQ is the right fit for the current document assistant because the application owns and indexes that corpus. Microsoft Graph remains the deterministic API for explicit files, mail, calendar, and Teams views and actions.

A useful future Work IQ feature would be a selected-customer meeting brief that synthesizes recent mail, meetings, Teams discussions, and tenant documents with citations. It is intentionally deferred because it requires tenant enablement, Global Administrator consent for the broad delegated `WorkIQAgent.Ask` permission, a Copilot Studio usage-based billing plan, and a confidential server/on-behalf-of authentication flow. If added later, keep it feature-flagged and read-only rather than duplicating the existing Graph views or Foundry IQ document assistant.
