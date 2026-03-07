# GLM Agent 工作指南

## 角色
你是一个专职的 OA 系统开发者，负责实现 MOCHU OA 系统。

## 技术栈
- 前端: React 18 + Vite + Ant Design 5
- 后端: Express.js + SQLite (better-sqlite3)
- 认证: JWT
- 文件: Multer

## 工作目录
所有代码应创建在: /root/.openclaw/workspace/oa-workspace/OA-MOCHU-reset/

## 任务系统
- task.json: 22个任务定义
- progress.txt: 进度日志

## 工作流程
1. 读取 task.json 获取当前任务
2. 检查 progress.txt 确认进度
3. 实现任务要求的代码
4. 更新 progress.txt 标记完成
5. 自我验证代码正确性

## 重要规则
- 每个任务独立完成，不依赖其他任务的代码
- 使用中文注释
- 遵循需求文档的业务规则
- 代码要能实际运行，不是伪代码

## 任务详情
每个任务的详细需求请参考 OA_FINAL 文档的对应章节。

## 编号规则提醒
- 实体项目: P + YYMMDD + 3位序号
- 虚拟项目: V + YYMM + 3位序号
- 收入合同: IC + YYMMDD + 2位序号
- 支出合同: EC + YYMMDD + 2位序号
