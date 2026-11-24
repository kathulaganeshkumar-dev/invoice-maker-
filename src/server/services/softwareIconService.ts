// src/server/services/softwareIconService.ts - Software Logo / Windows Desktop Application Icon Manager
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getDefaultDataDir } from '../database/connection';

const execFileAsync = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface ApplyDesktopIconResult {
  desktopUpdated: boolean;
  iconPath?: string;
  shortcutsUpdated: string[];
  message: string;
}

/**
 * Wraps a PNG buffer into a standard Windows .ico container (Vista/7/10/11 PNG-in-ICO format).
 */
export function buildIcoFromPngBuffer(pngBuffer: Buffer): Buffer {
  if (!pngBuffer || pngBuffer.length < 24 || !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG image data for software icon.');
  }

  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  const icoWidth = width >= 256 ? 0 : width;
  const icoHeight = height >= 256 ? 0 : height;

  const header = Buffer.alloc(22);
  // ICONDIR (6 bytes)
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(1, 4); // Image count: 1

  // ICONDIRENTRY (16 bytes)
  header.writeUInt8(icoWidth, 6);
  header.writeUInt8(icoHeight, 7);
  header.writeUInt8(0, 8); // Palette count
  header.writeUInt8(0, 9); // Reserved
  header.writeUInt16LE(1, 10); // Color planes
  header.writeUInt16LE(32, 12); // Bits per pixel
  header.writeUInt32LE(pngBuffer.length, 14); // Image byte length
  header.writeUInt32LE(22, 18); // Byte offset to PNG payload

  return Buffer.concat([header, pngBuffer]);
}

function decodePngDataUrl(dataUrl: string): Buffer {
  const trimmed = String(dataUrl || '').trim();
  const match = trimmed.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error('Software icon must be provided as a PNG image.');
  }
  const buf = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  if (buf.length < 24 || buf.length > 5 * 1024 * 1024) {
    throw new Error('Software icon image size is invalid (must be under 5 MB).');
  }
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Uploaded software icon is not a valid PNG binary.');
  }
  return buf;
}

function getAllLocalIconDirs(): string[] {
  const dirs = new Set<string>();
  const primary = path.join(getDefaultDataDir(), 'icons');
  dirs.add(path.resolve(primary));

  if (process.platform === 'win32' && process.env.APPDATA) {
    const appDataIcons = path.resolve(process.env.APPDATA, 'enterprise-invoice-manager', 'data', 'icons');
    dirs.add(appDataIcons);
  }
  return Array.from(dirs);
}

function findLocalExecutablePath(): string {
  const candidates: string[] = [];

  // 1. If running inside packaged Electron app
  if ((process.versions as any)?.electron && process.execPath && !/electron\.exe$/i.test(process.execPath)) {
    candidates.push(process.execPath);
  }

  // 2. Standard Program Files installation directories
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  candidates.push(path.join(pf, 'Enterprise Management', 'Enterprise Management.exe'));
  candidates.push(path.join(pf, 'Enterprise Invoice Manager', 'Enterprise Invoice Manager.exe'));
  candidates.push(path.join(pfx86, 'Enterprise Management', 'Enterprise Management.exe'));
  candidates.push(path.join(pfx86, 'Enterprise Invoice Manager', 'Enterprise Invoice Manager.exe'));

  // 3. Workspace packaged Version 2.0 desktop executables
  const cwd = process.cwd();
  candidates.push(path.join(cwd, 'version 2.0', 'win-unpacked', 'Enterprise Management.exe'));
  candidates.push(path.join(cwd, 'version 2.0', 'win-unpacked', 'Enterprise Invoice Manager.exe'));
  candidates.push(path.join(cwd, 'version 2.0', 'Enterprise Management 2.0.0.exe'));
  candidates.push(path.join(cwd, 'version 2.0', 'Enterprise Invoice Manager 2.0.0.exe'));

  // 4. Installed NSIS executable in LocalAppData
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Programs', 'enterprise-management', 'Enterprise Management.exe')
    );
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Programs', 'enterprise-invoice-manager', 'Enterprise Invoice Manager.exe')
    );
  }

  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    } catch {
      // ignore
    }
  }
  return '';
}

