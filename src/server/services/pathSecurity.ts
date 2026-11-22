// src/server/services/pathSecurity.ts - Filesystem Containment, Safe Local Export Paths & Request Guards
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

const WINDOWS_FORBIDDEN_SUBPATHS = [
  '\\windows',
  '\\program files',
  '\\program files (x86)',
  '\\programdata',
  '\\system32',
  '\\syswow64',
  '\\start menu\\programs\\startup',
  '\\appdata\\roaming\\microsoft\\windows',
  '\\recovery',
  '\\$recycle.bin',
  '\\system volume information',
];

const POSIX_FORBIDDEN_PREFIXES = [
  '/etc',
  '/bin',
  '/sbin',
  '/usr',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/root',
  '/var/run',
  '/run',
  '/lib',
  '/lib64',
];

function assertPathNotForbidden(resolvedPath: string): void {
  const normalized = path.resolve(resolvedPath);

  // Reject bare filesystem roots (e.g. C:\ or /)
  const parsed = path.parse(normalized);
  if (normalized === parsed.root) {
    throw new Error('Save folder cannot be a bare drive root. Please choose a subfolder.');
  }

  if (process.platform === 'win32' || /^[A-Za-z]:[\\/]/.test(normalized)) {
    const lower = normalized.replace(/\//g, '\\').toLowerCase();
    // Strip drive letter (e.g., "c:") to inspect path segments
    const withoutDrive = lower.replace(/^[a-z]:/, '');
    for (const bad of WINDOWS_FORBIDDEN_SUBPATHS) {
      if (
        withoutDrive === bad ||
        withoutDrive.startsWith(bad + '\\') ||
        withoutDrive.includes(bad + '\\') ||
        withoutDrive.endsWith(bad)
      ) {
        throw new Error('Selected save folder points to a protected system directory and is not permitted.');
      }
    }
    if (withoutDrive.includes('\\.ssh\\') || withoutDrive.endsWith('\\.ssh')) {
      throw new Error('Selected save folder points to a protected credential directory and is not permitted.');
    }
  } else {
    const lower = normalized.toLowerCase();
    for (const prefix of POSIX_FORBIDDEN_PREFIXES) {
      if (lower === prefix || lower.startsWith(prefix + '/')) {
        throw new Error('Selected save folder points to a protected system directory and is not permitted.');
      }
    }
    if (lower.includes('/.ssh/') || lower.endsWith('/.ssh')) {
      throw new Error('Selected save folder points to a protected credential directory and is not permitted.');
    }
  }
}

/**
 * Validates a user-configured local directory for auto-saving generated files (PDFs, reports, backups).
 * Allows normal user/business folders (e.g. Documents, Desktop, D:\Invoices) while blocking:
 * - Relative paths and ".." traversal
 * - UNC network paths (\\server\share) and Windows device paths (\\.\, \\?\)
 * - System/OS/Startup/credential directories (including via symlinks/junctions)
 * - Non-directory targets
 */
export function validateSafeLocalSaveDir(rawPath?: string | null): string {
  if (rawPath === null || rawPath === undefined) return '';
  const trimmed = String(rawPath).trim();
  if (!trimmed) return '';

  if (/[\x00-\x1f]/.test(trimmed)) {
    throw new Error('Save folder path contains invalid control characters.');
  }

  // Block UNC network shares (\\server\share, //server/share) and Windows device namespaces (\\.\, \\?\)
  if (trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
    throw new Error('Network UNC shares and device paths are not permitted as local save folders.');
  }

  // Block explicit parent traversal segments
  const rawSegments = trimmed.split(/[\\/]+/);
  if (rawSegments.some((seg) => seg === '..')) {
    throw new Error('Relative parent traversal ("..") is not permitted in save folder paths.');
  }

  if (!path.isAbsolute(trimmed)) {
    throw new Error('Save folder must be a full absolute local directory path.');
  }

  const resolved = path.resolve(trimmed);
  assertPathNotForbidden(resolved);

  // If the directory already exists, resolve symlinks/junctions and re-verify
  if (fs.existsSync(resolved)) {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error('Configured save path must point to a folder, not a file.');
    }
    const real = fs.realpathSync(resolved);
    assertPathNotForbidden(real);
    return real;
  }

  // Even when the leaf folder doesn't exist yet, verify the nearest existing ancestor isn't a symlink to a forbidden dir
  let probe = path.dirname(resolved);
  let prev = '';
  while (probe && probe !== prev) {
    if (fs.existsSync(probe)) {
      const realAncestor = fs.realpathSync(probe);
      const rel = path.relative(probe, resolved);
      assertPathNotForbidden(path.resolve(realAncestor, rel));
      break;
    }
    prev = probe;
    probe = path.dirname(probe);
  }

  return resolved;
}

