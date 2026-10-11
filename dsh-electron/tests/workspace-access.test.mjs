import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { startNativeBridge } from '../src/native-vault.mjs'
import { repairWorkspaceAccess, workspaceAccessScript } from '../src/workspace-access.mjs'

const workspace = 'C:\\Projects\\synthetic'
const out = 'C:\\EduWork\\data\\logs\\workspace-access'
function fixture(responses, run = async () => {}) {
  const dialogs = [], runs = [], logs = []
  const options = { productName: 'EduWork', script: 'C:\\EduWork\\repair.ps1', out, log: line => logs.push(line),
    showMessageBox: async value => { dialogs.push(value); return { response: responses.shift() ?? 0 } },
    run: async (...value) => { runs.push(value); return run() } }
  return { dialogs, runs, logs, options }
}

test('a declined repair leaves the workspace untouched', async () => {
  const { dialogs, runs, options } = fixture([1])
  assert.deepEqual(await repairWorkspaceAccess(workspace, options), { repaired: false })
  assert.equal(dialogs.length, 1)
  assert.ok(dialogs[0].detail.includes(workspace) && dialogs[0].detail.includes(out))
  assert.equal(dialogs[0].cancelId, 1)
  assert.equal(runs.length, 0)
})

test('an accepted repair runs the DSH script bounded to the workspace root', async () => {
  const { dialogs, runs, options } = fixture([0])
  assert.deepEqual(await repairWorkspaceAccess(workspace, options), { repaired: true })
  assert.deepEqual(runs, [['C:\\EduWork\\repair.ps1', ['-Path', workspace, '-AllowRoot', workspace, '-Out', out]]])
  assert.equal(dialogs.length, 1)
})

test('a failed repair logs the script summary and tells the user where the recovery records are', async () => {
  const failure = Object.assign(new Error('Command failed'), { stdout: 'RECAP {}\r\nSUMMARY FIXED=0 GRANTED=0 REFUSED=1 RESTORED=0\r\n' })
  const { dialogs, logs, options } = fixture([0], async () => { throw failure })
  assert.deepEqual(await repairWorkspaceAccess(workspace, options), { repaired: false })
  assert.equal(dialogs[1].type, 'error')
  assert.ok(dialogs[1].detail.includes(out))
  assert.match(logs[0], /SUMMARY FIXED=0 GRANTED=0 REFUSED=1/)
})

test('only the authenticated Host can request a repair for one absolute path', async t => {
  const calls = []
  const bridge = await startNativeBridge({ vault: { flush: async () => {} }, workspaceAccess: async path => { calls.push(path); return { repaired: true } } })
  const unsupported = await startNativeBridge({ vault: { flush: async () => {} } })
  t.after(() => Promise.all([bridge.close(), unsupported.close()]))
  const absolute = process.platform === 'win32' ? workspace : '/synthetic/workspace'
  const request = (target, body, headers = {}) => fetch(target.bootstrap.nativeBridge.baseURL + '/v1/desktop/workspace-access', {
    method: 'POST', headers: { authorization: 'Bearer ' + target.bootstrap.nativeBridge.token, ...headers }, body: JSON.stringify(body),
  })
  assert.equal((await request(bridge, { path: absolute }, { authorization: 'Bearer invalid' })).status, 403)
  for (const body of [null, {}, { path: 'relative' }, { path: absolute, extra: true }]) assert.equal((await request(bridge, body)).status, 400)
  assert.equal(calls.length, 0)
  const accepted = await request(bridge, { path: absolute })
  assert.deepEqual(await accepted.json(), { repaired: true })
  assert.deepEqual(calls, [absolute])
  assert.equal((await request(unsupported, { path: absolute })).status, 501)
})

test('the pinned Runtime ships the DSH repair script', { skip: !process.env.EDUWORK_TEST_RUNTIME }, () => {
  assert.ok(existsSync(workspaceAccessScript(process.env.EDUWORK_TEST_RUNTIME)))
})
