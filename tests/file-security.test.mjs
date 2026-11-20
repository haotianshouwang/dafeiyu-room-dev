import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertSecureCredentialFile, secureCredentialFile} from '../scripts/file-security.mjs';

test('credential files reject inherited or group-readable permissions before hardening', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dafeiyu-credential-security-'));
  const file = join(dir, 'credential.json');
  try {
    await writeFile(file, '{}');
    if (process.platform !== 'win32') await chmod(file, 0o644);
    await assert.rejects(() => assertSecureCredentialFile(file), /CREDENTIAL_FILE_UNSAFE|CREDENTIAL_ACL_UNVERIFIABLE/);
    await secureCredentialFile(file);
    await assertSecureCredentialFile(file);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
