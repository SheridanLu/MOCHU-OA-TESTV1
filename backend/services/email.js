/**
 * 企业邮箱服务
 * 处理邮箱创建、禁用、启用等操作
 */

const { db } = require('../models/database');

// 邮箱配置
const EMAIL_CONFIG = {
  // 企业邮箱域名
  domain: '@mochu.com',
  // 是否启用外部邮件系统API
  enableExternalApi: false,
  // 外部邮件系统API地址（预留）
  externalApiUrl: process.env.EMAIL_API_URL || 'https://mail.mochu.com/api',
  // 外部邮件系统API密钥（预留）
  externalApiKey: process.env.EMAIL_API_KEY || '',
  // 禁用后是否保留邮箱账号
  retainOnDisable: true,
  // 默认禁用原因
  defaultDisableReason: '员工离职'
};

/**
 * 记录邮箱操作日志
 * @param {number} userId - 用户ID
 * @param {string} action - 操作类型 (create/disable/enable/status)
 * @param {string} details - 操作详情
 * @param {number} operatorId - 操作人ID
 */
function logEmailAction(userId, action, details, operatorId = null) {
  try {
    db.prepare(`
      INSERT INTO hr_logs (user_id, action, details, operator_id)
      VALUES (?, ?, ?, ?)
    `).run(userId, `email_${action}`, JSON.stringify(details), operatorId);
  } catch (error) {
    console.error('记录邮箱操作日志失败:', error);
  }
}

/**
 * 调用外部邮件系统API（预留接口）
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @returns {Object} API响应
 */
async function callExternalApi(endpoint, data) {
  if (!EMAIL_CONFIG.enableExternalApi) {
    return { success: true, message: '外部API未启用，仅更新本地状态' };
  }

  try {
    // TODO: 实际调用外部邮件系统API
    // const response = await fetch(`${EMAIL_CONFIG.externalApiUrl}/${endpoint}`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${EMAIL_CONFIG.externalApiKey}`
    //   },
    //   body: JSON.stringify(data)
    // });
    // return await response.json();
    
    console.log(`[Email API] 调用外部API: ${endpoint}`, data);
    return { success: true, message: 'API调用成功（模拟）' };
  } catch (error) {
    console.error('调用外部邮件API失败:', error);
    return { success: false, message: `API调用失败: ${error.message}` };
  }
}

/**
 * 生成企业邮箱地址
 * @param {string} username - 用户名
 * @returns {string} 邮箱地址
 */
function generateEmailAddress(username) {
  return `${username}${EMAIL_CONFIG.domain}`;
}

/**
 * 创建企业邮箱
 * 用户创建时自动调用，生成企业邮箱地址
 * @param {number} userId - 用户ID
 * @param {string} username - 用户名
 * @returns {Object} 创建结果
 */
