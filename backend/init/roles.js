/**
 * 角色初始化脚本
 * 定义10个核心角色及其权限
 */

// 系统权限定义（按模块分组）
const PERMISSIONS = {
  // 系统管理
  'system:manage': '系统管理',
  'system:logs': '日志审计',
  
  // 用户管理
  'user:view': '查看用户',
  'user:create': '创建用户',
  'user:edit': '编辑用户',
  'user:delete': '删除用户',
  'user:status': '启用/禁用用户',
  
  // 角色权限
  'role:view': '查看角色',
  'role:create': '创建角色',
  'role:edit': '编辑角色',
  'role:delete': '删除角色',
  'role:assign': '分配权限',
  
  // 部门管理
  'dept:view': '查看部门',
  'dept:create': '创建部门',
  'dept:edit': '编辑部门',
  'dept:delete': '删除部门',
  
  // 项目管理
  'project:view': '查看项目',
  'project:create': '创建项目',
  'project:edit': '编辑项目',
  'project:delete': '删除项目',
  'project:approve': '项目审批',
  
  // 合同管理
  'contract:view': '查看合同',
  'contract:create': '创建合同',
  'contract:edit': '编辑合同',
  'contract:delete': '删除合同',
  'contract:approve': '合同审批',
  
  // 采购管理
  'purchase:view': '查看采购',
  'purchase:create': '创建采购',
  'purchase:edit': '编辑采购',
  'purchase:delete': '删除采购',
  'purchase:approve': '采购审批',
  
  // 库存管理
  'inventory:view': '查看库存',
  'inventory:in': '入库操作',
  'inventory:out': '出库操作',
  'inventory:adjust': '库存调整',
  
  // 财务管理
  'finance:view': '查看财务',
  'finance:budget': '预算管理',
  'finance:payment': '付款审批',
  'finance:report': '财务报表',
  
  // 人事管理
  'hr:view': '查看人事',
  'hr:create': '创建员工',
  'hr:edit': '编辑员工',
  'hr:delete': '删除员工',
  'hr:directory': '通讯录管理',
  'hr:email': '企业邮箱管理',
  
  // 数据管理
  'data:view': '查看数据',
  'data:input': '数据录入',
  'data:export': '数据导出',
  'data:import': '数据导入',
  
  // 法务管理
  'legal:view': '查看法务',
  'legal:review': '合同审核',
  'legal:approve': '法务审批'
};

