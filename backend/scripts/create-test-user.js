/**
 * 创建测试用户脚本
 * 运行: node scripts/create-test-user.js
 */

const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new Database(dbPath);

async function createTestUser() {
  const username = 'admin';
  const password = '123456';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // 先检查用户是否存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    
    if (existing) {
      // 更新密码
      db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hashedPassword, username);
      console.log(`用户 "${username}" 已存在，密码已更新`);
    } else {
      // 创建新用户
      db.prepare(`
        INSERT INTO users (username, password, real_name, email, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(username, hashedPassword, '管理员', 'admin@example.com', 'active');
      console.log(`用户 "${username}" 创建成功`);
    }
    
    console.log(`用户名: ${username}`);
    console.log(`密码: ${password}`);
    console.log('\n请使用以上凭据测试登录失败锁定机制');
    
  } catch (error) {
    console.error('创建用户失败:', error);
  }
  
  db.close();
}

createTestUser();
