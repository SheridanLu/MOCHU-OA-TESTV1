/**
 * HR联动路由
 * 处理入职/离职等HR操作的API接口
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/authMiddleware');
const User = require('../models/User');
const hrService = require('../services/hr');
const bcrypt = require('bcryptjs');

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/hr/config
 * 获取HR联动配置
 */
router.get('/config', (req, res) => {
  try {
    const config = hrService.getConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('获取HR配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取HR配置失败'
    });
  }
});

/**
 * PUT /api/hr/config
 * 更新HR联动配置（需要管理员权限）
 */
router.put('/config', (req, res) => {
  try {
    const newConfig = req.body;
    const updatedConfig = hrService.updateConfig(newConfig);
    
    res.json({
      success: true,
      message: '配置更新成功',
      data: updatedConfig
    });
  } catch (error) {
    console.error('更新HR配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新HR配置失败'
    });
  }
});

/**
 * POST /api/hr/entry
 * 入职处理 - 创建新员工并执行入职联动
 * Body: { username, password, real_name, phone, email, department_id, position, employee_id, entry_date }
 */
router.post('/entry', (req, res) => {
  try {
    const {
      username,
      password,
      real_name,
      phone,
      email,
      department_id,
      position,
      employee_id,
      entry_date
    } = req.body;

    // 参数验证
    if (!username || !username.trim()) {
      return res.status(400).json({
        success: false,
        message: '用户名不能为空'
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '密码长度至少6位'
      });
    }

    if (!real_name || !real_name.trim()) {
      return res.status(400).json({
        success: false,
        message: '姓名不能为空'
      });
    }

    // 检查用户名是否已存在
    const existingUser = User.findByUsername(username.trim());
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 检查手机号是否已存在
    if (phone && phone.trim()) {
      const existingPhone = User.findByPhone(phone.trim());
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: '手机号已被使用'
        });
      }
    }

    // 检查工号是否已存在
    if (employee_id && employee_id.trim()) {
      const existingEmployee = db.prepare('SELECT id FROM users WHERE employee_id = ?').get(employee_id.trim());
      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          message: '工号已被使用'
        });
      }
    }

    // 准备用户数据
    let userData = {
      username: username.trim(),
      password,
      real_name: real_name.trim(),
      email: email || null,
      phone: phone || null,
      department_id: department_id || null,
      position: position || null,
      employee_id: employee_id || null,
      entry_date: entry_date || null
    };

    // 执行入职联动处理
    const hrResult = hrService.processEntry(userData, req.user.id);
    if (!hrResult.success) {
      return res.status(500).json(hrResult);
    }
    userData = hrResult.data;

    // 使用事务创建用户
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const transaction = db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO users (username, password, real_name, email, phone, department_id, position, employee_id, entry_date, in_directory)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        userData.username,
        hashedPassword,
        userData.real_name,
        userData.email,
        userData.phone,
        userData.department_id,
        userData.position,
        userData.employee_id,
        userData.entry_date,
        1
      );
      
      return result.lastInsertRowid;
    });

    const newUserId = transaction();

    // 获取完整的用户信息
    const newUser = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.real_name,
        u.phone,
        u.email,
        u.department_id,
        u.position,
        u.status,
        u.employee_id,
        u.entry_date,
        u.in_directory,
        u.created_at,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(newUserId);

    res.status(201).json({
      success: true,
      message: '入职处理成功',
      data: {
        user: newUser,
        hr_actions: hrResult.actions
      }
    });
  } catch (error) {
    console.error('入职处理失败:', error);
    res.status(500).json({
      success: false,
      message: `入职处理失败: ${error.message}`
    });
  }
});

/**
 * POST /api/hr/resign/:userId
 * 离职处理
 * Body: { resign_date, disable_reason }
 */
router.post('/resign/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { resign_date, disable_reason } = req.body;

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 不能离职自己
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: '不能对自己执行离职操作'
      });
    }

    // 检查是否已离职
    if (user.status === 'resigned') {
      return res.status(400).json({
        success: false,
        message: '该员工已离职'
      });
    }

    // 执行离职联动处理（现在支持异步邮箱禁用）
    const hrResult = await hrService.processResign(userId, req.user.id, { resign_date, disable_reason });

    if (!hrResult.success) {
      return res.status(500).json(hrResult);
    }

    // 获取更新后的用户信息
    const updatedUser = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.real_name,
        u.phone,
        u.email,
        u.email_enabled,
        u.email_disabled_at,
        u.email_disabled_reason,
        u.department_id,
        u.position,
        u.status,
        u.employee_id,
        u.entry_date,
        u.resign_date,
        u.in_directory,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(userId);

    res.json({
      success: true,
      message: '离职处理成功',
      data: {
        user: updatedUser,
        hr_actions: hrResult.actions
      }
    });
  } catch (error) {
    console.error('离职处理失败:', error);
    res.status(500).json({
      success: false,
      message: `离职处理失败: ${error.message}`
    });
  }
});

/**
 * GET /api/hr/status/:userId
 * 查询员工HR状态
 */
router.get('/status/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const result = hrService.getEmployeeStatus(userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('查询员工状态失败:', error);
    res.status(500).json({
      success: false,
      message: `查询员工状态失败: ${error.message}`
    });
  }
});

/**
 * GET /api/hr/pending
 * 获取待入职员工列表
 */
router.get('/pending', (req, res) => {
  try {
    const pendingList = hrService.getPendingEntries();
    res.json({
      success: true,
      data: pendingList
    });
  } catch (error) {
    console.error('获取待入职员工列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取待入职员工列表失败'
    });
  }
});

