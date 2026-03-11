# AGENT.md - MOCHU-OA Agent 工作指南

## 项目概述
- **项目名**: MOCHU-OA 办公自动化系统
- **仓库**: https://github.com/SheridanLu/MOCHU-OA-TESTV1
- **部署地址**: http://43.153.149.71:3001
- **当前版本**: V3 (commit: 6532b15)

## 技术栈
- **前端**: React 19 + Vite 7 + Ant Design 5
- **后端**: Express 4 + SQLite (better-sqlite3)
- **认证**: JWT
- **部署**: PM2

## 工作原则 (基于 Anthropic Long-Running Agents 方法论)

### 1. 增量进展原则
每次会话只专注 **一个功能** 的开发或测试：
- 不要一次性尝试多个功能
- 完成一个功能后再进入下一个
- 确保每次会话结束时代码处于可运行状态

### 2. 干净状态原则
每次会话结束时：
- 代码必须无严重 bug
- 新增代码要有注释
- 提交到 git，commit message 清晰
- 更新 `claude-progress.txt` 记录进展

### 3. 功能测试驱动
按照 `features.json` 中的测试清单逐个验证：
```json
{
  "id": "auth-001",
  "description": "功能描述",
  "steps": ["步骤1", "步骤2", ...],
  "passes": false  // 测试通过后改为 true
}
```

**重要**: 只修改 `passes` 字段，不要删除或修改测试用例！

## 工作流程

### 每次会话开始时
1. 读取 `claude-progress.txt` 了解上次进展
2. 读取 `features.json` 找到下一个未完成的功能
3. 按照测试步骤执行验证

### 每次会话结束时
1. 更新 `claude-progress.txt` 记录本次进展
2. 如果功能测试完成，更新 `features.json` 中对应功能的 `passes` 字段
3. 提交代码到 git

## 目录结构
```
MOCHU-OA-TESTV1/
├── backend/                # 后端代码
│   ├── server.js          # 入口文件
│   ├── routes/            # API 路由
│   ├── models/            # 数据模型
│   ├── middleware/        # 中间件
│   ├── services/          # 业务逻辑
│   ├── utils/             # 工具函数
│   └── database.db        # SQLite 数据库
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 调用
│   │   ├── utils/         # 工具函数
│   │   └── App.jsx        # 主应用
│   └── dist/              # 构建产物
├── claude-progress.txt     # 进度日志 (每次会话更新)
├── features.json           # 功能测试清单 (JSON格式)
├── AGENT.md                # 本文件
└── task.json               # 原始任务列表
```

## 常用命令

### 服务管理
```bash
pm2 list                 # 查看服务状态
pm2 restart oa-server    # 重启服务
pm2 logs oa-server       # 查看日志
```

### 开发调试
```bash
cd MOCHU-OA-TESTV1/backend && node server.js    # 直接启动后端
cd MOCHU-OA-TESTV1/frontend && npm run dev      # 开发模式启动前端
cd MOCHU-OA-TESTV1/frontend && npm run build    # 构建前端
```

### Git 操作
```bash
git status               # 查看修改
git add .                # 暂存所有修改
git commit -m "描述"     # 提交
git push                 # 推送
```

## 测试账号
| 用户名 | 密码 | 角色 | 状态 |
|--------|------|------|------|
| Yezhicheng | 123456 | - | active |
| zhentuo | 123456 | - | active |
| zhaole | 123456 | - | active |
| jianglina | 123456 | - | active |
| zhangxiang | 123456 | - | active |
| xiangjin | 123456 | - | active |
| majiansui | 123456 | - | active |

## API 基础地址
- 开发: http://localhost:3001/api
- 生产: http://43.153.149.71:3001/api

## 注意事项
1. **不要删除数据库文件** - database.db 包含所有数据
2. **修改后端代码需要重启 PM2** - `pm2 restart oa-server`
3. **修改前端代码需要重新构建** - `npm run build`
4. **每次会话只做一个功能** - 避免上下文混乱
