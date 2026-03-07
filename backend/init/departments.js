/**
 * 部门初始化脚本
 * 自动插入7个核心部门（仅在数据库为空时执行）
 */

// 核心部门数据
const departments = [
  { id: 1, name: '总经办', code: 'GM', parent_id: null, sort_order: 1 },
  { id: 2, name: '工程项目管理部', code: 'PROJECT_MGMT', parent_id: 1, sort_order: 1 },
  { id: 3, name: '基础业务部', code: 'BASE', parent_id: 1, sort_order: 2 },
  { id: 4, name: '软件业务部', code: 'SOFTWARE', parent_id: 1, sort_order: 3 },
  { id: 5, name: '财务部', code: 'FINANCE', parent_id: 1, sort_order: 4 },
  { id: 6, name: '综合部', code: 'GENERAL', parent_id: 1, sort_order: 5 },
  { id: 7, name: '技术支撑部', code: 'TECH_SUPPORT', parent_id: 1, sort_order: 6 }
];

/**
 * 检查是否需要初始化（部门表为空时才执行）
 * @param {Object} db - better-sqlite3 数据库实例
 * @returns {boolean}
 */
function needsInitialization(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM departments').get();
  return count.count === 0;
}

/**
 * 初始化部门数据
 * 使用事务确保原子性，检查是否已存在避免重复插入
 * @param {Object} db - better-sqlite3 数据库实例
 */
function initDepartments(db) {
  // 检查是否需要初始化
  if (!needsInitialization(db)) {
    console.log('部门数据已存在，跳过初始化');
    return false;
  }

  console.log('开始初始化7个核心部门...');

  // 检查 departments 表是否有 code 字段，没有则添加
  try {
    db.exec(`ALTER TABLE departments ADD COLUMN code TEXT UNIQUE`);
    console.log('已添加 code 字段');
  } catch (e) {
    // 字段已存在，忽略错误
  }

  // 使用事务确保原子性
  const insertDepartment = db.prepare(`
    INSERT OR IGNORE INTO departments (id, name, code, parent_id, sort_order)
    VALUES (@id, @name, @code, @parent_id, @sort_order)
  `);

  const transaction = db.transaction(() => {
    for (const dept of departments) {
      const result = insertDepartment.run(dept);
      if (result.changes > 0) {
        console.log(`  ✓ 已插入部门: ${dept.name} (${dept.code})`);
      } else {
        console.log(`  - 部门已存在，跳过: ${dept.name} (${dept.code})`);
      }
    }
  });

  transaction();
  console.log('部门初始化完成！');

  return true;
}

module.exports = { initDepartments, departments };
