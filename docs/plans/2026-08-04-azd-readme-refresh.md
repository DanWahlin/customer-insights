# Azure Dependency Deployment and README Refresh Implementation Plan

> **For Hermes:** Execute this plan task by task and verify every documented command against the repository.

**Goal:** Add a repeatable `azd`/Bicep path for the Azure dependencies used by the locally hosted application and rewrite the README around the current implementation.

**Architecture:** Angular, Express, and PostgreSQL remain local. Subscription-scope Bicep creates or updates a resource group, Azure AI Services account, Foundry project, `gpt-5-mini` and `text-embedding-3-small` Global Standard deployments, and Azure AI Search Free. Helper scripts prepare deterministic azd names and copy generated endpoints and keys into the ignored root `.env` without printing secrets.

**Tech stack:** Azure Developer CLI, Bicep, Azure CLI, Node.js 24, Angular 22, Express 5, PostgreSQL 18.

---

### Task 1: Add the azd and Bicep contract

**Files:**
- Create: `azure.yaml`
- Create: `infra/main.bicep`
- Create: `infra/main.parameters.json`
- Create: `infra/resources.bicep`

**Steps:**
1. Define an infrastructure-only azd project with no application hosting service.
2. Parameterize the resource group, region, globally unique resource names, project name, model versions, and deployment capacities.
3. Create the current Azure AI Services, project, model deployment, and Search Free resources.
4. Output only non-secret names and endpoints.
5. Run `az bicep build --file infra/main.bicep` and resolve all errors.

### Task 2: Add safe environment helpers

**Files:**
- Create: `scripts/prepare-azd-env.mjs`
- Create: `scripts/configure-local-env.mjs`

**Steps:**
1. Read the selected azd environment without assuming a shell.
2. Generate deterministic valid resource names only when the user has not supplied names.
3. Preserve explicit names so the existing talk resources can be adopted idempotently.
4. Retrieve AI and Search keys with Azure CLI after provisioning.
5. Update only the required keys in the ignored root `.env`, keep mode `0600`, and never print secrets.
6. Exercise the helpers against an isolated azd environment and verify explicit names are preserved, secrets are not printed, and `.env` remains mode `0600`.

### Task 3: Rewrite the operational README

**Files:**
- Rewrite: `README.md`
- Update: `.env.example`

**Steps:**
1. Describe the current direct Graph/MSAL, Foundry IQ, PostgreSQL, and ACS architecture.
2. Document prerequisites and the complete environment contract.
3. Provide exact local database, API, client, build, test, and Foundry IQ setup commands.
4. Document the Entra SPA redirect, secure-context, Graph permission, and popup-bridge requirements.
5. Document ACS trust boundaries and the fact that sends contact real recipients.
6. Provide fresh-resource and existing-resource `azd` flows, local environment configuration, verification, costs, and precise cleanup.
7. Keep Work IQ as a clearly deferred customer-meeting-brief option.

### Task 4: Validate the exact result

**Files:**
- Verify all files above.

**Steps:**
1. Run Bicep build and a read-only deployment validation or what-if against a temporary parameter set without creating resources.
2. Run helper-script tests without exposing secrets.
3. Run server tests/build/audit and client build/audit.
4. Check Markdown links, command paths, stale MGT/BYOD references, secret patterns, and `git diff --check`.
5. Review the README for operational accuracy and concise language.
6. Commit the exact verified candidate without pushing.
