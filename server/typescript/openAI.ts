import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { QueryData, EmailSmsResponse } from './interfaces';
import './config';

const {
    AI_API_KEY,
    AI_ENDPOINT,
    AI_MODEL
} = process.env as Record<string, string>;
let aiClient: OpenAI | undefined;

async function callAI(systemPrompt: string, userPrompt: string, jsonOutput = false): Promise<string> {
    checkRequiredEnvVars(['AI_API_KEY', 'AI_ENDPOINT', 'AI_MODEL']);

    const client = aiClient ??= new OpenAI({
        apiKey: AI_API_KEY,
        baseURL: `${AI_ENDPOINT.replace(/\/$/, '')}/openai/v1/`,
        timeout: 30_000,
        maxRetries: 2
    });
    const response = await client.responses.create({
        model: AI_MODEL,
        instructions: systemPrompt,
        input: jsonOutput ? `Return the result as JSON.\n\n${userPrompt}` : userPrompt,
        reasoning: { effort: 'low' },
        max_output_tokens: 2000,
        ...(jsonOutput ? { text: { format: { type: 'json_object' as const } } } : {})
    });
    if (response.status !== 'completed') throw new Error('The model response was incomplete.');
    return response.output_text.trim();
}

async function getSQLFromNLP(userPrompt: string): Promise<QueryData> {
    const dbSchemaPath = path.resolve(__dirname, path.basename(__dirname) === 'dist' ? '../db.schema' : 'db.schema');
    const dbSchema = await fs.promises.readFile(dbSchemaPath, 'utf8');
    const systemPrompt = `
      You convert natural language into safe PostgreSQL SELECT queries and return only a JSON object.

      PostgreSQL tables with their columns:
      ${dbSchema}

      Rules:
      - Generate SELECT statements only.
      - Convert user-controlled values to PostgreSQL positional parameters such as $1.
      - Return exactly: { "sql": "", "paramValues": [] }

      Examples:
      User: "Display all company reviews. Group by company."
      Assistant: { "sql": "SELECT * FROM reviews", "paramValues": [] }

      User: "Display all reviews for companies located in cities that start with L."
      Assistant: { "sql": "SELECT r.* FROM reviews r INNER JOIN customers c ON r.customer_id = c.id WHERE c.city LIKE $1", "paramValues": ["L%"] }

      User: "Display revenue for companies located in London. Include the company name and city."
      Assistant: { "sql": "SELECT c.company, c.city, SUM(o.total) AS revenue FROM customers c INNER JOIN orders o ON c.id = o.customer_id WHERE c.city = $1 GROUP BY c.company, c.city", "paramValues": ["London"] }
    `;

    let queryData: QueryData = { sql: '', paramValues: [], error: '' };
    let results = '';
    try {
        results = await callAI(systemPrompt, userPrompt, true);
        const json = extractJson(results);
        if (!json) throw new Error('The model did not return a JSON query object.');
        const parsed = JSON.parse(json);
        const primitiveParameters = Array.isArray(parsed.paramValues) && parsed.paramValues.every((value: unknown) =>
            value === null || typeof value === 'string' || typeof value === 'boolean' ||
            (typeof value === 'number' && Number.isFinite(value))
        );
        if (typeof parsed.sql !== 'string' || !primitiveParameters || parsed.paramValues.length > 50) {
            throw new Error('The model returned an invalid query object.');
        }
        queryData = { ...queryData, sql: parsed.sql, paramValues: parsed.paramValues };
        if (isProhibitedQuery(queryData.sql)) {
            queryData.sql = '';
            queryData.error = 'Prohibited query.';
        }
    } catch (error) {
        console.error('Error generating SQL:', error);
        queryData.sql = '';
        queryData.error = error instanceof Error ? error.message : 'Error generating SQL.';
    }
    return queryData;
}

function isProhibitedQuery(query: string): boolean {
    if (!query) return false;

    const prohibitedKeywords = [
        'insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create', 'replace',
        'information_schema', 'pg_catalog', 'pg_tables', 'pg_proc', 'pg_namespace', 'pg_class',
        'table_schema', 'table_name', 'column_name', 'column_default', 'is_nullable',
        'data_type', 'udt_name', 'character_maximum_length', 'numeric_precision',
        'numeric_scale', 'datetime_precision', 'interval_type', 'collation_name',
        'grant', 'revoke', 'rollback', 'commit', 'savepoint', 'vacuum', 'analyze'
    ];
    const queryLower = query.toLowerCase();
    return prohibitedKeywords.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(queryLower));
}

async function completeEmailSMSMessages(prompt: string, company: string, contactName: string): Promise<EmailSmsResponse> {
    const systemPrompt = `
      You help customer-service employees create email and SMS messages and return only a JSON object.

      Rules:
      - Generate an email subject and body.
      - Follow the user's message rules.
      - Keep a friendly, professional tone.
      - SMS must be plain text and no more than 160 characters.
      - Start the email with "Hi <Contact Name>,".
      - End the email with "Sincerely,\\nCustomer Service".
      - Return exactly: { "emailSubject": "", "emailBody": "", "sms": "" }
    `;
    const userPrompt = `Company: ${company}\nContact Name: ${contactName}\nMessage Rules: ${prompt}`;

    let content: EmailSmsResponse = {
        status: true,
        emailSubject: '',
        emailBody: '',
        sms: '',
        error: ''
    };
    try {
        const results = await callAI(systemPrompt, userPrompt, true);
        const json = extractJson(results);
        if (!json) throw new Error('The model did not return a JSON message object.');
        const parsed = JSON.parse(json);
        if (![parsed.emailSubject, parsed.emailBody, parsed.sms].every(value => typeof value === 'string')) {
            throw new Error('The model returned an invalid message object.');
        }
        content = {
            ...content,
            emailSubject: parsed.emailSubject,
            emailBody: parsed.emailBody,
            sms: parsed.sms.slice(0, 160),
            status: true
        };
    } catch (error) {
        console.error('Error generating email and SMS messages:', error);
        content.status = false;
        content.error = error instanceof Error ? error.message : 'Error generating messages.';
    }
    return content;
}

function checkRequiredEnvVars(requiredEnvVars: string[]) {
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing ${envVar} in environment variables.`);
        }
    }
}

function extractJson(content: string) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return fenced;
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    return start >= 0 && end > start ? content.slice(start, end + 1) : '';
}

export { completeEmailSMSMessages, getSQLFromNLP };
