import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReadOnlyQuery } from '../postgres';

test('normalizeReadOnlyQuery accepts one SELECT with an optional trailing semicolon', () => {
  assert.equal(normalizeReadOnlyQuery(' SELECT * FROM customers; '), 'SELECT * FROM customers');
  assert.equal(normalizeReadOnlyQuery('WITH recent AS (SELECT * FROM orders) SELECT * FROM recent'), 'WITH recent AS (SELECT * FROM orders) SELECT * FROM recent');
});

test('normalizeReadOnlyQuery rejects writes and multiple statements', () => {
  assert.equal(normalizeReadOnlyQuery('DELETE FROM customers'), null);
  assert.equal(normalizeReadOnlyQuery('SELECT 1; DROP TABLE customers'), null);
});