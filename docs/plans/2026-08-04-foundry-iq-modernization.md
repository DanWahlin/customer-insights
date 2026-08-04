# Foundry IQ Modernization Implementation Plan

> **For Hermes:** Execute task-by-task with deterministic verification and independent review.

**Goal:** Modernize the sample with direct Microsoft Graph, Microsoft Foundry, Foundry IQ on Azure AI Search Free, current AI APIs, and verified ACS communication flows.

**Architecture:** The Angular client signs users in with MSAL and calls Microsoft Graph directly for organizational data. The Node server uses Foundry IQ GA extractive retrieval over an Azure AI Search index, then calls `gpt-5-mini` through the Azure OpenAI v1 Responses API to produce grounded answers with citations. ACS remains the communication layer for calling, SMS, and email.

**Tech Stack:** Angular 22, TypeScript, Express 5, OpenAI JS v7, Azure AI Search/Foundry IQ 2026-04-01 REST APIs, MSAL Browser, Microsoft Graph Client, Azure Communication Services.

---

### Task 1: Provision and verify the same-region Azure stack

**Objective:** Create the dedicated South Central US resource group, Foundry resource/project/model deployments, and Free Search service.

**Verification:** Read back provisioning states, SKUs, regions, endpoints, and model deployment capabilities.

### Task 2: Add deterministic document extraction and chunking tests

**Files:**
- Create: `server/typescript/documentIngestion.ts`
- Create: `server/typescript/tests/documentIngestion.test.ts`

**Objective:** Extract DOCX and XLSX text, explicitly report empty files, and split nonempty content into bounded overlapping chunks.

**Verification:** Node test runner passes against fixtures and the repository's customer documents.

### Task 3: Provision the Search index and ingest customer documents

**Files:**
- Create: `server/typescript/scripts/setup-foundry-iq.ts`
- Modify: `server/typescript/package.json`

**Objective:** Create a vector-enabled index, generate embeddings with `text-embedding-3-small`, upload chunks, and create the Foundry IQ knowledge source/base.

**Verification:** Index document count is nonzero and a GA knowledge-base retrieve call returns references for a known customer query.

### Task 4: Replace legacy On Your Data with Foundry IQ

**Files:**
- Create: `server/typescript/foundryIQ.ts`
- Modify: `server/typescript/openAI.ts`
- Modify: `server/typescript/apiRoutes.ts`
- Modify: `server/typescript/interfaces.ts`

**Objective:** Remove `data_sources`, retrieve grounding through Foundry IQ, generate answers through the Responses API, and return structured citations.

**Verification:** Focused unit tests, server build, and a live query against the deployed resources pass.

### Task 5: Update the client document-chat experience

**Files:**
- Modify: `client/src/app/chat-help-dialog/*`
- Modify: `client/src/app/core/data.service.ts`
- Modify: `client/src/app/shared/interfaces.ts`

**Objective:** Show loading/error states and safe clickable citations for Foundry IQ answers.

**Verification:** Angular production build and browser smoke test pass.

### Task 6: Finish AI environment migration and documentation

**Files:**
- Modify: `.env.example`
- Modify: `client/scripts/build-env.js`
- Modify: `client/src/app/core/feature-flags.service.ts`
- Modify: `README.md`

**Objective:** Replace `OPENAI_*` with `AI_*`, document Azure resources and repeatable setup commands, and keep secrets excluded.

**Verification:** Stale-variable search returns no results and both package builds pass.

### Task 7: Verify ACS and decide Work IQ scope

**Objective:** Live-test ACS identity token creation and verify SMS/email/calling resource state without sending external messages. Evaluate Work IQ only for a distinct Microsoft 365 customer-brief scenario.

**Verification:** Read-only/resource-level ACS checks pass; consequential sends remain user-approved. Work IQ decision is documented with tenant prerequisites.

### Task 8: Release-quality verification

**Objective:** Run clean builds, tests, audits, secret scans, live Foundry IQ/Graph/ACS checks, and one bounded independent review.

**Verification:** Exact working candidate has passing deterministic gates and no unresolved blocker findings.
