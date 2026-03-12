/**
 * 材料价格信息库路由
 * 实现材料基准价管理、价格预警、超量校验等功能
 * 
 * Task 31: 材料价格信息库 - 基准价管理
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission, attachPermissions } = require('../middleware/permission');

const router = express.Router();

// 为所有材料路由附加权限信息
router.use(authMiddleware, attachPermissions);

// ========================================
// 材料基准价管理 API
// ========================================

/**
 * GET /api/materials/base
 * 获取所有材料的基准价列表
 * 查询参数: keyword, status, page, pageSize
 */
router.get('/base', (req, res) => {
  const { keyword, status = 'active', page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT *
    FROM material_base_prices
    WHERE 1=1
  `;
  const params = [];
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (material_name LIKE ? OR specification LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  
  // 状态筛选
  if (status !== 'all') {
    sql += ` AND status = ?`;
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
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
});

/**
 * GET /api/materials/:id
 * 获取单个材料详情
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const material = db.prepare(`
    SELECT * FROM material_base_prices WHERE id = ?
  `).get(id);
  
  if (!material) {
    return res.status(404).json({
      success: false,
      message: '材料不存在'
    });
  }
  
  // 获取历史价格记录
  const priceHistory = db.prepare(`
    SELECT * FROM material_price_history
    WHERE material_id = ?
    ORDER BY created_at DESC
    LIMIT 10
  `).all(id);
  
  res.json({
    success: true,
    data: {
      ...material,
      priceHistory
    }
  });
});

/**
 * POST /api/materials
 * 创建材料基准价
 */
router.post('/', checkPermission('material:create'), (req, res) => {
  const {
    material_name,
    specification,
    unit,
    base_price,
    effective_date,
    expiry_date,
    supplier_id,
    remarks,
    category,
    tax_rate
  } = req.body;
  
  // 验证必填字段
  if (!material_name || !material_name.trim()) {
    return res.status(400).json({
      success: false,
      message: '名称不能为空'
    });
  }
  
  // 材料类必须填写规格型号
  if (category === 'material' && !specification) {
    return res.status(400).json({
      success: false,
      message: '材料类必须填写规格型号'
    });
  }
  
  if (!base_price || base_price <= 0) {
    return res.status(400).json({
      success: false,
      message: '价格必须大于0'
    });
  }
  
  const userId = req.user.id;
  
  try {
    // 检查是否已存在相同名称和规格的材料
    const existing = db.prepare(`
      SELECT * FROM material_base_prices
      WHERE material_name = ? AND specification = ? AND status = 'active'
    `).get(material_name.trim(), specification || '');
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: '已存在相同名称和规格的材料'
      });
    }
    
    const result = db.prepare(`
      INSERT INTO material_base_prices (
        material_name, specification, unit, base_price,
        effective_date, expiry_date, supplier_id, remarks,
        created_by, status, category, tax_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      material_name.trim(),
      specification || null,
      unit || null,
      base_price,
      effective_date || null,
      expiry_date || null,
      supplier_id || null,
      remarks || null,
      userId,
      category || 'material',
      tax_rate || 13
    );
    
    const newMaterial = db.prepare(`
      SELECT * FROM material_base_prices WHERE id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '材料基准价创建成功',
      data: newMaterial
    });
  } catch (error) {
    console.error('创建材料基准价失败:', error);
    res.status(500).json({
      success: false,
      message: '创建材料基准价失败: ' + error.message
    });
  }
});

/**
 * PUT /api/materials/:id
 * 更新材料基准价
 */
router.put('/:id', checkPermission('material:edit'), (req, res) => {
  const { id } = req.params;
  const {
    material_name,
    specification,
    unit,
    base_price,
    effective_date,
    expiry_date,
    supplier_id,
    remarks,
    status,
    category,
    tax_rate
  } = req.body;
  
  // 检查材料是否存在
  const existingMaterial = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
  if (!existingMaterial) {
    return res.status(404).json({
      success: false,
      message: '材料不存在'
    });
  }
  
  const userId = req.user.id;
  
  try {
    const transaction = db.transaction(() => {
      // 如果基准价发生变化，记录历史价格
      if (base_price && base_price !== existingMaterial.base_price) {
        db.prepare(`
          INSERT INTO material_price_history (
            material_id, old_price, new_price, changed_by, change_reason
          ) VALUES (?, ?, ?, ?, ?)
        `).run(id, existingMaterial.base_price, base_price, userId, '基准价更新');
      }
      
      // 更新材料信息
      db.prepare(`
        UPDATE material_base_prices SET
          material_name = COALESCE(?, material_name),
          specification = COALESCE(?, specification),
          unit = COALESCE(?, unit),
          base_price = COALESCE(?, base_price),
          effective_date = COALESCE(?, effective_date),
          expiry_date = COALESCE(?, expiry_date),
          supplier_id = COALESCE(?, supplier_id),
          remarks = COALESCE(?, remarks),
          status = COALESCE(?, status),
          category = COALESCE(?, category),
          tax_rate = COALESCE(?, tax_rate),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        material_name, specification, unit, base_price,
        effective_date, expiry_date, supplier_id, remarks, status, category, tax_rate, id
      );
    });
    
    transaction();
    
    const updatedMaterial = db.prepare(`
      SELECT * FROM material_base_prices WHERE id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '材料基准价更新成功',
      data: updatedMaterial
    });
  } catch (error) {
    console.error('更新材料基准价失败:', error);
    res.status(500).json({
      success: false,
      message: '更新材料基准价失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/materials/:id
 * 删除材料（软删除，将状态改为 deleted）
 */
router.delete('/:id', checkPermission('material:delete'), (req, res) => {
  const { id } = req.params;
  
  const material = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
  if (!material) {
    return res.status(404).json({
      success: false,
      message: '材料不存在'
    });
  }
  
  // 检查是否已被删除
  if (material.status === 'deleted') {
    return res.status(400).json({
      success: false,
      message: '材料已被删除'
    });
  }
  
  try {
    // 软删除
    db.prepare(`
      UPDATE material_base_prices SET
        status = 'deleted',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    
    res.json({
      success: true,
      message: '材料删除成功'
    });
  } catch (error) {
    console.error('删除材料失败:', error);
    res.status(500).json({
      success: false,
      message: '删除材料失败: ' + error.message
    });
  }
});

