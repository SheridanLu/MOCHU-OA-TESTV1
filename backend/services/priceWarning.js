/**
 * 价格预警服务
 * 用于检查材料实际采购价格是否超出基准价，并返回预警级别
 * 
 * 预警级别定义：
 * - normal: 正常（价格未超出基准价）
 * - warning: 警告（超出10%以内）
 * - danger: 严重（超出20%及以上）
 */

const { db } = require('../models/database');

/**
 * 预警级别常量
 */
const WARNING_LEVELS = {
  NORMAL: 'normal',
  WARNING: 'warning',
  DANGER: 'danger'
};

/**
 * 预警阈值配置
 */
const THRESHOLDS = {
  WARNING: 10,   // 超出10%为警告
  DANGER: 20     // 超出20%为严重
};

/**
 * 检查价格是否超出基准价
 * @param {number|string} materialId - 材料ID或材料名称
 * @param {number} actualPrice - 实际价格
 * @param {string} specification - 材料规格（可选，当materialId为名称时使用）
 * @returns {Object} 预警检查结果
 */
function checkPrice(materialId, actualPrice, specification = null) {
  let material = null;
  
  // 支持通过ID或名称查找材料
  if (typeof materialId === 'number' || !isNaN(parseInt(materialId))) {
    material = db.prepare(`
      SELECT * FROM material_base_prices
      WHERE id = ? AND status = 'active'
    `).get(parseInt(materialId));
  } else {
    // 按名称查找
    material = db.prepare(`
      SELECT * FROM material_base_prices
      WHERE material_name = ?
        AND (specification = ? OR ? IS NULL OR specification IS NULL)
        AND status = 'active'
        AND (expiry_date IS NULL OR expiry_date >= date('now'))
      ORDER BY effective_date DESC
      LIMIT 1
    `).get(materialId, specification, specification);
  }
  
  // 未找到材料基准价
  if (!material) {
    return {
      success: false,
      hasWarning: false,
      level: WARNING_LEVELS.NORMAL,
      message: '未找到材料基准价信息',
      data: null
    };
  }
  
  const basePrice = material.base_price;
  const priceDifference = actualPrice - basePrice;
  const overagePercent = basePrice > 0 ? (priceDifference / basePrice) * 100 : 0;
  
  // 判断预警级别
  let level = WARNING_LEVELS.NORMAL;
  let message = '价格正常';
  
  if (overagePercent >= THRESHOLDS.DANGER) {
    level = WARNING_LEVELS.DANGER;
    message = `价格严重超出基准价，超出${overagePercent.toFixed(2)}%`;
  } else if (overagePercent >= THRESHOLDS.WARNING) {
    level = WARNING_LEVELS.WARNING;
    message = `价格超出基准价，超出${overagePercent.toFixed(2)}%`;
  } else if (priceDifference > 0) {
    message = `价格略高于基准价，超出${overagePercent.toFixed(2)}%`;
  } else if (priceDifference < 0) {
    message = `价格低于基准价${Math.abs(overagePercent).toFixed(2)}%`;
  }
  
  return {
    success: true,
    hasWarning: level !== WARNING_LEVELS.NORMAL,
    level,
    message,
    data: {
      material_id: material.id,
      material_name: material.material_name,
      specification: material.specification,
      unit: material.unit,
      base_price: basePrice,
      actual_price: actualPrice,
      price_difference: parseFloat(priceDifference.toFixed(2)),
      overage_percent: parseFloat(overagePercent.toFixed(2)),
      warning_threshold: THRESHOLDS.WARNING,
      danger_threshold: THRESHOLDS.DANGER
    }
  };
}

/**
 * 批量检查价格
 * @param {Array} items - 材料价格检查项列表
 * @returns {Object} 批量检查结果
 */
function checkPriceBatch(items) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      message: '检查项列表不能为空',
      results: []
    };
  }
  
  const results = items.map(item => {
    const { material_id, material_name, specification, actual_price, quantity = 1 } = item;
    
    // 优先使用material_id，否则使用material_name
    const materialId = material_id || material_name;
    
    const checkResult = checkPrice(materialId, actual_price, specification);
    
    return {
      ...checkResult,
      quantity,
      total_difference: checkResult.data 
        ? parseFloat((checkResult.data.price_difference * quantity).toFixed(2))
        : 0
    };
  });
  
  // 统计预警数量
  const warningCount = results.filter(r => r.level === WARNING_LEVELS.WARNING).length;
  const dangerCount = results.filter(r => r.level === WARNING_LEVELS.DANGER).length;
  const normalCount = results.filter(r => r.level === WARNING_LEVELS.NORMAL).length;
  const notFoundCount = results.filter(r => !r.success).length;
  
  return {
    success: true,
    hasWarning: warningCount > 0 || dangerCount > 0,
    summary: {
      total: items.length,
      normal: normalCount,
      warning: warningCount,
      danger: dangerCount,
      notFound: notFoundCount
    },
    results
  };
}

