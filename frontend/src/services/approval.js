/**
 * 审批服务
 * 处理项目立项审批相关的 API 调用
 */

import api from './api';

/**
 * 提交项目审批
 * @param {number} projectId - 项目ID
 * @returns {Promise}
 */
export function submitApproval(projectId) {
  return api.post(`/approval/project/${projectId}/submit`);
}

/**
 * 审批通过
 * @param {number} projectId - 项目ID
 * @param {string} comment - 审批意见
 * @returns {Promise}
 */
export function approveProject(projectId, comment = '') {
  return api.post(`/approval/project/${projectId}/approve`, { comment });
}

/**
 * 审批拒绝
 * @param {number} projectId - 项目ID
 * @param {string} comment - 拒绝原因
 * @returns {Promise}
 */
export function rejectProject(projectId, comment) {
  return api.post(`/approval/project/${projectId}/reject`, { comment });
}

/**
 * 获取审批历史
 * @param {number} projectId - 项目ID
 * @returns {Promise}
 */
export function getApprovalHistory(projectId) {
  return api.get(`/approval/project/${projectId}/history`);
}

/**
 * 获取项目审批详情
 * @param {number} projectId - 项目ID
 * @returns {Promise}
 */
export function getProjectApproval(projectId) {
  return api.get(`/approval/project/${projectId}`);
}

/**
 * 获取待审批列表
 * @param {Object} params - 分页参数
 * @returns {Promise}
 */
export function getPendingApprovals(params = {}) {
  return api.get('/approval/pending', { params });
}

/**
 * 获取我提交的审批列表
 * @param {Object} params - 分页参数
 * @returns {Promise}
 */
export function getMySubmissions(params = {}) {
  return api.get('/approval/my-submissions', { params });
}

/**
 * 获取我已审批的列表
 * @param {Object} params - 分页参数
 * @returns {Promise}
 */
export function getMyApproved(params = {}) {
  return api.get('/approval/my-approved', { params });
}

export default {
  submitApproval,
  approveProject,
  rejectProject,
  getApprovalHistory,
  getProjectApproval,
  getPendingApprovals,
  getMySubmissions,
  getMyApproved
};
