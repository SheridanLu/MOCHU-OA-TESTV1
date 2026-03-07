/**
 * 审计日志服务
 * Task 60: 系统管理 - 日志审计
 */

const { db } = require('../models/database');

/**
 * 初始化审计日志表
 */
function initAuditLogsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      detail TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)`);
}

// 确保表已初始化
initAuditLogsTable();

/**
 * 记录审计日志
 * @param {Object} logData - 日志数据
 * @param {number} logData.user_id - 用户ID
 * @param {string} logData.username - 用户名
 * @param {string} logData.action - 操作类型 (login/logout/create/update/delete/approve/reject/upload/download)
 * @param {string} logData.module - 模块名称
 * @param {string} logData.target_type - 目标类型
 * @param {string} logData.target_id - 目标ID
 * @param {string} logData.detail - 操作详情
 * @param {string} logData.ip - IP地址
 * @param {string} logData.user_agent - 用户代理
 * @returns {Object} - 创建的日志记录
 */
function log(logData) {
  const stmt = db.prepare(`
    INSERT INTO audit_logs (
      user_id, username, action, module, target_type, target_id, detail, ip, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    logData.user_id || null,
    logData.username || null,
    logData.action,
    logData.module,
    logData.target_type || null,
    logData.target_id || null,
    logData.detail || null,
    logData.ip || null,
    logData.user_agent || null
  );

  return {
    id: result.lastInsertRowid,
    ...logData,
    created_at: new Date().toISOString()
  };
}

/**
 * 查询审计日志
 * @param {Object} options - 查询选项
 * @param {number} options.page - 页码
 * @param {number} options.pageSize - 每页数量
 * @param {number} options.user_id - 用户ID
 * @param {string} options.username - 用户名
 * @param {string} options.action - 操作类型
 * @param {string} options.module - 模块名称
 * @param {string} options.start_date - 开始日期
 * @param {string} options.end_date - 结束日期
 * @param {string} options.keyword - 关键词搜索
 * @returns {Object} - 日志列表和分页信息
 */
