/**
 * 角色管理路由
 * 提供角色的 CRUD 和权限管理 API
 */

const express = require('express');
const { db } = require('../models/database');
const { PERMISSIONS } = require('../init/roles');

const router = express.Router();

/**
 * GET /api/roles
 * 获取角色列表
 * 查询参数: page, pageSize, keyword
 */
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 构建查询条件
    let whereClause = '1=1';
    const params = [];

    if (keyword) {
      whereClause += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
      const searchPattern = `%${keyword}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM roles WHERE ${whereClause}`;
    const countResult = db.prepare(countSql).get(...params);
    const total = countResult.total;

    // 查询列表
    const listSql = `SELECT id, code, name, description, permissions, created_at 
                     FROM roles 
                     WHERE ${whereClause}
                     ORDER BY id ASC
                     LIMIT ? OFFSET ?`;
    const rows = db.prepare(listSql).all(...params, limit, offset);

    // 解析 permissions JSON
    const list = rows.map(row => ({
      ...row,
      permissions: JSON.parse(row.permissions || '[]'),
      permissionCount: JSON.parse(row.permissions || '[]').length
    }));

    res.json({
      success: true,
      data: {
        list,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取角色列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取角色列表失败'
    });
  }
});

/**
 * GET /api/roles/permissions
 * 获取所有可用权限列表
 */
router.get('/permissions', (req, res) => {
  try {
    // 按模块分组权限
    const groupedPermissions = {};
    
    Object.entries(PERMISSIONS).forEach(([code, name]) => {
      const [module] = code.split(':');
      if (!groupedPermissions[module]) {
        groupedPermissions[module] = [];
      }
      groupedPermissions[module].push({ code, name });
    });

    res.json({
      success: true,
      data: {
        permissions: PERMISSIONS,
        grouped: groupedPermissions
      }
    });
  } catch (error) {
    console.error('获取权限列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取权限列表失败'
    });
  }
});

/**
 * GET /api/roles/:id
 * 获取角色详情（含权限）
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const row = db.prepare(`
      SELECT id, code, name, description, permissions, created_at
      FROM roles
      WHERE id = ?
    `).get(id);

    if (!row) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 解析 permissions JSON
    const permissions = JSON.parse(row.permissions || '[]');
    
    // 获取权限名称映射
    const permissionDetails = permissions.map(code => ({
      code,
      name: PERMISSIONS[code] || code
    }));

    res.json({
      success: true,
      data: {
        ...row,
        permissions,
        permissionDetails
      }
    });
  } catch (error) {
    console.error('获取角色详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取角色详情失败'
    });
  }
});

/**
 * POST /api/roles
 * 新增角色
 * 请求体: { code, name, description, permissions }
 */
router.post('/', (req, res) => {
  try {
    const { code, name, description = '', permissions = [] } = req.body;

    // 参数校验
    if (!code || !name) {
      return res.status(400).json({
        success: false,
        message: '角色编码和名称不能为空'
      });
    }

    // 检查编码是否已存在
    const existing = db.prepare('SELECT id FROM roles WHERE code = ?').get(code);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: '角色编码已存在'
      });
    }

    // 检查名称是否已存在
    const existingName = db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
    if (existingName) {
      return res.status(400).json({
        success: false,
        message: '角色名称已存在'
      });
    }

    // 验证权限是否有效
    const validPermissions = permissions.filter(p => PERMISSIONS[p]);
    if (validPermissions.length !== permissions.length) {
      console.warn('部分权限无效，已过滤');
    }

    // 插入数据
    const result = db.prepare(`
      INSERT INTO roles (code, name, description, permissions)
      VALUES (?, ?, ?, ?)
    `).run(code, name, description, JSON.stringify(validPermissions));

    res.json({
      success: true,
      message: '角色创建成功',
      data: {
        id: result.lastInsertRowid,
        code,
        name,
        description,
        permissions: validPermissions
      }
    });
  } catch (error) {
    console.error('创建角色失败:', error);
    res.status(500).json({
      success: false,
      message: '创建角色失败'
    });
  }
});

