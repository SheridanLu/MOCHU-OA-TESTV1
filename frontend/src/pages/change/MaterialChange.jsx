/**
 * 新增设备材料申请页面
 * Task 51: 变更管理 - 新增设备材料
 * 
 * 功能：
 * 1. 新增材料申请列表
 * 2. 新建申请
 * 3. 审批功能（审批通过后自动添加到材料价格信息库）
 */

import { useState, useEffect } from 'react';
import './ChangeCommon.css';

// API 基础路径
const API_BASE = '/api';

// 状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: '#faad14', bgColor: '#fffbe6' },
  approved: { text: '已通过', color: '#52c41a', bgColor: '#f6ffed' },
  rejected: { text: '已拒绝', color: '#ff4d4f', bgColor: '#fff2f0' }
};

// 获取请求头
function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 格式化金额
function formatAmount(amount) {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY'
  }).format(amount);
}

// 格式化日期时间
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN');
}

// 新增材料申请列表组件
function MaterialList({ onView, onCreate, onRefresh, userRoles = [] }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  const [stats, setStats] = useState({});

  // 获取统计数据
  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/changes/material/stats`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  };

  // 获取列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);

      const res = await fetch(`${API_BASE}/changes/material?${params}`, {
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setList(data.data);
        setPagination(prev => ({ ...prev, total: data.pagination.total }));
      }
    } catch (error) {
      console.error('获取列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    fetchStats();
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    if (onRefresh) {
      fetchList();
      fetchStats();
    }
  }, [onRefresh]);

  // 搜索
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchList();
    fetchStats();
  };

  // 删除申请
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条新增材料申请吗？')) return;

    try {
      const res = await fetch(`${API_BASE}/changes/material/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        alert('删除成功');
        fetchList();
        fetchStats();
      } else {
        alert(data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  return (
    <div className="material-change-container">
      {/* 统计卡片 */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.total || 0}</div>
          <div className="stat-label">总申请数</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{stats.statusStats?.pending || 0}</div>
          <div className="stat-label">待审批</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">{stats.statusStats?.approved || 0}</div>
          <div className="stat-label">已通过</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">{stats.statusStats?.rejected || 0}</div>
          <div className="stat-label">已拒绝</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="filter-bar">
        <div className="filter-item">
          <label>状态：</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">全部</option>
            <option value="pending">待审批</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
        <div className="filter-item">
          <label>关键词：</label>
          <input
            type="text"
            placeholder="材料名称/规格/申请编号"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button className="btn-primary" onClick={handleSearch}>
          搜索
        </button>
        <button className="btn-success" onClick={onCreate}>
          + 新增材料申请
        </button>
      </div>

      {/* 列表表格 */}
      <div className="table-container">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>申请编号</th>
                <th>材料名称</th>
                <th>规格型号</th>
                <th>单位</th>
                <th>预估单价</th>
                <th>申请原因</th>
                <th>关联项目</th>
                <th>申请人</th>
                <th>状态</th>
                <th>申请时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan="11" className="no-data">暂无数据</td>
                </tr>
              ) : (
                list.map(item => (
                  <tr key={item.id}>
                    <td>{item.change_no}</td>
                    <td>{item.material_name}</td>
                    <td>{item.specification || '-'}</td>
                    <td>{item.unit || '-'}</td>
                    <td>{formatAmount(item.estimated_price)}</td>
                    <td>
                      <div className="reason-cell" title={item.reason}>
                        {item.reason?.length > 20 ? item.reason.slice(0, 20) + '...' : item.reason}
                      </div>
                    </td>
                    <td>{item.project_name || '-'}</td>
                    <td>{item.creator_name || '-'}</td>
                    <td>
                      <span
                        className="status-tag"
                        style={{
                          backgroundColor: STATUS_MAP[item.status]?.bgColor,
                          color: STATUS_MAP[item.status]?.color
                        }}
                      >
                        {STATUS_MAP[item.status]?.text || item.status}
                      </span>
                    </td>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-link"
                          onClick={() => onView(item)}
                        >
                          查看
                        </button>
                        {item.status === 'pending' && (
                          <button
                            className="btn-link danger"
                            onClick={() => handleDelete(item.id)}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {pagination.total > 0 && (
        <div className="pagination">
          <span>共 {pagination.total} 条</span>
          <button
            disabled={pagination.page === 1}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            上一页
          </button>
          <span>第 {pagination.page} 页</span>
          <button
            disabled={pagination.page * pagination.pageSize >= pagination.total}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

// 新增材料申请表单组件
function MaterialForm({ material, projects, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    project_id: material?.project_id || '',
    material_name: material?.material_name || '',
    specification: material?.specification || '',
    unit: material?.unit || '',
    reason: material?.reason || '',
    estimated_price: material?.estimated_price || '',
    remark: material?.remark || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    // 验证
    if (!formData.project_id) {
      alert('请选择关联项目');
      return;
    }
    if (!formData.material_name.trim()) {
      alert('请填写材料名称');
      return;
    }
    if (!formData.reason.trim()) {
      alert('请填写申请原因');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/changes/material`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (data.success) {
        alert('新增材料申请创建成功');
        onSave();
      } else {
        alert(data.message || '创建失败');
      }
    } catch (error) {
      console.error('创建失败:', error);
      alert('创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content material-form-modal">
        <div className="modal-header">
          <h3>新增设备材料申请</h3>
          <button className="close-btn" onClick={onCancel}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>关联项目 <span className="required">*</span></label>
            <select
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
            >
              <option value="">请选择项目</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>材料名称 <span className="required">*</span></label>
            <input
              type="text"
              value={formData.material_name}
              onChange={(e) => setFormData({ ...formData, material_name: e.target.value })}
              placeholder="请输入材料名称"
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>规格型号</label>
              <input
                type="text"
                value={formData.specification}
                onChange={(e) => setFormData({ ...formData, specification: e.target.value })}
                placeholder="请输入规格型号"
              />
            </div>
            <div className="form-group">
              <label>单位</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="如：个、件、套等"
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>预估单价</label>
            <input
              type="number"
              step="0.01"
              value={formData.estimated_price}
              onChange={(e) => setFormData({ ...formData, estimated_price: e.target.value })}
              placeholder="请输入预估单价"
            />
          </div>
          
          <div className="form-group">
            <label>申请原因 <span className="required">*</span></label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="请说明为什么需要新增此材料（如：现有材料库中没有此材料）"
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>备注</label>
            <textarea
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              placeholder="其他补充说明"
              rows={2}
            />
          </div>
          
          <div className="form-tips">
            <p>💡 说明：</p>
            <ul>
              <li>新增材料需经过审批</li>
              <li>审批通过后，材料将自动添加到材料价格信息库</li>
              <li>申请编号规则：XZ + YYMMDD + 2位序号</li>
            </ul>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-default" onClick={onCancel}>取消</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? '提交中...' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 详情弹窗组件
function MaterialDetail({ material, onClose, onApprove, onReject, canApprove }) {
  const [showApproveForm, setShowApproveForm] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/changes/material/${material.id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ comment })
      });
      const data = await res.json();

      if (data.success) {
        alert('审批通过成功，材料已添加到材料价格信息库');
        onApprove();
      } else {
        alert(data.message || '审批失败');
      }
    } catch (error) {
      console.error('审批失败:', error);
      alert('审批失败');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      alert('请填写拒绝原因');
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/changes/material/${material.id}/reject`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reason: comment })
      });
      const data = await res.json();

      if (data.success) {
        alert('已拒绝');
        onReject();
      } else {
        alert(data.message || '操作失败');
      }
    } catch (error) {
      console.error('操作失败:', error);
      alert('操作失败');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content material-detail-modal">
        <div className="modal-header">
          <h3>新增材料申请详情</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* 基本信息 */}
          <div className="detail-section">
            <h4>基本信息</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <label>申请编号</label>
                <span>{material.change_no}</span>
              </div>
              <div className="detail-item">
                <label>申请状态</label>
                <span
                  className="status-tag"
                  style={{
                    backgroundColor: STATUS_MAP[material.status]?.bgColor,
                    color: STATUS_MAP[material.status]?.color
                  }}
                >
                  {STATUS_MAP[material.status]?.text || material.status}
                </span>
              </div>
              <div className="detail-item">
                <label>材料名称</label>
                <span>{material.material_name}</span>
              </div>
              <div className="detail-item">
                <label>规格型号</label>
                <span>{material.specification || '-'}</span>
              </div>
              <div className="detail-item">
                <label>单位</label>
                <span>{material.unit || '-'}</span>
              </div>
              <div className="detail-item">
                <label>预估单价</label>
                <span className="amount">{formatAmount(material.estimated_price)}</span>
              </div>
              <div className="detail-item">
                <label>关联项目</label>
                <span>{material.project_name || '-'}</span>
              </div>
              <div className="detail-item">
                <label>申请人</label>
                <span>{material.creator_name || '-'}</span>
              </div>
              <div className="detail-item full-width">
                <label>申请原因</label>
                <span>{material.reason || '-'}</span>
              </div>
              {material.remark && (
                <div className="detail-item full-width">
                  <label>备注</label>
                  <span>{material.remark}</span>
                </div>
              )}
            </div>
          </div>

          {/* 审批信息 */}
          {material.status !== 'pending' && (
            <div className="detail-section">
              <h4>审批信息</h4>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>审批人</label>
                  <span>{material.approver_name || '-'}</span>
                </div>
                <div className="detail-item">
                  <label>审批时间</label>
                  <span>{formatDateTime(material.approved_at)}</span>
                </div>
              </div>
            </div>
          )}

          {/* 审批记录 */}
          {material.approvals && material.approvals.length > 0 && (
            <div className="detail-section">
              <h4>审批记录</h4>
              <div className="approval-timeline">
                {material.approvals.map((approval, index) => (
                  <div key={index} className={`timeline-item ${approval.action}`}>
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="approver-name">{approval.approver_name || '系统'}</span>
                        <span className={`action-tag ${approval.action}`}>
                          {approval.action === 'approve' ? '通过' : '拒绝'}
                        </span>
                      </div>
                      {approval.comment && (
                        <div className="timeline-comment">{approval.comment}</div>
                      )}
                      <div className="timeline-time">{formatDateTime(approval.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 审批表单 */}
          {canApprove && material.status === 'pending' && !showApproveForm && !showRejectForm && (
            <div className="approval-actions">
              <button
                className="btn-success"
                onClick={() => setShowApproveForm(true)}
              >
                审批通过
              </button>
              <button
                className="btn-danger"
                onClick={() => setShowRejectForm(true)}
              >
                审批拒绝
              </button>
            </div>
          )}

          {/* 审批通过表单 */}
          {showApproveForm && (
            <div className="approval-form">
              <h4>审批通过</h4>
              <div className="form-group">
                <label>审批意见（可选）</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="请填写审批意见"
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button className="btn-default" onClick={() => setShowApproveForm(false)}>取消</button>
                <button
                  className="btn-success"
                  onClick={handleApprove}
                  disabled={processing}
                >
                  {processing ? '处理中...' : '确认通过'}
                </button>
              </div>
            </div>
          )}

          {/* 审批拒绝表单 */}
          {showRejectForm && (
            <div className="approval-form">
              <h4>审批拒绝</h4>
              <div className="form-group">
                <label>拒绝原因 <span className="required">*</span></label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="请填写拒绝原因"
                  rows={3}
                />
              </div>
              <div className="form-actions">
                <button className="btn-default" onClick={() => setShowRejectForm(false)}>取消</button>
                <button
                  className="btn-danger"
                  onClick={handleReject}
                  disabled={processing}
                >
                  {processing ? '处理中...' : '确认拒绝'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-default" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

// 主组件
export default function MaterialChange() {
  const [currentView, setCurrentView] = useState('list');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [projects, setProjects] = useState([]);
  const [userRoles, setUserRoles] = useState([]);

  // 获取项目列表
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`${API_BASE}/changes/projects`, {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.success) {
          setProjects(data.data);
        }
      } catch (error) {
        console.error('获取项目列表失败:', error);
      }
    };
    fetchProjects();
  }, []);

  // 获取用户角色
  useEffect(() => {
    const fetchUserRoles = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.success && data.user) {
          setUserRoles(data.user.roles || []);
        }
      } catch (error) {
        console.error('获取用户角色失败:', error);
      }
    };
    fetchUserRoles();
  }, []);

  // 获取材料详情
  const handleViewMaterial = async (material) => {
    try {
      const res = await fetch(`${API_BASE}/changes/material/${material.id}`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setSelectedMaterial(data.data);
        setCurrentView('detail');
      }
    } catch (error) {
      console.error('获取详情失败:', error);
    }
  };

  // 检查是否有审批权限
  const canApprove = userRoles.some(role => 
    ['admin', 'GM', 'FINANCE', 'PURCHASE'].includes(role)
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>新增设备材料申请</h2>
        <p>申请新增设备/材料型号，审批通过后自动添加到材料价格信息库</p>
      </div>

      {currentView === 'list' && (
        <MaterialList
          onView={handleViewMaterial}
          onCreate={() => setShowCreateForm(true)}
          onRefresh={refreshTrigger}
          userRoles={userRoles}
        />
      )}

      {/* 新增申请表单 */}
      {showCreateForm && (
        <MaterialForm
          projects={projects}
          onSave={() => {
            setShowCreateForm(false);
            setRefreshTrigger(prev => prev + 1);
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* 详情弹窗 */}
      {currentView === 'detail' && selectedMaterial && (
        <MaterialDetail
          material={selectedMaterial}
          onClose={() => {
            setCurrentView('list');
            setSelectedMaterial(null);
          }}
          onApprove={() => {
            setCurrentView('list');
            setSelectedMaterial(null);
            setRefreshTrigger(prev => prev + 1);
          }}
          onReject={() => {
            setCurrentView('list');
            setSelectedMaterial(null);
            setRefreshTrigger(prev => prev + 1);
          }}
          canApprove={canApprove}
        />
      )}
    </div>
  );
}
