import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { foundryIqFingerprint } from '../lib/foundry-iq-state.mjs';

test('Foundry IQ fingerprint is stable and changes with corpus content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-insights-iq-'));
  try {
    fs.mkdirSync(path.join(root, 'customer documents'));
    fs.writeFileSync(path.join(root, 'customer documents', 'a.txt'), 'alpha');
    fs.mkdirSync(path.join(root, 'server', 'typescript', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'server', 'typescript', 'scripts', 'setup-foundry-iq.ts'), 'config');
    const paths = ['customer documents', 'server/typescript/scripts', 'server/typescript/scripts/setup-foundry-iq.ts'];
    const first = foundryIqFingerprint(root, paths);
    assert.equal(first, foundryIqFingerprint(root, paths));
    assert.notEqual(first, foundryIqFingerprint(root, paths, { searchServiceName: 'another-search' }));
    fs.writeFileSync(path.join(root, 'customer documents', 'a.txt'), 'beta');
    assert.notEqual(first, foundryIqFingerprint(root, paths));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
