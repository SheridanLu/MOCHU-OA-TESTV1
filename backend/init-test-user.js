// 测试数据初始化脚本
// 运行: node init-test-user.js

const { db, initDatabase } = require('./models/database');

// 初始化数据库
initDatabase();

// 创建测试用户
function createTestUsers() {
  const bcrypt = require('bcryptjs');
  const testUsers = [
    {
      username: 'admin',
      password: 'admin123',
      real_name: '系统管理员',
      email: 'admin@mochu.com',
      phone: '13800138000',
      position: '管理员'
    },
    {
      username: 'test',
      password: 'test123',
      real_name: '测试用户',
      email: 'test@mochu.com',
      phone: '13900139000',
      position: '员工'
    },
    {
      username: 'zhangsan',
      password: 'zhangsan123',
      real_name: '张三',
      email: 'zhangsan@mochu.com',
      phone: '13600001111',
      position: '项目经理'
    }
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, real_name, email, phone, position, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `);

  for (const user of testUsers) {
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    stmt.run(user.username, hashedPassword, user.real_name, user.email, user.phone, user.position);
    console.log(`Created user: ${user.username} (password: ${user.password})`);
  }

  console.log('\n测试用户创建完成！');
  console.log('可以使用以下账号登录测试:');
  console.log('- 用户名: admin, 密码: admin123');
  console.log('- 用户名: test, 密码: test123');
  console.log('- 手机号: 13800138000');
  console.log('- 手机号: 13900139000');
}

createTestUsers();
