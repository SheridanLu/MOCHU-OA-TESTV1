/**
 * 变更管理路由
 * Task 51: 实现新增设备材料申请流程
 * 
 * 功能：
 * - GET /api/changes/material - 获取新增材料申请列表
 * - POST /api/changes/material - 创建新增材料申请
 * - GET /api/changes/material/:id - 获取详情
 * - POST /api/changes/material/:id/approve - 审批通过
 * - POST /api/changes/material/:id/reject - 审批拒绝
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有变更管理路由附加权限信息
router.use(authMiddleware, attachPermissions);

// ========================================
// 新增设备材料申请 API
// ========================================

/**
 * 生成新增材料申请编号
 * 规则：XZ + YYMMDD + 2位序号
 */
function generateMaterialChangeNo() {
  const today = new Date();
  const year = String(today.getFullYear()).slice(2);
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const datePart = `${year}${month}${day}`;
  
  // 查询当天已有的数量
  const countResult = db.prepare(`
    SELECT COUNT(*) as count FROM change_material
    WHERE change_no LIKE ?
  `).get(`XZ${datePart}%`);
  
  const count = countResult ? countResult.count : 0;
  const seq = String(count + 1).padStart(2, '0');
  
  return `XZ${datePart}${seq}`;
}

/**
 * GET /api/changes/material
 * 获取新增材料申请列表
 * 支持筛选：project_id, status, keyword
 */
