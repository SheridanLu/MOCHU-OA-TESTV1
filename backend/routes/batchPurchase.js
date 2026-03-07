/**
 * 批量采购路由
 * 实现依据合同的批量采购功能
 * 
 * Task 35: 批量采购
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有路由附加权限信息
router.use(authMiddleware, attachPermissions);

/**
 * 生成批量采购编号
 * 格式: BP + YYMM + 3位序号
 */
function generateBatchNo() {
  const now = new Date();
  const yearMonth = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // 获取当月最大序号
  const result = db.prepare(`
    SELECT MAX(CAST(SUBSTR(batch_no, 7) AS INTEGER)) as max_seq
    FROM batch_purchases
    WHERE batch_no LIKE ?
  `).get(`BP${yearMonth}%`);
  
  const seq = (result?.max_seq || 0) + 1;
  return `BP${yearMonth}${String(seq).padStart(3, '0')}`;
}

/**
 * GET /api/purchase/batch
 * 获取批量采购列表
 * 查询参数: status, project_id, keyword, page, pageSize
 */
router.get('/batch', (req, res) => {
  const { status, project_id, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT bp.*, 
           p.name as project_name, p.project_no,
           c.contract_no, c.name as contract_name,
           s.name as supplier_name,
           u.real_name as creator_name
    FROM batch_purchases bp
    LEFT JOIN projects p ON bp.project_id = p.id
    LEFT JOIN contracts c ON bp.contract_id = c.id
    LEFT JOIN suppliers s ON c.supplier_id = s.id
    LEFT JOIN users u ON bp.creator_id = u.id
    WHERE 1=1
  `;
  const params = [];

  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND bp.status = ?`;
    params.push(status);
  }

  // 项目筛选
  if (project_id) {
    sql += ` AND bp.project_id = ?`;
    params.push(project_id);
  }

  // 关键词搜索
  if (keyword) {
    sql += ` AND (bp.batch_no LIKE ? OR c.name LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total
    FROM batch_purchases bp
    LEFT JOIN projects p ON bp.project_id = p.id
    LEFT JOIN contracts c ON bp.contract_id = c.id
    WHERE 1=1
    ${status && status !== 'all' ? ' AND bp.status = ?' : ''}
    ${project_id ? ' AND bp.project_id = ?' : ''}
    ${keyword ? ' AND (bp.batch_no LIKE ? OR c.name LIKE ? OR p.name LIKE ?)' : ''}
  `;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;

  // 排序和分页
  sql += ` ORDER BY bp.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: list,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * POST /api/purchase/batch
 * 创建批量采购
 * 业务规则：必须关联支出合同
 */
router.post('/batch', checkPermission('purchase:create'), (req, res) => {
  const { contract_id, project_id, items, remark } = req.body;
  const userId = req.user?.id;

  // 验证必填字段
  if (!contract_id) {
    return res.status(400).json({
      success: false,
      message: '批量采购必须关联支出合同'
    });
  }

  // 验证合同是否存在且为支出合同
  const contract = db.prepare(`
    SELECT c.*, p.name as project_name, s.name as supplier_name
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    LEFT JOIN suppliers s ON c.supplier_id = s.id
    WHERE c.id = ? AND c.type = 'expense'
  `).get(contract_id);

  if (!contract) {
    return res.status(400).json({
      success: false,
      message: '关联合同不存在或不是支出合同'
    });
  }

  // 使用合同的项目ID
  const finalProjectId = project_id || contract.project_id;

  if (!finalProjectId) {
    return res.status(400).json({
      success: false,
      message: '请关联项目'
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请添加采购清单项'
    });
  }

  try {
    const result = db.transaction(() => {
      // 生成批量采购编号
      const batchNo = generateBatchNo();

      // 计算总金额
      const totalAmount = items.reduce((sum, item) => {
        return sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0));
      }, 0);

      // 插入批量采购记录
      const insertResult = db.prepare(`
        INSERT INTO batch_purchases (
          batch_no, contract_id, project_id, status, total_amount, remark, creator_id
        ) VALUES (?, ?, ?, 'draft', ?, ?, ?)
      `).run(batchNo, contract_id, finalProjectId, totalAmount, remark || null, userId);

      const batchPurchaseId = insertResult.lastInsertRowid;

      // 插入采购明细
      const insertItem = db.prepare(`
        INSERT INTO batch_purchase_items (
          batch_purchase_id, purchase_list_item_id, material_name, specification,
          unit, quantity, unit_price, total_price, remark
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      items.forEach((item, index) => {
        const totalPrice = parseFloat((item.quantity * item.unit_price).toFixed(2));
        insertItem.run(
          batchPurchaseId,
          item.purchase_list_item_id || null,
          item.material_name,
          item.specification || null,
          item.unit || null,
          item.quantity,
          item.unit_price,
          totalPrice,
          item.remark || null
        );
      });

      return { batchPurchaseId, batchNo };
    })();

    res.json({
      success: true,
      message: '批量采购创建成功',
      data: {
        id: result.batchPurchaseId,
        batch_no: result.batchNo
      }
    });
  } catch (error) {
    console.error('创建批量采购失败:', error);
    res.status(500).json({
      success: false,
      message: '创建批量采购失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase/batch/:id
 * 获取批量采购详情
 */
router.get('/batch/:id', (req, res) => {
  const { id } = req.params;

  const batchPurchase = db.prepare(`
    SELECT bp.*, 
           p.name as project_name, p.project_no,
           c.contract_no, c.name as contract_name, c.amount as contract_amount,
           c.party_b as supplier_name,
           u.real_name as creator_name
    FROM batch_purchases bp
    LEFT JOIN projects p ON bp.project_id = p.id
    LEFT JOIN contracts c ON bp.contract_id = c.id
    LEFT JOIN users u ON bp.creator_id = u.id
    WHERE bp.id = ?
  `).get(id);

  if (!batchPurchase) {
    return res.status(404).json({
      success: false,
      message: '批量采购不存在'
    });
  }

  // 获取采购明细
  const items = db.prepare(`
    SELECT * FROM batch_purchase_items
    WHERE batch_purchase_id = ?
    ORDER BY id
  `).all(id);

  // 获取审批记录
  const approvals = db.prepare(`
    SELECT bpa.*, u.real_name as approver_name
    FROM batch_purchase_approvals bpa
    LEFT JOIN users u ON bpa.approver_id = u.id
    WHERE bpa.batch_purchase_id = ?
    ORDER BY bpa.step ASC
  `).all(id);

  res.json({
    success: true,
    data: {
      ...batchPurchase,
      items,
      approvals
    }
  });
});

/**
 * PUT /api/purchase/batch/:id
 * 更新批量采购
 */
router.put('/batch/:id', checkPermission('purchase:edit'), (req, res) => {
  const { id } = req.params;
  const { items, remark, status } = req.body;

  // 检查批量采购是否存在
  const batchPurchase = db.prepare('SELECT * FROM batch_purchases WHERE id = ?').get(id);
  if (!batchPurchase) {
    return res.status(404).json({
      success: false,
      message: '批量采购不存在'
    });
  }

  // 只有草稿状态可以修改
  if (batchPurchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的批量采购可以修改'
    });
  }

  try {
    const result = db.transaction(() => {
      // 如果有新的明细，更新明细
      if (items && Array.isArray(items)) {
        // 删除旧明细
        db.prepare('DELETE FROM batch_purchase_items WHERE batch_purchase_id = ?').run(id);

        // 插入新明细
        const insertItem = db.prepare(`
          INSERT INTO batch_purchase_items (
            batch_purchase_id, purchase_list_item_id, material_name, specification,
            unit, quantity, unit_price, total_price, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        items.forEach((item) => {
          const totalPrice = parseFloat((item.quantity * item.unit_price).toFixed(2));
          insertItem.run(
            id,
            item.purchase_list_item_id || null,
            item.material_name,
            item.specification || null,
            item.unit || null,
            item.quantity,
            item.unit_price,
            totalPrice,
            item.remark || null
          );
        });

        // 更新总金额
        const totalAmount = items.reduce((sum, item) => {
          return sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0));
        }, 0);

        db.prepare(`
          UPDATE batch_purchases SET
            total_amount = ?,
            remark = COALESCE(?, remark),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalAmount, remark, id);
      } else {
        db.prepare(`
          UPDATE batch_purchases SET
            remark = COALESCE(?, remark),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remark, status, id);
      }

      return db.prepare(`
        SELECT bp.*, 
               p.name as project_name, p.project_no,
               c.contract_no, c.name as contract_name
        FROM batch_purchases bp
        LEFT JOIN projects p ON bp.project_id = p.id
        LEFT JOIN contracts c ON bp.contract_id = c.id
        WHERE bp.id = ?
      `).get(id);
    })();

    res.json({
      success: true,
      message: '批量采购更新成功',
      data: result
    });
  } catch (error) {
    console.error('更新批量采购失败:', error);
    res.status(500).json({
      success: false,
      message: '更新批量采购失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/purchase/batch/:id
 * 删除批量采购
 */
router.delete('/batch/:id', checkPermission('purchase:delete'), (req, res) => {
  const { id } = req.params;

  const batchPurchase = db.prepare('SELECT * FROM batch_purchases WHERE id = ?').get(id);
  if (!batchPurchase) {
    return res.status(404).json({
      success: false,
      message: '批量采购不存在'
    });
  }

  // 只有草稿状态可以删除
  if (batchPurchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的批量采购可以删除'
    });
  }

  try {
    db.transaction(() => {
      // 删除明细
      db.prepare('DELETE FROM batch_purchase_items WHERE batch_purchase_id = ?').run(id);
      // 删除审批记录
      db.prepare('DELETE FROM batch_purchase_approvals WHERE batch_purchase_id = ?').run(id);
      // 删除主记录
      db.prepare('DELETE FROM batch_purchases WHERE id = ?').run(id);
    })();

    res.json({
      success: true,
      message: '批量采购删除成功'
    });
  } catch (error) {
    console.error('删除批量采购失败:', error);
    res.status(500).json({
      success: false,
      message: '删除批量采购失败: ' + error.message
    });
  }
});

/**
 * POST /api/purchase/batch/:id/submit
 * 提交批量采购审批
 */
router.post('/batch/:id/submit', checkPermission('purchase:create'), (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  const batchPurchase = db.prepare('SELECT * FROM batch_purchases WHERE id = ?').get(id);
  if (!batchPurchase) {
    return res.status(404).json({
      success: false,
      message: '批量采购不存在'
    });
  }

  if (batchPurchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态可以提交审批'
    });
  }

  try {
    db.transaction(() => {
      // 更新状态为待审批
      db.prepare(`
        UPDATE batch_purchases SET
          status = 'pending',
          current_approver = 'FINANCE',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);

      // 创建审批流程
      const approvalSteps = [
        { step: 1, role: 'FINANCE', name: '财务审批' },
        { step: 2, role: 'GM', name: '总经理审批' }
      ];

      const insertApproval = db.prepare(`
        INSERT INTO batch_purchase_approvals (
          batch_purchase_id, step, step_name, role, action
        ) VALUES (?, ?, ?, ?, 'pending')
      `);

      approvalSteps.forEach(step => {
        insertApproval.run(id, step.step, step.name, step.role);
      });
    })();

    res.json({
      success: true,
      message: '批量采购已提交审批'
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
 * POST /api/purchase/batch/:id/approve
 * 审批通过
 */
router.post('/batch/:id/approve', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;
  const userRoles = req.userRoles || [];

  const batchPurchase = db.prepare('SELECT * FROM batch_purchases WHERE id = ?').get(id);
  if (!batchPurchase) {
    return res.status(404).json({
      success: false,
      message: '批量采购不存在'
    });
  }

  if (batchPurchase.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该批量采购不在审批中'
    });
  }

  const currentApprover = batchPurchase.current_approver;
  const hasPermission = userRoles.some(r => r.code === currentApprover || r.code === 'GM');

  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: `您没有审批权限，当前需要 ${currentApprover} 角色`
    });
  }

  try {
    db.transaction(() => {
      // 更新当前审批步骤
      db.prepare(`
        UPDATE batch_purchase_approvals SET
          approver_id = ?,
          action = 'approve',
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE batch_purchase_id = ? AND role = ? AND action = 'pending'
      `).run(userId, comment || '', id, currentApprover);

      // 判断是否还有下一步审批
      const nextApprover = currentApprover === 'FINANCE' ? 'GM' : null;

      if (nextApprover) {
        // 更新当前审批人
        db.prepare(`
          UPDATE batch_purchases SET
            current_approver = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(nextApprover, id);
      } else {
        // 审批完成
        db.prepare(`
          UPDATE batch_purchases SET
            status = 'approved',
            current_approver = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);
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
 * POST /api/purchase/batch/:id/reject
 * 审批拒绝
 */
router.post('/batch/:id/reject', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;
  const userRoles = req.userRoles || [];

  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }

  const batchPurchase = db.prepare('SELECT * FROM batch_purchases WHERE id = ?').get(id);
  if (!batchPurchase) {
    return res.status(404).json({
      success: false,
      message: '批量采购不存在'
    });
  }

  if (batchPurchase.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该批量采购不在审批中'
    });
  }

  const currentApprover = batchPurchase.current_approver;
  const hasPermission = userRoles.some(r => r.code === currentApprover || r.code === 'GM');

  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: `您没有审批权限，当前需要 ${currentApprover} 角色`
    });
  }

  try {
    db.transaction(() => {
      // 更新当前审批步骤
      db.prepare(`
        UPDATE batch_purchase_approvals SET
          approver_id = ?,
          action = 'reject',
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE batch_purchase_id = ? AND role = ? AND action = 'pending'
      `).run(userId, comment, id, currentApprover);

      // 更新状态为已拒绝
      db.prepare(`
        UPDATE batch_purchases SET
          status = 'rejected',
          current_approver = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
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
 * GET /api/purchase/batch/contracts/expense
 * 获取可选的支出合同列表（用于关联合同）
 */
router.get('/batch/contracts/expense', (req, res) => {
  const { project_id } = req.query;

  let sql = `
    SELECT c.*, p.name as project_name, p.project_no, s.name as supplier_name
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    LEFT JOIN suppliers s ON c.supplier_id = s.id
    WHERE c.type = 'expense' AND c.status = 'approved'
  `;
  const params = [];

  if (project_id) {
    sql += ` AND c.project_id = ?`;
    params.push(project_id);
  }

  sql += ` ORDER BY c.created_at DESC`;

  const contracts = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: contracts
  });
});

/**
 * GET /api/purchase/batch/contracts/:contractId/purchase-list
 * 获取合同关联的采购清单
 */
router.get('/batch/contracts/:contractId/purchase-list', (req, res) => {
  const { contractId } = req.params;

  // 获取合同信息
  const contract = db.prepare(`
    SELECT c.*, p.id as project_id, p.name as project_name
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    WHERE c.id = ?
  `).get(contractId);

  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }

  // 获取项目的采购清单
  const purchaseLists = db.prepare(`
    SELECT pl.*, 
           (SELECT COUNT(*) FROM purchase_list_items WHERE purchase_list_id = pl.id) as item_count
    FROM purchase_lists pl
    WHERE pl.project_id = ? AND pl.status != 'cancelled'
    ORDER BY pl.created_at DESC
  `).all(contract.project_id);

  // 获取采购清单明细
  const listsWithItems = purchaseLists.map(list => {
    const items = db.prepare(`
      SELECT pli.*, mbp.base_price
      FROM purchase_list_items pli
      LEFT JOIN material_base_prices mbp ON pli.material_name = mbp.material_name 
        AND mbp.status = 'active'
        AND (mbp.expiry_date IS NULL OR mbp.expiry_date >= date('now'))
      WHERE pli.purchase_list_id = ?
      ORDER BY pli.sort_order, pli.id
    `).all(list.id);
    return { ...list, items };
  });

  res.json({
    success: true,
    data: {
      contract,
      purchaseLists: listsWithItems
    }
  });
});

module.exports = router;
