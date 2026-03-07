/**
 * 付款管理路由
 * Task 48: 材料款付款 - 必须关联入库单
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有路由附加权限信息
router.use(authMiddleware, attachPermissions);

// ========================================
// 材料款付款管理 API
// ========================================

/**
 * 生成材料款付款编号
 * 格式: CF + YYMMDD + 2位序号
 * 例: 2026年3月7日第1个: CF26030701
 * 每日重置序号
 */
function generateMaterialPaymentNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const prefix = `CF${year}${month}${day}`;

  // 获取今日最大序号
  const result = db.prepare(`
    SELECT MAX(payment_no) as max_no
    FROM material_payments
    WHERE payment_no LIKE ?
  `).get(`${prefix}%`);

  let seq = 1;
  if (result && result.max_no) {
    const lastSeq = parseInt(result.max_no.slice(-2));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return `${prefix}${seq.toString().padStart(2, '0')}`;
}

/**
 * GET /api/payments/material
 * 获取材料款付款列表
 * 查询参数: keyword, status, project_id, supplier_id, page, pageSize
 */
router.get('/material', (req, res) => {
  const { keyword, status, project_id, supplier_id, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT mp.*,
           p.name as project_name,
           p.project_no,
           s.name as supplier_name,
           si.stock_in_no,
           si.total_amount as stock_in_amount,
           u.real_name as creator_name,
           au.real_name as approver_name,
           pu.real_name as payer_name
    FROM material_payments mp
    LEFT JOIN projects p ON mp.project_id = p.id
    LEFT JOIN suppliers s ON mp.supplier_id = s.id
    LEFT JOIN stock_in si ON mp.stock_in_id = si.id
    LEFT JOIN users u ON mp.creator_id = u.id
    LEFT JOIN users au ON mp.approved_by = au.id
    LEFT JOIN users pu ON mp.paid_by = pu.id
    WHERE 1=1
  `;
  const params = [];

  // 关键词搜索
  if (keyword) {
    sql += ` AND (mp.payment_no LIKE ? OR p.name LIKE ? OR s.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND mp.status = ?`;
    params.push(status);
  }

  // 项目筛选
  if (project_id) {
    sql += ` AND mp.project_id = ?`;
    params.push(project_id);
  }

  // 供应商筛选
  if (supplier_id) {
    sql += ` AND mp.supplier_id = ?`;
    params.push(supplier_id);
  }

  // 获取总数
  const countSql = sql.replace(
    /SELECT mp\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;

  // 排序和分页
  sql += ` ORDER BY mp.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const payments = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: payments,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/payments/material/:id
 * 获取材料款付款详情
 */
router.get('/material/:id', (req, res) => {
  const { id } = req.params;

  const payment = db.prepare(`
    SELECT mp.*,
           p.name as project_name,
           p.project_no,
           s.name as supplier_name,
           s.contact_person,
           s.phone,
           s.bank_name,
           s.bank_account,
           si.stock_in_no,
           si.total_amount as stock_in_amount,
           si.total_quantity as stock_in_quantity,
           si.in_date,
           u.real_name as creator_name,
           au.real_name as approver_name,
           pu.real_name as payer_name
    FROM material_payments mp
    LEFT JOIN projects p ON mp.project_id = p.id
    LEFT JOIN suppliers s ON mp.supplier_id = s.id
    LEFT JOIN stock_in si ON mp.stock_in_id = si.id
    LEFT JOIN users u ON mp.creator_id = u.id
    LEFT JOIN users au ON mp.approved_by = au.id
    LEFT JOIN users pu ON mp.paid_by = pu.id
    WHERE mp.id = ?
  `).get(id);

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: '付款记录不存在'
    });
  }

  // 获取审批记录
  const approvals = db.prepare(`
    SELECT mpa.*, u.real_name as approver_name
    FROM material_payment_approvals mpa
    LEFT JOIN users u ON mpa.approver_id = u.id
    WHERE mpa.payment_id = ?
    ORDER BY mpa.step ASC
  `).all(id);

  // 获取入库单明细
  const stockInItems = db.prepare(`
    SELECT * FROM stock_in_items WHERE stock_in_id = ? ORDER BY id
  `).all(payment.stock_in_id);

  res.json({
    success: true,
    data: {
      ...payment,
      approvals,
      stock_in_items: stockInItems
    }
  });
});

/**
 * POST /api/payments/material
 * 创建材料款付款
 */
router.post('/material', checkPermission('payment:create'), (req, res) => {
  const {
    stock_in_id,
    project_id,
    supplier_id,
    amount,
    remark
  } = req.body;

  // 验证必填字段
  if (!stock_in_id) {
    return res.status(400).json({
      success: false,
      message: '入库单ID不能为空'
    });
  }

  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '项目ID不能为空'
    });
  }

  if (!supplier_id) {
    return res.status(400).json({
      success: false,
      message: '供应商ID不能为空'
    });
  }

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: '付款金额必须大于0'
    });
  }

  const userId = req.user.id;

  try {
    const transaction = db.transaction(() => {
      // 检查入库单是否存在且已确认
      const stockIn = db.prepare(`
        SELECT * FROM stock_in WHERE id = ? AND status = 'confirmed'
      `).get(stock_in_id);

      if (!stockIn) {
        throw new Error('入库单不存在或未确认');
      }

      // 检查付款金额是否超过入库单金额
      if (parseFloat(amount) > parseFloat(stockIn.total_amount)) {
        throw new Error(`付款金额不能超过入库单金额 ¥${stockIn.total_amount}`);
      }

      // 检查该入库单是否已有付款记录
      const existingPayment = db.prepare(`
        SELECT * FROM material_payments
        WHERE stock_in_id = ? AND status IN ('pending', 'approved', 'paid')
      `).get(stock_in_id);

      if (existingPayment) {
        throw new Error('该入库单已存在付款申请，请勿重复创建');
      }

      const paymentNo = generateMaterialPaymentNo();

      // 插入付款记录
      const result = db.prepare(`
        INSERT INTO material_payments (
          payment_no, stock_in_id, project_id, supplier_id,
          amount, status, remark, creator_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
      `).run(
        paymentNo,
        stock_in_id,
        project_id,
        supplier_id,
        amount,
        remark || '',
        userId
      );

      const paymentId = result.lastInsertRowid;

      // 创建审批流程记录
      // 步骤1: 财务审批
      db.prepare(`
        INSERT INTO material_payment_approvals (
          payment_id, step, step_name, role, action, created_at, updated_at
        ) VALUES (?, 1, '财务审批', 'FINANCE', 'pending', datetime('now'), datetime('now'))
      `).run(paymentId);

      // 步骤2: 总经理审批
      db.prepare(`
        INSERT INTO material_payment_approvals (
          payment_id, step, step_name, role, action, created_at, updated_at
        ) VALUES (?, 2, '总经理审批', 'GM', 'pending', datetime('now'), datetime('now'))
      `).run(paymentId);

      // 获取完整记录
      const payment = db.prepare(`
        SELECT mp.*,
               p.name as project_name,
               s.name as supplier_name,
               si.stock_in_no
        FROM material_payments mp
        LEFT JOIN projects p ON mp.project_id = p.id
        LEFT JOIN suppliers s ON mp.supplier_id = s.id
        LEFT JOIN stock_in si ON mp.stock_in_id = si.id
        WHERE mp.id = ?
      `).get(paymentId);

      return payment;
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款申请创建成功',
      data: payment
    });
  } catch (error) {
    console.error('创建材料款付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '创建付款申请失败'
    });
  }
});

