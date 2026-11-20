const { spawn } = require('child_process');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(
  'c:\\Users\\kathu\\OneDrive\\Desktop\\new invoice\\version 2.0\\win-unpacked\\Enterprise Invoice Manager.exe',
  [],
  {
    detached: true,
    stdio: 'ignore',
    env
  }
);
child.unref();
console.log('Launched Enterprise Invoice Manager successfully with PID:', child.pid);