/**
 * PUT /api/materials/base-price
 * 批量更新材料基准价
 */
router.put('/base-price', checkPermission('material:edit'), (req, res) => {
  const { updates, reason } = req.body;
  
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      message: '更新列表不能为空'
    });
  }
  
  const userId = req.user.id;
  
  try {
    const transaction = db.transaction(() => {
      const results = [];
      
      updates.forEach(update => {
        const { id, base_price } = update;
        
        if (!id || !base_price || base_price <= 0) {
          results.push({ id, success: false, message: '无效的参数' });
          return;
        }
        
        const material = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
        if (!material) {
          results.push({ id, success: false, message: '材料不存在' });
          return;
        }
        
        // 记录历史价格
        if (base_price !== material.base_price) {
          db.prepare(`
            INSERT INTO material_price_history (
              material_id, old_price, new_price, changed_by, change_reason
            ) VALUES (?, ?, ?, ?, ?)
          `).run(id, material.base_price, base_price, userId, reason || '批量更新');
        }
        
        // 更新基准价
        db.prepare(`
          UPDATE material_base_prices SET
            base_price = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(base_price, id);
        
        results.push({ id, success: true, message: '更新成功' });
      });
      
      return results;
    });
    
    const results = transaction();
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    res.json({
      success: true,
      message: `批量更新完成: ${successCount} 成功, ${failCount} 失败`,
      data: results
    });
  } catch (error) {
    console.error('批量更新基准价失败:', error);
    res.status(500).json({
      success: false,
      message: '批量更新基准价失败: ' + error.message
    });
  }
});

// ========================================
// 价格预警 API
// ========================================

/**
 * POST /api/materials/price-warning
 * 检查价格并预警
 * 比较实际采购价格与基准价，返回预警信息
 */
router.post('/price-warning', (req, res) => {
  const { items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '检查项目列表不能为空'
    });
  }
  
  try {
    const warnings = [];
    const normalItems = [];
    
    items.forEach(item => {
      const { material_name, specification, unit_price, quantity } = item;
      
      // 查找基准价
      const basePrice = db.prepare(`
        SELECT * FROM material_base_prices
        WHERE material_name = ?
          AND (specification = ? OR ? IS NULL OR specification IS NULL)
          AND status = 'active'
          AND (expiry_date IS NULL OR expiry_date >= date('now'))
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(material_name, specification, specification);
      
      if (basePrice) {
        // 检查价格是否超出基准价
        if (unit_price > basePrice.base_price) {
          const overageAmount = unit_price - basePrice.base_price;
          const overagePercent = (overageAmount / basePrice.base_price * 100).toFixed(2);
          const totalOverage = overageAmount * (quantity || 1);
          
          // 判断预警级别
          let warningLevel = 'info';
          if (overagePercent >= 20) {
            warningLevel = 'danger';
          } else if (overagePercent >= 10) {
            warningLevel = 'warning';
          }
          
          warnings.push({
            material_name,
            specification,
            unit_price,
            base_price: basePrice.base_price,
            overage_amount: parseFloat(overageAmount.toFixed(2)),
            overage_percent: parseFloat(overagePercent),
            total_overage: parseFloat(totalOverage.toFixed(2)),
            warning_level: warningLevel,
            base_price_id: basePrice.id
          });
        } else {
          normalItems.push({
            material_name,
            specification,
            unit_price,
            base_price: basePrice.base_price
          });
        }
      } else {
        // 未找到基准价
        normalItems.push({
          material_name,
          specification,
          unit_price,
          base_price: null,
          message: '未找到基准价'
        });
      }
    });
    
    res.json({
      success: true,
      data: {
        hasWarning: warnings.length > 0,
        warningCount: warnings.length,
        normalCount: normalItems.length,
        warnings,
        normalItems
      }
    });
  } catch (error) {
    console.error('价格预警检查失败:', error);
    res.status(500).json({
      success: false,
      message: '价格预警检查失败: ' + error.message
    });
  }
});

/**
 * PUT /api/materials/:id/overcheck
 * 检查超量 - 返回超量申请和超量校验
 */
router.put('/:id/overcheck', (req, res) => {
  const { id } = req.params;
  const { project_id, items } = req.body;
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: '检查项目列表不能为空'
    });
  }
  
  try {
    // 获取材料信息
    const material = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '材料不存在'
      });
    }
    
    const overageResults = [];
    
    items.forEach(item => {
      const { quantity, unit_price } = item;
      
      // 数量超量检查（如果有采购清单）
      let quantityOverage = null;
      if (project_id) {
        const listItem = db.prepare(`
          SELECT pli.*, pl.name as list_name
          FROM purchase_list_items pli
          JOIN purchase_lists pl ON pli.purchase_list_id = pl.id
          WHERE pl.project_id = ?
            AND pli.material_name = ?
            AND pl.status != 'cancelled'
          LIMIT 1
        `).get(project_id, material.material_name);
        
        if (listItem) {
          quantityOverage = {
            list_name: listItem.list_name,
            list_quantity: listItem.quantity,
            actual_quantity: quantity,
            overage_quantity: Math.max(0, quantity - listItem.quantity),
            is_overage: quantity > listItem.quantity
          };
        }
      }
      
      // 价格超量检查
      const priceOverage = {
        base_price: material.base_price,
        actual_price: unit_price,
        overage_amount: Math.max(0, unit_price - material.base_price),
        overage_percent: unit_price > material.base_price 
          ? parseFloat(((unit_price - material.base_price) / material.base_price * 100).toFixed(2))
          : 0,
        is_overage: unit_price > material.base_price
      };
      
      overageResults.push({
        material_name: material.material_name,
        specification: material.specification,
        quantity_overage: quantityOverage,
        price_overage: priceOverage,
        need_approval: (quantityOverage?.is_overage) || priceOverage.is_overage
      });
    });
    
    res.json({
      success: true,
      data: {
        material,
        overage_checks: overageResults,
        has_overage: overageResults.some(r => r.need_approval)
      }
    });
  } catch (error) {
    console.error('超量检查失败:', error);
    res.status(500).json({
      success: false,
      message: '超量检查失败: ' + error.message
    });
  }
});

