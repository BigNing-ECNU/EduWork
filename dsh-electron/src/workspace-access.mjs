import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// DSH ships this repair with its Windows sandbox. For one workspace root it
// gives the signed-in user full control where a right the sandbox needs is
// missing and removes other apps' sandbox entries. It never elevates, backs up
// and verifies every change, and rolls back a failed attempt.
export function workspaceAccessScript(runtime) {
  const acl = dirname(createRequire(join(runtime, 'package.json')).resolve('@deepseek-ai/dsh-sandbox-windows-acl/package.json'))
  return join(acl, 'assets/diagnose-windows-sandbox-acl/scripts/diagnose-windows-sandbox-acl.ps1')
}

const runPowerShell = (script, args) => new Promise((resolve, reject) => execFile(
  join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
  // Granting on the root propagates through the existing tree; allow large workspaces.
  { windowsHide: true, timeout: 600_000, encoding: 'utf8' },
  (error, stdout) => error ? reject(Object.assign(error, { stdout })) : resolve(stdout)))

export async function repairWorkspaceAccess(path, { productName, script, out, showMessageBox, log, run = runPowerShell }) {
  const { response } = await showMessageBox({
    type: 'warning', title: productName, buttons: ['调整权限', '暂不调整'], defaultId: 0, cancelId: 1,
    message: '需要调整工作区文件夹的 Windows 权限',
    detail: `${productName} 在沙箱中运行命令前需要为工作区设置文件权限，但当前 Windows 账户不能修改这个文件夹的权限设置：\n\n${path}\n\n`
      + '不调整的话，沙箱中的命令都会失败。调整会为当前账户在此文件夹上添加“完全控制”权限，并移除其他应用沙箱留在其中的权限项；'
      + `不改动文件内容和所有者，也不需要管理员权限。每项改动都会备份，恢复记录保存在：\n${out}`,
  })
  if (response !== 0) return { repaired: false }
  try {
    await run(script, ['-Path', path, '-AllowRoot', path, '-Out', out])
    log(`[desktop:workspace-access] repaired ${path}\n`)
    return { repaired: true }
  } catch (error) {
    log(`[desktop:workspace-access] ${path}: ${error.stdout?.trim().split(/\r?\n/).at(-1) || error.message}\n`)
    await showMessageBox({ type: 'error', title: productName, message: '未能调整工作区文件夹的权限',
      detail: `${path}\n\n处理记录和恢复命令保存在：\n${out}\n\n也可以改用用户文件夹（如“文档”）中的文件夹作为工作区。` })
    return { repaired: false }
  }
}
