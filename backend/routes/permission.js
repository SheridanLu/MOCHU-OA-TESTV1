/**
 * 权限管理路由
 * Task 18: 实现RBAC - 权限分配
 * - GET /api/permissions - 获取所有权限定义
 * - GET /api/permissions/user/:userId - 获取用户权限
 * - PUT /api/permissions/user/:userId - 分配用户角色
 * - PUT /api/permissions/role/:roleId - 配置角色权限
 */

const express = require('express');
const router = express.Router();
const { db } = require('../models/database');

// 权限定义 - 按模块组织
const PERMISSION_DEFINITIONS = {
  project: {
    name: '项目模块',
    permissions: [
      { code: 'project:view', name: '查看项目', description: '查看项目列表和详情' },
      { code: 'project:create', name: '创建项目', description: '创建新项目' },
      { code: 'project:edit', name: '编辑项目', description: '编辑项目信息' },
      { code: 'project:delete', name: '删除项目', description: '删除项目' }
    ]
  },
  contract: {
    name: '合同模块',
    permissions: [
      { code: 'contract:view', name: '查看合同', description: '查看合同列表和详情' },
      { code: 'contract:create', name: '创建合同', description: '创建新合同' },
      { code: 'contract:edit', name: '编辑合同', description: '编辑合同信息' },
      { code: 'contract:delete', name: '删除合同', description: '删除合同' },
      { code: 'contract:approve', name: '审批合同', description: '审批合同申请' }
    ]
  },
  material: {
    name: '物资模块',
    permissions: [
      { code: 'material:view', name: '查看物资', description: '查看物资列表和详情' },
      { code: 'material:create', name: '创建物资', description: '新增物资信息' },
      { code: 'material:edit', name: '编辑物资', description: '编辑物资信息' },
      { code: 'material:delete', name: '删除物资', description: '删除物资信息' }
    ]
  },
  cost: {
    name: '成本模块',
    permissions: [
      { code: 'cost:view', name: '查看成本', description: '查看成本数据' },
      { code: 'cost:create', name: '录入成本', description: '录入成本数据' },
      { code: 'cost:edit', name: '编辑成本', description: '编辑成本数据' },
      { code: 'cost:approve', name: '审批成本', description: '审批成本相关申请' }
    ]
  },
  system: {
    name: '系统模块',
    permissions: [
      { code: 'system:user', name: '用户管理', description: '管理用户账号' },
      { code: 'system:role', name: '角色管理', description: '管理系统角色' },
      { code: 'system:dept', name: '部门管理', description: '管理部门信息' },
      { code: 'system:config', name: '系统配置', description: '系统参数配置' }
    ]
  }
};

// 初始化 role_permissions 表
function initRolePermissionsTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INTEGER NOT NULL,
        permission_code TEXT NOT NULL,
        PRIMARY KEY (role_id, permission_code),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      )
    `);
  } catch (e) {
    // 表已存在
  }
}

// 调用初始化
initRolePermissionsTable();

/**
 * GET /api/permissions
 * 获取所有权限定义
 */
router.get('/', (req, res) => {
  try {
    res.json({
      success: true,
      data: PERMISSION_DEFINITIONS
    });
  } catch (error) {
    console.error('获取权限定义失败:', error);
    res.status(500).json({
      success: false,
      message: '获取权限定义失败'
    });
  }
});

/**
 * GET /api/permissions/roles
 * 获取所有角色列表
 */
router.get('/roles', (req, res) => {
  try {
    const roles = db.prepare(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM user_roles WHERE role_id = r.id) as user_count
      FROM roles r
      ORDER BY r.id
    `).all();

    // 获取每个角色的权限数量
    const rolesWithPermCount = roles.map(role => {
      const permCount = db.prepare(`
        SELECT COUNT(*) as count FROM role_permissions WHERE role_id = ?
      `).get(role.id);
      return {
        ...role,
        permission_count: permCount?.count || 0
      };
    });

    res.json({
      success: true,
      data: rolesWithPermCount
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
 * GET /api/permissions/role/:roleId
 * 获取角色的权限列表
 */
router.get('/role/:roleId', (req, res) => {
  try {
    const { roleId } = req.params;

    // 获取角色信息
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 获取角色的权限代码列表
    const permissions = db.prepare(`
      SELECT permission_code FROM role_permissions WHERE role_id = ?
    `).all(roleId);

    const permissionCodes = permissions.map(p => p.permission_code);

    res.json({
      success: true,
      data: {
        role,
        permissions: permissionCodes
      }
    });
  } catch (error) {
    console.error('获取角色权限失败:', error);
    res.status(500).json({
      success: false,
      message: '获取角色权限失败'
    });
  }
});

/**
 * PUT /api/permissions/role/:roleId
 * 配置角色权限
 */
router.put('/role/:roleId', (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: '权限列表格式不正确'
      });
    }

    // 检查角色是否存在
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 使用事务更新权限
    const updatePermissions = db.transaction(() => {
      // 删除该角色的所有权限
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);

      // 插入新权限
      const insertStmt = db.prepare(`
        INSERT INTO role_permissions (role_id, permission_code) VALUES (?, ?)
      `);

      permissions.forEach(permCode => {
        insertStmt.run(roleId, permCode);
      });
    });

    updatePermissions();

    res.json({
      success: true,
      message: '角色权限更新成功'
    });
  } catch (error) {
    console.error('更新角色权限失败:', error);
    res.status(500).json({
      success: false,
      message: '更新角色权限失败'
    });
  }
});

