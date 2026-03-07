/**
 * 采购清单路由
 * 实现采购清单及物资明细管理
 * 
 * Task 32: 采购清单 - 项目关联
 * Task 33: 采购清单 - 物资明细
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有采购清单路由附加权限信息
router.use(authMiddleware, attachPermissions);

// ========================================
// 采购清单管理 API
// ========================================

/**
 * GET /api/purchase-lists
 * 获取采购清单列表
 * 查询参数: project_id, status, keyword, page, pageSize
 */
router.get('/', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT pl.*, p.name as project_name, p.project_no,
      (SELECT COUNT(*) FROM purchase_list_items WHERE purchase_list_id = pl.id) as item_count,
      (SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = pl.id) as calculated_total
    FROM purchase_lists pl
    LEFT JOIN projects p ON pl.project_id = p.id
    WHERE 1=1
  `;
  const params = [];
  
  // 项目筛选
  if (project_id) {
    sql += ` AND pl.project_id = ?`;
    params.push(project_id);
  }
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND pl.status = ?`;
    params.push(status);
  }
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (pl.name LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT pl\.\*, p\.name as project_name, p\.project_no,\s*\(SELECT COUNT\(\*\) FROM purchase_list_items WHERE purchase_list_id = pl\.id\) as item_count,\s*\(SELECT SUM\(total_price\) FROM purchase_list_items WHERE purchase_list_id = pl\.id\) as calculated_total/,
    'SELECT COUNT(*) as total'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY pl.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const lists = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: lists,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/purchase-lists/:id
 * 获取采购清单详情
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const list = db.prepare(`
    SELECT pl.*, p.name as project_name, p.project_no
    FROM purchase_lists pl
    LEFT JOIN projects p ON pl.project_id = p.id
    WHERE pl.id = ?
  `).get(id);
  
  if (!list) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  res.json({
    success: true,
    data: list
  });
});

/**
 * POST /api/purchase-lists
 * 创建采购清单
 */