/**
 * POST /api/materials/:id/price-check
 * 检查价格是否超出基准价，需预算员审批
 * 返回超量明细，调用超量申请接口
 */
router.post('/:id/price-check', (req, res) => {
  const { id } = req.params;
  const { 
    contract_id,
    quantity,
    unit_price,
    project_id,
    reason
  } = req.body;
  
  const userId = req.user.id;
  
  try {
    // 获取材料信息
    const material = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '材料不存在'
      });
    }
    
    // 检查价格是否超出基准价
    if (unit_price <= material.base_price) {
      return res.json({
        success: true,
        data: {
          is_overage: false,
          message: '价格未超出基准价，无需审批'
        }
      });
    }
    
    const overageAmount = unit_price - material.base_price;
    const overagePercent = parseFloat(((overageAmount / material.base_price) * 100).toFixed(2));
    const totalOverage = overageAmount * quantity;
    
    // 创建超量申请记录
    const transaction = db.transaction(() => {
      // 插入支出超量记录
      const result = db.prepare(`
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
        ) VALUES (?, NULL, ?, 0, ?, ?, ?, 0, ?, ?, 'pending')
      `).run(
        contract_id || null,
        material.material_name,
        material.base_price,
        quantity,
        unit_price,
        totalOverage,
        reason || `价格超出基准价 ${overagePercent}%`
      );
      
      // 创建价格预警记录
      const warningResult = db.prepare(`
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
      `).run(
        contract_id || null,
        material.material_name,
        material.specification,
        unit_price,
        material.base_price,
        overagePercent,
        overagePercent >= 20 ? 'danger' : 'warning'
      );
      
      return { overageId: result.lastInsertRowid, warningId: warningResult.lastInsertRowid };
    });
    
    const { overageId, warningId } = transaction();
    
    res.json({
      success: true,
      data: {
        is_overage: true,
        need_budget_approval: true,
        overage_detail: {
          material_name: material.material_name,
          specification: material.specification,
          base_price: material.base_price,
          actual_price: unit_price,
          quantity,
          overage_amount: parseFloat(overageAmount.toFixed(2)),
          overage_percent: overagePercent,
          total_overage: parseFloat(totalOverage.toFixed(2)),
          overage_record_id: overageId,
          warning_record_id: warningId
        },
        message: '价格超出基准价，已创建超量申请，等待预算员审批'
      }
    });
  } catch (error) {
    console.error('价格检查失败:', error);
    res.status(500).json({
      success: false,
      message: '价格检查失败: ' + error.message
    });
  }
});

