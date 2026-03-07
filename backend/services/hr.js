/**
 * HR联动服务
 * 处理入职/离职时与通讯录、企业邮箱等的联动
 */

const { db } = require('../models/database');
const emailService = require('./email');

// 配置项
const HR_CONFIG = {
  // 是否启用HR联动
  enabled: true,
  // 是否自动创建企业邮箱
  autoCreateEmail: true,
  // 企业邮箱域名
  emailDomain: '@mochu.com',
  // 是否发送欢迎通知
  sendWelcomeNotification: true,
  // 离职后是否保留数据
  retainDataOnResign: true
};

/**
 * 生成工号
 * 格式: MO + 年份 + 4位序号 (如 MO20260001)
 */
function generateEmployeeId() {
  const year = new Date().getFullYear();
  const prefix = `MO${year}`;
  
  // 查找当年最大序号
  const result = db.prepare(`
    SELECT MAX(CAST(SUBSTR(employee_id, 7) AS INTEGER)) as max_num
    FROM users
    WHERE employee_id LIKE ?
  `).get(`${prefix}%`);
  
  const nextNum = (result.max_num || 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * 记录HR操作日志
 * @param {number} userId - 用户ID
 * @param {string} action - 操作类型 (entry/resign/update)
 * @param {string} details - 操作详情
 * @param {number} operatorId - 操作人ID
 */
function logHrAction(userId, action, details, operatorId = null) {
  try {
    db.prepare(`
      INSERT INTO hr_logs (user_id, action, details, operator_id)
      VALUES (?, ?, ?, ?)
    `).run(userId, action, JSON.stringify(details), operatorId);
  } catch (error) {
    console.error('记录HR日志失败:', error);
  }
}

/**
 * 入职联动处理
 * @param {Object} userData - 用户数据
 * @param {number} operatorId - 操作人ID
 * @returns {Object} 处理结果
 */
function processEntry(userData, operatorId = null) {
  if (!HR_CONFIG.enabled) {
    return { success: true, message: 'HR联动未启用', data: userData };
  }

  const results = {
    success: true,
    message: '入职处理完成',
    data: userData,
    actions: []
  };

  try {
    // 1. 自动生成工号
    if (!userData.employee_id) {
      userData.employee_id = generateEmployeeId();
      results.actions.push({ type: 'employee_id', status: 'success', value: userData.employee_id });
    }

    // 2. 设置入职日期
    if (!userData.entry_date) {
      userData.entry_date = new Date().toISOString().split('T')[0];
      results.actions.push({ type: 'entry_date', status: 'success', value: userData.entry_date });
    }

    // 3. 设置在通讯录显示
    userData.in_directory = 1;
    results.actions.push({ type: 'in_directory', status: 'success', value: true });

    // 4. 自动创建企业邮箱（如果启用且没有邮箱）
    if (HR_CONFIG.autoCreateEmail && !userData.email && userData.username) {
      userData.email = `${userData.username}${HR_CONFIG.emailDomain}`;
      results.actions.push({ type: 'email', status: 'success', value: userData.email });
    }

    // 5. 记录日志
    logHrAction(userData.id, 'entry', {
      employee_id: userData.employee_id,
      entry_date: userData.entry_date,
      email: userData.email,
      message: '员工入职处理'
    }, operatorId);

    return results;
  } catch (error) {
    console.error('入职处理失败:', error);
    return {
      success: false,
      message: `入职处理失败: ${error.message}`,
      data: userData
    };
  }
}

/**
 * 离职联动处理
 * @param {number} userId - 用户ID
 * @param {number} operatorId - 操作人ID
 * @param {Object} options - 额外选项
 * @returns {Object} 处理结果
 */
async function processResign(userId, operatorId = null, options = {}) {
  if (!HR_CONFIG.enabled) {
    return { success: true, message: 'HR联动未启用' };
  }

  const results = {
    success: true,
    message: '离职处理完成',
    actions: []
  };

  try {
    // 获取用户信息
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { success: false, message: '用户不存在' };
    }

    // 检查是否已离职
    if (user.status === 'resigned') {
      return { success: false, message: '该员工已离职' };
    }

    const resignDate = options.resign_date || new Date().toISOString().split('T')[0];
    const disableReason = options.disable_reason || '员工离职';

    // 使用事务确保数据一致性
    const transaction = db.transaction(() => {
      // 1. 更新用户状态为离职
      db.prepare(`
        UPDATE users 
        SET status = 'resigned', 
            resign_date = ?, 
            in_directory = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(resignDate, userId);
      results.actions.push({ type: 'status', status: 'success', value: 'resigned' });

      // 2. 从通讯录隐藏
      results.actions.push({ type: 'in_directory', status: 'success', value: false });

      // 3. 保留历史数据（不做删除操作，仅记录）
      if (HR_CONFIG.retainDataOnResign) {
        results.actions.push({ type: 'data_retained', status: 'success', value: true });
      }
    });

    transaction();

    // 4. 禁用企业邮箱（异步处理，不阻塞主流程）
    if (user.email && user.email.includes(HR_CONFIG.emailDomain)) {
      try {
        const emailResult = await emailService.disableEmail(userId, {
          reason: disableReason,
          operatorId: operatorId
        });
        if (emailResult.success) {
          results.actions.push({ 
            type: 'email_disabled', 
            status: 'success', 
            value: user.email,
            details: emailResult.data
          });
        } else {
          results.actions.push({ 
            type: 'email_disabled', 
            status: 'warning', 
            value: user.email,
            message: emailResult.message
          });
        }
      } catch (emailError) {
        console.error('禁用邮箱失败:', emailError);
        results.actions.push({ 
          type: 'email_disabled', 
          status: 'failed', 
          value: user.email,
          message: emailError.message
        });
      }
    }

    // 5. 记录日志
    logHrAction(userId, 'resign', {
      resign_date: resignDate,
      email: user.email,
      email_disabled: user.email && user.email.includes(HR_CONFIG.emailDomain),
      disable_reason: disableReason,
      data_retained: HR_CONFIG.retainDataOnResign,
      message: '员工离职处理'
    }, operatorId);

    return results;
  } catch (error) {
    console.error('离职处理失败:', error);
    return {
      success: false,
      message: `离职处理失败: ${error.message}`
    };
  }
}

/**
 * 查询员工HR状态
 * @param {number} userId - 用户ID
 * @returns {Object} 员工状态信息
 */
function getEmployeeStatus(userId) {
  try {
    const user = db.prepare(`
      SELECT 
        id, username, real_name, email, phone,
        department_id, position, status,
        employee_id, entry_date, resign_date, in_directory,
        created_at, updated_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return { success: false, message: '用户不存在' };
    }

    // 获取部门名称
    let department_name = null;
    if (user.department_id) {
      const dept = db.prepare('SELECT name FROM departments WHERE id = ?').get(user.department_id);
      department_name = dept ? dept.name : null;
    }

    // 获取最近的HR操作日志
    const recentLogs = db.prepare(`
      SELECT action, details, created_at
      FROM hr_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(userId);

    return {
      success: true,
      data: {
        ...user,
        department_name,
        recent_logs: recentLogs.map(log => ({
          action: log.action,
          details: JSON.parse(log.details || '{}'),
          created_at: log.created_at
        }))
      }
    };
  } catch (error) {
    console.error('查询员工状态失败:', error);
    return { success: false, message: `查询失败: ${error.message}` };
  }
}

/**
 * 批量入职处理
 * @param {Array} usersData - 用户数据数组
 * @param {number} operatorId - 操作人ID
 * @returns {Object} 批量处理结果
 */
function batchProcessEntry(usersData, operatorId = null) {
  const results = {
    success: true,
    total: usersData.length,
    processed: 0,
    failed: 0,
    details: []
  };

  for (const userData of usersData) {
    try {
      const result = processEntry(userData, operatorId);
      results.details.push({
        username: userData.username,
        success: result.success,
        message: result.message
      });
      if (result.success) {
        results.processed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        username: userData.username,
        success: false,
        message: error.message
      });
    }
  }

  return results;
}

/**
 * 获取HR配置
 * @returns {Object} 配置信息
 */
function getConfig() {
  return { ...HR_CONFIG };
}

/**
 * 更新HR配置
 * @param {Object} newConfig - 新配置
 * @returns {Object} 更新后的配置
 */
function updateConfig(newConfig) {
  Object.keys(newConfig).forEach(key => {
    if (HR_CONFIG.hasOwnProperty(key)) {
      HR_CONFIG[key] = newConfig[key];
    }
  });
  return { ...HR_CONFIG };
}

/**
 * 获取待入职员工列表（已创建但未完成入职流程）
 * @returns {Array} 待入职员工列表
 */
function getPendingEntries() {
  try {
    return db.prepare(`
      SELECT u.*, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.employee_id IS NULL OR u.entry_date IS NULL
      ORDER BY u.created_at DESC
    `).all();
  } catch (error) {
    console.error('获取待入职员工列表失败:', error);
    return [];
  }
}

/**
 * 获取已离职员工列表
 * @param {Object} options - 查询选项
 * @returns {Array} 已离职员工列表
 */
function getResignedEmployees(options = {}) {
  const { startDate, endDate, department_id } = options;
  
  try {
    let sql = `
      SELECT u.*, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.status = 'resigned'
    `;
    const params = [];

    if (startDate) {
      sql += ' AND u.resign_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND u.resign_date <= ?';
      params.push(endDate);
    }
    if (department_id) {
      sql += ' AND u.department_id = ?';
      params.push(department_id);
    }

    sql += ' ORDER BY u.resign_date DESC';

    return db.prepare(sql).all(...params);
  } catch (error) {
    console.error('获取已离职员工列表失败:', error);
    return [];
  }
}

module.exports = {
  processEntry,
  processResign,
  getEmployeeStatus,
  batchProcessEntry,
  getConfig,
  updateConfig,
  getPendingEntries,
  getResignedEmployees,
  generateEmployeeId,
  logHrAction
};
