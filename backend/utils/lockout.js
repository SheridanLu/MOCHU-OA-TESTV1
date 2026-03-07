/**
 * 登录失败锁定机制工具类
 * 连续失败5次锁定账户30分钟
 */

const { db } = require('../models/database');

const MAX_ATTEMPTS = 5;        // 最大尝试次数
const LOCKOUT_DURATION = 30 * 60 * 1000; // 锁定时长：30分钟（毫秒）

/**
 * 获取用户的登录失败记录
 * @param {number} userId - 用户ID
 * @returns {object|null} 登录失败记录
 */
function getLoginAttempt(userId) {
  const stmt = db.prepare('SELECT * FROM login_attempts WHERE user_id = ?');
  return stmt.get(userId);
}

/**
 * 获取用户ID（根据用户名）
 * @param {string} username - 用户名
 * @returns {number|null} 用户ID
 */
function getUserIdByUsername(username) {
  const stmt = db.prepare('SELECT id FROM users WHERE username = ?');
  const user = stmt.get(username);
  return user ? user.id : null;
}

/**
 * 检查账户是否被锁定
 * @param {number} userId - 用户ID
 * @returns {object} { isLocked: boolean, lockTimeRemaining: number, message: string }
 */
function checkAccountLockout(userId) {
  const attempt = getLoginAttempt(userId);
  
  if (!attempt || !attempt.locked_until) {
    return { isLocked: false, lockTimeRemaining: 0, message: '' };
  }
  
  const lockedUntil = new Date(attempt.locked_until).getTime();
  const now = Date.now();
  const lockTimeRemaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000)); // 剩余秒数
  
  if (now < lockedUntil) {
    const minutes = Math.ceil(lockTimeRemaining / 60);
    return {
      isLocked: true,
      lockTimeRemaining,
      message: `账户已锁定，请${minutes}分钟后重试`,
      lockTime: lockTimeRemaining
    };
  }
  
  // 锁定已过期，清除锁定状态
  clearLockout(userId);
  return { isLocked: false, lockTimeRemaining: 0, message: '' };
}

/**
 * 记录登录失败
 * @param {number} userId - 用户ID
 * @returns {object} { attemptCount: number, isLocked: boolean, message: string }
 */
function recordFailedAttempt(userId) {
  const attempt = getLoginAttempt(userId);
  const now = new Date();
  
  if (!attempt) {
    // 首次失败
    const stmt = db.prepare(`
      INSERT INTO login_attempts (user_id, attempt_count, last_attempt)
      VALUES (?, 1, ?)
    `);
    stmt.run(userId, now.toISOString());
    
    return {
      attemptCount: 1,
      isLocked: false,
      message: `密码错误，还剩${MAX_ATTEMPTS - 1}次尝试机会`
    };
  }
  
  // 检查是否已锁定
  if (attempt.locked_until) {
    const lockedUntil = new Date(attempt.locked_until).getTime();
    if (Date.now() < lockedUntil) {
      const minutes = Math.ceil((lockedUntil - Date.now()) / 60000);
      return {
        attemptCount: attempt.attempt_count,
        isLocked: true,
        message: `账户已锁定，请${minutes}分钟后重试`,
        lockTime: Math.ceil((lockedUntil - Date.now()) / 1000)
      };
    }
  }
  
  const newAttemptCount = attempt.attempt_count + 1;
  
  if (newAttemptCount >= MAX_ATTEMPTS) {
    // 达到最大尝试次数，锁定账户
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
    const stmt = db.prepare(`
      UPDATE login_attempts 
      SET attempt_count = ?, locked_until = ?, last_attempt = ?
      WHERE user_id = ?
    `);
    stmt.run(newAttemptCount, lockedUntil.toISOString(), now.toISOString(), userId);
    
    return {
      attemptCount: newAttemptCount,
      isLocked: true,
      message: '密码错误次数过多，账户已锁定30分钟',
      lockTime: LOCKOUT_DURATION / 1000
    };
  }
  
  // 更新失败次数
  const stmt = db.prepare(`
    UPDATE login_attempts 
    SET attempt_count = ?, last_attempt = ?
    WHERE user_id = ?
  `);
  stmt.run(newAttemptCount, now.toISOString(), userId);
  
  return {
    attemptCount: newAttemptCount,
    isLocked: false,
    message: `密码错误，还剩${MAX_ATTEMPTS - newAttemptCount}次尝试机会`
  };
}

/**
 * 清除登录失败记录（登录成功时调用）
 * @param {number} userId - 用户ID
 */
function clearLockout(userId) {
  const stmt = db.prepare('DELETE FROM login_attempts WHERE user_id = ?');
  stmt.run(userId);
}

/**
 * 获取剩余尝试次数
 * @param {number} userId - 用户ID
 * @returns {number} 剩余尝试次数
 */
function getRemainingAttempts(userId) {
  const attempt = getLoginAttempt(userId);
  if (!attempt || attempt.locked_until) {
    return MAX_ATTEMPTS;
  }
  return Math.max(0, MAX_ATTEMPTS - attempt.attempt_count);
}

module.exports = {
  MAX_ATTEMPTS,
  LOCKOUT_DURATION,
  getLoginAttempt,
  getUserIdByUsername,
  checkAccountLockout,
  recordFailedAttempt,
  clearLockout,
  getRemainingAttempts
};
