/**
 * 现场签证管理页面
 * 实现施工现场签证管理功能
 * 
 * Task 52: 变更管理 - 现场签证
 */

import { useState, useEffect } from 'react';
import './SiteVisa.css';

// API 基础路径
const API_BASE = '/api';

// 状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: '#faad14' },
  finance_approved: { text: '财务已审', color: '#1890ff' },
  approved: { text: '审批通过', color: '#52c41a' },
  rejected: { text: '已拒绝', color: '#ff4d4f' },
  cancelled: { text: '已取消', color: '#d9d9d9' }
};

// 获取请求头
function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 现场签证列表组件
function SiteVisaList({ onView, onCreate, onRefresh }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ project_id: '', status: '', keyword: '' });
  const [projects, setProjects] = useState([]);

  // 获取项目列表
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

  // 获取列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);

      const res = await fetch(`${API_BASE}/changes/visa?${params}`, {
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setList(data.data);
        setPagination(prev => ({ ...prev, total: data.pagination.total }));
      }
    } catch (error) {
      console.error('获取现场签证列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchList();
  }, [pagination.page, filters.project_id, filters.status]);

  // 删除
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条现场签证记录吗？')) return;

    try {
      const res = await fetch(`${API_BASE}/changes/visa/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        alert('删除成功');
        fetchList();
      } else {
        alert(data.message || '删除失败');
      }
    } catch (error) {
      alert('删除失败: ' + error.message);
    }
  };

  return (
    <div className="site-visa-list">
      <div className="list-header">
        <div className="filters">
          <select
            value={filters.project_id}
            onChange={(e) => setFilters({ ...filters, project_id: e.target.value })}
          >
            <option value="">全部项目</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
            placeholder="搜索签证编号/内容/项目"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && fetchList()}
          />
          <button onClick={fetchList}>搜索</button>
        </div>
        <button className="btn-primary" onClick={onCreate}>+ 新建现场签证</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>签证编号</th>
                <th>关联项目</th>
                <th>签证内容</th>
                <th>签证金额</th>
                <th>状态</th>
                <th>创建人</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-row">暂无数据</td>
                </tr>
              ) : list.map(item => (
                <tr key={item.id}>
                  <td>{item.visa_no}</td>
                  <td>{item.project_name || '-'}</td>
                  <td className="content-cell">
                    <span title={item.visa_content}>
                      {item.visa_content?.length > 30 
                        ? item.visa_content.substring(0, 30) + '...' 
                        : item.visa_content}
                    </span>
                  </td>
                  <td className="amount-cell">¥{(item.amount || 0).toLocaleString()}</td>
                  <td>
                    <span
                      className="status-tag"
                      style={{ backgroundColor: STATUS_MAP[item.status]?.color || '#8c8c8c' }}
                    >
                      {STATUS_MAP[item.status]?.text || item.status}
                    </span>
                  </td>
                  <td>{item.creator_name || '-'}</td>
                  <td>{item.created_at?.split('T')[0]}</td>
                  <td className="actions">
                    <button onClick={() => onView(item.id)}>查看</button>
                    {['pending', 'rejected'].includes(item.status) && (
                      <button className="btn-danger" onClick={() => handleDelete(item.id)}>删除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
            >
              上一页
            </button>
            <span>
              第 {pagination.page} 页 / 共 {Math.ceil(pagination.total / pagination.pageSize)} 页
              （共 {pagination.total} 条）
            </span>
            <button
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// 新建/编辑现场签证弹窗
function SiteVisaForm({ onClose, onSuccess, projects }) {
  const [formData, setFormData] = useState({
    project_id: '',
    visa_content: '',
    reason: '',
    amount: '',
    remark: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.project_id) {
      alert('请选择关联项目');
      return;
    }
    if (!formData.visa_content.trim()) {
      alert('请填写签证内容');
      return;
    }
    if (!formData.reason.trim()) {
      alert('请填写签证原因');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/visa`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          ...formData,
          amount: formData.amount ? parseFloat(formData.amount) : 0
        })
      });
      const data = await res.json();

      if (data.success) {
        alert('创建成功！签证编号：' + data.data.visa_no);
        onSuccess();
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
      <div className="modal-content visa-form-modal">
        <div className="modal-header">
          <h3>新建现场签证</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>关联项目 <span className="required">*</span></label>
            <select
              value={formData.project_id}
              onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
              required
            >
              <option value="">请选择项目</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>签证内容 <span className="required">*</span></label>
            <textarea
              value={formData.visa_content}
              onChange={(e) => setFormData({ ...formData, visa_content: e.target.value })}
              placeholder="请输入签证内容，详细描述现场变更的工作内容"
              rows={4}
              required
            />
          </div>
          
          <div className="form-group">
            <label>签证原因 <span className="required">*</span></label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="请输入签证原因，说明为什么需要进行此变更"
              rows={3}
              required
            />
          </div>
          
          <div className="form-group">
            <label>签证金额（元）</label>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="请输入签证金额，影响成本的签证需财务审核"
              min="0"
              step="0.01"
            />
            <small className="form-hint">
              提示：金额大于0的签证需要财务审核
            </small>
          </div>
          
          <div className="form-group">
            <label>备注</label>
            <textarea
              value={formData.remark}
              onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
              placeholder="可选，补充说明"
              rows={2}
            />
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onClose} disabled={loading}>取消</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '提交中...' : '提交'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 现场签证详情弹窗
function SiteVisaDetail({ id, onClose, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approveLoading, setApproveLoading] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // 获取详情
  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/visa/${id}`, {
        headers: getHeaders()
      });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  // 审批通过
  const handleApprove = async () => {
    if (!window.confirm('确定要审批通过吗？')) return;
    
    setApproveLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/visa/${id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ comment: '' })
      });
      const result = await res.json();
      
      if (result.success) {
        alert('审批通过');
        fetchDetail();
        onRefresh && onRefresh();
      } else {
        alert(result.message || '审批失败');
      }
    } catch (error) {
      alert('审批失败: ' + error.message);
    } finally {
      setApproveLoading(false);
    }
  };

  // 审批拒绝
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert('请填写拒绝原因');
      return;
    }
    
    setApproveLoading(true);
    try {
      const res = await fetch(`${API_BASE}/changes/visa/${id}/reject`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ comment: rejectReason })
      });
      const result = await res.json();
      
      if (result.success) {
        alert('已拒绝');
        setShowRejectInput(false);
        setRejectReason('');
        fetchDetail();
        onRefresh && onRefresh();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (error) {
      alert('操作失败: ' + error.message);
    } finally {
      setApproveLoading(false);
    }
  };

  if (!id) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content visa-detail-modal">
        <div className="modal-header">
          <h3>现场签证详情</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        {loading ? (
          <div className="loading">加载中...</div>
        ) : !data ? (
          <div className="empty">数据不存在</div>
        ) : (
          <div className="detail-content">
            <div className="detail-section">
              <div className="detail-row">
                <label>签证编号：</label>
                <span>{data.visa_no}</span>
              </div>
              <div className="detail-row">
                <label>关联项目：</label>
                <span>{data.project_name || '-'}</span>
              </div>
              <div className="detail-row">
                <label>状态：</label>
                <span
                  className="status-tag"
                  style={{ backgroundColor: STATUS_MAP[data.status]?.color || '#8c8c8c' }}
                >
                  {STATUS_MAP[data.status]?.text || data.status}
                </span>
              </div>
            </div>
            
            <div className="detail-section">
              <h4>签证信息</h4>
              <div className="detail-row vertical">
                <label>签证内容：</label>
                <div className="content-box">{data.visa_content}</div>
              </div>
              <div className="detail-row vertical">
                <label>签证原因：</label>
                <div className="content-box">{data.reason}</div>
              </div>
              <div className="detail-row">
                <label>签证金额：</label>
                <span className="amount">¥{(data.amount || 0).toLocaleString()}</span>
              </div>
              {data.remark && (
                <div className="detail-row vertical">
                  <label>备注：</label>
                  <div className="content-box">{data.remark}</div>
                </div>
              )}
            </div>
            
            <div className="detail-section">
              <h4>审批流程</h4>
              <div className="approval-steps">
                {data.approval_records?.map((record, index) => (
                  <div key={record.id} className={`approval-step ${record.action}`}>
                    <div className="step-info">
                      <span className="step-name">{record.step_name}</span>
                      <span className="step-role">({record.role})</span>
                    </div>
                    <div className="step-status">
                      {record.action === 'pending' && (
                        <span className="pending">待审批</span>
                      )}
                      {record.action === 'approve' && (
                        <span className="approved">
                          已通过
                          {record.approver_name && ` - ${record.approver_name}`}
                          {record.updated_at && ` (${record.updated_at.split('T')[0]})`}
                        </span>
                      )}
                      {record.action === 'reject' && (
                        <span className="rejected">
                          已拒绝
                          {record.approver_name && ` - ${record.approver_name}`}
                          {record.comment && `：${record.comment}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="detail-section">
              <div className="detail-row">
                <label>创建人：</label>
                <span>{data.creator_name || '-'}</span>
              </div>
              <div className="detail-row">
                <label>创建时间：</label>
                <span>{data.created_at}</span>
              </div>
              {data.approver_name && (
                <div className="detail-row">
                  <label>审批人：</label>
                  <span>{data.approver_name}</span>
                </div>
              )}
              {data.approved_at && (
                <div className="detail-row">
                  <label>审批时间：</label>
                  <span>{data.approved_at}</span>
                </div>
              )}
            </div>
            
            {/* 审批操作 */}
            {['pending', 'finance_approved'].includes(data.status) && (
              <div className="approval-actions">
                {!showRejectInput ? (
                  <>
                    <button 
                      className="btn-success" 
                      onClick={handleApprove}
                      disabled={approveLoading}
                    >
                      {approveLoading ? '处理中...' : '审批通过'}
                    </button>
                    <button 
                      className="btn-danger" 
                      onClick={() => setShowRejectInput(true)}
                      disabled={approveLoading}
                    >
                      审批拒绝
                    </button>
                  </>
                ) : (
                  <div className="reject-form">
                    <label>拒绝原因：</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="请输入拒绝原因"
                      rows={3}
                    />
                    <div className="reject-actions">
                      <button onClick={() => { setShowRejectInput(false); setRejectReason(''); }}>
                        取消
                      </button>
                      <button className="btn-danger" onClick={handleReject} disabled={approveLoading}>
                        {approveLoading ? '处理中...' : '确认拒绝'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// 统计卡片组件
function StatsCards({ onRefresh }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/changes/visa/stats`, {
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
    fetchStats();
  }, [onRefresh]);

  if (!stats) return null;

  return (
    <div className="stats-cards">
      <div className="stat-card">
        <div className="stat-value">{stats.total || 0}</div>
        <div className="stat-label">总签证数</div>
      </div>
      <div className="stat-card warning">
        <div className="stat-value">{stats.pending_count || 0}</div>
        <div className="stat-label">待审批</div>
      </div>
      <div className="stat-card info">
        <div className="stat-value">{stats.finance_approved_count || 0}</div>
        <div className="stat-label">财务已审</div>
      </div>
      <div className="stat-card success">
        <div className="stat-value">{stats.approved_count || 0}</div>
        <div className="stat-label">已通过</div>
      </div>
      <div className="stat-card danger">
        <div className="stat-value">{stats.rejected_count || 0}</div>
        <div className="stat-label">已拒绝</div>
      </div>
      <div className="stat-card amount">
        <div className="stat-value">¥{(stats.total_amount || 0).toLocaleString()}</div>
        <div className="stat-label">已通过金额</div>
      </div>
    </div>
  );
}

// 主组件
export default function SiteVisa() {
  const [showForm, setShowForm] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [projects, setProjects] = useState([]);

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

  const handleCreateSuccess = () => {
    setShowForm(false);
    setRefreshKey(prev => prev + 1);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="site-visa-page">
      <div className="page-header">
        <h2>现场签证管理</h2>
        <p>管理施工现场签证，支持审批流程</p>
      </div>
      
      <StatsCards refreshKey={refreshKey} onRefresh={handleRefresh} />
      
      <SiteVisaList
        key={refreshKey}
        onView={(id) => setDetailId(id)}
        onCreate={() => setShowForm(true)}
        onRefresh={handleRefresh}
      />
      
      {showForm && (
        <SiteVisaForm
          projects={projects}
          onClose={() => setShowForm(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
      
      {detailId && (
        <SiteVisaDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
