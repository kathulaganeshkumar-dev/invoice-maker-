const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = 'c:\\Users\\kathu\\OneDrive\\Desktop\\new invoice\\version 2.0\\win-unpacked';
const exePath = fs.existsSync(path.join(targetDir, 'Enterprise Management.exe'))
  ? path.join(targetDir, 'Enterprise Management.exe')
  : path.join(targetDir, 'Enterprise Invoice Manager.exe');

const desktopPath = 'C:\\Users\\kathu\\OneDrive\\Desktop';
const shortcutPath = path.join(desktopPath, 'Enterprise Management.lnk');

// 1. Create Windows Shortcut on Desktop via VBScript
const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
oLink.WorkingDirectory = "${path.dirname(exePath).replace(/\\/g, '\\\\')}"
oLink.Description = "Enterprise Management Software"
oLink.Save
`;

const vbsFile = path.join(__dirname, 'create_shortcut.vbs');
fs.writeFileSync(vbsFile, vbsScript);
try {
  execSync(`cscript //nologo "${vbsFile}"`);
  console.log('Desktop shortcut successfully created at:', shortcutPath);
} catch (err) {
  console.error('Failed to create shortcut via VBScript:', err.message);
} finally {
  try { fs.unlinkSync(vbsFile); } catch {}
}

// 2. Create batch file in Desktop & workspace root for 1-click launch
const batContent = `@echo off
set ELECTRON_RUN_AS_NODE=
start "" "${exePath}"
`;
fs.writeFileSync(path.join(desktopPath, 'Start Enterprise Management.bat'), batContent);
fs.writeFileSync('c:\\Users\\kathu\\OneDrive\\Desktop\\new invoice\\Start Enterprise Management.bat', batContent);
console.log('Created batch launcher on Desktop and in workspace root');

// 3. Launch via explorer.exe so it launches in the user's interactive desktop session
try {
  // Clear any existing ELECTRON_RUN_AS_NODE
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  
  // Use explorer.exe to launch the executable directly in user GUI space
  execSync(`start "" "${exePath}"`, { shell: 'cmd.exe', env });
  console.log('Started application via cmd start with clean environment');
} catch (err) {
  console.log('Starting via spawn...');
  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(exePath),
    env: (() => {
      const e = { ...process.env };
      delete e.ELECTRON_RUN_AS_NODE;
      return e;
    })()
  });
  child.unref();
  console.log('Spawned with PID:', child.pid);
}
