const { db } = require('./database');

// 登录失败记录表
function initLoginAttemptsTable() {
  // 先检查表是否存在
  const tableInfo = db.prepare("PRAGMA table_info(login_attempts)").all();
  
  if (tableInfo.length === 0) {
    // 表不存在，创建新表
    db.exec(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        account TEXT NOT NULL,
        attempt_count INTEGER DEFAULT 0,
        attempt_type TEXT NOT NULL DEFAULT 'password',
        ip_address TEXT,
        success INTEGER DEFAULT 0,
        locked_until DATETIME,
        last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } else {
    // 表存在，检查并添加缺失的字段
    const columnNames = tableInfo.map(col => col.name);
    
    // 需要确保的字段
    const requiredColumns = [
      { name: 'account', type: 'TEXT' },
      { name: 'attempt_type', type: "TEXT NOT NULL DEFAULT 'password'" },
      { name: 'ip_address', type: 'TEXT' },
      { name: 'success', type: 'INTEGER DEFAULT 0' },
      { name: 'created_at', type: "DATETIME DEFAULT CURRENT_TIMESTAMP" }
    ];
    
    requiredColumns.forEach(col => {
      if (!columnNames.includes(col.name)) {
        try {
          db.exec(`ALTER TABLE login_attempts ADD COLUMN ${col.name} ${col.type}`);
        } catch (e) {
          // 忽略错误
        }
      }
    });
  }
  
  // 创建索引
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_account_idx ON login_attempts(account, created_at)`);
  } catch (e) {
    // 忽略错误
  }
  
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id)`);
  } catch (e) {
    // 忽略错误
  }
}

// 短信验证码表
function initSmsCodesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    )
  `);
  
  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone, created_at)
  `);
}

class LoginAttempt {
  // 记录登录尝试
  static recordAttempt(account, attemptType, ipAddress, success, userId = null) {
    const stmt = db.prepare(`
      INSERT INTO login_attempts (user_id, account, attempt_count, attempt_type, ip_address, success, last_attempt)
      VALUES (?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(userId, account, attemptType, ipAddress || 'unknown', success ? 1 : 0);
  }

  // 获取最近失败的登录次数（30分钟内）
  static getRecentFailedCount(account) {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM login_attempts
      WHERE account = ? 
        AND success = 0 
        AND attempt_type = 'password'
        AND last_attempt > datetime('now', '-30 minutes')
    `).get(account);
    return result.count;
  }

  // 检查是否被锁定（5次失败后锁定30分钟）
  static isLocked(account) {
    const failedCount = this.getRecentFailedCount(account);
    if (failedCount >= 5) {
      // 获取第一次失败的时间，计算剩余锁定时间
      const firstFail = db.prepare(`
        SELECT last_attempt
        FROM login_attempts
        WHERE account = ? 
          AND success = 0 
          AND attempt_type = 'password'
          AND last_attempt > datetime('now', '-30 minutes')
        ORDER BY last_attempt ASC
        LIMIT 1
      `).get(account);
      
      if (firstFail) {
        const lockEndTime = new Date(firstFail.last_attempt);
        lockEndTime.setMinutes(lockEndTime.getMinutes() + 30);
        const now = new Date();
        const remainingMinutes = Math.ceil((lockEndTime - now) / 60000);
        
        if (remainingMinutes > 0) {
          return { locked: true, remainingMinutes };
        }
      }
    }
    return { locked: false };
  }

  // 清除登录失败记录（登录成功后）
  static clearAttempts(account) {
    db.prepare(`
      DELETE FROM login_attempts
      WHERE account = ? AND attempt_type = 'password'
    `).run(account);
  }
}

class SmsCode {
  // 生成6位验证码
  static generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 发送验证码（记录到数据库）
  static createCode(phone) {
    // 检查是否在60秒内已发送
    const recentCode = db.prepare(`
      SELECT created_at
      FROM sms_codes
      WHERE phone = ?
        AND created_at > datetime('now', '-60 seconds')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(phone);

    if (recentCode) {
      const sentTime = new Date(recentCode.created_at);
      const now = new Date();
      const waitSeconds = 60 - Math.floor((now - sentTime) / 1000);
      return { success: false, waitTime: waitSeconds };
    }

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期
    
    const stmt = db.prepare(`
      INSERT INTO sms_codes (phone, code, expires_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(phone, code, expiresAt.toISOString());

    return { success: true, code };
  }

  // 验证验证码
  static verifyCode(phone, code) {
    const record = db.prepare(`
      SELECT * FROM sms_codes
      WHERE phone = ?
        AND code = ?
        AND used = 0
        AND expires_at > datetime('now')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(phone, code);

    if (!record) {
      return { valid: false, message: '验证码无效或已过期' };
    }

    // 标记为已使用
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id);
    
    return { valid: true };
  }

  // 清理过期验证码
  static cleanExpiredCodes() {
    db.prepare("DELETE FROM sms_codes WHERE expires_at < datetime('now')").run();
  }
}

module.exports = {
  initLoginAttemptsTable,
  initSmsCodesTable,
  LoginAttempt,
  SmsCode
};