router.get('/material', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT cm.*, p.name as project_name, u.real_name as creator_name,
           ua.real_name as approver_name
    FROM change_material cm
    LEFT JOIN projects p ON cm.project_id = p.id
    LEFT JOIN users u ON cm.creator_id = u.id
    LEFT JOIN users ua ON cm.approver_id = ua.id
    WHERE 1=1
  `;
  
  const params = [];
  
  // 项目筛选
  if (project_id) {
    sql += ` AND cm.project_id = ?`;
    params.push(project_id);
  }
  
  // 状态筛选
  if (status) {
    sql += ` AND cm.status = ?`;
    params.push(status);
  }
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (cm.material_name LIKE ? OR cm.specification LIKE ? OR cm.change_no LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  try {
    const materials = db.prepare(sql).all(...params);
    
    res.json({
      success: true,
      data: materials,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取新增材料申请列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取列表失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/material
 * 创建新增材料申请
 */
router.post('/material', checkPermission('material:create'), (req, res) => {
  const {
    project_id,
    material_name,
    specification,
    unit,
    reason,
    estimated_price,
    remark
  } = req.body;
  
  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  if (!material_name || !material_name.trim()) {
    return res.status(400).json({
      success: false,
      message: '材料名称不能为空'
    });
  }
  
  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '申请原因不能为空'
    });
  }
  
  const userId = req.user.id;
  
  try {
    // 生成申请编号
    const change_no = generateMaterialChangeNo();
    
    const result = db.prepare(`
      INSERT INTO change_material (
        change_no, project_id, material_name, specification, unit,
        reason, estimated_price, status, remark, creator_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)
    `).run(
      change_no,
      project_id,
      material_name.trim(),
      specification || null,
      unit || null,
      reason.trim(),
      estimated_price || null,
      remark || null,
      userId
    );
    
    const newMaterial = db.prepare(`
      SELECT cm.*, p.name as project_name
      FROM change_material cm
      LEFT JOIN projects p ON cm.project_id = p.id
      WHERE cm.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '新增材料申请创建成功',
      data: newMaterial
    });
  } catch (error) {
    console.error('创建新增材料申请失败:', error);
    res.status(500).json({
      success: false,
      message: '创建新增材料申请失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/material/:id
 * 获取新增材料申请详情
 */
router.get('/material/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const material = db.prepare(`
      SELECT cm.*, p.name as project_name, p.project_no,
             u.real_name as creator_name,
             ua.real_name as approver_name
      FROM change_material cm
      LEFT JOIN projects p ON cm.project_id = p.id
      LEFT JOIN users u ON cm.creator_id = u.id
      LEFT JOIN users ua ON cm.approver_id = ua.id
      WHERE cm.id = ?
    `).get(id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '新增材料申请不存在'
      });
    }
    
    // 获取审批记录
    const approvals = db.prepare(`
      SELECT mca.*, u.real_name as approver_name
      FROM material_change_approvals mca
      LEFT JOIN users u ON mca.approver_id = u.id
      WHERE mca.material_change_id = ?
      ORDER BY mca.created_at DESC
    `).all(id);
    
    res.json({
      success: true,
      data: {
        ...material,
        approvals
      }
    });
  } catch (error) {
    console.error('获取新增材料申请详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取新增材料申请详情失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/material/:id/approve
 * 审批通过
 */
router.post('/material/:id/approve', checkPermission('material:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  
  try {
    // 检查申请是否存在
    const material = db.prepare(`
      SELECT * FROM change_material WHERE id = ?
    `).get(id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '新增材料申请不存在'
      });
    }
    
    // 检查是否为待审批状态
    if (material.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '只能审批待审批状态的申请'
      });
    }
    
    const transaction = db.transaction(() => {
      // 更新申请状态
      db.prepare(`
        UPDATE change_material SET
          status = 'approved',
          approver_id = ?,
          approved_at = CURRENT_TIMESTAMP,
          remark = COALESCE(remark || '\n', '') || ?
        WHERE id = ?
      `).run(userId, comment ? `审批通过: ${comment}` : '审批通过', id);
      
      // 记录审批记录
      db.prepare(`
        INSERT INTO material_change_approvals (
          material_change_id, approver_id, action, comment, created_at
        ) VALUES (?, ?, 'approve', ?, CURRENT_TIMESTAMP)
      `).run(id, userId, comment || '审批通过');
      
      // 审批通过后，将材料添加到材料价格信息库
      const existingMaterial = db.prepare(`
        SELECT * FROM material_base_prices
        WHERE material_name = ? AND (specification = ? OR (specification IS NULL AND ? IS NULL))
      `).get(material.material_name, material.specification, material.specification);
      
      if (existingMaterial) {
        // 更新现有材料
        if (material.estimated_price) {
          db.prepare(`
            UPDATE material_base_prices SET
              base_price = ?,
              unit = COALESCE(?, unit),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(material.estimated_price, material.unit, existingMaterial.id);
          
          // 记录价格历史
          db.prepare(`
            INSERT INTO material_price_history (
              material_id, old_price, new_price, changed_by, change_reason
            ) VALUES (?, ?, ?, ?, '新增材料审批通过')
          `).run(existingMaterial.id, existingMaterial.base_price, material.estimated_price, userId);
        }
      } else {
        // 创建新材料
        db.prepare(`
          INSERT INTO material_base_prices (
            material_name, specification, unit, base_price, status, created_by, created_at
          ) VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
        `).run(
          material.material_name,
          material.specification,
          material.unit,
          material.estimated_price || 0,
          userId
        );
      }
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '审批通过成功，材料已添加到材料价格信息库'
    });
  } catch (error) {
    console.error('审批通过失败:', error);
    res.status(500).json({
      success: false,
      message: '审批通过失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/material/:id/reject
 * 审批拒绝
 */
router.post('/material/:id/reject', checkPermission('material:approve'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  
  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }
  
  try {
    // 检查申请是否存在
    const material = db.prepare(`
      SELECT * FROM change_material WHERE id = ?
    `).get(id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '新增材料申请不存在'
      });
    }
    
    // 检查是否为待审批状态
    if (material.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '只能拒绝待审批状态的申请'
      });
    }
    
    const transaction = db.transaction(() => {
      // 更新申请状态
      db.prepare(`
        UPDATE change_material SET
          status = 'rejected',
          remark = COALESCE(remark || '\n', '') || ?
        WHERE id = ?
      `).run(`审批拒绝: ${reason}`, id);
      
      // 记录审批记录
      db.prepare(`
        INSERT INTO material_change_approvals (
          material_change_id, approver_id, action, comment, created_at
        ) VALUES (?, ?, 'reject', ?, CURRENT_TIMESTAMP)
      `).run(id, userId, reason);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '审批拒绝成功'
    });
  } catch (error) {
    console.error('审批拒绝失败:', error);
    res.status(500).json({
      success: false,
      message: '审批拒绝失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/changes/material/:id
 * 删除新增材料申请（仅待审批状态可删除）
 */
router.delete('/material/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const material = db.prepare(`
      SELECT * FROM change_material WHERE id = ?
    `).get(id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '新增材料申请不存在'
      });
    }
    
    // 只有申请人可以删除待审批状态的申请
    if (material.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: '只能删除待审批状态的申请'
      });
    }
    
    if (material.creator_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '只有申请人可以删除'
      });
    }
    
    db.prepare(`DELETE FROM change_material WHERE id = ?`).run(id);
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除新增材料申请失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/projects
 * 获取项目列表（用于下拉选择）
 */
router.get('/projects', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT id, name, project_no FROM projects 
      WHERE status != 'cancelled' 
      ORDER BY created_at DESC
    `).all();
    
    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/material/pending
 * 获取待审批的新增材料申请列表
 */
router.get('/material/pending/list', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  try {
    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM change_material WHERE status = 'pending'
    `).get();
    const total = countResult ? countResult.total : 0;
    
    const materials = db.prepare(`
      SELECT cm.*, p.name as project_name, u.real_name as creator_name
      FROM change_material cm
      LEFT JOIN projects p ON cm.project_id = p.id
      LEFT JOIN users u ON cm.creator_id = u.id
      WHERE cm.status = 'pending'
      ORDER BY cm.created_at ASC
      LIMIT ? OFFSET ?
    `).all(parseInt(pageSize), offset);
    
    res.json({
      success: true,
      data: materials,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取待审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取待审批列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/material/stats
 * 获取新增材料申请统计
 */
router.get('/material/stats', (req, res) => {
  try {
    // 各状态统计
    const statusStats = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM change_material
      GROUP BY status
    `).all();
    
    // 总数
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM change_material
    `).get();
    
    res.json({
      success: true,
      data: {
        total: totalResult ? totalResult.total : 0,
        statusStats: statusStats.reduce((acc, item) => {
          acc[item.status] = item.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计失败: ' + error.message
    });
  }
});

// ========================================
// Task 52: 现场签证 API
// ========================================

/**
 * 生成现场签证编号
 * 编号规则：QZ + YYMMDD + 2位序号
 */
function generateVisaNo() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `QZ${year}${month}${day}`;

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM change_visa 
    WHERE visa_no LIKE ?
  `).get(`${prefix}%`);

  const seq = String((result?.count || 0) + 1).padStart(2, '0');
  return `${prefix}${seq}`;
}

/**
 * 获取现场签证状态文本
 */
function getVisaStatusText(status) {
  const statusMap = {
    pending: '待审批',
    finance_approved: '财务已审',
    approved: '审批通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  };
  return statusMap[status] || status;
}

/**
 * GET /api/changes/visa
 * 获取现场签证列表
 * 查询参数: project_id, status, keyword, page, pageSize
 */
router.get('/visa', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT cv.*, 
      p.name as project_name, p.project_no,
      u.real_name as creator_name,
      approver.real_name as approver_name
    FROM change_visa cv
    LEFT JOIN projects p ON cv.project_id = p.id
    LEFT JOIN users u ON cv.creator_id = u.id
    LEFT JOIN users approver ON cv.approver_id = approver.id
    WHERE 1=1
  `;
  const params = [];

  // 项目筛选
  if (project_id) {
    sql += ` AND cv.project_id = ?`;
    params.push(project_id);
  }

  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND cv.status = ?`;
    params.push(status);
  }

  // 关键词搜索
  if (keyword) {
    sql += ` AND (cv.visa_no LIKE ? OR cv.visa_content LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total FROM change_visa cv
    LEFT JOIN projects p ON cv.project_id = p.id
    WHERE 1=1
    ${project_id ? ' AND cv.project_id = ?' : ''}
    ${status && status !== 'all' ? ' AND cv.status = ?' : ''}
    ${keyword ? ' AND (cv.visa_no LIKE ? OR cv.visa_content LIKE ? OR p.name LIKE ?)' : ''}
  `;

  const countParams = [];
  if (project_id) countParams.push(project_id);
  if (status && status !== 'all') countParams.push(status);
  if (keyword) countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);

  const countResult = db.prepare(countSql).get(...countParams);
  const total = countResult?.total || 0;

  // 排序和分页
  sql += ` ORDER BY cv.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: list.map(item => ({
      ...item,
      status_text: getVisaStatusText(item.status)
    })),
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/changes/visa/:id
 * 获取现场签证详情
 */
router.get('/visa/:id', (req, res) => {
  const { id } = req.params;

  const item = db.prepare(`
    SELECT cv.*, 
      p.name as project_name, p.project_no,
      u.real_name as creator_name,
      approver.real_name as approver_name
    FROM change_visa cv
    LEFT JOIN projects p ON cv.project_id = p.id
    LEFT JOIN users u ON cv.creator_id = u.id
    LEFT JOIN users approver ON cv.approver_id = approver.id
    WHERE cv.id = ?
  `).get(id);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: '现场签证不存在'
    });
  }

  // 获取审批记录
  const approvalRecords = db.prepare(`
    SELECT cva.*, u.real_name as approver_name
    FROM change_visa_approvals cva
    LEFT JOIN users u ON cva.approver_id = u.id
    WHERE cva.visa_id = ?
    ORDER BY cva.step ASC
  `).all(id);

  res.json({
    success: true,
    data: {
      ...item,
      status_text: getVisaStatusText(item.status),
      approval_records: approvalRecords
    }
  });
});

/**
 * POST /api/changes/visa
 * 创建现场签证
 */
router.post('/visa', checkPermission('change:create'), (req, res) => {
  const { project_id, visa_content, reason, amount, remark } = req.body;
  const userId = req.user?.id;

  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }

  if (!visa_content || !visa_content.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写签证内容'
    });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写签证原因'
    });
  }

  // 验证项目是否存在
  const project = db.prepare('SELECT id, name, project_no FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(400).json({
      success: false,
      message: '关联的项目不存在'
    });
  }

  try {
    const result = db.transaction(() => {
      const visaNo = generateVisaNo();

      // 创建现场签证记录
      const insertResult = db.prepare(`
        INSERT INTO change_visa (
          visa_no, project_id, visa_content, reason, amount,
          status, remark, creator_id
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        visaNo, project_id, visa_content.trim(), reason.trim(), amount || 0,
        remark || null, userId
      );

      const visaId = insertResult.lastInsertRowid;

      // 创建审批流程
      // 如果金额 > 0，需要财务审核；否则只需项目经理审批
      const approvalSteps = amount && parseFloat(amount) > 0
        ? [
            { step: 1, step_name: '项目经理审批', role: 'PM' },
            { step: 2, step_name: '财务审批', role: 'FINANCE' }
          ]
        : [
            { step: 1, step_name: '项目经理审批', role: 'PM' }
          ];

      const insertApproval = db.prepare(`
        INSERT INTO change_visa_approvals (
          visa_id, step, step_name, role, action
        ) VALUES (?, ?, ?, ?, 'pending')
      `);

      approvalSteps.forEach(s => {
        insertApproval.run(visaId, s.step, s.step_name, s.role);
      });

      return { visaId, visaNo };
    })();

    res.json({
      success: true,
      message: '现场签证创建成功',
      data: {
        id: result.visaId,
        visa_no: result.visaNo
      }
    });
  } catch (error) {
    console.error('创建现场签证失败:', error);
    res.status(500).json({
      success: false,
      message: '创建现场签证失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/visa/:id/approve
 * 审批通过
 */
router.post('/visa/:id/approve', checkPermission('change:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  const item = db.prepare('SELECT * FROM change_visa WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '现场签证不存在'
    });
  }

  if (item.status !== 'pending' && item.status !== 'finance_approved') {
    return res.status(400).json({
      success: false,
      message: '该签证不在审批中'
    });
  }

  try {
    db.transaction(() => {
      // 获取当前审批步骤
      const currentStep = db.prepare(`
        SELECT * FROM change_visa_approvals
        WHERE visa_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (!currentStep) {
        throw new Error('没有待审批的步骤');
      }

      // 更新审批记录
      db.prepare(`
        UPDATE change_visa_approvals SET
          action = 'approve',
          approver_id = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentStep.id);

      // 检查是否还有后续步骤
      const nextStep = db.prepare(`
        SELECT * FROM change_visa_approvals
        WHERE visa_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (nextStep) {
        // 更新状态为财务已审（如果第一步通过）
        if (currentStep.step === 1) {
          db.prepare(`
            UPDATE change_visa SET
              status = 'finance_approved',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(id);
        }
      } else {
        // 审批完成
        db.prepare(`
          UPDATE change_visa SET
            status = 'approved',
            approver_id = ?,
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, id);
      }
    })();

    res.json({
      success: true,
      message: '审批通过'
    });
  } catch (error) {
    console.error('审批失败:', error);
    res.status(500).json({
      success: false,
      message: '审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/visa/:id/reject
 * 审批拒绝
 */
router.post('/visa/:id/reject', checkPermission('change:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }

  const item = db.prepare('SELECT * FROM change_visa WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '现场签证不存在'
    });
  }

  if (item.status !== 'pending' && item.status !== 'finance_approved') {
    return res.status(400).json({
      success: false,
      message: '该签证不在审批中'
    });
  }

  try {
    db.transaction(() => {
      // 更新当前审批步骤为拒绝
      const currentStep = db.prepare(`
        SELECT * FROM change_visa_approvals
        WHERE visa_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (currentStep) {
        db.prepare(`
          UPDATE change_visa_approvals SET
            action = 'reject',
            approver_id = ?,
            comment = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, comment, currentStep.id);
      }

      // 更新主表状态
      db.prepare(`
        UPDATE change_visa SET
          status = 'rejected',
          remark = COALESCE(remark || '\n拒绝原因: ' || ?, ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(comment, comment, id);
    })();

    res.json({
      success: true,
      message: '已拒绝'
    });
  } catch (error) {
    console.error('拒绝失败:', error);
    res.status(500).json({
      success: false,
      message: '拒绝失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/visa/pending
 * 获取待审批的现场签证列表
 */
router.get('/visa/pending', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  try {
    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM change_visa 
      WHERE status IN ('pending', 'finance_approved')
    `).get();
    const total = countResult?.total || 0;

    const list = db.prepare(`
      SELECT cv.*, 
        p.name as project_name, p.project_no,
        u.real_name as creator_name
      FROM change_visa cv
      LEFT JOIN projects p ON cv.project_id = p.id
      LEFT JOIN users u ON cv.creator_id = u.id
      WHERE cv.status IN ('pending', 'finance_approved')
      ORDER BY cv.created_at ASC
      LIMIT ? OFFSET ?
    `).all(parseInt(pageSize), offset);

    res.json({
      success: true,
      data: list.map(item => ({
        ...item,
        status_text: getVisaStatusText(item.status)
      })),
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取待审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取待审批列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/visa/stats
 * 获取现场签证统计
 */
router.get('/visa/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'finance_approved' THEN 1 ELSE 0 END) as finance_approved_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as total_amount
      FROM change_visa
    `).get();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/changes/visa/:id
 * 删除现场签证（仅待审批或已拒绝状态可删除）
 */
router.delete('/visa/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const visa = db.prepare('SELECT * FROM change_visa WHERE id = ?').get(id);

    if (!visa) {
      return res.status(404).json({
        success: false,
        message: '现场签证不存在'
      });
    }

    // 只有待审批或已拒绝状态可以删除
    if (!['pending', 'rejected'].includes(visa.status)) {
      return res.status(400).json({
        success: false,
        message: '只有待审批或已拒绝状态的签证可以删除'
      });
    }

    // 只有创建人可以删除
    if (visa.creator_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '只有创建人可以删除'
      });
    }

    db.transaction(() => {
      // 删除审批记录
      db.prepare('DELETE FROM change_visa_approvals WHERE visa_id = ?').run(id);
      // 删除主表记录
      db.prepare('DELETE FROM change_visa WHERE id = ?').run(id);
    })();

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除现场签证失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

// ========================================
// Task 53: 甲方需求变更 API
// ========================================

/**
 * 生成甲方需求变更编号
 * 编号规则：JF + YYMMDD + 2位序号
 */
function generateOwnerChangeNo() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `JF${year}${month}${day}`;

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM change_owner 
    WHERE change_no LIKE ?
  `).get(`${prefix}%`);

  const seq = String((result?.count || 0) + 1).padStart(2, '0');
  return `${prefix}${seq}`;
}

/**
 * 获取甲方需求变更状态文本
 */
function getOwnerStatusText(status) {
  const statusMap = {
    pending: '待审批',
    pm_approved: '项目经理已审',
    finance_approved: '财务已审',
    approved: '审批通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  };
  return statusMap[status] || status;
}

/**
 * GET /api/changes/owner
 * 获取甲方需求变更列表
 * 查询参数: project_id, status, keyword, page, pageSize
 */
router.get('/owner', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT co.*, 
      p.name as project_name, p.project_no,
      u.real_name as creator_name,
      approver.real_name as approver_name
    FROM change_owner co
    LEFT JOIN projects p ON co.project_id = p.id
    LEFT JOIN users u ON co.creator_id = u.id
    LEFT JOIN users approver ON co.approver_id = approver.id
    WHERE 1=1
  `;
  const params = [];

  // 项目筛选
  if (project_id) {
    sql += ` AND co.project_id = ?`;
    params.push(project_id);
  }

  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND co.status = ?`;
    params.push(status);
  }

  // 关键词搜索
  if (keyword) {
    sql += ` AND (co.change_no LIKE ? OR co.change_content LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total FROM change_owner co
    LEFT JOIN projects p ON co.project_id = p.id
    WHERE 1=1
    ${project_id ? ' AND co.project_id = ?' : ''}
    ${status && status !== 'all' ? ' AND co.status = ?' : ''}
    ${keyword ? ' AND (co.change_no LIKE ? OR co.change_content LIKE ? OR p.name LIKE ?)' : ''}
  `;

  const countParams = [];
  if (project_id) countParams.push(project_id);
  if (status && status !== 'all') countParams.push(status);
  if (keyword) countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);

  const countResult = db.prepare(countSql).get(...countParams);
  const total = countResult?.total || 0;

  // 排序和分页
  sql += ` ORDER BY co.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: list.map(item => ({
      ...item,
      status_text: getOwnerStatusText(item.status)
    })),
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/changes/owner/:id
 * 获取甲方需求变更详情
 */
router.get('/owner/:id', (req, res) => {
  const { id } = req.params;

  const item = db.prepare(`
    SELECT co.*, 
      p.name as project_name, p.project_no,
      u.real_name as creator_name,
      approver.real_name as approver_name
    FROM change_owner co
    LEFT JOIN projects p ON co.project_id = p.id
    LEFT JOIN users u ON co.creator_id = u.id
    LEFT JOIN users approver ON co.approver_id = approver.id
    WHERE co.id = ?
  `).get(id);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: '甲方需求变更不存在'
    });
  }

  // 获取审批记录
  const approvalRecords = db.prepare(`
    SELECT coa.*, u.real_name as approver_name
    FROM change_owner_approvals coa
    LEFT JOIN users u ON coa.approver_id = u.id
    WHERE coa.owner_change_id = ?
    ORDER BY coa.step ASC
  `).all(id);

  res.json({
    success: true,
    data: {
      ...item,
      status_text: getOwnerStatusText(item.status),
      approval_records: approvalRecords
    }
  });
});

/**
 * POST /api/changes/owner
 * 创建甲方需求变更
 */
router.post('/owner', checkPermission('change:create'), (req, res) => {
  const { 
    project_id, 
    change_content, 
    reason, 
    impact_assessment, 
    cost_impact, 
    schedule_impact, 
    remark 
  } = req.body;
  const userId = req.user?.id;

  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }

  if (!change_content || !change_content.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写变更内容'
    });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写变更原因'
    });
  }

  // 验证项目是否存在
  const project = db.prepare('SELECT id, name, project_no FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(400).json({
      success: false,
      message: '关联的项目不存在'
    });
  }

  try {
    const result = db.transaction(() => {
      const changeNo = generateOwnerChangeNo();

      // 创建甲方需求变更记录
      const insertResult = db.prepare(`
        INSERT INTO change_owner (
          change_no, project_id, change_content, reason, impact_assessment,
          cost_impact, schedule_impact, status, remark, creator_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        changeNo, 
        project_id, 
        change_content.trim(), 
        reason.trim(), 
        impact_assessment || null,
        cost_impact || 0,
        schedule_impact || 0,
        remark || null, 
        userId
      );

      const ownerId = insertResult.lastInsertRowid;

      // 创建审批流程
      // 甲方变更如果涉及成本增加，需要财务确认
      const hasCostImpact = cost_impact && parseFloat(cost_impact) > 0;
      const approvalSteps = hasCostImpact
        ? [
            { step: 1, step_name: '项目经理审批', role: 'PM' },
            { step: 2, step_name: '财务审批（成本确认）', role: 'FINANCE' },
            { step: 3, step_name: '总经理审批', role: 'GM' }
          ]
        : [
            { step: 1, step_name: '项目经理审批', role: 'PM' },
            { step: 2, step_name: '总经理审批', role: 'GM' }
          ];

      const insertApproval = db.prepare(`
        INSERT INTO change_owner_approvals (
          owner_change_id, step, step_name, role, action
        ) VALUES (?, ?, ?, ?, 'pending')
      `);

      approvalSteps.forEach(s => {
        insertApproval.run(ownerId, s.step, s.step_name, s.role);
      });

      return { ownerId, changeNo };
    })();

    res.json({
      success: true,
      message: '甲方需求变更创建成功',
      data: {
        id: result.ownerId,
        change_no: result.changeNo
      }
    });
  } catch (error) {
    console.error('创建甲方需求变更失败:', error);
    res.status(500).json({
      success: false,
      message: '创建甲方需求变更失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/owner/:id/approve
 * 审批通过
 */
router.post('/owner/:id/approve', checkPermission('change:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  const item = db.prepare('SELECT * FROM change_owner WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '甲方需求变更不存在'
    });
  }

  if (!['pending', 'pm_approved', 'finance_approved'].includes(item.status)) {
    return res.status(400).json({
      success: false,
      message: '该变更不在审批中'
    });
  }

  try {
    db.transaction(() => {
      // 获取当前审批步骤
      const currentStep = db.prepare(`
        SELECT * FROM change_owner_approvals
        WHERE owner_change_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (!currentStep) {
        throw new Error('没有待审批的步骤');
      }

      // 更新审批记录
      db.prepare(`
        UPDATE change_owner_approvals SET
          action = 'approve',
          approver_id = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentStep.id);

      // 检查是否还有后续步骤
      const nextStep = db.prepare(`
        SELECT * FROM change_owner_approvals
        WHERE owner_change_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (nextStep) {
        // 根据步骤更新状态
        let newStatus = item.status;
        if (currentStep.role === 'PM') {
          newStatus = 'pm_approved';
        } else if (currentStep.role === 'FINANCE') {
          newStatus = 'finance_approved';
        }

        db.prepare(`
          UPDATE change_owner SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newStatus, id);
      } else {
        // 审批完成
        db.prepare(`
          UPDATE change_owner SET
            status = 'approved',
            approver_id = ?,
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, id);
      }
    })();

    res.json({
      success: true,
      message: '审批通过'
    });
  } catch (error) {
    console.error('审批失败:', error);
    res.status(500).json({
      success: false,
      message: '审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/changes/owner/:id/reject
 * 审批拒绝
 */
router.post('/owner/:id/reject', checkPermission('change:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }

  const item = db.prepare('SELECT * FROM change_owner WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '甲方需求变更不存在'
    });
  }

  if (!['pending', 'pm_approved', 'finance_approved'].includes(item.status)) {
    return res.status(400).json({
      success: false,
      message: '该变更不在审批中'
    });
  }

  try {
    db.transaction(() => {
      // 更新当前审批步骤为拒绝
      const currentStep = db.prepare(`
        SELECT * FROM change_owner_approvals
        WHERE owner_change_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (currentStep) {
        db.prepare(`
          UPDATE change_owner_approvals SET
            action = 'reject',
            approver_id = ?,
            comment = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, comment, currentStep.id);
      }

      // 更新主表状态
      db.prepare(`
        UPDATE change_owner SET
          status = 'rejected',
          remark = COALESCE(remark || '\n拒绝原因: ' || ?, ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(comment, comment, id);
    })();

    res.json({
      success: true,
      message: '已拒绝'
    });
  } catch (error) {
    console.error('拒绝失败:', error);
    res.status(500).json({
      success: false,
      message: '拒绝失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/owner/pending
 * 获取待审批的甲方需求变更列表
 */
router.get('/owner/pending', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  try {
    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM change_owner 
      WHERE status IN ('pending', 'pm_approved', 'finance_approved')
    `).get();
    const total = countResult?.total || 0;

    const list = db.prepare(`
      SELECT co.*, 
        p.name as project_name, p.project_no,
        u.real_name as creator_name
      FROM change_owner co
      LEFT JOIN projects p ON co.project_id = p.id
      LEFT JOIN users u ON co.creator_id = u.id
      WHERE co.status IN ('pending', 'pm_approved', 'finance_approved')
      ORDER BY co.created_at ASC
      LIMIT ? OFFSET ?
    `).all(parseInt(pageSize), offset);

    res.json({
      success: true,
      data: list.map(item => ({
        ...item,
        status_text: getOwnerStatusText(item.status)
      })),
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取待审批列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取待审批列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/changes/owner/stats
 * 获取甲方需求变更统计
 */
router.get('/owner/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'pm_approved' THEN 1 ELSE 0 END) as pm_approved_count,
        SUM(CASE WHEN status = 'finance_approved' THEN 1 ELSE 0 END) as finance_approved_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status = 'approved' THEN cost_impact ELSE 0 END) as total_cost_impact
      FROM change_owner
    `).get();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/changes/owner/:id
 * 删除甲方需求变更（仅待审批或已拒绝状态可删除）
 */
router.delete('/owner/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const item = db.prepare('SELECT * FROM change_owner WHERE id = ?').get(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: '甲方需求变更不存在'
      });
    }

    // 只有待审批或已拒绝状态可以删除
    if (!['pending', 'rejected'].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: '只有待审批或已拒绝状态的变更可以删除'
      });
    }

    // 只有创建人可以删除
    if (item.creator_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '只有创建人可以删除'
      });
    }

    db.transaction(() => {
      // 删除审批记录
      db.prepare('DELETE FROM change_owner_approvals WHERE owner_change_id = ?').run(id);
      // 删除主表记录
      db.prepare('DELETE FROM change_owner WHERE id = ?').run(id);
    })();

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除甲方需求变更失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

module.exports = router;
