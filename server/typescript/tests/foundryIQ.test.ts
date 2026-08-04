import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGroundingSources, selectCitations, type FoundryIQCitation } from '../foundryIQ';

test('buildGroundingSources creates a valid encoded repository citation URL', () => {
  const [source] = buildGroundingSources([{
    id: '1',
    title: 'Customer document',
    sourceData: {
      id: '1',
      title: 'Customer document',
      content: 'Grounding text',
      sourcePath: 'customer documents/Company FAQs.docx',
      customerName: 'General'
    }
  }]);

  assert.match(source.citation.sourceUrl, /customer%20documents\/Company%20FAQs\.docx$/);
});

test('selectCitations returns only sources explicitly cited by the model', () => {
  const citations = [1, 2].map(index => ({
    id: String(index),
    title: `Source ${index}`,
    sourcePath: `source-${index}`,
    sourceUrl: '',
    customerName: 'General'
  })) satisfies FoundryIQCitation[];

  assert.deepEqual(selectCitations('Answer [S2].', citations), [citations[1]]);
  assert.deepEqual(selectCitations('Answer without a source marker.', citations), []);
  assert.deepEqual(selectCitations('Unknown source [S99].', citations), []);
});