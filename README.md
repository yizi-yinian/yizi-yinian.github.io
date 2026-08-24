# 一字一念

面向手机的在线佛经抄写应用。目前收录简体《金刚般若波罗蜜经》第一品试用段落，书写字形与进度均在浏览器本地处理。

## 功能

- 首页选经，支持从上次位置继续
- Hanzi Writer 笔顺引导、淡墨字形、笔顺演示与重写
- 使用 `localStorage` 保存当前字、完成字数和累计用时
- 《金刚经》经文以 CBETA《大正新修大藏经》T08 No.235 为校对底本
- 所需汉字字形随网页发布，不依赖外部 CDN
- 手机优先，同时适配桌面

## 本地运行

需要 Node.js 22 或以上版本。

```bash
npm ci
npm run dev
```

## GitHub Pages

项目已包含 `.github/workflows/deploy-pages.yml`。推送到 GitHub 后：

1. 打开仓库的 **Settings → Pages**。
2. 在 **Build and deployment** 中选择 **GitHub Actions**。
3. 推送 `main` 分支，工作流会自动生成并发布静态网页。

本地检查 GitHub Pages 静态产物：

```bash
npm run build:github
```

输出位于 `out/`。应用不需要数据库、服务器或登录服务。

## 校验

```bash
npm test
```

字形数据来自 Hanzi Writer Data / Make Me a Hanzi，并遵循仓库内 `public/hanzi-data/ARPHICPL.TXT` 所附许可。