/**
 * PUT /api/payments/material/:id
 * 更新材料款付款（仅待审批状态可更新）
 */
router.put('/material/:id', checkPermission('payment:edit'), (req, res) => {
  const { id } = req.params;
  const { amount, remark } = req.body;

  try {
    const transaction = db.transaction(() => {
      // 检查付款记录状态
      const payment = db.prepare(`
        SELECT mp.*, si.total_amount as stock_in_amount
        FROM material_payments mp
        LEFT JOIN stock_in si ON mp.stock_in_id = si.id
        WHERE mp.id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      if (payment.status !== 'pending') {
        throw new Error('只有待审批状态的付款可以修改');
      }

      // 验证付款金额
      if (amount && parseFloat(amount) > parseFloat(payment.stock_in_amount)) {
        throw new Error(`付款金额不能超过入库单金额 ¥${payment.stock_in_amount}`);
      }

      // 更新付款记录
      db.prepare(`
        UPDATE material_payments
        SET amount = ?, remark = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        amount || payment.amount,
        remark !== undefined ? remark : payment.remark,
        id
      );

      return db.prepare(`
        SELECT mp.*,
               p.name as project_name,
               s.name as supplier_name,
               si.stock_in_no
        FROM material_payments mp
        LEFT JOIN projects p ON mp.project_id = p.id
        LEFT JOIN suppliers s ON mp.supplier_id = s.id
        LEFT JOIN stock_in si ON mp.stock_in_id = si.id
        WHERE mp.id = ?
      `).get(id);
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款信息更新成功',
      data: payment
    });
  } catch (error) {
    console.error('更新材料款付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '更新失败'
    });
  }
});

