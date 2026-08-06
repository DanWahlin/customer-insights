import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCloudReadiness } from '../lib/cloud-readiness.mjs';

const ready = {
  aiState: 'Succeeded',
  modelDeploymentStates: { 'gpt-5-mini': 'Succeeded', 'text-embedding-3-small': 'Succeeded' },
  searchState: 'running',
  communicationState: 'Succeeded',
  emailState: 'Succeeded',
  emailDomainState: 'Succeeded',
  linkedDomains: ['/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/email/domains/AzureManagedDomain'],
  expectedEmailDomainId: '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Communication/emailServices/email/domains/AzureManagedDomain'
};

test('cloud readiness accepts healthy resources with the expected email link', () => {
  assert.doesNotThrow(() => assertCloudReadiness(ready));
});

test('cloud readiness rejects missing email-domain linkage', () => {
  assert.throws(() => assertCloudReadiness({ ...ready, linkedDomains: [] }), /not linked/);
});

test('cloud readiness reports failed ACS and email states', () => {
  assert.throws(() => assertCloudReadiness({
    ...ready,
    communicationState: 'Failed',
    emailDomainState: 'Creating'
  }), /ACS=Failed.*EmailDomain=Creating/);
});

test('cloud readiness rejects a failed model deployment', () => {
  assert.throws(() => assertCloudReadiness({
    ...ready,
    modelDeploymentStates: { ...ready.modelDeploymentStates, 'gpt-5-mini': 'Failed' }
  }), /Model gpt-5-mini=Failed/);
});
