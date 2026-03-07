/**
 * Task 37: 零星采购预警服务
 * 功能：
 * - 检查零星采购是否超出批量采购总额的1.5%限额
 * - 创建和管理预警记录
 * - 提供预警处理功能
 */

const { db } = require('../models/database');

// 预警阈值：1.5%
const SPORADIC_LIMIT_PERCENT = 1.5;

/**
 * 检查零星采购限额
 * @param {number} projectId - 项目ID
 * @param {number} newAmount - 新增的零星采购金额
 * @returns {Object} 限额检查结果
 */
function checkSporadicLimit(projectId, newAmount = 0) {
  // 获取项目批量采购总额（从批量采购订单）
  const batchTotal = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM batch_purchases
    WHERE project_id = ? AND status != 'cancelled'
  `).get(projectId);

  const batchAmount = batchTotal?.total || 0;

  // 获取已有零星采购总额（不含已取消的）
  const sporadicTotal = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM sporadic_purchases
    WHERE project_id = ? AND status NOT IN ('cancelled', 'rejected')
  `).get(projectId);

  const existingAmount = sporadicTotal?.total || 0;
  const totalAmount = existingAmount + parseFloat(newAmount || 0);
  const limitAmount = batchAmount * (SPORADIC_LIMIT_PERCENT / 100);
  const percentage = batchAmount > 0 ? (totalAmount / batchAmount) * 100 : 0;

  return {
    batchAmount,           // 批量采购总额
    existingAmount,        // 已有零星采购金额
    newAmount,             // 新增金额
    totalAmount,           // 累计零星采购金额
    limitAmount,           // 限额（批量采购的1.5%）
    limitPercent: SPORADIC_LIMIT_PERCENT,  // 限额百分比
    percentage: parseFloat(percentage.toFixed(4)),  // 实际占比百分比
    isExcessive: percentage > SPORADIC_LIMIT_PERCENT,  // 是否超限
    remainingAmount: Math.max(0, limitAmount - totalAmount)  // 剩余可用额度
  };
}

/**
 * 创建预警记录
 * @param {Object} data - 预警数据
 * @param {number} data.projectId - 项目ID
 * @param {number} data.sporadicId - 关联的零星采购ID（可选）
 * @param {number} data.batchTotal - 批量采购总额
 * @param {number} data.sporadicTotal - 零星采购总额
 * @param {number} data.percentage - 占比百分比
 * @param {string} data.message - 预警消息（可选）
 * @returns {Object} 创建的预警记录
 */
