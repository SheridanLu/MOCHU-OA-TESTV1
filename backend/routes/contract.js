/**
 * 合同路由
 * 处理收入合同和支出合同的 CRUD 操作
 */

const express = require('express');
const { db } = require('../models/database');
const { getContractNo, previewContractNo } = require('../utils/contractNo');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有合同路由附加权限信息
router.use(authMiddleware, attachPermissions);

/**
 * GET /api/contracts/preview-no
 * 预览下一个合同编号（不实际占用）
 * 查询参数: type=income|expense
 */
router.get('/preview-no', (req, res) => {
  const { type = 'income' } = req.query;
  
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: '无效的合同类型'
    });
  }
  
  const contractNo = previewContractNo(type);
  
  res.json({
    success: true,
    contractNo
  });
});

/**
 * GET /api/contracts
 * 获取合同列表
 * 查询参数: type, status, project_id, page, pageSize
 */
router.get('/', (req, res) => {
  const { type, status, project_id, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT c.*, 
           p.name as project_name, p.project_no,
           u.real_name as creator_name
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    LEFT JOIN users u ON c.creator_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (type) {
    sql += ` AND c.type = ?`;
    params.push(type);
  }
  
  if (status) {
    sql += ` AND c.status = ?`;
    params.push(status);
  }
  
  if (project_id) {
    sql += ` AND c.project_id = ?`;
    params.push(project_id);
  }
  
  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total 
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    WHERE 1=1
    ${type ? ' AND c.type = ?' : ''}
    ${status ? ' AND c.status = ?' : ''}
    ${project_id ? ' AND c.project_id = ?' : ''}
  `;
  
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const contracts = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: contracts,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/contracts/:id
 * 获取单个合同详情
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const contract = db.prepare(`
    SELECT c.*, 
           p.name as project_name, p.project_no,
           u.real_name as creator_name
    FROM contracts c
    LEFT JOIN projects p ON c.project_id = p.id
    LEFT JOIN users u ON c.creator_id = u.id
    WHERE c.id = ?
  `).get(id);
  
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  res.json({
    success: true,
    data: contract
  });
});

/**
 * POST /api/contracts/income
 * 创建收入合同
 */
router.post('/income', checkPermission('contract:create'), (req, res) => {
  const {
    name,
    project_id,
    party_a,          // 甲方（客户）
    party_b,          // 乙方（本公司）
    amount,
    sign_date,        // 签订日期
    start_date,       // 合同开始日期
    end_date,         // 合同结束日期
    description
  } = req.body;
  
  // 验证必填字段
  if (!name) {
    return res.status(400).json({
      success: false,
      message: '合同名称不能为空'
    });
  }
  
  if (!party_a) {
    return res.status(400).json({
      success: false,
      message: '甲方（客户）不能为空'
    });
  }
  
  // 生成收入合同编号
  const contractNo = getContractNo('income');
  const userId = req.user.id;
  
  try {
    const result = db.prepare(`
      INSERT INTO contracts (
        contract_no, name, type, project_id, 
        party_a, party_b, amount,
        sign_date, start_date, end_date,
        status, creator_id
      ) VALUES (?, ?, 'income', ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      contractNo, name, project_id,
      party_a, party_b || '本公司', amount || 0,
      sign_date, start_date, end_date,
      userId
    );
    
    const newContract = db.prepare(`
      SELECT c.*, p.name as project_name 
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '收入合同创建成功',
      data: newContract
    });
  } catch (error) {
    console.error('创建收入合同失败:', error);
    res.status(500).json({
      success: false,
      message: '创建收入合同失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/expense
 * 创建支出合同
 * 业务规则：
 * - 支出合同必须关联项目
 * - 关联的项目必须是实体项目（type = 'entity'）
 */
router.post('/expense', checkPermission('contract:create'), (req, res) => {
  const {
    name,
    project_id,
    party_a,          // 甲方（本公司）
    party_b,          // 乙方（供应商/分包商）
    supplier_id,      // 供应商ID
    purchase_list_id, // 采购清单ID（可选）
    amount,
    sign_date,
    start_date,
    end_date,
    description,
    contract_category // 合同分类：equipment(设备类) / material(材料类)
  } = req.body;
  
  // 验证必填字段
  if (!name) {
    return res.status(400).json({
      success: false,
      message: '合同名称不能为空'
    });
  }
  
  // 支出合同必须关联项目
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '支出合同必须关联项目'
    });
  }
  
  // 验证项目是否存在且为实体项目
  const project = db.prepare(`
    SELECT id, name, type, status 
    FROM projects 
    WHERE id = ?
  `).get(project_id);
  
  if (!project) {
    return res.status(400).json({
      success: false,
      message: '关联的项目不存在'
    });
  }
  
  if (project.type !== 'entity') {
    return res.status(400).json({
      success: false,
      message: '支出合同只能关联实体项目，不能关联虚拟项目'
    });
  }
  
  if (!party_b) {
    return res.status(400).json({
      success: false,
      message: '乙方（供应商/分包商）不能为空'
    });
  }
  
  // 生成支出合同编号
  const contractNo = getContractNo('expense');
  const userId = req.user.id;
  
  try {
    const result = db.prepare(`
      INSERT INTO contracts (
        contract_no, name, type, project_id, 
        party_a, party_b, amount,
        sign_date, start_date, end_date,
        status, creator_id, supplier_id, purchase_list_id, contract_category
      ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(
      contractNo, name, project_id,
      party_a || '本公司', party_b, amount || 0,
      sign_date, start_date, end_date,
      userId, supplier_id, purchase_list_id, contract_category || 'equipment'
    );
    
    const newContract = db.prepare(`
      SELECT c.*, p.name as project_name, p.project_no
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '支出合同创建成功',
      data: newContract
    });
  } catch (error) {
    console.error('创建支出合同失败:', error);
    res.status(500).json({
      success: false,
      message: '创建支出合同失败: ' + error.message
    });
  }
});

/**
 * PUT /api/contracts/:id
 * 更新合同信息
 */
router.put('/:id', checkPermission('contract:edit'), (req, res) => {
  const { id } = req.params;
  const {
    name,
    project_id,
    party_a,
    party_b,
    amount,
    sign_date,
    start_date,
    end_date,
    status,
    description
  } = req.body;
  
  // 检查合同是否存在
  const existingContract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!existingContract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  // 检查合同状态（已完成的合同不能修改）
  if (existingContract.status === 'completed') {
    return res.status(403).json({
      success: false,
      message: '已完成的合同不能修改'
    });
  }
  
  try {
    db.prepare(`
      UPDATE contracts SET
        name = COALESCE(?, name),
        project_id = COALESCE(?, project_id),
        party_a = COALESCE(?, party_a),
        party_b = COALESCE(?, party_b),
        amount = COALESCE(?, amount),
        sign_date = COALESCE(?, sign_date),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, project_id, party_a, party_b, amount,
      sign_date, start_date, end_date, status, id
    );
    
    const updatedContract = db.prepare(`
      SELECT c.*, p.name as project_name 
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '合同更新成功',
      data: updatedContract
    });
  } catch (error) {
    console.error('更新合同失败:', error);
    res.status(500).json({
      success: false,
      message: '更新合同失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/contracts/:id
 * 删除合同（仅限草稿状态的合同）
 */
router.delete('/:id', checkPermission('contract:delete'), (req, res) => {
  const { id } = req.params;
  
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  // 只允许删除草稿状态的合同
  if (contract.status !== 'draft' && contract.status !== 'pending') {
    return res.status(403).json({
      success: false,
      message: '只有草稿或待审批状态的合同可以删除'
    });
  }
  
  try {
    db.prepare('DELETE FROM contracts WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: '合同删除成功'
    });
  } catch (error) {
    console.error('删除合同失败:', error);
    res.status(500).json({
      success: false,
      message: '删除合同失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/:id/submit
 * 提交审批 - 收入合同审批流程
 */
router.post('/:id/submit', checkPermission('contract:create'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  // 只能提交草稿状态的合同
  if (contract.status !== 'draft' && contract.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的合同可以提交审批'
    });
  }
  
  try {
    // 开启事务
    const transaction = db.transaction(() => {
      // 更新合同状态为待审批，设置当前审批人为财务
      db.prepare(`
        UPDATE contracts 
        SET status = 'pending', 
            current_approver = 'FINANCE',
            submitter_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, id);
      
      // 创建审批流程记录
      const approvalSteps = [
        { step: 1, role: 'FINANCE' },
        { step: 2, role: 'LEGAL' },
        { step: 3, role: 'GM' }
      ];
      
      const insertHistory = db.prepare(`
        INSERT INTO contract_approval_history 
        (contract_id, step, role, status)
        VALUES (?, ?, ?, 'pending')
      `);
      
      approvalSteps.forEach(step => {
        insertHistory.run(id, step.step, step.role);
      });
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '合同已提交审批，等待财务审批'
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
 * POST /api/contracts/:id/approve
 * 审批通过
 */
router.post('/:id/approve', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  const userRoles = req.userRoles || [];
  
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  // 检查合同状态
  if (contract.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该合同不在审批中'
    });
  }
  
  // 检查当前用户是否有权限审批
  const currentApprover = contract.current_approver;
  const hasPermission = userRoles.some(role => 
    role.code === currentApprover || 
    role.code === 'GM' || 
    (currentApprover === 'FINANCE' && role.code === 'FINANCE') ||
    (currentApprover === 'LEGAL' && role.code === 'LEGAL')
  );
  
  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: `您没有权限审批，当前需要 ${currentApprover} 角色`
    });
  }
  
  // 获取当前审批人信息
  const approver = db.prepare('SELECT real_name FROM users WHERE id = ?').get(userId);
  
  try {
    const transaction = db.transaction(() => {
      // 更新当前审批步骤的状态
      db.prepare(`
        UPDATE contract_approval_history 
        SET status = 'approved',
            approver_id = ?,
            approver_name = ?,
            comment = ?,
            approved_at = CURRENT_TIMESTAMP
        WHERE contract_id = ? AND role = ? AND status = 'pending'
      `).run(userId, approver?.real_name || '未知', comment || '', id, currentApprover);
      
      // 判断是否还有下一个审批节点
      const nextSteps = {
        'FINANCE': 'LEGAL',
        'LEGAL': 'GM',
        'GM': null
      };
      
      const nextApprover = nextSteps[currentApprover];
      
      if (nextApprover) {
        // 还有下一个审批节点
        db.prepare(`
          UPDATE contracts 
          SET current_approver = ?,
              status = CASE 
                WHEN ? = 'LEGAL' THEN 'finance_approved'
                WHEN ? = 'GM' THEN 'legal_approved'
                ELSE status
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(nextApprover, nextApprover, nextApprover, id);
        
        const statusMessages = {
          'FINANCE': '财务审批通过，等待法务审批',
          'LEGAL': '法务审批通过，等待总经理审批',
          'GM': '总经理审批通过'
        };
        
        res.json({
          success: true,
          message: statusMessages[currentApprover]
        });
      } else {
        // 总经理审批通过，流程结束
        db.prepare(`
          UPDATE contracts 
          SET status = 'approved',
              current_approver = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);
        
        res.json({
          success: true,
          message: '审批流程完成，合同已通过'
        });
      }
    });
    
    transaction();
  } catch (error) {
    console.error('审批失败:', error);
    res.status(500).json({
      success: false,
      message: '审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/:id/reject
 * 审批拒绝
 */
router.post('/:id/reject', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  const userRoles = req.userRoles || [];
  
  if (!comment) {
    return res.status(400).json({
      success: false,
      message: '拒绝时必须填写拒绝原因'
    });
  }
  
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  // 检查合同状态
  if (contract.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该合同不在审批中'
    });
  }
  
  // 检查当前用户是否有权限审批
  const currentApprover = contract.current_approver;
  const hasPermission = userRoles.some(role => 
    role.code === currentApprover || 
    role.code === 'GM' ||
    (currentApprover === 'FINANCE' && role.code === 'FINANCE') ||
    (currentApprover === 'LEGAL' && role.code === 'LEGAL')
  );
  
  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: `您没有权限审批，当前需要 ${currentApprover} 角色`
    });
  }
  
  // 获取当前审批人信息
  const approver = db.prepare('SELECT real_name FROM users WHERE id = ?').get(userId);
  
  try {
    const transaction = db.transaction(() => {
      // 更新当前审批步骤的状态为拒绝
      db.prepare(`
        UPDATE contract_approval_history 
        SET status = 'rejected',
            approver_id = ?,
            approver_name = ?,
            comment = ?,
            approved_at = CURRENT_TIMESTAMP
        WHERE contract_id = ? AND role = ? AND status = 'pending'
      `).run(userId, approver?.real_name || '未知', comment, id, currentApprover);
      
      // 更新合同状态为已拒绝
      db.prepare(`
        UPDATE contracts 
        SET status = 'rejected',
            current_approver = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '合同已拒绝'
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
 * GET /api/contracts/:id/history
 * 获取审批历史
 */
router.get('/:id/history', (req, res) => {
  const { id } = req.params;
  
  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }
  
  try {
    const history = db.prepare(`
      SELECT h.*, u.real_name as approver_real_name
      FROM contract_approval_history h
      LEFT JOIN users u ON h.approver_id = u.id
      WHERE h.contract_id = ?
      ORDER BY h.step ASC
    `).all(id);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('获取审批历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批历史失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/stats/overview
 * 获取合同统计概览
 */
router.get('/stats/overview', (req, res) => {
  try {
    // 收入合同统计
    const incomeStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(amount) as total_amount
      FROM contracts WHERE type = 'income'
    `).get();
    
    // 支出合同统计
    const expenseStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(amount) as total_amount
      FROM contracts WHERE type = 'expense'
    `).get();
    
    // 本月收入合同
    const monthPrefix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const monthlyIncome = db.prepare(`
      SELECT COUNT(*) as count
      FROM contracts 
      WHERE type = 'income' AND contract_no LIKE ?
    `).get(`IC${monthPrefix}%`);
    
    res.json({
      success: true,
      data: {
        income: {
          ...incomeStats,
          total_amount: parseFloat(incomeStats.total_amount) || 0
        },
        expense: {
          ...expenseStats,
          total_amount: parseFloat(expenseStats.total_amount) || 0
        },
        monthlyIncome: monthlyIncome.count
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

// ========== Task 28: 支出合同超量校验相关接口 ==========

/**
 * POST /api/contracts/expense/overage-check
 * 支出合同超量校验
 * 检查采购项目是否超出项目采购清单的预算
 */
router.post('/expense/overage-check', (req, res) => {
  const {
    project_id,
    items  // Array: [{ material_name, specification, quantity, unit_price }]
  } = req.body;

  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '项目ID不能为空'
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '采购项目列表不能为空'
    });
  }

  try {
    const overageItems = [];
    const warnings = [];

    // 获取项目采购清单
    const purchaseLists = db.prepare(`
      SELECT id, name FROM purchase_lists WHERE project_id = ? AND status != 'cancelled'
    `).all(project_id);

    for (const item of items) {
      const { material_name, specification, quantity, unit_price } = item;
      
      // 在采购清单中查找匹配的物料
      const listItem = db.prepare(`
        SELECT pli.*, pl.name as list_name
        FROM purchase_list_items pli
        JOIN purchase_lists pl ON pli.purchase_list_id = pl.id
        WHERE pl.project_id = ? 
          AND pli.material_name = ?
          AND (pli.specification = ? OR ? IS NULL OR pli.specification IS NULL)
          AND pl.status != 'cancelled'
        LIMIT 1
      `).get(project_id, material_name, specification, specification);

      if (listItem) {
        // 检查数量是否超出
        const quantityOverage = quantity > listItem.quantity;
        // 检查单价是否超出
        const priceOverage = unit_price > listItem.unit_price;

        if (quantityOverage || priceOverage) {
          overageItems.push({
            material_name,
            specification,
            list_quantity: listItem.quantity,
            list_unit_price: listItem.unit_price,
            actual_quantity: quantity,
            actual_unit_price: unit_price,
            quantity_overage: quantityOverage ? quantity - listItem.quantity : 0,
            price_overage: priceOverage ? unit_price - listItem.unit_price : 0,
            list_name: listItem.list_name
          });
        }
      } else {
        // 物料不在采购清单中
        warnings.push({
          type: 'not_in_list',
          material_name,
          specification,
          message: `物料"${material_name}"不在项目采购清单中`
        });
      }

      // 检查单价是否高于基准价
      const basePrice = db.prepare(`
        SELECT * FROM material_base_prices
        WHERE material_name = ?
          AND (specification = ? OR ? IS NULL OR specification IS NULL)
          AND status = 'active'
          AND (expiry_date IS NULL OR expiry_date >= date('now'))
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(material_name, specification, specification);

      if (basePrice && unit_price > basePrice.base_price) {
        const overagePercent = ((unit_price - basePrice.base_price) / basePrice.base_price * 100).toFixed(2);
        warnings.push({
          type: 'price_warning',
          material_name,
          specification,
          unit_price,
          base_price: basePrice.base_price,
          overage_percent: parseFloat(overagePercent),
          message: `物料"${material_name}"单价 ¥${unit_price} 高于基准价 ¥${basePrice.base_price}，超出 ${overagePercent}%`
        });
      }
    }

    res.json({
      success: true,
      data: {
        hasOverage: overageItems.length > 0,
        hasWarnings: warnings.length > 0,
        overageItems,
        warnings,
        needApproval: overageItems.length > 0 // 需要预算员审批
      }
    });
  } catch (error) {
    console.error('超量校验失败:', error);
    res.status(500).json({
      success: false,
      message: '超量校验失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/expense/overcheck
 * 检查单价是否超出项目采购清单（简化版，仅返回价格预警）
 */
router.post('/expense/overcheck', (req, res) => {
  const { project_id, items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      message: '采购项目列表不能为空'
    });
  }

  try {
    const priceWarnings = [];

    for (const item of items) {
      const { material_name, specification, unit_price } = item;

      // 检查采购清单中的价格
      let listItem = null;
      if (project_id) {
        listItem = db.prepare(`
          SELECT unit_price FROM purchase_list_items pli
          JOIN purchase_lists pl ON pli.purchase_list_id = pl.id
          WHERE pl.project_id = ?
            AND pli.material_name = ?
            AND pl.status != 'cancelled'
          LIMIT 1
        `).get(project_id, material_name);
      }

      // 检查基准价
      const basePrice = db.prepare(`
        SELECT base_price FROM material_base_prices
        WHERE material_name = ?
          AND (specification = ? OR ? IS NULL OR specification IS NULL)
          AND status = 'active'
          AND (expiry_date IS NULL OR expiry_date >= date('now'))
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(material_name, specification, specification);

      const referencePrice = listItem?.unit_price || basePrice?.base_price;

      if (referencePrice && unit_price > referencePrice) {
        const overagePercent = ((unit_price - referencePrice) / referencePrice * 100).toFixed(2);
        priceWarnings.push({
          material_name,
          specification,
          unit_price,
          reference_price: referencePrice,
          reference_type: listItem ? '采购清单' : '基准价',
          overage_percent: parseFloat(overagePercent),
          warning_level: overagePercent >= 20 ? 'danger' : overagePercent >= 10 ? 'warning' : 'info'
        });
      }
    }

    res.json({
      success: true,
      data: {
        hasWarnings: priceWarnings.length > 0,
        warnings: priceWarnings
      }
    });
  } catch (error) {
    console.error('价格校验失败:', error);
    res.status(500).json({
      success: false,
      message: '价格校验失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/price-warnings
 * 获取价格预警列表
 * 查询参数: status, page, pageSize
 */
router.get('/price-warnings', (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT pw.*, 
           c.contract_no, c.name as contract_name,
           u.real_name as handler_name
    FROM price_warnings pw
    LEFT JOIN contracts c ON pw.contract_id = c.id
    LEFT JOIN users u ON pw.handler_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ` AND pw.status = ?`;
    params.push(status);
  }

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total FROM price_warnings pw
    WHERE 1=1 ${status ? ' AND pw.status = ?' : ''}
  `;
  const countParams = status ? [status] : [];
  const countResult = db.prepare(countSql).get(...countParams);
  const total = countResult ? countResult.total : 0;

  // 排序和分页
  sql += ` ORDER BY pw.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const warnings = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: warnings,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * PUT /api/contracts/price-warnings/:id/handle
 * 处理价格预警
 */
router.put('/price-warnings/:id/handle', (req, res) => {
  const { id } = req.params;
  const { handle_remark } = req.body;
  const userId = req.user.id;

  const warning = db.prepare('SELECT * FROM price_warnings WHERE id = ?').get(id);
  if (!warning) {
    return res.status(404).json({
      success: false,
      message: '价格预警不存在'
    });
  }

  try {
    db.prepare(`
      UPDATE price_warnings SET
        status = 'handled',
        handler_id = ?,
        handle_remark = ?,
        handled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, handle_remark, id);

    const updated = db.prepare(`
      SELECT pw.*, u.real_name as handler_name
      FROM price_warnings pw
      LEFT JOIN users u ON pw.handler_id = u.id
      WHERE pw.id = ?
    `).get(id);

    res.json({
      success: true,
      message: '价格预警已处理',
      data: updated
    });
  } catch (error) {
    console.error('处理价格预警失败:', error);
    res.status(500).json({
      success: false,
      message: '处理价格预警失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/suppliers
 * 获取所有供应商列表（用于新建合同时选择）
 */
router.get('/suppliers', (req, res) => {
  try {
    const suppliers = db.prepare(`
      SELECT id, name, contact_person, phone, email, address
      FROM suppliers
      WHERE status = 'active'
      ORDER BY name
    `).all();

    res.json({
      success: true,
      data: suppliers
    });
  } catch (error) {
    console.error('获取供应商列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取供应商列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/:id/suppliers
 * 获取合同供应商列表（用于下拉选择）
 */
router.get('/:id/suppliers', (req, res) => {
  const { id } = req.params;

  try {
    // 先检查合同是否存在
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: '合同不存在'
      });
    }

    // 获取所有活跃供应商
    const suppliers = db.prepare(`
      SELECT id, name, contact_person, phone, email, address, bank_name, bank_account
      FROM suppliers
      WHERE status = 'active'
      ORDER BY name
    `).all();

    // 如果合同已关联供应商，标记出来
    const suppliersWithSelected = suppliers.map(s => ({
      ...s,
      selected: contract.supplier_id === s.id
    }));

    res.json({
      success: true,
      data: suppliersWithSelected
    });
  } catch (error) {
    console.error('获取供应商列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取供应商列表失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/suppliers
 * 创建新供应商
 */
router.post('/suppliers', checkPermission('supplier:create'), (req, res) => {
  const {
    name,
    contact_person,
    phone,
    email,
    address,
    bank_name,
    bank_account,
    contact_region
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: '供应商名称不能为空'
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO suppliers (name, contact_person, phone, email, address, bank_name, bank_account, contact_region)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name.trim(), contact_person, phone, email, address, bank_name, bank_account, contact_region);

    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);

    res.json({
      success: true,
      message: '供应商创建成功',
      data: newSupplier
    });
  } catch (error) {
    console.error('创建供应商失败:', error);
    res.status(500).json({
      success: false,
      message: '创建供应商失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/projects/:projectId/purchase-lists
 * 获取项目的采购清单
 */
router.get('/projects/:projectId/purchase-lists', (req, res) => {
  const { projectId } = req.params;

  try {
    const lists = db.prepare(`
      SELECT pl.*, 
             (SELECT COUNT(*) FROM purchase_list_items WHERE purchase_list_id = pl.id) as item_count
      FROM purchase_lists pl
      WHERE pl.project_id = ? AND pl.status != 'cancelled'
      ORDER BY pl.created_at DESC
    `).all(projectId);

    res.json({
      success: true,
      data: lists
    });
  } catch (error) {
    console.error('获取采购清单失败:', error);
    res.status(500).json({
      success: false,
      message: '获取采购清单失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/purchase-lists/:listId/items
 * 获取采购清单明细
 */
router.get('/purchase-lists/:listId/items', (req, res) => {
  const { listId } = req.params;

  try {
    const items = db.prepare(`
      SELECT * FROM purchase_list_items
      WHERE purchase_list_id = ?
      ORDER BY id
    `).all(listId);

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('获取采购清单明细失败:', error);
    res.status(500).json({
      success: false,
      message: '获取采购清单明细失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/overcheck
 * 获取合同超量申请列表
 *
 * 查询参数：
 * - status: 超量状态 (pending/approved/rejected/all)
 * - project_id: 项目ID
 * - page: 页码
 * - pageSize: 每页条数
 */
router.get('/overcheck', (req, res) => {
  const { status = 'all', project_id, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  try {
    let sql = `
      SELECT
        eor.*,
        c.contract_no,
        c.name as contract_name,
        c.party_b as supplier_name,
        p.name as project_name,
        p.project_no,
        pl.name as purchase_list_name
      FROM expense_overage_records eor
      LEFT JOIN contracts c ON eor.contract_id = c.id
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN purchase_lists pl ON eor.purchase_list_id = pl.id
      WHERE 1=1
    `;
    const params = [];

    // 状态筛选
    if (status !== 'all') {
      sql += ` AND eor.status = ?`;
      params.push(status);
    }

    // 项目筛选
    if (project_id) {
      sql += ` AND c.project_id = ?`;
      params.push(project_id);
    }

    // 获取总数
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = db.prepare(countSql).get(...params);
    const total = countResult ? countResult.total : 0;

    // 排序和分页
    sql += ` ORDER BY eor.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(pageSize), offset);

    const records = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: {
        list: records,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total
        }
      }
    });
  } catch (error) {
    console.error('获取超量申请列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取超量申请列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/:id/check
 * 检查合同是否可以签订
 *
 * 返回：
 * - canSign: 是否可签订
 * - checks: 各项检查结果
 * - issues: 存在的问题
 */
router.get('/:id/check', (req, res) => {
  const { id } = req.params;

  try {
    const contract = db.prepare(`
      SELECT c.*, p.name as project_name, p.project_no
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `).get(id);

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: '合同不存在'
      });
    }

    const checks = {
      basic_info: { passed: true, message: '基本信息完整' },
      project: { passed: true, message: '已关联项目' },
      approval: { passed: true, message: '审批状态正常' },
      amount: { passed: true, message: '金额有效' }
    };

    const issues = [];

    // 检查基本信息
    if (!contract.name || !contract.party_b) {
      checks.basic_info = { passed: false, message: '合同名称或乙方信息不完整' };
      issues.push('合同基本信息不完整');
    }

    // 检查项目关联
    if (!contract.project_id) {
      checks.project = { passed: false, message: '未关联项目' };
      issues.push('支出合同必须关联项目');
    }

    // 检查审批状态
    if (contract.status !== 'approved' && contract.status !== 'draft') {
      checks.approval = { passed: false, message: '合同未通过审批' };
      issues.push('合同需要通过审批才能签订');
    }

    // 检查金额
    if (!contract.amount || contract.amount <= 0) {
      checks.amount = { passed: false, message: '合同金额无效' };
      issues.push('请设置有效的合同金额');
    }

    const canSign = Object.values(checks).every(c => c.passed);

    res.json({
      success: true,
      data: {
        contract,
        canSign,
        checks,
        issues
      }
    });
  } catch (error) {
    console.error('检查合同失败:', error);
    res.status(500).json({
      success: false,
      message: '检查合同失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/expense/:id/overcheck-apply
 * 提交超量校验申请
 *
 * 请求体：
 * - items: 超量项列表
 * - reason: 超量原因
 * - remark: 备注
 */
router.post('/expense/:id/overcheck-apply', (req, res) => {
  const { id } = req.params;
  const { items, reason, remark } = req.body;
  const userId = req.user.id;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '超量项列表不能为空'
    });
  }

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: '请填写超量原因'
    });
  }

  try {
    // 检查合同是否存在
    const contract = db.prepare('SELECT * FROM contracts WHERE id = ? AND type = \'expense\'').get(id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        message: '支出合同不存在'
      });
    }

    const transaction = db.transaction(() => {
      // 插入超量记录
      const insertStmt = db.prepare(`
        INSERT INTO expense_overage_records (
          contract_id,
          purchase_list_id,
          item_name,
          original_quantity,
          original_price,
          actual_quantity,
          actual_price,
          overage_quantity,
          overage_amount,
          reason,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);

      items.forEach(item => {
        insertStmt.run(
          id,
          item.purchase_list_id || null,
          item.material_name,
          item.original_quantity || 0,
          item.unit_price || 0,
          item.actual_quantity || 0,
          item.unit_price || 0,
          item.overage_quantity || 0,
          item.overage_amount || 0,
          reason
        );
      });

      // 创建价格预警记录
      const warningStmt = db.prepare(`
        INSERT INTO price_warnings (
          contract_id,
          material_name,
          specification,
          unit_price,
          base_price,
          overage_percent,
          warning_level,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `);

      items.forEach(item => {
        if (item.base_price && item.unit_price > item.base_price) {
          const overagePercent = ((item.unit_price - item.base_price) / item.base_price * 100).toFixed(2);
          warningStmt.run(
            id,
            item.material_name,
            item.specification || '',
            item.unit_price,
            item.base_price,
            parseFloat(overagePercent),
            overagePercent >= 20 ? 'danger' : 'warning'
          );
        }
      });
    });

    transaction();

    res.json({
      success: true,
      message: '超量校验申请已提交，等待审批'
    });
  } catch (error) {
    console.error('提交超量校验申请失败:', error);
    res.status(500).json({
      success: false,
      message: '提交超量校验申请失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/material-base-prices
 * 获取材料基准价列表
 */
router.get('/material-base-prices', (req, res) => {
  const { keyword } = req.query;

  try {
    let sql = `
      SELECT *
      FROM material_base_prices
      WHERE status = 'active'
    `;
    const params = [];

    if (keyword) {
      sql += ` AND material_name LIKE ?`;
      params.push(`%${keyword}%`);
    }

    sql += ` ORDER BY material_name ASC`;

    const prices = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: prices
    });
  } catch (error) {
    console.error('获取材料基准价失败:', error);
    res.status(500).json({
      success: false,
      message: '获取材料基准价失败: ' + error.message
    });
  }
});

// ========== Task 30: 支出合同超量校验审批相关接口 ==========

/**
 * 审批流程步骤定义
 */
const APPROVAL_STEPS = {
  FINANCE: { step: 1, name: '财务审批', role: 'FINANCE' },
  LEGAL: { step: 2, name: '法务审批', role: 'LEGAL' },
  GM: { step: 3, name: '总经理审批', role: 'GM' },
  BUDGET: { step: 0, name: '预算员审批（超量校验）', role: 'BUDGET' }  // 超量时额外需要
};

/**
 * POST /api/contracts/:id/overcheck
 * 提交超量校验申请
 */
router.post('/:id/overcheck', (req, res) => {
  const { id } = req.params;
  const { reason, items } = req.body;
  const userId = req.user.id;

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写超量原因说明'
    });
  }

  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }

  if (contract.type !== 'expense') {
    return res.status(400).json({
      success: false,
      message: '只有支出合同才能提交超量校验'
    });
  }

  try {
    const transaction = db.transaction(() => {
      // 更新合同的超量校验信息
      db.prepare(`
        UPDATE contracts SET
          overcheck_reason = ?,
          overcheck_result = ?,
          overcheck_status = 'pending',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(reason, JSON.stringify(items || []), id);

      // 创建预算员审批记录
      const existingRecord = db.prepare(`
        SELECT * FROM approval_records 
        WHERE contract_id = ? AND role = 'BUDGET' AND action = 'pending'
      `).get(id);

      if (!existingRecord) {
        db.prepare(`
          INSERT INTO approval_records (
            contract_id, step, step_name, role, action
          ) VALUES (?, 0, '预算员审批（超量校验）', 'BUDGET', 'pending')
        `).run(id);
      }
    });

    transaction();

    res.json({
      success: true,
      message: '超量校验申请已提交，等待预算员审批'
    });
  } catch (error) {
    console.error('提交超量校验失败:', error);
    res.status(500).json({
      success: false,
      message: '提交超量校验失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/:id/overcheck/approve
 * 预算员审批超量校验
 */
router.post('/:id/overcheck/approve', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  const userRoles = req.userRoles || [];

  // 检查是否有预算员角色
  if (!userRoles.some(r => r.code === 'BUDGET' || r.code === 'GM')) {
    return res.status(403).json({
      success: false,
      message: '您没有预算员审批权限'
    });
  }

  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }

  if (contract.overcheck_status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该合同不在超量审批中'
    });
  }

  try {
    const transaction = db.transaction(() => {
      // 更新合同超量校验状态
      db.prepare(`
        UPDATE contracts SET
          overcheck_status = 'approved',
          budget_approver_id = ?,
          budget_approved_at = CURRENT_TIMESTAMP,
          budget_approve_comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || '', id);

      // 更新审批记录
      db.prepare(`
        UPDATE approval_records SET
          approver_id = ?,
          action = 'approve',
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE contract_id = ? AND role = 'BUDGET' AND action = 'pending'
      `).run(userId, comment || '', id);

      // 如果合同状态是待审批，则进入正常审批流程
      if (contract.status === 'pending' || contract.status === 'draft') {
        db.prepare(`
          UPDATE contracts SET
            status = 'pending',
            current_approver = 'FINANCE',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);

        // 创建审批流程记录
        const steps = [
          { step: 1, role: 'FINANCE', name: '财务审批' },
          { step: 2, role: 'LEGAL', name: '法务审批' },
          { step: 3, role: 'GM', name: '总经理审批' }
        ];

        steps.forEach(step => {
          const existing = db.prepare(`
            SELECT * FROM contract_approval_history 
            WHERE contract_id = ? AND role = ?
          `).get(id, step.role);
          
          if (!existing) {
            db.prepare(`
              INSERT INTO contract_approval_history 
              (contract_id, step, role, status)
              VALUES (?, ?, ?, 'pending')
            `).run(id, step.step, step.role);
          }
        });
      }
    });

    transaction();

    res.json({
      success: true,
      message: '超量校验已通过，合同进入审批流程'
    });
  } catch (error) {
    console.error('审批超量校验失败:', error);
    res.status(500).json({
      success: false,
      message: '审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/contracts/:id/overcheck/reject
 * 预算员拒绝超量校验
 */
router.post('/:id/overcheck/reject', (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  const userRoles = req.userRoles || [];

  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }

  // 检查是否有预算员角色
  if (!userRoles.some(r => r.code === 'BUDGET' || r.code === 'GM')) {
    return res.status(403).json({
      success: false,
      message: '您没有预算员审批权限'
    });
  }

  const contract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
  if (!contract) {
    return res.status(404).json({
      success: false,
      message: '合同不存在'
    });
  }

  if (contract.overcheck_status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该合同不在超量审批中'
    });
  }

  try {
    const transaction = db.transaction(() => {
      // 更新合同超量校验状态
      db.prepare(`
        UPDATE contracts SET
          overcheck_status = 'rejected',
          budget_approver_id = ?,
          budget_approved_at = CURRENT_TIMESTAMP,
          budget_approve_comment = ?,
          status = 'rejected',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment, id);

      // 更新审批记录
      db.prepare(`
        UPDATE approval_records SET
          approver_id = ?,
          action = 'reject',
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE contract_id = ? AND role = 'BUDGET' AND action = 'pending'
      `).run(userId, comment, id);
    });

    transaction();

    res.json({
      success: true,
      message: '超量校验已拒绝'
    });
  } catch (error) {
    console.error('拒绝超量校验失败:', error);
    res.status(500).json({
      success: false,
      message: '拒绝失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/overcheck/pending
 * 获取待超量校验审批列表（预算员使用）
 */
router.get('/overcheck/pending', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  try {
    // 获取待超量校验的合同
    const sql = `
      SELECT c.*, 
             p.name as project_name, p.project_no,
             u.real_name as creator_name,
             s.name as supplier_name
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN users u ON c.creator_id = u.id
      LEFT JOIN suppliers s ON c.supplier_id = s.id
      WHERE c.type = 'expense' AND c.overcheck_status = 'pending'
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM contracts
      WHERE type = 'expense' AND overcheck_status = 'pending'
    `;

    const countResult = db.prepare(countSql).get();
    const total = countResult ? countResult.total : 0;

    const contracts = db.prepare(sql).all(parseInt(pageSize), offset);

    res.json({
      success: true,
      data: contracts,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取待超量校验列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/:id/overcheck
 * 获取合同超量校验详情
 */
router.get('/:id/overcheck', (req, res) => {
  const { id } = req.params;

  try {
    const contract = db.prepare(`
      SELECT c.*, 
             p.name as project_name, p.project_no, p.contract_amount as project_budget,
             u.real_name as creator_name,
             s.name as supplier_name,
             bu.real_name as budget_approver_name
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN users u ON c.creator_id = u.id
      LEFT JOIN suppliers s ON c.supplier_id = s.id
      LEFT JOIN users bu ON c.budget_approver_id = bu.id
      WHERE c.id = ?
    `).get(id);

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: '合同不存在'
      });
    }

    // 获取审批记录
    const approvalRecords = db.prepare(`
      SELECT ar.*, u.real_name as approver_name
      FROM approval_records ar
      LEFT JOIN users u ON ar.approver_id = u.id
      WHERE ar.contract_id = ?
      ORDER BY ar.step ASC, ar.created_at ASC
    `).all(id);

    // 获取合同审批历史
    const approvalHistory = db.prepare(`
      SELECT h.*, u.real_name as approver_real_name
      FROM contract_approval_history h
      LEFT JOIN users u ON h.approver_id = u.id
      WHERE h.contract_id = ?
      ORDER BY h.step ASC
    `).all(id);

    // 解析超量校验结果
    let overcheckItems = [];
    if (contract.overcheck_result) {
      try {
        overcheckItems = JSON.parse(contract.overcheck_result);
      } catch (e) {
        console.error('解析超量校验结果失败:', e);
      }
    }

    res.json({
      success: true,
      data: {
        ...contract,
        overcheck_items: overcheckItems,
        approval_records: approvalRecords,
        approval_history: approvalHistory
      }
    });
  } catch (error) {
    console.error('获取超量校验详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取详情失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/:id/overcheck/validate
 * 验证合同是否需要超量校验
 */
router.get('/:id/overcheck/validate', (req, res) => {
  const { id } = req.params;

  try {
    const contract = db.prepare(`
      SELECT c.*, p.contract_amount as project_budget
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `).get(id);

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: '合同不存在'
      });
    }

    // 检查是否超出项目预算
    let isExcessive = false;
    let pricePercentage = 0;
    let warnings = [];

    if (contract.project_budget && contract.project_budget > 0) {
      const budgetAmount = parseFloat(contract.project_budget);
      const contractAmount = parseFloat(contract.amount || 0);
      
      if (contractAmount > budgetAmount) {
        isExcessive = true;
        pricePercentage = ((contractAmount - budgetAmount) / budgetAmount * 100).toFixed(2);
        warnings.push({
          type: 'budget_exceeded',
          message: `合同金额 ¥${contractAmount.toLocaleString()} 超出项目预算 ¥${budgetAmount.toLocaleString()}，超出 ${pricePercentage}%`
        });
      }
    }

    // 检查是否需要超量校验（未分配成本）
    let needOvercheck = false;
    if (!contract.project_budget || contract.project_budget === 0) {
      needOvercheck = true;
      warnings.push({
        type: 'no_budget',
        message: '项目暂未分配成本，需要进行超量校验'
      });
    }

    res.json({
      success: true,
      data: {
        need_overcheck: needOvercheck || isExcessive,
        is_excessive: isExcessive,
        price_percentage: parseFloat(pricePercentage),
        warnings,
        current_status: contract.overcheck_status || 'none'
      }
    });
  } catch (error) {
    console.error('验证超量校验失败:', error);
    res.status(500).json({
      success: false,
      message: '验证失败: ' + error.message
    });
  }
});

/**
 * GET /api/contracts/:id/records
 * 获取合同完整审批记录
 */
router.get('/:id/records', (req, res) => {
  const { id } = req.params;

  try {
    // 获取所有审批记录（包括超量校验）
    const records = db.prepare(`
      SELECT ar.*, u.real_name as approver_name
      FROM approval_records ar
      LEFT JOIN users u ON ar.approver_id = u.id
      WHERE ar.contract_id = ?
      ORDER BY ar.step ASC, ar.created_at ASC
    `).all(id);

    // 获取合同审批历史
    const history = db.prepare(`
      SELECT h.*, u.real_name as approver_real_name
      FROM contract_approval_history h
      LEFT JOIN users u ON h.approver_id = u.id
      WHERE h.contract_id = ?
      ORDER BY h.step ASC
    `).all(id);

    res.json({
      success: true,
      data: {
        records,
        history
      }
    });
  } catch (error) {
    console.error('获取审批记录失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审批记录失败: ' + error.message
    });
  }
});

module.exports = router;