function syncIconFilesToDirectory(dir: string, pngBuffer: Buffer | null, icoBuffer: Buffer | null, icoFileName: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Remove previous timestamped .ico files so Windows icon cache doesn't keep stale icons
  try {
    for (const file of fs.readdirSync(dir)) {
      if (/^software_icon(?:_\d+)?\.ico$/i.test(file)) {
        try {
          fs.unlinkSync(path.join(dir, file));
        } catch {
          // ignore if locked by Explorer
        }
      }
    }
  } catch {
    // ignore
  }

  const pngPath = path.join(dir, 'software_icon.png');
  const icoPath = path.join(dir, icoFileName);

  if (pngBuffer && icoBuffer) {
    fs.writeFileSync(pngPath, pngBuffer);
    fs.writeFileSync(icoPath, icoBuffer);
    return icoPath;
  } else {
    try {
      if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath);
    } catch {
      // ignore
    }
    return '';
  }
}

async function updateWindowsShortcuts(icoPath: string, resetToDefault: boolean): Promise<string[]> {
  if (process.platform !== 'win32') return [];

  const defaultTarget = findLocalExecutablePath();

  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$icoPath = $env:EIM_ICO_PATH
$defaultTarget = $env:EIM_DEFAULT_TARGET
$reset = $env:EIM_RESET_ICON -eq '1'

$shell = New-Object -ComObject WScript.Shell

$userDesktop = Join-Path $env:USERPROFILE 'Desktop'
$oneDriveDesktop = Join-Path $env:USERPROFILE 'OneDrive\\Desktop'
$activeDesktop = [Environment]::GetFolderPath('Desktop')
$publicDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
if (-not $publicDesktop) { $publicDesktop = 'C:\\Users\\Public\\Desktop' }

$startMenu = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
$commonStartMenu = [Environment]::GetFolderPath('CommonStartMenu')
if (-not $commonStartMenu) { $commonStartMenu = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs' }

$searchDirs = @($activeDesktop, $userDesktop, $oneDriveDesktop, $publicDesktop, $startMenu, $commonStartMenu) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$updated = New-Object System.Collections.Generic.List[string]
$desktopShortcutFound = $false

# Primary desktop folder where shortcuts are visible to the user
$primaryDesktop = if (Test-Path $oneDriveDesktop) { $oneDriveDesktop } elseif (Test-Path $activeDesktop) { $activeDesktop } else { $userDesktop }

foreach ($dir in $searchDirs) {
  $lnks = Get-ChildItem -Path $dir -Include @('*Enterprise Management*.lnk', '*Enterprise Invoice Manager*.lnk') -Recurse -ErrorAction SilentlyContinue
  if (-not $lnks) {
    $lnks = Get-ChildItem -Path $dir -Filter '*Enterprise*.lnk' -ErrorAction SilentlyContinue
  }
  foreach ($lnk in $lnks) {
    try {
      $sc = $shell.CreateShortcut($lnk.FullName)
      if ($reset) {
        if ($sc.TargetPath) {
          $sc.IconLocation = "$($sc.TargetPath),0"
        }
      } elseif ($icoPath -and (Test-Path $icoPath)) {
        $sc.IconLocation = "$icoPath,0"
      }
      $sc.Save()
      $updated.Add($lnk.FullName)
      if ($lnk.DirectoryName -like '*Desktop*') {
        $desktopShortcutFound = $true
      }
    } catch {
      # If Public Desktop shortcut failed to save due to write permissions, delete it and create in user desktop
      if ($lnk.DirectoryName -eq $publicDesktop) {
        $targetExe = $sc.TargetPath
        if (-not $targetExe) { $targetExe = $defaultTarget }
        Remove-Item -Path $lnk.FullName -Force -ErrorAction SilentlyContinue
        if ($targetExe -and (Test-Path $targetExe) -and $primaryDesktop) {
          $newPath = Join-Path $primaryDesktop $lnk.Name
          try {
            $nsc = $shell.CreateShortcut($newPath)
            $nsc.TargetPath = $targetExe
            $nsc.WorkingDirectory = Split-Path -Parent $targetExe
            $nsc.Description = 'Enterprise Management Software'
            if ($reset) {
              $nsc.IconLocation = "$targetExe,0"
            } elseif ($icoPath -and (Test-Path $icoPath)) {
              $nsc.IconLocation = "$icoPath,0"
            }
            $nsc.Save()
            $updated.Add($newPath)
            $desktopShortcutFound = $true
          } catch {}
        }
      }
    }
  }
}

# Ensure desktop has shortcut pointing to the application with the custom icon
if (-not $desktopShortcutFound -and $primaryDesktop -and (Test-Path $primaryDesktop) -and $defaultTarget -and (Test-Path $defaultTarget)) {
  try {
    $newLnk = Join-Path $primaryDesktop 'Enterprise Management.lnk'
    $sc = $shell.CreateShortcut($newLnk)
    $sc.TargetPath = $defaultTarget
    $sc.WorkingDirectory = Split-Path -Parent $defaultTarget
    $sc.Description = 'Enterprise Management Software'
    if ($reset) {
      $sc.IconLocation = "$defaultTarget,0"
    } elseif ($icoPath -and (Test-Path $icoPath)) {
      $sc.IconLocation = "$icoPath,0"
    }
    $sc.Save()
    $updated.Add($newLnk)
  } catch {}
}

# Notify Windows Shell of association and icon change
try {
  if (-not ([System.Management.Automation.PSTypeName]'EimShellNotify').Type) {
    Add-Type -TypeDefinition @"
    using System;
    using System.Runtime.InteropServices;
    public class EimShellNotify {
      [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
      public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
    }
"@
  }
  [EimShellNotify]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {}

$updated | ConvertTo-Json -Compress
`;

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  return new Promise<string[]>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        env: {
          ...process.env,
          EIM_ICO_PATH: icoPath || '',
          EIM_DEFAULT_TARGET: defaultTarget || '',
          EIM_RESET_ICON: resetToDefault ? '1' : '0',
        },
        timeout: 15000,
      },
      (err, stdout) => {
        if (err) {
          console.warn('[SoftwareIcon] Windows shortcut refresh notice:', err.message);
        }
        const out = String(stdout || '').trim();
        if (!out) return resolve([]);
        try {
          const parsed = JSON.parse(out);
          if (Array.isArray(parsed)) return resolve(parsed.map(String));
          if (typeof parsed === 'string' && parsed) return resolve([parsed]);
        } catch {}
        resolve([]);
      }
    );
  });
}

export async function applySoftwareIconToDesktop(dataUrl: string | null): Promise<ApplyDesktopIconResult> {
  // Serverless / cloud web mode: DB stores icon for browser tab favicon + topbar logo
  if (process.env.VERCEL === '1') {
    return {
      desktopUpdated: false,
      shortcutsUpdated: [],
      message: dataUrl
        ? 'Software icon saved and applied to the web app and browser tab.'
        : 'Software icon reset to default.',
    };
  }

  const iconDirs = getAllLocalIconDirs();
  const icoFileName = `software_icon_${Date.now()}.ico`;

  if (!dataUrl || !dataUrl.trim()) {
    for (const dir of iconDirs) {
      try {
        syncIconFilesToDirectory(dir, null, null, icoFileName);
      } catch {
        // ignore secondary directory errors
      }
    }
    const shortcutsUpdated = await updateWindowsShortcuts('', true);
    return {
      desktopUpdated: shortcutsUpdated.length > 0,
      shortcutsUpdated,
      message:
        shortcutsUpdated.length > 0
          ? 'Software icon reset to default and Desktop shortcut updated.'
          : 'Software icon reset to default.',
    };
  }

  const pngBuffer = decodePngDataUrl(dataUrl);
  const icoBuffer = buildIcoFromPngBuffer(pngBuffer);

  let primaryIcoPath = '';
  for (const dir of iconDirs) {
    try {
      const written = syncIconFilesToDirectory(dir, pngBuffer, icoBuffer, icoFileName);
      if (!primaryIcoPath && written) {
        primaryIcoPath = written;
      }
    } catch (err) {
      console.warn(`[SoftwareIcon] Could not write icon in ${dir}:`, err);
    }
  }

  const shortcutsUpdated = primaryIcoPath ? await updateWindowsShortcuts(primaryIcoPath, false) : [];
  return {
    desktopUpdated: shortcutsUpdated.length > 0,
    iconPath: primaryIcoPath || undefined,
    shortcutsUpdated,
    message:
      shortcutsUpdated.length > 0
        ? `Software icon applied! Desktop application icon updated (${shortcutsUpdated.length} shortcut${shortcutsUpdated.length > 1 ? 's' : ''}).`
        : 'Software icon saved and applied to the application window & header.',
  };
}
