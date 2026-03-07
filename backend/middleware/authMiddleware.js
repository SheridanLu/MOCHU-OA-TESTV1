const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

/**
 * 认证中间件
 * 验证 JWT Token 并将用户信息附加到 req.user
 */
function authMiddleware(req, res, next) {
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

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: '账号已被禁用'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '令牌已过期'
      });
    }
    return res.status(401).json({
      success: false,
      message: '令牌无效'
    });
  }
}

/**
 * 可选认证中间件
 * 如果有 token 则验证，没有则跳过
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = User.findById(decoded.id);
    req.user = user || null;
  } catch (error) {
    req.user = null;
  }
  
  next();
}

/**
 * 管理员权限中间件
 */
function adminMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: '未登录'
    });
  }

  // 检查是否是管理员（这里可以根据实际需求调整）
  // 目前简单检查用户名是否为 admin 或者是否有特定角色
  if (req.user.username !== 'admin' && req.user.position !== '管理员') {
    return res.status(403).json({
      success: false,
      message: '需要管理员权限'
    });
  }

  next();
}

module.exports = {
  authMiddleware,
  optionalAuth,
  adminMiddleware
};
