# One-Command azd Setup Implementation Plan

> **For Hermes:** Execute this plan task-by-task and verify the exact final commit.

**Goal:** Make `azd up` provision and configure Customer Insights cloud dependencies while leaving regulated ACS phone-number acquisition manual.

**Architecture:** ARM/Bicep owns Azure AI Services, model deployments, Search, ACS, and an Azure-managed email domain. azd hooks prepare names, reconcile tenant-scoped Entra applications and consent, write the ignored local `.env`, build Foundry IQ data only when its source fingerprint changes, and verify readiness. Entra cleanup and phone-number acquisition remain explicit because they are outside the resource-group lifecycle or require regulatory/cost approval.

**Tech Stack:** azd hooks, Bicep, Node.js 24, Azure CLI, Microsoft Graph REST, Vitest/Node test, Angular, Express, Azure AI Search.

---

### Task 1: Extend Azure infrastructure

**Files:**
- Modify: `azure.yaml`
- Modify: `infra/main.bicep`
- Modify: `infra/main.parameters.json`
- Modify: `infra/resources.bicep`
- Modify: `scripts/prepare-azd-env.mjs`

**Steps:**
1. Add deterministic Customer Insights resource names.
2. Provision ACS, Email Communication Service, and `AzureManagedDomain` in the same data geography.
3. Link the managed email domain to ACS.
4. Output only non-secret names, IDs, endpoints, and sender metadata.
5. Compile Bicep and inspect the generated template.

### Task 2: Add idempotent Entra reconciliation

**Files:**
- Create: `scripts/lib/entra-config.mjs`
- Create: `scripts/configure-entra.mjs`
- Create: `scripts/tests/entra-config.test.mjs`

**Steps:**
1. Test deterministic names, stable scope IDs, exact permission sets, and redirect URI normalization.
2. Implement tenant-aware lookup/create/update of SPA and API applications.
3. Create service principals with bounded replication retries.
4. Grant tenant-wide consent only through an authorized signed-in administrator and verify the grants.
5. Persist public app IDs/scope URI to the selected azd environment.
6. Never delete tenant objects from `azd down`.

### Task 3: Add post-provision orchestration

**Files:**
- Modify: `scripts/configure-local-env.mjs`
- Create: `scripts/postprovision.mjs`
- Create: `scripts/lib/foundry-iq-state.mjs`
- Create: `scripts/tests/foundry-iq-state.test.mjs`
- Modify: `azure.yaml`

**Steps:**
1. Make `.env` updates atomic and secret-safe.
2. Retrieve AI, Search, and ACS credentials directly into ignored `.env` without logging values.
3. Populate Entra IDs, ACS email sender, and leave `ACS_PHONE_NUMBER` empty.
4. Fingerprint the document corpus and index configuration.
5. Install server dependencies and run Foundry IQ setup only when the fingerprint changes.
6. Verify resource states and local configuration.

### Task 4: Replace README with a minimal runbook

**Files:**
- Rewrite: `README.md`

**Steps:**
1. Describe the current app only.
2. Keep prerequisites and `azd up` workflow short.
3. Clearly state that Entra consent requires an authorized tenant administrator.
4. Add a concise manual phone-number section stating the number must be acquired from the ACS resource created by this azd environment.
5. State that PSTN calling/SMS remain disabled until `ACS_PHONE_NUMBER` is set.
6. Keep local run, verification, cost, and cleanup commands minimal.

### Task 5: Verify and release

**Steps:**
1. Run script unit tests and mock-hook tests without cloud mutation.
2. Run Bicep build, Node syntax checks, server tests/build/audit, client auth tests/build/audit, Markdown validation, secret scan, and `git diff --check`.
3. Obtain independent security, infrastructure, and documentation reviews of the exact candidate.
4. Fix blockers and repeat affected gates.
5. Commit and push the exact verified candidate.