/**
 * POST /api/payments/material/:id/approve
 * 审批材料款付款
 */
router.post('/material/:id/approve', checkPermission('payment:approve'), (req, res) => {
  const { id } = req.params;
  const { action, comment } = req.body;
  const userId = req.user.id;

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: '审批动作无效'
    });
  }

  try {
    const transaction = db.transaction(() => {
      // 获取付款记录
      const payment = db.prepare(`
        SELECT * FROM material_payments WHERE id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      // 获取当前审批步骤
      const currentApproval = db.prepare(`
        SELECT * FROM material_payment_approvals
        WHERE payment_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (!currentApproval) {
        throw new Error('没有待审批的步骤');
      }

      // 检查用户角色是否有权限审批当前步骤
      const userRoles = req.userRoles || [];
      if (!userRoles.includes(currentApproval.role)) {
        throw new Error(`您没有权限审批此步骤（需要 ${currentApproval.role} 角色）`);
      }

      // 更新审批记录
      db.prepare(`
        UPDATE material_payment_approvals
        SET action = ?, approver_id = ?, comment = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(action, userId, comment || '', currentApproval.id);

      if (action === 'reject') {
        // 拒绝：更新付款状态为 rejected
        db.prepare(`
          UPDATE material_payments
          SET status = 'rejected', updated_at = datetime('now')
          WHERE id = ?
        `).run(id);

        return { status: 'rejected', message: '付款申请已拒绝' };
      } else {
        // 通过：检查是否还有下一步审批
        const nextApproval = db.prepare(`
          SELECT * FROM material_payment_approvals
          WHERE payment_id = ? AND step > ? AND action = 'pending'
          ORDER BY step ASC
          LIMIT 1
        `).get(id, currentApproval.step);

        if (nextApproval) {
          // 还有下一步审批
          return {
            status: 'pending',
            message: `${currentApproval.step_name}已通过，等待${nextApproval.step_name}`,
            next_step: nextApproval.step_name
          };
        } else {
          // 所有审批完成，更新付款状态为 approved
          db.prepare(`
            UPDATE material_payments
            SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).run(userId, id);

          return { status: 'approved', message: '付款申请已审批通过' };
        }
      }
    });

    const result = transaction();

    res.json({
      success: true,
      message: result.message,
      data: { status: result.status }
    });
  } catch (error) {
    console.error('审批材料款付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '审批失败'
    });
  }
});

/**
 * POST /api/payments/material/:id/pay
 * 确认支付（仅已审批通过的付款可支付）
 */
