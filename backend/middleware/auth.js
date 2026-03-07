/**
 * JWT 认证中间件
 * 提供 Token 生成、验证和刷新功能
 */

const jwt = require('jsonwebtoken');

// 从环境变量获取 JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';
// Token 有效期（2小时）
const TOKEN_EXPIRES_IN = '2h';

/**
 * 生成 JWT Token
 * @param {Object} payload - 用户信息 { userId, username, role }
 * @returns {string} JWT Token
 */
function generateToken(payload) {
  return jwt.sign(
    {
      userId: payload.userId,
      username: payload.username,
      role: payload.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

/**
 * 验证 JWT Token
 * @param {string} token - JWT Token
 * @returns {Object|null} 解码后的用户信息，验证失败返回 null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * JWT 认证中间件
 * 从 Authorization header 获取 token，验证并挂载用户信息到 req.user
 */
function authMiddleware(req, res, next) {
  // 从 header 获取 Authorization
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌，请先登录'
    });
  }

  // 检查 Bearer 格式
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      message: '令牌格式错误，请使用 Bearer <token> 格式'
    });
  }

  const token = parts[1];

  // 验证 token
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: '令牌无效或已过期，请重新登录'
    });
  }

  // 将用户信息挂载到 req.user（注意：这里使用 id 而不是 userId）
  req.user = {
    id: decoded.userId,
    userId: decoded.userId,
    username: decoded.username,
    role: decoded.role
  };

  next();
}

/**
 * 可选认证中间件
 * 如果提供了 token 则验证，没有提供也继续执行（用于某些可选认证的场景）
 */
function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    req.user = null;
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    req.user = null;
    return next();
  }

  const token = parts[1];
  const decoded = verifyToken(token);
  
  if (decoded) {
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role
    };
  } else {
    req.user = null;
  }

  next();
}

/**
 * 角色权限检查中间件
 * @param {string[]} allowedRoles - 允许访问的角色列表
 */
function checkRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '未认证，请先登录'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: '权限不足，无法访问此资源'
      });
    }

    next();
  };
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  optionalAuthMiddleware,
  checkRole,
  TOKEN_EXPIRES_IN
};
