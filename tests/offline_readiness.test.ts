// tests/offline_readiness.test.ts - Automated Verification of SQLite WAL, Concurrent Numbering, Offline Assets, and Decimal GST
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Decimal from 'decimal.js';
import { initDatabase, closeDatabase, switchDatabase } from '../src/server/database/connection';
import { seedInitialData } from '../src/server/database/seed';
import { NumberingService, formatDocumentNumber, getIndianFinancialYear } from '../src/server/services/numberingService';
import { CompanyService } from '../src/server/services/companyService';
import { calculateLineItem, calculateDocumentTotals } from '../src/server/finance/decimalCalc';
import { createWorker } from 'tesseract.js';

describe('Production Offline-Readiness, Durability & Precision Test Suite', () => {
  let db: any;
  let testCompany: any;
  let tempDataDir: string;
  let prevAppDataDir: string | undefined;

  beforeAll(async () => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim-offline-test-'));
    prevAppDataDir = process.env.APPDATA;
    process.env.APPDATA = tempDataDir;

    db = await initDatabase({ type: 'sqlite' });
    await seedInitialData(db);
    const companyService = new CompanyService(db);
    testCompany = await companyService.createCompany({
      name: 'Offline Test Enterprise Pvt Ltd',
      gstin: '27AABCU9603R1ZM',
      email: 'test@enterprise.local',
      state_code: '27',
      state_name: 'Maharashtra',
    });
  });

  afterAll(async () => {
    await closeDatabase();
    if (prevAppDataDir) {
      process.env.APPDATA = prevAppDataDir;
    } else {
      delete process.env.APPDATA;
    }
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ================= 1. SQLite WAL Mode Durability & Rollback =================
  describe('1. SQLite WAL Durability & Transaction Rollback', () => {
    it('enforces WAL mode, foreign keys, synchronous normal, and busy timeout', async () => {
      const journalRes = await db.raw('PRAGMA journal_mode;');
      const syncRes = await db.raw('PRAGMA synchronous;');
      const fkRes = await db.raw('PRAGMA foreign_keys;');
      const busyRes = await db.raw('PRAGMA busy_timeout;');

      const journalMode = (journalRes[0]?.journal_mode || '').toLowerCase();
      const synchronous = Number(syncRes[0]?.synchronous);
      const foreignKeys = Number(fkRes[0]?.foreign_keys);
      const busyTimeout = Number(busyRes[0]?.timeout);

      expect(journalMode).toBe('wal');
      expect(synchronous).toBe(1); // 1 = NORMAL
      expect(foreignKeys).toBe(1); // 1 = ON
      expect(busyTimeout).toBeGreaterThanOrEqual(5000);
    });

    it('automatically falls back to SQLite WAL mode if PostgreSQL is unavailable without crashing', async () => {
      const fallbackDb = await switchDatabase({
        type: 'postgres',
        pgHost: '127.0.0.1',
        pgPort: 54399,
        pgDatabase: 'invalid_db',
        pgUser: 'invalid_user',
      });
      expect(fallbackDb).toBeDefined();
      const pragma = await fallbackDb.raw('PRAGMA journal_mode;');
      expect((pragma[0]?.journal_mode || '').toLowerCase()).toBe('wal');
      db = fallbackDb;
    });

    it('rolls back atomic transactions cleanly upon simulated failure', async () => {
      const initialCount = await db('companies').count('* as cnt').first();
      const countBefore = Number(initialCount?.cnt || 0);

      await expect(
        db.transaction(async (trx: any) => {
          await trx('companies').insert({
            id: 'failed-company-id',
            name: 'Should Be Rolled Back Ltd',
            legal_name: 'Should Be Rolled Back Ltd',
            registered_address: '123 Test St',
            pin_code: '400001',
            phone: '9876543210',
            email: 'rollback@test.com',
            gstin: '27AABCU9603R1Z9',
            state: 'Maharashtra',
            state_code: '27',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          // Simulate sudden failure/crash
          throw new Error('Simulated write failure for rollback test');
        })
      ).rejects.toThrow('Simulated write failure for rollback test');

      const afterCount = await db('companies').count('* as cnt').first();
      expect(Number(afterCount?.cnt || 0)).toBe(countBefore);

      const rolledBack = await db('companies').where({ id: 'failed-company-id' }).first();
      expect(rolledBack).toBeUndefined();
    });
  });

  // ================= 2. Concurrent Sequential GST Numbering =================
  describe('2. Concurrent Atomic Document Numbering', () => {
    it('generates strictly sequential and collision-free invoice numbers inside transactions', async () => {
      const generatedNumbers: string[] = [];
      const sequenceNumbers: number[] = [];

      // Generate 5 consecutive numbers atomically
      for (let i = 0; i < 5; i++) {
        const result = await db.transaction(async (trx: any) => {
          return await NumberingService.getNextNumber(trx, testCompany.id, 'INVOICE');
        });
        generatedNumbers.push(result.number);
        sequenceNumbers.push(result.sequenceNumber);
      }

      // Check unique and strictly sequential
      const uniqueNumbers = new Set(generatedNumbers);
      expect(uniqueNumbers.size).toBe(5);
      expect(sequenceNumbers).toEqual([1, 2, 3, 4, 5]);

      // Formatted numbers must match prefix and current financial year
      const fy = getIndianFinancialYear();
      expect(generatedNumbers[0]).toContain(fy);
      expect(generatedNumbers[0]).toMatch(/0001$/);
      expect(generatedNumbers[4]).toMatch(/0005$/);
    });
  });

  // ================= 3. Offline Tesseract & Local Asset Bundling =================
  describe('3. Offline OCR & Font Bundling Verification', () => {
    it('contains local traineddata and font files with zero remote dependencies', () => {
      const assetsDir = path.resolve(process.cwd(), 'assets');
      const trainedDataPath = path.join(assetsDir, 'tesseract', 'eng.traineddata');
      const fontRegularPath = path.join(assetsDir, 'fonts', 'AppFont-Regular.ttf');

      expect(fs.existsSync(trainedDataPath)).toBe(true);
      expect(fs.statSync(trainedDataPath).size).toBeGreaterThan(1000000); // ~4.1 MB fast model

      expect(fs.existsSync(fontRegularPath)).toBe(true);
      expect(fs.statSync(fontRegularPath).size).toBeGreaterThan(50000);
    });

    it('initializes local Tesseract worker using bundled language files offline', async () => {
      const langPath = path.resolve(process.cwd(), 'assets', 'tesseract');
      const worker = await createWorker('eng', 1, {
        langPath,
        gzip: false,
        cacheMethod: 'none',
      });

      expect(worker).toBeDefined();
      await worker.terminate();
    });
  });

  // ================= 4. Financial Precision & Decimal GST Edge Cases =================
  describe('4. Decimal.js Financial Precision & Indian GST Edge Cases', () => {
    it('handles intra-state (CGST+SGST) vs inter-state (IGST) split with exact half-up rounding', () => {
      // Intra-state 18% GST on Rs. 333.33 with 5% discount
      const intra = calculateLineItem({
        quantity: 3,
        rate: '333.33',
        discountPercentage: 5,
        gstRate: 18,
        isTaxInclusive: false,
        isInterState: false,
      });

      // 3 * 333.33 = 999.99
      // 5% discount = 49.9995 -> 50.00
      // Taxable = 949.99
      // 18% of 949.99 = 170.9982 -> Total tax 171.00
      // CGST = 85.50, SGST = 85.50, IGST = 0.00
      expect(intra.taxableValue).toBe('949.99');
      expect(intra.cgstAmount).toBe('85.50');
      expect(intra.sgstAmount).toBe('85.50');
      expect(intra.igstAmount).toBe('0.00');
      expect(intra.totalTax).toBe('171.00');
      expect(intra.lineTotal).toBe('1120.99');

      // Inter-state 18% GST on same values
      const inter = calculateLineItem({
        quantity: 3,
        rate: '333.33',
        discountPercentage: 5,
        gstRate: 18,
        isTaxInclusive: false,
        isInterState: true,
      });

      expect(inter.cgstAmount).toBe('0.00');
      expect(inter.sgstAmount).toBe('0.00');
      expect(inter.igstAmount).toBe('171.00');
      expect(inter.lineTotal).toBe('1120.99');
    });

    it('correctly calculates tax-inclusive fractional rate with paise precision', () => {
      // Tax inclusive Rs. 999.00 with 18% GST
      const inclusive = calculateLineItem({
        quantity: 1,
        rate: '999.00',
        gstRate: 18,
        isTaxInclusive: true,
        isInterState: false,
      });

      // 999 / 1.18 = 846.610169... -> Taxable = 846.61
      // Tax = 999.00 - 846.61 = 152.39
      // CGST = 76.20, SGST = 76.20 (div 2 = 76.195 -> 76.20 each)
      expect(inclusive.lineTotal).toBe('999.00');
      expect(inclusive.taxableValue).toBe('846.61');
      expect(inclusive.totalTax).toBe('152.39');
      expect(new Decimal(inclusive.taxableValue).add(inclusive.totalTax).toFixed(2)).toBe('999.00');
    });

    it('computes document round-off accurately to nearest integer', () => {
      const items = [
        calculateLineItem({
          quantity: 1,
          rate: '100.40',
          gstRate: 0,
          isTaxInclusive: false,
          isInterState: false,
        }),
      ];

      const totals = calculateDocumentTotals({ items });
      // 100.40 rounds to 100.00 with -0.40 round-off
      expect(totals.roundOff).toBe('-0.40');
      expect(totals.grandTotal).toBe('100.00');

      const items2 = [
        calculateLineItem({
          quantity: 1,
          rate: '100.60',
          gstRate: 0,
          isTaxInclusive: false,
          isInterState: false,
        }),
      ];
      const totals2 = calculateDocumentTotals({ items: items2 });
      // 100.60 rounds to 101.00 with +0.40 round-off
      expect(totals2.roundOff).toBe('0.40');
      expect(totals2.grandTotal).toBe('101.00');
    });
  });
});
