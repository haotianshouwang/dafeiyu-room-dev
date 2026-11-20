import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';

function probe(command, args) {
  let executable = command;
  if (process.platform === 'win32') {
    const candidates = String(process.env.Path ?? '').split(';').map(dir => path.join(dir, command)).filter(value => existsSync(value) && !/\\WindowsApps\\/i.test(value));
    executable = candidates[0];
    if (!executable) return null;
  }
  const result = spawnSync(executable, [...args, '--version'], {stdio: 'ignore', windowsHide: true});
  return result.error ? null : result.status === 0 ? {command: executable, args} : null;
}

export function findPythonCommand() {
  const candidates = process.platform === 'win32'
    ? [['python.exe', []], ['py.exe', ['-3']]]
    : [['python3', []], ['python', []]];
  for (const [command, args] of candidates) {
    const found = probe(command, args);
    if (found) return found;
  }
  throw new Error('PYTHON_UNAVAILABLE: install Python 3 or make python.exe/python3 available on PATH.');
}
