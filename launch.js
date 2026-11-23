const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const targetDir = 'c:\\Users\\kathu\\OneDrive\\Desktop\\new invoice\\version 2.0\\win-unpacked';
const exePath = fs.existsSync(path.join(targetDir, 'Enterprise Management.exe'))
  ? path.join(targetDir, 'Enterprise Management.exe')
  : path.join(targetDir, 'Enterprise Invoice Manager.exe');

const child = spawn(
  exePath,
  [],
  {
    detached: true,
    stdio: 'ignore',
    env
  }
);
child.unref();
console.log('Launched Enterprise Management successfully with PID:', child.pid);
