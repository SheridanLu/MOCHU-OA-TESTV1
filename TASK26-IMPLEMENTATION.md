# Task 26: 收入合同审批流程 - 实现说明

## 完成时间
2026-03-07

## 实现内容

### 1. 数据库扩展

#### contracts 表新增字段
- `current_approver` (TEXT): 当前审批人角色 (FINANCE/LEGAL/GM)
- `submitter_id` (INTEGER): 提交人ID

#### 新增 contract_approval_history 表
存储合同审批历史记录：
- contract_id: 合同ID
- step: 审批步骤
- role: 审批角色 (FINANCE/LEGAL/GM)
- status: 审批状态 (pending/approved/rejected)
- approver_id: 审批人ID
- approver_name: 审批人姓名
- comment: 审批意见
- approved_at: 审批时间

### 2. 后端 API 扩展

#### 新增接口

**POST /api/contracts/:id/submit** - 提交审批
- 功能：将草稿合同提交审批
- 状态变更：draft → pending
- 当前审批人：FINANCE
- 创建审批流程记录（3个步骤：财务、法务、总经理）

**POST /api/contracts/:id/approve** - 审批通过
- 功能：审批人通过合同
- 权限验证：检查用户是否有对应角色
- 状态流转：
  - FINANCE 通过 → current_approver: LEGAL
  - LEGAL 通过 → current_approver: GM
  - GM 通过 → status: approved, 流程完成

**POST /api/contracts/:id/reject** - 审批拒绝
- 功能：审批人拒绝合同
- 必填字段：comment（拒绝原因）
- 状态变更：pending → rejected
- 流程终止

**GET /api/contracts/:id/history** - 获取审批历史
- 功能：获取合同的完整审批历史
- 返回：所有审批步骤及详细信息

### 3. 前端实现

#### ContractList.jsx - 合同列表页面
新增功能：
- 合同列表展示（包含状态、当前审批人）
- 合同详情模态框
- 审批进度可视化（Steps 组件）
- 审批历史时间轴（Timeline 组件）
- 审批操作按钮（根据权限显示）
- 提交审批功能

#### 权限控制
- 只有对应角色的用户才能看到审批按钮
- 角色权限映射：
  - FINANCE 角色 → 可审批财务节点
  - LEGAL 角色 → 可审批法务节点
  - GM 角色 → 可审批所有节点

### 4. 审批流程

```
采购员创建合同（draft）
    ↓
提交审批（pending, current_approver: FINANCE）
    ↓
财务审批通过（current_approver: LEGAL）
    ↓
法务审批通过（current_approver: GM）
    ↓
总经理审批通过（status: approved）
    完成
```

任何节点拒绝 → status: rejected, 流程终止

### 5. 状态说明

- **draft**: 草稿状态，可编辑可删除
- **pending**: 审批中，等待当前审批人处理
- **finance_approved**: 财务已审（未使用，通过 current_approver 判断）
- **legal_approved**: 法务已审（未使用，通过 current_approver 判断）
- **approved**: 审批通过
- **rejected**: 审批拒绝

### 6. 测试验证

已通过自动化测试（test-contract-approval.js）：
- ✓ 数据库表结构正确
- ✓ 审批流程完整执行
- ✓ 状态流转正确
- ✓ 审批历史记录完整

### 7. 技术要点

1. **事务处理**：审批操作使用事务确保数据一致性
2. **权限验证**：中间件自动附加用户角色信息
3. **前端权限**：根据用户角色动态显示操作按钮
4. **状态管理**：通过 current_approver 字段控制流程进度

## 文件变更

### 后端
- `backend/models/database.js`: 添加审批相关字段和表
- `backend/routes/contract.js`: 添加审批相关 API
- `backend/middleware/permission.js`: 导出 attachPermissions
- `backend/middleware/auth.js`: 兼容 id/userId 字段

### 前端
- `frontend/src/pages/contract/ContractList.jsx`: 新增合同列表页面
- `frontend/src/App.jsx`: 添加合同列表路由

### 测试
- `test-contract-approval.js`: 自动化测试脚本

## 下一步

- Task 27: 支出合同编号规则
- Task 28: 支出合同超量校验
- Task 29: 支出合同超量审批流程