/**
 * GET /api/hr/resigned
 * 获取已离职员工列表
 * Query: startDate, endDate, department
 */
router.get('/resigned', (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    
    const resignedList = hrService.getResignedEmployees({
      startDate,
      endDate,
      department_id: department ? parseInt(department) : null
    });

    res.json({
      success: true,
      data: resignedList
    });
  } catch (error) {
    console.error('获取已离职员工列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取已离职员工列表失败'
    });
  }
});

/**
 * GET /api/hr/logs/:userId
 * 获取员工HR操作日志
 * Query: limit, offset
 */
router.get('/logs/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    // 检查用户是否存在
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const logs = db.prepare(`
      SELECT 
        hl.id,
        hl.action,
        hl.details,
        hl.created_at,
        u.real_name as operator_name
      FROM hr_logs hl
      LEFT JOIN users u ON hl.operator_id = u.id
      WHERE hl.user_id = ?
      ORDER BY hl.created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, parseInt(limit), parseInt(offset));

    // 获取总数
    const countResult = db.prepare('SELECT COUNT(*) as total FROM hr_logs WHERE user_id = ?').get(userId);

    res.json({
      success: true,
      data: {
        list: logs.map(log => ({
          ...log,
          details: JSON.parse(log.details || '{}')
        })),
        total: countResult.total
      }
    });
  } catch (error) {
    console.error('获取HR操作日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取HR操作日志失败'
    });
  }
});

/**
 * POST /api/hr/entry/:userId/complete
 * 为已创建的用户完成入职处理（补录入职信息）
 * Body: { employee_id, entry_date }
 */
router.post('/entry/:userId/complete', (req, res) => {
  try {
    const { userId } = req.params;
    const { employee_id, entry_date } = req.body;

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否已完成入职
    if (user.employee_id && user.entry_date) {
      return res.status(400).json({
        success: false,
        message: '该员工已完成入职处理'
      });
    }

    // 检查工号是否已存在
    if (employee_id && employee_id.trim()) {
      const existingEmployee = db.prepare('SELECT id FROM users WHERE employee_id = ? AND id != ?').get(employee_id.trim(), userId);
      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          message: '工号已被使用'
        });
      }
    }

    // 准备用户数据
    let userData = {
      ...user,
      employee_id: employee_id || user.employee_id,
      entry_date: entry_date || user.entry_date
    };

    // 执行入职联动处理
    const hrResult = hrService.processEntry(userData, req.user.id);
    if (!hrResult.success) {
      return res.status(500).json(hrResult);
    }
    userData = hrResult.data;

    // 更新用户信息
    db.prepare(`
      UPDATE users 
      SET employee_id = ?, entry_date = ?, in_directory = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userData.employee_id, userData.entry_date, userId);

    // 获取更新后的用户信息
    const updatedUser = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.real_name,
        u.phone,
        u.email,
        u.department_id,
        u.position,
        u.status,
        u.employee_id,
        u.entry_date,
        u.in_directory,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(userId);

    res.json({
      success: true,
      message: '入职信息补录成功',
      data: {
        user: updatedUser,
        hr_actions: hrResult.actions
      }
    });
  } catch (error) {
    console.error('入职信息补录失败:', error);
    res.status(500).json({
      success: false,
      message: `入职信息补录失败: ${error.message}`
    });
  }
});

/**
 * POST /api/hr/batch-entry
 * 批量入职处理
 * Body: { users: [...] }
 */
router.post('/batch-entry', (req, res) => {
  try {
    const { users } = req.body;

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供员工数据数组'
      });
    }

    const results = [];
    const transaction = db.transaction(() => {
      for (const userData of users) {
        try {
          // 参数验证
          if (!userData.username || !userData.password || !userData.real_name) {
            results.push({
              username: userData.username,
              success: false,
              message: '缺少必填字段'
            });
            continue;
          }

          // 检查用户名是否已存在
          const existingUser = User.findByUsername(userData.username.trim());
          if (existingUser) {
            results.push({
              username: userData.username,
              success: false,
              message: '用户名已存在'
            });
            continue;
          }

          // 执行入职联动处理
          const hrResult = hrService.processEntry(userData, req.user.id);
          const processedData = hrResult.data;

          // 创建用户
          const hashedPassword = bcrypt.hashSync(userData.password, 10);
          const stmt = db.prepare(`
            INSERT INTO users (username, password, real_name, email, phone, department_id, position, employee_id, entry_date, in_directory)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          stmt.run(
            processedData.username,
            hashedPassword,
            processedData.real_name,
            processedData.email,
            processedData.phone,
            processedData.department_id,
            processedData.position,
            processedData.employee_id,
            processedData.entry_date,
            1
          );

          results.push({
            username: userData.username,
            success: true,
            message: '入职成功',
            employee_id: processedData.employee_id
          });
        } catch (error) {
          results.push({
            username: userData.username,
            success: false,
            message: error.message
          });
        }
      }
    });

    transaction();

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    res.json({
      success: true,
      message: `批量入职处理完成：成功 ${successCount} 个，失败 ${failCount} 个`,
      data: {
        total: results.length,
        success: successCount,
        failed: failCount,
        details: results
      }
    });
  } catch (error) {
    console.error('批量入职处理失败:', error);
    res.status(500).json({
      success: false,
      message: `批量入职处理失败: ${error.message}`
    });
  }
});

module.exports = router;
