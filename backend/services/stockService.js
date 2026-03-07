/**
 * 库存服务 - Task 42: 物资出库 - 库存扣减
 * 实现库存检查、扣减、日志记录和预警功能
 */

const { db } = require('../models/database');

class StockService {
  
  /**
   * 检查库存是否充足
   * @param {number} materialId - 物资ID（inventory表ID）
   * @param {number} quantity - 需要的数量
   * @returns {object} - { sufficient: boolean, available: number, message: string }
   */
  checkStock(materialId, quantity) {
    const stock = db.prepare(`
      SELECT id, material_name, specification, quantity, available_quantity, unit
      FROM inventory WHERE id = ?
    `).get(materialId);
    
    if (!stock) {
      return {
        sufficient: false,
        available: 0,
        message: '物资不存在'
      };
    }
    
    if (stock.available_quantity < quantity) {
      return {
        sufficient: false,
        available: stock.available_quantity,
        currentStock: stock.quantity,
        message: `库存不足，当前可领数量为 ${stock.available_quantity} ${stock.unit || ''}，需要 ${quantity} ${stock.unit || ''}`
      };
    }
    
    return {
      sufficient: true,
      available: stock.available_quantity,
      currentStock: stock.quantity,
      message: '库存充足'
    };
  }
  
  /**
   * 检查物资库存（通过物资名称和规格）
   * @param {string} materialName - 物资名称
   * @param {string} specification - 规格型号
   * @param {number} quantity - 需要的数量
   * @returns {object} - 检查结果
   */
  checkStockByName(materialName, specification, quantity) {
    const stock = db.prepare(`
      SELECT id, material_name, specification, quantity, available_quantity, unit
      FROM inventory 
      WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
    `).get(materialName, specification, specification);
    
    if (!stock) {
      return {
        sufficient: false,
        available: 0,
        message: `物资 "${materialName}" 不存在于库存中`
      };
    }
    
    return this.checkStock(stock.id, quantity);
  }
  
