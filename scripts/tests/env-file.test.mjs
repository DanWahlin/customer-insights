import test from 'node:test';
import assert from 'node:assert/strict';
import { updateEnvironmentText } from '../lib/env-file.mjs';

test('cloud updates preserve a manually configured ACS phone number and unrelated values', () => {
  const source = [
    '# ACS',
    'ACS_CONNECTION_STRING=old',
    'ACS_PHONE_NUMBER=+15551234567',
    'CUSTOMER_PHONE_NUMBER=+15557654321',
    ''
  ].join('\n');
  const result = updateEnvironmentText(source, {
    ACS_CONNECTION_STRING: 'new',
    ACS_EMAIL_ADDRESS: 'donotreply@example.azurecomm.net'
  });
  assert.match(result, /^ACS_CONNECTION_STRING=new$/m);
  assert.match(result, /^ACS_PHONE_NUMBER=\+15551234567$/m);
  assert.match(result, /^CUSTOMER_PHONE_NUMBER=\+15557654321$/m);
  assert.match(result, /^ACS_EMAIL_ADDRESS=donotreply@example\.azurecomm\.net$/m);
});
