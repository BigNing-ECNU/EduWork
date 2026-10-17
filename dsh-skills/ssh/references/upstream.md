# 官方 SSH 后端：实验配置参考

日常维护 Linux 服务器可使用系统 `ssh`，见上级技能。DSH 0.2.1 另提供远程文件、进程和沙箱后端；它不是默认启用的 EduWork 桌面功能，也不等于远程桌面。

仅 Linux/macOS 客户端和远端受支持。连接依赖预先配置好的 OpenSSH 主机别名、密钥与 known_hosts，远端必须部署匹配的 helper 并提供实际 SHA-256。官方版本是否提供预构建 helper 应查当次发布，不能假定一定有下载附件。

以下只展示官方服务组合，不是可直接覆盖桌面配置的完整文件：

```yaml
- id: ssh
  name: '@deepseek-ai/dsh-ssh'
  config:
    host: my-server
    workspace: /srv/example
    helper: /opt/dsh-helper/lib/helper.js
    helperHash: '<actual helper SHA-256>'
    launch:
      kind: node-script
      node: /opt/node/bin/node
- id: fs
  name: '@deepseek-ai/dsh-fs-ssh'
- id: subprocess
  name: '@deepseek-ai/dsh-subprocess-ssh'
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-ssh'
```

实验时使用独立的官方 headless/custom profile、独立配置和测试数据。不要把这些服务叠加到当前 EduWork 桌面：需替换原服务，并核对所有路径消费者。最小范围为文件读写和远端命令；不要混入 Studio、Office、本地浏览器或依赖本机二进制路径的文件搜索。PTC 还需官方 SSH launch/bootstrap，不能直接沿用本机 Node 路径。

该后端不自动重连或重放操作。上线前应真实验证远端读写、取消、掉线不重复执行及 helper/主机验证失败；配置示例本身不代表完成这些验收。EduWork Electron 不透传官方 headless CLI 参数。

参考：[官方 SSH 文档](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.2/packages/ssh/ssh)、[官方 helper 验证组合](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/scripts/verify-ssh-helper-artifact.ts)。
