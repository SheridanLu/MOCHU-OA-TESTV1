/**
 * 零星采购路由
 * Task 32: 实现零星采购预警 - 超批量采购总额1.5%预警
 * 
 * 编号规则：
 * - 零星采购编号: LX + YYMM + 3位序号 (如: LX250301)
 * - 序号每月重置
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有零星采购路由附加权限信息
router.use(authMiddleware, attachPermissions);

// ========================================
// 工具函数
// ========================================

/**
 * 生成零星采购编号
 * 格式: LX + YYMM + 3位序号
 * 例: LX250301
 */
function generateZeroPurchaseNo() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `LX${year}${month}`;
  
  // 查询当月已有编号数量
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM zero_purchases 
    WHERE purchase_no LIKE ?
  `).get(`${prefix}%`);
  
  const seq = String((result?.count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/**
 * 获取月度统计信息
 */
function getMonthlyStats() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startOfMonth = `${yearMonth}-01`;
  
  // 获取本月零星采购总额
  const zeroPurchaseTotal = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM zero_purchases
    WHERE DATE(created_at) >= ?
      AND status != 'cancelled'
  `).get(startOfMonth);
  
  // 获取本月批量采购总额（从支出合同获取）
  const batchTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM contracts
    WHERE type = 'expense'
      AND DATE(created_at) >= ?
      AND status != 'cancelled'
      AND status != 'rejected'
  `).get(startOfMonth);
  
  const batchTotalAmount = batchTotal?.total || 0;
  const zeroPurchaseAmount = zeroPurchaseTotal?.total || 0;
  const limitAmount = batchTotalAmount * 0.015; // 1.5%
  const percentage = batchTotalAmount > 0 ? (zeroPurchaseAmount / batchTotalAmount) * 100 : 0;
  const isExcessive = percentage > 1.5;
  
  return {
    yearMonth,
    batchTotalAmount,
    zeroPurchaseAmount,
    limitAmount,
    percentage: parseFloat(percentage.toFixed(2)),
    isExcessive,
    totalAmount: zeroPurchaseAmount
  };
}

/**
 * 检查价格预警
 */
function checkPriceWarning(materialName, specification, unitPrice) {
  // 查找基准价
  const basePrice = db.prepare(`
    SELECT * FROM material_base_prices
    WHERE material_name = ?
      AND (specification = ? OR ? IS NULL OR specification IS NULL)
      AND status = 'active'
      AND (expiry_date IS NULL OR expiry_date >= date('now'))
    ORDER BY effective_date DESC
    LIMIT 1
  `).get(materialName, specification, specification);
  
  if (!basePrice) {
    return { hasWarning: false, basePrice: null };
  }
  
  if (unitPrice > basePrice.base_price) {
    const overageAmount = unitPrice - basePrice.base_price;
    const overagePercent = (overageAmount / basePrice.base_price * 100).toFixed(2);
    
    let warningLevel = 'warning';
    if (overagePercent >= 20) {
      warningLevel = 'danger';
    }
    
    return {
      hasWarning: true,
      basePrice: basePrice.base_price,
      overageAmount: parseFloat(overageAmount.toFixed(2)),
      overagePercent: parseFloat(overagePercent),
      warningLevel
    };
  }
  
  return { hasWarning: false, basePrice: basePrice.base_price };
}

// ========================================
// API 路由
// ========================================

/**
 * GET /api/zero-purchases
 * 获取零星采购列表
 */
router.get('/', (req, res) => {
  const { keyword, status, warningLevel, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT zp.*, s.name as supplier_name, u.real_name as creator_name
    FROM zero_purchases zp
    LEFT JOIN suppliers s ON zp.supplier_id = s.id
    LEFT JOIN users u ON zp.creator_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (keyword) {
    sql += ` AND (zp.purchase_no LIKE ? OR zp.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  if (status) {
    sql += ` AND zp.status = ?`;
    params.push(status);
  }
  
  if (warningLevel) {
    sql += ` AND zp.warning_level = ?`;
    params.push(warningLevel);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT zp\.\*, s\.name as supplier_name, u\.real_name as creator_name/,
    'SELECT COUNT(*) as total'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult?.total || 0;
  
  // 获取列表数据
  sql += ` ORDER BY zp.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const purchases = db.prepare(sql).all(...params);
  
  // 获取每个采购的清单数量
  purchases.forEach(purchase => {
    const itemCount = db.prepare(`
      SELECT COUNT(*) as count FROM zero_purchase_items WHERE purchase_id = ?
    `).get(purchase.id);
    purchase.item_count = itemCount?.count || 0;
  });
  
  res.json({
    success: true,
    data: purchases,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    },
    monthlyStats: getMonthlyStats()
  });
});

/**
 * GET /api/zero-purchases/:id
 * 获取零星采购详情
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const purchase = db.prepare(`
    SELECT zp.*, s.name as supplier_name, u.real_name as creator_name
    FROM zero_purchases zp
    LEFT JOIN suppliers s ON zp.supplier_id = s.id
    LEFT JOIN users u ON zp.creator_id = u.id
    WHERE zp.id = ?
  `).get(id);
  
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }
  
  // 获取采购清单
  const items = db.prepare(`
    SELECT * FROM zero_purchase_items WHERE purchase_id = ?
  `).all(id);
  
  purchase.items = items;
  purchase.item_count = items.length;
  
  res.json({
    success: true,
    data: purchase
  });
});

/**
 * GET /api/zero-purchases/:id/items
 * 获取零星采购清单
 */
router.get('/:id/items', (req, res) => {
  const { id } = req.params;
  
  const items = db.prepare(`
    SELECT * FROM zero_purchase_items WHERE purchase_id = ? ORDER BY id ASC
  `).all(id);
  
  res.json({
    success: true,
    data: items
  });
});

/**
 * POST /api/zero-purchases/check-excessive
 * 检查是否超出月度1.5%限额
 */
router.post('/check-excessive', (req, res) => {
  const { amount, items } = req.body;
  
  const stats = getMonthlyStats();
  const newTotal = stats.zeroPurchaseAmount + (amount || 0);
  const newPercentage = stats.batchTotalAmount > 0 
    ? (newTotal / stats.batchTotalAmount) * 100 
    : 0;
  
  res.json({
    success: true,
    data: {
      isExcessive: newPercentage > 1.5,
      currentAmount: amount || 0,
      usedAmount: stats.zeroPurchaseAmount,
      batchTotalAmount: stats.batchTotalAmount,
      limitAmount: stats.limitAmount,
      newPercentage: parseFloat(newPercentage.toFixed(2))
    }
  });
});

/**
 * POST /api/zero-purchases
 * 创建零星采购
 */
router.post('/', checkPermission('material:create'), (req, res) => {
  const {
    name,
    supplier_id,
    items,
    total_amount,
    remarks,
    is_excessive,
    is_legal_review
  } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: '采购名称不能为空'
    });
  }
  
  if (!items || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '采购清单不能为空'
    });
  }
  
  const userId = req.user.id;
  const purchaseNo = generateZeroPurchaseNo();
  
  try {
    const transaction = db.transaction(() => {
      // 检查价格预警
      let priceWarningCount = 0;
      let maxWarningLevel = 'none';
      
      items.forEach(item => {
        const warning = checkPriceWarning(item.material_name, item.specification, item.unit_price);
        item.has_warning = warning.hasWarning ? 1 : 0;
        item.warning_level = warning.hasWarning ? warning.warningLevel : 'none';
        item.base_price = warning.basePrice;
        
        if (warning.hasWarning) {
          priceWarningCount++;
          if (warning.warningLevel === 'danger' || maxWarningLevel === 'none') {
            maxWarningLevel = warning.warningLevel;
          }
        }
      });
      
      // 确定预警级别
      let warningLevel = 'none';
      if (is_excessive) {
        warningLevel = 'excessive';
      } else if (priceWarningCount > 0) {
        warningLevel = maxWarningLevel;
      }
      
      // 插入主表
      const result = db.prepare(`
        INSERT INTO zero_purchases (
          purchase_no, name, supplier_id, total_amount, 
          status, warning_level, price_warning_count, 
          is_excessive, is_legal_review, remarks, creator_id
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
      `).run(
        purchaseNo, name.trim(), supplier_id || null, total_amount || 0,
        warningLevel, priceWarningCount,
        is_excessive ? 1 : 0, is_legal_review ? 1 : 0, remarks || null, userId
      );
      
      const purchaseId = result.lastInsertRowid;
      
      // 插入明细
      const insertItem = db.prepare(`
        INSERT INTO zero_purchase_items (
          purchase_id, material_name, specification, unit, 
          quantity, unit_price, base_price, total_price,
          has_warning, warning_level, remarks
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      items.forEach(item => {
        insertItem.run(
          purchaseId,
          item.material_name,
          item.specification || null,
          item.unit || null,
          item.quantity,
          item.unit_price,
          item.base_price || null,
          item.quantity * item.unit_price,
          item.has_warning || 0,
          item.warning_level || 'none',
          item.remarks || null
        );
      });
      
      return purchaseId;
    });
    
    const purchaseId = transaction();
    
    const newPurchase = db.prepare(`
      SELECT zp.*, s.name as supplier_name, u.real_name as creator_name
      FROM zero_purchases zp
      LEFT JOIN suppliers s ON zp.supplier_id = s.id
      LEFT JOIN users u ON zp.creator_id = u.id
      WHERE zp.id = ?
    `).get(purchaseId);
    
    res.json({
      success: true,
      message: '零星采购创建成功',
      data: newPurchase
    });
  } catch (error) {
    console.error('创建零星采购失败:', error);
    res.status(500).json({
      success: false,
      message: '创建零星采购失败: ' + error.message
    });
  }
});

