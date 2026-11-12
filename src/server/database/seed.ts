// src/server/database/seed.ts - Initial global application settings seeder (clean slate, zero demo company data)
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export async function seedInitialData(db: Knex): Promise<void> {
  const now = new Date().toISOString();

  // 1. App settings (No pre-seeded demo company, customer, supplier, product, or inventory records)
  const existingApp = await db('app_settings').first();
  if (!existingApp) {
    await db('app_settings').insert({
      id: uuidv4(),
      operating_mode: 'SINGLE_COMPUTER',
      db_type: 'sqlite',
      server_port: 4200,
      show_company_selector_on_startup: true,
      theme: 'light',
      created_at: now,
      updated_at: now,
    });
  }
}