  /**
   * 扣减库存
   * @param {number} materialId - 物资ID
   * @param {number} quantity - 扣减数量
   * @param {object} options - 附加选项
   * @returns {object} - 扣减结果
   */
  deductStock(materialId, quantity, options = {}) {
    const { 
      stockOutId = null, 
      operatorId = null, 
      operatorName = '',
      remark = '' 
    } = options;
    
    // 获取当前库存
    const stock = db.prepare(`
      SELECT * FROM inventory WHERE id = ?
    `).get(materialId);
    
    if (!stock) {
      throw new Error('物资不存在');
    }
    
    // 检查库存是否充足
    const checkResult = this.checkStock(materialId, quantity);
    if (!checkResult.sufficient) {
      throw new Error(checkResult.message);
    }
    
    const beforeQuantity = stock.quantity;
    const beforeAvailable = stock.available_quantity;
    const afterQuantity = beforeQuantity - quantity;
    const afterAvailable = beforeAvailable - quantity;
    
    // 更新库存
    db.prepare(`
      UPDATE inventory SET
        quantity = ?,
        available_quantity = ?,
        last_out_date = DATE('now'),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(afterQuantity, afterAvailable, materialId);
    
    // 记录库存变动日志
    this.recordLog({
      inventoryId: materialId,
      materialName: stock.material_name,
      specification: stock.specification,
      changeType: 'out',
      changeQuantity: quantity,
      beforeQuantity: beforeQuantity,
      afterQuantity: afterQuantity,
      availableBefore: beforeAvailable,
      availableAfter: afterAvailable,
      stockOutId: stockOutId,
      operatorId: operatorId,
      operatorName: operatorName,
      remark: remark || '出库扣减'
    });
    
    // 检查库存预警
    this.checkAndCreateWarning(materialId, afterQuantity, afterAvailable);
    
    return {
      success: true,
      materialId: materialId,
      materialName: stock.material_name,
      specification: stock.specification,
      deductQuantity: quantity,
      beforeQuantity: beforeQuantity,
      afterQuantity: afterQuantity,
      beforeAvailable: beforeAvailable,
      afterAvailable: afterAvailable
    };
  }
  
  /**
   * 批量扣减库存
   * @param {Array} items - 物资列表 [{ materialId, quantity }, ...]
   * @param {object} options - 附加选项
   * @returns {object} - 批量扣减结果
   */
  batchDeductStock(items, options = {}) {
    const results = [];
    const errors = [];
    
    const transaction = db.transaction(() => {
      for (const item of items) {
        try {
          const result = this.deductStock(item.materialId, item.quantity, {
            ...options,
            remark: item.remark || options.remark
          });
          results.push(result);
        } catch (error) {
          errors.push({
            materialId: item.materialId,
            materialName: item.materialName,
            error: error.message
          });
        }
      }
      
      if (errors.length > 0) {
        throw new Error('部分物资库存扣减失败: ' + errors.map(e => e.error).join('; '));
      }
    });
    
    try {
      transaction();
      return {
        success: true,
        results: results,
        totalDeducted: results.reduce((sum, r) => sum + r.deductQuantity, 0)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        partialResults: results,
        errors: errors
      };
    }
  }
  
  /**
   * 记录库存变动日志
   * @param {object} logData - 日志数据
   */
  recordLog(logData) {
    const {
      inventoryId,
      materialName,
      specification,
      changeType,
      changeQuantity,
      beforeQuantity,
      afterQuantity,
      availableBefore,
      availableAfter,
      stockInId = null,
      stockOutId = null,
      operatorId,
      operatorName,
      remark
    } = logData;
    
    db.prepare(`
      INSERT INTO inventory_logs (
        inventory_id, material_name, specification, change_type,
        change_quantity, before_quantity, after_quantity,
        available_before, available_after,
        stock_in_id, stock_out_id, operator_id, operator_name, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inventoryId,
      materialName,
      specification,
      changeType,
      changeQuantity,
      beforeQuantity,
      afterQuantity,
      availableBefore || 0,
      availableAfter || 0,
      stockInId,
      stockOutId,
      operatorId,
      operatorName,
      remark
    );
  }
  
  /**
   * 检查库存预警并生成预警记录
   * @param {number} inventoryId - 库存ID
   * @param {number} currentQuantity - 当前库存量
   * @param {number} availableQuantity - 当前可领量
   */
  checkAndCreateWarning(inventoryId, currentQuantity, availableQuantity) {
    const stock = db.prepare(`
      SELECT * FROM inventory WHERE id = ?
    `).get(inventoryId);
    
    if (!stock) return;
    
    const warnings = [];
    
    // 检查库存下限
    if (stock.min_quantity > 0 && currentQuantity < stock.min_quantity) {
      warnings.push({
        type: 'low_stock',
        level: 'danger',
        message: `库存不足：当前库存 ${currentQuantity}，低于下限 ${stock.min_quantity}`
      });
    }
    
    // 检查库存预警值
    if (stock.warning_quantity > 0 && currentQuantity <= stock.warning_quantity) {
      warnings.push({
        type: 'warning_level',
        level: 'warning',
        message: `库存预警：当前库存 ${currentQuantity}，已达到预警值 ${stock.warning_quantity}`
      });
    }
    
    // 更新库存状态
    if (warnings.length > 0) {
      const hasDanger = warnings.some(w => w.level === 'danger');
      db.prepare(`
        UPDATE inventory SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(hasDanger ? 'warning' : 'normal', inventoryId);
      
      // 可以在这里添加预警通知逻辑
      // 例如：发送通知给仓库管理员
      console.log(`[库存预警] 物资: ${stock.material_name}, 规格: ${stock.specification || '无'}`);
      warnings.forEach(w => console.log(`  - ${w.message}`));
    }
  }
  
  /**
   * 获取物资库存信息
   * @param {number} materialId - 物资ID
   * @returns {object} - 库存信息
   */
  getStockInfo(materialId) {
    return db.prepare(`
      SELECT * FROM inventory WHERE id = ?
    `).get(materialId);
  }
  
  /**
   * 获取物资库存信息（通过名称和规格）
   * @param {string} materialName - 物资名称
   * @param {string} specification - 规格型号
   * @returns {object} - 库存信息
   */
  getStockInfoByName(materialName, specification) {
    return db.prepare(`
      SELECT * FROM inventory 
      WHERE material_name = ? AND (specification = ? OR (? IS NULL AND specification IS NULL))
    `).get(materialName, specification, specification);
  }
  
  /**
   * 获取库存预警列表
   * @returns {Array} - 预警列表
   */
  getWarningList() {
    return db.prepare(`
      SELECT * FROM inventory
      WHERE 
        (min_quantity > 0 AND quantity < min_quantity)
        OR (warning_quantity > 0 AND quantity <= warning_quantity)
      ORDER BY quantity ASC
    `).all();
  }
  
  /**
   * 锁定库存（预留）
   * @param {number} materialId - 物资ID
   * @param {number} quantity - 锁定数量
   * @returns {object} - 锁定结果
   */
  lockStock(materialId, quantity) {
    const stock = this.getStockInfo(materialId);
    if (!stock) {
      throw new Error('物资不存在');
    }
    
    if (stock.available_quantity < quantity) {
      throw new Error(`可领库存不足，当前可领 ${stock.available_quantity}，需要锁定 ${quantity}`);
    }
    
    const newLocked = (stock.locked_quantity || 0) + quantity;
    const newAvailable = stock.available_quantity - quantity;
    
    db.prepare(`
      UPDATE inventory SET
        locked_quantity = ?,
        available_quantity = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newLocked, newAvailable, materialId);
    
    return {
      success: true,
      lockedQuantity: quantity,
      totalLocked: newLocked,
      availableQuantity: newAvailable
    };
  }
  
  /**
   * 解锁库存（取消预留）
   * @param {number} materialId - 物资ID
   * @param {number} quantity - 解锁数量
   * @returns {object} - 解锁结果
   */
  unlockStock(materialId, quantity) {
    const stock = this.getStockInfo(materialId);
    if (!stock) {
      throw new Error('物资不存在');
    }
    
    const currentLocked = stock.locked_quantity || 0;
    if (currentLocked < quantity) {
      quantity = currentLocked; // 最多解锁已锁定数量
    }
    
    const newLocked = currentLocked - quantity;
    const newAvailable = stock.available_quantity + quantity;
    
    db.prepare(`
      UPDATE inventory SET
        locked_quantity = ?,
        available_quantity = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newLocked, newAvailable, materialId);
    
    return {
      success: true,
      unlockedQuantity: quantity,
      totalLocked: newLocked,
      availableQuantity: newAvailable
    };
  }
}

  /**
   * 获取库存列表（Task 44）
   * @param {object} options - 查询选项
   * @returns {object} - 库存列表和分页信息
   */
  getStockList(options = {}) {
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
    } = options;
    
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
    
    // 状态筛选
    if (status && status !== 'all') {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    // 预警状态筛选
    if (warning_status && warning_status !== 'all') {
      if (warning_status === 'normal') {
        sql += ` AND quantity > COALESCE(warning_quantity, 0)`;
        sql += ` AND quantity >= COALESCE(min_quantity, 0)`;
        sql += ` AND (max_quantity IS NULL OR quantity <= max_quantity)`;
      } else if (warning_status === 'warning') {
        sql += ` AND quantity <= COALESCE(warning_quantity, 0)`;
        sql += ` AND quantity >= COALESCE(min_quantity, 0)`;
      } else if (warning_status === 'urgent') {
        sql += ` AND min_quantity > 0 AND quantity < min_quantity`;
      } else if (warning_status === 'overstock') {
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
      
      const totalValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
      
      return {
        ...item,
        warning_status: warningStatus,
        warning_message: warningMessage,
        total_value: totalValue
      };
    });
    
    return {
      list: stockWithStatus,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    };
  }
  
  /**
   * 获取库存详情（Task 44）
   * @param {number} id - 库存ID
   * @returns {object} - 库存详情
   */
  getStockDetail(id) {
    const stock = db.prepare(`
      SELECT * FROM inventory WHERE id = ?
    `).get(id);
    
    if (!stock) {
      return null;
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
    
    const totalValue = (parseFloat(stock.quantity) || 0) * (parseFloat(stock.unit_price) || 0);
    
    // 获取出入库记录
    const logs = db.prepare(`
      SELECT 
        il.*,
        u.real_name as operator_real_name
      FROM inventory_logs il
      LEFT JOIN users u ON il.operator_id = u.id
      WHERE il.inventory_id = ? 
        OR (il.material_name = ? AND (il.specification = ? OR (? IS NULL AND il.specification IS NULL)))
      ORDER BY il.created_at DESC
      LIMIT 50
    `).all(id, stock.material_name, stock.specification, stock.specification);
    
    return {
      ...stock,
      warning_status: warningStatus,
      warning_message: warningMessage,
      total_value: totalValue,
      logs
    };
  }
  
  /**
   * 获取库存统计（Task 44）
   * @returns {object} - 统计数据
   */
  getStockStatistics() {
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
    
    return {
      total_types: totalTypes?.count || 0,
      total_value: totalValue?.total || 0,
      warning_count: warningCount?.count || 0,
      urgent_count: urgentCount?.count || 0,
      overstock_count: overstockCount?.count || 0,
      zero_stock_count: zeroStockCount?.count || 0,
      location_stats: locationStats,
      recent_in: recentIn,
      recent_out: recentOut
    };
  }
  
  /**
   * 获取所有仓库位置列表
   * @returns {Array} - 位置列表
   */
  getLocations() {
    const locations = db.prepare(`
      SELECT DISTINCT location 
      FROM inventory 
      WHERE location IS NOT NULL AND location != ''
      ORDER BY location ASC
    `).all();
    
    return locations.map(l => l.location);
  }
}

// 导出单例
const stockService = new StockService();
module.exports = stockService;