function createCompanyEmail(userId, username) {
  try {
    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { success: false, message: '用户不存在' };
    }

    // 生成企业邮箱地址：用户名@公司域名
    const companyEmail = generateEmailAddress(username);

    // 检查企业邮箱是否已被使用
    const existingEmail = db.prepare('SELECT id FROM users WHERE company_email = ? AND id != ?').get(companyEmail, userId);
    if (existingEmail) {
      return { success: false, message: '该企业邮箱已被使用' };
    }

    // 更新用户的企业邮箱字段
    db.prepare(`
      UPDATE users 
      SET company_email = ?,
          email_enabled = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(companyEmail, userId);

    // 调用外部邮件系统API创建邮箱（预留）
    if (EMAIL_CONFIG.enableExternalApi) {
      callExternalApi('create', {
        email: companyEmail,
        username: username,
        realName: user.real_name
      }).catch(err => {
        console.error('调用外部邮件系统API失败:', err);
      });
    }

    // 记录操作日志
    logEmailAction(userId, 'create', {
      companyEmail: companyEmail,
      username: username,
      message: '企业邮箱自动创建成功'
    }, null);

    return {
      success: true,
      message: '企业邮箱创建成功',
      data: {
        userId: userId,
        companyEmail: companyEmail,
        emailEnabled: true
      }
    };
  } catch (error) {
    console.error('创建企业邮箱失败:', error);
    return { success: false, message: `创建企业邮箱失败: ${error.message}` };
  }
}

/**
 * 检查并生成唯一的企业邮箱地址
 * 如果邮箱已存在，则添加数字后缀
 * @param {string} username - 用户名
 * @returns {string} 唯一的企业邮箱地址
 */
function generateUniqueCompanyEmail(username) {
  let companyEmail = generateEmailAddress(username);
  let counter = 1;
  let baseUsername = username;

  // 检查邮箱是否已存在
  while (db.prepare('SELECT id FROM users WHERE company_email = ?').get(companyEmail)) {
    // 如果存在，添加数字后缀
    companyEmail = `${baseUsername}${counter}${EMAIL_CONFIG.domain}`;
    counter++;
    
    // 防止无限循环
    if (counter > 999) {
      throw new Error('无法生成唯一的企业邮箱地址');
    }
  }

  return companyEmail;
}

/**
 * 为已有用户批量创建企业邮箱
 * 用于历史数据迁移
 * @param {Object} options - 选项
 * @returns {Object} 批量处理结果
 */
function batchCreateCompanyEmail(options = {}) {
  const results = {
    success: true,
    total: 0,
    processed: 0,
    failed: 0,
    details: []
  };

  try {
    // 查找没有企业邮箱的活跃用户
    const users = db.prepare(`
      SELECT id, username, real_name 
      FROM users 
      WHERE (company_email IS NULL OR company_email = '') 
        AND status = 'active'
    `).all();

    results.total = users.length;

    for (const user of users) {
      try {
        const result = createCompanyEmail(user.id, user.username);
        results.details.push({
          userId: user.id,
          username: user.username,
          success: result.success,
          message: result.message,
          data: result.data
        });
        if (result.success) {
          results.processed++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          userId: user.id,
          username: user.username,
          success: false,
          message: error.message
        });
      }
    }

    // 记录批量操作日志
    if (results.processed > 0) {
      logEmailAction(null, 'batch_create', {
        total: results.total,
        processed: results.processed,
        failed: results.failed,
        message: '批量创建企业邮箱'
      }, null);
    }

    return results;
  } catch (error) {
    console.error('批量创建企业邮箱失败:', error);
    return { success: false, message: `批量创建失败: ${error.message}` };
  }
}

/**
 * 禁用用户企业邮箱
 * @param {number} userId - 用户ID
 * @param {Object} options - 禁用选项
 * @param {string} options.reason - 禁用原因
 * @param {number} options.operatorId - 操作人ID
 * @returns {Object} 禁用结果
 */
async function disableEmail(userId, options = {}) {
  const { reason = EMAIL_CONFIG.defaultDisableReason, operatorId = null } = options;

  try {
    // 获取用户信息
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { success: false, message: '用户不存在' };
    }

    // 检查用户是否有企业邮箱
    if (!user.email || !user.email.includes(EMAIL_CONFIG.domain)) {
      return { success: false, message: '该用户没有企业邮箱' };
    }

    // 检查邮箱是否已禁用
    if (user.email_enabled === 0 || user.email_enabled === false) {
      return { success: false, message: '邮箱已被禁用', data: { email: user.email } };
    }

    const disabledAt = new Date().toISOString();

    // 使用事务确保数据一致性
    const transaction = db.transaction(() => {
      // 更新用户邮箱状态
      db.prepare(`
        UPDATE users 
        SET email_enabled = 0,
            email_disabled_at = ?,
            email_disabled_reason = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(disabledAt, reason, userId);
    });

    transaction();

    // 调用外部邮件系统API禁用邮箱
    const apiResult = await callExternalApi('disable', {
      email: user.email,
      reason: reason,
      disabledAt: disabledAt
    });

    // 记录操作日志
    logEmailAction(userId, 'disable', {
      email: user.email,
      reason: reason,
      disabledAt: disabledAt,
      apiResult: apiResult,
      message: '企业邮箱已禁用'
    }, operatorId);

    return {
      success: true,
      message: '企业邮箱禁用成功',
      data: {
        userId: userId,
        email: user.email,
        disabledAt: disabledAt,
        reason: reason,
        apiResult: apiResult
      }
    };
  } catch (error) {
    console.error('禁用邮箱失败:', error);
    return { success: false, message: `禁用邮箱失败: ${error.message}` };
  }
}

/**
 * 启用用户企业邮箱
 * @param {number} userId - 用户ID
 * @param {Object} options - 启用选项
 * @param {number} options.operatorId - 操作人ID
 * @returns {Object} 启用结果
 */