/**
 * PUT /api/roles/:id
 * 更新角色基本信息
 * 请求体: { name, description }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // 检查角色是否存在
    const existing = db.prepare('SELECT id, code FROM roles WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 不允许修改核心角色（ID 1-10）的编码
    const isCoreRole = parseInt(id) <= 10;

    // 如果修改了名称，检查是否重复
    if (name) {
      const duplicate = db.prepare('SELECT id FROM roles WHERE name = ? AND id != ?').get(name, id);
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: '角色名称已存在'
        });
      }
    }

    // 更新数据
    db.prepare(`
      UPDATE roles 
      SET name = COALESCE(?, name),
          description = COALESCE(?, description)
      WHERE id = ?
    `).run(name || null, description !== undefined ? description : null, id);

    // 获取更新后的数据
    const updated = db.prepare(`
      SELECT id, code, name, description, permissions, created_at
      FROM roles
      WHERE id = ?
    `).get(id);

    res.json({
      success: true,
      message: '角色更新成功',
      data: {
        ...updated,
        permissions: JSON.parse(updated.permissions || '[]')
      }
    });
  } catch (error) {
    console.error('更新角色失败:', error);
    res.status(500).json({
      success: false,
      message: '更新角色失败'
    });
  }
});

/**
 * PUT /api/roles/:id/permissions
 * 更新角色权限
 * 请求体: { permissions: string[] }
 */
router.put('/:id/permissions', (req, res) => {
  try {
    const { id } = req.params;
    const { permissions = [] } = req.body;

    // 检查角色是否存在
    const existing = db.prepare('SELECT id, code, name FROM roles WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // GM角色（总经理）不允许修改权限（必须保持全部权限）
    if (existing.code === 'GM') {
      return res.status(403).json({
        success: false,
        message: '总经理角色权限不可修改'
      });
    }

    // 验证权限是否有效
    const validPermissions = permissions.filter(p => PERMISSIONS[p]);
    if (validPermissions.length !== permissions.length) {
      console.warn('部分权限无效，已过滤');
    }

    // 更新权限
    db.prepare(`
      UPDATE roles 
      SET permissions = ?
      WHERE id = ?
    `).run(JSON.stringify(validPermissions), id);

    res.json({
      success: true,
      message: '权限更新成功',
      data: {
        id: parseInt(id),
        code: existing.code,
        name: existing.name,
        permissions: validPermissions,
        permissionCount: validPermissions.length
      }
    });
  } catch (error) {
    console.error('更新权限失败:', error);
    res.status(500).json({
      success: false,
      message: '更新权限失败'
    });
  }
});

/**
 * DELETE /api/roles/:id
 * 删除角色
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 检查角色是否存在
    const existing = db.prepare('SELECT id, code, name FROM roles WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 不允许删除核心角色（ID 1-10）
    if (parseInt(id) <= 10) {
      return res.status(403).json({
        success: false,
        message: '核心角色不允许删除'
      });
    }

    // 检查是否有用户关联此角色
    const userCount = db.prepare(`
      SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?
    `).get(id);

    if (userCount.count > 0) {
      return res.status(400).json({
        success: false,
        message: `该角色已关联 ${userCount.count} 个用户，请先解除关联`
      });
    }

    // 删除角色
    db.prepare('DELETE FROM roles WHERE id = ?').run(id);

    res.json({
      success: true,
      message: '角色删除成功'
    });
  } catch (error) {
    console.error('删除角色失败:', error);
    res.status(500).json({
      success: false,
      message: '删除角色失败'
    });
  }
});

/**
 * GET /api/roles/:id/users
 * 获取关联此角色的用户列表
 */
router.get('/:id/users', (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);

    // 检查角色是否存在
    const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 查询总数
    const countResult = db.prepare(`
      SELECT COUNT(*) as total 
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      WHERE ur.role_id = ?
    `).get(id);

    // 查询用户列表
    const users = db.prepare(`
      SELECT u.id, u.username, u.real_name, u.phone, u.email, u.status, u.department_id,
             d.name as department_name
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ur.role_id = ?
      ORDER BY u.id ASC
      LIMIT ? OFFSET ?
    `).all(id, limit, offset);

    res.json({
      success: true,
      data: {
        list: users,
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取角色用户列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取角色用户列表失败'
    });
  }
});

module.exports = router;
