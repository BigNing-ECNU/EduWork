// Sparkle delta updates for stable macOS releases. The release workflow
// downloads the archives of earlier stable releases; the publish stage patches
// each one to the accepted application and proves that the patch rebuilds it.
import { createWriteStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { compareVersions } from '../dsh-host/content-update-protocol.mjs'
import { desktopVersion } from './desktop-build-plan.mjs'
import { capture, ensureDir, isMainModule, readJSON, run, sha256File } from './lib/build-util.mjs'

export function deltaName(product, version, from) {
  desktopVersion(from)
  return `${product}-${version}-macos-arm64-electron-from-${from}.delta`
}

// Patches come from the three latest earlier stable releases; older
// installations download the full archive.
export function previousStableArchives(releases, { product, version }) {
  if (desktopVersion(version).prerelease) return []
  return releases
    .filter(release => !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name))
    .map(release => ({ from: release.tag_name.slice(1), assets: release.assets }))
    .filter(({ from }) => compareVersions(from, version) < 0)
    .sort((a, b) => compareVersions(b.from, a.from))
    .slice(0, 3)
    .map(({ from, assets }) => {
      const name = `${product}-${from}-macos-arm64-electron.zip`
      const asset = assets.find(asset => asset.name === name)
      if (!/^sha256:[a-f0-9]{64}$/.test(asset?.digest ?? '')) throw new Error(`Release ${from} has no macOS archive with a digest`)
      return { name, url: asset.browser_download_url, sha256: asset.digest.slice('sha256:'.length) }
    })
}

export async function createMacDeltas({ binaryDelta, app, archiveBytes, bases, product, version, output, work }) {
  const deltas = []
  for (const base of bases) {
    await rm(work, { recursive: true, force: true })
    await ensureDir(work)
    await run('ditto', ['-x', '-k', base, work])
    const before = join(work, basename(app)), rebuilt = join(work, 'rebuilt.app')
    const { version: from } = await readJSON(join(before, 'Contents/Resources/release.json'))
    const patch = join(output, deltaName(product, version, from))
    await run(binaryDelta, ['create', before, app, patch])
    const { size } = await stat(patch)
    if (size > archiveBytes / 2) {
      console.log(`Skipping the delta from ${from}: it is larger than half of the full archive`)
      await rm(patch)
      continue
    }
    // BinaryDelta checks the rebuilt tree against the hash it recorded, which
    // covers contents and permissions. diff compares the rebuilt tree with the
    // accepted application independently of the tool that wrote the patch.
    await run(binaryDelta, ['apply', before, rebuilt, patch])
    await capture('diff', ['-rq', '--no-dereference', app, rebuilt])
    deltas.push({ from, name: basename(patch), bytes: size, sha256: await sha256File(patch) })
  }
  await rm(work, { recursive: true, force: true })
  return deltas
}

if (isMainModule(import.meta.url)) {
  const [repository, product, version, output] = process.argv.slice(2)
  if (!output) throw new Error('Use macos-update-delta.mjs <owner/repository> <product> <version> <output directory>')
  const response = await fetch(`https://api.github.com/repos/${repository}/releases?per_page=100`, {
    headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }) },
  })
  if (!response.ok) throw new Error(`GitHub releases: HTTP ${response.status}`)
  await ensureDir(output)
  for (const archive of previousStableArchives(await response.json(), { product, version })) {
    const file = join(output, archive.name), download = await fetch(archive.url)
    if (!download.ok) throw new Error(`Download failed (${download.status}): ${archive.url}`)
    await pipeline(Readable.fromWeb(download.body), createWriteStream(file))
    if (await sha256File(file) !== archive.sha256) throw new Error(`Digest mismatch: ${archive.name}`)
    console.log(`Downloaded ${archive.name}`)
  }
}
