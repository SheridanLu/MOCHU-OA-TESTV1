/**
 * 库存管理路由
 * 实现物资入库、库存更新、库存查询等功能
 * 
 * Task 38: 物资入库 - 入库单生成
 * Task 39: 物资入库 - 库存更新
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有库存路由附加权限信息
router.use(authMiddleware, attachPermissions);

// ========================================
// 入库单管理 API
// ========================================

/**
 * 生成入库单编号
 * 格式: RK + YYMM + 3位序号
 * 例: 2026年3月第1个: RK2603001
 */
function generateStockInNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `RK${year}${month}`;
  
  // 获取本月最大序号
  const result = db.prepare(`
    SELECT MAX(stock_in_no) as max_no 
    FROM stock_in 
    WHERE stock_in_no LIKE ?
  `).get(`${prefix}%`);
  
  let seq = 1;
  if (result && result.max_no) {
    const lastSeq = parseInt(result.max_no.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }
  
  return `${prefix}${seq.toString().padStart(3, '0')}`;
}

/**
 * GET /api/stock/in
 * 获取入库单列表
 * 查询参数: keyword, status, project_id, page, pageSize
 */
router.get('/in', (req, res) => {
  const { keyword, status, project_id, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT si.*, 
           p.name as project_name, 
           s.name as supplier_name,
           u.real_name as creator_name
    FROM stock_in si
    LEFT JOIN projects p ON si.project_id = p.id
    LEFT JOIN suppliers s ON si.supplier_id = s.id
    LEFT JOIN users u ON si.creator_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (si.stock_in_no LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND si.status = ?`;
    params.push(status);
  }
  
  // 项目筛选
  if (project_id) {
    sql += ` AND si.project_id = ?`;
    params.push(project_id);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT si\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY si.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const stockInList = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: stockInList,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/in/:id
 * 获取入库单详情（含明细）
 */
router.get('/in/:id', (req, res) => {
  const { id } = req.params;
  
  const stockIn = db.prepare(`
    SELECT si.*, 
           p.name as project_name, 
           p.project_no,
           s.name as supplier_name,
           u.real_name as creator_name
    FROM stock_in si
    LEFT JOIN projects p ON si.project_id = p.id
    LEFT JOIN suppliers s ON si.supplier_id = s.id
    LEFT JOIN users u ON si.creator_id = u.id
    WHERE si.id = ?
  `).get(id);
  
  if (!stockIn) {
    return res.status(404).json({
      success: false,
      message: '入库单不存在'
    });
  }
  
  // 获取入库明细
  const items = db.prepare(`
    SELECT * FROM stock_in_items WHERE stock_in_id = ? ORDER BY id
  `).all(id);
  
  res.json({
    success: true,
    data: {
      ...stockIn,
      items
    }
  });
});

/**
 * POST /api/stock/in
 * 创建入库单（草稿）
 */
router.post('/in', checkPermission('stock:create'), (req, res) => {
  const {
    project_id,
    batch_purchase_id,
    sporadic_purchase_id,
    supplier_id,
    items,
    handler_id,
    handler_name,
    in_date,
    remark
  } = req.body;
  
  // 验证明细
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '入库明细不能为空'
    });
  }
  
  const userId = req.user.id;
  const stockInNo = generateStockInNo();
  
  try {
    const transaction = db.transaction(() => {
      // 计算总数量和总金额
      let totalQuantity = 0;
      let totalAmount = 0;
      items.forEach(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        totalQuantity += qty;
        totalAmount += qty * price;
      });
      
      // 插入入库单
      const result = db.prepare(`
        INSERT INTO stock_in (
          stock_in_no, project_id, batch_purchase_id, sporadic_purchase_id,
          supplier_id, total_quantity, total_amount, status,
          handler_id, handler_name, in_date, remark, creator_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)
      `).run(
        stockInNo, project_id, batch_purchase_id, sporadic_purchase_id,
        supplier_id, totalQuantity, totalAmount,
        handler_id || userId, handler_name || req.user.real_name,
        in_date || new Date().toISOString().slice(0, 10),
        remark, userId
      );
      
      const stockInId = result.lastInsertRowid;
      
      // 插入明细
      const insertItem = db.prepare(`
        INSERT INTO stock_in_items (
          stock_in_id, material_name, specification, unit,
          quantity, available_quantity, unit_price, total_price, remark
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      items.forEach(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        const availableQty = qty; // 初始可领库存等于入库数量
        
        insertItem.run(
          stockInId,
          item.material_name,
          item.specification || null,
          item.unit || null,
          qty,
          availableQty,
          price,
          qty * price,
          item.remark || null
        );
      });
      
      return stockInId;
    });
    
    const stockInId = transaction();
    
    const newStockIn = db.prepare(`
      SELECT si.*, p.name as project_name, s.name as supplier_name
      FROM stock_in si
      LEFT JOIN projects p ON si.project_id = p.id
      LEFT JOIN suppliers s ON si.supplier_id = s.id
      WHERE si.id = ?
    `).get(stockInId);
    
    res.json({
      success: true,
      message: '入库单创建成功',
      data: newStockIn
    });
  } catch (error) {
    console.error('创建入库单失败:', error);
    res.status(500).json({
      success: false,
      message: '创建入库单失败: ' + error.message
    });
  }
});

/**
 * PUT /api/stock/in/:id
 * 更新入库单（仅草稿状态可修改）
 */
