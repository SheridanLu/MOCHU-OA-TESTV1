const { db, initDatabase } = require('./models/database');
const bcrypt = require('bcryptjs');

// 初始化数据库
initDatabase();

// 创建测试用户
function createTestUsers() {
  const testUsers = [
    {
      username: 'admin',
      password: '123456',
      real_name: '系统管理员',
      email: 'admin@oa.com',
      phone: '13800138000',
      position: '管理员'
    },
    {
      username: 'manager',
      password: '123456',
      real_name: '张经理',
      email: 'manager@oa.com',
      phone: '13800138001',
      position: '部门经理'
    },
    {
      username: 'employee',
      password: '123456',
      real_name: '李员工',
      email: 'employee@oa.com',
      phone: '13800138002',
      position: '普通员工'
    }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, real_name, email, phone, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  testUsers.forEach(user => {
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    stmt.run(user.username, hashedPassword, user.real_name, user.email, user.phone, user.position);
    console.log(`创建用户: ${user.username} (${user.real_name})`);
  });

  console.log('\n测试用户创建完成！');
  console.log('----------------------------');
  console.log('账号: admin, 密码: 123456');
  console.log('账号: manager, 密码: 123456');
  console.log('账号: employee, 密码: 123456');
  console.log('----------------------------');
  console.log('测试手机号: 13800138000, 13800138001, 13800138002');
}

createTestUsers();
