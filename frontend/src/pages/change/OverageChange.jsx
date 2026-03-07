/**
 * 超量采购变更申请页面
 * Task 50: 变更管理 - 超量采购申请
 * 
 * 功能：
 * 1. 超量采购申请列表
 * 2. 新建申请
 * 3. 审批功能
 */

import { useState, useEffect } from 'react';
import './OverageChange.css';

// API 基础路径
const API_BASE = '/api';

// 状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: '#faad14', bgColor: '#fffbe6' },
  budget_approved: { text: '预算员已审', color: '#1890ff', bgColor: '#e6f7ff' },
  finance_approved: { text: '财务已审', color: '#722ed1', bgColor: '#f9f0ff' },
  approved: { text: '审批通过', color: '#52c41a', bgColor: '#f6ffed' },
  rejected: { text: '已拒绝', color: '#ff4d4f', bgColor: '#fff2f0' },
  cancelled: { text: '已取消', color: '#8c8c8c', bgColor: '#f5f5f5' }
};

// 超量类型映射
const OVERAGE_TYPE_MAP = {
  quantity: { text: '数量超量', icon: '📊' },
  amount: { text: '金额超量', icon: '💰' },
  price: { text: '价格超量', icon: '📈' },
  material: { text: '材料超量', icon: '📦' }
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

// 超量采购申请列表组件
function OverageList({ onView, onCreate, onRefresh, userRoles = [] }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  const [stats, setStats] = useState({});

  // 获取统计数据
  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/changes/overage/stats`, {
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

      const res = await fetch(`${API_BASE}/changes/overage?${params}`, {
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
    if (!window.confirm(`确定要删除变更申请 ${item.change_no} 吗？`)) return;

    try {
      const res = await fetch(`${API_BASE}/changes/overage/${item.id}`, {
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
    <div className="overage-list">
      {/* 统计卡片 */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{stats.total || 0}</div>
          <div className="stat-label">总申请数</div>
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
          <div className="stat-value">{formatAmount(stats.total_overage_amount)}</div>
          <div className="stat-label">已通过超量金额</div>
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
            placeholder="搜索编号/项目/合同"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && fetchList()}
          />
          <button onClick={fetchList}>搜索</button>
        </div>
        <button className="btn-primary" onClick={onCreate}>+ 新建超量采购申请</button>
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
                <th>关联合同</th>
                <th>超量类型</th>
                <th>超量金额</th>
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
                    <td title={item.contract_name}>{item.contract_name || '-'}</td>
                    <td>
                      <span className="overage-type-tag">
                        {OVERAGE_TYPE_MAP[item.overage_type]?.icon || '📋'} {item.overage_type_text}
                      </span>
                    </td>
                    <td className="amount-cell">{formatAmount(item.overage_amount)}</td>
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

// 新建申请弹窗组件
function CreateModal({ onClose, onSuccess, editItem = null }) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [formData, setFormData] = useState({
    project_id: editItem?.project_id || '',
    contract_id: editItem?.contract_id || '',
    overage_type: editItem?.overage_type || 'amount',
    overage_amount: editItem?.overage_amount || '',
    reason: editItem?.reason || '',
    remark: editItem?.remark || ''
  });

  // 获取项目列表
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`${API_BASE}/projects?pageSize=1000`, {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.success) {
          setProjects(data.data.filter(p => p.status === 'active' || p.status === 'approved'));
        }
      } catch (error) {
        console.error('获取项目列表失败:', error);
      }
    };
    fetchProjects();
  }, []);

  // 获取合同列表
  useEffect(() => {
    if (!formData.project_id) {
      setContracts([]);
      return;
    }

    const fetchContracts = async () => {
      try {
        const res = await fetch(`${API_BASE}/changes/overage/projects/${formData.project_id}/contracts`, {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.success) {
          setContracts(data.data);
        }
      } catch (error) {
        console.error('获取合同列表失败:', error);
      }
    };
    fetchContracts();
  }, [formData.project_id]);

  // 提交
  const handleSubmit = async () => {
    // 验证
    if (!formData.project_id) {
      alert('请选择关联项目');
      return;
    }
    if (!formData.contract_id) {
      alert('请选择关联合同');
      return;
    }
    if (!formData.overage_amount || formData.overage_amount <= 0) {
      alert('请填写有效的超量金额');
      return;
    }
    if (!formData.reason.trim()) {
      alert('请填写超量原因');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/overage`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (data.success) {
        alert('申请创建成功');
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

  return (
    <div className="modal-overlay">
      <div className="modal-content create-modal">
        <div className="modal-header">
          <h3>{editItem ? '编辑超量采购申请' : '新建超量采购申请'}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>关联项目 <span className="required">*</span></label>
            <select
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value, contract_id: '' })}
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
            <label>关联合同 <span className="required">*</span></label>
            <select
              value={formData.contract_id}
              onChange={(e) => setFormData({ ...formData, contract_id: e.target.value })}
              disabled={!formData.project_id}
            >
              <option value="">请选择合同</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.contract_no} - {c.name} ({formatAmount(c.amount)})
                </option>
              ))}
            </select>
            {formData.project_id && contracts.length === 0 && (
              <div className="form-tip">该项目下没有已审批的支出合同</div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>超量类型 <span className="required">*</span></label>
              <select
                value={formData.overage_type}
                onChange={(e) => setFormData({ ...formData, overage_type: e.target.value })}
              >
                {Object.entries(OVERAGE_TYPE_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.text}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>超量金额 (元) <span className="required">*</span></label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.overage_amount}
                onChange={(e) => setFormData({ ...formData, overage_amount: parseFloat(e.target.value) || '' })}
                placeholder="请输入超量金额"
              />
            </div>
          </div>

          <div className="form-group">
            <label>超量原因 <span className="required">*</span></label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="请详细说明超量原因"
              rows={3}
            />
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
            <strong>审批流程：</strong>预算员 → 财务 → 总经理
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
        const res = await fetch(`${API_BASE}/changes/overage/${item.id}`, {
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
      const res = await fetch(`${API_BASE}/changes/overage/${item.id}/approve`, {
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
      const res = await fetch(`${API_BASE}/changes/overage/${item.id}/reject`, {
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
    if (detail.status === 'pending' && userRoles.includes('BUDGET')) return true;
    if (detail.status === 'budget_approved' && userRoles.includes('FINANCE')) return true;
    if (detail.status === 'finance_approved' && userRoles.includes('GM')) return true;
    
    // GM 可以审批所有步骤
    if (userRoles.includes('GM') && ['pending', 'budget_approved', 'finance_approved'].includes(detail.status)) {
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
          <h3>超量采购变更详情</h3>
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
                <span className="label">关联合同：</span>
                <span className="value">{detail.contract_name || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="label">超量类型：</span>
                <span className="value">
                  {OVERAGE_TYPE_MAP[detail.overage_type]?.icon} {detail.overage_type_text}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">超量金额：</span>
                <span className="value amount">{formatAmount(detail.overage_amount)}</span>
              </div>
              <div className="detail-item full-width">
                <span className="label">超量原因：</span>
                <span className="value">{detail.reason}</span>
              </div>
              {detail.remark && (
                <div className="detail-item full-width">
                  <span className="label">备注：</span>
                  <span className="value">{detail.remark}</span>
                </div>
              )}
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
function OverageChange() {
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
    <div className="overage-change-page">
      <div className="page-header">
        <h2>超量采购变更申请</h2>
        <div className="page-subtitle">管理超量采购变更申请，审批流程：预算员 → 财务 → 总经理</div>
      </div>

      {view === 'list' && (
        <OverageList
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

export default OverageChange;
