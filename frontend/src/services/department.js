/**
 * 部门服务
 * 处理部门的增删改查等操作
 */

const API_BASE = '/api/departments';

/**
 * 获取认证请求头
 */
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

/**
 * 获取部门树结构
 * @returns {Promise<object>} 部门树数据
 */
export async function getDepartmentTree() {
  const response = await fetch(`${API_BASE}/tree`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  return response.json();
}

/**
 * 获取所有部门（平铺列表）
 * @returns {Promise<object>} 部门列表
 */
export async function getAllDepartments() {
  const response = await fetch(API_BASE, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  return response.json();
}

/**
 * 获取单个部门详情
 * @param {number} id - 部门ID
 * @returns {Promise<object>} 部门详情
 */
export async function getDepartmentById(id) {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  return response.json();
}

/**
 * 创建部门
 * @param {object} data - 部门数据
 * @returns {Promise<object>} 创建结果
 */
export async function createDepartment(data) {
  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  
  return response.json();
}

/**
 * 更新部门
 * @param {number} id - 部门ID
 * @param {object} data - 部门数据
 * @returns {Promise<object>} 更新结果
 */
export async function updateDepartment(id, data) {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  
  return response.json();
}

/**
 * 删除部门
 * @param {number} id - 部门ID
 * @returns {Promise<object>} 删除结果
 */
export async function deleteDepartment(id) {
  const response = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  
  return response.json();
}

/**
 * 搜索部门
 * @param {string} keyword - 搜索关键词
 * @returns {Promise<object>} 搜索结果
 */
export async function searchDepartments(keyword) {
  const response = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });
  
  return response.json();
}

export default {
  getDepartmentTree,
  getAllDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  searchDepartments
};
