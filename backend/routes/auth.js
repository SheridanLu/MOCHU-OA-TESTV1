const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { 
  initLoginAttemptsTable, 
  initSmsCodesTable, 
  LoginAttempt, 
  SmsCode 
} = require('../models/Auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = '24h';

// 初始化认证相关表
initLoginAttemptsTable();
initSmsCodesTable();

/**
 * POST /api/auth/check-user
 * 检查用户是否存在（第一阶段登录验证）
 * 请求体: { account }
 * 响应: { success: true, user: { username, phone, ... } } 或 { success: false, message }
 */
router.post('/check-user', (req, res) => {
  const { account } = req.body;

  if (!account) {
    return res.status(400).json({
      success: false,
      message: '请输入账号'
    });
  }

  const trimmedAccount = account.trim();

  // 支持用户名或手机号查询
  let user = User.findByUsername(trimmedAccount);
  if (!user) {
    user = User.findByPhone(trimmedAccount);
  }

  if (!user) {
    return res.status(404).json({
      success: false,
      message: '账号不存在'
    });
  }

  // 检查用户状态
  if (user.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: '账号已被禁用，请联系管理员'
    });
  }

  // 返回用户基本信息（不包含密码）
  const { password: _, ...userWithoutPassword } = user;

  res.json({
    success: true,
    user: userWithoutPassword
  });
});

// 生成 JWT Token
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      phone: user.phone 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * POST /api/auth/login-password
 * 密码登录
 * 请求体: { account, password }
 * 响应: { success: true, token, user } 或 { success: false, message, lockTime }
 */
router.post('/login-password', (req, res) => {
  const { account, password } = req.body;

  if (!account || !password) {
    return res.status(400).json({
      success: false,
      message: '请输入账号和密码'
    });
  }

  const ipAddress = req.ip || req.connection.remoteAddress;

  // 检查是否被锁定
  const lockStatus = LoginAttempt.isLocked(account);
  if (lockStatus.locked) {
    return res.status(429).json({
      success: false,
      message: `账号已被锁定，请在 ${lockStatus.remainingMinutes} 分钟后重试`,
      lockTime: lockStatus.remainingMinutes
    });
  }

  // 查找用户（支持用户名或手机号登录）
  let user = User.findByUsername(account);
  if (!user) {
    user = User.findByPhone(account);
  }

  // 用户不存在或密码错误
  if (!user || !User.verifyPassword(user, password)) {
    LoginAttempt.recordAttempt(account, 'password', ipAddress, false, user ? user.id : null);
    
    const failedCount = LoginAttempt.getRecentFailedCount(account);
    const remainingAttempts = 5 - failedCount;

    if (remainingAttempts <= 0) {
      return res.status(429).json({
        success: false,
        message: '密码错误次数过多，账号已被锁定30分钟',
        lockTime: 30
      });
    }

    return res.status(401).json({
      success: false,
      message: `账号或密码错误，还剩 ${remainingAttempts} 次尝试机会`
    });
  }

  // 检查用户状态
  if (user.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: '账号已被禁用，请联系管理员'
    });
  }

  // 登录成功
  LoginAttempt.clearAttempts(account);
  LoginAttempt.recordAttempt(account, 'password', ipAddress, true, user.id);
  User.updateLoginTime(user.id);

  const token = generateToken(user);
  const { password: _, ...userWithoutPassword } = user;

  res.json({
    success: true,
    token,
    user: userWithoutPassword
  });
});

/**
 * POST /api/auth/send-sms
 * 发送短信验证码
 * 请求体: { phone }
 * 响应: { success: true } 或 { success: false, message, waitTime }
 */
router.post('/send-sms', (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: '请输入手机号'
    });
  }

  // 验证手机号格式
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: '请输入正确的手机号'
    });
  }

  // 检查手机号是否已注册
  const user = User.findByPhone(phone);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '该手机号未注册'
    });
  }

  // 检查用户状态
  if (user.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: '账号已被禁用，请联系管理员'
    });
  }

  // 发送验证码
  const result = SmsCode.createCode(phone);
  
  if (!result.success) {
    return res.status(429).json({
      success: false,
      message: `请等待 ${result.waitTime} 秒后再试`,
      waitTime: result.waitTime
    });
  }

  // 在实际生产环境中，这里应该调用短信服务发送验证码
  // 目前仅在开发模式下返回验证码（方便测试）
  console.log(`[短信验证码] 手机号: ${phone}, 验证码: ${result.code}`);

  res.json({
    success: true,
    message: '验证码已发送',
    // 开发模式下返回验证码，生产环境应删除此字段
    _devCode: process.env.NODE_ENV === 'development' ? result.code : undefined
  });
});

/**
 * POST /api/auth/login-sms
 * 短信验证码登录
 * 请求体: { phone, code }
 * 响应: { success: true, token, user } 或 { success: false, message }
 */
router.post('/login-sms', (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({
      success: false,
      message: '请输入手机号和验证码'
    });
  }

  // 验证手机号格式
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: '请输入正确的手机号'
    });
  }

  // 验证验证码
  const verifyResult = SmsCode.verifyCode(phone, code);
  if (!verifyResult.valid) {
    return res.status(401).json({
      success: false,
      message: verifyResult.message
    });
  }

  // 查找用户
  const user = User.findByPhone(phone);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '该手机号未注册'
    });
  }

  // 检查用户状态
  if (user.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: '账号已被禁用，请联系管理员'
    });
  }

  // 登录成功
  const ipAddress = req.ip || req.connection.remoteAddress;
  LoginAttempt.recordAttempt(phone, 'sms', ipAddress, true);
  User.updateLoginTime(user.id);

  const token = generateToken(user);
  const { password: _, ...userWithoutPassword } = user;

  res.json({
    success: true,
    token,
    user: userWithoutPassword
  });
});

/**
 * GET /api/auth/verify
 * 验证 Token 是否有效
 */
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '令牌无效或已过期'
    });
  }
});

/**
 * POST /api/auth/logout
 * 登出（客户端清除 token 即可）
 */
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: '登出成功'
  });
});

/**
 * GET /api/auth/permissions
 * 获取当前用户的权限列表
 * 需要认证
 */
router.get('/permissions', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 使用权限中间件的函数获取权限
    const { getUserPermissions, getUserRoles } = require('../middleware/permission');
    const permissions = getUserPermissions(user.id);
    const roles = getUserRoles(user.id);

    res.json({
      success: true,
      permissions,
      roles: roles.map(r => ({ id: r.id, code: r.code, name: r.name }))
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '令牌无效或已过期'
    });
  }
});

module.exports = router;