// 10个核心角色定义
const ROLES = [
  {
    id: 1,
    code: 'GM',
    name: '总经理',
    description: '拥有系统全部权限，可管理所有模块',
    permissions: Object.keys(PERMISSIONS) // 全部权限
  },
  {
    id: 2,
    code: 'PROJ_MGR',
    name: '项目经理',
    description: '负责项目的整体管理和协调',
    permissions: [
      // 项目相关
      'project:view', 'project:create', 'project:edit', 'project:delete',
      // 合同相关
      'contract:view', 'contract:create', 'contract:edit',
      // 采购相关
      'purchase:view', 'purchase:create', 'purchase:edit',
      // 库存相关
      'inventory:view', 'inventory:in', 'inventory:out',
      // 数据相关
      'data:view', 'data:input', 'data:export',
      // 部门查看
      'dept:view', 'user:view'
    ]
  },
  {
    id: 3,
    code: 'BUDGET',
    name: '预算员',
    description: '负责成本预算和费用控制，可审批支出合同超量校验',
    permissions: [
      // 财务相关
      'finance:view', 'finance:budget', 'finance:report',
      // 项目查看
      'project:view',
      // 合同相关（包括超量校验审批）
      'contract:view', 'contract:approve',
      // 采购查看
      'purchase:view',
      // 数据相关
      'data:view', 'data:input', 'data:export', 'data:import'
    ]
  },
  {
    id: 4,
    code: 'PURCHASE',
    name: '采购员',
    description: '负责采购管理和供应商对接',
    permissions: [
      // 采购相关
      'purchase:view', 'purchase:create', 'purchase:edit', 'purchase:delete',
      // 库存相关
      'inventory:view', 'inventory:in',
      // 项目查看
      'project:view',
      // 数据相关
      'data:view', 'data:input'
    ]
  },
  {
    id: 5,
    code: 'DATA',
    name: '数据员',
    description: '负责系统数据的录入和维护',
    permissions: [
      // 数据相关（核心权限）
      'data:view', 'data:input', 'data:export', 'data:import',
      // 查看权限
      'project:view', 'contract:view', 'purchase:view', 'inventory:view'
    ]
  },
  {
    id: 6,
    code: 'FINANCE',
    name: '财务',
    description: '负责财务审批和费用管理',
    permissions: [
      // 财务相关（核心权限）
      'finance:view', 'finance:budget', 'finance:payment', 'finance:report',
      // 合同相关
      'contract:view', 'contract:approve',
      // 采购审批
      'purchase:view', 'purchase:approve',
      // 数据相关
      'data:view', 'data:export'
    ]
  },
  {
    id: 7,
    code: 'HR',
    name: '人事',
    description: '负责人员管理和人事流程',
    permissions: [
      // 人事相关（核心权限）
      'hr:view', 'hr:create', 'hr:edit', 'hr:delete', 'hr:directory', 'hr:email',
      // 用户管理
      'user:view', 'user:create', 'user:edit',
      // 部门管理
      'dept:view', 'dept:create', 'dept:edit',
      // 数据相关
      'data:view', 'data:input', 'data:export'
    ]
  },
  {
    id: 8,
    code: 'LEGAL',
    name: '法务',
    description: '负责合同审核和法律事务',
    permissions: [
      // 法务相关（核心权限）
      'legal:view', 'legal:review', 'legal:approve',
      // 合同相关
      'contract:view', 'contract:approve',
      // 项目查看
      'project:view',
      // 数据相关
      'data:view', 'data:export'
    ]
  },
  {
    id: 9,
    code: 'BASE',
    name: '基础业务',
    description: '负责基础项目的执行和管理',
    permissions: [
      // 项目相关
      'project:view', 'project:create', 'project:edit',
      // 合同相关
      'contract:view', 'contract:create', 'contract:edit',
      // 采购相关
      'purchase:view', 'purchase:create',
      // 库存相关
      'inventory:view', 'inventory:in', 'inventory:out',
      // 数据相关
      'data:view', 'data:input'
    ]
  },
  {
    id: 10,
    code: 'SOFTWARE',
    name: '软件业务',
    description: '负责软件项目的开发和管理',
    permissions: [
      // 项目相关
      'project:view', 'project:create', 'project:edit',
      // 合同相关
      'contract:view', 'contract:create', 'contract:edit',
      // 数据相关
      'data:view', 'data:input', 'data:export'
    ]
  }
];

/**
 * 检查是否需要初始化（角色表为空时才执行）
 * @param {Object} db - better-sqlite3 数据库实例
 * @returns {boolean}
 */
function needsInitialization(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM roles').get();
  return count.count === 0;
}

/**
 * 确保roles表有permissions字段
 * @param {Object} db - better-sqlite3 数据库实例
 */
function ensurePermissionsColumn(db) {
  try {
    db.exec(`ALTER TABLE roles ADD COLUMN permissions TEXT DEFAULT '[]'`);
    console.log('已添加 permissions 字段');
  } catch (e) {
    // 字段已存在，忽略错误
  }
}

/**
 * 初始化角色数据
 * 使用事务确保原子性
 * @param {Object} db - better-sqlite3 数据库实例
 */
function initRoles(db) {
  // 确保permissions字段存在
  ensurePermissionsColumn(db);
  
  // 检查是否需要初始化
  if (!needsInitialization(db)) {
    console.log('角色数据已存在，跳过初始化');
    return false;
  }

  console.log('开始初始化10个核心角色...');

  // 使用事务确保原子性
  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (id, code, name, description, permissions)
    VALUES (@id, @code, @name, @description, @permissions)
  `);

  const transaction = db.transaction(() => {
    for (const role of ROLES) {
      const result = insertRole.run({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        permissions: JSON.stringify(role.permissions)
      });
      if (result.changes > 0) {
        console.log(`  ✓ 已插入角色: ${role.name} (${role.code}) - ${role.permissions.length}个权限`);
      } else {
        console.log(`  - 角色已存在，跳过: ${role.name} (${role.code})`);
      }
    }
  });

  transaction();
  console.log('角色初始化完成！');

  return true;
}

/**
 * 获取所有权限定义
 * @returns {Object} 权限映射表
 */
function getAllPermissions() {
  return { ...PERMISSIONS };
}

/**
 * 获取所有角色定义
 * @returns {Array} 角色列表
 */
function getAllRoleDefinitions() {
  return ROLES.map(role => ({
    ...role,
    permissionNames: role.permissions.map(p => PERMISSIONS[p] || p)
  }));
}

module.exports = { 
  initRoles, 
  needsInitialization,
  ROLES, 
  PERMISSIONS,
  getAllPermissions,
  getAllRoleDefinitions
};
