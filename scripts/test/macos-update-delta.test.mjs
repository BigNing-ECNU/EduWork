import test from 'node:test'
import assert from 'node:assert/strict'
import { deltaName, previousStableArchives } from '../macos-update-delta.mjs'

const release=(version,{draft=false,prerelease=false,tag=`v${version}`,digest=true}={})=>({tag_name:tag,draft,prerelease,assets:[
  {name:`EduWork-${version}-windows-x64-electron.zip`,browser_download_url:'https://example.org/windows.zip',digest:`sha256:${'f'.repeat(64)}`},
  {name:`EduWork-${version}-macos-arm64-electron.zip`,browser_download_url:`https://github.com/ECNU/EduWork/releases/download/${tag}/EduWork-${version}-macos-arm64-electron.zip`,digest:digest?`sha256:${version.replace(/\D/g,'').padStart(64,'0')}`:null},
]})
test('patches come from the three latest earlier stable releases',()=>{
  const releases=[release('0.4.12'),release('0.4.11',{draft:true}),release('0.4.10'),release('0.4.10-alpha.1',{prerelease:true}),release('0.4.2'),release('0.4.9'),release('0.4.1'),release('0.3.6-dev.20260921.2',{prerelease:true,tag:'macos-v0.3.6-dev.20260921.2'})]
  const archives=previousStableArchives(releases,{product:'EduWork',version:'0.4.11'})
  assert.deepEqual(archives.map(archive=>archive.name),['EduWork-0.4.10-macos-arm64-electron.zip','EduWork-0.4.9-macos-arm64-electron.zip','EduWork-0.4.2-macos-arm64-electron.zip'])
  assert.deepEqual(archives[0],{name:'EduWork-0.4.10-macos-arm64-electron.zip',url:'https://github.com/ECNU/EduWork/releases/download/v0.4.10/EduWork-0.4.10-macos-arm64-electron.zip',sha256:'0410'.padStart(64,'0')})
  assert.deepEqual(previousStableArchives(releases,{product:'EduWork',version:'0.4.12-dev.20261020.1'}),[])
  assert.deepEqual(previousStableArchives(releases,{product:'EduWork',version:'0.4.1'}),[])
  assert.throws(()=>previousStableArchives([release('0.4.3',{digest:false})],{product:'EduWork',version:'0.4.4'}),/0\.4\.3 has no macOS archive/)
})
test('delta file names identify the release and the version they patch',()=>{
  assert.equal(deltaName('EduWork','0.4.4','0.4.3'),'EduWork-0.4.4-macos-arm64-electron-from-0.4.3.delta')
  assert.throws(()=>deltaName('EduWork','0.4.4','../0.4.3'))
})
