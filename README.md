# 记账本

手机上用的记账 App：说话就能记账，不用手输。还带月度总额管账、加班记录等实用工具。

## 功能

- **语音记账**：点麦克风说一句话（如"午饭花了三十五"），自动解析金额、收支类型、分类和备注，确认后保存
- **手动记账 / 账目列表**：支持补录、删除，查看本月收支汇总
- **月度总额管理**：每月输入总额，直观看到已花多少、还剩多少，以及"钱花去哪了"分类图表
- **加班记录**（教师实用工具）：记录日期、时长、时薪、倍率与事项，自动汇总工时和预计金额
- **视觉**：山水丝带全屏背景 + 液态玻璃质感组件，深色模式适配，手机/桌面自适应

## 技术栈

- 前端：React 19 + TypeScript + Tailwind CSS 4 + Recharts（自定义构建脚本 `client/build.mjs`）
- 后端：Bun + Drizzle ORM + SQLite
- 包管理：bun

## 目录结构

```
client/          前端（src/App.tsx 为主界面，src/assets 为背景图等资源）
server/src/      服务端 actions 与数据 schema
drizzle/         数据库迁移 SQL
```

## 常用命令

```bash
bun install          # 安装依赖
bun run typecheck    # 类型检查
bun run build        # 构建前后端
```

## 说明

- `@hatch/space-sdk` 为 Muse 运行环境内置依赖（`file:` 本地引用），在外部环境 `bun install` 会跳过/失败，不影响阅读源码
- 线上版本运行在 Muse 环境中，账目数据保存在服务端；本仓库为项目代码快照
