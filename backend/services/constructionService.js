/**
 * Task 56: 施工管理 - 偏差预警服务
 * 功能：
 * - 检查进度与计划的偏差
 * - 计算偏差率
 * - 创建和管理预警记录
 * - 提供预警处理功能
 */

const { db } = require('../models/database');

// 预警级别阈值
const WARNING_LEVELS = {
  NORMAL: { name: '正常', threshold: 5, color: 'green' },      // 偏差 < 5%
  WARNING: { name: '警告', threshold: 10, color: 'orange' },   // 偏差 5-10%
  SEVERE: { name: '严重', threshold: Infinity, color: 'red' } // 偏差 > 10%
};

/**
 * 计算偏差率
 * @param {number} plannedProgress - 计划进度（百分比）
 * @param {number} actualProgress - 实际进度（百分比）
 * @returns {Object} 偏差计算结果
 */
function calculateDeviation(plannedProgress, actualProgress) {
  const planned = parseFloat(plannedProgress) || 0;
  const actual = parseFloat(actualProgress) || 0;

  // 偏差 = 计划进度 - 实际进度（正数表示落后，负数表示超前）
  const deviation = planned - actual;
  
  // 偏差率 = 偏差 / 计划进度 * 100
  // 如果计划进度为0，则偏差率为0
  const deviationRate = planned > 0 ? (deviation / planned) * 100 : 0;

  // 判断预警级别
  let warningLevel = 'normal';
  const absDeviationRate = Math.abs(deviationRate);
  
  if (absDeviationRate < WARNING_LEVELS.NORMAL.threshold) {
    warningLevel = 'normal';
  } else if (absDeviationRate < WARNING_LEVELS.WARNING.threshold) {
    warningLevel = 'warning';
  } else {
    warningLevel = 'severe';
  }

  return {
    planned,
    actual,
    deviation,
    deviationRate: parseFloat(deviationRate.toFixed(2)),
    absDeviationRate: parseFloat(absDeviationRate.toFixed(2)),
    warningLevel,
    isBehind: deviation > 0,  // 是否落后于计划
    warningLevelName: WARNING_LEVELS[warningLevel.toUpperCase()]?.name || '正常'
  };
}

/**
 * 检查项目的进度偏差
 * @param {number} projectId - 项目ID
 * @returns {Object} 偏差检查结果，包含里程碑偏差列表
 */
function checkDeviation(projectId) {
  // 获取项目的所有里程碑
  const milestones = db.prepare(`
    SELECT 
      m.id as milestone_id,
      m.milestone_no,
      m.name as milestone_name,
      m.planned_date,
      m.actual_date,
      m.status,
      m.progress_rate as actual_progress,
      m.created_at
    FROM construction_milestones m
    WHERE m.project_id = ?
    ORDER BY m.planned_date ASC
  `).all(projectId);

  if (!milestones || milestones.length === 0) {
    return {
      projectId,
      hasDeviation: false,
      warnings: [],
      summary: {
        total: 0,
        normal: 0,
        warning: 0,
        severe: 0
      }
    };
  }

  const today = new Date();
  const warnings = [];
  const summary = { total: 0, normal: 0, warning: 0, severe: 0 };

  milestones.forEach(milestone => {
    // 计算计划进度
    let plannedProgress = 0;
    const plannedDate = milestone.planned_date ? new Date(milestone.planned_date) : null;
    
    if (milestone.status === 'completed') {
      // 已完成的里程碑，计划进度为100%
      plannedProgress = 100;
    } else if (plannedDate) {
      // 根据当前日期与计划日期的关系计算计划进度
      if (today >= plannedDate) {
        // 已过计划日期但未完成，计划进度为100%
        plannedProgress = 100;
      } else {
        // 未到计划日期，按时间比例计算计划进度
        // 假设从里程碑创建日期开始到计划日期为完整周期
        const createdAt = milestone.created_at ? new Date(milestone.created_at) : today;
        const totalDays = (plannedDate - createdAt) / (1000 * 60 * 60 * 24);
        const elapsedDays = (today - createdAt) / (1000 * 60 * 60 * 24);
        
        if (totalDays > 0) {
          plannedProgress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
        } else {
          plannedProgress = 100;
        }
      }
    }

    const actualProgress = parseFloat(milestone.actual_progress) || 0;
    
    // 计算偏差
    const deviationResult = calculateDeviation(plannedProgress, actualProgress);

    // 只有偏差大于0（落后）或状态为严重时才记录预警
    if (deviationResult.isBehind || deviationResult.warningLevel === 'severe') {
      warnings.push({
        milestoneId: milestone.milestone_id,
        milestoneNo: milestone.milestone_no,
        milestoneName: milestone.milestone_name,
        plannedDate: milestone.planned_date,
        actualDate: milestone.actual_date,
        status: milestone.status,
        plannedProgress: parseFloat(plannedProgress.toFixed(2)),
        actualProgress,
        deviation: deviationResult.deviation,
        deviationRate: deviationResult.deviationRate,
        warningLevel: deviationResult.warningLevel,
        warningLevelName: deviationResult.warningLevelName
      });

      summary.total++;
      if (deviationResult.warningLevel === 'normal') summary.normal++;
      else if (deviationResult.warningLevel === 'warning') summary.warning++;
      else if (deviationResult.warningLevel === 'severe') summary.severe++;
    }
  });

  return {
    projectId,
    hasDeviation: warnings.length > 0,
    warnings,
    summary
  };
}