router.post('/', checkPermission('purchase:create'), (req, res) => {
  const { project_id, name, status = 'pending' } = req.body;
  
  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: '采购清单名称不能为空'
    });
  }
  
  // 验证项目是否存在
  const project = db.prepare('SELECT id, name, type FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(400).json({
      success: false,
      message: '关联的项目不存在'
    });
  }
  
  try {
    const result = db.prepare(`
      INSERT INTO purchase_lists (project_id, name, status, total_amount)
      VALUES (?, ?, ?, 0)
    `).run(project_id, name.trim(), status);
    
    const newList = db.prepare(`
      SELECT pl.*, p.name as project_name, p.project_no
      FROM purchase_lists pl
      LEFT JOIN projects p ON pl.project_id = p.id
      WHERE pl.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '采购清单创建成功',
      data: newList
    });
  } catch (error) {
    console.error('创建采购清单失败:', error);
    res.status(500).json({
      success: false,
      message: '创建采购清单失败: ' + error.message
    });
  }
});

/**
 * PUT /api/purchase-lists/:id
 * 更新采购清单
 */
router.put('/:id', checkPermission('purchase:edit'), (req, res) => {
  const { id } = req.params;
  const { name, status } = req.body;
  
  // 检查清单是否存在
  const existingList = db.prepare('SELECT * FROM purchase_lists WHERE id = ?').get(id);
  if (!existingList) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  try {
    db.prepare(`
      UPDATE purchase_lists SET
        name = COALESCE(?, name),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, status, id);
    
    const updatedList = db.prepare(`
      SELECT pl.*, p.name as project_name, p.project_no
      FROM purchase_lists pl
      LEFT JOIN projects p ON pl.project_id = p.id
      WHERE pl.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '采购清单更新成功',
      data: updatedList
    });
  } catch (error) {
    console.error('更新采购清单失败:', error);
    res.status(500).json({
      success: false,
      message: '更新采购清单失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/purchase-lists/:id
 * 删除采购清单
 */
router.delete('/:id', checkPermission('purchase:delete'), (req, res) => {
  const { id } = req.params;
  
  const list = db.prepare('SELECT * FROM purchase_lists WHERE id = ?').get(id);
  if (!list) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  try {
    // 删除清单（级联删除明细项）
    db.prepare('DELETE FROM purchase_lists WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: '采购清单删除成功'
    });
  } catch (error) {
    console.error('删除采购清单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除采购清单失败: ' + error.message
    });
  }
});

// ========================================
// 采购清单物资明细 API (Task 33)
// ========================================

/**
 * GET /api/purchase-lists/:id/items
 * 获取采购清单物资明细
 */
router.get('/:id/items', (req, res) => {
  const { id } = req.params;
  const { sort_field = 'sort_order', sort_order = 'ASC' } = req.query;
  
  // 检查清单是否存在
  const list = db.prepare('SELECT * FROM purchase_lists WHERE id = ?').get(id);
  if (!list) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  // 允许的排序字段
  const allowedSortFields = ['sort_order', 'id', 'material_name', 'quantity', 'unit_price', 'total_price', 'created_at'];
  const allowedSortOrders = ['ASC', 'DESC'];
  
  const safeSortField = allowedSortFields.includes(sort_field) ? sort_field : 'sort_order';
  const safeSortOrder = allowedSortOrders.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'ASC';
  
  // 获取物资明细
  const items = db.prepare(`
    SELECT * FROM purchase_list_items
    WHERE purchase_list_id = ?
    ORDER BY ${safeSortField} ${safeSortOrder}
  `).all(id);
  
  // 计算合计
  const summary = db.prepare(`
    SELECT 
      COUNT(*) as total_items,
      SUM(quantity) as total_quantity,
      SUM(total_price) as total_amount
    FROM purchase_list_items
    WHERE purchase_list_id = ?
  `).get(id);
  
  res.json({
    success: true,
    data: {
      list,
      items,
      summary: {
        total_items: summary.total_items || 0,
        total_quantity: summary.total_quantity || 0,
        total_amount: summary.total_amount || 0
      }
    }
  });
});

/**
 * POST /api/purchase-lists/:id/items
 * 添加物资明细
 */
router.post('/:id/items', checkPermission('purchase:edit'), (req, res) => {
  const { id } = req.params;
  const {
    material_name,
    specification,
    unit,
    quantity,
    unit_price,
    remarks
  } = req.body;
  
  // 检查清单是否存在
  const list = db.prepare('SELECT * FROM purchase_lists WHERE id = ?').get(id);
  if (!list) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  // 验证必填字段
  if (!material_name || !material_name.trim()) {
    return res.status(400).json({
      success: false,
      message: '材料名称不能为空'
    });
  }
  
  if (!quantity || quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: '数量必须大于0'
    });
  }
  
  if (!unit_price || unit_price < 0) {
    return res.status(400).json({
      success: false,
      message: '单价不能为负数'
    });
  }
  
  // 计算金额
  const totalPrice = parseFloat((quantity * unit_price).toFixed(2));
  
  try {
    const transaction = db.transaction(() => {
      // 获取当前最大排序号
      const maxSort = db.prepare(`
        SELECT MAX(sort_order) as max_sort 
        FROM purchase_list_items 
        WHERE purchase_list_id = ?
      `).get(id);
      const sortOrder = (maxSort?.max_sort || 0) + 1;
      
      // 插入物资明细
      const result = db.prepare(`
        INSERT INTO purchase_list_items (
          purchase_list_id, material_name, specification, unit,
          quantity, unit_price, total_price, remarks, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        material_name.trim(),
        specification || null,
        unit || null,
        quantity,
        unit_price,
        totalPrice,
        remarks || null,
        sortOrder
      );
      
      // 更新清单总金额
      db.prepare(`
        UPDATE purchase_lists SET
          total_amount = (SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id, id);
      
      return result.lastInsertRowid;
    });
    
    const itemId = transaction();
    
    const newItem = db.prepare(`
      SELECT * FROM purchase_list_items WHERE id = ?
    `).get(itemId);
    
    res.json({
      success: true,
      message: '物资添加成功',
      data: newItem
    });
  } catch (error) {
    console.error('添加物资失败:', error);
    res.status(500).json({
      success: false,
      message: '添加物资失败: ' + error.message
    });
  }
});

/**
 * PUT /api/purchase-lists/:id/items/:itemId
 * 更新物资明细
 */
router.put('/:id/items/:itemId', checkPermission('purchase:edit'), (req, res) => {
  const { id, itemId } = req.params;
  const {
    material_name,
    specification,
    unit,
    quantity,
    unit_price,
    remarks
  } = req.body;
  
  // 检查清单是否存在
  const list = db.prepare('SELECT * FROM purchase_lists WHERE id = ?').get(id);
  if (!list) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  // 检查物资是否存在
  const item = db.prepare(`
    SELECT * FROM purchase_list_items 
    WHERE id = ? AND purchase_list_id = ?
  `).get(itemId, id);
  
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '物资不存在'
    });
  }
  
  // 验证必填字段
  if (material_name !== undefined && !material_name?.trim()) {
    return res.status(400).json({
      success: false,
      message: '材料名称不能为空'
    });
  }
  
  if (quantity !== undefined && quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: '数量必须大于0'
    });
  }
  
  if (unit_price !== undefined && unit_price < 0) {
    return res.status(400).json({
      success: false,
      message: '单价不能为负数'
    });
  }
  
  // 使用传入值或保留原值
  const finalQuantity = quantity !== undefined ? quantity : item.quantity;
  const finalUnitPrice = unit_price !== undefined ? unit_price : item.unit_price;
  const totalPrice = parseFloat((finalQuantity * finalUnitPrice).toFixed(2));
  
  try {
    const transaction = db.transaction(() => {
      // 更新物资明细
      db.prepare(`
        UPDATE purchase_list_items SET
          material_name = COALESCE(?, material_name),
          specification = COALESCE(?, specification),
          unit = COALESCE(?, unit),
          quantity = COALESCE(?, quantity),
          unit_price = COALESCE(?, unit_price),
          total_price = ?,
          remarks = COALESCE(?, remarks)
        WHERE id = ?
      `).run(
        material_name?.trim(),
        specification,
        unit,
        quantity,
        unit_price,
        totalPrice,
        remarks,
        itemId
      );
      
      // 更新清单总金额
      db.prepare(`
        UPDATE purchase_lists SET
          total_amount = (SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = ?),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id, id);
    });
    
    transaction();
    
    const updatedItem = db.prepare(`
      SELECT * FROM purchase_list_items WHERE id = ?
    `).get(itemId);
    
    res.json({
      success: true,
      message: '物资更新成功',
      data: updatedItem
    });
  } catch (error) {
    console.error('更新物资失败:', error);
    res.status(500).json({
      success: false,
      message: '更新物资失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/purchase-lists/:id/items/:itemId
 * 删除物资明细
 */
router.delete('/:id/items/:itemId', checkPermission('purchase:edit'), (req, res) => {
  const { id, itemId } = req.params;
  
  // 检查物资是否存在
  const item = db.prepare(`
    SELECT * FROM purchase_list_items 
    WHERE id = ? AND purchase_list_id = ?
  `).get(itemId, id);
  
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '物资不存在'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 删除物资
      db.prepare('DELETE FROM purchase_list_items WHERE id = ?').run(itemId);
      
      // 更新清单总金额
      db.prepare(`
        UPDATE purchase_lists SET
          total_amount = COALESCE(
            (SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = ?),
            0
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id, id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '物资删除成功'
    });
  } catch (error) {
    console.error('删除物资失败:', error);
    res.status(500).json({
      success: false,
      message: '删除物资失败: ' + error.message
    });
  }
});

/**
 * PUT /api/purchase-lists/:id/items/:itemId/sort
 * 更新物资排序
 */
router.put('/:id/items/:itemId/sort', checkPermission('purchase:edit'), (req, res) => {
  const { id, itemId } = req.params;
  const { sort_order } = req.body;
  
  if (sort_order === undefined || sort_order < 0) {
    return res.status(400).json({
      success: false,
      message: '排序号无效'
    });
  }
  
  // 检查物资是否存在
  const item = db.prepare(`
    SELECT * FROM purchase_list_items 
    WHERE id = ? AND purchase_list_id = ?
  `).get(itemId, id);
  
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '物资不存在'
    });
  }
  
  try {
    db.prepare(`
      UPDATE purchase_list_items SET sort_order = ? WHERE id = ?
    `).run(sort_order, itemId);
    
    res.json({
      success: true,
      message: '排序更新成功'
    });
  } catch (error) {
    console.error('更新排序失败:', error);
    res.status(500).json({
      success: false,
      message: '更新排序失败: ' + error.message
    });
  }
});

/**
 * POST /api/purchase-lists/:id/items/batch
 * 批量添加物资明细
 */
router.post('/:id/items/batch', checkPermission('purchase:edit'), (req, res) => {
  const { id } = req.params;
  const { items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '物资列表不能为空'
    });
  }
  
  // 检查清单是否存在
  const list = db.prepare('SELECT * FROM purchase_lists WHERE id = ?').get(id);
  if (!list) {
    return res.status(404).json({
      success: false,
      message: '采购清单不存在'
    });
  }
  
  try {
    const results = {
      total: items.length,
      success: 0,
      failed: 0,
      errors: []
    };
    
    const transaction = db.transaction(() => {
      // 获取当前最大排序号
      const maxSort = db.prepare(`
        SELECT MAX(sort_order) as max_sort 
        FROM purchase_list_items 
        WHERE purchase_list_id = ?
      `).get(id);
      let sortOrder = (maxSort?.max_sort || 0) + 1;
      
      items.forEach((item, index) => {
        const { material_name, specification, unit, quantity, unit_price, remarks } = item;
        
        if (!material_name || !quantity || quantity <= 0 || !unit_price || unit_price < 0) {
          results.failed++;
          results.errors.push({ row: index + 1, message: '缺少必填字段或数值无效' });
          return;
        }
        
        const totalPrice = parseFloat((quantity * unit_price).toFixed(2));
        
        try {
          db.prepare(`
            INSERT INTO purchase_list_items (
              purchase_list_id, material_name, specification, unit,
              quantity, unit_price, total_price, remarks, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            material_name.trim(),
            specification || null,
            unit || null,
            quantity,
            unit_price,
            totalPrice,
            remarks || null,
            sortOrder++
          );
          
          results.success++;
        } catch (e) {
          results.failed++;
          results.errors.push({ row: index + 1, message: e.message });
        }
      });
      
      // 更新清单总金额
      db.prepare(`
        UPDATE purchase_lists SET
          total_amount = COALESCE(
            (SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = ?),
            0
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id, id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: `批量添加完成: 成功 ${results.success}, 失败 ${results.failed}`,
      data: results
    });
  } catch (error) {
    console.error('批量添加物资失败:', error);
    res.status(500).json({
      success: false,
      message: '批量添加物资失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase-lists/by-project/:projectId
 * 根据项目ID获取采购清单列表
 */
router.get('/by-project/:projectId', (req, res) => {
  const { projectId } = req.params;
  
  const lists = db.prepare(`
    SELECT pl.*, p.name as project_name, p.project_no,
      (SELECT COUNT(*) FROM purchase_list_items WHERE purchase_list_id = pl.id) as item_count
    FROM purchase_lists pl
    LEFT JOIN projects p ON pl.project_id = p.id
    WHERE pl.project_id = ?
    ORDER BY pl.created_at DESC
  `).all(projectId);
  
  res.json({
    success: true,
    data: lists
  });
});

// ========================================
// Task 34: 批量采购与零星采购 API
// ========================================

/**
 * GET /api/purchase-lists/batch-orders
 * 获取批量采购订单列表
 */
router.get('/batch-orders', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT bpo.*, p.name as project_name, p.project_no, s.name as supplier_name,
      (SELECT COUNT(*) FROM batch_purchase_order_items WHERE batch_order_id = bpo.id) as item_count,
      (SELECT SUM(total_price) FROM batch_purchase_order_items WHERE batch_order_id = bpo.id) as calculated_total
    FROM batch_purchase_orders bpo
    LEFT JOIN projects p ON bpo.project_id = p.id
    LEFT JOIN suppliers s ON bpo.supplier_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (project_id) {
    sql += ` AND bpo.project_id = ?`;
    params.push(project_id);
  }

  if (status && status !== 'all') {
    sql += ` AND bpo.status = ?`;
    params.push(status);
  }

  if (keyword) {
    sql += ` AND (bpo.batch_no LIKE ? OR p.name LIKE ? OR s.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const countSql = sql.replace(
    /SELECT bpo\.\*, p\.name as project_name[\s\S]*?WHERE 1=1/,
    'SELECT COUNT(*) as total FROM batch_purchase_orders bpo LEFT JOIN projects p ON bpo.project_id = p.id LEFT JOIN suppliers s ON bpo.supplier_id = s.id WHERE 1=1'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;

  sql += ` ORDER BY bpo.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const orders = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: orders,
    pagination: { page: parseInt(page), pageSize: parseInt(pageSize), total }
  });
});

/**
 * POST /api/purchase-lists/batch
 * 创建批量采购
 * 从采购清单中选择物资创建批量采购订单
 */
router.post('/batch', checkPermission('purchase:create'), (req, res) => {
  const { project_id, supplier_id, purchase_list_ids, items, remark } = req.body;
  const userId = req.user?.id;

  if (!project_id) {
    return res.status(400).json({ success: false, message: '请选择项目' });
  }

  if (!supplier_id) {
    return res.status(400).json({ success: false, message: '请选择供应商' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: '请添加采购物资' });
  }

  try {
    const result = db.transaction(() => {
      // 生成批量采购编号
      const date = new Date();
      const batchNo = `BP${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

      // 计算总金额
      const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price || 0), 0);

      // 创建批量采购订单
      const orderResult = db.prepare(`
        INSERT INTO batch_purchase_orders (batch_no, project_id, supplier_id, total_amount, status, remark, creator_id)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(batchNo, project_id, supplier_id, totalAmount, remark || null, userId);

      const batchOrderId = orderResult.lastInsertRowid;

      // 添加订单明细
      items.forEach((item, index) => {
        const totalPrice = parseFloat((item.quantity * item.unit_price).toFixed(2));
        db.prepare(`
          INSERT INTO batch_purchase_order_items (
            batch_order_id, purchase_list_item_id, material_name, specification,
            unit, quantity, unit_price, total_price, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          batchOrderId,
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

      // 更新采购清单的批量采购关联
      if (purchase_list_ids && Array.isArray(purchase_list_ids)) {
        purchase_list_ids.forEach(listId => {
          db.prepare(`
            UPDATE purchase_lists SET
              batch_purchase_order_id = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(batchOrderId, listId);

          // 更新清单项的批量采购标记
          db.prepare(`
            UPDATE purchase_list_items SET
              is_batch_purchase = 1,
              batch_purchase_order_id = ?,
              batch_id = ?
            WHERE purchase_list_id = ?
          `).run(batchOrderId, batchOrderId, listId);
        });
      }

      // 记录操作日志
      db.prepare(`
        INSERT INTO batch_purchase_logs (batch_order_id, action, details, operator_id)
        VALUES (?, 'create', ?, ?)
      `).run(batchOrderId, `创建批量采购订单，共${items.length}项物资`, userId);

      return { batchOrderId, batchNo };
    })();

    res.json({
      success: true,
      message: '批量采购创建成功',
      data: {
        id: result.batchOrderId,
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
 * POST /api/purchase-lists/sporadic
 * 创建零星采购
 * 需要检查是否存在批量采购记录，以及零星采购是否超过阈值
 */
router.post('/sporadic', checkPermission('purchase:create'), (req, res) => {
  const { project_id, purchase_list_id, items, remark } = req.body;
  const userId = req.user?.id;

  if (!project_id) {
    return res.status(400).json({ success: false, message: '请选择项目' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: '请添加采购物资' });
  }

  try {
    const result = db.transaction(() => {
      // 检查项目是否有批量采购记录
      const batchOrders = db.prepare(`
        SELECT * FROM batch_purchase_orders WHERE project_id = ? AND status != 'cancelled'
      `).all(project_id);

      if (!batchOrders || batchOrders.length === 0) {
        throw new Error('该项目没有批量采购记录，无法进行零星采购');
      }

      // 计算批量采购总金额
      const batchTotalAmount = batchOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);

      // 计算零星采购金额
      const sporadicAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price || 0), 0);

      // 获取已存在的零星采购总额
      const existingSporadic = db.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM purchase_lists
        WHERE project_id = ? AND sporadic_purchase = 1
      `).get(project_id);

      const totalSporadicAmount = (existingSporadic?.total || 0) + sporadicAmount;

      // 计算零星采购占比（默认阈值15%）
      const threshold = 15.0;
      const percentage = batchTotalAmount > 0 ? (totalSporadicAmount / batchTotalAmount) * 100 : 0;

      // 生成零星采购清单编号
      const date = new Date();
      const listId = `SP${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

      // 创建零星采购清单
      const listResult = db.prepare(`
        INSERT INTO purchase_lists (project_id, name, list_id, status, total_amount, sporadic_purchase, batch_purchase_threshold)
        VALUES (?, ?, ?, 'pending', ?, 1, ?)
      `).run(project_id, `零星采购-${listId}`, listId, sporadicAmount, threshold);

      const newListId = listResult.lastInsertRowid;

      // 添加物资明细
      let sortOrder = 1;
      items.forEach(item => {
        const totalPrice = parseFloat((item.quantity * item.unit_price).toFixed(2));
        db.prepare(`
          INSERT INTO purchase_list_items (
            purchase_list_id, material_name, specification, unit,
            quantity, unit_price, total_price, remarks, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newListId,
          item.material_name,
          item.specification || null,
          item.unit || null,
          item.quantity,
          item.unit_price,
          totalPrice,
          item.remark || null,
          sortOrder++
        );
      });

      // 检查是否需要生成预警
      let warning = null;
      if (percentage >= threshold) {
        const warningLevel = percentage >= threshold * 1.5 ? 'danger' : 'warning';
        const warningMessage = `零星采购超过批量采购总额 ${threshold}%，当前占比 ${percentage.toFixed(2)}%`;

        db.prepare(`
          INSERT INTO batch_purchase_warnings (project_id, purchase_list_id, threshold, actual_percent, warning_level, message, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `).run(project_id, newListId, threshold, percentage.toFixed(2), warningLevel, warningMessage);

        warning = { level: warningLevel, message: warningMessage, percentage: percentage.toFixed(2) };
      }

      // 记录操作日志
      db.prepare(`
        INSERT INTO batch_purchase_logs (purchase_list_id, action, details, operator_id)
        VALUES (?, 'sporadic_create', ?, ?)
      `).run(newListId, `创建零星采购清单，共${items.length}项物资，金额${sporadicAmount.toFixed(2)}`, userId);

      return { listId: newListId, listId: listId, warning };
    })();

    const response = {
      success: true,
      message: '零星采购创建成功',
      data: {
        id: result.listId,
        list_id: result.listId
      }
    };

    if (result.warning) {
      response.warning = result.warning;
    }

    res.json(response);
  } catch (error) {
    console.error('创建零星采购失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '创建零星采购失败'
    });
  }
});

/**
 * GET /api/purchase-lists/sporadic/:id/items
 * 获取零星采购详情
 */
router.get('/sporadic/:id/items', (req, res) => {
  const { id } = req.params;

  const list = db.prepare(`
    SELECT pl.*, p.name as project_name, p.project_no
    FROM purchase_lists pl
    LEFT JOIN projects p ON pl.project_id = p.id
    WHERE pl.id = ? AND pl.sporadic_purchase = 1
  `).get(id);

  if (!list) {
    return res.status(404).json({
      success: false,
      message: '零星采购清单不存在'
    });
  }

  const items = db.prepare(`
    SELECT * FROM purchase_list_items
    WHERE purchase_list_id = ?
    ORDER BY sort_order, id
  `).all(id);

  // 获取预警信息
  const warnings = db.prepare(`
    SELECT * FROM batch_purchase_warnings
    WHERE purchase_list_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(id);

  // 计算汇总
  const summary = {
    total_items: items.length,
    total_quantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
    total_amount: items.reduce((sum, item) => sum + (item.total_price || 0), 0)
  };

  res.json({
    success: true,
    data: {
      list,
      items,
      summary,
      warnings
    }
  });
});

/**
 * PUT /api/purchase-lists/sporadic/:id/items/:itemId
 * 更新零星采购物资明细
 */
router.put('/sporadic/:id/items/:itemId', checkPermission('purchase:edit'), (req, res) => {
  const { id, itemId } = req.params;
  const { material_name, specification, unit, quantity, unit_price, remarks } = req.body;

  // 检查是否为零星采购
  const list = db.prepare(`
    SELECT * FROM purchase_lists WHERE id = ? AND sporadic_purchase = 1
  `).get(id);

  if (!list) {
    return res.status(404).json({
      success: false,
      message: '零星采购清单不存在'
    });
  }

  const item = db.prepare(`
    SELECT * FROM purchase_list_items WHERE id = ? AND purchase_list_id = ?
  `).get(itemId, id);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: '物资不存在'
    });
  }

  const finalQuantity = quantity !== undefined ? quantity : item.quantity;
  const finalUnitPrice = unit_price !== undefined ? unit_price : item.unit_price;
  const totalPrice = parseFloat((finalQuantity * finalUnitPrice).toFixed(2));

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE purchase_list_items SET
          material_name = COALESCE(?, material_name),
          specification = COALESCE(?, specification),
          unit = COALESCE(?, unit),
          quantity = COALESCE(?, quantity),
          unit_price = COALESCE(?, unit_price),
          total_price = ?,
          remarks = COALESCE(?, remarks)
        WHERE id = ?
      `).run(material_name?.trim(), specification, unit, quantity, unit_price, totalPrice, remarks, itemId);

      // 更新清单总金额
      db.prepare(`
        UPDATE purchase_lists SET
          total_amount = COALESCE((SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = ?), 0),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id, id);
    })();

    const updatedItem = db.prepare(`SELECT * FROM purchase_list_items WHERE id = ?`).get(itemId);

    res.json({
      success: true,
      message: '物资更新成功',
      data: updatedItem
    });
  } catch (error) {
    console.error('更新零星采购物资失败:', error);
    res.status(500).json({
      success: false,
      message: '更新失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/purchase-lists/sporadic/:id/items/:itemId
 * 删除零星采购物资明细
 */
router.delete('/sporadic/:id/items/:itemId', checkPermission('purchase:edit'), (req, res) => {
  const { id, itemId } = req.params;

  // 检查是否为零星采购
  const list = db.prepare(`
    SELECT * FROM purchase_lists WHERE id = ? AND sporadic_purchase = 1
  `).get(id);

  if (!list) {
    return res.status(404).json({
      success: false,
      message: '零星采购清单不存在'
    });
  }

  const item = db.prepare(`
    SELECT * FROM purchase_list_items WHERE id = ? AND purchase_list_id = ?
  `).get(itemId, id);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: '物资不存在'
    });
  }

  try {
    db.transaction(() => {
      db.prepare('DELETE FROM purchase_list_items WHERE id = ?').run(itemId);

      // 更新清单总金额
      db.prepare(`
        UPDATE purchase_lists SET
          total_amount = COALESCE((SELECT SUM(total_price) FROM purchase_list_items WHERE purchase_list_id = ?), 0),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id, id);
    })();

    res.json({
      success: true,
      message: '物资删除成功'
    });
  } catch (error) {
    console.error('删除零星采购物资失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase-lists/sporadic/:id/items/export
 * 导出零星采购清单
 */
router.get('/sporadic/:id/items/export', (req, res) => {
  const { id } = req.params;

  const list = db.prepare(`
    SELECT pl.*, p.name as project_name, p.project_no
    FROM purchase_lists pl
    LEFT JOIN projects p ON pl.project_id = p.id
    WHERE pl.id = ? AND pl.sporadic_purchase = 1
  `).get(id);

  if (!list) {
    return res.status(404).json({
      success: false,
      message: '零星采购清单不存在'
    });
  }

  const items = db.prepare(`
    SELECT * FROM purchase_list_items
    WHERE purchase_list_id = ?
    ORDER BY sort_order, id
  `).all(id);

  // 构建 CSV 数据
  const headers = ['序号', '材料名称', '规格型号', '单位', '数量', '单价', '总价', '备注'];
  const rows = items.map((item, index) => [
    index + 1,
    item.material_name,
    item.specification || '',
    item.unit || '',
    item.quantity,
    item.unit_price,
    item.total_price,
    item.remarks || ''
  ]);

  const totalAmount = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
  rows.push(['', '', '', '', '', '合计:', totalAmount, '']);

  const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=sporadic_${list.list_id || id}.csv`);
  res.send('\ufeff' + csvContent); // 添加 BOM 以支持中文
});

/**
 * POST /api/purchase-lists/sporadic/import
 * 导入批量采购清单（用于零星采购）
 */
router.post('/sporadic/import', checkPermission('purchase:create'), (req, res) => {
  const { project_id, items } = req.body;

  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择项目'
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '导入数据不能为空'
    });
  }

  try {
    const result = db.transaction(() => {
      let successCount = 0;
      let failedCount = 0;
      const errors = [];
      let totalAmount = 0;
      let totalQuantity = 0;

      // 检查是否有批量采购记录
      const batchOrders = db.prepare(`
        SELECT * FROM batch_purchase_orders WHERE project_id = ? AND status != 'cancelled'
      `).all(project_id);

      const hasBatchPurchase = batchOrders && batchOrders.length > 0;

      items.forEach((item, index) => {
        const { material_name, specification, unit, quantity, unit_price, remarks } = item;

        if (!material_name || !quantity || quantity <= 0 || unit_price === undefined) {
          failedCount++;
          errors.push({ row: index + 1, message: '缺少必填字段或数值无效' });
          return;
        }

        const itemTotal = parseFloat((quantity * unit_price).toFixed(2));
        totalAmount += itemTotal;
        totalQuantity += parseFloat(quantity);
        successCount++;
      });

      return {
        success: successCount,
        failed: failedCount,
        errors,
        total_amount: totalAmount.toFixed(2),
        total_quantity: totalQuantity.toFixed(2),
        has_batch_purchase: hasBatchPurchase
      };
    })();

    res.json({
      success: true,
      message: `导入预览完成: 有效 ${result.success} 条, 无效 ${result.failed} 条`,
      data: result
    });
  } catch (error) {
    console.error('导入采购清单失败:', error);
    res.status(500).json({
      success: false,
      message: '导入失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase-lists/warnings
 * 获取批量采购预警列表
 */
router.get('/warnings', (req, res) => {
  const { project_id, status, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT bpw.*, p.name as project_name, p.project_no, pl.name as list_name
    FROM batch_purchase_warnings bpw
    LEFT JOIN projects p ON bpw.project_id = p.id
    LEFT JOIN purchase_lists pl ON bpw.purchase_list_id = pl.id
    WHERE 1=1
  `;
  const params = [];

  if (project_id) {
    sql += ` AND bpw.project_id = ?`;
    params.push(project_id);
  }

  if (status && status !== 'all') {
    sql += ` AND bpw.status = ?`;
    params.push(status);
  }

  sql += ` ORDER BY bpw.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const warnings = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: warnings
  });
});

/**
 * GET /api/purchase-lists/overview
 * 获取采购清单概览（用于列表页展示）
 */
router.get('/overview', (req, res) => {
  const { project_id } = req.query;

  let projectFilter = '';
  const params = [];

  if (project_id) {
    projectFilter = ' AND pl.project_id = ?';
    params.push(project_id);
  }

  // 获取批量采购订单统计
  const batchStats = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(total_amount), 0) as total_amount
    FROM batch_purchase_orders
    WHERE status != 'cancelled' ${project_id ? ' AND project_id = ?' : ''}
  `).get(...(project_id ? [project_id] : []));

  // 获取零星采购统计
  const sporadicStats = db.prepare(`
    SELECT
      COUNT(*) as total_lists,
      COALESCE(SUM(total_amount), 0) as total_amount
    FROM purchase_lists
    WHERE sporadic_purchase = 1 ${project_id ? ' AND project_id = ?' : ''}
  `).get(...(project_id ? [project_id] : []));

  // 获取活跃预警
  const activeWarnings = db.prepare(`
    SELECT COUNT(*) as count
    FROM batch_purchase_warnings
    WHERE status = 'active' ${project_id ? ' AND project_id = ?' : ''}
  `).get(...(project_id ? [project_id] : []));

  // 计算零星采购占比
  const batchTotal = batchStats?.total_amount || 0;
  const sporadicTotal = sporadicStats?.total_amount || 0;
  const sporadicPercent = batchTotal > 0 ? ((sporadicTotal / batchTotal) * 100).toFixed(2) : '0.00';

  res.json({
    success: true,
    data: {
      batch_purchase: {
        total_orders: batchStats?.total_orders || 0,
        total_amount: batchTotal
      },
      sporadic_purchase: {
        total_lists: sporadicStats?.total_lists || 0,
        total_amount: sporadicTotal,
        percent_of_batch: sporadicPercent
      },
      warnings: {
        active_count: activeWarnings?.count || 0
      }
    }
  });
});

/**
 * GET /api/purchase-lists/suppliers
 * 获取供应商列表（用于采购选择）
 */
router.get('/suppliers', (req, res) => {
  const { keyword } = req.query;

  let sql = `SELECT * FROM suppliers WHERE status = 'active'`;
  const params = [];

  if (keyword) {
    sql += ` AND name LIKE ?`;
    params.push(`%${keyword}%`);
  }

  sql += ` ORDER BY name`;

  const suppliers = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: suppliers
  });
});

