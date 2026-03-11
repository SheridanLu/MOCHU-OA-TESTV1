/**
 * Task 55: 施工管理 - 进度填报
 * 功能：填报列表、新建填报（关联里程碑、完成情况、百分比）、进度曲线图
 */

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const API_BASE = window.location.origin + '/api';

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
    fontSize: '14px'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    fontSize: '14px',
    background: '#fff'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d9d9d9',
    borderRadius: '6px',
    fontSize: '14px',
    minHeight: '80px',
    resize: 'vertical'
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
    fontSize: '12px'
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
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  th: {
    padding: '12px',
    textAlign: 'left',
    borderBottom: '2px solid #f0f0f0',
    background: '#fafafa',
    fontWeight: '500'
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #f0f0f0'
  },
  filterRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  filterItem: {
    flex: '1',
    minWidth: '150px'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#fff',
    borderRadius: '8px',
    padding: '24px',
    width: '600px',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#999'
  },
  progressTag: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: '500'
  },
  statsRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px'
  },
  statCard: {
    flex: 1,
    padding: '16px',
    background: '#f5f5f5',
    borderRadius: '8px',
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
    marginTop: '4px'
  },
  chartContainer: {
    height: '300px',
    marginTop: '20px'
  }
};

// 获取进度颜色
const getProgressColor = (rate) => {
  if (rate >= 80) return '#52c41a';
  if (rate >= 50) return '#1890ff';
  if (rate >= 30) return '#faad14';
  return '#ff4d4f';
};

// 获取进度标签样式
const getProgressTagStyle = (rate) => ({
  ...styles.progressTag,
  background: rate >= 80 ? '#f6ffed' : rate >= 50 ? '#e6f7ff' : rate >= 30 ? '#fffbe6' : '#fff2f0',
  color: getProgressColor(rate)
});