router.post('/material/:id/pay', checkPermission('payment:pay'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const transaction = db.transaction(() => {
      // 获取付款记录
      const payment = db.prepare(`
        SELECT mp.*, si.stock_in_no
        FROM material_payments mp
        LEFT JOIN stock_in si ON mp.stock_in_id = si.id
        WHERE mp.id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      if (payment.status !== 'approved') {
        throw new Error('只有已审批通过的付款可以确认支付');
      }

      if (payment.status === 'paid') {
        throw new Error('该付款已完成支付');
      }

      // 更新付款状态为已支付
      db.prepare(`
        UPDATE material_payments
        SET status = 'paid', paid_by = ?, paid_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(userId, id);

      // 更新入库单付款状态
      db.prepare(`
        UPDATE stock_in
        SET payment_status = 'paid', updated_at = datetime('now')
        WHERE id = ?
      `).run(payment.stock_in_id);

      return payment;
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款确认成功',
      data: {
        payment_id: id,
        payment_no: payment.payment_no,
        stock_in_no: payment.stock_in_no,
        amount: payment.amount,
        paid_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('确认支付失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '确认支付失败'
    });
  }
});

/**
 * DELETE /api/payments/material/:id
 * 删除材料款付款（仅待审批或已拒绝状态可删除）
 */
router.delete('/material/:id', checkPermission('payment:delete'), (req, res) => {
  const { id } = req.params;

  try {
    const transaction = db.transaction(() => {
      // 检查付款记录状态
      const payment = db.prepare(`
        SELECT * FROM material_payments WHERE id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      if (!['pending', 'rejected'].includes(payment.status)) {
        throw new Error('只有待审批或已拒绝状态的付款可以删除');
      }

      // 删除审批记录
      db.prepare(`DELETE FROM material_payment_approvals WHERE payment_id = ?`).run(id);

      // 删除付款记录
      db.prepare(`DELETE FROM material_payments WHERE id = ?`).run(id);

      return payment;
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款记录删除成功',
      data: { id: payment.id, payment_no: payment.payment_no }
    });
  } catch (error) {
    console.error('删除材料款付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '删除失败'
    });
  }
});

/**
 * GET /api/payments/material/stock-in/available
 * 获取可用于付款的入库单列表
 */
router.get('/material/stock-in/available', (req, res) => {
  const { project_id, supplier_id } = req.query;

  let sql = `
    SELECT si.*,
           p.name as project_name,
           p.project_no,
           s.name as supplier_name,
           (SELECT COUNT(*) FROM material_payments mp
            WHERE mp.stock_in_id = si.id AND mp.status IN ('pending', 'approved', 'paid')) as payment_count
    FROM stock_in si
    LEFT JOIN projects p ON si.project_id = p.id
    LEFT JOIN suppliers s ON si.supplier_id = s.id
    WHERE si.status = 'confirmed'
  `;
  const params = [];

  // 项目筛选
  if (project_id) {
    sql += ` AND si.project_id = ?`;
    params.push(project_id);
  }

  // 供应商筛选
  if (supplier_id) {
    sql += ` AND si.supplier_id = ?`;
    params.push(supplier_id);
  }

  // 只返回未付款的入库单
  sql += ` HAVING payment_count = 0`;

  sql += ` ORDER BY si.created_at DESC`;

  const stockInList = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: stockInList
  });
});

/**
 * GET /api/payments/material/pending-approvals
 * 获取待审批的材料款付款列表
 */
router.get('/material/pending-approvals', (req, res) => {
  const userId = req.user.id;
  const userRoles = req.userRoles || [];

  // 获取用户可审批的付款（基于角色）
  let sql = `
    SELECT mp.*,
           p.name as project_name,
           p.project_no,
           s.name as supplier_name,
           si.stock_in_no,
           mpa.step_name,
           mpa.step,
           u.real_name as creator_name
    FROM material_payments mp
    LEFT JOIN projects p ON mp.project_id = p.id
    LEFT JOIN suppliers s ON mp.supplier_id = s.id
    LEFT JOIN stock_in si ON mp.stock_in_id = si.id
    LEFT JOIN material_payment_approvals mpa ON mp.id = mpa.payment_id AND mpa.action = 'pending'
    LEFT JOIN users u ON mp.creator_id = u.id
    WHERE mp.status = 'pending'
  `;

  // 根据角色过滤
  if (userRoles.length > 0) {
    const rolePlaceholders = userRoles.map(() => '?').join(',');
    sql += ` AND mpa.role IN (${rolePlaceholders})`;
  }

  sql += ` ORDER BY mp.created_at DESC`;

  const payments = db.prepare(sql).all(...userRoles);

  res.json({
    success: true,
    data: payments
  });
});

/**
 * GET /api/payments/material/statistics
 * 获取材料款付款统计数据
 */
router.get('/material/statistics', (req, res) => {
  const { project_id, start_date, end_date } = req.query;

  let whereClause = '1=1';
  const params = [];

  if (project_id) {
    whereClause += ' AND project_id = ?';
    params.push(project_id);
  }

  if (start_date) {
    whereClause += ' AND created_at >= ?';
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ' AND created_at <= ?';
    params.push(end_date);
  }

  // 统计各状态数量和金额
  const stats = db.prepare(`
    SELECT
      status,
      COUNT(*) as count,
      SUM(amount) as total_amount
    FROM material_payments
    WHERE ${whereClause}
    GROUP BY status
  `).all(...params);

  // 汇总数据
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_count,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
    FROM material_payments
    WHERE ${whereClause}
  `).get(...params);

  res.json({
    success: true,
    data: {
      stats,
      summary
    }
  });
});

// ========================================
// Task 47: 人工费付款管理 API
// ========================================

/**
 * 生成人工费付款编号
 * 格式: LF + YYMMDD + 2位序号
 * 例: 2026年3月7日第1个: LF26030701
 */
function generateLaborPaymentNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const prefix = `LF${year}${month}${day}`;

  // 获取当日最大序号
  const result = db.prepare(`
    SELECT MAX(payment_no) as max_no
    FROM labor_payments
    WHERE payment_no LIKE ?
  `).get(`${prefix}%`);

  let seq = 1;
  if (result && result.max_no) {
    const lastSeq = parseInt(result.max_no.slice(-2));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }

  return `${prefix}${seq.toString().padStart(2, '0')}`;
}

/**
 * GET /api/payments/labor
 * 获取人工费付款列表
 * 查询参数: keyword, status, projectId, statementId, page, pageSize
 */
router.get('/labor', (req, res) => {
  const { keyword, status, projectId, statementId, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT lp.*,
           p.name as project_name,
           p.project_no,
           is.statement_no,
           is.period_start,
           is.period_end,
           is.confirmed_amount as statement_confirmed_amount,
           u.real_name as creator_name,
           au.real_name as approver_name,
           pu.real_name as payer_name
    FROM labor_payments lp
    LEFT JOIN projects p ON lp.project_id = p.id
    LEFT JOIN income_statements is ON lp.statement_id = is.id
    LEFT JOIN users u ON lp.creator_id = u.id
    LEFT JOIN users au ON lp.approved_by = au.id
    LEFT JOIN users pu ON lp.paid_by = pu.id
    WHERE 1=1
  `;
  const params = [];

  // 关键词搜索
  if (keyword) {
    sql += ` AND (lp.payment_no LIKE ? OR p.name LIKE ? OR lp.payee_name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND lp.status = ?`;
    params.push(status);
  }

  // 项目筛选
  if (projectId) {
    sql += ` AND lp.project_id = ?`;
    params.push(projectId);
  }

  // 对账单筛选
  if (statementId) {
    sql += ` AND lp.statement_id = ?`;
    params.push(statementId);
  }

  // 获取总数
  const countSql = sql.replace(
    /SELECT lp\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;

  // 排序和分页
  sql += ` ORDER BY lp.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const payments = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: payments,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/payments/labor/:id
 * 获取人工费付款详情
 */
router.get('/labor/:id', (req, res) => {
  const { id } = req.params;

  const payment = db.prepare(`
    SELECT lp.*,
           p.name as project_name,
           p.project_no,
           is.statement_no,
           is.period_start,
           is.period_end,
           is.confirmed_amount as statement_confirmed_amount,
           is.progress_amount,
           is.progress_rate,
           u.real_name as creator_name,
           au.real_name as approver_name,
           pu.real_name as payer_name
    FROM labor_payments lp
    LEFT JOIN projects p ON lp.project_id = p.id
    LEFT JOIN income_statements is ON lp.statement_id = is.id
    LEFT JOIN users u ON lp.creator_id = u.id
    LEFT JOIN users au ON lp.approved_by = au.id
    LEFT JOIN users pu ON lp.paid_by = pu.id
    WHERE lp.id = ?
  `).get(id);

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: '付款记录不存在'
    });
  }

  // 获取审批记录
  const approvals = db.prepare(`
    SELECT lpa.*, u.real_name as approver_name
    FROM labor_payment_approvals lpa
    LEFT JOIN users u ON lpa.approver_id = u.id
    WHERE lpa.payment_id = ?
    ORDER BY lpa.step ASC
  `).all(id);

  // 获取对账单的劳务金额和已付款金额
  const statementInfo = db.prepare(`
    SELECT 
      is.confirmed_amount,
      (SELECT COALESCE(SUM(amount), 0) FROM labor_payments 
       WHERE statement_id = is.id AND status IN ('pending', 'approved', 'paid')) as paid_amount
    FROM income_statements is
    WHERE is.id = ?
  `).get(payment.statement_id);

  // 劳务金额 = 确认金额的30%（可根据业务调整）
  const laborAmount = statementInfo ? parseFloat(statementInfo.confirmed_amount) * 0.3 : 0;
  const paidAmount = statementInfo ? parseFloat(statementInfo.paid_amount) : 0;

  res.json({
    success: true,
    data: {
      ...payment,
      laborAmount,
      paidAmount,
      approvals
    }
  });
});

/**
 * GET /api/payments/labor/statement/:statementId/info
 * 获取对账单的劳务金额信息
 */
router.get('/labor/statement/:statementId/info', (req, res) => {
  const { statementId } = req.params;

  const statement = db.prepare(`
    SELECT 
      is.*,
      p.name as project_name
    FROM income_statements is
    LEFT JOIN projects p ON is.project_id = p.id
    WHERE is.id = ? AND is.status = 'confirmed'
  `).get(statementId);

  if (!statement) {
    return res.status(404).json({
      success: false,
      message: '对账单不存在或未确认'
    });
  }

  // 劳务金额 = 确认金额的30%（可根据业务调整）
  const laborAmount = parseFloat(statement.confirmed_amount) * 0.3;

  // 已付款金额
  const paidResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as paid_amount
    FROM labor_payments
    WHERE statement_id = ? AND status IN ('pending', 'approved', 'paid')
  `).get(statementId);
  const paidAmount = parseFloat(paidResult.paid_amount);

  // 剩余可付金额
  const remainingAmount = Math.max(0, laborAmount - paidAmount);

  res.json({
    success: true,
    data: {
      statementId: statement.id,
      statementNo: statement.statement_no,
      projectId: statement.project_id,
      projectName: statement.project_name,
      confirmedAmount: statement.confirmed_amount,
      laborAmount,
      paidAmount,
      remainingAmount
    }
  });
});

/**
 * POST /api/payments/labor
 * 创建人工费付款
 */
router.post('/labor', checkPermission('payment:create'), (req, res) => {
  const {
    statementId,
    projectId,
    amount,
    payeeName,
    payeeAccount,
    bankName,
    remark
  } = req.body;

  // 验证必填字段
  if (!statementId) {
    return res.status(400).json({
      success: false,
      message: '对账单ID不能为空'
    });
  }

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: '项目ID不能为空'
    });
  }

  if (!payeeName) {
    return res.status(400).json({
      success: false,
      message: '收款人姓名不能为空'
    });
  }

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: '付款金额必须大于0'
    });
  }

  const userId = req.user.id;

  try {
    const transaction = db.transaction(() => {
      // 检查对账单是否存在且已确认
      const statement = db.prepare(`
        SELECT * FROM income_statements WHERE id = ? AND status = 'confirmed'
      `).get(statementId);

      if (!statement) {
        throw new Error('对账单不存在或未确认');
      }

      // 计算劳务金额（确认金额的30%）
      const laborAmount = parseFloat(statement.confirmed_amount) * 0.3;

      // 获取已付款金额
      const paidResult = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as paid_amount
        FROM labor_payments
        WHERE statement_id = ? AND status IN ('pending', 'approved', 'paid')
      `).get(statementId);
      const paidAmount = parseFloat(paidResult.paid_amount);

      // 检查付款金额是否超过剩余可付金额
      const remainingAmount = laborAmount - paidAmount;
      if (parseFloat(amount) > remainingAmount) {
        throw new Error(`付款金额不能超过剩余可付金额 ¥${remainingAmount.toFixed(2)}`);
      }

      const paymentNo = generateLaborPaymentNo();

      // 插入付款记录
      const result = db.prepare(`
        INSERT INTO labor_payments (
          payment_no, statement_id, project_id, amount,
          payee_name, payee_account, bank_name,
          status, remark, creator_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
      `).run(
        paymentNo,
        statementId,
        projectId,
        amount,
        payeeName,
        payeeAccount || '',
        bankName || '',
        remark || '',
        userId
      );

      const paymentId = result.lastInsertRowid;

      // 创建审批流程记录
      // 步骤1: 财务审批
      db.prepare(`
        INSERT INTO labor_payment_approvals (
          payment_id, step, step_name, role, action, created_at, updated_at
        ) VALUES (?, 1, '财务审批', 'FINANCE', 'pending', datetime('now'), datetime('now'))
      `).run(paymentId);

      // 步骤2: 总经理审批
      db.prepare(`
        INSERT INTO labor_payment_approvals (
          payment_id, step, step_name, role, action, created_at, updated_at
        ) VALUES (?, 2, '总经理审批', 'GM', 'pending', datetime('now'), datetime('now'))
      `).run(paymentId);

      // 获取完整记录
      const payment = db.prepare(`
        SELECT lp.*,
               p.name as project_name,
               is.statement_no
        FROM labor_payments lp
        LEFT JOIN projects p ON lp.project_id = p.id
        LEFT JOIN income_statements is ON lp.statement_id = is.id
        WHERE lp.id = ?
      `).get(paymentId);

      return payment;
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款申请创建成功',
      data: payment
    });
  } catch (error) {
    console.error('创建人工费付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '创建付款申请失败'
    });
  }
});