/**
 * DELETE /api/purchase-lists/sporadic/:id
 * 删除零星采购清单
 */
router.delete('/sporadic/:id', checkPermission('purchase:delete'), (req, res) => {
  const { id } = req.params;

  const list = db.prepare(`
    SELECT * FROM purchase_lists WHERE id = ? AND sporadic_purchase = 1
  `).get(id);

  if (!list) {
    return res.status(404).json({
      success: false,
      message: '零星采购清单不存在'
    });
  }

  try {
    db.transaction(() => {
      // 删除物资明细
      db.prepare('DELETE FROM purchase_list_items WHERE purchase_list_id = ?').run(id);
      // 删除清单
      db.prepare('DELETE FROM purchase_lists WHERE id = ?').run(id);
      // 删除相关预警
      db.prepare('DELETE FROM batch_purchase_warnings WHERE purchase_list_id = ?').run(id);
    })();

    res.json({
      success: true,
      message: '零星采购清单删除成功'
    });
  } catch (error) {
    console.error('删除零星采购清单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

// ========================================
// Task 36: 零星采购管理 API
// ========================================

/**
 * 生成零星采购编号
 * 格式: LX + YYMM + 3位序号
 */
function generateSporadicNo() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `LX${year}${month}`;

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM sporadic_purchases 
    WHERE sporadic_no LIKE ?
  `).get(`${prefix}%`);

  const seq = String((result?.count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/**
 * 检查零星采购是否超出限额
 * 限额规则：累计零星采购金额不超过项目批量采购的1.5%
 */
function checkSporadicLimit(projectId, newAmount) {
  // 获取项目批量采购总额（从支出合同）
  const batchTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM contracts
    WHERE project_id = ? AND type = 'expense' AND status != 'cancelled'
  `).get(projectId);

  const batchAmount = batchTotal?.total || 0;

  // 获取已有零星采购总额
  const sporadicTotal = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM sporadic_purchases
    WHERE project_id = ? AND status != 'cancelled'
  `).get(projectId);

  const existingAmount = sporadicTotal?.total || 0;
  const totalAmount = existingAmount + newAmount;
  const limitAmount = batchAmount * 0.015;
  const percentage = batchAmount > 0 ? (totalAmount / batchAmount) * 100 : 0;

  return {
    batchAmount,
    existingAmount,
    newAmount,
    totalAmount,
    limitAmount,
    percentage: parseFloat(percentage.toFixed(2)),
    isExcessive: percentage > 1.5
  };
}

/**
 * GET /api/purchase/sporadic
 * 获取零星采购列表
 */
router.get('/sporadic', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT sp.*, p.name as project_name, p.project_no,
      (SELECT COUNT(*) FROM sporadic_purchase_items WHERE sporadic_id = sp.id) as item_count,
      u.real_name as creator_name
    FROM sporadic_purchases sp
    LEFT JOIN projects p ON sp.project_id = p.id
    LEFT JOIN users u ON sp.creator_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (project_id) {
    sql += ` AND sp.project_id = ?`;
    params.push(project_id);
  }

  if (status && status !== 'all') {
    sql += ` AND sp.status = ?`;
    params.push(status);
  }

  if (keyword) {
    sql += ` AND (sp.sporadic_no LIKE ? OR sp.reason LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 获取总数
  const countSql = sql.replace(
    /SELECT sp\.\*, p\.name as project_name[\s\S]*?WHERE 1=1/,
    'SELECT COUNT(*) as total FROM sporadic_purchases sp LEFT JOIN projects p ON sp.project_id = p.id WHERE 1=1'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult?.total || 0;

  sql += ` ORDER BY sp.created_at DESC LIMIT ? OFFSET ?`;
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
 * POST /api/purchase/sporadic
 * 创建零星采购
 */
router.post('/sporadic', checkPermission('purchase:create'), (req, res) => {
  const { project_id, reason, items, remark } = req.body;
  const userId = req.user?.id;

  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写采购原因'
    });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请添加物资清单'
    });
  }

  // 验证项目是否存在
  const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(400).json({
      success: false,
      message: '项目不存在'
    });
  }

  try {
    const result = db.transaction(() => {
      const sporadicNo = generateSporadicNo();
      
      // 计算总金额
      let totalAmount = 0;
      items.forEach(item => {
        if (item.quantity > 0 && item.unit_price >= 0) {
          totalAmount += item.quantity * item.unit_price;
        }
      });

      // 检查是否超限
      const limitCheck = checkSporadicLimit(project_id, totalAmount);

      // 创建零星采购记录
      const insertResult = db.prepare(`
        INSERT INTO sporadic_purchases (
          sporadic_no, project_id, reason, status, total_amount, remark, creator_id
        ) VALUES (?, ?, ?, 'draft', ?, ?, ?)
      `).run(sporadicNo, project_id, reason.trim(), totalAmount, remark || null, userId);

      const sporadicId = insertResult.lastInsertRowid;

      // 添加物资明细
      const insertItem = db.prepare(`
        INSERT INTO sporadic_purchase_items (
          sporadic_id, material_name, specification, unit, quantity, unit_price, total_price, remark, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      items.forEach((item, index) => {
        const totalPrice = (item.quantity || 0) * (item.unit_price || 0);
        insertItem.run(
          sporadicId,
          item.material_name,
          item.specification || null,
          item.unit || null,
          item.quantity || 0,
          item.unit_price || 0,
          totalPrice,
          item.remark || null,
          index + 1
        );
      });

      return { sporadicId, sporadicNo, limitCheck };
    })();

    res.json({
      success: true,
      message: '零星采购创建成功',
      data: {
        id: result.sporadicId,
        sporadic_no: result.sporadicNo,
        limitCheck: result.limitCheck
      }
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
 * GET /api/purchase/sporadic/:id
 * 获取零星采购详情
 */
router.get('/sporadic/:id', (req, res) => {
  const { id } = req.params;

  const purchase = db.prepare(`
    SELECT sp.*, p.name as project_name, p.project_no,
      u.real_name as creator_name
    FROM sporadic_purchases sp
    LEFT JOIN projects p ON sp.project_id = p.id
    LEFT JOIN users u ON sp.creator_id = u.id
    WHERE sp.id = ?
  `).get(id);

  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }

  // 获取物资明细
  const items = db.prepare(`
    SELECT * FROM sporadic_purchase_items 
    WHERE sporadic_id = ? 
    ORDER BY sort_order, id
  `).all(id);

  // 获取审批记录
  const approvals = db.prepare(`
    SELECT spa.*, u.real_name as approver_name
    FROM sporadic_purchase_approvals spa
    LEFT JOIN users u ON spa.approver_id = u.id
    WHERE spa.sporadic_id = ?
    ORDER BY spa.step
  `).all(id);

  res.json({
    success: true,
    data: {
      ...purchase,
      items,
      approvals
    }
  });
});

/**
 * PUT /api/purchase/sporadic/:id
 * 更新零星采购
 */
router.put('/sporadic/:id', checkPermission('purchase:edit'), (req, res) => {
  const { id } = req.params;
  const { reason, items, remark, status } = req.body;

  const purchase = db.prepare('SELECT * FROM sporadic_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }

  // 只有草稿状态可以编辑
  if (purchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的零星采购可以编辑'
    });
  }

  try {
    db.transaction(() => {
      // 更新主表
      if (reason || remark !== undefined || status) {
        db.prepare(`
          UPDATE sporadic_purchases SET
            reason = COALESCE(?, reason),
            remark = COALESCE(?, remark),
            status = COALESCE(?, status),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(reason?.trim(), remark, status, id);
      }

      // 更新物资明细
      if (items && Array.isArray(items)) {
        // 删除原有明细
        db.prepare('DELETE FROM sporadic_purchase_items WHERE sporadic_id = ?').run(id);

        // 重新插入
        let totalAmount = 0;
        const insertItem = db.prepare(`
          INSERT INTO sporadic_purchase_items (
            sporadic_id, material_name, specification, unit, quantity, unit_price, total_price, remark, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        items.forEach((item, index) => {
          const totalPrice = (item.quantity || 0) * (item.unit_price || 0);
          totalAmount += totalPrice;
          insertItem.run(
            id,
            item.material_name,
            item.specification || null,
            item.unit || null,
            item.quantity || 0,
            item.unit_price || 0,
            totalPrice,
            item.remark || null,
            index + 1
          );
        });

        // 更新总金额
        db.prepare(`
          UPDATE sporadic_purchases SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(totalAmount, id);
      }
    })();

    const updated = db.prepare(`
      SELECT sp.*, p.name as project_name
      FROM sporadic_purchases sp
      LEFT JOIN projects p ON sp.project_id = p.id
      WHERE sp.id = ?
    `).get(id);

    res.json({
      success: true,
      message: '更新成功',
      data: updated
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
 * DELETE /api/purchase/sporadic/:id
 * 删除零星采购
 */
router.delete('/sporadic/:id', checkPermission('purchase:delete'), (req, res) => {
  const { id } = req.params;

  const purchase = db.prepare('SELECT * FROM sporadic_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }

  // 只有草稿或已拒绝状态可以删除
  if (!['draft', 'rejected'].includes(purchase.status)) {
    return res.status(400).json({
      success: false,
      message: '只有草稿或已拒绝状态的零星采购可以删除'
    });
  }

  try {
    db.transaction(() => {
      // 删除审批记录
      db.prepare('DELETE FROM sporadic_purchase_approvals WHERE sporadic_id = ?').run(id);
      // 删除物资明细
      db.prepare('DELETE FROM sporadic_purchase_items WHERE sporadic_id = ?').run(id);
      // 删除主表
      db.prepare('DELETE FROM sporadic_purchases WHERE id = ?').run(id);
    })();

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
 * POST /api/purchase/sporadic/:id/submit
 * 提交审批
 */
router.post('/sporadic/:id/submit', checkPermission('purchase:create'), (req, res) => {
  const { id } = req.params;

  const purchase = db.prepare('SELECT * FROM sporadic_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }

  if (purchase.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态可以提交审批'
    });
  }

  try {
    db.transaction(() => {
      // 检查是否超限
      const limitCheck = checkSporadicLimit(purchase.project_id, 0);
      const isExcessive = (limitCheck.existingAmount + purchase.total_amount) > limitCheck.limitAmount;

      // 更新状态
      db.prepare(`
        UPDATE sporadic_purchases SET
          status = 'pending',
          approval_step = 1,
          current_approver = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(isExcessive ? 'BUDGET' : 'FINANCE', id);

      // 创建审批流程
      let steps = [];
      if (isExcessive) {
        // 超限需要预算员审批
        steps = [
          { step: 1, step_name: '预算员审批', role: 'BUDGET' },
          { step: 2, step_name: '财务审批', role: 'FINANCE' },
          { step: 3, step_name: '总经理审批', role: 'GM' }
        ];
      } else {
        steps = [
          { step: 1, step_name: '财务审批', role: 'FINANCE' },
          { step: 2, step_name: '总经理审批', role: 'GM' }
        ];
      }

      const insertApproval = db.prepare(`
        INSERT INTO sporadic_purchase_approvals (sporadic_id, step, step_name, role, action)
        VALUES (?, ?, ?, ?, 'pending')
      `);

      steps.forEach(s => {
        insertApproval.run(id, s.step, s.step_name, s.role);
      });
    })();

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
 * POST /api/purchase/sporadic/:id/approve
 * 审批通过
 */
router.post('/sporadic/:id/approve', checkPermission('purchase:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  const purchase = db.prepare('SELECT * FROM sporadic_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }

  if (purchase.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只有待审批状态可以操作'
    });
  }

  try {
    db.transaction(() => {
      // 获取当前步骤
      const currentStep = db.prepare(`
        SELECT * FROM sporadic_purchase_approvals
        WHERE sporadic_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (!currentStep) {
        throw new Error('没有待审批的步骤');
      }

      // 更新审批记录
      db.prepare(`
        UPDATE sporadic_purchase_approvals SET
          action = 'approve',
          approver_id = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentStep.id);

      // 检查是否还有后续步骤
      const nextStep = db.prepare(`
        SELECT * FROM sporadic_purchase_approvals
        WHERE sporadic_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (nextStep) {
        // 更新当前审批人和步骤
        db.prepare(`
          UPDATE sporadic_purchases SET
            approval_step = ?,
            current_approver = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(nextStep.step, nextStep.role, id);
      } else {
        // 审批完成
        db.prepare(`
          UPDATE sporadic_purchases SET
            status = 'approved',
            approval_step = 0,
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
 * POST /api/purchase/sporadic/:id/reject
 * 审批拒绝
 */
router.post('/sporadic/:id/reject', checkPermission('purchase:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }

  const purchase = db.prepare('SELECT * FROM sporadic_purchases WHERE id = ?').get(id);
  if (!purchase) {
    return res.status(404).json({
      success: false,
      message: '零星采购不存在'
    });
  }

  if (purchase.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只有待审批状态可以操作'
    });
  }

  try {
    db.transaction(() => {
      // 更新当前步骤为拒绝
      const currentStep = db.prepare(`
        SELECT * FROM sporadic_purchase_approvals
        WHERE sporadic_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (currentStep) {
        db.prepare(`
          UPDATE sporadic_purchase_approvals SET
            action = 'reject',
            approver_id = ?,
            comment = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, comment, currentStep.id);
      }

      // 更新主表状态
      db.prepare(`
        UPDATE sporadic_purchases SET
          status = 'rejected',
          approval_step = 0,
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
 * GET /api/purchase/sporadic/check-limit
 * 检查零星采购限额
 */
router.get('/sporadic/check-limit', (req, res) => {
  const { project_id, amount } = req.query;

  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请提供项目ID'
    });
  }

  const result = checkSporadicLimit(parseInt(project_id), parseFloat(amount) || 0);

  res.json({
    success: true,
    data: result
  });
});

// ========================================
// Task 37: 零星采购预警 API
// ========================================

const sporadicWarningService = require('../services/sporadicWarning');

/**
 * GET /api/purchase/sporadic/warnings
 * 获取零星采购预警列表
 */
router.get('/sporadic/warnings', (req, res) => {
  const { project_id, status, page = 1, pageSize = 20 } = req.query;

  try {
    const result = sporadicWarningService.getWarnings({
      projectId: project_id ? parseInt(project_id) : null,
      status,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });

    res.json({
      success: true,
      data: result.list,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取预警列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取预警列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase/sporadic/warnings/:id
 * 获取预警详情
 */
router.get('/sporadic/warnings/:id', (req, res) => {
  const { id } = req.params;

  try {
    const warning = sporadicWarningService.getWarningById(parseInt(id));

    if (!warning) {
      return res.status(404).json({
        success: false,
        message: '预警记录不存在'
      });
    }

    res.json({
      success: true,
      data: warning
    });
  } catch (error) {
    console.error('获取预警详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取预警详情失败: ' + error.message
    });
  }
});

/**
 * PUT /api/purchase/sporadic/warnings/:id/handle
 * 处理预警
 */
router.put('/sporadic/warnings/:id/handle', checkPermission('purchase:approve'), (req, res) => {
  const { id } = req.params;
  const { handle_remark, status } = req.body;
  const userId = req.user?.id;

  try {
    const warning = sporadicWarningService.handleWarning(
      parseInt(id),
      userId,
      handle_remark,
      status || 'handled'
    );

    res.json({
      success: true,
      message: '预警处理成功',
      data: warning
    });
  } catch (error) {
    console.error('处理预警失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '处理预警失败'
    });
  }
});

/**
 * GET /api/purchase/sporadic/warnings/stats/:projectId
 * 获取项目预警统计
 */
router.get('/sporadic/warnings/stats/:projectId', (req, res) => {
  const { projectId } = req.params;

  try {
    const stats = sporadicWarningService.getProjectWarningStats(parseInt(projectId));

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取预警统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取预警统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase/sporadic/warnings/check/:projectId
 * 检查项目零星采购限额（带预警信息）
 */
router.get('/sporadic/warnings/check/:projectId', (req, res) => {
  const { projectId } = req.params;

  try {
    const limitCheck = sporadicWarningService.checkSporadicLimit(parseInt(projectId), 0);
    const stats = sporadicWarningService.getProjectWarningStats(parseInt(projectId));

    res.json({
      success: true,
      data: {
        ...limitCheck,
        activeWarningCount: stats.activeWarningCount,
        handledWarningCount: stats.handledWarningCount
      }
    });
  } catch (error) {
    console.error('检查限额失败:', error);
    res.status(500).json({
      success: false,
      message: '检查限额失败: ' + error.message
    });
  }
});

/**
 * POST /api/purchase/sporadic/warnings/check-all
 * 批量检查多个项目的预警状态
 */
router.post('/sporadic/warnings/check-all', (req, res) => {
  const { project_ids } = req.body;

  if (!project_ids || !Array.isArray(project_ids) || project_ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请提供项目ID列表'
    });
  }

  try {
    const results = sporadicWarningService.batchCheckWarningStatus(project_ids);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('批量检查预警失败:', error);
    res.status(500).json({
      success: false,
      message: '批量检查预警失败: ' + error.message
    });
  }
});

// ========================================
// Task 34: 超量采购申请 API
// ========================================

/**
 * 生成超量采购申请编号
 * 规则：OC + YYMMDD + 3位序号
 */
function generateOverageApplyNo() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const prefix = `OC${year}${month}${day}`;

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM overage_applications 
    WHERE apply_no LIKE ?
  `).get(`${prefix}%`);

  const seq = String((result?.count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/**
 * 获取超量采购申请状态文本
 */
function getOverageApplyStatusText(status) {
  const statusMap = {
    pending: '待审批',
    budget_approved: '预算员已审',
    finance_approved: '财务已审',
    approved: '审批通过',
    rejected: '已拒绝',
    cancelled: '已取消'
  };
  return statusMap[status] || status;
}

/**
 * 获取超量类型文本
 */
function getOverageTypeText(type) {
  const typeMap = {
    quantity: '数量超量',
    amount: '金额超量',
    price: '单价超量'
  };
  return typeMap[type] || type;
}

/**
 * GET /api/purchase/overage-apply
 * 获取超量采购申请列表
 * 查询参数: project_id, status, keyword, page, pageSize
 */
router.get('/overage-apply', (req, res) => {
  const { project_id, status, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT oa.*, 
      p.name as project_name, p.project_no,
      pl.name as purchase_list_name,
      u.real_name as creator_name,
      approver.real_name as approver_name
    FROM overage_applications oa
    LEFT JOIN projects p ON oa.project_id = p.id
    LEFT JOIN purchase_lists pl ON oa.purchase_list_id = pl.id
    LEFT JOIN users u ON oa.creator_id = u.id
    LEFT JOIN users approver ON oa.approver_id = approver.id
    WHERE 1=1
  `;
  const params = [];

  // 项目筛选
  if (project_id) {
    sql += ` AND oa.project_id = ?`;
    params.push(project_id);
  }

  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND oa.status = ?`;
    params.push(status);
  }

  // 关键词搜索
  if (keyword) {
    sql += ` AND (oa.apply_no LIKE ? OR oa.item_name LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total FROM overage_applications oa
    LEFT JOIN projects p ON oa.project_id = p.id
    WHERE 1=1
    ${project_id ? ' AND oa.project_id = ?' : ''}
    ${status && status !== 'all' ? ' AND oa.status = ?' : ''}
    ${keyword ? ' AND (oa.apply_no LIKE ? OR oa.item_name LIKE ? OR p.name LIKE ?)' : ''}
  `;

  const countParams = [];
  if (project_id) countParams.push(project_id);
  if (status && status !== 'all') countParams.push(status);
  if (keyword) countParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);

  const countResult = db.prepare(countSql).get(...countParams);
  const total = countResult?.total || 0;

  // 排序和分页
  sql += ` ORDER BY oa.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const list = db.prepare(sql).all(...params);

  res.json({
    success: true,
    data: list.map(item => ({
      ...item,
      status_text: getOverageApplyStatusText(item.status),
      overage_type_text: getOverageTypeText(item.overage_type)
    })),
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/purchase/overage-apply/:id
 * 获取超量采购申请详情
 */
router.get('/overage-apply/:id', (req, res) => {
  const { id } = req.params;

  const item = db.prepare(`
    SELECT oa.*, 
      p.name as project_name, p.project_no,
      pl.name as purchase_list_name,
      u.real_name as creator_name,
      approver.real_name as approver_name
    FROM overage_applications oa
    LEFT JOIN projects p ON oa.project_id = p.id
    LEFT JOIN purchase_lists pl ON oa.purchase_list_id = pl.id
    LEFT JOIN users u ON oa.creator_id = u.id
    LEFT JOIN users approver ON oa.approver_id = approver.id
    WHERE oa.id = ?
  `).get(id);

  if (!item) {
    return res.status(404).json({
      success: false,
      message: '超量采购申请不存在'
    });
  }

  // 获取审批记录
  const approvalRecords = db.prepare(`
    SELECT oaa.*, u.real_name as approver_name
    FROM overage_application_approvals oaa
    LEFT JOIN users u ON oaa.approver_id = u.id
    WHERE oaa.overage_application_id = ?
    ORDER BY oaa.step ASC
  `).all(id);

  res.json({
    success: true,
    data: {
      ...item,
      status_text: getOverageApplyStatusText(item.status),
      overage_type_text: getOverageTypeText(item.overage_type),
      approval_records: approvalRecords
    }
  });
});

/**
 * POST /api/purchase/overage-apply
 * 创建超量采购申请
 */
router.post('/overage-apply', checkPermission('purchase:create'), (req, res) => {
  const {
    project_id,
    purchase_list_id,
    item_name,
    specification,
    unit,
    original_quantity,
    original_price,
    actual_quantity,
    actual_price,
    overage_type,
    reason
  } = req.body;
  const userId = req.user?.id;

  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }

  if (!item_name || !item_name.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写物资名称'
    });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写超量原因'
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

  // 计算超量数量和超量金额
  const overageQuantity = (actual_quantity || 0) - (original_quantity || 0);
  const originalAmount = (original_quantity || 0) * (original_price || 0);
  const actualAmount = (actual_quantity || 0) * (actual_price || 0);
  const overageAmount = actualAmount - originalAmount;

  try {
    const result = db.transaction(() => {
      const applyNo = generateOverageApplyNo();

      // 创建超量采购申请记录
      const insertResult = db.prepare(`
        INSERT INTO overage_applications (
          apply_no, project_id, purchase_list_id, item_name, specification, unit,
          original_quantity, original_price, actual_quantity, actual_price,
          overage_type, overage_quantity, overage_amount, reason, status, creator_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        applyNo,
        project_id,
        purchase_list_id || null,
        item_name.trim(),
        specification || null,
        unit || null,
        original_quantity || 0,
        original_price || 0,
        actual_quantity || 0,
        actual_price || 0,
        overage_type || 'quantity',
        overageQuantity,
        overageAmount,
        reason.trim(),
        userId
      );

      const applyId = insertResult.lastInsertRowid;

      // 创建审批流程
      const approvalSteps = [
        { step: 1, step_name: '预算员审批', role: 'BUDGET' },
        { step: 2, step_name: '财务审批', role: 'FINANCE' },
        { step: 3, step_name: '总经理审批', role: 'GM' }
      ];

      const insertApproval = db.prepare(`
        INSERT INTO overage_application_approvals (
          overage_application_id, step, step_name, role, action
        ) VALUES (?, ?, ?, ?, 'pending')
      `);

      approvalSteps.forEach(s => {
        insertApproval.run(applyId, s.step, s.step_name, s.role);
      });

      return { applyId, applyNo };
    })();

    res.json({
      success: true,
      message: '超量采购申请创建成功',
      data: {
        id: result.applyId,
        apply_no: result.applyNo
      }
    });
  } catch (error) {
    console.error('创建超量采购申请失败:', error);
    res.status(500).json({
      success: false,
      message: '创建超量采购申请失败: ' + error.message
    });
  }
});

/**
 * PUT /api/purchase/overage-apply/:id
 * 更新超量采购申请（仅待审批状态可编辑）
 */
router.put('/overage-apply/:id', checkPermission('purchase:edit'), (req, res) => {
  const { id } = req.params;
  const {
    item_name,
    specification,
    unit,
    original_quantity,
    original_price,
    actual_quantity,
    actual_price,
    overage_type,
    reason
  } = req.body;

  const item = db.prepare('SELECT * FROM overage_applications WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '超量采购申请不存在'
    });
  }

  if (item.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只有待审批状态的申请可以编辑'
    });
  }

  // 重新计算超量数量和超量金额
  const finalOriginalQty = original_quantity !== undefined ? original_quantity : item.original_quantity;
  const finalOriginalPrice = original_price !== undefined ? original_price : item.original_price;
  const finalActualQty = actual_quantity !== undefined ? actual_quantity : item.actual_quantity;
  const finalActualPrice = actual_price !== undefined ? actual_price : item.actual_price;
  
  const overageQuantity = finalActualQty - finalOriginalQty;
  const originalAmount = finalOriginalQty * finalOriginalPrice;
  const actualAmount = finalActualQty * finalActualPrice;
  const overageAmount = actualAmount - originalAmount;

  try {
    db.prepare(`
      UPDATE overage_applications SET
        item_name = COALESCE(?, item_name),
        specification = COALESCE(?, specification),
        unit = COALESCE(?, unit),
        original_quantity = ?,
        original_price = ?,
        actual_quantity = ?,
        actual_price = ?,
        overage_type = COALESCE(?, overage_type),
        overage_quantity = ?,
        overage_amount = ?,
        reason = COALESCE(?, reason),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      item_name?.trim(),
      specification,
      unit,
      finalOriginalQty,
      finalOriginalPrice,
      finalActualQty,
      finalActualPrice,
      overage_type,
      overageQuantity,
      overageAmount,
      reason?.trim(),
      id
    );

    const updated = db.prepare(`
      SELECT oa.*, p.name as project_name
      FROM overage_applications oa
      LEFT JOIN projects p ON oa.project_id = p.id
      WHERE oa.id = ?
    `).get(id);

    res.json({
      success: true,
      message: '更新成功',
      data: {
        ...updated,
        status_text: getOverageApplyStatusText(updated.status),
        overage_type_text: getOverageTypeText(updated.overage_type)
      }
    });
  } catch (error) {
    console.error('更新超量采购申请失败:', error);
    res.status(500).json({
      success: false,
      message: '更新超量采购申请失败: ' + error.message
    });
  }
});

/**
 * POST /api/purchase/overage-apply/:id/approve
 * 审批通过
 */
router.post('/overage-apply/:id/approve', checkPermission('purchase:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  const item = db.prepare('SELECT * FROM overage_applications WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '超量采购申请不存在'
    });
  }

  if (!['pending', 'budget_approved', 'finance_approved'].includes(item.status)) {
    return res.status(400).json({
      success: false,
      message: '该申请不在审批中'
    });
  }

  try {
    db.transaction(() => {
      // 获取当前审批步骤
      const currentStep = db.prepare(`
        SELECT * FROM overage_application_approvals
        WHERE overage_application_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (!currentStep) {
        throw new Error('没有待审批的步骤');
      }

      // 更新审批记录
      db.prepare(`
        UPDATE overage_application_approvals SET
          action = 'approve',
          approver_id = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentStep.id);

      // 检查是否还有后续步骤
      const nextStep = db.prepare(`
        SELECT * FROM overage_application_approvals
        WHERE overage_application_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (nextStep) {
        // 根据步骤更新状态
        let newStatus = item.status;
        if (currentStep.role === 'BUDGET') {
          newStatus = 'budget_approved';
        } else if (currentStep.role === 'FINANCE') {
          newStatus = 'finance_approved';
        }

        db.prepare(`
          UPDATE overage_applications SET
            status = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newStatus, id);
      } else {
        // 审批完成
        db.prepare(`
          UPDATE overage_applications SET
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
 * POST /api/purchase/overage-apply/:id/reject
 * 审批拒绝
 */
router.post('/overage-apply/:id/reject', checkPermission('purchase:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user?.id;

  if (!comment || !comment.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写拒绝原因'
    });
  }

  const item = db.prepare('SELECT * FROM overage_applications WHERE id = ?').get(id);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: '超量采购申请不存在'
    });
  }

  if (!['pending', 'budget_approved', 'finance_approved'].includes(item.status)) {
    return res.status(400).json({
      success: false,
      message: '该申请不在审批中'
    });
  }

  try {
    db.transaction(() => {
      // 更新当前审批步骤为拒绝
      const currentStep = db.prepare(`
        SELECT * FROM overage_application_approvals
        WHERE overage_application_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (currentStep) {
        db.prepare(`
          UPDATE overage_application_approvals SET
            action = 'reject',
            approver_id = ?,
            comment = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(userId, comment, currentStep.id);
      }

      // 更新主表状态
      db.prepare(`
        UPDATE overage_applications SET
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
 * DELETE /api/purchase/overage-apply/:id
 * 删除超量采购申请（仅待审批或已拒绝状态可删除）
 */
router.delete('/overage-apply/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const item = db.prepare('SELECT * FROM overage_applications WHERE id = ?').get(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: '超量采购申请不存在'
      });
    }

    // 只有待审批或已拒绝状态可以删除
    if (!['pending', 'rejected'].includes(item.status)) {
      return res.status(400).json({
        success: false,
        message: '只有待审批或已拒绝状态的申请可以删除'
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
      db.prepare('DELETE FROM overage_application_approvals WHERE overage_application_id = ?').run(id);
      // 删除主表记录
      db.prepare('DELETE FROM overage_applications WHERE id = ?').run(id);
    })();

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除超量采购申请失败:', error);
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

/**
 * GET /api/purchase/overage-apply/pending
 * 获取待审批的超量采购申请列表
 */
router.get('/overage-apply/pending', (req, res) => {
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  try {
    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM overage_applications 
      WHERE status IN ('pending', 'budget_approved', 'finance_approved')
    `).get();
    const total = countResult?.total || 0;

    const list = db.prepare(`
      SELECT oa.*, 
        p.name as project_name, p.project_no,
        u.real_name as creator_name
      FROM overage_applications oa
      LEFT JOIN projects p ON oa.project_id = p.id
      LEFT JOIN users u ON oa.creator_id = u.id
      WHERE oa.status IN ('pending', 'budget_approved', 'finance_approved')
      ORDER BY oa.created_at ASC
      LIMIT ? OFFSET ?
    `).all(parseInt(pageSize), offset);

    res.json({
      success: true,
      data: list.map(item => ({
        ...item,
        status_text: getOverageApplyStatusText(item.status),
        overage_type_text: getOverageTypeText(item.overage_type)
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
 * GET /api/purchase/overage-apply/stats
 * 获取超量采购申请统计
 */
router.get('/overage-apply/stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'budget_approved' THEN 1 ELSE 0 END) as budget_approved_count,
        SUM(CASE WHEN status = 'finance_approved' THEN 1 ELSE 0 END) as finance_approved_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status = 'approved' THEN overage_amount ELSE 0 END) as total_overage_amount
      FROM overage_applications
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
 * GET /api/purchase/overage-apply/projects/:projectId/purchase-lists
 * 获取项目的采购清单列表
 */
router.get('/overage-apply/projects/:projectId/purchase-lists', (req, res) => {
  const { projectId } = req.params;

  try {
    const lists = db.prepare(`
      SELECT id, name, status
      FROM purchase_lists
      WHERE project_id = ?
      ORDER BY created_at DESC
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
 * GET /api/purchase/overage-apply/purchase-lists/:listId/items
 * 获取采购清单的物资明细
 */
router.get('/overage-apply/purchase-lists/:listId/items', (req, res) => {
  const { listId } = req.params;

  try {
    const items = db.prepare(`
      SELECT id, material_name, specification, unit, quantity, unit_price, total_price
      FROM purchase_list_items
      WHERE purchase_list_id = ?
      ORDER BY sort_order, id
    `).all(listId);

    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('获取物资明细失败:', error);
    res.status(500).json({
      success: false,
      message: '获取物资明细失败: ' + error.message
    });
  }
});

module.exports = router;
