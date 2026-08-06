import test from 'node:test';
import assert from 'node:assert/strict';
import { phoneConfigurationForResource, updateEnvironmentText } from '../lib/env-file.mjs';

test('phone configuration is preserved only for its owning ACS resource', () => {
  const source = [
    'ACS_PHONE_NUMBER=+15551234567',
    'ACS_PHONE_NUMBER_RESOURCE=acs-current'
  ].join('\n');
  assert.deepEqual(phoneConfigurationForResource(source, 'acs-current'), {
    ACS_PHONE_NUMBER: '+15551234567',
    ACS_PHONE_NUMBER_RESOURCE: 'acs-current'
  });
});

test('phone configuration is cleared when the ACS resource changes', () => {
  const source = [
    'ACS_PHONE_NUMBER=+15551234567',
    'ACS_PHONE_NUMBER_RESOURCE=acs-old'
  ].join('\n');
  assert.deepEqual(phoneConfigurationForResource(source, 'acs-new'), {
    ACS_PHONE_NUMBER: '',
    ACS_PHONE_NUMBER_RESOURCE: 'acs-new'
  });
});

test('managed updates remove duplicate keys that could override the cleared phone number', () => {
  const source = [
    'ACS_PHONE_NUMBER=+15550000001',
    'ACS_PHONE_NUMBER=+15550000002',
    'ACS_PHONE_NUMBER_RESOURCE=acs-old'
  ].join('\n');
  const result = updateEnvironmentText(source, phoneConfigurationForResource(source, 'acs-new'));
  assert.equal(result.match(/^ACS_PHONE_NUMBER=/gm)?.length, 1);
  assert.match(result, /^ACS_PHONE_NUMBER=$/m);
  assert.doesNotMatch(result, /1555000000[12]/);
  assert.match(result, /^ACS_PHONE_NUMBER_RESOURCE=acs-new$/m);
});

test('cloud updates preserve unrelated values', () => {
  const source = [
    '# ACS',
    'ACS_CONNECTION_STRING=old',
    'CUSTOMER_PHONE_NUMBER=+15557654321',
    ''
  ].join('\n');
  const result = updateEnvironmentText(source, {
    ACS_CONNECTION_STRING: 'new',
    ACS_EMAIL_ADDRESS: 'donotreply@example.azurecomm.net'
  });
  assert.match(result, /^ACS_CONNECTION_STRING=new$/m);
  assert.match(result, /^CUSTOMER_PHONE_NUMBER=\+15557654321$/m);
  assert.match(result, /^ACS_EMAIL_ADDRESS=donotreply@example\.azurecomm\.net$/m);
});
