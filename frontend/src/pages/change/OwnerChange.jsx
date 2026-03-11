/**
 * 甲方需求变更管理页面
 * Task 53: 变更管理 - 甲方需求变更
 * 
 * 功能：
 * 1. 甲方需求变更列表
 * 2. 新建变更（变更内容、原因、影响评估）
 * 3. 审批功能
 */

import { useState, useEffect } from 'react';
import './ChangeCommon.css';

// API 基础路径
const API_BASE = window.location.origin + '/api';

// 状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: '#faad14', bgColor: '#fffbe6' },
  pm_approved: { text: '项目经理已审', color: '#1890ff', bgColor: '#e6f7ff' },
  finance_approved: { text: '财务已审', color: '#722ed1', bgColor: '#f9f0ff' },
  approved: { text: '审批通过', color: '#52c41a', bgColor: '#f6ffed' },
  rejected: { text: '已拒绝', color: '#ff4d4f', bgColor: '#fff2f0' },
  cancelled: { text: '已取消', color: '#8c8c8c', bgColor: '#f5f5f5' }
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

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
}

// 格式化天数
function formatDays(days) {
  if (!days && days !== 0) return '-';
  return `${days} 天`;
}

// 甲方需求变更列表组件
function OwnerList({ onView, onCreate, onRefresh, userRoles = [] }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  const [stats, setStats] = useState({});

  // 获取统计数据
  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/changes/owner/stats`, {
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

      const res = await fetch(`${API_BASE}/changes/owner?${params}`, {
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
  }, [pagination.page, filters.status]);

  // 删除
  const handleDelete = async (item) => {
    if (!window.confirm(`确定要删除变更 ${item.change_no} 吗？`)) return;

    try {
      const res = await fetch(`${API_BASE}/changes/owner/${item.id}`, {
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
      alert('删除失败: ' + error.message);
    }
  };

  return (
    <div className="change-list">
      {/* 统计卡片 */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.total || 0}</div>
          <div className="stat-label">总变更数</div>
        </div>
        <div className="stat-card warning">
          <div className="stat-value">{stats.pending_count || 0}</div>
          <div className="stat-label">待审批</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">{stats.approved_count || 0}</div>
          <div className="stat-label">已通过</div>
        </div>
        <div className="stat-card error">
          <div className="stat-value">{stats.rejected_count || 0}</div>
          <div className="stat-label">已拒绝</div>
        </div>
        <div className="stat-card info">
          <div className="stat-value">{formatAmount(stats.total_cost_impact)}</div>
          <div className="stat-label">已通过成本影响</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="list-header">
        <div className="filters">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>{val.text}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索编号/内容/项目"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && fetchList()}
          />
          <button onClick={fetchList}>搜索</button>
        </div>
        <button className="btn-primary" onClick={onCreate}>+ 新建甲方需求变更</button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>变更编号</th>
                <th>关联项目</th>
                <th>变更内容</th>
                <th>成本影响</th>
                <th>工期影响</th>
                <th>状态</th>
                <th>申请人</th>
                <th>申请时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-row">暂无数据</td>
                </tr>
              ) : (
                list.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="link-text" onClick={() => onView(item)}>
                        {item.change_no}
                      </span>
                    </td>
                    <td title={item.project_name}>{item.project_name || '-'}</td>
                    <td title={item.change_content}>
                      {item.change_content?.length > 30 
                        ? item.change_content.substring(0, 30) + '...' 
                        : item.change_content || '-'}
                    </td>
                    <td className="amount-cell">{formatAmount(item.cost_impact)}</td>
                    <td>{formatDays(item.schedule_impact)}</td>
                    <td>
                      <span 
                        className="status-tag"
                        style={{ 
                          color: STATUS_MAP[item.status]?.color,
                          backgroundColor: STATUS_MAP[item.status]?.bgColor
                        }}
                      >
                        {item.status_text}
                      </span>
                    </td>
                    <td>{item.creator_name || '-'}</td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn-link" onClick={() => onView(item)}>查看</button>
                        {(item.status === 'pending' || item.status === 'rejected') && (
                          <button 
                            className="btn-link danger" 
                            onClick={() => handleDelete(item)}
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

          {/* 分页 */}
          <div className="pagination">
            <span>共 {pagination.total} 条</span>
            <button
              disabled={pagination.page <= 1}
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
        </>
      )}
    </div>
  );
}

// 新建变更弹窗组件
function CreateModal({ onClose, onSuccess, editItem = null }) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [formData, setFormData] = useState({
    project_id: editItem?.project_id || '',
    change_content: editItem?.change_content || '',
    reason: editItem?.reason || '',
    impact_assessment: editItem?.impact_assessment || '',
    cost_impact: editItem?.cost_impact || '',
    schedule_impact: editItem?.schedule_impact || '',
    remark: editItem?.remark || ''
  });

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

  // 提交
  const handleSubmit = async () => {
    // 验证
    if (!formData.project_id) {
      alert('请选择关联项目');
      return;
    }
    if (!formData.change_content.trim()) {
      alert('请填写变更内容');
      return;
    }
    if (!formData.reason.trim()) {
      alert('请填写变更原因');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/owner`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...formData,
          cost_impact: formData.cost_impact ? parseFloat(formData.cost_impact) : 0,
          schedule_impact: formData.schedule_impact ? parseInt(formData.schedule_impact) : 0
        })
      });
      const data = await res.json();

      if (data.success) {
        alert('甲方需求变更创建成功');
        onSuccess && onSuccess();
        onClose();
      } else {
        alert(data.message || '创建失败');
      }
    } catch (error) {
      alert('创建失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 判断是否需要财务审批
  const needsFinanceApproval = formData.cost_impact && parseFloat(formData.cost_impact) > 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content create-modal">
        <div className="modal-header">
          <h3>{editItem ? '编辑甲方需求变更' : '新建甲方需求变更'}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
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
                <option key={p.id} value={p.id}>
                  {p.project_no} - {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>变更内容 <span className="required">*</span></label>
            <textarea
              value={formData.change_content}
              onChange={(e) => setFormData({ ...formData, change_content: e.target.value })}
              placeholder="请详细描述变更内容"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>变更原因 <span className="required">*</span></label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="请说明变更原因"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>影响评估</label>
            <textarea
              value={formData.impact_assessment}
              onChange={(e) => setFormData({ ...formData, impact_assessment: e.target.value })}
              placeholder="请评估变更对项目的影响（技术、质量、安全等方面）"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>成本影响 (元)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost_impact}
                onChange={(e) => setFormData({ ...formData, cost_impact: e.target.value })}
                placeholder="0.00"
              />
              <div className="form-tip">成本增加需财务确认</div>
            </div>

            <div className="form-group">
              <label>工期影响 (天)</label>
              <input
                type="number"
                min="0"
                value={formData.schedule_impact}
                onChange={(e) => setFormData({ ...formData, schedule_impact: e.target.value })}
                placeholder="0"
              />
              <div className="form-tip">预计增加的天数</div>
            </div>
          </div>

          <div className="form-group">
            <label>备注</label>
            <textarea
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              placeholder="选填"
              rows={2}
            />
          </div>

          <div className="form-tip">
            <strong>审批流程：</strong>
            {needsFinanceApproval 
              ? '项目经理 → 财务（成本确认） → 总经理' 
              : '项目经理 → 总经理'}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button 
            className="btn-primary" 
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '提交中...' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 详情弹窗组件
function DetailModal({ item, onClose, onRefresh, userRoles = [] }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  // 获取详情
  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`${API_BASE}/changes/owner/${item.id}`, {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.success) {
          setDetail(data.data);
        }
      } catch (error) {
        console.error('获取详情失败:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [item.id]);

  // 审批通过
  const handleApprove = async () => {
    if (!window.confirm('确定要通过此变更申请吗？')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/owner/${item.id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({})
      });
      const data = await res.json();

      if (data.success) {
        alert('审批通过');
        onRefresh && onRefresh();
        onClose();
      } else {
        alert(data.message || '审批失败');
      }
    } catch (error) {
      alert('审批失败: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 审批拒绝
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert('请填写拒绝原因');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/owner/${item.id}/reject`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ comment: rejectReason })
      });
      const data = await res.json();

      if (data.success) {
        alert('已拒绝');
        onRefresh && onRefresh();
        onClose();
      } else {
        alert(data.message || '操作失败');
      }
    } catch (error) {
      alert('操作失败: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 判断是否可以审批
  const canApprove = () => {
    if (!detail) return false;
    if (detail.status === 'approved' || detail.status === 'rejected') return false;
    
    // 根据当前状态和角色判断
    if (detail.status === 'pending' && userRoles.includes('PM')) return true;
    if (detail.status === 'pm_approved' && userRoles.includes('FINANCE')) return true;
    if (detail.status === 'finance_approved' && userRoles.includes('GM')) return true;
    
    // GM 可以审批所有步骤
    if (userRoles.includes('GM') && ['pending', 'pm_approved', 'finance_approved'].includes(detail.status)) {
      return true;
    }
    
    return false;
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content detail-modal">
          <div className="loading">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content detail-modal">
        <div className="modal-header">
          <h3>甲方需求变更详情</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {/* 基本信息 */}
          <div className="detail-section">
            <h4>基本信息</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="label">变更编号：</span>
                <span className="value">{detail.change_no}</span>
              </div>
              <div className="detail-item">
                <span className="label">状态：</span>
                <span 
                  className="status-tag"
                  style={{ 
                    color: STATUS_MAP[detail.status]?.color,
                    backgroundColor: STATUS_MAP[detail.status]?.bgColor
                  }}
                >
                  {detail.status_text}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">关联项目：</span>
                <span className="value">{detail.project_name || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="label">项目编号：</span>
                <span className="value">{detail.project_no || '-'}</span>
              </div>
              <div className="detail-item full-width">
                <span className="label">变更内容：</span>
                <span className="value">{detail.change_content}</span>
              </div>
              <div className="detail-item full-width">
                <span className="label">变更原因：</span>
                <span className="value">{detail.reason}</span>
              </div>
              {detail.impact_assessment && (
                <div className="detail-item full-width">
                  <span className="label">影响评估：</span>
                  <span className="value">{detail.impact_assessment}</span>
                </div>
              )}
            </div>
          </div>

          {/* 影响评估 */}
          <div className="detail-section">
            <h4>影响评估</h4>
            <div className="impact-cards">
              <div className="impact-card">
                <div className="impact-label">成本影响</div>
                <div className="impact-value">{formatAmount(detail.cost_impact)}</div>
              </div>
              <div className="impact-card">
                <div className="impact-label">工期影响</div>
                <div className="impact-value">{formatDays(detail.schedule_impact)}</div>
              </div>
            </div>
          </div>

          {/* 其他信息 */}
          <div className="detail-section">
            <h4>其他信息</h4>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="label">申请人：</span>
                <span className="value">{detail.creator_name || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="label">申请时间：</span>
                <span className="value">{formatDate(detail.created_at)}</span>
              </div>
              {detail.approver_name && (
                <div className="detail-item">
                  <span className="label">审批人：</span>
                  <span className="value">{detail.approver_name}</span>
                </div>
              )}
              {detail.approved_at && (
                <div className="detail-item">
                  <span className="label">审批时间：</span>
                  <span className="value">{formatDate(detail.approved_at)}</span>
                </div>
              )}
              {detail.remark && (
                <div className="detail-item full-width">
                  <span className="label">备注：</span>
                  <span className="value">{detail.remark}</span>
                </div>
              )}
            </div>
          </div>

          {/* 审批记录 */}
          {detail.approval_records && detail.approval_records.length > 0 && (
            <div className="detail-section">
              <h4>审批记录</h4>
              <div className="approval-timeline">
                {detail.approval_records.map((record, index) => (
                  <div key={record.id} className={`timeline-item ${record.action}`}>
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <span className="step-name">{record.step_name}</span>
                        <span className={`action-tag ${record.action}`}>
                          {record.action === 'pending' ? '待审批' : 
                           record.action === 'approve' ? '已通过' : '已拒绝'}
                        </span>
                      </div>
                      {record.approver_name && (
                        <div className="timeline-user">{record.approver_name}</div>
                      )}
                      {record.comment && (
                        <div className="timeline-comment">{record.comment}</div>
                      )}
                      {record.updated_at && (
                        <div className="timeline-time">{formatDate(record.updated_at)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 拒绝输入 */}
          {showReject && (
            <div className="reject-section">
              <h4>拒绝原因</h4>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请填写拒绝原因"
                rows={3}
              />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
          {canApprove() && !showReject && (
            <>
              <button 
                className="btn-danger" 
                onClick={() => setShowReject(true)}
                disabled={actionLoading}
              >
                拒绝
              </button>
              <button 
                className="btn-primary" 
                onClick={handleApprove}
                disabled={actionLoading}
              >
                {actionLoading ? '处理中...' : '通过'}
              </button>
            </>
          )}
          {showReject && (
            <>
              <button 
                className="btn-secondary" 
                onClick={() => { setShowReject(false); setRejectReason(''); }}
              >
                取消
              </button>
              <button 
                className="btn-danger" 
                onClick={handleReject}
                disabled={actionLoading}
              >
                {actionLoading ? '处理中...' : '确认拒绝'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 主组件
function OwnerChange() {
  const [view, setView] = useState('list'); // list, create, detail
  const [selectedItem, setSelectedItem] = useState(null);
  const [userRoles, setUserRoles] = useState([]);

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

  const handleView = (item) => {
    setSelectedItem(item);
    setView('detail');
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setView('create');
  };

  const handleRefresh = () => {
    setView('list');
    setSelectedItem(null);
  };

  return (
    <div className="owner-change-page">
      <div className="page-header">
        <h2>甲方需求变更</h2>
        <div className="page-subtitle">管理甲方发起的需求变更，成本增加需财务确认，编号规则：JF + YYMMDD + 2位序号</div>
      </div>

      {view === 'list' && (
        <OwnerList
          onView={handleView}
          onCreate={handleCreate}
          onRefresh={handleRefresh}
          userRoles={userRoles}
        />
      )}

      {view === 'create' && (
        <CreateModal
          onClose={() => setView('list')}
          onSuccess={handleRefresh}
          editItem={selectedItem}
        />
      )}

      {view === 'detail' && selectedItem && (
        <DetailModal
          item={selectedItem}
          onClose={() => setView('list')}
          onRefresh={handleRefresh}
          userRoles={userRoles}
        />
      )}
    </div>
  );
}

export default OwnerChange;
