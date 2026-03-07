/**
 * Task 54: 施工管理 - 里程碑设置
 * 功能：里程碑列表（关联项目）、新建里程碑、编辑功能、标记完成（记录实际完成日期）
 */

import { useState, useEffect } from 'react';

const API_BASE = '/api';

// 通用样式
const styles = {
  container: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333'
  },
  card: {
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '20px',
    marginBottom: '20px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '20px'
  },
  statCard: {
    background: '#fff',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '20px',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#1890ff'
  },
  statLabel: {
    fontSize: '14px',
    color: '#666',
    marginTop: '8px'
  },
  filterBar: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  formGroup: {
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    fontSize: '14px',
    minHeight: '80px',
    resize: 'vertical',
    boxSizing: 'border-box'
  },
  button: {
    padding: '10px 20px',
    background: '#1890ff',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    marginRight: '10px'
  },
  buttonSecondary: {
    padding: '10px 20px',
    background: '#fff',
    color: '#333',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px'
  },
  buttonDanger: {
    padding: '6px 12px',
    background: '#ff4d4f',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginRight: '8px'
  },
  buttonSmall: {
    padding: '6px 12px',
    background: '#1890ff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginRight: '8px'
  },
  buttonSuccess: {
    padding: '6px 12px',
    background: '#52c41a',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginRight: '8px'
  },
  buttonEdit: {
    padding: '6px 12px',
    background: '#faad14',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    marginRight: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    borderBottom: '2px solid #f0f0f0',
    fontWeight: '600',
    color: '#333'
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #f0f0f0'
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#fff',
    borderRadius: '8px',
    width: '600px',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalHeader: {
    padding: '16px 24px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalBody: {
    padding: '24px'
  },
  modalFooter: {
    padding: '16px 24px',
    borderTop: '1px solid #f0f0f0',
    textAlign: 'right'
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  progressBar: {
    flex: 1,
    height: '8px',
    background: '#f0f0f0',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: '#1890ff',
    borderRadius: '4px'
  },
  deviationWarning: {
    color: '#ff4d4f',
    fontSize: '12px',
    marginTop: '4px'
  },
  tooltip: {
    position: 'absolute',
    background: '#333',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '12px',
    zIndex: 1001,
    whiteSpace: 'nowrap'
  }
};

// 状态标签颜色
const statusColors = {
  pending: { bg: '#e6f7ff', color: '#1890ff', text: '待完成' },
  completed: { bg: '#f6ffed', color: '#52c41a', text: '已完成' }
};

// 偏差状态颜色
const deviationColors = {
  normal: { color: '#52c41a', text: '正常' },
  delayed: { color: '#ff4d4f', text: '延期' },
  advanced: { color: '#1890ff', text: '提前' },
  overdue: { color: '#faad14', text: '超期' }
};

function Milestone() {
  // 状态
  const [milestones, setMilestones] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    overdue: 0
  });

  // 筛选条件
  const [filters, setFilters] = useState({
    project_id: '',
    status: '',
    keyword: '',
    page: 1,
    pageSize: 20
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0
  });

  // 弹窗状态
  const [showModal, setShowModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // create, edit
  const [currentMilestone, setCurrentMilestone] = useState(null);
  const [formData, setFormData] = useState({
    project_id: '',
    name: '',
    description: '',
    planned_date: '',
    progress_rate: 0,
    remark: ''
  });
  const [completeData, setCompleteData] = useState({
    actual_date: new Date().toISOString().slice(0, 10),
    progress_rate: 100,
    remark: ''
  });

  // 获取项目列表
  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/projects/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  // 获取里程碑列表
  const fetchMilestones = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);
      params.append('page', filters.page);
      params.append('pageSize', filters.pageSize);

      const response = await fetch(`${API_BASE}/construction/milestones?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setMilestones(result.data || []);
        setPagination(result.pagination || { page: 1, pageSize: 20, total: 0 });
      }
    } catch (error) {
      console.error('获取里程碑列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取统计数据
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);

      const response = await fetch(`${API_BASE}/construction/milestones/stats/overview?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setStats(result.data || { total: 0, pending: 0, completed: 0, overdue: 0 });
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  };

  // 初始化
  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchMilestones();
    fetchStats();
  }, [filters]);

  // 打开新建弹窗
  const handleCreate = () => {
    setModalMode('create');
    setFormData({
      project_id: '',
      name: '',
      description: '',
      planned_date: '',
      progress_rate: 0,
      remark: ''
    });
    setShowModal(true);
  };

  // 打开编辑弹窗
  const handleEdit = (milestone) => {
    setModalMode('edit');
    setCurrentMilestone(milestone);
    setFormData({
      project_id: milestone.project_id,
      name: milestone.name,
      description: milestone.description || '',
      planned_date: milestone.planned_date,
      progress_rate: milestone.progress_rate || 0,
      remark: milestone.remark || ''
    });
    setShowModal(true);
  };

  // 查看详情
  const handleViewDetail = async (milestone) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/milestones/${milestone.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setCurrentMilestone(result.data);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      alert('获取详情失败');
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    // 验证
    if (!formData.project_id) {
      alert('请选择关联项目');
      return;
    }
    if (!formData.name.trim()) {
      alert('请输入里程碑名称');
      return;
    }
    if (!formData.planned_date) {
      alert('请选择计划日期');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = modalMode === 'create'
        ? `${API_BASE}/construction/milestones`
        : `${API_BASE}/construction/milestones/${currentMilestone.id}`;

      const response = await fetch(url, {
        method: modalMode === 'create' ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      if (result.success) {
        alert(modalMode === 'create' ? '里程碑创建成功' : '里程碑更新成功');
        setShowModal(false);
        fetchMilestones();
        fetchStats();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      alert('操作失败');
    }
  };

  // 删除里程碑
  const handleDelete = async (milestone) => {
    if (!window.confirm(`确定要删除里程碑"${milestone.name}"吗？`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/milestones/${milestone.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();
      if (result.success) {
        alert('删除成功');
        fetchMilestones();
        fetchStats();
      } else {
        alert(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败');
    }
  };

  // 打开完成弹窗
  const handleComplete = (milestone) => {
    setCurrentMilestone(milestone);
    setCompleteData({
      actual_date: new Date().toISOString().slice(0, 10),
      progress_rate: 100,
      remark: ''
    });
    setShowCompleteModal(true);
  };

  // 提交完成
  const handleSubmitComplete = async () => {
    if (!completeData.actual_date) {
      alert('请选择实际完成日期');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/milestones/${currentMilestone.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(completeData)
      });

      const result = await response.json();
      if (result.success) {
        alert('里程碑已完成');
        setShowCompleteModal(false);
        fetchMilestones();
        fetchStats();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (error) {
      console.error('完成失败:', error);
      alert('操作失败');
    }
  };

  // 渲染状态标签
  const renderStatus = (status) => {
    const config = statusColors[status] || statusColors.pending;
    return (
      <span style={{
        ...styles.statusBadge,
        background: config.bg,
        color: config.color
      }}>
        {config.text}
      </span>
    );
  };

  // 渲染偏差状态
  const renderDeviation = (milestone) => {
    if (!milestone.deviation_status || milestone.deviation_status === 'normal') {
      return <span style={{ color: '#52c41a' }}>正常</span>;
    }

    const config = deviationColors[milestone.deviation_status];
    const days = milestone.deviation_days;
    let text = config.text;

    if (milestone.deviation_status === 'delayed' && days > 0) {
      text = `延期 ${days} 天`;
    } else if (milestone.deviation_status === 'advanced' && days < 0) {
      text = `提前 ${Math.abs(days)} 天`;
    } else if (milestone.deviation_status === 'overdue') {
      text = '已超期';
    }

    return <span style={{ color: config.color }}>{text}</span>;
  };

  // 渲染进度条
  const renderProgress = (rate) => {
    const percentage = Math.min(100, Math.max(0, rate || 0));
    return (
      <div style={styles.progressContainer}>
        <div style={styles.progressBar}>
          <div style={{
            ...styles.progressFill,
            width: `${percentage}%`,
            background: percentage >= 100 ? '#52c41a' : '#1890ff'
          }} />
        </div>
        <span style={{ minWidth: '45px', textAlign: 'right' }}>{percentage}%</span>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* 页面标题 */}
      <div style={styles.header}>
        <h1 style={styles.title}>里程碑管理</h1>
        <button style={styles.button} onClick={handleCreate}>
          + 新建里程碑
        </button>
      </div>

      {/* 统计卡片 */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#1890ff' }}>{stats.total || 0}</div>
          <div style={styles.statLabel}>总里程碑数</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#faad14' }}>{stats.pending || 0}</div>
          <div style={styles.statLabel}>待完成</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#52c41a' }}>{stats.completed || 0}</div>
          <div style={styles.statLabel}>已完成</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: '#ff4d4f' }}>{stats.overdue || 0}</div>
          <div style={styles.statLabel}>已超期</div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div style={styles.card}>
        <div style={styles.filterBar}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <select
              style={styles.select}
              value={filters.project_id}
              onChange={(e) => setFilters({ ...filters, project_id: e.target.value, page: 1 })}
            >
              <option value="">全部项目</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <select
              style={styles.select}
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
            >
              <option value="">全部状态</option>
              <option value="pending">待完成</option>
              <option value="completed">已完成</option>
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <input
              type="text"
              style={styles.input}
              placeholder="搜索里程碑名称..."
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value, page: 1 })}
            />
          </div>
        </div>
      </div>

      {/* 里程碑列表 */}
      <div style={styles.card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
        ) : milestones.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
            暂无里程碑数据
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>里程碑编号</th>
                <th style={styles.th}>里程碑名称</th>
                <th style={styles.th}>关联项目</th>
                <th style={styles.th}>计划日期</th>
                <th style={styles.th}>实际日期</th>
                <th style={styles.th}>进度</th>
                <th style={styles.th}>偏差状态</th>
                <th style={styles.th}>状态</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map(milestone => (
                <tr key={milestone.id}>
                  <td style={styles.td}>{milestone.milestone_no}</td>
                  <td style={styles.td}>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); handleViewDetail(milestone); }}
                      style={{ color: '#1890ff' }}
                    >
                      {milestone.name}
                    </a>
                  </td>
                  <td style={styles.td}>{milestone.project_name}</td>
                  <td style={styles.td}>{milestone.planned_date}</td>
                  <td style={styles.td}>{milestone.actual_date || '-'}</td>
                  <td style={styles.td}>{renderProgress(milestone.progress_rate)}</td>
                  <td style={styles.td}>{renderDeviation(milestone)}</td>
                  <td style={styles.td}>{renderStatus(milestone.status)}</td>
                  <td style={styles.td}>
                    {milestone.status === 'pending' ? (
                      <>
                        <button
                          style={styles.buttonSuccess}
                          onClick={() => handleComplete(milestone)}
                        >
                          完成标记
                        </button>
                        <button
                          style={styles.buttonEdit}
                          onClick={() => handleEdit(milestone)}
                        >
                          编辑
                        </button>
                        <button
                          style={styles.buttonDanger}
                          onClick={() => handleDelete(milestone)}
                        >
                          删除
                        </button>
                      </>
                    ) : (
                      <button
                        style={styles.buttonSmall}
                        onClick={() => handleViewDetail(milestone)}
                      >
                        查看详情
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {pagination.total > pagination.pageSize && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <button
              style={{ ...styles.buttonSecondary, marginRight: '10px' }}
              disabled={pagination.page <= 1}
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
            >
              上一页
            </button>
            <span style={{ margin: '0 10px' }}>
              第 {pagination.page} / {Math.ceil(pagination.total / pagination.pageSize)} 页
            </span>
            <button
              style={styles.buttonSecondary}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 新建/编辑弹窗 */}
      {showModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3>{modalMode === 'create' ? '新建里程碑' : '编辑里程碑'}</h3>
              <button
                style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.formGroup}>
                <label style={styles.label}>关联项目 *</label>
                <select
                  style={styles.select}
                  value={formData.project_id}
                  onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  disabled={modalMode === 'edit'}
                >
                  <option value="">请选择项目</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>里程碑名称 *</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入里程碑名称"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>描述</label>
                <textarea
                  style={styles.textarea}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="请输入里程碑描述"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>计划日期 *</label>
                <input
                  type="date"
                  style={styles.input}
                  value={formData.planned_date}
                  onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>进度百分比</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.progress_rate}
                    onChange={(e) => setFormData({ ...formData, progress_rate: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: '50px' }}>{formData.progress_rate}%</span>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>备注</label>
                <textarea
                  style={styles.textarea}
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  placeholder="请输入备注"
                />
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.buttonSecondary} onClick={() => setShowModal(false)}>
                取消
              </button>
              <button style={styles.button} onClick={handleSubmit}>
                {modalMode === 'create' ? '创建' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完成弹窗 */}
      {showCompleteModal && currentMilestone && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3>标记里程碑完成</h3>
              <button
                style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}
                onClick={() => setShowCompleteModal(false)}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ ...styles.card, background: '#f6ffed', marginBottom: '20px' }}>
                <p><strong>里程碑：</strong>{currentMilestone.name}</p>
                <p><strong>关联项目：</strong>{currentMilestone.project_name}</p>
                <p><strong>计划日期：</strong>{currentMilestone.planned_date}</p>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>实际完成日期 *</label>
                <input
                  type="date"
                  style={styles.input}
                  value={completeData.actual_date}
                  onChange={(e) => setCompleteData({ ...completeData, actual_date: e.target.value })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>完成进度百分比</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={completeData.progress_rate}
                    onChange={(e) => setCompleteData({ ...completeData, progress_rate: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ minWidth: '50px' }}>{completeData.progress_rate}%</span>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>备注</label>
                <textarea
                  style={styles.textarea}
                  value={completeData.remark}
                  onChange={(e) => setCompleteData({ ...completeData, remark: e.target.value })}
                  placeholder="请输入完成备注"
                />
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.buttonSecondary} onClick={() => setShowCompleteModal(false)}>
                取消
              </button>
              <button style={{ ...styles.button, background: '#52c41a' }} onClick={handleSubmitComplete}>
                确认完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetailModal && currentMilestone && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3>里程碑详情</h3>
              <button
                style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer' }}
                onClick={() => setShowDetailModal(false)}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>里程碑编号</label>
                  <div>{currentMilestone.milestone_no}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>状态</label>
                  <div>{renderStatus(currentMilestone.status)}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>里程碑名称</label>
                  <div>{currentMilestone.name}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>关联项目</label>
                  <div>{currentMilestone.project_name}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>计划日期</label>
                  <div>{currentMilestone.planned_date}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>实际日期</label>
                  <div>{currentMilestone.actual_date || '-'}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>进度</label>
                  <div>{renderProgress(currentMilestone.progress_rate)}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>偏差状态</label>
                  <div>{renderDeviation(currentMilestone)}</div>
                </div>
                {currentMilestone.deviation_days !== null && currentMilestone.deviation_days !== 0 && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>偏差天数</label>
                    <div style={{
                      color: currentMilestone.deviation_days > 0 ? '#ff4d4f' : '#52c41a'
                    }}>
                      {currentMilestone.deviation_days > 0 ? `+${currentMilestone.deviation_days}` : currentMilestone.deviation_days} 天
                    </div>
                  </div>
                )}
                <div style={styles.formGroup}>
                  <label style={styles.label}>创建人</label>
                  <div>{currentMilestone.creator_name || '-'}</div>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>创建时间</label>
                  <div>{currentMilestone.created_at}</div>
                </div>
                {currentMilestone.status === 'completed' && (
                  <>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>完成人</label>
                      <div>{currentMilestone.completer_name || '-'}</div>
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>完成时间</label>
                      <div>{currentMilestone.completed_at || '-'}</div>
                    </div>
                  </>
                )}
              </div>
              {currentMilestone.description && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>描述</label>
                  <div>{currentMilestone.description}</div>
                </div>
              )}
              {currentMilestone.remark && (
                <div style={styles.formGroup}>
                  <label style={styles.label}>备注</label>
                  <div>{currentMilestone.remark}</div>
                </div>
              )}
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.buttonSecondary} onClick={() => setShowDetailModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Milestone;
