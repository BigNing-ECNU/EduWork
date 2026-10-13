export const name = 'eduwork-workspace-access'
export const inject = ['desktopBoundary', 'workspaceRegistry']

const WRITE_DAC = 0x40000, WRITE_OWNER = 0x80000, FILE_SHARE_ALL = 7, OPEN_EXISTING = 3, FILE_FLAG_BACKUP_SEMANTICS = 0x2000000, ERROR_ACCESS_DENIED = 5
let api

// DSH's Windows sandbox writes its workspace grant into the root's DACL and
// integrity label, which needs WRITE_DAC and WRITE_OWNER. A directory that only
// inherits Modify, such as a new folder directly under C:\, fails every
// confined command. Opening the root for both rights asks Windows the same
// question without changing anything.
export async function workspaceAccess(path) {
  const { extendWin32ProcessBindings, isNullPtr } = await import('@deepseek-ai/dsh-win32-process')
  api ??= extendWin32ProcessBindings(({ kernel32, bind }) => ({
    createFileW: bind(kernel32, 'CreateFileW', 'void *', ['str16', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'void *']),
  }))
  const handle = api.createFileW(path, WRITE_DAC | WRITE_OWNER, FILE_SHARE_ALL, null, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, null)
  if (isNullPtr(handle) || handle === -1n || handle === 0xffffffffffffffffn) return api.getLastError() === ERROR_ACCESS_DENIED ? 'denied' : 'unavailable'
  api.closeHandle(handle)
  return 'granted'
}

/** Offer the desktop repair once per run for each registered workspace the sandbox cannot provision. */
export function observeWorkspaceAccess({ registry, on, inspect, repair, failed }) {
  const seen = new Set()
  let queue = Promise.resolve()
  const scan = () => {
    for (const { path } of registry.list()) {
      if (seen.has(path)) continue
      seen.add(path)
      // One native dialog at a time; a declined or failed repair is not asked again in this run.
      queue = queue.then(async () => { if (await inspect(path) === 'denied') await repair(path) }).catch(failed)
    }
  }
  scan()
  on('domain/changed', change => { if (change.domain === 'workspace' && change.table === '' && change.operation === 'put') scan() })
  return () => queue
}

export function apply(ctx) {
  const lifetime = new AbortController()
  ctx.effect(() => () => lifetime.abort())
  observeWorkspaceAccess({
    registry: ctx.workspaceRegistry, on: (event, listener) => ctx.on(event, listener), inspect: workspaceAccess,
    repair: async path => {
      const { nativeBridge } = await ctx.desktopBoundary.ready
      const response = await fetch(nativeBridge.baseURL + '/v1/desktop/workspace-access', {
        method: 'POST', headers: { authorization: 'Bearer ' + nativeBridge.token, 'content-type': 'application/json' },
        body: JSON.stringify({ path }), signal: lifetime.signal,
      })
      if (!response.ok) throw new Error('Desktop workspace access repair is unavailable')
    },
    failed: error => { if (!lifetime.signal.aborted) console.warn(`[workspace-access] ${error.message}`) },
  })
}
