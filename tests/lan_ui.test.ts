import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LAN Multi-User UI & Menu Layout Verification', () => {
  const modalPath = path.resolve(__dirname, '../src/renderer/components/ConfigurationModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  it('removes Access Permissions & Staff PCs from the settings sidebar menu', () => {
    // Should NOT have a sidebar button for Access_Permissions
    expect(modalContent).not.toContain("setActiveCategory('Access_Permissions')");
    expect(modalContent).not.toContain("Access Permissions & Staff PCs");
    expect(modalContent).toContain("Standalone / LAN Setup");
  });

  it('removes external PostgreSQL database fields and testing UI', () => {
    // User requested: "remove this database name and everything it should automatically detect when i enter the ip and everything"
    expect(modalContent).not.toContain('pg_database');
    expect(modalContent).not.toContain('pg_user');
    expect(modalContent).not.toContain('pg_password');
    expect(modalContent).not.toContain('pg_host');
    expect(modalContent).not.toContain('Advanced Database Engine (SQLite / External PostgreSQL)');
  });

  it('implements Option 1: Standalone Mode', () => {
    expect(modalContent).toContain('1. Standalone Mode');
    expect(modalContent).toContain('Standalone Mode is Active');
    expect(modalContent).toContain('Continue with Standalone Mode');
  });

  it('implements Option 2: LAN Multi-User Mode with Host and Staff sub-options', () => {
    expect(modalContent).toContain('2. LAN Multi-User Mode');
    expect(modalContent).toContain('Host (Main PC)');
    expect(modalContent).toContain('Staff (Staff PC)');
  });

  it('implements Host configuration with IP, Port, and Staff creation with menu permissions', () => {
    expect(modalContent).toContain('Main Office PC (Host) Network Info');
    expect(modalContent).toContain('Host Port:');
    expect(modalContent).toMatch(/Create Staff Member (&|&amp;) Assign Menu Permissions/);
    expect(modalContent).toContain('hostNewStaffName');
    expect(modalContent).toContain('Billing Staff (No Dashboard/Reports)');
    expect(modalContent).toMatch(/Accounts (&|&amp;) Inventory/);
    expect(modalContent).toContain('Configured Office Staff Members');
  });

  it('implements Staff configuration with IP, Port, and Staff Name input', () => {
    expect(modalContent).toContain('Connect to Main Office PC');
    expect(modalContent).toContain('Main Office PC IP Address *');
    expect(modalContent).toContain('Your Staff Member Name *');
    expect(modalContent).toContain('Test Connection');
    expect(modalContent).toMatch(/Save (&|&amp;) Connect to Main PC/);
  });

  it('enforces 4-digit PIN protection before saving or changing permissions', () => {
    expect(modalContent).toContain('MD / Admin PIN Protection (4 Digits)');
    expect(modalContent).toContain('pinPromptState');
    expect(modalContent).toContain('MD / Admin PIN Authorization');
    expect(modalContent).toContain('Enter the 4-digit MD / Admin PIN');
    expect(modalContent).toMatch(/Authorize (&|&amp;) Save/);
    expect(modalContent).toContain('handleInitiateCreateStaff');
    expect(modalContent).toContain('handleInitiateSaveWorkstation');
    expect(modalContent).toContain('handleInitiateDeleteWorkstation');
  });

  it('saves configuration and closes the settings modal on save', () => {
    expect(modalContent).toContain('handleSave');
    expect(modalContent).toContain('Save Configuration');
    expect(modalContent).toMatch(/handleSave\s*=\s*async\s*\(\)\s*=>[\s\S]*?onClose\(\)/);
  });
});
