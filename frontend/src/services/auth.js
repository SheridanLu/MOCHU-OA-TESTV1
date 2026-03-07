/**
 * 认证服务
 * 处理登录、登出、Token 管理等
 */

const API_BASE = '/api/auth';

/**
 * 登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<object>} 登录结果
 */
export async function login(username, password) {
  const response = await fetch(`${API_BASE}/login-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  
  return response.json();
}

/**
 * 登出
 */
export async function logout() {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST'
    });
  } catch (error) {
    console.error('登出请求失败:', error);
  }
  
  // 清除本地存储
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/**
 * 获取当前用户信息
 * @returns {object|null} 用户信息
 */
export function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 获取 Token
 * @returns {string|null} JWT Token
 */
export function getToken() {
  return localStorage.getItem('token');
}

/**
 * 检查是否已登录
 * @returns {boolean}
 */
export function isAuthenticated() {
  return !!getToken();
}

/**
 * 检查账户锁定状态
 * @param {string} username - 用户名
 * @returns {Promise<object>} 锁定状态
 */
export async function checkLockoutStatus(username) {
  try {
    const response = await fetch(`${API_BASE}/lockout-status/${encodeURIComponent(username)}`);
    return response.json();
  } catch (error) {
    console.error('检查锁定状态失败:', error);
    return { isLocked: false, remainingAttempts: 5 };
  }
}

/**
 * 获取请求头（带认证）
 * @returns {object} 请求头
 */
export function getAuthHeaders() {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

export default {
  login,
  logout,
  getCurrentUser,
  getToken,
  isAuthenticated,
  checkLockoutStatus,
  getAuthHeaders
};
