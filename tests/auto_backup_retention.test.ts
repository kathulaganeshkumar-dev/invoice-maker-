// tests/auto_backup_retention.test.ts - Auto-Backup Daily Scheduling, Custom Directory & Retention Pruning Tests
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import knex, { Knex } from 'knex';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigrations } from '../src/server/database/migrations';
import { BackupRestoreService } from '../src/server/services/backupRestoreService';

describe('Automated Daily Backup, Custom Path & Retention Policy', () => {
  let db: Knex;
  let tempDir: string;
  let customBackupDir: string;
  let service: BackupRestoreService;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eim_auto_backup_test_'));
    customBackupDir = path.join(tempDir, 'MyCustomBackups');
    fs.mkdirSync(customBackupDir, { recursive: true });

    const dbPath = path.join(tempDir, 'test.sqlite3');
    db = knex({
      client: 'sqlite3',
      connection: { filename: dbPath },
      useNullAsDefault: true,
    });

    await runMigrations(db);

    // Seed minimal app_settings row
    await db('app_settings').insert({
      id: 'app-test-1',
      operating_mode: 'SINGLE_COMPUTER',
      db_type: 'sqlite',
      server_port: 4200,
      show_company_selector_on_startup: true,
      theme: 'light',
      auto_backup_enabled: true,
      auto_backup_frequency: 'DAILY',
      auto_backup_interval_days: 1,
      auto_backup_retention_days: 30,
      auto_backup_max_count: 30,
      backup_save_path: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    service = new BackupRestoreService(db);
  });

  afterEach(async () => {
    await db.destroy();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('1. Retrieves default automated backup settings correctly', async () => {
    const settings = await service.getAutoBackupSettings();
    expect(settings.auto_backup_enabled).toBe(true);
    expect(settings.auto_backup_frequency).toBe('DAILY');
    expect(settings.auto_backup_interval_days).toBe(1);
    expect(settings.auto_backup_retention_days).toBe(30);
    expect(settings.auto_backup_max_count).toBe(30);
    expect(settings.backup_save_path).toBe('');
  });

  it('2. Updates auto-backup configuration and custom folder path', async () => {
    const updated = await service.updateAutoBackupSettings({
      auto_backup_enabled: true,
      auto_backup_frequency: 'EVERY_N_DAYS',
      auto_backup_interval_days: 3,
      auto_backup_retention_days: 15,
      auto_backup_max_count: 10,
      backup_save_path: customBackupDir,
    });

    expect(updated.auto_backup_enabled).toBe(true);
    expect(updated.auto_backup_frequency).toBe('EVERY_N_DAYS');
    expect(updated.auto_backup_interval_days).toBe(3);
    expect(updated.auto_backup_retention_days).toBe(15);
    expect(updated.auto_backup_max_count).toBe(10);
    expect(updated.backup_save_path).toBe(customBackupDir);

    // Verify persisted in database
    const row = await db('app_settings').first();
    expect(row.auto_backup_frequency).toBe('EVERY_N_DAYS');
    expect(row.auto_backup_interval_days).toBe(3);
    expect(row.auto_backup_retention_days).toBe(15);
    expect(row.auto_backup_max_count).toBe(10);
    expect(row.backup_save_path).toBe(customBackupDir);
  });

  it('3. Prunes backups older than configured retention days', () => {
    const testDir = path.join(tempDir, 'retention_test');
    fs.mkdirSync(testDir, { recursive: true });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Create 3 files: 2 days old, 10 days old, 45 days old
    const f1 = path.join(testDir, 'auto_backup_2026-11-22.sqlite3');
    const f2 = path.join(testDir, 'auto_backup_2026-11-14.sqlite3');
    const f3 = path.join(testDir, 'auto_backup_2026-10-10.sqlite3');

    fs.writeFileSync(f1, 'snapshot1');
    fs.writeFileSync(f2, 'snapshot2');
    fs.writeFileSync(f3, 'snapshot3');

    // Manually set mtime
    fs.utimesSync(f1, (now - 2 * dayMs) / 1000, (now - 2 * dayMs) / 1000);
    fs.utimesSync(f2, (now - 10 * dayMs) / 1000, (now - 10 * dayMs) / 1000);
    fs.utimesSync(f3, (now - 45 * dayMs) / 1000, (now - 45 * dayMs) / 1000);

    // Prune with retention of 30 days and max count of 10
    const result = service.pruneDirectoryBackups(testDir, 30, 10);
    expect(result.prunedCount).toBe(1);
    expect(result.remainingCount).toBe(2);

    expect(fs.existsSync(f1)).toBe(true);
    expect(fs.existsSync(f2)).toBe(true);
    expect(fs.existsSync(f3)).toBe(false); // 45 days old pruned!
  });

  it('4. Prunes excess backups beyond configured max count', () => {
    const testDir = path.join(tempDir, 'max_count_test');
    fs.mkdirSync(testDir, { recursive: true });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Create 6 files, each 1 day apart
    const files: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const p = path.join(testDir, `auto_backup_2026-11-0${i}.sqlite3`);
      fs.writeFileSync(p, `snapshot_${i}`);
      const fileTime = (now - (10 - i) * dayMs) / 1000;
      fs.utimesSync(p, fileTime, fileTime);
      files.push(p);
    }

    // Prune with maxCount = 3, retention = 60 days
    const result = service.pruneDirectoryBackups(testDir, 60, 3);
    expect(result.prunedCount).toBe(3);
    expect(result.remainingCount).toBe(3);

    // The oldest 3 files (indices 0, 1, 2) should be deleted
    expect(fs.existsSync(files[0])).toBe(false);
    expect(fs.existsSync(files[1])).toBe(false);
    expect(fs.existsSync(files[2])).toBe(false);
    // The newest 3 files (indices 3, 4, 5) should remain
    expect(fs.existsSync(files[3])).toBe(true);
    expect(fs.existsSync(files[4])).toBe(true);
    expect(fs.existsSync(files[5])).toBe(true);
  });

  it('5. Executes auto-backup to user custom directory and enforces retention', async () => {
    await service.updateAutoBackupSettings({
      auto_backup_enabled: true,
      auto_backup_frequency: 'DAILY',
      auto_backup_retention_days: 7,
      auto_backup_max_count: 5,
      backup_save_path: customBackupDir,
    });

    const runResult = await service.runDailyRollingBackup(true);
    expect(runResult.backup).not.toBeNull();
    expect(runResult.destinationDir).toBe(customBackupDir);
    expect(fs.existsSync(runResult.backup!.filePath)).toBe(true);
    expect(runResult.backup!.filePath.startsWith(customBackupDir)).toBe(true);

    // Verify last_auto_backup_at updated in database
    const updatedSettings = await service.getAutoBackupSettings();
    expect(updatedSettings.last_auto_backup_at).toBeTruthy();
  });

  it('6. Does not duplicate daily backup if already completed today unless forced', async () => {
    await service.updateAutoBackupSettings({
      auto_backup_enabled: true,
      auto_backup_frequency: 'DAILY',
      backup_save_path: customBackupDir,
    });

    // First run (forced)
    const firstRun = await service.runDailyRollingBackup(true);
    expect(firstRun.backup).not.toBeNull();

    // Second run (unforced on same day) -> should skip
    const secondRun = await service.runDailyRollingBackup(false);
    expect(secondRun.backup).toBeNull();
    expect(secondRun.message).toContain("Today's daily backup has already been completed.");

    // Third run (forced) -> should proceed and create snapshot
    const thirdRun = await service.runDailyRollingBackup(true);
    expect(thirdRun.backup).not.toBeNull();
  });
});
