import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { observeWorkspaceAccess, workspaceAccess } from '../lib/workspace-access.js'

test('registered and newly added workspaces the sandbox cannot provision get one repair offer at a time', async () => {
  const states = { 'C:\\denied': 'denied', 'C:\\Users\\synthetic\\granted': 'granted', 'C:\\second': 'denied', 'C:\\broken': 'denied', 'D:\\missing': 'unavailable' }
  const workspaces = [{ path: 'C:\\denied' }, { path: 'C:\\Users\\synthetic\\granted' }]
  const listeners = [], inspected = [], repairs = [], failures = []
  let release
  const settled = observeWorkspaceAccess({
    registry: { list: () => workspaces }, on: (event, listener) => listeners.push([event, listener]),
    inspect: async path => { inspected.push(path); return states[path] },
    repair: async path => {
      repairs.push(path)
      if (path === 'C:\\denied') await new Promise(resolve => { release = resolve })
      if (path === 'C:\\broken') throw new Error('synthetic bridge failure')
    },
    failed: error => failures.push(error.message),
  })
  assert.deepEqual(listeners.map(([event]) => event), ['domain/changed'])
  const changed = listeners[0][1]
  workspaces.push({ path: 'C:\\second' }, { path: 'C:\\broken' }, { path: 'D:\\missing' })
  changed({ domain: 'workspace', table: 'workspaces', operation: 'put', key: 'synthetic' })
  changed({ domain: 'session', table: '', operation: 'put' })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(repairs, ['C:\\denied'])
  assert.deepEqual(inspected, ['C:\\denied'])
  changed({ domain: 'workspace', table: '', operation: 'put' })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(repairs, ['C:\\denied'])
  release()
  await settled()
  assert.deepEqual(repairs, ['C:\\denied', 'C:\\second', 'C:\\broken'])
  assert.deepEqual(failures, ['synthetic bridge failure'])
  changed({ domain: 'workspace', table: '', operation: 'put' })
  await settled()
  assert.equal(inspected.length, 5)
})

const runtime = process.env.EDUWORK_TEST_RUNTIME
test('the Windows probe opens an accessible workspace and ignores a missing one', { skip: process.platform !== 'win32' || !runtime }, async t => {
  const hook = registerHooks({ resolve(name, context, next) { return next(name, name.startsWith('@deepseek-ai/') ? { ...context, parentURL: pathToFileURL(join(runtime, 'package.json')).href } : context) } })
  t.after(() => hook.deregister())
  const root = await mkdtemp(join(tmpdir(), 'workspace-access-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await workspaceAccess(root), 'granted')
  assert.equal(await workspaceAccess(join(root, 'missing')), 'unavailable')
})
