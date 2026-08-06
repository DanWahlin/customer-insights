import { Pool } from 'pg';
import { QueryData } from './interfaces';
import { runtimeDatabaseConfig } from './databaseConfig';

const pool = new Pool(runtimeDatabaseConfig);

async function getCustomers() {
    console.log('Getting customers from database.');
    return pool.query('SELECT * FROM get_customers()');
}

async function queryDb(sqlCommandObject: QueryData): Promise<any[]> {
    if (!sqlCommandObject) {
        throw new Error('Missing SQL command object.');
    }

    const withoutTrailingSemicolon = normalizeReadOnlyQuery(sqlCommandObject.sql);
    if (!withoutTrailingSemicolon) {
        throw new Error('Only a single SELECT query is allowed.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN TRANSACTION READ ONLY');
        await client.query('SET LOCAL statement_timeout = 5000');
        const result = await client.query(withoutTrailingSemicolon, sqlCommandObject.paramValues);
        await client.query('COMMIT');

        // Check if the result has rows or an object literal, and handle accordingly
        if (!result.rows) {
            return [];
        }

        if (Array.isArray(result.rows)) {
            return result.rows;
        }

        if (typeof result.rows === 'object') {
            return [result.rows];
        }

        return [];
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        console.error('Error executing query:', e);
        throw new Error('Error executing query.');
    }
    finally {
        client.release();
    }
}

function normalizeReadOnlyQuery(sql: string): string | null {
    const normalized = sql.trim().replace(/;\s*$/, '');
    if (!/^(select|with)\b/i.test(normalized) || normalized.includes(';')) return null;
    return normalized;
}

export { getCustomers, normalizeReadOnlyQuery, queryDb };