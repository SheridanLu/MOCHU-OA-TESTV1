const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../models/database');
const emailService = require('../services/email');

const router = express.Router();

/**
 * 获取所有用户（不包括已删除的）
 * GET /api/users
 */
router.get('/', (req, res) => {
  try {
    const { department_id, status, keyword } = req.query;

    let sql = `
      SELECT 
        u.id, 
        u.username, 
        u.real_name, 
        u.email, 
        u.company_email,
        u.email_enabled,
        u.phone, 
        u.department_id,
        u.position,
        u.status,
        u.created_at,
        u.updated_at,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.status != 'deleted'
    `;

    const params = [];

    // 按部门筛选
    if (department_id) {
      sql += ' AND u.department_id = ?';
      params.push(department_id);
    }

    // 按状态筛选
    if (status && status !== 'all') {
      sql += ' AND u.status = ?';
      params.push(status);
    }

    // 关键词搜索
    if (keyword) {
      sql += ' AND (u.username LIKE ? OR u.real_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)';
      const likeKeyword = `%${keyword}%`;
      params.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword);
    }

    sql += ' ORDER BY u.created_at DESC';

    const users = db.prepare(sql).all(...params);

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户列表失败'
    });
  }
});

/**
 * 获取单个用户详情
 * GET /api/users/:id
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const user = db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        u.real_name, 
        u.email, 
        u.phone, 
        u.department_id,
        u.position,
        u.status,
        u.created_at,
        u.updated_at,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ? AND u.status != 'deleted'
    `).get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('获取用户详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户详情失败'
    });
  }
});

/**
 * 新增用户
 * POST /api/users
 * 请求体: { username, password, real_name, phone, email, department_id, position }
 */
