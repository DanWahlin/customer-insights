# Customer Insights with Foundry IQ, Microsoft Graph, and ACS

Customer Insights combines local customer data with Microsoft 365 context, Microsoft Foundry models, Foundry IQ, and Azure Communication Services.

The Angular client, Express API, and PostgreSQL database run locally. `azd up` provisions and configures the Azure and Entra dependencies.

## What `azd up` configures

- Azure AI Services with GPT and embedding model deployments
- Azure AI Search Free and the Foundry IQ document index
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
- An Azure subscription
- A Microsoft 365 tenant
- A tenant administrator authorized to grant the requested delegated permissions

Azure AI Search Free is limited to one service per subscription. The selected
region must also have quota for the configured models. If the subscription
already has its Free service, set `AZURE_AI_SEARCH_SKU` to `basic` before
`azd up`.

## Provision the cloud dependencies

From the repository root:

```bash
az login
azd auth login
azd env new customer-insights
azd env set AZURE_SUBSCRIPTION_ID <subscription-id>
azd env set AZURE_LOCATION <azure-region>
azd up
```

If the Microsoft 365 tenant differs from the Azure subscription tenant, set it before `azd up`:

```bash
az login --tenant <microsoft-365-tenant-id> --allow-no-subscriptions
azd env set ENTRA_TENANT_ID <microsoft-365-tenant-id>
```

`azd up` creates the resources, configures Entra, writes the ignored local
`.env`, and builds the Foundry IQ index. It does not print secrets. If the
signed-in account cannot grant tenant-wide consent, rerun it as an authorized
tenant administrator.

For a review before deployment, run:

```bash
azd provision --preview
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

**The phone number must belong to the ACS resource created by this azd environment.** PSTN calling and SMS remain disabled until `ACS_PHONE_NUMBER` is configured. Email and VoIP calling do not require a purchased phone number.

`azd up` tracks the owning ACS resource and clears a number when you switch
environments, preventing it from being used with the wrong ACS connection.

Before testing real sends, set `CUSTOMER_EMAIL_ADDRESS` and
`CUSTOMER_PHONE_NUMBER` in `.env` to deliberate test destinations.

## Run locally

Install dependencies:

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

Start Angular in another terminal:

```bash
cd client
npm start
```

Open [http://localhost:4200](http://localhost:4200).

## Verify

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

## Cleanup

For a dedicated test environment:

```bash
azd env get-value AZURE_RESOURCE_GROUP
azd down --purge
az group exists --subscription <subscription-id> --name <resource-group>
docker compose down
```

The `az group exists` command must return `false`.

`azd down` does not remove the tenant-scoped Entra registrations. They are deliberately kept outside resource-group cleanup to prevent accidental deletion. Phone numbers can continue to incur charges until they are released from ACS.
