/**
 * 审批模型
 * 处理审批流程的数据库操作
 */

const { db } = require('./database');

// 审批状态枚举
const ApprovalStatus = {
  PENDING: 'pending',           // 待审批
  FINANCE_APPROVED: 'finance_approved',  // 财务已审
  APPROVED: 'approved',         // 已通过
  REJECTED: 'rejected'          // 已拒绝
};

// 审批节点状态枚举
const ApprovalNodeStatus = {
  PENDING: 'pending',           // 待审批
  APPROVED: 'approved',         // 已通过
  REJECTED: 'rejected'          // 已拒绝
};

// 审批流程步骤定义
const ApprovalSteps = {
  FINANCE: 1,    // 财务审批（第一步）
  GM: 2          // 总经理审批（第二步）
};

// 审批流程角色映射
const ApprovalRoleMap = {
  [ApprovalSteps.FINANCE]: 'FINANCE',   // 财务
  [ApprovalSteps.GM]: 'GM'              // 总经理
};

/**
 * 初始化审批相关表
 */
function initApprovalTables() {
  // 创建审批主表
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      type TEXT DEFAULT 'project' NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      submitter_id INTEGER NOT NULL,
      current_step INTEGER DEFAULT 1,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (submitter_id) REFERENCES users(id)
    )
  `);

  // 创建审批流程节点表
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      approver_id INTEGER,
      comment TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approvals_project_id ON approvals(project_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approval_flows_approval_id ON approval_flows(approval_id)
  `);

  console.log('审批表初始化完成');
}

/**
 * 创建审批记录
 * @param {number} projectId - 项目ID
 * @param {number} submitterId - 提交人ID
 * @returns {Object} 创建的审批记录
 */