/**
 * POST /api/materials/:id/suppliers
 * 获取合同供应商列表(用于下拉选择)
 */
router.post('/:id/suppliers', (req, res) => {
  const { id } = req.params;
  const { keyword } = req.body;
  
  try {
    // 检查材料是否存在
    const material = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '材料不存在'
      });
    }
    
    // 获取供应商列表
    let sql = `
      SELECT id, name, contact_person, phone, email, address, bank_name, bank_account
      FROM suppliers
      WHERE status = 'active'
    `;
    const params = [];
    
    if (keyword) {
      sql += ` AND (name LIKE ? OR contact_person LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    
    sql += ` ORDER BY name ASC`;
    
    const suppliers = db.prepare(sql).all(...params);
    
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
 * PUT /api/materials/suppliers
 * 添加供应商
 */
router.put('/suppliers', checkPermission('supplier:create'), (req, res) => {
  const {
    name,
    contact_person,
    phone,
    email,
    address,
    bank_name,
    bank_account
  } = req.body;
  
  // 验证必填字段
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: '供应商名称不能为空'
    });
  }
  
  try {
    // 检查是否已存在同名供应商
    const existing = db.prepare(`
      SELECT * FROM suppliers WHERE name = ? AND status = 'active'
    `).get(name.trim());
    
    if (existing) {
      return res.status(400).json({
        success: false,
        message: '已存在同名供应商'
      });
    }
    
    const result = db.prepare(`
      INSERT INTO suppliers (name, contact_person, phone, email, address, bank_name, bank_account)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      contact_person || null,
      phone || null,
      email || null,
      address || null,
      bank_name || null,
      bank_account || null
    );
    
    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '供应商添加成功',
      data: newSupplier
    });
  } catch (error) {
    console.error('添加供应商失败:', error);
    res.status(500).json({
      success: false,
      message: '添加供应商失败: ' + error.message
    });
  }
});