/**
 * PUT /api/payments/labor/:id
 * 更新人工费付款（仅待审批状态可更新）
 */
router.put('/labor/:id', checkPermission('payment:edit'), (req, res) => {
  const { id } = req.params;
  const { amount, payeeName, payeeAccount, bankName, remark } = req.body;

  try {
    const transaction = db.transaction(() => {
      // 检查付款记录状态
      const payment = db.prepare(`
        SELECT lp.*, is.confirmed_amount as statement_confirmed_amount
        FROM labor_payments lp
        LEFT JOIN income_statements is ON lp.statement_id = is.id
        WHERE lp.id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      if (payment.status !== 'pending') {
        throw new Error('只有待审批状态的付款可以修改');
      }

      // 验证付款金额
      if (amount) {
        const laborAmount = parseFloat(payment.statement_confirmed_amount) * 0.3;
        
        // 获取已付款金额（不包含当前记录）
        const paidResult = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as paid_amount
          FROM labor_payments
          WHERE statement_id = ? AND status IN ('pending', 'approved', 'paid') AND id != ?
        `).get(payment.statement_id, id);
        const paidAmount = parseFloat(paidResult.paid_amount);
        const remainingAmount = laborAmount - paidAmount;

        if (parseFloat(amount) > remainingAmount) {
          throw new Error(`付款金额不能超过剩余可付金额 ¥${remainingAmount.toFixed(2)}`);
        }
      }

      // 更新付款记录
      db.prepare(`
        UPDATE labor_payments
        SET amount = ?, payee_name = ?, payee_account = ?, bank_name = ?, remark = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        amount || payment.amount,
        payeeName || payment.payee_name,
        payeeAccount !== undefined ? payeeAccount : payment.payee_account,
        bankName !== undefined ? bankName : payment.bank_name,
        remark !== undefined ? remark : payment.remark,
        id
      );

      return db.prepare(`
        SELECT lp.*,
               p.name as project_name,
               is.statement_no
        FROM labor_payments lp
        LEFT JOIN projects p ON lp.project_id = p.id
        LEFT JOIN income_statements is ON lp.statement_id = is.id
        WHERE lp.id = ?
      `).get(id);
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款信息更新成功',
      data: payment
    });
  } catch (error) {
    console.error('更新人工费付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '更新失败'
    });
  }
});

/**
 * POST /api/payments/labor/:id/approve
 * 审批人工费付款
 */
router.post('/labor/:id/approve', checkPermission('payment:approve'), (req, res) => {
  const { id } = req.params;
  const { action, comment } = req.body;
  const userId = req.user.id;

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: '审批动作无效'
    });
  }

  try {
    const transaction = db.transaction(() => {
      // 获取付款记录
      const payment = db.prepare(`
        SELECT * FROM labor_payments WHERE id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      // 获取当前审批步骤
      const currentApproval = db.prepare(`
        SELECT * FROM labor_payment_approvals
        WHERE payment_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (!currentApproval) {
        throw new Error('没有待审批的步骤');
      }

      // 检查用户角色是否有权限审批当前步骤
      const userRoles = req.userRoles || [];
      if (!userRoles.includes(currentApproval.role)) {
        throw new Error(`您没有权限审批此步骤（需要 ${currentApproval.role} 角色）`);
      }

      // 更新审批记录
      db.prepare(`
        UPDATE labor_payment_approvals
        SET action = ?, approver_id = ?, comment = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(action, userId, comment || '', currentApproval.id);

      if (action === 'reject') {
        // 拒绝：更新付款状态为 rejected
        db.prepare(`
          UPDATE labor_payments
          SET status = 'rejected', updated_at = datetime('now')
          WHERE id = ?
        `).run(id);

        return { status: 'rejected', message: '付款申请已拒绝' };
      } else {
        // 通过：检查是否还有下一步审批
        const nextApproval = db.prepare(`
          SELECT * FROM labor_payment_approvals
          WHERE payment_id = ? AND step > ? AND action = 'pending'
          ORDER BY step ASC
          LIMIT 1
        `).get(id, currentApproval.step);

        if (nextApproval) {
          // 还有下一步审批
          return {
            status: 'pending',
            message: `${currentApproval.step_name}已通过，等待${nextApproval.step_name}`,
            next_step: nextApproval.step_name
          };
        } else {
          // 所有审批完成，更新付款状态为 approved
          db.prepare(`
            UPDATE labor_payments
            SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
          `).run(userId, id);

          return { status: 'approved', message: '付款申请已审批通过' };
        }
      }
    });

    const result = transaction();

    res.json({
      success: true,
      message: result.message,
      data: { status: result.status }
    });
  } catch (error) {
    console.error('审批人工费付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '审批失败'
    });
  }
});

