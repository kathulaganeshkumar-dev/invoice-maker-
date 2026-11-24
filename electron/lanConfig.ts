// electron/lanConfig.ts - Local Machine Direct Desktop-to-Desktop LAN Configuration Manager
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';

export type LanDesktopRole = 'STANDALONE' | 'LAN_HOST' | 'LAN_CLIENT';

export interface LanDesktopConfig {
  role: LanDesktopRole;
  hostIp: string;
  port: number;
  deviceId: string;
  deviceName: string;
  staffName?: string;
  minimizeToTray: boolean;
  autoStartOnBoot: boolean;
}

function generateDeviceId(): string {
  try {
    return `pc-${crypto.randomUUID()}`;
  } catch {
    return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getDefaultDeviceName(): string {
  try {
    const h = os.hostname();
    if (h && h.trim()) return h.trim().slice(0, 64);
  } catch {
    // ignore
  }
  return 'Office PC';
}

const createDefaultLanConfig = (): LanDesktopConfig => ({
  role: 'STANDALONE',
  hostIp: '',
  port: 4200,
  deviceId: generateDeviceId(),
  deviceName: getDefaultDeviceName(),
  staffName: '',
  minimizeToTray: true,
  autoStartOnBoot: false,
});

export function validateLanHostInput(rawHost: string): string {
  const host = String(rawHost || '').trim();
  if (!host) return '';
  if (host.length > 253 || /[\s/\\@:?#]/.test(host)) {
    throw new Error('Invalid Main PC IP address or hostname.');
  }
  const lower = host.toLowerCase();
  if (lower.startsWith('169.254.') || lower === '0.0.0.0' || lower === '::' || lower === 'metadata.google.internal') {
    throw new Error('This IP address is not permitted as an office LAN host.');
  }
  return host;
}

export function validateLanPortInput(rawPort: number | string | undefined): number {
  const port = rawPort !== undefined && rawPort !== null && String(rawPort).trim() !== '' ? Number(rawPort) : 4200;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Port must be a number between 1024 and 65535 (default: 4200).');
  }
  return port;
}

export function normalizeLanConfig(
  input: Partial<LanDesktopConfig> | null | undefined,
  existing?: Partial<LanDesktopConfig>
): LanDesktopConfig {
  const rawRole = String(input?.role || existing?.role || 'STANDALONE').toUpperCase();
  const role: LanDesktopRole =
    rawRole === 'LAN_HOST' || rawRole === 'LAN_CLIENT' ? rawRole : 'STANDALONE';
  const port = validateLanPortInput(input?.port !== undefined ? input.port : existing?.port);
  const hostIp = validateLanHostInput(input?.hostIp !== undefined ? input.hostIp : existing?.hostIp || '');

  if (role === 'LAN_CLIENT' && !hostIp) {
    throw new Error('Please enter the Main Office PC IP address (for example: 192.168.1.100).');
  }

  const rawId = String(input?.deviceId || existing?.deviceId || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);
  const deviceId = rawId || generateDeviceId();

  const rawName = String(input?.deviceName !== undefined ? input.deviceName : existing?.deviceName || '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, 64);
  const deviceName = rawName || getDefaultDeviceName();

  const rawStaffName = String(input?.staffName !== undefined ? input.staffName : existing?.staffName || '')
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, 64);
  const staffName = rawStaffName || '';

  const minimizeToTray =
    input?.minimizeToTray !== undefined
      ? Boolean(input.minimizeToTray)
      : existing?.minimizeToTray !== undefined
      ? Boolean(existing.minimizeToTray)
      : true;

  const autoStartOnBoot =
    input?.autoStartOnBoot !== undefined
      ? Boolean(input.autoStartOnBoot)
      : existing?.autoStartOnBoot !== undefined
      ? Boolean(existing.autoStartOnBoot)
      : false;

  return { role, hostIp, port, deviceId, deviceName, staffName, minimizeToTray, autoStartOnBoot };
}

export function getLanConfigFilePath(dataDir: string): string {
  return path.join(dataDir, 'lan-config.json');
}

export function loadLanConfig(dataDir: string): LanDesktopConfig {
  try {
    const filePath = getLanConfigFilePath(dataDir);
    if (!fs.existsSync(filePath)) {
      const fresh = createDefaultLanConfig();
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), 'utf8');
      } catch {
        // non-fatal if directory is read-only
      }
      return fresh;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeLanConfig(parsed);
    if (!parsed?.deviceId || !parsed?.deviceName) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
      } catch {
        // ignore
      }
    }
    return normalized;
  } catch (err) {
    console.warn('[LAN] Failed to load lan-config.json, defaulting to STANDALONE:', err);
    return createDefaultLanConfig();
  }
}

export function saveLanConfig(dataDir: string, input: Partial<LanDesktopConfig>): LanDesktopConfig {
  const existing = fs.existsSync(getLanConfigFilePath(dataDir))
    ? (() => {
        try {
          return JSON.parse(fs.readFileSync(getLanConfigFilePath(dataDir), 'utf8'));
        } catch {
          return undefined;
        }
      })()
    : undefined;
  const normalized = normalizeLanConfig(input, existing);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = getLanConfigFilePath(dataDir);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

export function getLocalLanIps(): string[] {
  const lanIps: string[] = [];
  const vpnIps: string[] = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const [ifaceName, entries] of Object.entries(interfaces)) {
      if (!entries) continue;
      const isVpnAdapter = /tailscale|vpn|wireguard|zerotier|wintun/i.test(ifaceName);
      for (const info of entries) {
        if (info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254.')) {
          if (isVpnAdapter || info.address.startsWith('100.')) {
            vpnIps.push(info.address);
          } else {
            lanIps.push(info.address);
          }
        }
      }
    }
  } catch {
    // ignore OS network interface errors
  }
  return Array.from(new Set([...lanIps, ...vpnIps]));
}

export function testLanHostConnection(
  rawHost: string,
  rawPort: number | string = 4200,
  timeoutMs = 3500
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  return new Promise((resolve) => {
    let host: string;
    let port: number;
    try {
      host = validateLanHostInput(rawHost);
      if (!host) {
        return resolve({ success: false, message: 'Please enter the Main Office PC IP address.' });
      }
      port = validateLanPortInput(rawPort);
    } catch (err: any) {
      return resolve({ success: false, message: err.message || 'Invalid host or port.' });
    }

    const started = Date.now();
    const req = http.get(
      {
        hostname: host,
        port,
        path: '/health',
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          if (body.length < 4096) body += chunk.toString('utf8');
        });
        res.on('end', () => {
          const latencyMs = Date.now() - started;
          if (res.statusCode === 200 && body.includes('"status":"ok"')) {
            resolve({
              success: true,
              latencyMs,
              message: `Connected to Main Office PC at ${host}:${port} (${latencyMs} ms)!`,
            });
          } else {
            resolve({
              success: false,
              message: `Reached ${host}:${port}, but Enterprise Management host service did not respond as expected (HTTP ${res.statusCode}).`,
            });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        message: `Connection timed out to ${host}:${port}. Make sure the Main Office PC is running in "Main Office PC (Host)" mode and port ${port} is allowed in Windows Firewall.`,
      });
    });

    req.on('error', () => {
      resolve({
        success: false,
        message: `Cannot reach ${host}:${port}. Verify both PCs are on the same office network, the Main PC app is open in Host mode, and Windows Firewall allows port ${port}.`,
      });
    });
  });
}