async function enableEmail(userId, options = {}) {
  const { operatorId = null } = options;

  try {
    // 获取用户信息
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return { success: false, message: '用户不存在' };
    }

    // 检查用户是否有企业邮箱
    if (!user.email || !user.email.includes(EMAIL_CONFIG.domain)) {
      return { success: false, message: '该用户没有企业邮箱' };
    }

    // 检查邮箱是否已启用
    if (user.email_enabled === 1 || user.email_enabled === true || user.email_enabled === null) {
      return { success: false, message: '邮箱已处于启用状态', data: { email: user.email } };
    }

    // 使用事务更新
    const transaction = db.transaction(() => {
      // 更新用户邮箱状态
      db.prepare(`
        UPDATE users 
        SET email_enabled = 1,
            email_disabled_at = NULL,
            email_disabled_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId);
    });

    transaction();

    // 调用外部邮件系统API启用邮箱
    const apiResult = await callExternalApi('enable', {
      email: user.email
    });

    // 记录操作日志
    logEmailAction(userId, 'enable', {
      email: user.email,
      previousDisabledAt: user.email_disabled_at,
      previousReason: user.email_disabled_reason,
      apiResult: apiResult,
      message: '企业邮箱已启用'
    }, operatorId);

    return {
      success: true,
      message: '企业邮箱启用成功',
      data: {
        userId: userId,
        email: user.email,
        enabledAt: new Date().toISOString(),
        apiResult: apiResult
      }
    };
  } catch (error) {
    console.error('启用邮箱失败:', error);
    return { success: false, message: `启用邮箱失败: ${error.message}` };
  }
}

/**
 * 查询用户邮箱状态
 * @param {number} userId - 用户ID
 * @returns {Object} 邮箱状态信息
 */
function getEmailStatus(userId) {
  try {
    const user = db.prepare(`
      SELECT 
        id,
        username,
        real_name,
        email,
        email_enabled,
        email_disabled_at,
        email_disabled_reason,
        status,
        created_at,
        updated_at
      FROM users WHERE id = ?
    `).get(userId);

    if (!user) {
      return { success: false, message: '用户不存在' };
    }

    // 判断邮箱状态
    let emailStatus = 'no_email';
    if (user.email) {
      if (user.email.includes(EMAIL_CONFIG.domain)) {
        if (user.email_enabled === 0 || user.email_enabled === false) {
          emailStatus = 'disabled';
        } else {
          emailStatus = 'enabled';
        }
      } else {
        emailStatus = 'external'; // 非企业邮箱
      }
    }

    // 获取邮箱相关操作日志
    const emailLogs = db.prepare(`
      SELECT action, details, created_at, operator_id
      FROM hr_logs
      WHERE user_id = ? AND action LIKE 'email_%'
      ORDER BY created_at DESC
      LIMIT 10
    `).all(userId);

    return {
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        realName: user.real_name,
        email: user.email,
        isCompanyEmail: user.email ? user.email.includes(EMAIL_CONFIG.domain) : false,
        status: emailStatus,
        enabled: user.email_enabled !== 0 && user.email_enabled !== false,
        disabledAt: user.email_disabled_at,
        disabledReason: user.email_disabled_reason,
        userStatus: user.status,
        logs: emailLogs.map(log => ({
          action: log.action,
          details: JSON.parse(log.details || '{}'),
          createdAt: log.created_at,
          operatorId: log.operator_id
        }))
      }
    };
  } catch (error) {
    console.error('查询邮箱状态失败:', error);
    return { success: false, message: `查询失败: ${error.message}` };
  }
}

/**
 * 批量禁用邮箱
 * @param {Array<number>} userIds - 用户ID数组
 * @param {Object} options - 禁用选项
 * @param {string} options.reason - 禁用原因
 * @param {number} options.operatorId - 操作人ID
 * @returns {Object} 批量处理结果
 */
async function batchDisableEmail(userIds, options = {}) {
  const { reason = EMAIL_CONFIG.defaultDisableReason, operatorId = null } = options;

  const results = {
    success: true,
    total: userIds.length,
    processed: 0,
    failed: 0,
    details: []
  };

  for (const userId of userIds) {
    try {
      const result = await disableEmail(userId, { reason, operatorId });
      results.details.push({
        userId: userId,
        success: result.success,
        message: result.message,
        data: result.data
      });
      if (result.success) {
        results.processed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        userId: userId,
        success: false,
        message: error.message
      });
    }
  }

  // 记录批量操作日志
  if (results.processed > 0) {
    logEmailAction(null, 'batch_disable', {
      total: results.total,
      processed: results.processed,
      failed: results.failed,
      reason: reason,
      userIds: userIds,
      message: '批量禁用邮箱操作'
    }, operatorId);
  }

  return results;
}

/**
 * 批量启用邮箱
 * @param {Array<number>} userIds - 用户ID数组
 * @param {Object} options - 启用选项
 * @param {number} options.operatorId - 操作人ID
 * @returns {Object} 批量处理结果
 */
async function batchEnableEmail(userIds, options = {}) {
  const { operatorId = null } = options;

  const results = {
    success: true,
    total: userIds.length,
    processed: 0,
    failed: 0,
    details: []
  };

  for (const userId of userIds) {
    try {
      const result = await enableEmail(userId, { operatorId });
      results.details.push({
        userId: userId,
        success: result.success,
        message: result.message,
        data: result.data
      });
      if (result.success) {
        results.processed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        userId: userId,
        success: false,
        message: error.message
      });
    }
  }

  // 记录批量操作日志
  if (results.processed > 0) {
    logEmailAction(null, 'batch_enable', {
      total: results.total,
      processed: results.processed,
      failed: results.failed,
      userIds: userIds,
      message: '批量启用邮箱操作'
    }, operatorId);
  }

  return results;
}

/**
 * 获取已禁用邮箱列表
 * @param {Object} options - 查询选项
 * @returns {Array} 已禁用邮箱列表
 */
function getDisabledEmails(options = {}) {
  const { page = 1, pageSize = 20, startDate, endDate, reason } = options;

  try {
    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, Math.max(1, parseInt(pageSize)));

    let sql = `
      SELECT 
        u.id,
        u.username,
        u.real_name,
        u.email,
        u.email_disabled_at,
        u.email_disabled_reason,
        u.status,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.email_enabled = 0
    `;
    const params = [];

    if (startDate) {
      sql += ' AND u.email_disabled_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND u.email_disabled_at <= ?';
      params.push(endDate);
    }
    if (reason) {
      sql += ' AND u.email_disabled_reason LIKE ?';
      params.push(`%${reason}%`);
    }

    sql += ' ORDER BY u.email_disabled_at DESC LIMIT ? OFFSET ?';
    params.push(pageSize, offset);

    const list = db.prepare(sql).all(...params);

    // 获取总数
    let countSql = 'SELECT COUNT(*) as total FROM users WHERE email_enabled = 0';
    const countParams = [];
    if (startDate) {
      countSql += ' AND email_disabled_at >= ?';
      countParams.push(startDate);
    }
    if (endDate) {
      countSql += ' AND email_disabled_at <= ?';
      countParams.push(endDate);
    }
    if (reason) {
      countSql += ' AND email_disabled_reason LIKE ?';
      countParams.push(`%${reason}%`);
    }
    const total = db.prepare(countSql).get(...countParams).total;

    return {
      success: true,
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    };
  } catch (error) {
    console.error('获取已禁用邮箱列表失败:', error);
    return { success: false, message: `查询失败: ${error.message}` };
  }
}

/**
 * 获取邮箱配置
 * @returns {Object} 配置信息
 */
function getConfig() {
  return { ...EMAIL_CONFIG };
}

/**
 * 更新邮箱配置
 * @param {Object} newConfig - 新配置
 * @returns {Object} 更新后的配置
 */
function updateConfig(newConfig) {
  Object.keys(newConfig).forEach(key => {
    if (EMAIL_CONFIG.hasOwnProperty(key)) {
      EMAIL_CONFIG[key] = newConfig[key];
    }
  });
  return { ...EMAIL_CONFIG };
}

module.exports = {
  // 创建
  createCompanyEmail,
  generateUniqueCompanyEmail,
  batchCreateCompanyEmail,
  
  // 禁用/启用
  disableEmail,
  enableEmail,
  batchDisableEmail,
  batchEnableEmail,
  
  // 查询
  getEmailStatus,
  getDisabledEmails,
  
  // 配置
  getConfig,
  updateConfig,
  
  // 工具函数
  generateEmailAddress,
  logEmailAction,
  callExternalApi
};
