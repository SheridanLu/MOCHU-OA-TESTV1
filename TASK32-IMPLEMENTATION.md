# Task 32: 零星采购管理实现文档

## 创建时间: 2026-03-07

## 功能概述
实现零星采购预警：超批量采购总额1.5%预警

## 编号规则
- 零星采购编号: LX + YYMM + 3位序号
- 序号每月重置
- 例: 2025年3月第1批: LX250301

## 数据库扩展

### 新建表
1. **zero_purchases** - 零星采购主表
   - purchase_no: 采购编号（唯一）
   - name: 采购名称
   - supplier_id: 供应商ID
   - total_amount: 总金额
   - status: 状态 (draft/pending/approved/rejected/completed/cancelled)
   - warning_level: 预警级别 (none/warning/danger/excessive)
   - price_warning_count: 价格预警数量
   - is_excessive: 是否超1.5%限额
   - is_legal_review: 是否需要法务审核
   - remarks: 备注
   - creator_id: 创建人ID

2. **zero_purchase_items** - 采购清单明细表
   - purchase_id: 采购ID
   - material_name: 物资名称
   - specification: 规格型号
   - unit: 单位
   - quantity: 数量
   - unit_price: 单价
   - base_price: 基准价
   - total_price: 总价
   - has_warning: 是否有价格预警
   - warning_level: 预警级别

3. **zero_purchase_approvals** - 审批记录表
   - purchase_id: 采购ID
   - step: 审批步骤
   - step_name: 步骤名称
   - role: 审批角色
   - approver_id: 审批人ID
   - action: 动作 (pending/approve/reject)
   - comment: 审批意见

4. **zero_purchase_monthly_stats** - 月度统计表
   - year_month: 年月
   - batch_total_amount: 批量采购总额
   - zero_purchase_total: 零星采购总额
   - limit_amount: 1.5%限额
   - used_percentage: 已使用百分比
   - is_excessive: 是否超限

## 后端 API

### 文件位置
- `backend/routes/zeroPurchase.js`

### API 端点
- `GET /api/zero-purchases` - 获取零星采购列表（含月度统计）
- `GET /api/zero-purchases/:id` - 获取零星采购详情
- `GET /api/zero-purchases/:id/items` - 获取采购清单明细
- `POST /api/zero-purchases` - 创建零星采购
- `PUT /api/zero-purchases/:id` - 更新零星采购
- `DELETE /api/zero-purchases/:id` - 删除零星采购
- `POST /api/zero-purchases/batch-delete` - 批量删除
- `POST /api/zero-purchases/check-excessive` - 检查是否超1.5%限额
- `POST /api/zero-purchases/:id/submit` - 提交审批
- `POST /api/zero-purchases/:id/approve` - 审批通过
- `POST /api/zero-purchases/:id/reject` - 审批拒绝
- `GET /api/zero-purchases/monthly-stats` - 获取月度统计

## 前端组件

### 文件位置
- `frontend/src/pages/material/ZeroPurchase.jsx`

### 功能特性

#### 1. 零星采购列表
- 显示采购编号、名称、供应商、总金额、清单数量
- 显示价格预警状态和预警级别
- 支持搜索、筛选（状态、预警级别）
- 支持批量删除
- 点击行可查看详情

#### 2. 月度统计卡片
- 本月零星采购总额
- 批量采购基准总额
- 占比（1.5%限额）
- 预警状态（正常/已超限）

#### 3. 创建/编辑零星采购
- 填写基本信息（名称、供应商、备注）
- 添加采购清单明细
- 自动检查价格预警（超出基准价）
- 自动检查超1.5%限额
- 显示预警弹窗

- 显示超量校验弹窗

#### 4. 采购清单详情模态框
- 显示采购基本信息
- 显示采购清单明细表格
- 支持提交审批（草稿状态）
- 底部显示合计金额

#### 5. 价格预警模态框
- 显示超出基准价的物资列表
- 显示基准价、实际价、超出百分比
- 支持确认提交或取消

#### 6. 超量预警模态框 (超1.5%限额)
- 显示月度限额信息
- 批量采购总额、1.5%限额、本月已使用、本次采购
- 需要法务审核，支持取消或提交法务审核

#### 7. 审批提交成功模态框
- 显示提交成功信息

## 审批流程

### 正常流程
1. 采购员创建零星采购
2. 财务审批
3. 总经理审批

### 价格预警流程
1. 采购员创建零星采购（有价格预警）
2. 财务审批
3. 法务审批
4. 总经理审批

### 超量流程 (超1.5%限额)
1. 采购员创建零星采购（超1.5%）
2. 预算员审批超量
3. 财务审批
4. 法务审批
5. 总经理审批

## 角色权限
- BUDGET 角色：可审批超量校验
- FINANCE 角色：财务审批
- LEGAL 角色：法务审批
- GM 角色：总经理审批

## 页面路由
- `/material/zero-purchase` - 零星采购管理页面

## 依赖
- 复用 Task 31 的材料基准价管理功能
- 复用 Task 30 的支出合同超量校验功能

## 测试说明

启动后端服务后，访问 http://localhost:3001/api/zero-purchases 可获取列表