// ========================================
// 支出合同相关 API
// ========================================

/**
 * POST /api/contracts/expense
 * 创建支出合同（收入合同）
 * 在表中新增收入合同（选择已有合同）
 */
router.post('/contracts/expense', checkPermission('contract:create'), (req, res) => {
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
    items,            // 合同明细
    existing_contract_id // 选择已有合同（关联）
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
  
  const userId = req.user.id;
  
  try {
    const transaction = db.transaction(() => {
      // 生成支出合同编号
      const { getContractNo } = require('../utils/contractNo');
      const contractNo = getContractNo('expense');
      
      // 检查是否关联已有合同
      let linkedContractNo = null;
      if (existing_contract_id) {
        const existingContract = db.prepare('SELECT contract_no FROM contracts WHERE id = ?').get(existing_contract_id);
        if (existingContract) {
          linkedContractNo = existingContract.contract_no;
        }
      }
      
      // 插入合同
      const result = db.prepare(`
        INSERT INTO contracts (
          contract_no, name, type, project_id, 
          party_a, party_b, amount,
          sign_date, start_date, end_date,
          status, creator_id, supplier_id, purchase_list_id,
          description
        ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
      `).run(
        contractNo, name, project_id,
        party_a || '本公司', party_b, amount || 0,
        sign_date, start_date, end_date,
        userId, supplier_id, purchase_list_id,
        description || linkedContractNo ? `关联合同: ${linkedContractNo}` : null
      );
      
      const contractId = result.lastInsertRowid;
      
      // 如果有明细，执行超量校验
      if (items && items.length > 0) {
        const overageItems = [];
        
        items.forEach(item => {
          const { material_name, specification, quantity, unit_price } = item;
          
          // 检查基准价
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
            
            // 创建价格预警
            db.prepare(`
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
            `).run(
              contractId,
              material_name,
              specification,
              unit_price,
              basePrice.base_price,
              parseFloat(overagePercent),
              overagePercent >= 20 ? 'danger' : 'warning'
            );
            
            overageItems.push({
              material_name,
              specification,
              unit_price,
              base_price: basePrice.base_price,
              overage_percent: parseFloat(overagePercent)
            });
          }
        });
        
        // 如果有超量项，更新合同状态
        if (overageItems.length > 0) {
          db.prepare(`
            UPDATE contracts SET
              overcheck_result = ?,
              is_excessive = 1,
              overcheck_status = 'pending'
            WHERE id = ?
          `).run(JSON.stringify(overageItems), contractId);
        }
      }
      
      return contractId;
    });
    
    const contractId = transaction();
    
    const newContract = db.prepare(`
      SELECT c.*, p.name as project_name, p.project_no
      FROM contracts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `).get(contractId);
    
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
 * GET /api/materials/price-history/:id
 * 获取材料价格历史记录
 */
router.get('/price-history/:id', (req, res) => {
  const { id } = req.params;
  const { page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  try {
    // 检查材料是否存在
    const material = db.prepare('SELECT * FROM material_base_prices WHERE id = ?').get(id);
    if (!material) {
      return res.status(404).json({
        success: false,
        message: '材料不存在'
      });
    }
    
    // 获取总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM material_price_history WHERE material_id = ?
    `).get(id);
    const total = countResult ? countResult.total : 0;
    
    // 获取历史记录
    const history = db.prepare(`
      SELECT mph.*, u.real_name as changer_name
      FROM material_price_history mph
      LEFT JOIN users u ON mph.changed_by = u.id
      WHERE mph.material_id = ?
      ORDER BY mph.created_at DESC
      LIMIT ? OFFSET ?
    `).all(id, parseInt(pageSize), offset);
    
    res.json({
      success: true,
      data: history,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取价格历史失败:', error);
    res.status(500).json({
      success: false,
      message: '获取价格历史失败: ' + error.message
    });
  }
});

/**
 * GET /api/materials/export
 * 导出材料基准价列表
 */
router.get('/export', (req, res) => {
  const { status = 'active' } = req.query;
  
  try {
    let sql = `
      SELECT 
        mbp.id,
        mbp.material_name,
        mbp.specification,
        mbp.unit,
        mbp.base_price,
        mbp.effective_date,
        mbp.expiry_date,
        mbp.status,
        s.name as supplier_name,
        mbp.created_at
      FROM material_base_prices mbp
      LEFT JOIN suppliers s ON mbp.supplier_id = s.id
      WHERE 1=1
    `;
    const params = [];
    
    if (status !== 'all') {
      sql += ` AND mbp.status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY mbp.material_name ASC`;
    
    const materials = db.prepare(sql).all(...params);
    
    res.json({
      success: true,
      data: materials,
      total: materials.length
    });
  } catch (error) {
    console.error('导出材料基准价失败:', error);
    res.status(500).json({
      success: false,
      message: '导出材料基准价失败: ' + error.message
    });
  }
});

/**
 * POST /api/materials/import
 * 导入材料基准价
 */
router.post('/import', checkPermission('material:create'), (req, res) => {
  const { materials, mode = 'skip' } = req.body; // mode: skip(跳过重复), update(更新重复), error(报错)
  
  if (!materials || !Array.isArray(materials) || materials.length === 0) {
    return res.status(400).json({
      success: false,
      message: '导入数据不能为空'
    });
  }
  
  const userId = req.user.id;
  
  try {
    const results = {
      total: materials.length,
      success: 0,
      skipped: 0,
      updated: 0,
      failed: 0,
      errors: []
    };
    
    const transaction = db.transaction(() => {
      materials.forEach((item, index) => {
        const { material_name, specification, unit, base_price, effective_date, expiry_date } = item;
        
        if (!material_name || !base_price) {
          results.failed++;
          results.errors.push({ row: index + 1, message: '材料名称或基准价为空' });
          return;
        }
        
        // 检查是否存在
        const existing = db.prepare(`
          SELECT * FROM material_base_prices
          WHERE material_name = ? AND specification = ? AND status = 'active'
        `).get(material_name.trim(), specification || '');
        
        if (existing) {
          if (mode === 'skip') {
            results.skipped++;
            return;
          } else if (mode === 'update') {
            // 记录历史价格
            db.prepare(`
              INSERT INTO material_price_history (
                material_id, old_price, new_price, changed_by, change_reason
              ) VALUES (?, ?, ?, ?, ?)
            `).run(existing.id, existing.base_price, base_price, userId, '导入更新');
            
            // 更新
            db.prepare(`
              UPDATE material_base_prices SET
                base_price = ?,
                unit = COALESCE(?, unit),
                effective_date = COALESCE(?, effective_date),
                expiry_date = COALESCE(?, expiry_date),
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(base_price, unit, effective_date, expiry_date, existing.id);
            
            results.updated++;
            return;
          } else {
            results.failed++;
            results.errors.push({ row: index + 1, message: '材料已存在' });
            return;
          }
        }
        
        // 新增
        try {
          db.prepare(`
            INSERT INTO material_base_prices (
              material_name, specification, unit, base_price,
              effective_date, expiry_date, created_by, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `).run(
            material_name.trim(),
            specification || null,
            unit || null,
            base_price,
            effective_date || null,
            expiry_date || null,
            userId
          );
          
          results.success++;
        } catch (e) {
          results.failed++;
          results.errors.push({ row: index + 1, message: e.message });
        }
      });
    });
    
    transaction();
    
    res.json({
      success: true,
      message: `导入完成: 新增 ${results.success}, 跳过 ${results.skipped}, 更新 ${results.updated}, 失败 ${results.failed}`,
      data: results
    });
  } catch (error) {
    console.error('导入材料基准价失败:', error);
    res.status(500).json({
      success: false,
      message: '导入材料基准价失败: ' + error.message
    });
  }
});

module.exports = router;