router.put('/in/:id', checkPermission('stock:edit'), (req, res) => {
  const { id } = req.params;
  const {
    supplier_id,
    handler_id,
    handler_name,
    in_date,
    remark,
    items
  } = req.body;
  
  const stockIn = db.prepare('SELECT * FROM stock_in WHERE id = ?').get(id);
  if (!stockIn) {
    return res.status(404).json({
      success: false,
      message: '入库单不存在'
    });
  }
  
  if (stockIn.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的入库单可以修改'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 如果有明细更新，重新计算并更新
      if (items && Array.isArray(items) && items.length > 0) {
        // 删除原明细
        db.prepare('DELETE FROM stock_in_items WHERE stock_in_id = ?').run(id);
        
        // 计算并插入新明细
        let totalQuantity = 0;
        let totalAmount = 0;
        
        const insertItem = db.prepare(`
          INSERT INTO stock_in_items (
            stock_in_id, material_name, specification, unit,
            quantity, available_quantity, unit_price, total_price, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        items.forEach(item => {
          const qty = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.unit_price) || 0;
          const availableQty = qty;
          
          totalQuantity += qty;
          totalAmount += qty * price;
          
          insertItem.run(
            id,
            item.material_name,
            item.specification || null,
            item.unit || null,
            qty,
            availableQty,
            price,
            qty * price,
            item.remark || null
          );
        });
        
        // 更新主表
        db.prepare(`
          UPDATE stock_in SET
            supplier_id = COALESCE(?, supplier_id),
            handler_id = COALESCE(?, handler_id),
            handler_name = COALESCE(?, handler_name),
            in_date = COALESCE(?, in_date),
            remark = COALESCE(?, remark),
            total_quantity = ?,
            total_amount = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(supplier_id, handler_id, handler_name, in_date, remark, totalQuantity, totalAmount, id);
      } else {
        // 只更新基本信息
        db.prepare(`
          UPDATE stock_in SET
            supplier_id = COALESCE(?, supplier_id),
            handler_id = COALESCE(?, handler_id),
            handler_name = COALESCE(?, handler_name),
            in_date = COALESCE(?, in_date),
            remark = COALESCE(?, remark),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(supplier_id, handler_id, handler_name, in_date, remark, id);
      }
    });
    
    transaction();
    
    const updatedStockIn = db.prepare(`
      SELECT si.*, p.name as project_name, s.name as supplier_name
      FROM stock_in si
      LEFT JOIN projects p ON si.project_id = p.id
      LEFT JOIN suppliers s ON si.supplier_id = s.id
      WHERE si.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '入库单更新成功',
      data: updatedStockIn
    });
  } catch (error) {
    console.error('更新入库单失败:', error);
    res.status(500).json({
      success: false,
      message: '更新入库单失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/stock/in/:id
 * 删除入库单（仅草稿状态可删除）
 */
router.delete('/in/:id', checkPermission('stock:delete'), (req, res) => {
  const { id } = req.params;
  
  const stockIn = db.prepare('SELECT * FROM stock_in WHERE id = ?').get(id);
  if (!stockIn) {
    return res.status(404).json({
      success: false,
      message: '入库单不存在'
    });
  }
  
  if (stockIn.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的入库单可以删除'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 删除明细
      db.prepare('DELETE FROM stock_in_items WHERE stock_in_id = ?').run(id);
      // 删除主表
      db.prepare('DELETE FROM stock_in WHERE id = ?').run(id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '入库单删除成功'
    });
  } catch (error) {
    console.error('删除入库单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除入库单失败: ' + error.message
    });
  }
});

// ========================================
// Task 39: 入库库存更新 API
// ========================================

/**
 * PUT /api/stock/in/:id/quantity
 * 确认入库并更新库存
 * - 入库数量累加到现有库存
 * - 不能超过库存上限
 * - 库存不能为负数
 * - 记录入库日志
 */
router.put('/in/:id/quantity', checkPermission('stock:in'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userName = req.user.real_name || req.user.username;
  
  const stockIn = db.prepare('SELECT * FROM stock_in WHERE id = ?').get(id);
  if (!stockIn) {
    return res.status(404).json({
      success: false,
      message: '入库单不存在'
    });
  }
  
  // 只能确认草稿或待确认状态的入库单
  if (stockIn.status === 'confirmed' || stockIn.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: '该入库单已确认，不能重复确认'
    });
  }
  
  if (stockIn.status === 'cancelled') {
    return res.status(400).json({
      success: false,
      message: '该入库单已取消，不能确认'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 获取入库明细
      const items = db.prepare(`
        SELECT * FROM stock_in_items WHERE stock_in_id = ?
      `).all(id);
      
      if (items.length === 0) {
        throw new Error('入库明细为空');
      }
      
      const updateResults = [];
      
      items.forEach(item => {
        const { material_name, specification, unit, quantity, available_quantity, unit_price } = item;
        
        if (quantity <= 0) {
          updateResults.push({
            material_name,
            success: false,
            message: '入库数量必须大于0'
          });
          return;
        }
        
        // 查找现有库存（使用 inventory 表）
        let stock = db.prepare(`
          SELECT * FROM inventory 
          WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
        `).get(material_name, specification, specification);
        
        let beforeQuantity = 0;
        let beforeAvailable = 0;
        
        if (stock) {
          beforeQuantity = stock.quantity || 0;
          beforeAvailable = stock.available_quantity || 0;
          
          // 检查库存上限
          if (stock.max_quantity && (beforeQuantity + quantity) > stock.max_quantity) {
            throw new Error(`物资"${material_name}"入库后超过库存上限（上限: ${stock.max_quantity}，当前: ${beforeQuantity}，入库: ${quantity}）`);
          }
          
          // 更新库存数量（使用 inventory 表）
          const newQuantity = beforeQuantity + quantity;
          const newAvailable = beforeAvailable + available_quantity;
          
          db.prepare(`
            UPDATE inventory SET
              quantity = ?,
              available_quantity = ?,
              unit_price = ?,
              last_stock_in_date = ?,
              last_stock_in_id = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newQuantity, newAvailable, unit_price, stockIn.in_date, id, stock.id);
          
          updateResults.push({
            material_name,
            specification,
            success: true,
            before_quantity: beforeQuantity,
            in_quantity: quantity,
            after_quantity: newQuantity,
            message: '库存更新成功'
          });
        } else {
          // 创建新库存记录（使用 inventory 表）
          const newStockResult = db.prepare(`
            INSERT INTO inventory (
              material_name, specification, unit, quantity, 
              available_quantity, unit_price, last_stock_in_date, last_stock_in_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal')
          `).run(material_name, specification, unit, quantity, available_quantity, unit_price, stockIn.in_date, id);
          
          stock = { id: newStockResult.lastInsertRowid };
          
          updateResults.push({
            material_name,
            specification,
            success: true,
            before_quantity: 0,
            in_quantity: quantity,
            after_quantity: quantity,
            message: '新物资入库成功'
          });
        }
        
        // 记录库存日志（使用 inventory_logs 表）
        db.prepare(`
          INSERT INTO inventory_logs (
            inventory_id, material_name, specification, change_type,
            change_quantity, before_quantity, after_quantity,
            available_before, available_after,
            stock_in_id, operator_id, operator_name, remark
          ) VALUES (?, ?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          stock.id,
          material_name,
          specification,
          quantity,
          beforeQuantity,
          beforeQuantity + quantity,
          beforeAvailable,
          beforeAvailable + available_quantity,
          id,
          userId,
          userName,
          `入库确认 - 入库单号: ${stockIn.stock_in_no}`
        );
      });
      
      // 更新入库单状态
      db.prepare(`
        UPDATE stock_in SET
          status = 'confirmed',
          handler_id = ?,
          handler_name = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, userName, id);
      
      return updateResults;
    });
    
    const updateResults = transaction();
    
    // 获取更新后的入库单详情
    const updatedStockIn = db.prepare(`
      SELECT si.*, p.name as project_name, s.name as supplier_name
      FROM stock_in si
      LEFT JOIN projects p ON si.project_id = p.id
      LEFT JOIN suppliers s ON si.supplier_id = s.id
      WHERE si.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '入库确认成功，库存已更新',
      data: {
        stock_in: updatedStockIn,
        update_details: updateResults
      }
    });
  } catch (error) {
    console.error('入库确认失败:', error);
    res.status(500).json({
      success: false,
      message: '入库确认失败: ' + error.message
    });
  }
});

/**
 * POST /api/stock/in/:id/cancel
 * 取消入库单（仅草稿状态可取消）
 */
router.post('/in/:id/cancel', checkPermission('stock:cancel'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  const stockIn = db.prepare('SELECT * FROM stock_in WHERE id = ?').get(id);
  if (!stockIn) {
    return res.status(404).json({
      success: false,
      message: '入库单不存在'
    });
  }
  
  if (stockIn.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的入库单可以取消'
    });
  }
  
  try {
    db.prepare(`
      UPDATE stock_in SET
        status = 'cancelled',
        remark = COALESCE(remark || ' | ', '') || '取消原因: ' || ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason || '无', id);
    
    res.json({
      success: true,
      message: '入库单已取消'
    });
  } catch (error) {
    console.error('取消入库单失败:', error);
    res.status(500).json({
      success: false,
      message: '取消入库单失败: ' + error.message
    });
  }
});

// ========================================
// 库存查询 API
// ========================================

/**
 * GET /api/stock
 * 获取库存列表
 * 查询参数: keyword, status, page, pageSize
 */
router.get('/', (req, res) => {
  const { keyword, status, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `SELECT * FROM inventory WHERE 1=1`;
  const params = [];
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (material_name LIKE ? OR specification LIKE ? OR location LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND status = ?`;
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const stockList = db.prepare(sql).all(...params);
  
  // 检查库存预警
  const stockWithWarning = stockList.map(item => {
    let warning = null;
    if (item.min_quantity > 0 && item.quantity < item.min_quantity) {
      warning = 'low'; // 库存不足
    }
    if (item.warning_quantity > 0 && item.quantity <= item.warning_quantity) {
      warning = 'warning'; // 库存预警
    }
    if (item.max_quantity && item.quantity > item.max_quantity) {
      warning = 'over'; // 库存超限
    }
    return { ...item, warning };
  });
  
  res.json({
    success: true,
    data: stockWithWarning,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/:id
 * 获取单个库存详情（含出入库记录）
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const stock = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!stock) {
    return res.status(404).json({
      success: false,
      message: '库存记录不存在'
    });
  }
  
  // 获取最近的库存日志
  const logs = db.prepare(`
    SELECT * FROM inventory_logs 
    WHERE inventory_id = ? OR (material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL)))
    ORDER BY created_at DESC
    LIMIT 50
  `).all(id, stock.material_name, stock.specification, stock.specification);
  
  res.json({
    success: true,
    data: {
      ...stock,
      logs
    }
  });
});

/**
 * PUT /api/stock/:id
 * 更新库存基本信息（不改变数量）
 */
router.put('/:id', checkPermission('stock:edit'), (req, res) => {
  const { id } = req.params;
  const { max_quantity, min_quantity, warning_quantity, location, status } = req.body;
  
  const stock = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  if (!stock) {
    return res.status(404).json({
      success: false,
      message: '库存记录不存在'
    });
  }
  
  try {
    db.prepare(`
      UPDATE inventory SET
        max_quantity = COALESCE(?, max_quantity),
        min_quantity = COALESCE(?, min_quantity),
        warning_quantity = COALESCE(?, warning_quantity),
        location = COALESCE(?, location),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(max_quantity, min_quantity, warning_quantity, location, status, id);
    
    const updatedStock = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
    
    res.json({
      success: true,
      message: '库存信息更新成功',
      data: updatedStock
    });
  } catch (error) {
    console.error('更新库存信息失败:', error);
    res.status(500).json({
      success: false,
      message: '更新库存信息失败: ' + error.message
    });
  }
});

/**
 * GET /api/stock/logs/list
 * 获取库存日志列表
 */
router.get('/logs/list', (req, res) => {
  const { material_name, change_type, start_date, end_date, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT * FROM inventory_logs
    WHERE 1=1
  `;
  const params = [];
  
  if (material_name) {
    sql += ` AND material_name LIKE ?`;
    params.push(`%${material_name}%`);
  }
  
  if (change_type) {
    sql += ` AND change_type = ?`;
    params.push(change_type);
  }
  
  if (start_date) {
    sql += ` AND DATE(created_at) >= ?`;
    params.push(start_date);
  }
  
  if (end_date) {
    sql += ` AND DATE(created_at) <= ?`;
    params.push(end_date);
  }
  
  // 获取总数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const logs = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: logs,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/warning/list
 * 获取库存预警列表
 */
router.get('/warning/list', (req, res) => {
  const stockList = db.prepare(`
    SELECT * FROM inventory
    WHERE 
      (min_quantity > 0 AND quantity < min_quantity)
      OR (warning_quantity > 0 AND quantity <= warning_quantity)
      OR (max_quantity IS NOT NULL AND quantity > max_quantity)
    ORDER BY updated_at DESC
  `).all();
  
  const warnings = stockList.map(item => {
    let warningType = [];
    if (item.min_quantity > 0 && item.quantity < item.min_quantity) {
      warningType.push('库存不足');
    }
    if (item.warning_quantity > 0 && item.quantity <= item.warning_quantity) {
      warningType.push('库存预警');
    }
    if (item.max_quantity && item.quantity > item.max_quantity) {
      warningType.push('库存超限');
    }
    
    return {
      ...item,
      warning_type: warningType
    };
  });
  
  res.json({
    success: true,
    data: warnings,
    total: warnings.length
  });
});

// ========================================
// Task 40: 物资出库 - 领用申请 API
// ========================================

/**
 * 生成领用申请编号
 * 格式: LY + YYMM + 3位序号
 * 例: 2026年3月第1个: LY2603001
 */
function generateApplicationNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `LY${year}${month}`;
  
  // 获取本月最大序号
  const result = db.prepare(`
    SELECT MAX(application_no) as max_no 
    FROM stock_out_applications 
    WHERE application_no LIKE ?
  `).get(`${prefix}%`);
  
  let seq = 1;
  if (result && result.max_no) {
    const lastSeq = parseInt(result.max_no.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }
  
  return `${prefix}${seq.toString().padStart(3, '0')}`;
}

/**
 * POST /api/stock/out/apply
 * 提交领用申请
 * 
 * 请求体：
 * - project_id: 项目ID（必填）
 * - reason: 领用原因（必填）
 * - items: 物资明细数组（必填）
 *   - material_id: 物资ID（关联inventory表）
 *   - material_name: 物资名称
 *   - specification: 规格型号
 *   - unit: 单位
 *   - quantity: 申请数量
 */
router.post('/out/apply', checkPermission('stock:out'), (req, res) => {
  const { project_id, reason, items, remark } = req.body;
  const userId = req.user.id;
  
  // 基本验证
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择领用项目'
    });
  }
  
  if (!reason || reason.trim() === '') {
    return res.status(400).json({
      success: false,
      message: '请填写领用原因'
    });
  }
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请添加领用物资'
    });
  }
  
  // 验证项目是否存在
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(400).json({
      success: false,
      message: '所选项目不存在'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      const applicationNo = generateApplicationNo();
      
      // 检查库存是否充足
      const stockWarnings = [];
      items.forEach(item => {
        const inventory = db.prepare(`
          SELECT * FROM inventory 
          WHERE id = ? OR (material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL)))
        `).get(item.material_id, item.material_name, item.specification, item.specification);
        
        if (!inventory) {
          stockWarnings.push({
            material_name: item.material_name,
            message: '该物资不存在于库存中'
          });
        } else if (inventory.available_quantity < item.quantity) {
          stockWarnings.push({
            material_name: item.material_name,
            available: inventory.available_quantity,
            requested: item.quantity,
            message: `库存不足，当前可领数量: ${inventory.available_quantity}`
          });
        }
      });
      
      if (stockWarnings.length > 0) {
        throw new Error('库存检查失败: ' + stockWarnings.map(w => w.message).join('; '));
      }
      
      // 创建领用申请
      const result = db.prepare(`
        INSERT INTO stock_out_applications (
          application_no, project_id, applicant_id, reason, status, remark
        ) VALUES (?, ?, ?, ?, 'pending', ?)
      `).run(applicationNo, project_id, userId, reason.trim(), remark || null);
      
      const applicationId = result.lastInsertRowid;
      
      // 插入物资明细
      const insertItem = db.prepare(`
        INSERT INTO stock_out_application_items (
          application_id, material_id, material_name, specification, unit, quantity, available_quantity, remark
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      items.forEach(item => {
        // 获取当前库存可领数量
        const inventory = db.prepare(`
          SELECT available_quantity FROM inventory 
          WHERE id = ? OR (material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL)))
        `).get(item.material_id, item.material_name, item.specification, item.specification);
        
        insertItem.run(
          applicationId,
          item.material_id || null,
          item.material_name,
          item.specification || null,
          item.unit || null,
          item.quantity,
          inventory ? inventory.available_quantity : 0,
          item.remark || null
        );
      });
      
      return applicationId;
    });
    
    const applicationId = transaction();
    
    // 获取创建的申请详情
    const newApplication = db.prepare(`
      SELECT sa.*, 
             p.name as project_name, 
             p.project_no,
             u.real_name as applicant_name
      FROM stock_out_applications sa
      LEFT JOIN projects p ON sa.project_id = p.id
      LEFT JOIN users u ON sa.applicant_id = u.id
      WHERE sa.id = ?
    `).get(applicationId);
    
    // 获取申请明细
    const applicationItems = db.prepare(`
      SELECT * FROM stock_out_application_items WHERE application_id = ? ORDER BY id
    `).all(applicationId);
    
    res.json({
      success: true,
      message: '领用申请提交成功，请等待审批',
      data: {
        ...newApplication,
        items: applicationItems
      }
    });
  } catch (error) {
    console.error('提交领用申请失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '提交领用申请失败'
    });
  }
});

/**
 * GET /api/stock/out/pending
 * 获取待审批的领用申请列表
 * 
 * 查询参数：
 * - page: 页码
 * - pageSize: 每页数量
 * - project_id: 项目ID筛选
 * - keyword: 关键词搜索
 */
router.get('/out/pending', (req, res) => {
  const { page = 1, pageSize = 20, project_id, keyword } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT sa.*, 
           p.name as project_name, 
           p.project_no,
           u.real_name as applicant_name,
           (SELECT COUNT(*) FROM stock_out_application_items WHERE application_id = sa.id) as item_count
    FROM stock_out_applications sa
    LEFT JOIN projects p ON sa.project_id = p.id
    LEFT JOIN users u ON sa.applicant_id = u.id
    WHERE sa.status = 'pending'
  `;
  const params = [];
  
  // 项目筛选
  if (project_id) {
    sql += ` AND sa.project_id = ?`;
    params.push(project_id);
  }
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (sa.application_no LIKE ? OR p.name LIKE ? OR u.real_name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT sa\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY sa.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const applications = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: applications,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/out/applications
 * 获取所有领用申请列表（含各状态）
 */
router.get('/out/applications', (req, res) => {
  const { page = 1, pageSize = 20, project_id, status, keyword, applicant_id } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT sa.*, 
           p.name as project_name, 
           p.project_no,
           u.real_name as applicant_name,
           approver.real_name as approver_name,
           (SELECT COUNT(*) FROM stock_out_application_items WHERE application_id = sa.id) as item_count
    FROM stock_out_applications sa
    LEFT JOIN projects p ON sa.project_id = p.id
    LEFT JOIN users u ON sa.applicant_id = u.id
    LEFT JOIN users approver ON sa.approver_id = approver.id
    WHERE 1=1
  `;
  const params = [];
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND sa.status = ?`;
    params.push(status);
  }
  
  // 项目筛选
  if (project_id) {
    sql += ` AND sa.project_id = ?`;
    params.push(project_id);
  }
  
  // 申请人筛选
  if (applicant_id) {
    sql += ` AND sa.applicant_id = ?`;
    params.push(applicant_id);
  }
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (sa.application_no LIKE ? OR p.name LIKE ? OR u.real_name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT sa\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY sa.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const applications = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: applications,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/out/applications/:id
 * 获取领用申请详情
 */
router.get('/out/applications/:id', (req, res) => {
  const { id } = req.params;
  
  const application = db.prepare(`
    SELECT sa.*, 
           p.name as project_name, 
           p.project_no,
           u.real_name as applicant_name,
           approver.real_name as approver_name
    FROM stock_out_applications sa
    LEFT JOIN projects p ON sa.project_id = p.id
    LEFT JOIN users u ON sa.applicant_id = u.id
    LEFT JOIN users approver ON sa.approver_id = approver.id
    WHERE sa.id = ?
  `).get(id);
  
  if (!application) {
    return res.status(404).json({
      success: false,
      message: '领用申请不存在'
    });
  }
  
  // 获取申请明细
  const items = db.prepare(`
    SELECT * FROM stock_out_application_items WHERE application_id = ? ORDER BY id
  `).all(id);
  
  res.json({
    success: true,
    data: {
      ...application,
      items
    }
  });
});

/**
 * POST /api/stock/out/:id/approve
 * 审批通过领用申请
 * 
 * 请求体：
 * - comment: 审批意见
 */
router.post('/out/:id/approve', checkPermission('stock:approve'), (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const userId = req.user.id;
  const userName = req.user.real_name || req.user.username;
  
  const application = db.prepare('SELECT * FROM stock_out_applications WHERE id = ?').get(id);
  if (!application) {
    return res.status(404).json({
      success: false,
      message: '领用申请不存在'
    });
  }
  
  if (application.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该申请已处理，无法重复审批'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 获取申请明细
      const items = db.prepare(`
        SELECT * FROM stock_out_application_items WHERE application_id = ?
      `).all(id);
      
      if (items.length === 0) {
        throw new Error('申请明细为空');
      }
      
      // 再次检查库存是否充足（防止审批时库存已被占用）
      items.forEach(item => {
        const inventory = db.prepare(`
          SELECT * FROM inventory 
          WHERE id = ? OR (material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL)))
        `).get(item.material_id, item.material_name, item.specification, item.specification);
        
        if (!inventory) {
          throw new Error(`物资"${item.material_name}"不存在于库存中`);
        }
        
        if (inventory.available_quantity < item.quantity) {
          throw new Error(`物资"${item.material_name}"库存不足，当前可领数量: ${inventory.available_quantity}，申请数量: ${item.quantity}`);
        }
      });
      
      // 扣减库存
      items.forEach(item => {
        const inventory = db.prepare(`
          SELECT * FROM inventory 
          WHERE id = ? OR (material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL)))
          LIMIT 1
        `).get(item.material_id, item.material_name, item.specification, item.specification);
        
        if (inventory) {
          const beforeQuantity = inventory.quantity;
          const beforeAvailable = inventory.available_quantity;
          const newQuantity = beforeQuantity - item.quantity;
          const newAvailable = beforeAvailable - item.quantity;
          
          // 更新库存
          db.prepare(`
            UPDATE inventory SET
              quantity = ?,
              available_quantity = ?,
              last_out_date = DATE('now'),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newQuantity, newAvailable, inventory.id);
          
          // 记录库存日志
          db.prepare(`
            INSERT INTO inventory_logs (
              inventory_id, material_name, specification, change_type,
              change_quantity, before_quantity, after_quantity,
              available_before, available_after,
              stock_out_id, operator_id, operator_name, remark
            ) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            inventory.id,
            inventory.material_name,
            inventory.specification,
            item.quantity,
            beforeQuantity,
            newQuantity,
            beforeAvailable,
            newAvailable,
            id,
            userId,
            userName,
            `领用出库 - 申请单号: ${application.application_no}`
          );
        }
      });
      
      // 更新申请状态
      db.prepare(`
        UPDATE stock_out_applications SET
          status = 'approved',
          approver_id = ?,
          approve_comment = ?,
          approved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, id);
    });
    
    transaction();
    
    // 获取更新后的申请详情
    const updatedApplication = db.prepare(`
      SELECT sa.*, 
             p.name as project_name, 
             u.real_name as applicant_name,
             approver.real_name as approver_name
      FROM stock_out_applications sa
      LEFT JOIN projects p ON sa.project_id = p.id
      LEFT JOIN users u ON sa.applicant_id = u.id
      LEFT JOIN users approver ON sa.approver_id = approver.id
      WHERE sa.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '审批通过，库存已扣减',
      data: updatedApplication
    });
  } catch (error) {
    console.error('审批失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '审批失败'
    });
  }
});

/**
 * POST /api/stock/out/:id/reject
 * 审批拒绝领用申请
 * 
 * 请求体：
 * - reason: 拒绝原因
 */
router.post('/out/:id/reject', checkPermission('stock:approve'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  
  const application = db.prepare('SELECT * FROM stock_out_applications WHERE id = ?').get(id);
  if (!application) {
    return res.status(404).json({
      success: false,
      message: '领用申请不存在'
    });
  }
  
  if (application.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '该申请已处理，无法重复审批'
    });
  }
  
  try {
    db.prepare(`
      UPDATE stock_out_applications SET
        status = 'rejected',
        approver_id = ?,
        reject_reason = ?,
        rejected_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId, reason || null, id);
    
    // 获取更新后的申请详情
    const updatedApplication = db.prepare(`
      SELECT sa.*, 
             p.name as project_name, 
             u.real_name as applicant_name,
             approver.real_name as approver_name
      FROM stock_out_applications sa
      LEFT JOIN projects p ON sa.project_id = p.id
      LEFT JOIN users u ON sa.applicant_id = u.id
      LEFT JOIN users approver ON sa.approver_id = approver.id
      WHERE sa.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '已拒绝该领用申请',
      data: updatedApplication
    });
  } catch (error) {
    console.error('拒绝申请失败:', error);
    res.status(500).json({
      success: false,
      message: '拒绝申请失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/stock/out/applications/:id
 * 撤销/删除领用申请（仅pending状态可删除，且只有申请人可删除）
 */
router.delete('/out/applications/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  const application = db.prepare('SELECT * FROM stock_out_applications WHERE id = ?').get(id);
  if (!application) {
    return res.status(404).json({
      success: false,
      message: '领用申请不存在'
    });
  }
  
  // 只有申请人本人可以删除
  if (application.applicant_id !== userId) {
    return res.status(403).json({
      success: false,
      message: '只有申请人可以撤销申请'
    });
  }
  
  // 只有待审批状态可以删除
  if (application.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: '只有待审批状态的申请可以撤销'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 删除申请明细
      db.prepare('DELETE FROM stock_out_application_items WHERE application_id = ?').run(id);
      // 删除申请
      db.prepare('DELETE FROM stock_out_applications WHERE id = ?').run(id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '申请已撤销'
    });
  } catch (error) {
    console.error('撤销申请失败:', error);
    res.status(500).json({
      success: false,
      message: '撤销申请失败: ' + error.message
    });
  }
});

/**
 * GET /api/stock/out/available-materials
 * 获取可领用的物资列表（从库存中）
 */
router.get('/out/available-materials', (req, res) => {
  const { keyword } = req.query;
  
  let sql = `
    SELECT * FROM inventory 
    WHERE available_quantity > 0 AND status = 'normal'
  `;
  const params = [];
  
  if (keyword) {
    sql += ` AND (material_name LIKE ? OR specification LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  sql += ` ORDER BY material_name ASC`;
  
  const materials = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: materials
  });
});

/**
 * GET /api/stock/out/my-applications
 * 获取当前用户的领用申请
 */
router.get('/out/my-applications', (req, res) => {
  const userId = req.user.id;
  const { page = 1, pageSize = 20, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT sa.*, 
           p.name as project_name,
           (SELECT COUNT(*) FROM stock_out_application_items WHERE application_id = sa.id) as item_count
    FROM stock_out_applications sa
    LEFT JOIN projects p ON sa.project_id = p.id
    WHERE sa.applicant_id = ?
  `;
  const params = [userId];
  
  if (status && status !== 'all') {
    sql += ` AND sa.status = ?`;
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT sa\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY sa.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const applications = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: applications,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

// ========================================
// Task 41: 出库单管理 API
// ========================================

/**
 * 生成出库单编号
 * 格式: CK + YYMMDD + 3位序号
 * 例: 2026年3月7日第1个: CK250307001
 * 每日重置序号
 */
function generateStockOutNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const prefix = `CK${year}${month}${day}`;
  
  // 获取当日最大序号
  const result = db.prepare(`
    SELECT MAX(stock_out_no) as max_no 
    FROM stock_out 
    WHERE stock_out_no LIKE ?
  `).get(`${prefix}%`);
  
  let seq = 1;
  if (result && result.max_no) {
    const lastSeq = parseInt(result.max_no.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }
  
  return `${prefix}${seq.toString().padStart(3, '0')}`;
}

/**
 * GET /api/stock/out
 * 获取出库单列表
 * 查询参数: keyword, status, project_id, page, pageSize
 */
router.get('/out', (req, res) => {
  const { keyword, status, project_id, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT so.*, 
           p.name as project_name, 
           p.project_no,
           soa.application_no,
           u.real_name as operator_name,
           c.real_name as creator_name,
           cf.real_name as confirmer_name
    FROM stock_out so
    LEFT JOIN projects p ON so.project_id = p.id
    LEFT JOIN stock_out_applications soa ON so.application_id = soa.id
    LEFT JOIN users u ON so.operator_id = u.id
    LEFT JOIN users c ON so.creator_id = c.id
    LEFT JOIN users cf ON so.confirmed_by = cf.id
    WHERE 1=1
  `;
  const params = [];
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (so.stock_out_no LIKE ? OR p.name LIKE ? OR soa.application_no LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND so.status = ?`;
    params.push(status);
  }
  
  // 项目筛选
  if (project_id) {
    sql += ` AND so.project_id = ?`;
    params.push(project_id);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT so\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY so.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const stockOutList = db.prepare(sql).all(...params);
  
  // 获取每个出库单的明细数量
  const stockOutWithItemCount = stockOutList.map(item => {
    const itemCount = db.prepare(`
      SELECT COUNT(*) as count FROM stock_out_items WHERE stock_out_id = ?
    `).get(item.id);
    return {
      ...item,
      item_count: itemCount ? itemCount.count : 0
    };
  });
  
  res.json({
    success: true,
    data: stockOutWithItemCount,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/out/:id
 * 获取出库单详情（含明细）
 */
router.get('/out/:id', (req, res) => {
  const { id } = req.params;
  
  const stockOut = db.prepare(`
    SELECT so.*, 
           p.name as project_name, 
           p.project_no,
           soa.application_no,
           soa.reason as application_reason,
           u.real_name as operator_name,
           c.real_name as creator_name,
           cf.real_name as confirmer_name,
           a.real_name as applicant_name
    FROM stock_out so
    LEFT JOIN projects p ON so.project_id = p.id
    LEFT JOIN stock_out_applications soa ON so.application_id = soa.id
    LEFT JOIN users u ON so.operator_id = u.id
    LEFT JOIN users c ON so.creator_id = c.id
    LEFT JOIN users cf ON so.confirmed_by = cf.id
    LEFT JOIN users a ON soa.applicant_id = a.id
    WHERE so.id = ?
  `).get(id);
  
  if (!stockOut) {
    return res.status(404).json({
      success: false,
      message: '出库单不存在'
    });
  }
  
  // 获取出库明细
  const items = db.prepare(`
    SELECT * FROM stock_out_items WHERE stock_out_id = ? ORDER BY sort_order, id
  `).all(id);
  
  // 计算汇总
  const summary = {
    total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
    total_amount: items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    item_count: items.length
  };
  
  res.json({
    success: true,
    data: {
      ...stockOut,
      items,
      summary
    }
  });
});

/**
 * POST /api/stock/out
 * 创建出库单
 * 业务规则：
 * - 出库单必须关联领用申请
 * - 检查库存是否充足
 * - 出库后扣减库存
 */
router.post('/out', checkPermission('stock:create'), (req, res) => {
  const {
    project_id,
    application_id,
    items,
    operator_id,
    operator_name,
    remark
  } = req.body;
  
  // 验证必填项
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  if (!application_id) {
    return res.status(400).json({
      success: false,
      message: '出库单必须关联领用申请'
    });
  }
  
  // 验证领用申请是否存在且已审批
  const application = db.prepare(`
    SELECT * FROM stock_out_applications WHERE id = ?
  `).get(application_id);
  
  if (!application) {
    return res.status(400).json({
      success: false,
      message: '领用申请不存在'
    });
  }
  
  if (application.status !== 'approved') {
    return res.status(400).json({
      success: false,
      message: '只能对已审批的领用申请创建出库单'
    });
  }
  
  // 验证明细
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '出库明细不能为空'
    });
  }
  
  const userId = req.user.id;
  const stockOutNo = generateStockOutNo();
  
  try {
    const transaction = db.transaction(() => {
      // 检查库存是否充足
      for (const item of items) {
        const inventory = db.prepare(`
          SELECT * FROM inventory 
          WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
        `).get(item.material_name, item.specification, item.specification);
        
        if (!inventory) {
          throw new Error(`物资"${item.material_name}"库存不存在`);
        }
        
        const availableQty = parseFloat(inventory.available_quantity) || 0;
        const outQty = parseFloat(item.quantity) || 0;
        
        if (availableQty < outQty) {
          throw new Error(`物资"${item.material_name}"库存不足（可领量: ${availableQty}，需出库: ${outQty}）`);
        }
      }
      
      // 计算总数量和总金额
      let totalQuantity = 0;
      let totalAmount = 0;
      items.forEach((item, index) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        totalQuantity += qty;
        totalAmount += qty * price;
        item.sort_order = index + 1;
      });
      
      // 插入出库单
      const result = db.prepare(`
        INSERT INTO stock_out (
          stock_out_no, project_id, application_id, total_quantity, total_amount,
          status, operator_id, remark, creator_id
        ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      `).run(
        stockOutNo, project_id, application_id, totalQuantity, totalAmount,
        operator_id || userId, remark, userId
      );
      
      const stockOutId = result.lastInsertRowid;
      
      // 插入明细
      const insertItem = db.prepare(`
        INSERT INTO stock_out_items (
          stock_out_id, material_id, material_name, specification, unit,
          quantity, unit_price, amount, remark, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      items.forEach(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        
        insertItem.run(
          stockOutId,
          item.material_id || null,
          item.material_name,
          item.specification || null,
          item.unit || null,
          qty,
          price,
          qty * price,
          item.remark || null,
          item.sort_order
        );
      });
      
      return stockOutId;
    });
    
    const stockOutId = transaction();
    
    const newStockOut = db.prepare(`
      SELECT so.*, 
             p.name as project_name,
             soa.application_no
      FROM stock_out so
      LEFT JOIN projects p ON so.project_id = p.id
      LEFT JOIN stock_out_applications soa ON so.application_id = soa.id
      WHERE so.id = ?
    `).get(stockOutId);
    
    res.json({
      success: true,
      message: '出库单创建成功',
      data: newStockOut
    });
  } catch (error) {
    console.error('创建出库单失败:', error);
    res.status(500).json({
      success: false,
      message: '创建出库单失败: ' + error.message
    });
  }
});

/**
 * PUT /api/stock/out/:id
 * 更新出库单（仅草稿状态可修改）
 */
router.put('/out/:id', checkPermission('stock:edit'), (req, res) => {
  const { id } = req.params;
  const { remark, items } = req.body;
  
  const stockOut = db.prepare('SELECT * FROM stock_out WHERE id = ?').get(id);
  if (!stockOut) {
    return res.status(404).json({
      success: false,
      message: '出库单不存在'
    });
  }
  
  if (stockOut.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的出库单可以修改'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 如果有明细更新，重新计算并更新
      if (items && Array.isArray(items) && items.length > 0) {
        // 检查库存是否充足
        for (const item of items) {
          const inventory = db.prepare(`
            SELECT * FROM inventory 
            WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
          `).get(item.material_name, item.specification, item.specification);
          
          if (!inventory) {
            throw new Error(`物资"${item.material_name}"库存不存在`);
          }
          
          const availableQty = parseFloat(inventory.available_quantity) || 0;
          const outQty = parseFloat(item.quantity) || 0;
          
          if (availableQty < outQty) {
            throw new Error(`物资"${item.material_name}"库存不足（可领量: ${availableQty}，需出库: ${outQty}）`);
          }
        }
        
        // 删除原明细
        db.prepare('DELETE FROM stock_out_items WHERE stock_out_id = ?').run(id);
        
        // 计算并插入新明细
        let totalQuantity = 0;
        let totalAmount = 0;
        
        const insertItem = db.prepare(`
          INSERT INTO stock_out_items (
            stock_out_id, material_id, material_name, specification, unit,
            quantity, unit_price, amount, remark, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        items.forEach((item, index) => {
          const qty = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.unit_price) || 0;
          
          totalQuantity += qty;
          totalAmount += qty * price;
          
          insertItem.run(
            id,
            item.material_id || null,
            item.material_name,
            item.specification || null,
            item.unit || null,
            qty,
            price,
            qty * price,
            item.remark || null,
            index + 1
          );
        });
        
        // 更新主表
        db.prepare(`
          UPDATE stock_out SET
            remark = COALESCE(?, remark),
            total_quantity = ?,
            total_amount = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remark, totalQuantity, totalAmount, id);
      } else {
        // 只更新基本信息
        db.prepare(`
          UPDATE stock_out SET
            remark = COALESCE(?, remark),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remark, id);
      }
    });
    
    transaction();
    
    const updatedStockOut = db.prepare(`
      SELECT so.*, p.name as project_name
      FROM stock_out so
      LEFT JOIN projects p ON so.project_id = p.id
      WHERE so.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '出库单更新成功',
      data: updatedStockOut
    });
  } catch (error) {
    console.error('更新出库单失败:', error);
    res.status(500).json({
      success: false,
      message: '更新出库单失败: ' + error.message
    });
  }
});

/**
 * PUT /api/stock/out/:id/confirm
 * 确认出库并扣减库存
 */
router.put('/out/:id/confirm', checkPermission('stock:out'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userName = req.user.real_name || req.user.username;
  
  const stockOut = db.prepare('SELECT * FROM stock_out WHERE id = ?').get(id);
  if (!stockOut) {
    return res.status(404).json({
      success: false,
      message: '出库单不存在'
    });
  }
  
  if (stockOut.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的出库单可以确认'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 获取出库明细
      const items = db.prepare(`
        SELECT * FROM stock_out_items WHERE stock_out_id = ?
      `).all(id);
      
      if (items.length === 0) {
        throw new Error('出库明细为空');
      }
      
      const updateResults = [];
      
      items.forEach(item => {
        const { material_name, specification, quantity, unit_price } = item;
        
        if (quantity <= 0) {
          updateResults.push({
            material_name,
            success: false,
            message: '出库数量必须大于0'
          });
          return;
        }
        
        // 查找现有库存
        let inventory = db.prepare(`
          SELECT * FROM inventory 
          WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
        `).get(material_name, specification, specification);
        
        if (!inventory) {
          throw new Error(`物资"${material_name}"库存不存在`);
        }
        
        const beforeQuantity = parseFloat(inventory.quantity) || 0;
        const beforeAvailable = parseFloat(inventory.available_quantity) || 0;
        
        if (beforeAvailable < quantity) {
          throw new Error(`物资"${material_name}"库存不足（可领量: ${beforeAvailable}，需出库: ${quantity}）`);
        }
        
        const newQuantity = beforeQuantity - quantity;
        const newAvailable = beforeAvailable - quantity;
        
        if (newQuantity < 0) {
          throw new Error(`物资"${material_name}"出库后库存不能为负数`);
        }
        
        // 更新库存
        db.prepare(`
          UPDATE inventory SET
            quantity = ?,
            available_quantity = ?,
            last_out_date = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newQuantity, newAvailable, new Date().toISOString().slice(0, 10), inventory.id);
        
        // 记录库存日志
        db.prepare(`
          INSERT INTO inventory_logs (
            inventory_id, material_name, specification, change_type,
            change_quantity, before_quantity, after_quantity,
            available_before, available_after,
            source_type, stock_out_id, operator_id, operator_name, remark
          ) VALUES (?, ?, ?, 'out', ?, ?, ?, ?, ?, 'stock_out', ?, ?, ?, ?)
        `).run(
          inventory.id,
          material_name,
          specification,
          quantity,
          beforeQuantity,
          newQuantity,
          beforeAvailable,
          newAvailable,
          id,
          userId,
          userName,
          `出库确认 - 出库单号: ${stockOut.stock_out_no}`
        );
        
        updateResults.push({
          material_name,
          specification,
          success: true,
          before_quantity: beforeQuantity,
          out_quantity: quantity,
          after_quantity: newQuantity,
          message: '库存扣减成功'
        });
      });
      
      // 更新出库单状态（包含确认时间和确认人）
      db.prepare(`
        UPDATE stock_out SET
          status = 'confirmed',
          operator_id = ?,
          confirmed_by = ?,
          confirmed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, userId, id);
      
      return updateResults;
    });
    
    const updateResults = transaction();
    
    // 获取更新后的出库单详情（包含确认人信息）
    const updatedStockOut = db.prepare(`
      SELECT so.*, 
             p.name as project_name,
             cf.real_name as confirmer_name
      FROM stock_out so
      LEFT JOIN projects p ON so.project_id = p.id
      LEFT JOIN users cf ON so.confirmed_by = cf.id
      WHERE so.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '出库确认成功，库存已扣减',
      data: {
        stock_out: updatedStockOut,
        update_details: updateResults
      }
    });
  } catch (error) {
    console.error('出库确认失败:', error);
    res.status(500).json({
      success: false,
      message: '出库确认失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/stock/out/:id
 * 删除出库单（仅草稿状态可删除）
 */
router.delete('/out/:id', checkPermission('stock:delete'), (req, res) => {
  const { id } = req.params;
  
  const stockOut = db.prepare('SELECT * FROM stock_out WHERE id = ?').get(id);
  if (!stockOut) {
    return res.status(404).json({
      success: false,
      message: '出库单不存在'
    });
  }
  
  if (stockOut.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的出库单可以删除'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 删除明细
      db.prepare('DELETE FROM stock_out_items WHERE stock_out_id = ?').run(id);
      // 删除主表
      db.prepare('DELETE FROM stock_out WHERE id = ?').run(id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '出库单删除成功'
    });
  } catch (error) {
    console.error('删除出库单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除出库单失败: ' + error.message
    });
  }
});

/**
 * GET /api/stock/out/applications/approved
 * 获取已审批的领用申请列表（用于创建出库单时选择）
 */
router.get('/out/applications/approved', (req, res) => {
  const { keyword, project_id } = req.query;
  
  let sql = `
    SELECT soa.*, 
           p.name as project_name,
           u.real_name as applicant_name,
           (SELECT COUNT(*) FROM stock_out WHERE application_id = soa.id) as stock_out_count
    FROM stock_out_applications soa
    LEFT JOIN projects p ON soa.project_id = p.id
    LEFT JOIN users u ON soa.applicant_id = u.id
    WHERE soa.status = 'approved'
  `;
  const params = [];
  
  if (keyword) {
    sql += ` AND (soa.application_no LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  if (project_id) {
    sql += ` AND soa.project_id = ?`;
    params.push(project_id);
  }
  
  sql += ` ORDER BY soa.approved_at DESC`;
  
  const applications = db.prepare(sql).all(...params);
  
  // 获取每个申请的明细
  const applicationsWithItems = applications.map(app => {
    const items = db.prepare(`
      SELECT * FROM stock_out_application_items WHERE application_id = ?
    `).all(app.id);
    return {
      ...app,
      items,
      item_count: items.length
    };
  });
  
  res.json({
    success: true,
    data: applicationsWithItems
  });
});

/**
 * GET /api/stock/out/print/:id
 * 获取出库单打印数据
 */
router.get('/out/print/:id', (req, res) => {
  const { id } = req.params;
  
  const stockOut = db.prepare(`
    SELECT so.*, 
           p.name as project_name,
           p.project_no,
           soa.application_no,
           soa.reason as application_reason,
           u.real_name as operator_name,
           a.real_name as applicant_name
    FROM stock_out so
    LEFT JOIN projects p ON so.project_id = p.id
    LEFT JOIN stock_out_applications soa ON so.application_id = soa.id
    LEFT JOIN users u ON so.operator_id = u.id
    LEFT JOIN users a ON soa.applicant_id = a.id
    WHERE so.id = ?
  `).get(id);
  
  if (!stockOut) {
    return res.status(404).json({
      success: false,
      message: '出库单不存在'
    });
  }
  
  const items = db.prepare(`
    SELECT * FROM stock_out_items WHERE stock_out_id = ? ORDER BY sort_order, id
  `).all(id);
  
  const printData = {
    stock_out_no: stockOut.stock_out_no,
    project: {
      name: stockOut.project_name,
      project_no: stockOut.project_no
    },
    application: {
      no: stockOut.application_no,
      reason: stockOut.application_reason
    },
    applicant_name: stockOut.applicant_name,
    operator_name: stockOut.operator_name,
    status: stockOut.status,
    created_at: stockOut.created_at,
    remark: stockOut.remark,
    items: items.map((item, index) => ({
      index: index + 1,
      material_name: item.material_name,
      specification: item.specification || '-',
      unit: item.unit || '-',
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
      remark: item.remark || ''
    })),
    summary: {
      total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
      total_amount: items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
    }
  };
  
  res.json({
    success: true,
    data: printData
  });
});

// ========================================
// Task 43: 物资退库 API
// ========================================

/**
 * 生成退库单编号
 * 格式: TK + YYMMDD + 3位序号
 * 例: 2026年3月7日第1个: TK250307001
 * 每日重置序号
 */
function generateReturnNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const prefix = `TK${year}${month}${day}`;
  
  // 获取当日最大序号
  const result = db.prepare(`
    SELECT MAX(return_no) as max_no 
    FROM stock_return 
    WHERE return_no LIKE ?
  `).get(`${prefix}%`);
  
  let seq = 1;
  if (result && result.max_no) {
    const lastSeq = parseInt(result.max_no.slice(-3));
    if (!isNaN(lastSeq)) {
      seq = lastSeq + 1;
    }
  }
  
  return `${prefix}${seq.toString().padStart(3, '0')}`;
}

/**
 * GET /api/stock/return
 * 获取退库单列表
 * 查询参数: keyword, status, project_id, page, pageSize
 */
router.get('/return', (req, res) => {
  const { keyword, status, project_id, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT sr.*, 
           p.name as project_name, 
           p.project_no,
           so.stock_out_no,
           u.real_name as operator_name,
           c.real_name as creator_name,
           cf.real_name as confirmer_name
    FROM stock_return sr
    LEFT JOIN projects p ON sr.project_id = p.id
    LEFT JOIN stock_out so ON sr.stock_out_id = so.id
    LEFT JOIN users u ON sr.operator_id = u.id
    LEFT JOIN users c ON sr.operator_id = c.id
    LEFT JOIN users cf ON sr.confirmed_by = cf.id
    WHERE 1=1
  `;
  const params = [];
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (sr.return_no LIKE ? OR p.name LIKE ? OR so.stock_out_no LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND sr.status = ?`;
    params.push(status);
  }
  
  // 项目筛选
  if (project_id) {
    sql += ` AND sr.project_id = ?`;
    params.push(project_id);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT sr\.\*,[\s\S]*?FROM/,
    'SELECT COUNT(*) as total FROM'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY sr.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const returnList = db.prepare(sql).all(...params);
  
  // 获取每个退库单的明细数量
  const returnWithItemCount = returnList.map(item => {
    const itemCount = db.prepare(`
      SELECT COUNT(*) as count FROM stock_return_items WHERE return_id = ?
    `).get(item.id);
    const totalQuantity = db.prepare(`
      SELECT SUM(quantity) as total FROM stock_return_items WHERE return_id = ?
    `).get(item.id);
    return {
      ...item,
      item_count: itemCount ? itemCount.count : 0,
      total_quantity: totalQuantity ? totalQuantity.total || 0 : 0
    };
  });
  
  res.json({
    success: true,
    data: returnWithItemCount,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/return/:id
 * 获取退库单详情（含明细）
 */
router.get('/return/:id', (req, res) => {
  const { id } = req.params;
  
  const stockReturn = db.prepare(`
    SELECT sr.*, 
           p.name as project_name, 
           p.project_no,
           so.stock_out_no,
           u.real_name as operator_name,
           cf.real_name as confirmer_name
    FROM stock_return sr
    LEFT JOIN projects p ON sr.project_id = p.id
    LEFT JOIN stock_out so ON sr.stock_out_id = so.id
    LEFT JOIN users u ON sr.operator_id = u.id
    LEFT JOIN users cf ON sr.confirmed_by = cf.id
    WHERE sr.id = ?
  `).get(id);
  
  if (!stockReturn) {
    return res.status(404).json({
      success: false,
      message: '退库单不存在'
    });
  }
  
  // 获取退库明细
  const items = db.prepare(`
    SELECT * FROM stock_return_items WHERE return_id = ? ORDER BY sort_order, id
  `).all(id);
  
  // 计算汇总
  const summary = {
    total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
    total_amount: items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    item_count: items.length
  };
  
  res.json({
    success: true,
    data: {
      ...stockReturn,
      items,
      summary
    }
  });
});

/**
 * POST /api/stock/return
 * 创建退库单
 * 业务规则：
 * - 退库物资必须来自已出库的物资
 * - 退库原因必填
 */
router.post('/return', checkPermission('stock:create'), (req, res) => {
  const {
    stock_out_id,
    project_id,
    items,
    remark
  } = req.body;
  
  // 验证必填项
  if (!stock_out_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联的出库单'
    });
  }
  
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  // 验证出库单是否存在且已确认
  const stockOut = db.prepare(`
    SELECT * FROM stock_out WHERE id = ?
  `).get(stock_out_id);
  
  if (!stockOut) {
    return res.status(400).json({
      success: false,
      message: '出库单不存在'
    });
  }
  
  if (stockOut.status !== 'confirmed') {
    return res.status(400).json({
      success: false,
      message: '只能对已确认的出库单创建退库单'
    });
  }
  
  // 验证明细
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '退库明细不能为空'
    });
  }
  
  // 验证所有退库原因必填
  const hasEmptyReason = items.some(item => !item.reason || item.reason.trim() === '');
  if (hasEmptyReason) {
    return res.status(400).json({
      success: false,
      message: '所有退库物资必须填写退库原因'
    });
  }
  
  const userId = req.user.id;
  const returnNo = generateReturnNo();
  
  try {
    const transaction = db.transaction(() => {
      // 计算总金额
      let totalAmount = 0;
      items.forEach((item, index) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        totalAmount += qty * price;
        item.sort_order = index + 1;
      });
      
      // 插入退库单
      const result = db.prepare(`
        INSERT INTO stock_return (
          return_no, stock_out_id, project_id, total_amount,
          status, remark, operator_id
        ) VALUES (?, ?, ?, ?, 'draft', ?, ?)
      `).run(
        returnNo, stock_out_id, project_id, totalAmount, remark, userId
      );
      
      const returnId = result.lastInsertRowid;
      
      // 插入明细
      const insertItem = db.prepare(`
        INSERT INTO stock_return_items (
          return_id, material_name, specification, unit,
          quantity, unit_price, amount, reason, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      items.forEach(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unit_price) || 0;
        
        insertItem.run(
          returnId,
          item.material_name,
          item.specification || null,
          item.unit || null,
          qty,
          price,
          qty * price,
          item.reason,
          item.sort_order
        );
      });
      
      return returnId;
    });
    
    const returnId = transaction();
    
    const newReturn = db.prepare(`
      SELECT sr.*, 
             p.name as project_name,
             so.stock_out_no
      FROM stock_return sr
      LEFT JOIN projects p ON sr.project_id = p.id
      LEFT JOIN stock_out so ON sr.stock_out_id = so.id
      WHERE sr.id = ?
    `).get(returnId);
    
    res.json({
      success: true,
      message: '退库单创建成功',
      data: newReturn
    });
  } catch (error) {
    console.error('创建退库单失败:', error);
    res.status(500).json({
      success: false,
      message: '创建退库单失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/stock/return/:id
 * 删除退库单（仅草稿状态可删除）
 */
router.delete('/return/:id', checkPermission('stock:delete'), (req, res) => {
  const { id } = req.params;
  
  const stockReturn = db.prepare('SELECT * FROM stock_return WHERE id = ?').get(id);
  if (!stockReturn) {
    return res.status(404).json({
      success: false,
      message: '退库单不存在'
    });
  }
  
  if (stockReturn.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的退库单可以删除'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 删除明细
      db.prepare('DELETE FROM stock_return_items WHERE return_id = ?').run(id);
      // 删除主表
      db.prepare('DELETE FROM stock_return WHERE id = ?').run(id);
    });
    
    transaction();
    
    res.json({
      success: true,
      message: '退库单删除成功'
    });
  } catch (error) {
    console.error('删除退库单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除退库单失败: ' + error.message
    });
  }
});

/**
 * PUT /api/stock/return/:id/confirm
 * 确认退库并增加库存
 * 业务规则：
 * - 退库后库存增加
 * - 记录退库日志
 */
router.put('/return/:id/confirm', checkPermission('stock:in'), (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userName = req.user.real_name || req.user.username;
  
  const stockReturn = db.prepare('SELECT * FROM stock_return WHERE id = ?').get(id);
  if (!stockReturn) {
    return res.status(404).json({
      success: false,
      message: '退库单不存在'
    });
  }
  
  if (stockReturn.status !== 'draft') {
    return res.status(400).json({
      success: false,
      message: '只有草稿状态的退库单可以确认'
    });
  }
  
  try {
    const transaction = db.transaction(() => {
      // 获取退库明细
      const items = db.prepare(`
        SELECT * FROM stock_return_items WHERE return_id = ?
      `).all(id);
      
      if (items.length === 0) {
        throw new Error('退库明细为空');
      }
      
      const updateResults = [];
      
      items.forEach(item => {
        const { material_name, specification, quantity, unit_price, reason } = item;
        
        if (quantity <= 0) {
          updateResults.push({
            material_name,
            success: false,
            message: '退库数量必须大于0'
          });
          return;
        }
        
        // 查找现有库存
        let inventory = db.prepare(`
          SELECT * FROM inventory 
          WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
        `).get(material_name, specification, specification);
        
        let beforeQuantity = 0;
        let beforeAvailable = 0;
        
        if (inventory) {
          beforeQuantity = parseFloat(inventory.quantity) || 0;
          beforeAvailable = parseFloat(inventory.available_quantity) || 0;
          
          const newQuantity = beforeQuantity + quantity;
          const newAvailable = beforeAvailable + quantity;
          
          // 更新库存
          db.prepare(`
            UPDATE inventory SET
              quantity = ?,
              available_quantity = ?,
              unit_price = COALESCE(?, unit_price),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newQuantity, newAvailable, unit_price, inventory.id);
          
          updateResults.push({
            material_name,
            specification,
            success: true,
            before_quantity: beforeQuantity,
            return_quantity: quantity,
            after_quantity: newQuantity,
            message: '库存增加成功'
          });
        } else {
          // 如果库存中不存在该物资，创建新库存记录
          const newInventoryResult = db.prepare(`
            INSERT INTO inventory (
              material_name, specification, unit, quantity, 
              available_quantity, unit_price, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'normal')
          `).run(material_name, specification, item.unit, quantity, quantity, unit_price);
          
          inventory = { id: newInventoryResult.lastInsertRowid };
          
          updateResults.push({
            material_name,
            specification,
            success: true,
            before_quantity: 0,
            return_quantity: quantity,
            after_quantity: quantity,
            message: '新物资入库成功'
          });
        }
        
        // 记录库存日志
        db.prepare(`
          INSERT INTO inventory_logs (
            inventory_id, material_name, specification, change_type,
            change_quantity, before_quantity, after_quantity,
            available_before, available_after,
            source_type, operator_id, operator_name, remark
          ) VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?, 'stock_return', ?, ?, ?)
        `).run(
          inventory.id,
          material_name,
          specification,
          quantity,
          beforeQuantity,
          beforeQuantity + quantity,
          beforeAvailable,
          beforeAvailable + quantity,
          userId,
          userName,
          `退库确认 - 退库单号: ${stockReturn.return_no} - 原因: ${reason}`
        );
      });
      
      // 更新退库单状态
      db.prepare(`
        UPDATE stock_return SET
          status = 'confirmed',
          confirmed_by = ?,
          confirmed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, id);
      
      return updateResults;
    });
    
    const updateResults = transaction();
    
    // 获取更新后的退库单详情
    const updatedReturn = db.prepare(`
      SELECT sr.*, 
             p.name as project_name,
             so.stock_out_no,
             cf.real_name as confirmer_name
      FROM stock_return sr
      LEFT JOIN projects p ON sr.project_id = p.id
      LEFT JOIN stock_out so ON sr.stock_out_id = so.id
      LEFT JOIN users cf ON sr.confirmed_by = cf.id
      WHERE sr.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '退库确认成功，库存已增加',
      data: {
        stock_return: updatedReturn,
        update_details: updateResults
      }
    });
  } catch (error) {
    console.error('退库确认失败:', error);
    res.status(500).json({
      success: false,
      message: '退库确认失败: ' + error.message
    });
  }
});

/**
 * GET /api/stock/return/print/:id
 * 获取退库单打印数据
 */
router.get('/return/print/:id', (req, res) => {
  const { id } = req.params;
  
  const stockReturn = db.prepare(`
    SELECT sr.*, 
           p.name as project_name,
           p.project_no,
           so.stock_out_no,
           u.real_name as operator_name,
           cf.real_name as confirmer_name
    FROM stock_return sr
    LEFT JOIN projects p ON sr.project_id = p.id
    LEFT JOIN stock_out so ON sr.stock_out_id = so.id
    LEFT JOIN users u ON sr.operator_id = u.id
    LEFT JOIN users cf ON sr.confirmed_by = cf.id
    WHERE sr.id = ?
  `).get(id);
  
  if (!stockReturn) {
    return res.status(404).json({
      success: false,
      message: '退库单不存在'
    });
  }
  
  const items = db.prepare(`
    SELECT * FROM stock_return_items WHERE return_id = ? ORDER BY sort_order, id
  `).all(id);
  
  const printData = {
    return_no: stockReturn.return_no,
    project: {
      name: stockReturn.project_name,
      project_no: stockReturn.project_no
    },
    stock_out_no: stockReturn.stock_out_no,
    operator_name: stockReturn.operator_name,
    confirmer_name: stockReturn.confirmer_name,
    status: stockReturn.status,
    created_at: stockReturn.created_at,
    confirmed_at: stockReturn.confirmed_at,
    remark: stockReturn.remark,
    items: items.map((item, index) => ({
      index: index + 1,
      material_name: item.material_name,
      specification: item.specification || '-',
      unit: item.unit || '-',
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.amount,
      reason: item.reason || ''
    })),
    summary: {
      total_quantity: items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0),
      total_amount: items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
    }
  };
  
  res.json({
    success: true,
    data: printData
  });
});

/**
 * GET /api/stock/return/out-list
 * 获取可退库的出库单列表（已确认状态的出库单）
 */
router.get('/return/out-list', (req, res) => {
  const { keyword, project_id } = req.query;
  
  let sql = `
    SELECT so.*, 
           p.name as project_name,
           p.project_no,
           (SELECT COUNT(*) FROM stock_return WHERE stock_out_id = so.id) as return_count
    FROM stock_out so
    LEFT JOIN projects p ON so.project_id = p.id
    WHERE so.status = 'confirmed'
  `;
  const params = [];
  
  if (keyword) {
    sql += ` AND (so.stock_out_no LIKE ? OR p.name LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  if (project_id) {
    sql += ` AND so.project_id = ?`;
    params.push(project_id);
  }
  
  sql += ` ORDER BY so.confirmed_at DESC`;
  
  const stockOutList = db.prepare(sql).all(...params);
  
  // 获取每个出库单的明细
  const stockOutWithItems = stockOutList.map(stockOut => {
    const items = db.prepare(`
      SELECT * FROM stock_out_items WHERE stock_out_id = ? ORDER BY sort_order, id
    `).all(stockOut.id);
    return {
      ...stockOut,
      items,
      item_count: items.length
    };
  });
  
  res.json({
    success: true,
    data: stockOutWithItems
  });
});

// ========================================
// Task 44: 库存查询 API
// ========================================

/**
 * GET /api/stock/query
 * 综合库存查询
 * 支持按物资名称、规格、仓库位置、状态筛选
 * 支持分页和排序
 */
router.get('/query', (req, res) => {
  const {
    keyword,
    material_name,
    specification,
    location,
    status,
    warning_status,
    page = 1,
    pageSize = 20,
    sortField = 'updated_at',
    sortOrder = 'DESC'
  } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `SELECT * FROM inventory WHERE 1=1`;
  const params = [];
  
  // 综合关键词搜索
  if (keyword) {
    sql += ` AND (material_name LIKE ? OR specification LIKE ? OR location LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 物资名称筛选
  if (material_name) {
    sql += ` AND material_name LIKE ?`;
    params.push(`%${material_name}%`);
  }
  
  // 规格筛选
  if (specification) {
    sql += ` AND specification LIKE ?`;
    params.push(`%${specification}%`);
  }
  
  // 位置筛选
  if (location) {
    sql += ` AND location LIKE ?`;
    params.push(`%${location}%`);
  }
  
  // 状态筛选（库存状态：normal/locked/disabled）
  if (status && status !== 'all') {
    sql += ` AND status = ?`;
    params.push(status);
  }
  
  // 预警状态筛选（正常/预警/紧急/超储）
  if (warning_status && warning_status !== 'all') {
    if (warning_status === 'normal') {
      // 正常：库存充足
      sql += ` AND quantity > COALESCE(warning_quantity, 0)`;
      sql += ` AND quantity >= COALESCE(min_quantity, 0)`;
      sql += ` AND (max_quantity IS NULL OR quantity <= max_quantity)`;
    } else if (warning_status === 'warning') {
      // 预警：库存低于预警值但高于最低值
      sql += ` AND quantity <= COALESCE(warning_quantity, 0)`;
      sql += ` AND quantity >= COALESCE(min_quantity, 0)`;
    } else if (warning_status === 'urgent') {
      // 紧急：库存低于最低值
      sql += ` AND min_quantity > 0 AND quantity < min_quantity`;
    } else if (warning_status === 'overstock') {
      // 超储：库存超过最大值
      sql += ` AND max_quantity IS NOT NULL AND quantity > max_quantity`;
    }
  }
  
  // 获取总数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序
  const validSortFields = ['material_name', 'quantity', 'unit_price', 'updated_at', 'created_at'];
  const validSortOrders = ['ASC', 'DESC'];
  const safeSortField = validSortFields.includes(sortField) ? sortField : 'updated_at';
  const safeSortOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  
  sql += ` ORDER BY ${safeSortField} ${safeSortOrder} LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const stockList = db.prepare(sql).all(...params);
  
  // 计算预警状态
  const stockWithStatus = stockList.map(item => {
    let warningStatus = 'normal';
    let warningMessage = '库存充足';
    
    if (item.min_quantity > 0 && item.quantity < item.min_quantity) {
      warningStatus = 'urgent';
      warningMessage = '库存紧急：低于最低库存';
    } else if (item.warning_quantity > 0 && item.quantity <= item.warning_quantity) {
      warningStatus = 'warning';
      warningMessage = '库存预警：低于预警值';
    } else if (item.max_quantity && item.quantity > item.max_quantity) {
      warningStatus = 'overstock';
      warningMessage = '库存超储：超过最大库存';
    }
    
    // 计算库存金额
    const totalValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    
    return {
      ...item,
      warning_status: warningStatus,
      warning_message: warningMessage,
      total_value: totalValue
    };
  });
  
  res.json({
    success: true,
    data: stockWithStatus,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/stock/query/statistics
 * 获取库存统计数据
 */
router.get('/query/statistics', (req, res) => {
  // 总物资种类
  const totalTypes = db.prepare(`SELECT COUNT(*) as count FROM inventory`).get();
  
  // 总库存金额
  const totalValue = db.prepare(`
    SELECT SUM(quantity * unit_price) as total FROM inventory
  `).get();
  
  // 预警物资数量（低于预警值但高于最低值）
  const warningCount = db.prepare(`
    SELECT COUNT(*) as count FROM inventory
    WHERE warning_quantity > 0 
      AND quantity <= warning_quantity 
      AND quantity >= COALESCE(min_quantity, 0)
  `).get();
  
  // 紧急物资数量（低于最低值）
  const urgentCount = db.prepare(`
    SELECT COUNT(*) as count FROM inventory
    WHERE min_quantity > 0 AND quantity < min_quantity
  `).get();
  
  // 超储物资数量（超过最大值）
  const overstockCount = db.prepare(`
    SELECT COUNT(*) as count FROM inventory
    WHERE max_quantity IS NOT NULL AND quantity > max_quantity
  `).get();
  
  // 库存为0的物资数量
  const zeroStockCount = db.prepare(`
    SELECT COUNT(*) as count FROM inventory
    WHERE quantity <= 0
  `).get();
  
  // 按位置统计
  const locationStats = db.prepare(`
    SELECT 
      COALESCE(location, '未设置') as location,
      COUNT(*) as count,
      SUM(quantity * unit_price) as total_value
    FROM inventory
    GROUP BY location
    ORDER BY count DESC
  `).all();
  
  // 最近入库物资（前5个）
  const recentIn = db.prepare(`
    SELECT id, material_name, specification, quantity, unit_price, last_stock_in_date
    FROM inventory
    WHERE last_stock_in_date IS NOT NULL
    ORDER BY last_stock_in_date DESC
    LIMIT 5
  `).all();
  
  // 最近出库物资（前5个）
  const recentOut = db.prepare(`
    SELECT id, material_name, specification, quantity, unit_price, last_out_date
    FROM inventory
    WHERE last_out_date IS NOT NULL
    ORDER BY last_out_date DESC
    LIMIT 5
  `).all();
  
  res.json({
    success: true,
    data: {
      total_types: totalTypes?.count || 0,
      total_value: totalValue?.total || 0,
      warning_count: warningCount?.count || 0,
      urgent_count: urgentCount?.count || 0,
      overstock_count: overstockCount?.count || 0,
      zero_stock_count: zeroStockCount?.count || 0,
      location_stats: locationStats,
      recent_in: recentIn,
      recent_out: recentOut
    }
  });
});

/**
 * GET /api/stock/query/detail/:id
 * 获取库存详情（含完整的出入库记录）
 */
router.get('/query/detail/:id', (req, res) => {
  const { id } = req.params;
  
  const stock = db.prepare(`
    SELECT * FROM inventory WHERE id = ?
  `).get(id);
  
  if (!stock) {
    return res.status(404).json({
      success: false,
      message: '库存记录不存在'
    });
  }
  
  // 计算预警状态
  let warningStatus = 'normal';
  let warningMessage = '库存充足';
  
  if (stock.min_quantity > 0 && stock.quantity < stock.min_quantity) {
    warningStatus = 'urgent';
    warningMessage = '库存紧急：低于最低库存';
  } else if (stock.warning_quantity > 0 && stock.quantity <= stock.warning_quantity) {
    warningStatus = 'warning';
    warningMessage = '库存预警：低于预警值';
  } else if (stock.max_quantity && stock.quantity > stock.max_quantity) {
    warningStatus = 'overstock';
    warningMessage = '库存超储：超过最大库存';
  }
  
  // 计算库存金额
  const totalValue = (parseFloat(stock.quantity) || 0) * (parseFloat(stock.unit_price) || 0);
  
  // 获取完整的出入库记录
  const logs = db.prepare(`
    SELECT 
      il.*,
      u.real_name as operator_real_name
    FROM inventory_logs il
    LEFT JOIN users u ON il.operator_id = u.id
    WHERE il.inventory_id = ? 
      OR (il.material_name = ? AND (il.specification = ? OR (? IS NULL AND il.specification IS NULL)))
    ORDER BY il.created_at DESC
    LIMIT 100
  `).all(id, stock.material_name, stock.specification, stock.specification);
  
  // 获取关联的入库单信息
  let lastStockIn = null;
  if (stock.last_stock_in_id) {
    lastStockIn = db.prepare(`
      SELECT si.*, p.name as project_name, s.name as supplier_name
      FROM stock_in si
      LEFT JOIN projects p ON si.project_id = p.id
      LEFT JOIN suppliers s ON si.supplier_id = s.id
      WHERE si.id = ?
    `).get(stock.last_stock_in_id);
  }
  
  // 获取最近出库记录
  const recentOutLogs = db.prepare(`
    SELECT il.*, so.stock_out_no, p.name as project_name
    FROM inventory_logs il
    LEFT JOIN stock_out so ON il.stock_out_id = so.id
    LEFT JOIN projects p ON so.project_id = p.id
    WHERE (il.inventory_id = ? OR (il.material_name = ? AND (il.specification = ? OR (? IS NULL AND il.specification IS NULL))))
      AND il.change_type = 'out'
    ORDER BY il.created_at DESC
    LIMIT 5
  `).all(id, stock.material_name, stock.specification, stock.specification);
  
  res.json({
    success: true,
    data: {
      ...stock,
      warning_status: warningStatus,
      warning_message: warningMessage,
      total_value: totalValue,
      logs,
      last_stock_in: lastStockIn,
      recent_out_logs: recentOutLogs
    }
  });
});

/**
 * GET /api/stock/query/export
 * 导出库存数据（CSV格式）
 */
router.get('/query/export', (req, res) => {
  const { status, warning_status, format = 'csv' } = req.query;
  
  let sql = `SELECT 
    id,
    material_name as '物资名称',
    specification as '规格型号',
    unit as '单位',
    quantity as '库存数量',
    available_quantity as '可领数量',
    unit_price as '单价',
    (quantity * unit_price) as '库存金额',
    max_quantity as '库存上限',
    min_quantity as '库存下限',
    warning_quantity as '预警值',
    location as '存放位置',
    status as '状态',
    last_stock_in_date as '最后入库日期',
    last_out_date as '最后出库日期',
    created_at as '创建时间',
    updated_at as '更新时间'
  FROM inventory WHERE 1=1`;
  
  const params = [];
  
  // 状态筛选
  if (status && status !== 'all') {
    sql += ` AND status = ?`;
    params.push(status);
  }
  
  // 预警状态筛选
  if (warning_status && warning_status !== 'all') {
    if (warning_status === 'warning') {
      sql += ` AND warning_quantity > 0 AND quantity <= warning_quantity AND quantity >= COALESCE(min_quantity, 0)`;
    } else if (warning_status === 'urgent') {
      sql += ` AND min_quantity > 0 AND quantity < min_quantity`;
    } else if (warning_status === 'overstock') {
      sql += ` AND max_quantity IS NOT NULL AND quantity > max_quantity`;
    }
  }
  
  sql += ` ORDER BY material_name ASC`;
  
  const stockList = db.prepare(sql).all(...params);
  
  // 计算预警状态并添加到导出数据
  const exportData = stockList.map(item => {
    let warningStatus = '正常';
    if (item['库存下限'] > 0 && item['库存数量'] < item['库存下限']) {
      warningStatus = '紧急';
    } else if (item['预警值'] > 0 && item['库存数量'] <= item['预警值']) {
      warningStatus = '预警';
    } else if (item['库存上限'] && item['库存数量'] > item['库存上限']) {
      warningStatus = '超储';
    }
    
    return {
      ...item,
      '库存状态': warningStatus
    };
  });
  
  if (format === 'json') {
    res.json({
      success: true,
      data: exportData,
      total: exportData.length
    });
  } else {
    // 生成CSV
    const headers = Object.keys(exportData[0] || {});
    const csvRows = [headers.join(',')];
    
    exportData.forEach(row => {
      const values = headers.map(h => {
        let val = row[h];
        if (val === null || val === undefined) val = '';
        // 转义包含逗号或引号的值
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      });
      csvRows.push(values.join(','));
    });
    
    const csvContent = '\uFEFF' + csvRows.join('\n'); // 添加BOM以支持中文
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=stock_export_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csvContent);
  }
});

/**
 * GET /api/stock/query/locations
 * 获取所有仓库位置列表（用于筛选）
 */
router.get('/query/locations', (req, res) => {
  const locations = db.prepare(`
    SELECT DISTINCT location 
    FROM inventory 
    WHERE location IS NOT NULL AND location != ''
    ORDER BY location ASC
  `).all();
  
  res.json({
    success: true,
    data: locations.map(l => l.location)
  });
});

module.exports = router;
