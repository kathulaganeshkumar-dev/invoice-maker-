// src/server/testDb.ts - Verify database migration and seed
import { initDatabase, closeDatabase } from './database/connection';
import { seedInitialData } from './database/seed';

async function main() {
  console.log('Initializing test SQLite database...');
  const db = await initDatabase({ type: 'sqlite' });
  console.log('Migrations executed successfully!');

  console.log('Running seedInitialData...');
  await seedInitialData(db);
  console.log('Seeding completed successfully!');

  const companies = await db('companies').select('id', 'name', 'legal_name');
  console.log('Seeded Companies:', companies);

  const sequences = await db('numbering_sequences').select('document_type', 'prefix', 'current_number');
  console.log('Seeded Sequences:', sequences);

  const products = await db('products').select('name', 'item_type', 'selling_price', 'current_stock');
  console.log('Seeded Products:', products);

  await closeDatabase();
  console.log('Database test complete!');
}

main().catch((err) => {
  console.error('Database test failed:', err);
  process.exit(1);
});