/**
 * 创建预警记录
 * @param {Object} data - 预警数据
 * @param {number} data.projectId - 项目ID
 * @param {number} data.milestoneId - 里程碑ID
 * @param {number} data.plannedProgress - 计划进度
 * @param {number} data.actualProgress - 实际进度
 * @param {number} data.deviationRate - 偏差率
 * @param {string} data.warningLevel - 预警级别
 * @returns {Object} 创建的预警记录
 */
function createWarning(data) {
  const { projectId, milestoneId, plannedProgress, actualProgress, deviationRate, warningLevel } = data;

  // 检查是否已存在该里程碑的未处理预警
  const existingWarning = db.prepare(`
    SELECT * FROM construction_warnings
    WHERE milestone_id = ? AND status = 'pending'
  `).get(milestoneId);

  if (existingWarning) {
    // 更新现有预警
    db.prepare(`
      UPDATE construction_warnings SET
        planned_progress = ?,
        actual_progress = ?,
        deviation_rate = ?,
        warning_level = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(plannedProgress, actualProgress, deviationRate, warningLevel, existingWarning.id);

    return getWarningById(existingWarning.id);
  }

  // 创建新预警
  const result = db.prepare(`
    INSERT INTO construction_warnings (
      project_id, milestone_id, planned_progress, actual_progress,
      deviation_rate, warning_level, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `).run(projectId, milestoneId, plannedProgress, actualProgress, deviationRate, warningLevel);

  return getWarningById(result.lastInsertRowid);
}

/**
 * 批量检查并创建预警
 * @param {number} projectId - 项目ID
 * @returns {Array<Object>} 创建的预警记录列表
 */
function checkAndCreateWarnings(projectId) {
  const deviationResult = checkDeviation(projectId);
  const createdWarnings = [];

  for (const warning of deviationResult.warnings) {
    // 只为警告和严重级别创建预警记录
    if (warning.warningLevel !== 'normal') {
      const created = createWarning({
        projectId,
        milestoneId: warning.milestoneId,
        plannedProgress: warning.plannedProgress,
        actualProgress: warning.actualProgress,
        deviationRate: warning.deviationRate,
        warningLevel: warning.warningLevel
      });
      createdWarnings.push(created);
    }
  }

  return createdWarnings;
}

/**
 * 获取预警列表
 * @param {Object} options - 查询选项
 * @param {number} options.projectId - 项目ID（可选）
 * @param {string} options.warningLevel - 预警级别（可选）
 * @param {string} options.status - 状态（可选）
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页数量
 * @returns {Object} 预警列表和分页信息
 */
function getWarnings(options = {}) {
  const { projectId, warningLevel, status, page = 1, pageSize = 20 } = options;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);

  let sql = `
    SELECT cw.*, 
      p.name as project_name, p.project_no,
      cm.milestone_no, cm.name as milestone_name, cm.planned_date, cm.actual_date,
      u.real_name as handler_name
    FROM construction_warnings cw
    LEFT JOIN projects p ON cw.project_id = p.id
    LEFT JOIN construction_milestones cm ON cw.milestone_id = cm.id
    LEFT JOIN users u ON cw.handler_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (projectId) {
    sql += ` AND cw.project_id = ?`;
    params.push(projectId);
  }

  if (warningLevel && warningLevel !== 'all') {
    sql += ` AND cw.warning_level = ?`;
    params.push(warningLevel);
  }

  if (status && status !== 'all') {
    sql += ` AND cw.status = ?`;
    params.push(status);
  }

  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total FROM construction_warnings cw
    LEFT JOIN projects p ON cw.project_id = p.id
    LEFT JOIN construction_milestones cm ON cw.milestone_id = cm.id
    WHERE 1=1
    ${projectId ? ' AND cw.project_id = ?' : ''}
    ${warningLevel && warningLevel !== 'all' ? ' AND cw.warning_level = ?' : ''}
    ${status && status !== 'all' ? ' AND cw.status = ?' : ''}
  `;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult?.total || 0;

  // 排序和分页
  sql += ` ORDER BY cw.warning_level DESC, cw.deviation_rate DESC, cw.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);

  const warnings = db.prepare(sql).all(...params);

  return {
    list: warnings.map(w => ({
      ...w,
      warningLevelName: WARNING_LEVELS[w.warning_level?.toUpperCase()]?.name || '正常'
    })),
    pagination: {
      current: parseInt(page),
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
  const warning = db.prepare(`
    SELECT cw.*, 
      p.name as project_name, p.project_no,
      cm.milestone_no, cm.name as milestone_name, 
      cm.planned_date, cm.actual_date, cm.status as milestone_status,
      cm.description as milestone_description,
      u.real_name as handler_name
    FROM construction_warnings cw
    LEFT JOIN projects p ON cw.project_id = p.id
    LEFT JOIN construction_milestones cm ON cw.milestone_id = cm.id
    LEFT JOIN users u ON cw.handler_id = u.id
    WHERE cw.id = ?
  `).get(id);

  if (warning) {
    warning.warningLevelName = WARNING_LEVELS[warning.warning_level?.toUpperCase()]?.name || '正常';
  }

  return warning;
}

/**
 * 处理预警
 * @param {number} id - 预警ID
 * @param {number} handlerId - 处理人ID
 * @param {string} handleRemark - 处理备注
 * @returns {Object} 更新后的预警记录
 */
function handleWarning(id, handlerId, handleRemark) {
  const warning = db.prepare('SELECT * FROM construction_warnings WHERE id = ?').get(id);
  
  if (!warning) {
    throw new Error('预警记录不存在');
  }

  if (warning.status !== 'pending') {
    throw new Error('该预警已处理，无法重复操作');
  }

  db.prepare(`
    UPDATE construction_warnings SET
      status = 'handled',
      handler_id = ?,
      handle_remark = ?,
      handled_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(handlerId, handleRemark || null, id);

  return getWarningById(id);
}

/**
 * 获取预警统计
 * @param {number} projectId - 项目ID（可选）
 * @returns {Object} 预警统计信息
 */
function getWarningStats(projectId) {
  let whereClause = '1=1';
  const params = [];

  if (projectId) {
    whereClause += ' AND project_id = ?';
    params.push(projectId);
  }

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN warning_level = 'normal' THEN 1 ELSE 0 END) as normal_count,
      SUM(CASE WHEN warning_level = 'warning' THEN 1 ELSE 0 END) as warning_count,
      SUM(CASE WHEN warning_level = 'severe' THEN 1 ELSE 0 END) as severe_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'handled' THEN 1 ELSE 0 END) as handled_count,
      AVG(deviation_rate) as avg_deviation_rate
    FROM construction_warnings
    WHERE ${whereClause}
  `).get(...params);

  return {
    total: stats?.total || 0,
    normalCount: stats?.normal_count || 0,
    warningCount: stats?.warning_count || 0,
    severeCount: stats?.severe_count || 0,
    pendingCount: stats?.pending_count || 0,
    handledCount: stats?.handled_count || 0,
    avgDeviationRate: parseFloat(stats?.avg_deviation_rate || 0).toFixed(2)
  };
}

/**
 * 获取项目偏差分析
 * @param {number} projectId - 项目ID
 * @returns {Object} 偏差分析数据
 */
function getDeviationAnalysis(projectId) {
  // 获取项目的所有里程碑
  const milestones = db.prepare(`
    SELECT 
      m.id,
      m.milestone_no,
      m.name,
      m.planned_date,
      m.actual_date,
      m.status,
      m.progress_rate,
      m.created_at
    FROM construction_milestones m
    WHERE m.project_id = ?
    ORDER BY m.planned_date ASC
  `).all(projectId);

  const today = new Date();
  const analysis = [];

  milestones.forEach((milestone, index) => {
    // 计算计划进度
    let plannedProgress = 0;
    const plannedDate = milestone.planned_date ? new Date(milestone.planned_date) : null;
    
    if (milestone.status === 'completed') {
      plannedProgress = 100;
    } else if (plannedDate) {
      if (today >= plannedDate) {
        plannedProgress = 100;
      } else {
        const createdAt = milestone.created_at ? new Date(milestone.created_at) : today;
        const totalDays = (plannedDate - createdAt) / (1000 * 60 * 60 * 24);
        const elapsedDays = (today - createdAt) / (1000 * 60 * 60 * 24);
        
        if (totalDays > 0) {
          plannedProgress = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
        } else {
          plannedProgress = 100;
        }
      }
    }

    const actualProgress = parseFloat(milestone.progress_rate) || 0;
    const deviationResult = calculateDeviation(plannedProgress, actualProgress);

    analysis.push({
      key: index,
      milestoneId: milestone.id,
      milestoneNo: milestone.milestone_no,
      milestoneName: milestone.name,
      plannedDate: milestone.planned_date,
      actualDate: milestone.actual_date,
      status: milestone.status,
      plannedProgress: parseFloat(plannedProgress.toFixed(2)),
      actualProgress,
      deviation: deviationResult.deviation,
      deviationRate: deviationResult.deviationRate,
      absDeviationRate: deviationResult.absDeviationRate,
      warningLevel: deviationResult.warningLevel,
      warningLevelName: deviationResult.warningLevelName,
      isBehind: deviationResult.isBehind
    });
  });

  // 计算汇总信息
  const summary = {
    total: analysis.length,
    completed: analysis.filter(a => a.status === 'completed').length,
    pending: analysis.filter(a => a.status === 'pending').length,
    behind: analysis.filter(a => a.isBehind).length,
    avgDeviationRate: analysis.length > 0 
      ? (analysis.reduce((sum, a) => sum + Math.abs(a.deviationRate), 0) / analysis.length).toFixed(2)
      : 0,
    warningLevels: {
      normal: analysis.filter(a => a.warningLevel === 'normal').length,
      warning: analysis.filter(a => a.warningLevel === 'warning').length,
      severe: analysis.filter(a => a.warningLevel === 'severe').length
    }
  };

  return { analysis, summary };
}

module.exports = {
  WARNING_LEVELS,
  calculateDeviation,
  checkDeviation,
  createWarning,
  checkAndCreateWarnings,
  getWarnings,
  getWarningById,
  handleWarning,
  getWarningStats,
  getDeviationAnalysis
};
