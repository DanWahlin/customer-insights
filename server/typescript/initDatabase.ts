import { Pool, PoolClient } from 'pg';
import { databaseConfig } from './databaseConfig';

const pool = new Pool(databaseConfig);

async function checkTables(db: PoolClient) {
  const query = `SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public';`;

  const res = await db.query(query);
  const tableNames = res.rows.map(row => row.table_name);
  return tableNames.includes('customers') && tableNames.includes('orders') && tableNames.includes('order_items');
}

async function createTables(db: PoolClient) {
  const createCustomersTable = `CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    company VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NOT NULL
  );`;

  const createOrdersTable = `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    date DATE NOT NULL,
    total NUMERIC(10,2) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );`;

  const createOrderItemsTable = `CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );`;

  const createReviewsTable = `CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    review INTEGER NOT NULL,
    date DATE NOT NULL,
    comment VARCHAR(500) NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );`;

  await db.query(createCustomersTable);
  await db.query(createOrdersTable);
  await db.query(createOrderItemsTable);
  await db.query(createReviewsTable);
}

async function seedData(db: PoolClient) {
  const insertCustomers = `INSERT INTO customers (company, first_name, last_name, city, email, phone)
    VALUES
      ('Adatum Corporation', 'Jane', 'Doe', 'New York', 'jane.doe@example.com', '+15551234567'),
      ('Adventure Works Cycles', 'John', 'Smith', 'London', 'john.smith@example.com', '+15551237654'),
      ('Contoso Pharmaceuticals', 'Peter', 'Gibbons', 'Austin', 'peter.gibbons@example.com', '+15553211234'),
      ('Tailwind Traders', 'Lisa', 'Taylor', 'Sydney', 'lisa.taylor@example.com', '+15551231234');`;

  const insertOrders = `INSERT INTO orders (customer_id, date, total)
    VALUES
      (1, '2023-03-15', 10000.00),
      (2, '2023-03-14', 45000.00),
      (3, '2023-03-14', 100.00),
      (4, '2023-03-14', 30000.00),
      (1, '2023-02-22', 2000.00),
      (2, '2023-01-31', 75000.00),
      (4, '2023-04-12', 15000.00);`;

  const insertOrderItems = `INSERT INTO order_items (order_id, product_id, quantity, price)
    VALUES
      (1, 1, 1, 5000.00),
      (1, 2, 1, 5000.00),
      (2, 1, 9, 5000.00),
      (3, 3, 1, 100.00),
      (4, 2, 1, 30000.00),
      (5, 2, 1, 2000.00),
      (6, 3, 1, 75000.00),
      (7, 3, 1, 7500.00);`;

  const insertReviews = `INSERT INTO reviews (customer_id, review, date, comment)
    VALUES
      (1, 4, '2023-03-15', 'Excellent company!'),
      (2, 3, '2023-03-14', 'Average company. Not that impressed.'),
      (3, 5, '2023-03-14', 'Excellent company!'),
      (4, 1, '2023-03-14', 'Hated them - not good at all.'),
      (1, 5, '2023-02-22', 'Very nice company!'),
      (2, 3, '2023-01-31', 'They get the job done.'),
      (4, 5, '2023-04-12', 'Would buy from them again!');`;

  const customersSelectSproc = `CREATE OR REPLACE FUNCTION get_customers()
      RETURNS SETOF customers 
      LANGUAGE SQL 
  AS $$
  SELECT id, company, first_name, last_name, city, email, phone FROM customers
  $$;`

  await db.query(insertCustomers);
  await db.query(insertOrders);
  await db.query(insertOrderItems);
  await db.query(insertReviews);
  await db.query(customersSelectSproc);
}

export async function initializeDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('openai-acs-msgraph-init'))");
    console.log('Connected to database...');

    const tablesExisted = await checkTables(client);
    await createTables(client);
    const customerCount = Number((await client.query('SELECT COUNT(*) AS count FROM customers')).rows[0].count);
    if (customerCount === 0) await seedData(client);
    else {
      await client.query(`CREATE OR REPLACE FUNCTION get_customers()
        RETURNS SETOF customers
        LANGUAGE SQL
        AS $$ SELECT id, company, first_name, last_name, city, email, phone FROM customers $$;`);
    }

    await client.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
          CREATE ROLE app_readonly NOLOGIN;
        END IF;
      END
    $$;`);
    await client.query('GRANT USAGE ON SCHEMA public TO app_readonly');
    await client.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly');
    await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly');
    await client.query('GRANT EXECUTE ON FUNCTION get_customers() TO app_readonly');
    await client.query('COMMIT');
    console.log(tablesExisted && customerCount > 0 ? 'Database already initialized' : 'Database initialized');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