/**
 * PUT /api/zero-purchases/:id
 * 更新零星采购
 */
router.put('/:id', checkPermission('material:edit'), (req, res) => {
  const { id } = req.params;
  const { name, supplier_id, items, remarks } = req.body;
  
  const purchase = db.prepare('SELECT * FROM zero_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }
  
  if (purchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只能编辑草稿状态的采购'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 更新主表
      db.prepare(`
        UPDATE zero_purchases SET
          name = COALESCE(?, name),
          supplier_id = COALESCE(?, supplier_id),
          remarks = COALESCE(?, remarks),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, supplier_id, remarks, id);
      
      // 如果有更新明细，重新处理
      if (items && items.length > 0) {
        // 删除原有明细
        db.prepare('DELETE FROM zero_purchase_items WHERE purchase_id = ?').run(id);
        
        // 检查价格预警
        let priceWarningCount = 0;
        let maxWarningLevel = 'none';
        let totalAmount = 0;
        
        items.forEach(item => {
          const warning = checkPriceWarning(item.material_name, item.specification, item.unit_price);
          item.has_warning = warning.hasWarning ? 1 : 0;
          item.warning_level = warning.hasWarning ? warning.warningLevel : 'none';
          item.base_price = warning.basePrice;
          
          if (warning.hasWarning) {
            priceWarningCount++;
            if (warning.warningLevel === 'danger' || maxWarningLevel === 'none') {
              maxWarningLevel = warning.warningLevel;
            }
          }
          
          totalAmount += item.quantity * item.unit_price;
        });
        
        // 插入新明细
        const insertItem = db.prepare(`
          INSERT INTO zero_purchase_items (
            purchase_id, material_name, specification, unit, 
            quantity, unit_price, base_price, total_price,
            has_warning, warning_level, remarks
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        items.forEach(item => {
          insertItem.run(
            id,
            item.material_name,
            item.specification || null,
            item.unit || null,
            item.quantity,
            item.unit_price,
            item.base_price || null,
            item.quantity * item.unit_price,
            item.has_warning || 0,
            item.warning_level || 'none',
            item.remarks || null
          );
        });
        
        // 更新主表统计
        let warningLevel = 'none';
        if (purchase.is_excessive) {
          warningLevel = 'excessive';
        } else if (priceWarningCount > 0) {
          warningLevel = maxWarningLevel;
        }
        
        db.prepare(`
          UPDATE zero_purchases SET
            total_amount = ?,
            price_warning_count = ?,
            warning_level = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalAmount, priceWarningCount, warningLevel, id);
      }
    });
    
    transaction();
    
    const updatedPurchase = db.prepare(`
      SELECT zp.*, s.name as supplier_name, u.real_name as creator_name
      FROM zero_purchases zp
      LEFT JOIN suppliers s ON zp.supplier_id = s.id
      LEFT JOIN users u ON zp.creator_id = u.id
      WHERE zp.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '更新成功',
      data: updatedPurchase
    });
  } catch (error) {
    console.error('更新零星采购失败:', error);
    res.status(500).json({
      success: false,
      message: '更新零星采购失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/zero-purchases/:id
 * 删除零星采购
 */
router.delete('/:id', checkPermission('material:delete'), (req, res) => {
  const { id } = req.params;
  
  const purchase = db.prepare('SELECT * FROM zero_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }
  
  if (purchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只能删除草稿状态的采购'
    });
  }
  
  try {
    // 删除明细
    db.prepare('DELETE FROM zero_purchase_items WHERE purchase_id = ?').run(id);
    // 删除主表
    db.prepare('DELETE FROM zero_purchases WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除零星采购失败:', error);
    res.status(500).json({
      success: false,
      message: '删除零星采购失败: ' + error.message
    });
  }
});

/**
 * POST /api/zero-purchases/batch-delete
 * 批量删除零星采购
 */
router.post('/batch-delete', checkPermission('material:delete'), (req, res) => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请选择要删除的记录'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      let deletedCount = 0;
      
      ids.forEach(id => {
        const purchase = db.prepare('SELECT * FROM zero_purchases WHERE id = ?').get(id);
        if (purchase && purchase.status === 'draft') {
          db.prepare('DELETE FROM zero_purchase_items WHERE purchase_id = ?').run(id);
          db.prepare('DELETE FROM zero_purchases WHERE id = ?').run(id);
          deletedCount++;
        }
      });
      
      return deletedCount;
    });
    
    const deletedCount = transaction();
    
    res.json({
      success: true,
      message: `成功删除 ${deletedCount} 条记录`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('批量删除失败:', error);
    res.status(500).json({
      success: false,
      message: '批量删除失败: ' + error.message
    });
  }
});

/**
 * POST /api/zero-purchases/:id/submit
 * 提交审批
 */
router.post('/:id/submit', checkPermission('material:create'), (req, res) => {
  const { id } = req.params;
  
  const purchase = db.prepare('SELECT * FROM zero_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }
  
  if (purchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只能提交草稿状态的采购'
    });
  }
  
  const userId = req.user.id;
  
  try {
    const transaction = db.transaction(() => {
      // 更新状态为待审批
      db.prepare(`
        UPDATE zero_purchases SET
          status = 'pending',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
      
      // 创建审批记录
      // 步骤1: 财务审批（如果超1.5%或价格预警，先预算员审批）
      let steps = [];
      
      if (purchase.is_excessive || purchase.warning_level === 'excessive') {
        steps.push({ step: 1, step_name: '超量校验', role: 'BUDGET' });
        steps.push({ step: 2, step_name: '财务审批', role: 'FINANCE' });
        steps.push({ step: 3, step_name: '法务审批', role: 'LEGAL' });
        steps.push({ step: 4, step_name: '总经理审批', role: 'GM' });
      } else if (purchase.price_warning_count > 0) {
        steps.push({ step: 1, step_name: '财务审批', role: 'FINANCE' });
        steps.push({ step: 2, step_name: '法务审批', role: 'LEGAL' });
        steps.push({ step: 3, step_name: '总经理审批', role: 'GM' });
      } else {
        steps.push({ step: 1, step_name: '财务审批', role: 'FINANCE' });
        steps.push({ step: 2, step_name: '总经理审批', role: 'GM' });
      }
      
      const insertApproval = db.prepare(`
        INSERT INTO zero_purchase_approvals (
          purchase_id, step, step_name, role, action
        ) VALUES (?, ?, ?, ?, 'pending')
      `);
      
      steps.forEach(s => {
        insertApproval.run(id, s.step, s.step_name, s.role);
      });
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '提交审批成功'
    });
  } catch (error) {
    console.error('提交审批失败:', error);
    res.status(500).json({
      success: false,
      message: '提交审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/zero-purchases/:id/approve
 * 审批通过
 */
router.post('/:id/approve', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  
  const purchase = db.prepare('SELECT * FROM zero_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }
  
  if (purchase.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只能审批待审批状态的采购'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 获取当前待审批步骤
      const currentApproval = db.prepare(`
        SELECT * FROM zero_purchase_approvals
        WHERE purchase_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);
      
      if (!currentApproval) {
        throw new Error('没有待审批的步骤');
      }
      
      // 更新当前步骤为已通过
      db.prepare(`
        UPDATE zero_purchase_approvals SET
          action = 'approve',
          approver_id = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentApproval.id);
      
      // 检查是否还有后续步骤
      const nextApproval = db.prepare(`
        SELECT * FROM zero_purchase_approvals
        WHERE purchase_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);
      
      if (!nextApproval) {
        // 所有步骤完成，更新为已通过
        db.prepare(`
          UPDATE zero_purchases SET
            status = 'approved',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);
      }
    });
    
    transaction();
    
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
 * POST /api/zero-purchases/:id/reject
 * 审批拒绝
 */
router.post('/:id/reject', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  
  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }
  
  const purchase = db.prepare('SELECT * FROM zero_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }
  
  if (purchase.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只能审批待审批状态的采购'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 获取当前待审批步骤
      const currentApproval = db.prepare(`
        SELECT * FROM zero_purchase_approvals
        WHERE purchase_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);
      
      if (currentApproval) {
        // 更新当前步骤为已拒绝
        db.prepare(`
          UPDATE zero_purchase_approvals SET
            action = 'reject',
            approver_id = ?,
            comment = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, comment, currentApproval.id);
      }
      
      // 更新主表状态为已拒绝
      db.prepare(`
        UPDATE zero_purchases SET
          status = 'rejected',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
    });
    
    transaction();
    
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
 * GET /api/zero-purchases/monthly-stats
 * 获取月度统计
 */
router.get('/monthly-stats', (req, res) => {
  const stats = getMonthlyStats();
  
  res.json({
    success: true,
    data: stats
  });
});

module.exports = router;