function ProgressReport() {
  const [activeTab, setActiveTab] = useState('list'); // list, create, chart
  const [progressList, setProgressList] = useState([]);
  const [projects, setProjects] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [chartData, setChartData] = useState({ progressCurve: [], milestones: [] });
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProgress, setEditingProgress] = useState(null);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    project_id: '',
    start_date: '',
    end_date: '',
    page: 1,
    pageSize: 20
  });
  
  // 表单数据
  const [formData, setFormData] = useState({
    project_id: '',
    milestone_id: '',
    report_date: new Date().toISOString().slice(0, 10),
    progress_rate: 0,
    work_content: '',
    issues: '',
    next_plan: '',
    remark: ''
  });

  // 获取项目列表
  useEffect(() => {
    fetchProjects();
  }, []);

  // 获取进度列表
  useEffect(() => {
    if (activeTab === 'list') {
      fetchProgressList();
    }
  }, [filters, activeTab]);

  // 获取统计数据
  useEffect(() => {
    fetchStats();
  }, [filters.project_id]);

  // 获取图表数据
  useEffect(() => {
    if (activeTab === 'chart' && filters.project_id) {
      fetchChartData();
    }
  }, [activeTab, filters.project_id]);

  // 项目选择变化时获取里程碑
  useEffect(() => {
    if (formData.project_id) {
      fetchMilestones(formData.project_id);
    } else {
      setMilestones([]);
    }
  }, [formData.project_id]);

  // 筛选项目变化时也更新里程碑列表
  useEffect(() => {
    if (filters.project_id) {
      fetchMilestones(filters.project_id);
    }
  }, [filters.project_id]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/projects/active`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setProjects(result.data);
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  const fetchProgressList = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      params.append('page', filters.page);
      params.append('pageSize', filters.pageSize);

      const response = await fetch(`${API_BASE}/construction/progress?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setProgressList(result.data);
      }
    } catch (error) {
      console.error('获取进度列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMilestones = async (projectId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/progress/project/${projectId}/milestones`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setMilestones(result.data);
      }
    } catch (error) {
      console.error('获取里程碑列表失败:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);
      
      const response = await fetch(`${API_BASE}/construction/progress/stats/overview?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    }
  };

  const fetchChartData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/progress/project/${filters.project_id}/chart`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setChartData(result.data);
      }
    } catch (error) {
      console.error('获取图表数据失败:', error);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleFormChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setFormData({
      project_id: filters.project_id || '',
      milestone_id: '',
      report_date: new Date().toISOString().slice(0, 10),
      progress_rate: 0,
      work_content: '',
      issues: '',
      next_plan: '',
      remark: ''
    });
    setEditingProgress(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (progress) => {
    setEditingProgress(progress);
    setFormData({
      project_id: progress.project_id,
      milestone_id: progress.milestone_id || '',
      report_date: progress.report_date,
      progress_rate: progress.progress_rate,
      work_content: progress.work_content || '',
      issues: progress.issues || '',
      next_plan: progress.next_plan || '',
      remark: progress.remark || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.project_id) {
      alert('请选择关联项目');
      return;
    }
    
    if (!formData.report_date) {
      alert('请选择填报日期');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = editingProgress 
        ? `${API_BASE}/construction/progress/${editingProgress.id}`
        : `${API_BASE}/construction/progress`;
      
      const response = await fetch(url, {
        method: editingProgress ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      if (result.success) {
        alert(editingProgress ? '进度填报更新成功' : '进度填报创建成功');
        setShowModal(false);
        resetForm();
        fetchProgressList();
        fetchStats();
        if (filters.project_id) {
          fetchChartData();
        }
      } else {
        alert(result.message || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条进度填报记录吗？')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/construction/progress/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();
      if (result.success) {
        alert('删除成功');
        fetchProgressList();
        fetchStats();
      } else {
        alert(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>施工进度填报</h1>
        <button style={styles.button} onClick={openCreateModal}>
          + 新建填报
        </button>
      </div>

      {/* 统计概览 */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.total_reports || 0}</div>
          <div style={styles.statLabel}>总填报数</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.monthly_reports || 0}</div>
          <div style={styles.statLabel}>本月填报</div>
        </div>
        <div style={styles.statCard}>
          <div style={{ ...styles.statValue, color: getProgressColor(stats.max_progress || 0) }}>
            {stats.max_progress ? `${stats.max_progress}%` : '0%'}
          </div>
          <div style={styles.statLabel}>最新进度</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.latest_report_date || '-'}</div>
          <div style={styles.statLabel}>最近填报日期</div>
        </div>
      </div>

      {/* 标签页切换 */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #e8e8e8' }}>
        <button 
          style={{ 
            ...styles.buttonSecondary, 
            borderBottom: activeTab === 'list' ? '2px solid #1890ff' : 'none',
            background: activeTab === 'list' ? '#fff' : 'transparent',
            color: activeTab === 'list' ? '#1890ff' : '#333',
            border: 'none',
            borderRadius: 0,
            padding: '12px 24px'
          }}
          onClick={() => setActiveTab('list')}
        >
          填报列表
        </button>
        <button 
          style={{ 
            ...styles.buttonSecondary, 
            borderBottom: activeTab === 'chart' ? '2px solid #1890ff' : 'none',
            background: activeTab === 'chart' ? '#fff' : 'transparent',
            color: activeTab === 'chart' ? '#1890ff' : '#333',
            border: 'none',
            borderRadius: 0,
            padding: '12px 24px'
          }}
          onClick={() => setActiveTab('chart')}
        >
          进度曲线图
        </button>
      </div>

      {/* 筛选条件 */}
      <div style={styles.card}>
        <div style={styles.filterRow}>
          <div style={styles.filterItem}>
            <label style={styles.label}>项目</label>
            <select 
              style={styles.select}
              value={filters.project_id}
              onChange={(e) => handleFilterChange('project_id', e.target.value)}
            >
              <option value="">全部项目</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={styles.filterItem}>
            <label style={styles.label}>开始日期</label>
            <input 
              type="date" 
              style={styles.input}
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </div>
          <div style={styles.filterItem}>
            <label style={styles.label}>结束日期</label>
            <input 
              type="date" 
              style={styles.input}
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 填报列表 */}
      {activeTab === 'list' && (
        <div style={styles.card}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
          ) : progressList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              暂无填报记录
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>填报编号</th>
                  <th style={styles.th}>项目</th>
                  <th style={styles.th}>关联里程碑</th>
                  <th style={styles.th}>填报日期</th>
                  <th style={styles.th}>进度</th>
                  <th style={styles.th}>工作内容</th>
                  <th style={styles.th}>填报人</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {progressList.map(item => (
                  <tr key={item.id}>
                    <td style={styles.td}>{item.progress_no}</td>
                    <td style={styles.td}>{item.project_name}</td>
                    <td style={styles.td}>{item.milestone_name || '-'}</td>
                    <td style={styles.td}>{item.report_date}</td>
                    <td style={styles.td}>
                      <span style={getProgressTagStyle(item.progress_rate)}>
                        {item.progress_rate}%
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.work_content || '-'}
                      </div>
                    </td>
                    <td style={styles.td}>{item.reporter_name}</td>
                    <td style={styles.td}>
                      <button style={styles.buttonSmall} onClick={() => openEditModal(item)}>
                        编辑
                      </button>
                      <button style={styles.buttonDanger} onClick={() => handleDelete(item.id)}>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 进度曲线图 */}
      {activeTab === 'chart' && (
        <div style={styles.card}>
          <h3 style={{ marginBottom: '20px' }}>进度曲线图</h3>
          {!filters.project_id ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              请先选择项目
            </div>
          ) : chartData.progressCurve.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              该项目暂无进度数据
            </div>
          ) : (
            <>
              <div style={styles.chartContainer}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData.progressCurve}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip 
                      formatter={(value, name) => [`${value}%`, name === 'progress' ? '进度' : name]}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="progress" 
                      stroke="#1890ff" 
                      strokeWidth={2}
                      name="实际进度"
                      dot={{ fill: '#1890ff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              {/* 里程碑列表 */}
              {chartData.milestones.length > 0 && (
                <div style={{ marginTop: '30px' }}>
                  <h4>里程碑节点</h4>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>里程碑名称</th>
                        <th style={styles.th}>计划日期</th>
                        <th style={styles.th}>实际日期</th>
                        <th style={styles.th}>进度</th>
                        <th style={styles.th}>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.milestones.map((m, idx) => (
                        <tr key={idx}>
                          <td style={styles.td}>{m.name}</td>
                          <td style={styles.td}>{m.planned_date}</td>
                          <td style={styles.td}>{m.actual_date || '-'}</td>
                          <td style={styles.td}>
                            <span style={getProgressTagStyle(m.progress || 0)}>
                              {m.progress || 0}%
                            </span>
                          </td>
                          <td style={styles.td}>
                            {m.status === 'completed' ? (
                              <span style={{ color: '#52c41a' }}>已完成</span>
                            ) : (
                              <span style={{ color: '#faad14' }}>进行中</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 新建/编辑填报弹窗 */}
      {showModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3>{editingProgress ? '编辑进度填报' : '新建进度填报'}</h3>
              <button style={styles.closeButton} onClick={() => setShowModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>关联项目 *</label>
                <select 
                  style={styles.select}
                  value={formData.project_id}
                  onChange={(e) => handleFormChange('project_id', e.target.value)}
                  disabled={!!editingProgress}
                >
                  <option value="">请选择项目</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>关联里程碑</label>
                <select 
                  style={styles.select}
                  value={formData.milestone_id}
                  onChange={(e) => handleFormChange('milestone_id', e.target.value)}
                  disabled={!formData.project_id}
                >
                  <option value="">请选择里程碑（可选）</option>
                  {milestones.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.planned_date})
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>填报日期 *</label>
                <input 
                  type="date" 
                  style={styles.input}
                  value={formData.report_date}
                  onChange={(e) => handleFormChange('report_date', e.target.value)}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>进度百分比 (0-100%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={formData.progress_rate}
                    onChange={(e) => handleFormChange('progress_rate', parseInt(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span style={{ 
                    ...getProgressTagStyle(formData.progress_rate),
                    minWidth: '60px',
                    textAlign: 'center'
                  }}>
                    {formData.progress_rate}%
                  </span>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>本周/本月工作内容</label>
                <textarea 
                  style={styles.textarea}
                  value={formData.work_content}
                  onChange={(e) => handleFormChange('work_content', e.target.value)}
                  placeholder="请填写本周/本月完成的主要工作内容..."
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>存在问题</label>
                <textarea 
                  style={styles.textarea}
                  value={formData.issues}
                  onChange={(e) => handleFormChange('issues', e.target.value)}
                  placeholder="请填写施工过程中遇到的问题..."
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>下周/下月计划</label>
                <textarea 
                  style={styles.textarea}
                  value={formData.next_plan}
                  onChange={(e) => handleFormChange('next_plan', e.target.value)}
                  placeholder="请填写下周/下月的工作计划..."
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>备注</label>
                <textarea 
                  style={{ ...styles.textarea, minHeight: '60px' }}
                  value={formData.remark}
                  onChange={(e) => handleFormChange('remark', e.target.value)}
                  placeholder="其他备注信息..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" style={styles.buttonSecondary} onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" style={styles.button}>
                  {editingProgress ? '保存修改' : '提交填报'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProgressReport;
