import { promises as fs } from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { strFromU8, unzipSync } from 'fflate';

export interface ExtractedDocument {
  title: string;
  sourcePath: string;
  customerName: string;
  content: string;
}

export interface DocumentChunk {
  id: string;
  title: string;
  sourcePath: string;
  customerName: string;
  chunkOrdinal: number;
  content: string;
}

export class EmptyDocumentError extends Error {
  constructor(readonly filePath: string) {
    super(`No text could be extracted from ${filePath}`);
    this.name = 'EmptyDocumentError';
  }
}

const knownCustomers = [
  'Adatum Corporation',
  'Adventure Works Cycles',
  'Contoso Pharmaceuticals',
  'Tailwind Traders'
];

export async function extractDocument(filePath: string): Promise<ExtractedDocument> {
  const extension = path.extname(filePath).toLowerCase();
  let content: string;

  if (extension === '.docx') {
    content = (await mammoth.extractRawText({ path: filePath })).value;
  } else if (extension === '.xlsx') {
    content = await extractXlsxText(filePath);
  } else {
    throw new Error(`Unsupported document type: ${extension}`);
  }

  content = normalizeWhitespace(content);
  if (!content) throw new EmptyDocumentError(filePath);

  const title = path.basename(filePath, extension).replaceAll('-', ' ');
  return {
    title,
    sourcePath: `customer documents/${path.basename(filePath)}`,
    customerName: inferCustomerName(`${title}\n${content}`),
    content
  };
}

export async function extractDocuments(
  directory: string,
  onSkippedEmpty?: (fileName: string) => void
): Promise<ExtractedDocument[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const supported = entries
    .filter(entry => entry.isFile() && ['.docx', '.xlsx'].includes(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const documents: ExtractedDocument[] = [];
  for (const entry of supported) {
    try {
      documents.push(await extractDocument(path.join(directory, entry.name)));
    } catch (error) {
      if (error instanceof EmptyDocumentError) {
        onSkippedEmpty?.(entry.name);
        continue;
      }
      throw error;
    }
  }
  return documents;
}

export function chunkDocument(document: ExtractedDocument, maxWords = 450, overlapWords = 60): DocumentChunk[] {
  if (maxWords <= 0) throw new Error('maxWords must be greater than zero.');
  if (overlapWords < 0 || overlapWords >= maxWords) {
    throw new Error('overlapWords must be nonnegative and smaller than maxWords.');
  }

  const words = document.content.split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const chunks: DocumentChunk[] = [];
  const step = maxWords - overlapWords;
  for (let start = 0, ordinal = 0; start < words.length; start += step, ordinal += 1) {
    const content = words.slice(start, start + maxWords).join(' ');
    chunks.push({
      id: toSearchKey(`${document.sourcePath}-${ordinal}`),
      title: document.title,
      sourcePath: document.sourcePath,
      customerName: document.customerName,
      chunkOrdinal: ordinal,
      content
    });
    if (start + maxWords >= words.length) break;
  }
  return chunks;
}

export function chunkDocuments(documents: ExtractedDocument[], maxWords = 450, overlapWords = 60): DocumentChunk[] {
  return documents.flatMap(document => chunkDocument(document, maxWords, overlapWords));
}

function inferCustomerName(text: string): string {
  const normalized = text.toLowerCase().replaceAll('-', ' ');
  return knownCustomers.find(customer => normalized.includes(customer.toLowerCase())) ?? 'General';
}

async function extractXlsxText(filePath: string): Promise<string> {
  const archive = unzipSync(new Uint8Array(await fs.readFile(filePath)));
  const sharedStringsXml = archive['xl/sharedStrings.xml'];
  const sharedStrings = sharedStringsXml ? parseSharedStrings(strFromU8(sharedStringsXml)) : [];
  const worksheets = Object.entries(archive)
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(([a], [b]) => a.localeCompare(b));

  return worksheets.map(([, bytes]) => parseWorksheet(strFromU8(bytes), sharedStrings)).join('\n');
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match =>
    normalizeWhitespace([...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map(text => decodeXml(text[1]))
      .join(' '))
  );
}

function parseWorksheet(xml: string, sharedStrings: string[]): string {
  return [...xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].map(rowMatch => {
    const cells = [...rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map(cellMatch => {
      const attributes = cellMatch[1];
      const body = cellMatch[2];
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ??
        body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1] ?? '';
      if (/\bt="s"/.test(attributes)) return sharedStrings[Number(value)] ?? '';
      return decodeXml(value);
    });
    return cells.filter(Boolean).join('\t');
  }).filter(Boolean).join('\n');
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function toSearchKey(value: string): string {
  return Buffer.from(value).toString('base64url');
}