/**
 * GET /api/permissions/user/:userId
 * 获取用户的角色和权限
 */
router.get('/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;

    // 获取用户信息
    const user = db.prepare('SELECT id, username, real_name FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 获取用户的所有角色
    const roles = db.prepare(`
      SELECT r.* FROM roles r
      INNER JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `).all(userId);

    // 获取用户的所有权限（通过角色）
    const permissions = db.prepare(`
      SELECT DISTINCT rp.permission_code 
      FROM role_permissions rp
      INNER JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?
    `).all(userId);

    const permissionCodes = permissions.map(p => p.permission_code);

    res.json({
      success: true,
      data: {
        user,
        roles,
        permissions: permissionCodes
      }
    });
  } catch (error) {
    console.error('获取用户权限失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户权限失败'
    });
  }
});

/**
 * PUT /api/permissions/user/:userId
 * 分配用户角色
 */
router.put('/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { roleIds } = req.body;

    if (!Array.isArray(roleIds)) {
      return res.status(400).json({
        success: false,
        message: '角色列表格式不正确'
      });
    }

    // 检查用户是否存在
    const user = db.prepare('SELECT id, username, real_name FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 验证所有角色是否存在
    const validRoles = [];
    for (const roleId of roleIds) {
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId);
      if (role) {
        validRoles.push(roleId);
      }
    }

    // 使用事务更新用户角色
    const updateUserRoles = db.transaction(() => {
      // 删除该用户的所有角色
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);

      // 插入新角色
      const insertStmt = db.prepare(`
        INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)
      `);

      validRoles.forEach(roleId => {
        insertStmt.run(userId, roleId);
      });
    });

    updateUserRoles();

    res.json({
      success: true,
      message: '用户角色分配成功'
    });
  } catch (error) {
    console.error('分配用户角色失败:', error);
    res.status(500).json({
      success: false,
      message: '分配用户角色失败'
    });
  }
});

/**
 * GET /api/permissions/users
 * 获取用户列表（带角色信息）
 */
router.get('/users', (req, res) => {
  try {
    const { keyword, page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (keyword) {
      whereClause += ' AND (username LIKE ? OR real_name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 获取总数
    const countSql = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const countResult = db.prepare(countSql).get(...params);
    const total = countResult?.total || 0;

    // 获取用户列表
    const usersSql = `
      SELECT u.id, u.username, u.real_name, u.department_id, u.status,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      ${whereClause}
      ORDER BY u.id
      LIMIT ? OFFSET ?
    `;
    const users = db.prepare(usersSql).all(...params, parseInt(pageSize), offset);

    // 获取每个用户的角色
    const usersWithRoles = users.map(user => {
      const roles = db.prepare(`
        SELECT r.id, r.name, r.code FROM roles r
        INNER JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = ?
      `).all(user.id);

      return {
        ...user,
        roles
      };
    });

    res.json({
      success: true,
      data: {
        list: usersWithRoles,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
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
 * POST /api/permissions/roles
 * 创建新角色
 */
router.post('/roles', (req, res) => {
  try {
    const { name, code, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: '角色名称和代码不能为空'
      });
    }

    // 检查代码是否已存在
    const existingRole = db.prepare('SELECT id FROM roles WHERE code = ?').get(code);
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: '角色代码已存在'
      });
    }

    const result = db.prepare(`
      INSERT INTO roles (name, code, description) VALUES (?, ?, ?)
    `).run(name, code, description || '');

    res.json({
      success: true,
      message: '角色创建成功',
      data: {
        id: result.lastInsertRowid,
        name,
        code,
        description
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
 * PUT /api/permissions/roles/:roleId
 * 更新角色信息
 */
router.put('/roles/:roleId', (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, description } = req.body;

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    db.prepare(`
      UPDATE roles SET name = ?, description = ? WHERE id = ?
    `).run(name || role.name, description || role.description, roleId);

    res.json({
      success: true,
      message: '角色更新成功'
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
 * DELETE /api/permissions/roles/:roleId
 * 删除角色
 */
router.delete('/roles/:roleId', (req, res) => {
  try {
    const { roleId } = req.params;

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: '角色不存在'
      });
    }

    // 检查是否有用户使用该角色
    const userCount = db.prepare(`
      SELECT COUNT(*) as count FROM user_roles WHERE role_id = ?
    `).get(roleId);

    if (userCount.count > 0) {
      return res.status(400).json({
        success: false,
        message: `该角色下有 ${userCount.count} 个用户，无法删除`
      });
    }

    // 删除角色权限关联
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);

    // 删除角色
    db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);

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

module.exports = router;