/**
 * Produces a strictly safe filename segment suitable for filesystem paths and HTTP Content-Disposition headers.
 */
export function sanitizeFilenameSegment(input: string, fallback = 'document'): string {
  const cleaned = String(input || '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * Securely writes a generated PDF file into a validated user-configured local folder.
 * Returns the written file path, or null if dirPath is empty.
 */
export function writePdfToSafeLocalDir(
  dirPath: string | null | undefined,
  documentNumber: string,
  pdfBytes: Uint8Array | Buffer
): string | null {
  const validDir = validateSafeLocalSaveDir(dirPath);
  if (!validDir) return null;

  if (!fs.existsSync(validDir)) {
    fs.mkdirSync(validDir, { recursive: true });
  }

  const realDir = fs.realpathSync(validDir);
  assertPathNotForbidden(realDir);
  if (!fs.statSync(realDir).isDirectory()) {
    throw new Error('Configured save path is not a directory.');
  }

  const safeName = `${sanitizeFilenameSegment(documentNumber, 'document')}.pdf`;
  const targetPath = path.resolve(realDir, safeName);
  if (!targetPath.startsWith(realDir + path.sep)) {
    throw new Error('Resolved PDF output path escaped target directory.');
  }

  fs.writeFileSync(targetPath, Buffer.from(pdfBytes));
  return targetPath;
}

/**
 * Securely writes an exported Excel/CSV or imported backup data file into a validated user-configured local folder.
 * Returns the written file path, or null if dirPath is empty.
 */
export function writeExportFileToSafeLocalDir(
  dirPath: string | null | undefined,
  baseFilename: string,
  buffer: Uint8Array | Buffer
): string | null {
  const validDir = validateSafeLocalSaveDir(dirPath);
  if (!validDir) return null;

  if (!fs.existsSync(validDir)) {
    fs.mkdirSync(validDir, { recursive: true });
  }

  const realDir = fs.realpathSync(validDir);
  assertPathNotForbidden(realDir);
  if (!fs.statSync(realDir).isDirectory()) {
    throw new Error('Configured save path is not a directory.');
  }

  const ext = path.extname(baseFilename) || '.xlsx';
  const rawBase = path.basename(baseFilename, ext);
  const safeName = `${sanitizeFilenameSegment(rawBase, 'export')}${ext}`;
  const targetPath = path.resolve(realDir, safeName);
  if (!targetPath.startsWith(realDir + path.sep)) {
    throw new Error('Resolved export output path escaped target directory.');
  }

  fs.writeFileSync(targetPath, Buffer.from(buffer));
  return targetPath;
}

/**
 * Checks whether an incoming HTTP request originated directly from the local machine (loopback).
 * Uses socket.remoteAddress rather than spoofable X-Forwarded-For headers.
 */
export function isLoopbackRequest(req: Request): boolean {
  const addr = req.socket?.remoteAddress || req.ip || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Validates PostgreSQL host/port inputs for connection testing to prevent arbitrary external/cloud-metadata probing.
 */
export function validateSafeDatabaseHost(
  rawHost: string,
  rawPort?: number | string
): { host: string; port: number } {
  const host = String(rawHost || '').trim();
  if (!host || host.length > 253 || /[\s/\\@:?#]/.test(host)) {
    throw new Error('Invalid database host format.');
  }

  // Block cloud metadata and link-local IPv4 ranges (169.254.0.0/16) and unspecified 0.0.0.0
  const lower = host.toLowerCase();
  if (lower.startsWith('169.254.') || lower === '0.0.0.0' || lower === '::' || lower === 'metadata.google.internal') {
    throw new Error('Target database host is not permitted.');
  }

  const port = rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== ''
    ? Number(rawPort)
    : 5432;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Database port must be an integer between 1024 and 65535.');
  }

  return { host, port };
}

/**
 * Offline, zero-dependency fixed-window in-memory rate limiter middleware for sensitive endpoints.
 */
export function createSimpleRateLimiter(options: { windowMs: number; max: number; message?: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.socket?.remoteAddress || req.ip || 'local';
    const now = Date.now();
    const existing = hits.get(key);

    if (!existing || now >= existing.resetAt) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      // Periodic map cleanup to prevent unbounded growth
      if (hits.size > 500) {
        for (const [k, v] of hits.entries()) {
          if (now >= v.resetAt) hits.delete(k);
        }
      }
      return next();
    }

    if (existing.count >= options.max) {
      return res.status(429).json({
        error: options.message || 'Too many requests. Please wait a moment and try again.',
      });
    }

    existing.count += 1;
    return next();
  };
}