function getLogs(options = {}) {
  const {
    page = 1,
    pageSize = 20,
    user_id,
    username,
    action,
    module,
    start_date,
    end_date,
    keyword
  } = options;

  let whereConditions = [];
  let params = [];

  if (user_id) {
    whereConditions.push('user_id = ?');
    params.push(user_id);
  }

  if (username) {
    whereConditions.push('username LIKE ?');
    params.push(`%${username}%`);
  }

  if (action) {
    whereConditions.push('action = ?');
    params.push(action);
  }

  if (module) {
    whereConditions.push('module = ?');
    params.push(module);
  }

  if (start_date) {
    whereConditions.push('created_at >= ?');
    params.push(start_date);
  }

  if (end_date) {
    whereConditions.push('created_at <= ?');
    params.push(end_date + ' 23:59:59');
  }

  if (keyword) {
    whereConditions.push('(username LIKE ? OR detail LIKE ? OR target_type LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}` 
    : '';

  // 查询总数
  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`);
  const { total } = countStmt.get(...params);

  // 查询日志列表
  const offset = (page - 1) * pageSize;
  const listStmt = db.prepare(`
    SELECT * FROM audit_logs 
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const logs = listStmt.all(...params, pageSize, offset);

  return {
    list: logs,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

/**
 * 获取日志详情
 * @param {number} id - 日志ID
 * @returns {Object|null} - 日志详情
 */
function getLogById(id) {
  const stmt = db.prepare('SELECT * FROM audit_logs WHERE id = ?');
  return stmt.get(id);
}

/**
 * 获取用户操作日志
 * @param {number} userId - 用户ID
 * @param {Object} options - 查询选项
 * @returns {Object} - 日志列表和分页信息
 */
function getUserLogs(userId, options = {}) {
  return getLogs({
    ...options,
    user_id: userId
  });
}

/**
 * 获取日志统计
 * @param {Object} options - 统计选项
 * @param {string} options.start_date - 开始日期
 * @param {string} options.end_date - 结束日期
 * @returns {Object} - 统计数据
 */
function getStats(options = {}) {
  const { start_date, end_date } = options;

  let whereClause = '';
  let params = [];

  if (start_date && end_date) {
    whereClause = 'WHERE created_at BETWEEN ? AND ?';
    params = [start_date, end_date + ' 23:59:59'];
  } else if (start_date) {
    whereClause = 'WHERE created_at >= ?';
    params = [start_date];
  } else if (end_date) {
    whereClause = 'WHERE created_at <= ?';
    params = [end_date + ' 23:59:59'];
  }

  // 总日志数
  const totalStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`);
  const { total } = totalStmt.get(...params);

  // 按操作类型统计
  const actionStatsStmt = db.prepare(`
    SELECT action, COUNT(*) as count 
    FROM audit_logs ${whereClause}
    GROUP BY action
    ORDER BY count DESC
  `);
  const actionStats = actionStatsStmt.all(...params);

  // 按模块统计
  const moduleStatsStmt = db.prepare(`
    SELECT module, COUNT(*) as count 
    FROM audit_logs ${whereClause}
    GROUP BY module
    ORDER BY count DESC
  `);
  const moduleStats = moduleStatsStmt.all(...params);

  // 按用户统计（前10名）
  const userStatsStmt = db.prepare(`
    SELECT user_id, username, COUNT(*) as count 
    FROM audit_logs ${whereClause}
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 10
  `);
  const userStats = userStatsStmt.all(...params);

  // 按日期统计（最近30天）
  const dateStatsStmt = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count 
    FROM audit_logs 
    ${whereClause || "WHERE created_at >= DATE('now', '-30 days')"}
    ${whereClause ? "AND created_at >= DATE('now', '-30 days')" : ''}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `);
  const dateStats = dateStatsStmt.all(...params);

  // 今日统计
  const todayStmt = db.prepare(`
    SELECT COUNT(*) as count 
    FROM audit_logs 
    WHERE DATE(created_at) = DATE('now')
  `);
  const { count: todayCount } = todayStmt.get();

  // 本周统计
  const weekStmt = db.prepare(`
    SELECT COUNT(*) as count 
    FROM audit_logs 
    WHERE created_at >= DATE('now', '-7 days')
  `);
  const { count: weekCount } = weekStmt.get();

  // 本月统计
  const monthStmt = db.prepare(`
    SELECT COUNT(*) as count 
    FROM audit_logs 
    WHERE created_at >= DATE('now', 'start of month')
  `);
  const { count: monthCount } = monthStmt.get();

  // 登录统计
  const loginStmt = db.prepare(`
    SELECT COUNT(*) as count 
    FROM audit_logs 
    WHERE action = 'login'
    ${whereClause ? `AND ${whereClause.replace('WHERE', '')}` : ''}
  `);
  const { count: loginCount } = loginStmt.get(...params);

  // 操作统计（增删改）
  const operationStmt = db.prepare(`
    SELECT 
      SUM(CASE WHEN action = 'create' THEN 1 ELSE 0 END) as create_count,
      SUM(CASE WHEN action = 'update' THEN 1 ELSE 0 END) as update_count,
      SUM(CASE WHEN action = 'delete' THEN 1 ELSE 0 END) as delete_count
    FROM audit_logs ${whereClause}
  `);
  const operationStats = operationStmt.get(...params);

  return {
    total,
    todayCount,
    weekCount,
    monthCount,
    loginCount,
    actionStats,
    moduleStats,
    userStats,
    dateStats,
    operationStats
  };
}

/**
 * 获取操作类型列表
 * @returns {Array} - 操作类型列表
 */
function getActionTypes() {
  return [
    { value: 'login', label: '登录' },
    { value: 'logout', label: '登出' },
    { value: 'create', label: '新增' },
    { value: 'update', label: '编辑' },
    { value: 'delete', label: '删除' },
    { value: 'approve', label: '审批通过' },
    { value: 'reject', label: '审批拒绝' },
    { value: 'upload', label: '上传' },
    { value: 'download', label: '下载' },
    { value: 'export', label: '导出' },
    { value: 'import', label: '导入' }
  ];
}

/**
 * 获取模块列表
 * @returns {Array} - 模块列表
 */
function getModules() {
  return [
    { value: 'auth', label: '认证管理' },
    { value: 'user', label: '用户管理' },
    { value: 'department', label: '部门管理' },
    { value: 'role', label: '角色管理' },
    { value: 'permission', label: '权限管理' },
    { value: 'project', label: '项目管理' },
    { value: 'contract', label: '合同管理' },
    { value: 'purchase', label: '采购管理' },
    { value: 'stock', label: '库存管理' },
    { value: 'finance', label: '财务管理' },
    { value: 'approval', label: '审批管理' },
    { value: 'change', label: '变更管理' },
    { value: 'construction', label: '施工管理' },
    { value: 'completion', label: '竣工管理' },
    { value: 'report', label: '报表管理' },
    { value: 'system', label: '系统管理' }
  ];
}

/**
 * 清理过期日志
 * @param {number} daysToKeep - 保留天数
 * @returns {number} - 删除的记录数
 */
function cleanOldLogs(daysToKeep = 180) {
  const stmt = db.prepare(`
    DELETE FROM audit_logs 
    WHERE created_at < DATE('now', '-' || ? || ' days')
  `);
  const result = stmt.run(daysToKeep);
  return result.changes;
}

module.exports = {
  initAuditLogsTable,
  log,
  getLogs,
  getLogById,
  getUserLogs,
  getStats,
  getActionTypes,
  getModules,
  cleanOldLogs
};