/**
 * 创建价格预警记录
 * @param {Object} warningData - 预警数据
 * @returns {Object} 创建结果
 */
function createWarningRecord(warningData) {
  const {
    contract_id,
    purchase_list_item_id,
    material_name,
    specification,
    unit_price,
    base_price,
    overage_percent,
    warning_level
  } = warningData;
  
  try {
    const result = db.prepare(`
      INSERT INTO price_warnings (
        contract_id,
        purchase_list_item_id,
        material_name,
        specification,
        unit_price,
        base_price,
        overage_percent,
        warning_level,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      contract_id || null,
      purchase_list_item_id || null,
      material_name,
      specification || null,
      unit_price,
      base_price,
      overage_percent,
      warning_level
    );
    
    return {
      success: true,
      warning_id: result.lastInsertRowid,
      message: '价格预警记录创建成功'
    };
  } catch (error) {
    console.error('创建价格预警记录失败:', error);
    return {
      success: false,
      message: '创建价格预警记录失败: ' + error.message
    };
  }
}

/**
 * 获取价格预警列表
 * @param {Object} options - 查询选项
 * @returns {Object} 预警列表
 */
function getWarningList(options = {}) {
  const {
    status = 'all',
    level = 'all',
    contract_id,
    page = 1,
    pageSize = 20
  } = options;
  
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT pw.*, c.name as contract_name, c.contract_no
    FROM price_warnings pw
    LEFT JOIN contracts c ON pw.contract_id = c.id
    WHERE 1=1
  `;
  const params = [];
  
  if (status !== 'all') {
    sql += ` AND pw.status = ?`;
    params.push(status);
  }
  
  if (level !== 'all') {
    sql += ` AND pw.warning_level = ?`;
    params.push(level);
  }
  
  if (contract_id) {
    sql += ` AND pw.contract_id = ?`;
    params.push(contract_id);
  }
  
  // 获取总数
  const countSql = sql.replace('SELECT pw.*, c.name as contract_name, c.contract_no', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY pw.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const warnings = db.prepare(sql).all(...params);
  
  return {
    success: true,
    data: warnings,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  };
}

/**
 * 处理价格预警
 * @param {number} warningId - 预警ID
 * @param {number} handlerId - 处理人ID
 * @param {string} remark - 处理备注
 * @returns {Object} 处理结果
 */
function handleWarning(warningId, handlerId, remark) {
  try {
    const warning = db.prepare('SELECT * FROM price_warnings WHERE id = ?').get(warningId);
    
    if (!warning) {
      return {
        success: false,
        message: '预警记录不存在'
      };
    }
    
    if (warning.status !== 'pending') {
      return {
        success: false,
        message: '该预警已被处理'
      };
    }
    
    db.prepare(`
      UPDATE price_warnings SET
        status = 'handled',
        handler_id = ?,
        handle_remark = ?,
        handled_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(handlerId, remark || null, warningId);
    
    return {
      success: true,
      message: '预警处理成功'
    };
  } catch (error) {
    console.error('处理价格预警失败:', error);
    return {
      success: false,
      message: '处理价格预警失败: ' + error.message
    };
  }
}

/**
 * 获取预警统计信息
 * @returns {Object} 统计信息
 */
function getWarningStatistics() {
  try {
    // 按状态统计
    const statusStats = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM price_warnings
      GROUP BY status
    `).all();
    
    // 按级别统计
    const levelStats = db.prepare(`
      SELECT warning_level, COUNT(*) as count
      FROM price_warnings
      GROUP BY warning_level
    `).all();
    
    // 今日新增
    const todayCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM price_warnings
      WHERE date(created_at) = date('now')
    `).get();
    
    // 本周新增
    const weekCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM price_warnings
      WHERE created_at >= date('now', '-7 days')
    `).get();
    
    return {
      success: true,
      data: {
        byStatus: statusStats.reduce((acc, item) => {
          acc[item.status] = item.count;
          return acc;
        }, {}),
        byLevel: levelStats.reduce((acc, item) => {
          acc[item.warning_level] = item.count;
          return acc;
        }, {}),
        today: todayCount ? todayCount.count : 0,
        thisWeek: weekCount ? weekCount.count : 0
      }
    };
  } catch (error) {
    console.error('获取预警统计失败:', error);
    return {
      success: false,
      message: '获取预警统计失败: ' + error.message
    };
  }
}

module.exports = {
  WARNING_LEVELS,
  THRESHOLDS,
  checkPrice,
  checkPriceBatch,
  createWarningRecord,
  getWarningList,
  handleWarning,
  getWarningStatistics
};
