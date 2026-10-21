# 参与开发

欢迎提交问题、改进建议和 Pull Request。请在 issue 中说明系统版本、应用版本、重现步骤和预期结果。截图请先遮盖私人链接或备注。

## 开发环境

- Node.js 24 LTS
- pnpm 11.25.0
- 构建 Windows EXE 使用 Windows 10/11 x64

```powershell
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm test
pnpm check
pnpm start
```

不需要数据库、服务器账户或任何密钥。界面源文件在 `dist/`，桌面外壳在 `desktop/`。

验证桌面数据保存：

```powershell
node scripts/smoke-runner.mjs
```

测试仅写入 `.qa/` 下新建的隔离目录，不使用日常数据目录。涉及数据格式的改动应补充迁移测试，验证旧备份能够恢复；涉及打包或桌面协议的改动应运行实际桌面测试。

## 构建

```powershell
pnpm build:win --config.electronDist=node_modules/electron/dist
node scripts/smoke-runner.mjs release/win-unpacked/SkillVault.exe
pnpm package:source
pnpm checksum
```

请勿提交 `.qa/`、`.cache/`、`node_modules/`、`release/`、个人备份、应用用户数据或签名私钥。源码包使用允许列表，仅包含公开项目文件。

## 发布

修改 `package.json` 版本并更新 CHANGELOG，通过检查后创建对应版本标签，例如 `v1.2.0`。Windows release 工作流会生成并验证程序，将 EXE、源码包和 SHA256 校验和放入 GitHub Release。手动运行该工作流也会生成可下载的 Actions artifact；没有版本标签时不会创建 Release。

当前构建未配置商业代码签名；如需代码签名，请使用自己的证书与 GitHub Secrets，并调整构建流程，勿将证书提交到源码仓库。