/**
 * POST /api/payments/labor/:id/pay
 * 确认支付（仅已审批通过的付款可支付）
 */
router.post('/labor/:id/pay', checkPermission('payment:pay'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const transaction = db.transaction(() => {
      // 获取付款记录
      const payment = db.prepare(`
        SELECT lp.*, is.statement_no
        FROM labor_payments lp
        LEFT JOIN income_statements is ON lp.statement_id = is.id
        WHERE lp.id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      if (payment.status !== 'approved') {
        throw new Error('只有已审批通过的付款可以确认支付');
      }

      if (payment.status === 'paid') {
        throw new Error('该付款已完成支付');
      }

      // 更新付款状态为已支付
      db.prepare(`
        UPDATE labor_payments
        SET status = 'paid', paid_by = ?, paid_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(userId, id);

      return payment;
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款确认成功',
      data: {
        payment_id: id,
        payment_no: payment.payment_no,
        statement_no: payment.statement_no,
        amount: payment.amount,
        paid_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('确认支付失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '确认支付失败'
    });
  }
});

/**
 * DELETE /api/payments/labor/:id
 * 删除人工费付款（仅待审批或已拒绝状态可删除）
 */
router.delete('/labor/:id', checkPermission('payment:delete'), (req, res) => {
  const { id } = req.params;

  try {
    const transaction = db.transaction(() => {
      // 检查付款记录状态
      const payment = db.prepare(`
        SELECT * FROM labor_payments WHERE id = ?
      `).get(id);

      if (!payment) {
        throw new Error('付款记录不存在');
      }

      if (!['pending', 'rejected'].includes(payment.status)) {
        throw new Error('只有待审批或已拒绝状态的付款可以删除');
      }

      // 删除审批记录
      db.prepare(`DELETE FROM labor_payment_approvals WHERE payment_id = ?`).run(id);

      // 删除付款记录
      db.prepare(`DELETE FROM labor_payments WHERE id = ?`).run(id);

      return payment;
    });

    const payment = transaction();

    res.json({
      success: true,
      message: '付款记录删除成功',
      data: { id: payment.id, payment_no: payment.payment_no }
    });
  } catch (error) {
    console.error('删除人工费付款失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '删除失败'
    });
  }
});

/**
 * GET /api/payments/labor/statements/available
 * 获取可用于付款的对账单列表（已确认状态）
 */
router.get('/labor/statements/available', (req, res) => {
  const { project_id } = req.query;

  let sql = `
    SELECT 
      is.*,
      p.name as project_name,
      p.project_no,
      (SELECT COALESCE(SUM(amount), 0) FROM labor_payments 
       WHERE statement_id = is.id AND status IN ('pending', 'approved', 'paid')) as paid_amount
    FROM income_statements is
    LEFT JOIN projects p ON is.project_id = p.id
    WHERE is.status = 'confirmed'
  `;
  const params = [];

  // 项目筛选
  if (project_id) {
    sql += ` AND is.project_id = ?`;
    params.push(project_id);
  }

  sql += ` ORDER BY is.created_at DESC`;

  const statements = db.prepare(sql).all(...params);

  // 计算劳务金额和剩余可付金额
  const result = statements.map(s => ({
    ...s,
    laborAmount: parseFloat(s.confirmed_amount) * 0.3,
    remainingAmount: Math.max(0, parseFloat(s.confirmed_amount) * 0.3 - parseFloat(s.paid_amount))
  }));

  res.json({
    success: true,
    data: result
  });
});

/**
 * GET /api/payments/labor/pending-approvals
 * 获取待审批的人工费付款列表
 */
router.get('/labor/pending-approvals', (req, res) => {
  const userId = req.user.id;
  const userRoles = req.userRoles || [];

  // 获取用户可审批的付款（基于角色）
  let sql = `
    SELECT lp.*,
           p.name as project_name,
           p.project_no,
           is.statement_no,
           lpa.step_name,
           lpa.step,
           u.real_name as creator_name
    FROM labor_payments lp
    LEFT JOIN projects p ON lp.project_id = p.id
    LEFT JOIN income_statements is ON lp.statement_id = is.id
    LEFT JOIN labor_payment_approvals lpa ON lp.id = lpa.payment_id AND lpa.action = 'pending'
    LEFT JOIN users u ON lp.creator_id = u.id
    WHERE lp.status = 'pending'
  `;

  // 根据角色过滤
  if (userRoles.length > 0) {
    const rolePlaceholders = userRoles.map(() => '?').join(',');
    sql += ` AND lpa.role IN (${rolePlaceholders})`;
  }

  sql += ` ORDER BY lp.created_at DESC`;

  const payments = db.prepare(sql).all(...userRoles);

  res.json({
    success: true,
    data: payments
  });
});

/**
 * GET /api/payments/labor/statistics
 * 获取人工费付款统计数据
 */
router.get('/labor/statistics', (req, res) => {
  const { project_id, start_date, end_date } = req.query;

  let whereClause = '1=1';
  const params = [];

  if (project_id) {
    whereClause += ' AND project_id = ?';
    params.push(project_id);
  }

  if (start_date) {
    whereClause += ' AND created_at >= ?';
    params.push(start_date);
  }

  if (end_date) {
    whereClause += ' AND created_at <= ?';
    params.push(end_date);
  }

  // 统计各状态数量和金额
  const stats = db.prepare(`
    SELECT
      status,
      COUNT(*) as count,
      SUM(amount) as total_amount
    FROM labor_payments
    WHERE ${whereClause}
    GROUP BY status
  `).all(...params);

  // 汇总数据
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_count,
      SUM(amount) as total_amount,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
      SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
    FROM labor_payments
    WHERE ${whereClause}
  `).get(...params);

  res.json({
    success: true,
    data: {
      stats,
      summary
    }
  });
});

module.exports = router;