function createWarning(data) {
  const { projectId, sporadicId, batchTotal, sporadicTotal, percentage, message } = data;

  // 检查是否已存在活跃的预警
  const existingWarning = db.prepare(`
    SELECT * FROM sporadic_warnings
    WHERE project_id = ? AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(projectId);

  // 如果已存在预警且未处理，更新预警信息
  if (existingWarning) {
    const updated = db.prepare(`
      UPDATE sporadic_warnings SET
        batch_total = ?,
        sporadic_total = ?,
        percentage = ?,
        message = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(batchTotal, sporadicTotal, percentage, message || null, existingWarning.id);

    return db.prepare('SELECT * FROM sporadic_warnings WHERE id = ?').get(existingWarning.id);
  }

  // 创建新预警
  const result = db.prepare(`
    INSERT INTO sporadic_warnings (
      project_id, sporadic_id, batch_total, sporadic_total, percentage, status, message
    ) VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(projectId, sporadicId || null, batchTotal, sporadicTotal, percentage, message || null);

  return db.prepare('SELECT * FROM sporadic_warnings WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * 获取预警列表
 * @param {Object} options - 查询选项
 * @param {number} options.projectId - 项目ID（可选）
 * @param {string} options.status - 状态筛选（可选）
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页数量
 * @returns {Object} 预警列表和分页信息
 */
function getWarnings(options = {}) {
  const { projectId, status, page = 1, pageSize = 20 } = options;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT sw.*, p.name as project_name, p.project_no,
      sp.sporadic_no, u.real_name as handler_name
    FROM sporadic_warnings sw
    LEFT JOIN projects p ON sw.project_id = p.id
    LEFT JOIN sporadic_purchases sp ON sw.sporadic_id = sp.id
    LEFT JOIN users u ON sw.handler_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (projectId) {
    sql += ` AND sw.project_id = ?`;
    params.push(projectId);
  }

  if (status && status !== 'all') {
    sql += ` AND sw.status = ?`;
    params.push(status);
  }

  // 获取总数
  const countSql = sql.replace(
    /SELECT sw\.\*, p\.name as project_name[\s\S]*?WHERE 1=1/,
    'SELECT COUNT(*) as total FROM sporadic_warnings sw LEFT JOIN projects p ON sw.project_id = p.id WHERE 1=1'
  );
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult?.total || 0;

  // 排序和分页
  sql += ` ORDER BY sw.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const warnings = db.prepare(sql).all(...params);

  return {
    list: warnings,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  };
}

/**
 * 获取预警详情
 * @param {number} id - 预警ID
 * @returns {Object|null} 预警详情
 */
function getWarningById(id) {
  return db.prepare(`
    SELECT sw.*, p.name as project_name, p.project_no,
      sp.sporadic_no, sp.reason as sporadic_reason, sp.total_amount as sporadic_amount,
      u.real_name as handler_name
    FROM sporadic_warnings sw
    LEFT JOIN projects p ON sw.project_id = p.id
    LEFT JOIN sporadic_purchases sp ON sw.sporadic_id = sp.id
    LEFT JOIN users u ON sw.handler_id = u.id
    WHERE sw.id = ?
  `).get(id);
}

/**
 * 处理预警
 * @param {number} id - 预警ID
 * @param {number} handlerId - 处理人ID
 * @param {string} handleRemark - 处理备注
 * @param {string} status - 处理后的状态（handled/ignored）
 * @returns {Object} 更新后的预警记录
 */
function handleWarning(id, handlerId, handleRemark, status = 'handled') {
  const warning = db.prepare('SELECT * FROM sporadic_warnings WHERE id = ?').get(id);
  
  if (!warning) {
    throw new Error('预警记录不存在');
  }

  if (warning.status !== 'active') {
    throw new Error('该预警已处理，无法重复操作');
  }

  db.prepare(`
    UPDATE sporadic_warnings SET
      status = ?,
      handler_id = ?,
      handle_remark = ?,
      handled_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, handlerId, handleRemark || null, id);

  return db.prepare('SELECT * FROM sporadic_warnings WHERE id = ?').get(id);
}

/**
 * 获取项目的预警统计
 * @param {number} projectId - 项目ID
 * @returns {Object} 预警统计信息
 */
function getProjectWarningStats(projectId) {
  // 获取限额检查结果
  const limitCheck = checkSporadicLimit(projectId, 0);

  // 获取活跃预警数量
  const activeCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM sporadic_warnings
    WHERE project_id = ? AND status = 'active'
  `).get(projectId);

  // 获取已处理预警数量
  const handledCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM sporadic_warnings
    WHERE project_id = ? AND status = 'handled'
  `).get(projectId);

  return {
    ...limitCheck,
    activeWarningCount: activeCount?.count || 0,
    handledWarningCount: handledCount?.count || 0
  };
}

/**
 * 检查并自动创建预警
 * 当零星采购超出限额时自动生成预警
 * @param {number} projectId - 项目ID
 * @param {number} sporadicId - 零星采购ID
 * @param {number} amount - 本次零星采购金额
 * @returns {Object|null} 创建的预警记录（如果超限），否则返回null
 */
function checkAndCreateWarning(projectId, sporadicId, amount) {
  const limitCheck = checkSporadicLimit(projectId, amount);

  if (limitCheck.isExcessive) {
    const message = `零星采购金额 ¥${limitCheck.totalAmount.toFixed(2)} 超出批量采购总额的${SPORADIC_LIMIT_PERCENT}%限额（¥${limitCheck.limitAmount.toFixed(2)}），当前占比 ${limitCheck.percentage.toFixed(2)}%`;
    
    return createWarning({
      projectId,
      sporadicId,
      batchTotal: limitCheck.batchAmount,
      sporadicTotal: limitCheck.totalAmount,
      percentage: limitCheck.percentage,
      message
    });
  }

  return null;
}

/**
 * 批量检查项目预警状态
 * @param {Array<number>} projectIds - 项目ID列表
 * @returns {Array<Object>} 各项目的预警状态
 */
function batchCheckWarningStatus(projectIds) {
  if (!projectIds || projectIds.length === 0) {
    return [];
  }

  return projectIds.map(projectId => ({
    projectId,
    ...checkSporadicLimit(projectId, 0),
    ...getProjectWarningStats(projectId)
  }));
}

module.exports = {
  SPORADIC_LIMIT_PERCENT,
  checkSporadicLimit,
  createWarning,
  getWarnings,
  getWarningById,
  handleWarning,
  getProjectWarningStats,
  checkAndCreateWarning,
  batchCheckWarningStatus
};
