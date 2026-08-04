# OpenAI, Azure Communication Services, Foundry IQ, and Microsoft Graph LOB Sample

This sample shows how a line-of-business application can combine current Microsoft AI, communication, and organizational-data services without forcing users to switch between Outlook, Teams, OneDrive, and separate customer systems.

- **Microsoft Foundry and Foundry IQ** ground customer-document answers through an Azure AI Search knowledge base. The Node server generates the final answer with the OpenAI-compatible Responses API and returns source citations.
- **Generative AI** converts natural language into parameterized PostgreSQL `SELECT` statements and drafts email and SMS messages.
- **Azure Communication Services (ACS)** provides browser calling, SMS, and email delivery.
- **Microsoft Graph** supplies permission-aware files, email, calendar events, Teams chats, and channel posting through direct Graph calls and MSAL Browser. Microsoft Graph Toolkit is not used.

The [original Microsoft Learn tutorial](https://learn.microsoft.com/microsoft-cloud/dev/tutorials/openai-acs-msgraph) explains the initial scenarios. This repository now uses a newer authentication, Graph, Foundry, Search, and OpenAI architecture.

## Architecture

```text
Angular 22
  ├─ MSAL Browser → Microsoft Graph
  ├─ ACS Calling SDK → Azure Communication Services
  └─ Express 5 API
       ├─ Foundry IQ → Azure AI Search Free knowledge base
       │    └─ gpt-5-mini Responses API → grounded answer + citations
       ├─ gpt-5-mini → SQL and message generation
       ├─ PostgreSQL
       └─ ACS Email and SMS SDKs
```

Foundry IQ uses the generally available Azure AI Search `2026-04-01` knowledge-base API in extractive mode. The server, not Search, calls `gpt-5-mini` for answer generation. This allows the demo to use the Search Free SKU without requiring a Search managed identity.

## Prerequisites

- Node.js 24.15 or later and npm
- Git
- Docker, Podman, or another OCI-compatible container runtime
- Azure CLI authenticated to the target subscription
- Azure subscription
- Microsoft 365 tenant with sample files, mail, calendar events, and Teams messages

## Environment

Copy `.env.example` to `.env` at the repository root. `.env` is ignored by Git.

```dotenv
ENTRAID_CLIENT_ID=
TEAM_ID=
CHANNEL_ID=
AI_API_KEY=
AI_ENDPOINT=
AI_MODEL=gpt-5-mini
AI_EMBEDDING_MODEL=text-embedding-3-small
AZURE_FOUNDRY_PROJECT_ENDPOINT=
AZURE_AI_SEARCH_ENDPOINT=
AZURE_AI_SEARCH_KEY=
AZURE_AI_SEARCH_INDEX=customer-documents-index
AZURE_AI_SEARCH_KNOWLEDGE_SOURCE=customer-documents-ks
AZURE_AI_SEARCH_KNOWLEDGE_BASE=customer-documents-kb
POSTGRES_USER=web
POSTGRES_PASSWORD=web-password
POSTGRES_HOST=localhost
POSTGRES_DATABASE=CustomersDB
POSTGRES_PORT=5432
ACS_CONNECTION_STRING=
ACS_PHONE_NUMBER=
ACS_EMAIL_ADDRESS=
CUSTOMER_EMAIL_ADDRESS=
CUSTOMER_PHONE_NUMBER=
API_PORT=3000
API_HOST=127.0.0.1
CLIENT_ORIGIN=http://localhost:4200
```

Keep keys and connection strings server-side. The Angular environment generator emits feature booleans, not AI, Search, or ACS secrets.

## Provision Microsoft Foundry and Azure AI Search

The deployed demo uses one region for every new resource:

- Resource group: `rg_ai_acs_orgdata`
- Region: South Central US
- Foundry resource: Azure AI Services `S0` (model calls are consumption billed)
- Foundry project: `proj-ai-acs-orgdata`
- Azure AI Search: Free with the free Foundry IQ retrieval plan

Resource names must be globally unique. Choose a lowercase suffix before running these commands.

```bash
RG=rg_ai_acs_orgdata
LOCATION=southcentralus
SUFFIX=<unique-lowercase-suffix>
AI_ACCOUNT=ai-acs-orgdata-$SUFFIX
SEARCH_SERVICE=srch-ai-acs-orgdata-$SUFFIX
PROJECT=proj-ai-acs-orgdata

az group create --name "$RG" --location "$LOCATION"

az cognitiveservices account create \
  --name "$AI_ACCOUNT" \
  --resource-group "$RG" \
  --kind AIServices \
  --sku S0 \
  --location "$LOCATION" \
  --custom-domain "$AI_ACCOUNT" \
  --assign-identity \
  --allow-project-management true \
  --yes

az cognitiveservices account project create \
  --name "$AI_ACCOUNT" \
  --resource-group "$RG" \
  --project-name "$PROJECT" \
  --location "$LOCATION" \
  --display-name "AI ACS Org Data" \
  --assign-identity

az cognitiveservices account deployment create \
  --resource-group "$RG" \
  --name "$AI_ACCOUNT" \
  --deployment-name gpt-5-mini \
  --model-name gpt-5-mini \
  --model-version 2025-08-07 \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 10

az cognitiveservices account deployment create \
  --resource-group "$RG" \
  --name "$AI_ACCOUNT" \
  --deployment-name text-embedding-3-small \
  --model-name text-embedding-3-small \
  --model-version 1 \
  --model-format OpenAI \
  --sku-name GlobalStandard \
  --sku-capacity 120

az search service create \
  --name "$SEARCH_SERVICE" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku free \
  --knowledge-retrieval free \
  --auth-options aadOrApiKey \
  --aad-auth-failure-mode http401WithBearerChallenge \
  --public-network-access enabled
```

Set `AI_*`, `AZURE_FOUNDRY_PROJECT_ENDPOINT`, and `AZURE_AI_SEARCH_*` in `.env` from the created resources. Do not paste those values into source files.

### Create and populate Foundry IQ

From `server/typescript`:

```bash
npm install
npm run setup:foundry-iq
```

The setup command is repeatable. It:

1. Extracts the repository's DOCX and XLSX customer documents.
2. Splits them into overlapping chunks.
3. Generates 1,536-dimension vectors with `text-embedding-3-small`.
4. Creates or updates the Search index.
5. Uploads the chunks and vectors.
6. Creates the Foundry IQ `searchIndex` knowledge source and knowledge base.
7. Runs a live retrieval and verifies that Foundry IQ returns references.

The Free SKU is intended for a small proof of concept. It has limited storage, indexes, knowledge sources, knowledge bases, throughput, and no SLA. Model embedding and generation tokens are billed separately.

## Configure Microsoft Graph

Create a single-page application registration in Microsoft Entra ID with `http://localhost:4200` as an SPA redirect URI. Put its application client ID in `ENTRAID_CLIENT_ID`.

Add these delegated Microsoft Graph permissions and grant tenant admin consent where required:

- `User.Read`
- `Files.Read.All`
- `Mail.Read`
- `Calendars.Read`
- `Chat.Read`
- `ChannelMessage.Read.All`
- `ChannelMessage.Send`

`TEAM_ID` and `CHANNEL_ID` are optional. They enable posting a message to a configured Teams channel.

The client uses direct Microsoft Graph API calls for files, mail, calendar events, Teams messages, and channel posting. Cached startup uses silent token acquisition; interactive authentication occurs only after the user selects **Sign in**.

## Configure Azure Communication Services

Configure an ACS resource with:

- A phone number with outbound calling and inbound/outbound SMS
- A connected email domain and sender address
- The ACS connection string

Add those values to `ACS_CONNECTION_STRING`, `ACS_PHONE_NUMBER`, and `ACS_EMAIL_ADDRESS`. The optional `CUSTOMER_EMAIL_ADDRESS` and `CUSTOMER_PHONE_NUMBER` override the sample customer destinations for safe testing.

The server waits for the real ACS email operation result and checks each SMS result. It does not return fabricated send success.

## Run the application

Start PostgreSQL from the repository root:

```bash
docker compose up -d
```

If port `5432` is already in use, set `POSTGRES_PORT` in `.env` to another local port, such as `5435`; Docker Compose and the server use the same setting.

Start the server:

```bash
cd server/typescript
npm install
npm test
npm start
```

Start the client in another terminal:

```bash
cd client
npm install
npm start
```

Open `http://localhost:4200`.

## Verification

```bash
cd server/typescript
npm test
npm run build
npm audit
npm run setup:foundry-iq

cd ../../client
npm run build
npm audit --omit=dev
```

Live Microsoft Graph verification requires an interactive tenant sign-in. Email and SMS tests contact real recipients and should only be run with deliberate test destinations.

## Foundry IQ and Work IQ

Foundry IQ is the right knowledge system for the existing customer-document assistant because the data is owned and indexed by this application. Microsoft Graph remains the right deterministic API for the current user's files, mail, calendar, and Teams operations.

Work IQ would add value only for a separate, permission-aware **customer meeting brief** that synthesizes recent email, Teams discussions, meetings, and documents for the selected customer. It is not required for document chat and should not replace the explicit Graph views or actions in this sample.

That pilot is intentionally deferred because it requires tenant-wide Global Administrator enablement, a usage-based Copilot Studio billing plan, admin consent for the broad delegated `WorkIQAgent.Ask` permission, and a confidential server/OBO authentication flow. If enabled later, keep it feature-flagged and read-only: one **Generate Work IQ brief** action, no generic chat, no write tools, and no duplication of Foundry IQ data.
