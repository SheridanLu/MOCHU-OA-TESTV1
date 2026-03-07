const { db } = require('./database');
const bcrypt = require('bcryptjs');

class User {
  // 根据用户名查找用户
  static findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }

  // 根据手机号查找用户
  static findByPhone(phone) {
    return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  }

  // 根据ID查找用户
  static findById(id) {
    return db.prepare('SELECT id, username, real_name, email, phone, department_id, position, status, created_at FROM users WHERE id = ?').get(id);
  }

  // 创建用户
  static create(userData) {
    const { username, password, real_name, email, phone, department_id, position } = userData;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const stmt = db.prepare(`
      INSERT INTO users (username, password, real_name, email, phone, department_id, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(username, hashedPassword, real_name, email, phone, department_id, position);
    return this.findById(result.lastInsertRowid);
  }

  // 验证密码
  static verifyPassword(user, password) {
    if (!user || !user.password) return false;
    return bcrypt.compareSync(password, user.password);
  }

  // 更新最后登录时间
  static updateLoginTime(userId) {
    db.prepare('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  }

  // 获取所有用户
  static findAll() {
    return db.prepare('SELECT id, username, real_name, email, phone, department_id, position, status, created_at FROM users').all();
  }

  // 更新用户信息
  static update(id, userData) {
    const fields = [];
    const values = [];
    
    Object.keys(userData).forEach(key => {
      if (userData[key] !== undefined && key !== 'id' && key !== 'password') {
        fields.push(`${key} = ?`);
        values.push(userData[key]);
      }
    });
    
    if (fields.length === 0) return this.findById(id);
    
    values.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  // 更新密码
  static updatePassword(id, newPassword) {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, id);
    return true;
  }
}

module.exports = User;