function createApproval(projectId, submitterId) {
  // 检查项目是否已存在审批
  const existing = db.prepare('SELECT * FROM approvals WHERE project_id = ?').get(projectId);
  if (existing) {
    throw new Error('该项目已存在审批记录');
  }

  // 使用事务创建审批记录和流程节点
  const transaction = db.transaction(() => {
    // 创建审批主记录
    const approvalResult = db.prepare(`
      INSERT INTO approvals (project_id, type, status, submitter_id, current_step)
      VALUES (?, 'project', 'pending', ?, 1)
    `).run(projectId, submitterId);

    const approvalId = approvalResult.lastInsertRowid;

    // 创建审批流程节点（财务 -> 总经理）
    // 第一步：财务审批
    db.prepare(`
      INSERT INTO approval_flows (approval_id, step, role, status)
      VALUES (?, 1, 'FINANCE', 'pending')
    `).run(approvalId);

    // 第二步：总经理审批
    db.prepare(`
      INSERT INTO approval_flows (approval_id, step, role, status)
      VALUES (?, 2, 'GM', 'pending')
    `).run(approvalId);

    // 更新项目状态为待审批
    db.prepare(`
      UPDATE projects SET status = 'pending_approval', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(projectId);

    return approvalId;
  });

  const approvalId = transaction();

  // 返回创建的审批记录
  return getApprovalById(approvalId);
}

/**
 * 根据ID获取审批记录
 * @param {number} approvalId - 审批ID
 * @returns {Object|null} 审批记录
 */
function getApprovalById(approvalId) {
  const approval = db.prepare(`
    SELECT 
      a.*,
      p.project_no,
      p.name as project_name,
      p.customer,
      p.contract_amount,
      u.real_name as submitter_name
    FROM approvals a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN users u ON a.submitter_id = u.id
    WHERE a.id = ?
  `).get(approvalId);

  if (approval) {
    // 获取审批流程节点
    approval.flows = getApprovalFlows(approvalId);
  }

  return approval;
}

/**
 * 根据项目ID获取审批记录
 * @param {number} projectId - 项目ID
 * @returns {Object|null} 审批记录
 */
function getApprovalByProjectId(projectId) {
  const approval = db.prepare(`
    SELECT 
      a.*,
      p.project_no,
      p.name as project_name,
      p.customer,
      p.contract_amount,
      u.real_name as submitter_name
    FROM approvals a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN users u ON a.submitter_id = u.id
    WHERE a.project_id = ?
  `).get(projectId);

  if (approval) {
    approval.flows = getApprovalFlows(approval.id);
  }

  return approval;
}

/**
 * 获取审批流程节点
 * @param {number} approvalId - 审批ID
 * @returns {Array} 流程节点列表
 */
function getApprovalFlows(approvalId) {
  return db.prepare(`
    SELECT 
      af.*,
      u.real_name as approver_name
    FROM approval_flows af
    LEFT JOIN users u ON af.approver_id = u.id
    WHERE af.approval_id = ?
    ORDER BY af.step ASC
  `).all(approvalId);
}

/**
 * 获取审批历史
 * @param {number} projectId - 项目ID
 * @returns {Array} 审批历史
 */
function getApprovalHistory(projectId) {
  const approval = getApprovalByProjectId(projectId);
  if (!approval) {
    return [];
  }

  return approval.flows.map(flow => ({
    step: flow.step,
    role: flow.role,
    status: flow.status,
    approver_name: flow.approver_name,
    comment: flow.comment,
    approved_at: flow.approved_at,
    created_at: flow.created_at
  }));
}

/**
 * 审批通过
 * @param {number} approvalId - 审批ID
 * @param {number} approverId - 审批人ID
 * @param {string} comment - 审批意见
 * @returns {Object} 更新后的审批记录
 */
function approveApproval(approvalId, approverId, comment = '') {
  const approval = getApprovalById(approvalId);
  if (!approval) {
    throw new Error('审批记录不存在');
  }

  // 检查审批状态
  if (approval.status === ApprovalStatus.APPROVED) {
    throw new Error('该审批已通过');
  }
  if (approval.status === ApprovalStatus.REJECTED) {
    throw new Error('该审批已被拒绝');
  }

  // 获取当前步骤的流程节点
  const currentFlow = approval.flows.find(f => f.step === approval.current_step);
  if (!currentFlow) {
    throw new Error('找不到当前审批节点');
  }

  // 检查当前节点是否已处理
  if (currentFlow.status !== ApprovalNodeStatus.PENDING) {
    throw new Error('当前审批节点已处理');
  }

  const transaction = db.transaction(() => {
    const now = new Date().toISOString();

    // 更新当前节点状态
    db.prepare(`
      UPDATE approval_flows 
      SET status = 'approved', approver_id = ?, comment = ?, approved_at = ?
      WHERE id = ?
    `).run(approverId, comment, now, currentFlow.id);

    // 判断是否还有下一步
    const nextStep = approval.current_step + 1;
    const hasNextStep = approval.flows.some(f => f.step === nextStep);

    if (hasNextStep) {
      // 进入下一步
      db.prepare(`
        UPDATE approvals 
        SET current_step = ?, updated_at = ?
        WHERE id = ?
      `).run(nextStep, now, approvalId);

      // 如果第一步（财务）通过，更新状态为财务已审
      if (approval.current_step === ApprovalSteps.FINANCE) {
        db.prepare(`
          UPDATE approvals SET status = 'finance_approved', updated_at = ? WHERE id = ?
        `).run(now, approvalId);
      }
    } else {
      // 审批完成，更新状态为已通过
      db.prepare(`
        UPDATE approvals 
        SET status = 'approved', updated_at = ?
        WHERE id = ?
      `).run(now, approvalId);

      // 更新项目状态为进行中
      db.prepare(`
        UPDATE projects SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approval.project_id);
    }
  });

  transaction();

  return getApprovalById(approvalId);
}

/**
 * 审批拒绝
 * @param {number} approvalId - 审批ID
 * @param {number} approverId - 审批人ID
 * @param {string} comment - 拒绝原因
 * @returns {Object} 更新后的审批记录
 */
