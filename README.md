# Customer Insights with Foundry IQ, Microsoft Graph, and ACS

Customer Insights combines local customer data with Microsoft 365 context, Microsoft Foundry models, Foundry IQ, and Azure Communication Services.

The Angular client, Express API, and PostgreSQL database run locally. `azd up` provisions and configures the Azure and Entra dependencies.

## What `azd up` configures

- Azure AI Services with GPT and embedding model deployments
- Azure AI Search and the Foundry IQ document index
- Microsoft Entra SPA and API registrations, delegated permissions, and consent
- Azure Communication Services
- Email Communication Service with an Azure-managed sender domain
- Local `.env` values required by the app

Phone-number acquisition is manual because Microsoft or the carrier may require business documents, regulatory approval, and recurring charges.

## Prerequisites

- Node.js 24.15 or later
- npm and Git
- Docker or another Compose-compatible runtime
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- PowerShell 7 (`pwsh`) on Windows
- An Azure subscription
- Contributor or Owner access on that subscription
- A Microsoft 365 tenant
- A tenant administrator authorized to grant the requested delegated permissions

Confirm the required tools before continuing:

```bash
node --version
npm --version
docker compose version
az version
azd version
# Windows only
pwsh --version
```

Azure AI Search Free is limited to one service per subscription. The selected
region must also have quota for the configured models. If the subscription
already has its Free service, set `AZURE_AI_SEARCH_SKU` to `basic` before
`azd up`.

## Provision the cloud dependencies

Clone the repository and create the azd environment:

```bash
git clone https://github.com/DanWahlin/customer-insights.git
cd customer-insights
az login
azd auth login
azd env new <unique-environment-name>
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION <azure-region>
```

If the Microsoft 365 tenant differs from the Azure subscription tenant, set it before `azd up`:

```bash
az login --tenant <microsoft-365-tenant-id> --allow-no-subscriptions
azd env set ENTRA_TENANT_ID <microsoft-365-tenant-id>
az account set --subscription <subscription-id>
```

If the subscription already has an Azure AI Search Free service, set this
before deployment:

```bash
azd env set AZURE_AI_SEARCH_SKU basic
```

Azure AI Services S0, model usage, and Basic Search are billable until the
resource group is deleted. Phone numbers have separate recurring charges.

Deploy:

```bash
azd up
```

`azd up` creates the resources, configures Entra, writes the ignored local
`.env`, and builds the Foundry IQ index. It also grants the requested delegated
permissions tenant-wide. It does not print secrets. If the
signed-in account cannot grant tenant-wide consent, rerun it as an authorized
tenant administrator.

Successful setup prints `Customer Insights cloud setup is ready.` Confirm
the generated resource names with:

```bash
azd env get-value AZURE_RESOURCE_GROUP
azd env get-value ACS_RESOURCE_NAME
```

## Set up the phone number manually

1. Get the ACS resource name:

   ```bash
   azd env get-value ACS_RESOURCE_NAME
   ```

2. Open that exact Azure Communication Services resource in the Azure portal.
3. Complete Microsoft's phone-number purchase and any required documentation or verification.
4. Make sure the number supports the calling and SMS capabilities you need.
5. Add the number to `.env` in E.164 format:

   ```dotenv
   ACS_PHONE_NUMBER=+15551234567
   ```

**The phone number must belong to the ACS resource created by this azd environment.** Calling and SMS remain disabled until `ACS_PHONE_NUMBER` is configured. Email does not require a purchased phone number.

`azd up` tracks the owning ACS resource and clears a number when you switch
environments, preventing it from being used with the wrong ACS connection.

Before testing real sends, set `CUSTOMER_EMAIL_ADDRESS` and
`CUSTOMER_PHONE_NUMBER` in `.env` to deliberate test destinations.
The API ignores browser-supplied destinations and sends only to these values.
Set `TEAM_ID` and `CHANNEL_ID` to enable Teams channel messages. Restart the API
and client after changing `.env`.

## Run locally

Before starting the app, confirm the local URL values in the ignored root
`.env`. The API port in both values must match `API_PORT`, and
`CLIENT_ORIGIN` must exactly match the URL used to open Angular:

```dotenv
API_PORT=3000
CLIENT_ORIGIN=http://localhost:4200
NG_APP_API_URL=http://localhost:3000
```

Remote HTTPS values used for Entra/MSAL testing, including Tailscale or other
reverse-proxy URLs, should not be reused while opening Angular through
`http://localhost:4200`. Restart both processes after changing these values.

From the repository root, install dependencies:

```bash
cd server/typescript && npm ci
cd ../../client && npm ci
cd ..
```

Start PostgreSQL from the repository root:

```bash
docker compose up -d
```

Start the API:

```bash
cd server/typescript
npm run dev
```

Open [http://localhost:3000/api/health](http://localhost:3000/api/health). It
must return `{"status":"ok"}` before you start the client.

From the repository root in another terminal, start Angular:

```bash
cd client
npm start
```

Open [http://localhost:4200](http://localhost:4200), sign in, and select a
customer.

## Verify

From the repository root:

```bash
cd server/typescript
npm test && npm run build && npm audit

cd ../../client
npm run test:auth-callback && npm run build && npm audit

cd ..
az bicep build --file infra/main.bicep
node --test scripts/tests/*.test.mjs
git diff --check
```

The script integration tests require a POSIX Node.js environment. On Windows,
run that test command from WSL; the application builds, audits, and Bicep compile
can run from PowerShell 7.

## Cleanup

For a dedicated environment, first release any purchased phone number from the
ACS resource in the Azure portal. Then run this from the repository root:

```bash
node scripts/cleanup.mjs --yes --environment <exact-azd-environment-name>
```

Cleanup succeeds only after Azure reports that the selected environment's
resource group is absent. It then removes only the two ownership-marked Entra
applications, removes that azd environment, and stops local Compose services.

## Optional AKS deployment path

An opt-in, completely separate AKS + managed PostgreSQL deployment path lives under [`deploy/aks/`](deploy/aks/README.md). It has its own `azure.yaml`, infra, and Kubernetes manifests, and does not modify or replace the root azd workflow described above.
