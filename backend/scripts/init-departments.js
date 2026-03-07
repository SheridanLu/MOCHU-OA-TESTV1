/**
 * 初始化测试部门数据
 */
const { db } = require('../models/database');

function initDepartments() {
  // 检查是否已有部门数据
  const count = db.prepare('SELECT COUNT(*) as count FROM departments').get();
  
  if (count.count > 0) {
    console.log('部门数据已存在，跳过初始化');
    return;
  }

  console.log('开始初始化部门数据...');

  // 创建初始部门（按照 OA_FINAL 技术需求中的 7 个核心部门）
  const departments = [
    { name: '总经办', parent_id: null, sort_order: 1 },
    { name: '工程项目管理部', parent_id: 1, sort_order: 1 },
    { name: '财务部', parent_id: 1, sort_order: 2 },
    { name: '行政人事部', parent_id: 1, sort_order: 3 },
    { name: '采购部', parent_id: 1, sort_order: 4 },
    { name: '商务部', parent_id: 1, sort_order: 5 },
    { name: '技术研发部', parent_id: 1, sort_order: 6 },
  ];

  const stmt = db.prepare(`
    INSERT INTO departments (name, parent_id, sort_order)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.name, item.parent_id, item.sort_order);
    }
  });

  insertMany(departments);

  console.log('部门数据初始化完成！');
  
  // 验证数据
  const result = db.prepare('SELECT * FROM departments ORDER BY sort_order').all();
  console.log('已创建部门:', result);
}

// 导出初始化函数
module.exports = { initDepartments };

// 如果直接运行此脚本
if (require.main === module) {
  initDepartments();
}
