/**
 * 审批路由
 * 处理项目立项审批流程：采购员 → 财务 → 总经理
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const {
  initApprovalTables,
  createApproval,
  getApprovalById,
  getApprovalByProjectId,
  getApprovalHistory,
  approveApproval,
  rejectApproval,
  getPendingApprovals,
  getSporadicPendingApprovals,
  getPurchaseListPendingApprovals,
  getContractPendingApprovals,
  getBatchPurchasePendingApprovals,
  getMaterialPaymentPendingApprovals,
  getLaborPaymentPendingApprovals,
  getMaterialChangePendingApprovals,
  getVisaChangePendingApprovals,
  getOwnerChangePendingApprovals,
  getStockOutPendingApprovals,
  getLaborSettlementPendingApprovals,
  getOverageApplicationPendingApprovals,
  canUserApprove,
  ApprovalStatus
} = require('../models/approval');

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

// 初始化审批表（确保表存在）
initApprovalTables();

/**
 * 获取用户角色编码
 * @param {number} userId - 用户ID
 * @returns {string|null} 角色编码
 */
function getUserRoleCode(userId) {
  // 获取用户所有角色
  const results = db.prepare(`
    SELECT r.code
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).all(userId);
  
  // 返回角色代码数组
  return results.map(r => r.code);
}

/**
 * 检查用户是否有采购员角色（可以提交审批）
 * @param {number} userId - 用户ID
 * @returns {boolean}
 */
function isPurchaser(userId) {
  const roleCodes = getUserRoleCode(userId);
  // 采购员、项目经理、基础业务、软件业务、总经理都可以提交
  const allowedRoles = ['PURCHASE', 'PROJ_MGR', 'BASE', 'SOFTWARE', 'GM'];
  return roleCodes.some(role => allowedRoles.includes(role));
}

/**
 * GET /api/approval/pending
 * 获取待审批列表
 * 查询参数: page, pageSize
 */
router.get('/pending', (req, res) => {
  try {
    // 从认证信息获取用户角色
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const roleCodes = getUserRoleCode(userId);
    if (!roleCodes || roleCodes.length === 0) {
      return res.status(403).json({
        success: false,
        message: '您没有审批权限'
      });
    }

    // 只有财务和总经理角色可以查看待审批列表
    const approvalRoles = roleCodes.filter(r => ['FINANCE', 'GM', 'BUDGET'].includes(r));
    if (approvalRoles.length === 0) {
      return res.status(403).json({
        success: false,
        message: '您没有审批权限'
      });
    }

    const { page = 1, pageSize = 10 } = req.query;
    
    // 获取所有审批列表
    let projectResult = { list: [], total: 0 };
    let sporadicResult = { list: [], total: 0 };
    let purchaseListResult = { list: [], total: 0 };
    let contractResult = { list: [], total: 0 };
    let batchPurchaseResult = { list: [], total: 0 };
    let materialPaymentResult = { list: [], total: 0 };
    let laborPaymentResult = { list: [], total: 0 };
    let materialChangeResult = { list: [], total: 0 };
    let visaChangeResult = { list: [], total: 0 };
    let ownerChangeResult = { list: [], total: 0 };
    let stockOutResult = { list: [], total: 0 };
    let laborSettlementResult = { list: [], total: 0 };
    let overageResult = { list: [], total: 0 };
    
    try { projectResult = getPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('项目审批查询失败:', e.message); }
    try { sporadicResult = getSporadicPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('零星采购审批查询失败:', e.message); }
    try { purchaseListResult = getPurchaseListPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('采购清单审批查询失败:', e.message); }
    try { contractResult = getContractPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('合同审批查询失败:', e.message); }
    try { batchPurchaseResult = getBatchPurchasePendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('批量采购审批查询失败:', e.message); }
    try { materialPaymentResult = getMaterialPaymentPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('材料付款审批查询失败:', e.message); }
    try { laborPaymentResult = getLaborPaymentPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('劳务付款审批查询失败:', e.message); }
    try { materialChangeResult = getMaterialChangePendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('材料变更审批查询失败:', e.message); }
    try { visaChangeResult = getVisaChangePendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('签证变更审批查询失败:', e.message); }
    try { ownerChangeResult = getOwnerChangePendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('业主变更审批查询失败:', e.message); }
    try { stockOutResult = getStockOutPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('出库审批查询失败:', e.message); }
    try { laborSettlementResult = getLaborSettlementPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('竣工结算审批查询失败:', e.message); }
    try { overageResult = getOverageApplicationPendingApprovals(approvalRoles, { page, pageSize }); } catch (e) { console.error('超量申请审批查询失败:', e.message); }
    
    // 合并结果
    // 处理项目审批列表，根据type字段区分不同审批类型
    const processedProjectList = projectResult.list.map(item => {
      if (item.type === 'virtual_convert') {
        return { ...item, approval_source: 'virtual_convert', source_name: '虚拟转实体' };
      } else if (item.type === 'virtual_abort') {
        return { ...item, approval_source: 'virtual_abort', source_name: '虚拟中止' };
      } else {
        return { ...item, approval_source: 'project', source_name: '项目立项' };
      }
    });
    
    const allList = [
      ...processedProjectList,
      ...sporadicResult.list.map(item => ({ ...item, approval_source: 'sporadic', source_name: '零星采购' })),
      ...purchaseListResult.list.map(item => ({ ...item, approval_source: 'purchase_list', source_name: '采购清单' })),
      ...contractResult.list.map(item => ({ ...item, approval_source: 'contract', source_name: '合同管理' })),
      ...batchPurchaseResult.list.map(item => ({ ...item, approval_source: 'batch_purchase', source_name: '批量采购' })),
      ...materialPaymentResult.list.map(item => ({ ...item, approval_source: 'material_payment', source_name: '材料付款' })),
      ...laborPaymentResult.list.map(item => ({ ...item, approval_source: 'labor_payment', source_name: '劳务付款' })),
      ...materialChangeResult.list.map(item => ({ ...item, approval_source: 'material_change', source_name: '材料变更' })),
      ...visaChangeResult.list.map(item => ({ ...item, approval_source: 'visa_change', source_name: '签证变更' })),
      ...ownerChangeResult.list.map(item => ({ ...item, approval_source: 'owner_change', source_name: '业主变更' })),
      ...stockOutResult.list.map(item => ({ ...item, approval_source: 'stock_out', source_name: '出库申请' })),
      ...laborSettlementResult.list.map(item => ({ ...item, approval_source: 'labor_settlement', source_name: '竣工结算' })),
      ...overageResult.list.map(item => ({ ...item, approval_source: 'overage_application', source_name: '超量申请' }))
    ];
    
    // 按创建时间排序
    allList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // 分页
    const total = projectResult.total + sporadicResult.total + purchaseListResult.total +
                  contractResult.total + batchPurchaseResult.total + materialPaymentResult.total +
                  laborPaymentResult.total + materialChangeResult.total + visaChangeResult.total +
                  ownerChangeResult.total + stockOutResult.total + laborSettlementResult.total +
                  overageResult.total;
    const startIndex = (parseInt(page) - 1) * parseInt(pageSize);
    const paginatedList = allList.slice(startIndex, startIndex + parseInt(pageSize));

    res.json({
      success: true,
      data: {
        list: paginatedList,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        stats: {
          project: projectResult.total,
          sporadic: sporadicResult.total,
          purchase_list: purchaseListResult.total,
          contract: contractResult.total,
          batch_purchase: batchPurchaseResult.total,
          material_payment: materialPaymentResult.total,
          labor_payment: laborPaymentResult.total,
          material_change: materialChangeResult.total,
          visa_change: visaChangeResult.total,
          owner_change: ownerChangeResult.total,
          stock_out: stockOutResult.total,
          labor_settlement: laborSettlementResult.total,
          overage_application: overageResult.total
        }
      }
    });
  } catch (error) {
    console.error('获取待审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取待审批列表失败'
    });
  }
});

/**
 * POST /api/approval/project/:projectId/submit
 * 提交项目审批
 */
router.post('/project/:projectId/submit', (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    // 检查项目是否存在
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    // 检查项目状态（只有草稿状态或审批被拒状态可以提交）
    if (!['pending', 'approval_rejected'].includes(project.status)) {
      return res.status(400).json({
        success: false,
        message: '项目当前状态不允许提交审批'
      });
    }

    // 检查用户权限（采购员等角色可以提交）
    if (!isPurchaser(userId)) {
      return res.status(403).json({
        success: false,
        message: '您没有提交审批的权限'
      });
    }

    // 创建审批记录
    const approval = createApproval(parseInt(projectId), userId);

    res.status(201).json({
      success: true,
      message: '项目已提交审批',
      data: approval
    });
  } catch (error) {
    console.error('提交审批失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '提交审批失败'
    });
  }
});

/**
 * POST /api/approval/project/:projectId/approve
 * 审批通过
 */
router.post('/project/:projectId/approve', (req, res) => {
  try {
    const { projectId } = req.params;
    const { comment } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    // 获取审批记录
    const approval = getApprovalByProjectId(parseInt(projectId));
    if (!approval) {
      return res.status(404).json({
        success: false,
        message: '审批记录不存在'
      });
    }

    // 获取用户角色
    const roleCode = getUserRoleCode(userId);
    if (!roleCode) {
      return res.status(403).json({
        success: false,
        message: '您没有审批权限'
      });
    }

    // 检查用户是否有权限审批
    if (!canUserApprove(approval.id, userId, roleCode)) {
      return res.status(403).json({
        success: false,
        message: '您没有权限审批此项目'
      });
    }

    // 执行审批通过
    const updatedApproval = approveApproval(approval.id, userId, comment);

    res.json({
      success: true,
      message: '审批通过',
      data: updatedApproval
    });
  } catch (error) {
    console.error('审批通过失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '审批通过失败'
    });
  }
});

/**
 * POST /api/approval/project/:projectId/reject
 * 审批拒绝
 */
router.post('/project/:projectId/reject', (req, res) => {
  try {
    const { projectId } = req.params;
    const { comment } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    // 获取审批记录
    const approval = getApprovalByProjectId(parseInt(projectId));
    if (!approval) {
      return res.status(404).json({
        success: false,
        message: '审批记录不存在'
      });
    }

    // 获取用户角色
    const roleCode = getUserRoleCode(userId);
    if (!roleCode) {
      return res.status(403).json({
        success: false,
        message: '您没有审批权限'
      });
    }

    // 检查用户是否有权限审批
    if (!canUserApprove(approval.id, userId, roleCode)) {
      return res.status(403).json({
        success: false,
        message: '您没有权限审批此项目'
      });
    }

    // 拒绝原因必填
    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: '请填写拒绝原因'
      });
    }

    // 执行审批拒绝
    const updatedApproval = rejectApproval(approval.id, userId, comment);

    res.json({
      success: true,
      message: '审批已拒绝',
      data: updatedApproval
    });
  } catch (error) {
    console.error('审批拒绝失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '审批拒绝失败'
    });
  }
});

/**
 * GET /api/approval/project/:projectId/history
 * 获取审批历史
 */
router.get('/project/:projectId/history', (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    // 检查项目是否存在
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    const history = getApprovalHistory(parseInt(projectId));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('获取审批历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批历史失败'
    });
  }
});

/**
 * GET /api/approval/project/:projectId
 * 获取项目审批详情
 */
router.get('/project/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    // 检查项目是否存在
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      });
    }

    const approval = getApprovalByProjectId(parseInt(projectId));
    
    if (!approval) {
      return res.json({
        success: true,
        data: null,
        message: '该项目尚未提交审批'
      });
    }

    // 获取用户角色，判断是否有审批权限
    const roleCode = getUserRoleCode(userId);
    const canApprove = canUserApprove(approval.id, userId, roleCode);

    res.json({
      success: true,
      data: {
        ...approval,
        contract_amount: parseFloat(approval.contract_amount) || 0,
        canApprove,
        currentUserRole: roleCode
      }
    });
  } catch (error) {
    console.error('获取审批详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批详情失败'
    });
  }
});

/**
 * GET /api/approval/my-submissions
 * 获取我提交的审批列表
 */
router.get('/my-submissions', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const { page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 查询总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total 
      FROM approvals 
      WHERE submitter_id = ?
    `).get(userId);

    // 查询列表
    const list = db.prepare(`
      SELECT 
        a.*,
        p.project_no,
        p.name as project_name,
        p.customer,
        p.contract_amount
      FROM approvals a
      LEFT JOIN projects p ON a.project_id = p.id
      WHERE a.submitter_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(pageSize), offset);

    // 为每个审批记录添加流程信息
    const listWithFlows = list.map(item => {
      const flows = getApprovalById(item.id)?.flows || [];
      return {
        ...item,
        contract_amount: parseFloat(item.contract_amount) || 0,
        flows
      };
    });

    res.json({
      success: true,
      data: {
        list: listWithFlows,
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取提交的审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取提交的审批列表失败'
    });
  }
});

/**
 * GET /api/approval/my-approved
 * 获取我已审批的列表
 */
router.get('/my-approved', (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const { page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 查询总数
    const countResult = db.prepare(`
      SELECT COUNT(DISTINCT a.id) as total 
      FROM approvals a
      JOIN approval_flows af ON a.id = af.approval_id
      WHERE af.approver_id = ? AND af.status != 'pending'
    `).get(userId);

    // 查询列表
    const list = db.prepare(`
      SELECT DISTINCT
        a.*,
        p.project_no,
        p.name as project_name,
        p.customer,
        p.contract_amount,
        af.status as my_action,
        af.comment as my_comment,
        af.approved_at as my_approved_at
      FROM approvals a
      JOIN approval_flows af ON a.id = af.approval_id
      LEFT JOIN projects p ON a.project_id = p.id
      WHERE af.approver_id = ? AND af.status != 'pending'
      ORDER BY af.approved_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(pageSize), offset);

    const formattedList = list.map(item => ({
      ...item,
      contract_amount: parseFloat(item.contract_amount) || 0
    }));

    res.json({
      success: true,
      data: {
        list: formattedList,
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取已审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取已审批列表失败'
    });
  }
});

module.exports = router;
