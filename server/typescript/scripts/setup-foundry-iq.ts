import path from 'node:path';
import OpenAI from 'openai';
import '../config';
import { chunkDocuments, extractDocuments } from '../documentIngestion';

const SEARCH_API_VERSION = '2026-04-01';
const VECTOR_DIMENSIONS = 1536;

const {
  AI_API_KEY,
  AI_ENDPOINT,
  AI_EMBEDDING_MODEL,
  AZURE_AI_SEARCH_ENDPOINT,
  AZURE_AI_SEARCH_KEY,
  AZURE_AI_SEARCH_INDEX,
  AZURE_AI_SEARCH_KNOWLEDGE_SOURCE,
  AZURE_AI_SEARCH_KNOWLEDGE_BASE
} = process.env as Record<string, string>;

const required = {
  AI_API_KEY,
  AI_ENDPOINT,
  AI_EMBEDDING_MODEL,
  AZURE_AI_SEARCH_ENDPOINT,
  AZURE_AI_SEARCH_KEY,
  AZURE_AI_SEARCH_INDEX,
  AZURE_AI_SEARCH_KNOWLEDGE_SOURCE,
  AZURE_AI_SEARCH_KNOWLEDGE_BASE
};
for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing ${name} in the project .env file.`);
}

const openai = new OpenAI({
  apiKey: AI_API_KEY,
  baseURL: `${AI_ENDPOINT.replace(/\/$/, '')}/openai/v1/`,
  timeout: 30_000,
  maxRetries: 2
});

async function main() {
  const documentsDirectory = path.resolve(__dirname, '../../../customer documents');
  const skippedEmpty: string[] = [];
  const documents = await extractDocuments(documentsDirectory, fileName => skippedEmpty.push(fileName));
  const chunks = chunkDocuments(documents);
  if (!chunks.length) throw new Error('No document chunks were produced.');

  console.log(`Extracted ${documents.length} documents into ${chunks.length} chunks.`);
  if (skippedEmpty.length) console.log(`Skipped empty documents: ${skippedEmpty.join(', ')}`);

  const embeddings = await openai.embeddings.create({
    model: AI_EMBEDDING_MODEL,
    input: chunks.map(chunk => chunk.content),
    dimensions: VECTOR_DIMENSIONS
  });
  if (embeddings.data.length !== chunks.length) {
    throw new Error(`Expected ${chunks.length} embeddings but received ${embeddings.data.length}.`);
  }

  await searchRequest(`/indexes/${AZURE_AI_SEARCH_INDEX}`, {
    method: 'PUT',
    body: {
      name: AZURE_AI_SEARCH_INDEX,
      fields: [
        { name: 'id', type: 'Edm.String', key: true, filterable: true, retrievable: true },
        { name: 'title', type: 'Edm.String', searchable: true, retrievable: true },
        { name: 'content', type: 'Edm.String', searchable: true, retrievable: true },
        { name: 'sourcePath', type: 'Edm.String', searchable: true, filterable: true, retrievable: true },
        { name: 'customerName', type: 'Edm.String', searchable: true, filterable: true, facetable: true, retrievable: true },
        { name: 'chunkOrdinal', type: 'Edm.Int32', filterable: true, sortable: true, retrievable: true },
        {
          name: 'contentVector',
          type: 'Collection(Edm.Single)',
          searchable: true,
          retrievable: false,
          dimensions: VECTOR_DIMENSIONS,
          vectorSearchProfile: 'hnsw-profile'
        }
      ],
      vectorSearch: {
        algorithms: [{ name: 'hnsw-config', kind: 'hnsw' }],
        profiles: [{ name: 'hnsw-profile', algorithm: 'hnsw-config' }]
      },
      semantic: {
        defaultConfiguration: 'customer-documents-semantic',
        configurations: [{
          name: 'customer-documents-semantic',
          prioritizedFields: {
            titleField: { fieldName: 'title' },
            prioritizedContentFields: [{ fieldName: 'content' }],
            prioritizedKeywordsFields: [{ fieldName: 'customerName' }]
          }
        }]
      }
    }
  });
  console.log(`Created or updated index ${AZURE_AI_SEARCH_INDEX}.`);

  const existing = await searchRequest(`/indexes/${AZURE_AI_SEARCH_INDEX}/docs/search`, {
    method: 'POST',
    body: { search: '*', select: 'id', top: 1000 }
  });
  const currentIds = new Set(chunks.map(chunk => chunk.id));
  const staleDeletes = (existing.value ?? [])
    .filter((document: { id: string }) => !currentIds.has(document.id))
    .map((document: { id: string }) => ({ '@search.action': 'delete', id: document.id }));
  const uploadActions = chunks.map((chunk, index) => ({
    '@search.action': 'mergeOrUpload',
    ...chunk,
    contentVector: embeddings.data[index].embedding
  }));
  const indexingResult = await searchRequest(`/indexes/${AZURE_AI_SEARCH_INDEX}/docs/index`, {
    method: 'POST',
    body: { value: [...staleDeletes, ...uploadActions] }
  });
  const failedActions = (indexingResult.value ?? []).filter((result: { status: boolean }) => !result.status);
  if (failedActions.length) {
    throw new Error(`Azure AI Search rejected ${failedActions.length} indexing action(s).`);
  }
  console.log(`Uploaded ${chunks.length} chunks and removed ${staleDeletes.length} stale chunk(s).`);

  await searchRequest(`/knowledgesources('${AZURE_AI_SEARCH_KNOWLEDGE_SOURCE}')`, {
    method: 'PUT',
    body: {
      name: AZURE_AI_SEARCH_KNOWLEDGE_SOURCE,
      description: 'Customer documents indexed for the OpenAI, ACS, Graph, and Foundry IQ sample.',
      kind: 'searchIndex',
      searchIndexParameters: {
        searchIndexName: AZURE_AI_SEARCH_INDEX,
        sourceDataFields: [
          { name: 'id' },
          { name: 'title' },
          { name: 'content' },
          { name: 'sourcePath' },
          { name: 'customerName' },
          { name: 'chunkOrdinal' }
        ]
      }
    }
  });
  console.log(`Created or updated knowledge source ${AZURE_AI_SEARCH_KNOWLEDGE_SOURCE}.`);

  await searchRequest(`/knowledgebases('${AZURE_AI_SEARCH_KNOWLEDGE_BASE}')`, {
    method: 'PUT',
    body: {
      name: AZURE_AI_SEARCH_KNOWLEDGE_BASE,
      description: 'Foundry IQ knowledge base for customer document questions.',
      knowledgeSources: [{ name: AZURE_AI_SEARCH_KNOWLEDGE_SOURCE }]
    }
  });
  console.log(`Created or updated knowledge base ${AZURE_AI_SEARCH_KNOWLEDGE_BASE}.`);

  const retrieval = await retrieve('What supplies are associated with Adventure Works Cycles?');
  const references = Array.isArray(retrieval.references) ? retrieval.references : [];
  if (!references.length) throw new Error('Foundry IQ verification returned no references.');
  console.log(`Foundry IQ verification succeeded with ${references.length} reference(s).`);
}

async function retrieve(query: string): Promise<any> {
  return searchRequest(`/knowledgebases('${AZURE_AI_SEARCH_KNOWLEDGE_BASE}')/retrieve`, {
    method: 'POST',
    body: {
      intents: [{ type: 'semantic', search: query }],
      knowledgeSourceParams: [{
        knowledgeSourceName: AZURE_AI_SEARCH_KNOWLEDGE_SOURCE,
        kind: 'searchIndex',
        includeReferences: true,
        includeReferenceSourceData: true,
        rerankerThreshold: 1.0
      }],
      maxRuntimeInSeconds: 30,
      maxOutputSizeInTokens: 6000
    }
  });
}

async function searchRequest(pathname: string, options: { method: string; body?: unknown }): Promise<any> {
  const response = await fetch(
    `${AZURE_AI_SEARCH_ENDPOINT.replace(/\/$/, '')}${pathname}?api-version=${SEARCH_API_VERSION}`,
    {
      method: options.method,
      headers: {
        'api-key': AZURE_AI_SEARCH_KEY,
        'content-type': 'application/json'
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(35_000)
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Azure AI Search ${options.method} ${pathname} failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
