import {chmod, stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const POWERSHELL = 'powershell.exe';
const WINDOWS_ACL_QUERY = '& { param($p) $a=[System.IO.File]::GetAccessControl($p); [pscustomobject]@{Owner=$a.GetOwner([System.Security.Principal.NTAccount]).Value; Current=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name; Rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.NTAccount]) | ForEach-Object { [pscustomobject]@{Identity=$_.IdentityReference.Value; Type=$_.AccessControlType.ToString(); Rights=$_.FileSystemRights.ToString(); Inherited=$_.IsInherited} }) } | ConvertTo-Json -Compress }';

function windowsAcl(file) {
  try {
    return JSON.parse(execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_ACL_QUERY, '--', file], {encoding: 'utf8', windowsHide: true}));
  } catch {
    throw new Error('CREDENTIAL_ACL_UNVERIFIABLE');
  }
}

function identity(value) {
  return String(value ?? '').toLowerCase();
}

function windowsAclSecure(acl) {
  const current = identity(acl.Current), owner = identity(acl.Owner);
  if (!current || owner !== current) return false;
  const rules = Array.isArray(acl.Rules) ? acl.Rules : [acl.Rules];
  const allowed = new Set([current, 'nt authority\\system', 's-1-5-18', 'builtin\\administrators', 's-1-5-32-544']);
  if (!rules.length || rules.some(rule => rule.Type !== 'Allow' || rule.Inherited || !allowed.has(identity(rule.Identity)))) return false;
  const own = rules.find(rule => identity(rule.Identity) === current);
  const system = rules.find(rule => ['nt authority\\system', 's-1-5-18'].includes(identity(rule.Identity)));
  const admins = rules.find(rule => ['builtin\\administrators', 's-1-5-32-544'].includes(identity(rule.Identity)));
  return Boolean(own?.Rights.includes('Read') && own?.Rights.includes('Write') && system?.Rights.includes('FullControl') && admins?.Rights.includes('FullControl'));
}

export async function secureCredentialFile(file) {
  if (process.platform !== 'win32') {
    await chmod(file, 0o600);
    return;
  }
  const who = execFileSync('whoami.exe', [], {encoding: 'utf8', windowsHide: true}).trim();
  const ownGrant = `${who}:(R,W,D)`;
  execFileSync('icacls.exe', [file, '/inheritance:r', '/grant:r', ownGrant, 'NT AUTHORITY\\SYSTEM:(F)', 'BUILTIN\\Administrators:(F)'], {stdio: 'ignore', windowsHide: true});
  if (!windowsAclSecure(windowsAcl(file))) throw new Error('CREDENTIAL_ACL_UNSAFE');
}

export async function assertSecureCredentialFile(file) {
  const fileStat = await stat(file);
  if (!fileStat.isFile()) throw new Error('CREDENTIAL_FILE_INVALID');
  if (process.platform !== 'win32') {
    if ((fileStat.mode & 0o077) !== 0 || typeof process.getuid === 'function' && fileStat.uid !== process.getuid()) throw new Error('CREDENTIAL_FILE_UNSAFE');
    return;
  }
  if (!windowsAclSecure(windowsAcl(file))) throw new Error('CREDENTIAL_FILE_UNSAFE');
}
