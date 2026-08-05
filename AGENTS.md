# AGENTS.md

## Purpose

This repository is a local customer-insights demo built with Angular 22, Express 5, and PostgreSQL 18. It combines direct Microsoft Graph calls, Microsoft Foundry models, Foundry IQ over Azure AI Search Free, and Azure Communication Services (ACS).

Read `README.md` before changing setup, infrastructure, authentication, or security behavior.

## Repository map

- `client/`: Angular SPA, MSAL Browser, Microsoft Graph Client, and ACS Calling UI.
- `server/typescript/`: Express API, PostgreSQL access, Foundry/model calls, document ingestion, and ACS email/SMS operations.
- `customer documents/`: DOCX/XLSX corpus indexed by Foundry IQ.
- `infra/` and `azure.yaml`: infrastructure-only azd/Bicep deployment for Foundry models and Azure AI Search.
- `scripts/`: safe azd environment preparation and local `.env` configuration helpers.
- `docker-compose.yml`: local PostgreSQL 18 only.

## Non-negotiable boundaries

- Keep Angular, Express, and PostgreSQL local. The checked-in azd/Bicep path deploys only Azure AI Services, the Foundry project/models, and Azure AI Search.
- Keep AI, Search, PostgreSQL, and ACS credentials server-side in the ignored root `.env`. Never put secrets in Angular environment files, source, Bicep outputs, logs, or commits.
- Use direct MSAL Browser and Microsoft Graph Client calls. Do not restore Microsoft Graph Toolkit packages, providers, or custom elements.
- Cached authentication must remain silent-only. Interactive login and logout require explicit user actions.
- Remote MSAL testing requires HTTPS and an exact Entra SPA redirect URI. `http://localhost` is the browser's local secure-context exception.
- Browser-supplied email/SMS destinations are untrusted. Sends must use server-configured test destinations.
- Never send real email or SMS without explicit approval; these contact external recipients and may incur charges.
- Do not run `azd down` against an environment that adopts live or shared resources. It deletes the entire managed resource group and purges the AI account.
- Azure permits only one Free Search service per subscription. Never repurpose or alter an unrelated Search service to work around that limit.
- Keep the serialized `dependsOn` chain for AI account child resources; parallel model/project deployment can fail with `RequestConflict`.

## Local workflow

Use the root `.env.example` as the configuration contract.

```bash
# PostgreSQL
docker compose up -d

# API
cd server/typescript
npm ci
npm run dev

# Angular, in another terminal
cd client
npm ci
npm start
```

The API initializes and seeds the database during startup. Health endpoint: `http://localhost:3000/api/health`.

Provision and configure Azure dependencies from the repository root:

```bash
node scripts/prepare-azd-env.mjs
azd provision --preview
azd up
node scripts/configure-local-env.mjs

cd server/typescript
npm run setup:foundry-iq
```

Always inspect the selected azd environment, subscription, resource group, and preview before provisioning or deleting resources.

## Implementation guidance

- Prefer typed Angular templates and native Angular Material components.
- Modal-owned operations should show progress inside the dialog and suppress only that request's global overlay with `SKIP_GLOBAL_OVERLAY`.
- Preserve read-only generated SQL execution, parameter binding, statement timeout, and the restricted PostgreSQL role.
- Keep API validation, rate limits, timeouts, and bounded AI output intact.
- Foundry IQ answers must remain grounded in retrieved sources with validated citation labels.
- Generated Angular environment files and build outputs are ignored artifacts; change their generator or source configuration instead.
- Update `README.md` and `.env.example` whenever the setup or environment contract changes.

## Required validation

Run the relevant focused checks while developing, then run the full gate before committing:

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

For infrastructure changes, use a dedicated temporary resource group, verify every deployed resource and data-plane endpoint, then run precisely scoped cleanup and prove the test resource group is absent. Do not treat a successful Bicep compile as proof that Azure deployment works.
