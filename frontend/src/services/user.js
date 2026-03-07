/**
 * 用户服务
 * 处理用户的增删改查等操作
 */

import api from './api';

/**
 * 获取用户列表
 * @param {object} params - 查询参数
 * @param {number} params.department_id - 部门ID
 * @param {string} params.status - 状态筛选
 * @param {string} params.keyword - 搜索关键词
 * @returns {Promise<object>} 用户列表
 */
export async function getUsers(params = {}) {
  const queryParams = new URLSearchParams();
  
  if (params.department_id) {
    queryParams.append('department_id', params.department_id);
  }
  if (params.status && params.status !== 'all') {
    queryParams.append('status', params.status);
  }
  if (params.keyword) {
    queryParams.append('keyword', params.keyword);
  }

  const url = `/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const response = await api.get(url);
  
  return response.data;
}

/**
 * 获取单个用户详情
 * @param {number} id - 用户ID
 * @returns {Promise<object>} 用户详情
 */
export async function getUserById(id) {
  const response = await api.get(`/users/${id}`);
  return response.data;
}

/**
 * 创建用户
 * @param {object} data - 用户数据
 * @returns {Promise<object>} 创建结果
 */
export async function createUser(data) {
  const response = await api.post('/users', data);
  return response.data;
}

/**
 * 更新用户
 * @param {number} id - 用户ID
 * @param {object} data - 用户数据
 * @returns {Promise<object>} 更新结果
 */
export async function updateUser(id, data) {
  const response = await api.put(`/users/${id}`, data);
  return response.data;
}

/**
 * 删除用户（软删除）
 * @param {number} id - 用户ID
 * @returns {Promise<object>} 删除结果
 */
export async function deleteUser(id) {
  const response = await api.delete(`/users/${id}`);
  return response.data;
}

/**
 * 批量更新用户状态
 * @param {number[]} ids - 用户ID数组
 * @param {string} status - 状态 ('active' | 'disabled')
 * @returns {Promise<object>} 更新结果
 */
export async function batchUpdateStatus(ids, status) {
  const response = await api.put('/users/batch-status', { ids, status });
  return response.data;
}

/**
 * 检查用户名是否可用
 * @param {string} username - 用户名
 * @param {number} excludeId - 排除的用户ID（用于编辑时）
 * @returns {Promise<object>} 检查结果
 */
export async function checkUsername(username, excludeId = null) {
  const params = new URLSearchParams();
  params.append('username', username);
  if (excludeId) {
    params.append('excludeId', excludeId);
  }
  
  const response = await api.get(`/users/check-username?${params.toString()}`);
  return response.data;
}

export default {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  batchUpdateStatus,
  checkUsername
};