function rejectApproval(approvalId, approverId, comment = '') {
  const approval = getApprovalById(approvalId);
  if (!approval) {
    throw new Error('审批记录不存在');
  }

  // 检查审批状态
  if (approval.status === ApprovalStatus.APPROVED) {
    throw new Error('该审批已通过，无法拒绝');
  }
  if (approval.status === ApprovalStatus.REJECTED) {
    throw new Error('该审批已被拒绝');
  }

  // 获取当前步骤的流程节点
  const currentFlow = approval.flows.find(f => f.step === approval.current_step);
  if (!currentFlow) {
    throw new Error('找不到当前审批节点');
  }

  // 检查当前节点是否已处理
  if (currentFlow.status !== ApprovalNodeStatus.PENDING) {
    throw new Error('当前审批节点已处理');
  }

  const transaction = db.transaction(() => {
    const now = new Date().toISOString();

    // 更新当前节点状态为拒绝
    db.prepare(`
      UPDATE approval_flows 
      SET status = 'rejected', approver_id = ?, comment = ?, approved_at = ?
      WHERE id = ?
    `).run(approverId, comment, now, currentFlow.id);

    // 更新审批状态为拒绝
    db.prepare(`
      UPDATE approvals 
      SET status = 'rejected', updated_at = ?
      WHERE id = ?
    `).run(now, approvalId);

    // 更新项目状态为审批被拒
    db.prepare(`
      UPDATE projects SET status = 'approval_rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(approval.project_id);
  });

  transaction();

  return getApprovalById(approvalId);
}

/**
 * 获取待审批列表（根据角色过滤）
 * @param {string} roleCode - 角色编码
 * @param {Object} options - 分页选项
 * @returns {Object} 待审批列表和总数
 */
function getPendingApprovals(roleCodes, options = {}) {
  const { page = 1, pageSize = 10 } = options;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  // 支持多角色查询
  const roleArray = Array.isArray(roleCodes) ? roleCodes : [roleCodes];
  const rolePlaceholders = roleArray.map(() => '?').join(',');

  // 查找当前步骤需要该角色审批的待审批记录
  let sql = `
    SELECT 
      a.*,
      p.project_no,
      p.name as project_name,
      p.customer,
      p.contract_amount,
      pu.real_name as project_manager_name,
      u.real_name as submitter_name
    FROM approvals a
    LEFT JOIN projects p ON a.project_id = p.id
    LEFT JOIN users pu ON p.manager_id = pu.id
    LEFT JOIN users u ON a.submitter_id = u.id
    INNER JOIN approval_flows af ON a.id = af.approval_id 
      AND af.step = a.current_step 
      AND af.role IN (${rolePlaceholders})
      AND af.status = 'pending'
    WHERE a.status IN ('pending', 'finance_approved')
  `;

  const params = [...roleArray];

  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult.total;

  // 分页查询
  sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);

  // 为每个审批记录添加当前审批节点信息
  const listWithFlows = list.map(item => {
    const flows = getApprovalFlows(item.id);
    return {
      ...item,
      contract_amount: parseFloat(item.contract_amount) || 0,
      flows
    };
  });

  return {
    list: listWithFlows,
    total,
    page: parseInt(page),
    pageSize: parseInt(pageSize)
  };
}

/**
 * 检查用户是否有权限审批
 * @param {number} approvalId - 审批ID
 * @param {number} userId - 用户ID
 * @param {string} roleCode - 用户角色编码
 * @returns {boolean} 是否有权限
 */
function canUserApprove(approvalId, userId, roleCode) {
  const approval = getApprovalById(approvalId);
  if (!approval) {
    return false;
  }

  // 检查审批状态
  if (approval.status === ApprovalStatus.APPROVED || 
      approval.status === ApprovalStatus.REJECTED) {
    return false;
  }

  // 获取当前步骤的流程节点
  const currentFlow = approval.flows.find(f => f.step === approval.current_step);
  if (!currentFlow) {
    return false;
  }

  // 检查当前节点是否需要该角色审批
  if (currentFlow.role !== roleCode) {
    return false;
  }

  // 检查当前节点是否已处理
  if (currentFlow.status !== ApprovalNodeStatus.PENDING) {
    return false;
  }

  return true;
}

module.exports = {
  initApprovalTables,
  createApproval,
  getApprovalById,
  getApprovalByProjectId,
  getApprovalFlows,
  getApprovalHistory,
  approveApproval,
  rejectApproval,
  getPendingApprovals,
  canUserApprove,
  ApprovalStatus,
  ApprovalNodeStatus,
  ApprovalSteps,
  ApprovalRoleMap
};
