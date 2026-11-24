// src/server/services/diskSpaceGuard.ts - Proactive Disk Space Guard using native fs.statfs
import fs from 'fs';
import path from 'path';

export interface DiskSpaceCheckResult {
  ok: boolean;
  freeBytes: number;
  totalBytes: number;
  freeMb: number;
  requiredMb: number;
  message?: string;
}

/**
 * Checks available free disk space on the volume hosting targetDirOrFile.
 * Default minimum free space threshold is 25 MB to prevent database corruption or failed writes.
 */
export async function checkDiskSpace(
  targetDirOrFile: string,
  minRequiredBytes: number = 25 * 1024 * 1024
): Promise<DiskSpaceCheckResult> {
  try {
    let checkDir = path.resolve(targetDirOrFile);
    while (!fs.existsSync(checkDir)) {
      const parent = path.dirname(checkDir);
      if (parent === checkDir) break;
      checkDir = parent;
    }

    if (typeof fs.promises.statfs !== 'function') {
      return {
        ok: true,
        freeBytes: Number.MAX_SAFE_INTEGER,
        totalBytes: Number.MAX_SAFE_INTEGER,
        freeMb: 999999,
        requiredMb: Math.round(minRequiredBytes / (1024 * 1024)),
      };
    }

    const stats = await fs.promises.statfs(checkDir);
    const bsize = stats.bsize || (stats as any).frsize || 4096;
    const freeBytes = Number(stats.bavail) * Number(bsize);
    const totalBytes = Number(stats.blocks) * Number(bsize);
    const freeMb = Math.round(freeBytes / (1024 * 1024));
    const requiredMb = Math.round(minRequiredBytes / (1024 * 1024));

    if (freeBytes < minRequiredBytes) {
      return {
        ok: false,
        freeBytes,
        totalBytes,
        freeMb,
        requiredMb,
        message: `Insufficient disk space: Only ${freeMb} MB free on disk, but at least ${requiredMb} MB is required for this operation. Please free up disk space.`,
      };
    }

    return {
      ok: true,
      freeBytes,
      totalBytes,
      freeMb,
      requiredMb,
    };
  } catch (err: any) {
    // If statfs fails for any OS reason, allow write attempt rather than blocking falsely
    return {
      ok: true,
      freeBytes: 1024 * 1024 * 1024,
      totalBytes: 1024 * 1024 * 1024,
      freeMb: 1024,
      requiredMb: Math.round(minRequiredBytes / (1024 * 1024)),
    };
  }
}

/**
 * Asserts that sufficient disk space exists, throwing an Error if space is below threshold.
 */
export async function assertDiskSpace(
  targetDirOrFile: string,
  minRequiredBytes: number = 25 * 1024 * 1024
): Promise<void> {
  const result = await checkDiskSpace(targetDirOrFile, minRequiredBytes);
  if (!result.ok) {
    throw new Error(result.message || 'Operation aborted: Insufficient disk space.');
  }
}