router.post('/', async (req, res) => {
  try {
    const { username, password, real_name, phone, email, department_id, position } = req.body;

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
        message: '密码不能为空且长度不能少于6位'
      });
    }

    if (!real_name || !real_name.trim()) {
      return res.status(400).json({
        success: false,
        message: '姓名不能为空'
      });
    }

    // 用户名格式验证（只允许字母、数字、下划线）
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: '用户名只能包含字母、数字、下划线，长度3-20位'
      });
    }

    // 手机号格式验证
    if (phone) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          success: false,
          message: '手机号格式不正确'
        });
      }
    }

    // 邮箱格式验证
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: '邮箱格式不正确'
        });
      }
    }

    // 检查用户名是否已存在
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ? AND status != ?').get(username, 'deleted');
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 检查手机号是否已存在
    if (phone) {
      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND status != ?').get(phone, 'deleted');
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: '手机号已被使用'
        });
      }
    }

    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND status != ?').get(email, 'deleted');
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: '邮箱已被使用'
        });
      }
    }

    // 如果指定了部门，检查部门是否存在
    if (department_id) {
      const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
      if (!department) {
        return res.status(400).json({
          success: false,
          message: '选择的部门不存在'
        });
      }
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 插入用户
    const stmt = db.prepare(`
      INSERT INTO users (username, password, real_name, phone, email, department_id, position, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    const result = stmt.run(
      username.trim(),
      hashedPassword,
      real_name.trim(),
      phone || null,
      email || null,
      department_id || null,
      position || null
    );

    const newUserId = result.lastInsertRowid;

    // 自动创建企业邮箱
    try {
      emailService.createCompanyEmail(newUserId, username.trim());
    } catch (emailError) {
      console.error('自动创建企业邮箱失败:', emailError);
      // 不影响用户创建，仅记录日志
    }

    // 获取新创建的用户（不包含密码）
    const newUser = db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        u.real_name, 
        u.email, 
        u.company_email,
        u.email_enabled,
        u.phone, 
        u.department_id,
        u.position,
        u.status,
        u.created_at,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(newUserId);

    res.status(201).json({
      success: true,
      message: '用户创建成功',
      data: newUser
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    res.status(500).json({
      success: false,
      message: '创建用户失败'
    });
  }
});

/**
 * 更新用户
 * PUT /api/users/:id
 * 请求体: { real_name, phone, email, department_id, position, status, password }
 * 密码可选，留空则不修改
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { real_name, phone, email, department_id, position, status, password } = req.body;

    // 检查用户是否存在
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ? AND status != ?').get(id, 'deleted');
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 参数验证
    if (real_name !== undefined && !real_name.trim()) {
      return res.status(400).json({
        success: false,
        message: '姓名不能为空'
      });
    }

    // 手机号格式验证
    if (phone !== undefined && phone) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({
          success: false,
          message: '手机号格式不正确'
        });
      }
    }

    // 邮箱格式验证
    if (email !== undefined && email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: '邮箱格式不正确'
        });
      }
    }

    // 状态验证
    if (status !== undefined && !['active', 'disabled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '状态值无效'
      });
    }

    // 检查手机号是否被其他用户使用
    if (phone !== undefined && phone) {
      const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ? AND status != ?').get(phone, id, 'deleted');
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: '手机号已被其他用户使用'
        });
      }
    }

    // 检查邮箱是否被其他用户使用
    if (email !== undefined && email) {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ? AND status != ?').get(email, id, 'deleted');
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: '邮箱已被其他用户使用'
        });
      }
    }

    // 如果指定了部门，检查部门是否存在
    if (department_id !== undefined && department_id) {
      const department = db.prepare('SELECT id FROM departments WHERE id = ?').get(department_id);
      if (!department) {
        return res.status(400).json({
          success: false,
          message: '选择的部门不存在'
        });
      }
    }

    // 构建更新语句
    const updates = [];
    const values = [];

    if (real_name !== undefined) {
      updates.push('real_name = ?');
      values.push(real_name.trim());
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone || null);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email || null);
    }
    if (department_id !== undefined) {
      updates.push('department_id = ?');
      values.push(department_id || null);
    }
    if (position !== undefined) {
      updates.push('position = ?');
      values.push(position || null);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    // 如果提供了新密码，则更新密码
    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: '密码长度不能少于6位'
        });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hashedPassword);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的内容'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // 获取更新后的用户
    const updatedUser = db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        u.real_name, 
        u.email, 
        u.phone, 
        u.department_id,
        u.position,
        u.status,
        u.created_at,
        u.updated_at,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(id);

    res.json({
      success: true,
      message: '用户更新成功',
      data: updatedUser
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户失败'
    });
  }
});

/**
 * 删除用户（软删除）
 * DELETE /api/users/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 检查用户是否存在
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ? AND status != ?').get(id, 'deleted');
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 软删除：将状态设置为 'deleted'
    db.prepare("UPDATE users SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

    res.json({
      success: true,
      message: '用户删除成功'
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      success: false,
      message: '删除用户失败'
    });
  }
});

/**
 * 批量更新用户状态
 * PUT /api/users/batch-status
 * 请求体: { ids: [1, 2, 3], status: 'active' | 'disabled' }
 */
router.put('/batch-status', (req, res) => {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要操作的用户'
      });
    }

    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '状态值无效'
      });
    }

    // 构建批量更新语句
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`
      UPDATE users 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id IN (${placeholders}) AND status != 'deleted'
    `).run(status, ...ids);

    res.json({
      success: true,
      message: `已${status === 'active' ? '启用' : '禁用'} ${ids.length} 个用户`
    });
  } catch (error) {
    console.error('批量更新用户状态失败:', error);
    res.status(500).json({
      success: false,
      message: '批量更新用户状态失败'
    });
  }
});

/**
 * 检查用户名是否可用
 * GET /api/users/check-username
 */
router.get('/check-username', (req, res) => {
  try {
    const { username, excludeId } = req.query;

    if (!username) {
      return res.json({
        success: true,
        available: false,
        message: '用户名不能为空'
      });
    }

    let sql = 'SELECT id FROM users WHERE username = ? AND status != ?';
    const params = [username, 'deleted'];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const existingUser = db.prepare(sql).get(...params);

    res.json({
      success: true,
      available: !existingUser,
      message: existingUser ? '用户名已存在' : '用户名可用'
    });
  } catch (error) {
    console.error('检查用户名失败:', error);
    res.status(500).json({
      success: false,
      message: '检查用户名失败'
    });
  }
});

/**
 * PUT /api/users/:id/status
 * 切换用户状态（启用/禁用）
 */
router.put('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // 验证状态值
    if (!status || !['active', 'inactive', 'disabled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: '状态值无效'
      });
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND status != ?').get(id, 'deleted');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 不允许禁用自己
    // if (req.user && req.user.id === parseInt(id)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: '不能禁用自己的账号'
    //   });
    // }

    // 更新状态
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id);

    res.json({
      success: true,
      message: status === 'active' ? '用户已启用' : '用户已禁用'
    });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户状态失败'
    });
  }
});

module.exports = router;
