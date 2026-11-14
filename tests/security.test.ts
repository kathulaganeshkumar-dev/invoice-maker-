import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import { sanitizeCellValue } from '../src/server/services/importExportService';
import { BackupRestoreService } from '../src/server/services/backupRestoreService';
import { LetterheadService } from '../src/server/services/letterheadService';
import { initDatabase, getDefaultDataDir } from '../src/server/database/connection';

describe('Security Hardening Test Suite', () => {
  it('sanitizeCellValue escapes formula injection characters', () => {
    expect(sanitizeCellValue('=1+1')).toBe("'=1+1");
    expect(sanitizeCellValue('+100')).toBe("'+100");
    expect(sanitizeCellValue('-500')).toBe("'-500");
    expect(sanitizeCellValue('@HYPERLINK("http://evil.com")')).toBe("'@HYPERLINK(\"http://evil.com\")");
    expect(sanitizeCellValue('\tTabbed')).toBe("'\tTabbed");
    expect(sanitizeCellValue('Normal Customer Name')).toBe('Normal Customer Name');
    expect(sanitizeCellValue(12345)).toBe(12345);
    expect(sanitizeCellValue(null)).toBe(null);
  });

  it('BackupRestoreService rejects directory traversal and unauthorized filenames', async () => {
    const db = await initDatabase({ type: 'sqlite' });
    const backupService = new BackupRestoreService(db);

    await expect(backupService.restoreFromBackup('../../outside.sqlite3')).rejects.toThrow(
      'Backup file outside.sqlite3 does not exist in authorized backups directory.'
    );

    await expect(backupService.restoreFromBackup('..\\..\\outside.sqlite3')).rejects.toThrow(
      'Backup file outside.sqlite3 does not exist in authorized backups directory.'
    );

    await expect(backupService.restoreFromBackup('malicious.exe')).rejects.toThrow(
      'Invalid backup archive file format. Only .sqlite3 database files are permitted.'
    );

    await expect(backupService.restoreFromBackup('')).rejects.toThrow('Backup filename is required.');
  });

  it('LetterheadService strictly confines template file access to company upload directory', async () => {
    const db = await initDatabase({ type: 'sqlite' });
    const letterheadService = new LetterheadService(db);
    const companyId = 'sec-test-company-1';

    const safeDir = letterheadService.getLetterheadUploadDir(companyId);
    const safeFilePath = path.join(safeDir, 'template1.pdf');

    // Valid path inside upload directory
    expect(letterheadService.validateFilePathInsideUploadDir(companyId, safeFilePath)).toBe(
      path.resolve(safeFilePath)
    );

    // Directory traversal attempt outside upload directory
    expect(() =>
      letterheadService.validateFilePathInsideUploadDir(companyId, 'C:\\Windows\\win.ini')
    ).toThrow('Access denied: Letterhead template file must reside inside company upload directory');

    expect(() =>
      letterheadService.validateFilePathInsideUploadDir(companyId, path.join(safeDir, '..', 'other-company', 'file.pdf'))
    ).toThrow('Access denied: Letterhead template file must reside inside company upload directory');
  });
});
