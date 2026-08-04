import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  chunkDocument,
  extractDocument,
  extractDocuments,
  type ExtractedDocument
} from '../documentIngestion';

const documentsDirectory = path.resolve(__dirname, '../../../customer documents');

test('chunkDocument creates bounded overlapping chunks', () => {
  const document: ExtractedDocument = {
    title: 'Test',
    sourcePath: 'customer-documents/test.txt',
    customerName: 'General',
    content: Array.from({ length: 25 }, (_, index) => `word${index}`).join(' ')
  };

  const chunks = chunkDocument(document, 10, 2);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].content.split(' ').length, 10);
  assert.equal(chunks[1].content.split(' ')[0], 'word8');
  assert.equal(chunks[2].content.split(' ')[0], 'word16');
  assert.equal(new Set(chunks.map(chunk => chunk.id)).size, chunks.length);
});

test('extractDocument reads DOCX customer content', async () => {
  const document = await extractDocument(path.join(documentsDirectory, 'Tailwind-Traders-PO-1001.docx'));

  assert.equal(document.customerName, 'Tailwind Traders');
  assert.match(document.content, /Tailwind Traders/i);
  assert.ok(document.content.length > 20);
});

test('extractDocument reads XLSX worksheets', async () => {
  const document = await extractDocument(path.join(documentsDirectory, 'Adventure-Works-Cycles-Supplies.xlsx'));

  assert.equal(document.customerName, 'Adventure Works Cycles');
  assert.ok(document.content.length > 20);
});

test('extractDocuments reads every nonempty supported customer document', async () => {
  const skipped: string[] = [];
  const documents = await extractDocuments(documentsDirectory, fileName => skipped.push(fileName));

  assert.equal(documents.length, 5);
  assert.deepEqual(skipped, ['Tailwind-Traders-Supplies.xlsx']);
  assert.ok(documents.every(document => document.content.length > 0));
});
