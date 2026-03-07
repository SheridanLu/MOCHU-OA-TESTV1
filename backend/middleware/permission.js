/**
 * 权限校验中间件
 * 实现 API 级别的权限控制
 */
const { db } = require('../models/database');

/**
 * 获取用户的所有权限
 * @param {number} userId - 用户ID
 * @returns {string[]} 权限列表
 */
function getUserPermissions(userId) {
  // 查询用户的所有角色
  const roles = db.prepare(`
    SELECT r.id, r.code, r.name, r.permissions
    FROM roles r
    INNER JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ?
  `).all(userId);

  // 检查是否是超级管理员(GM)
  const isGM = roles.some(role => role.code === 'GM' || role.code === 'gm');
  if (isGM) {
    // 超级管理员拥有所有权限，返回特殊标记
    return ['*'];
  }

  // 合并所有角色的权限
  const permissions = new Set();
  
  roles.forEach(role => {
    // 角色代码本身也是一种权限标识 (如 finance, admin 等)
    permissions.add(role.code.toLowerCase());
    
    // 从角色的 permissions JSON 字段中获取具体权限
    if (role.permissions) {
      try {
        const rolePermissions = JSON.parse(role.permissions);
        if (Array.isArray(rolePermissions)) {
          rolePermissions.forEach(perm => {
            permissions.add(perm);
          });
        }
      } catch (e) {
        console.error('解析角色权限失败:', e.message);
      }
    }
  });

  return Array.from(permissions);
}

/**
 * 检查用户是否拥有指定权限
 * @param {string[]} userPermissions - 用户权限列表
 * @param {string} requiredPermission - 需要的权限
 * @returns {boolean}
 */
function hasPermission(userPermissions, requiredPermission) {
  // 超级管理员拥有所有权限
  if (userPermissions.includes('*')) {
    return true;
  }
  
  return userPermissions.includes(requiredPermission);
}

/**
 * 检查用户是否拥有任意一个指定权限
 * @param {string[]} userPermissions - 用户权限列表
 * @param {string[]} requiredPermissions - 需要的权限列表
 * @returns {boolean}
 */
function hasAnyPermission(userPermissions, requiredPermissions) {
  // 超级管理员拥有所有权限
  if (userPermissions.includes('*')) {
    return true;
  }
  
  return requiredPermissions.some(perm => userPermissions.includes(perm));
}

/**
 * 检查用户是否拥有所有指定权限
 * @param {string[]} userPermissions - 用户权限列表
 * @param {string[]} requiredPermissions - 需要的权限列表
 * @returns {boolean}
 */
function hasAllPermissions(userPermissions, requiredPermissions) {
  // 超级管理员拥有所有权限
  if (userPermissions.includes('*')) {
    return true;
  }
  
  return requiredPermissions.every(perm => userPermissions.includes(perm));
}

/**
 * 获取用户角色列表
 * @param {number} userId - 用户ID
 * @returns {Array} 角色列表
 */
function getUserRoles(userId) {
  return db.prepare(`
    SELECT r.id, r.code, r.name
    FROM roles r
    INNER JOIN user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = ?
  `).all(userId);
}

/**
 * 检查单个权限 - 中间件工厂函数
 * @param {string} permission - 需要的权限
 * @returns {Function} Express 中间件
 * 
 * @example
 * router.post('/projects', authMiddleware, checkPermission('project:create'), createProject);
 */
function checkPermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const userPermissions = getUserPermissions(req.user.id);
    
    if (!hasPermission(userPermissions, permission)) {
      return res.status(403).json({
        success: false,
        message: '无权限执行此操作',
        required: permission
      });
    }

    // 将权限列表附加到 req 对象，供后续使用
    req.userPermissions = userPermissions;
    next();
  };
}

/**
 * 检查是否有任意一个权限 - 中间件工厂函数
 * @param {string[]} permissions - 需要的权限列表（满足其一即可）
 * @returns {Function} Express 中间件
 * 
 * @example
 * router.put('/contracts/:id/approve', authMiddleware, checkAnyPermission(['contract:approve', 'finance']), approveContract);
 */
function checkAnyPermission(permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const userPermissions = getUserPermissions(req.user.id);
    
    if (!hasAnyPermission(userPermissions, permissions)) {
      return res.status(403).json({
        success: false,
        message: '无权限执行此操作',
        required: permissions
      });
    }

    req.userPermissions = userPermissions;
    next();
  };
}

/**
 * 检查是否有所有权限 - 中间件工厂函数
 * @param {string[]} permissions - 需要的权限列表（必须全部满足）
 * @returns {Function} Express 中间件
 * 
 * @example
 * router.delete('/projects/:id', authMiddleware, checkAllPermissions(['project:delete', 'admin']), deleteProject);
 */
function checkAllPermissions(permissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未登录'
      });
    }

    const userPermissions = getUserPermissions(req.user.id);
    
    if (!hasAllPermissions(userPermissions, permissions)) {
      return res.status(403).json({
        success: false,
        message: '无权限执行此操作',
        required: permissions
      });
    }

    req.userPermissions = userPermissions;
    next();
  };
}

/**
 * 获取当前用户权限的 API 端点中间件
 * 将用户权限附加到 req 对象
 */
function attachPermissions(req, res, next) {
  if (req.user) {
    req.userPermissions = getUserPermissions(req.user.id);
    req.userRoles = getUserRoles(req.user.id);
  }
  next();
}

module.exports = {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  getUserPermissions,
  getUserRoles,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  attachPermissions
};

// 默认导出 attachPermissions，供 auth 中间件使用
module.exports.attachPermissions = attachPermissions;
