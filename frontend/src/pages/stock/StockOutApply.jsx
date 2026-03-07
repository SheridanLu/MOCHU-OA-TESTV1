/**
 * 物资出库 - 领用申请
 * Task 40: 实现项目领用物资申请功能
 * 
 * 功能：
 * - 领用申请表单（选择项目、物资、数量、填写原因）
 * - 查看申请状态
 * - 审批功能（待审批列表、通过/拒绝）
 */

import React, { useState, useEffect } from 'react';
import './StockOutApply.css';

const API_BASE = '/api';

// 获取请求头
const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// 状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: '#faad14' },
  approved: { text: '已通过', color: '#52c41a' },
  rejected: { text: '已拒绝', color: '#ff4d4f' }
};

function StockOutApply() {
  // 列表状态
  const [activeTab, setActiveTab] = useState('my'); // my | pending | all
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  
  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentApplication, setCurrentApplication] = useState(null);
  
  // 新建申请
  const [projects, setProjects] = useState([]);
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [newApplication, setNewApplication] = useState({
    project_id: '',
    reason: '',
    remark: '',
    items: []
  });
  
  // 物资搜索
  const [materialSearchKeyword, setMaterialSearchKeyword] = useState('');
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  useEffect(() => {
    fetchList();
  }, [activeTab, pagination.page, filters]);

  useEffect(() => {
    if (showCreateModal) {
      fetchProjects();
      fetchAvailableMaterials();
    }
  }, [showCreateModal]);

  // 获取列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);

      let url = '';
      if (activeTab === 'my') {
        url = `${API_BASE}/stock/out/my-applications?${params}`;
      } else if (activeTab === 'pending') {
        url = `${API_BASE}/stock/out/pending?${params}`;
      } else {
        url = `${API_BASE}/stock/out/applications?${params}`;
      }

      const response = await fetch(url, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setList(result.data);
        setPagination(prev => ({ ...prev, total: result.pagination.total }));
      }
    } catch (error) {
      console.error('获取列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取项目列表
  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/projects?pageSize=100`, {
        headers: getHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  // 获取可领用物资
  const fetchAvailableMaterials = async (keyword = '') => {
    try {
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);
      
      const response = await fetch(`${API_BASE}/stock/out/available-materials?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setAvailableMaterials(result.data || []);
      }
    } catch (error) {
      console.error('获取可领用物资失败:', error);
    }
  };

  // 打开新建申请弹窗
  const handleOpenCreate = () => {
    setNewApplication({
      project_id: '',
      reason: '',
      remark: '',
      items: []
    });
    setMaterialSearchKeyword('');
    setShowCreateModal(true);
  };

  // 选择物资
  const handleSelectMaterial = (material) => {
    // 检查是否已添加
    const exists = newApplication.items.find(
      item => item.material_id === material.id || 
              (item.material_name === material.material_name && item.specification === material.specification)
    );
    
    if (exists) {
      alert('该物资已添加');
      return;
    }
    
    setNewApplication(prev => ({
      ...prev,
      items: [...prev.items, {
        material_id: material.id,
        material_name: material.material_name,
        specification: material.specification,
        unit: material.unit,
        quantity: 1,
        available_quantity: material.available_quantity,
        remark: ''
      }]
    }));
    setShowMaterialPicker(false);
  };

  // 更新物资数量
  const handleItemChange = (index, field, value) => {
    setNewApplication(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  // 删除物资
  const handleRemoveItem = (index) => {
    setNewApplication(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // 提交申请
  const handleSubmit = async () => {
    if (!newApplication.project_id) {
      alert('请选择领用项目');
      return;
    }
    if (!newApplication.reason.trim()) {
      alert('请填写领用原因');
      return;
    }
    if (newApplication.items.length === 0) {
      alert('请添加领用物资');
      return;
    }
    
    // 检查数量是否超出可领数量
    for (const item of newApplication.items) {
      if (item.quantity > item.available_quantity) {
        alert(`"${item.material_name}" 申请数量超出可领数量（可领: ${item.available_quantity}）`);
        return;
      }
      if (item.quantity <= 0) {
        alert(`"${item.material_name}" 数量必须大于0`);
        return;
      }
    }
    
    try {
      const response = await fetch(`${API_BASE}/stock/out/apply`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newApplication)
      });
      const result = await response.json();
      
      if (result.success) {
        alert('领用申请提交成功');
        setShowCreateModal(false);
        fetchList();
      } else {
        alert(result.message || '提交失败');
      }
    } catch (error) {
      console.error('提交申请失败:', error);
      alert('提交失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/out/applications/${id}`, {
        headers: getHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setCurrentApplication(result.data);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
    }
  };

  // 审批通过
  const handleApprove = async (id, comment) => {
    try {
      const response = await fetch(`${API_BASE}/stock/out/${id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ comment })
      });
      const result = await response.json();
      
      if (result.success) {
        alert('审批通过');
        setShowDetailModal(false);
        fetchList();
      } else {
        alert(result.message || '审批失败');
      }
    } catch (error) {
      console.error('审批失败:', error);
      alert('审批失败');
    }
  };

  // 审批拒绝
  const handleReject = async (id, reason) => {
    if (!reason || !reason.trim()) {
      alert('请填写拒绝原因');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/stock/out/${id}/reject`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ reason })
      });
      const result = await response.json();
      
      if (result.success) {
        alert('已拒绝');
        setShowDetailModal(false);
        fetchList();
      } else {
        alert(result.message || '操作失败');
      }
    } catch (error) {
      console.error('操作失败:', error);
      alert('操作失败');
    }
  };

  // 撤销申请
  const handleDelete = async (id) => {
    if (!window.confirm('确定要撤销该申请吗？')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/stock/out/applications/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        alert('已撤销');
        setShowDetailModal(false);
        fetchList();
      } else {
        alert(result.message || '撤销失败');
      }
    } catch (error) {
      console.error('撤销失败:', error);
      alert('撤销失败');
    }
  };

  // 搜索物资
  const handleMaterialSearch = (keyword) => {
    setMaterialSearchKeyword(keyword);
    fetchAvailableMaterials(keyword);
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  return (
    <div className="stock-out-apply-page">
      <div className="page-header">
        <h2>物资领用申请</h2>
        <button className="btn-primary" onClick={handleOpenCreate}>
          + 新建领用申请
        </button>
      </div>

      {/* 标签页 */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'my' ? 'active' : ''}`}
          onClick={() => { setActiveTab('my'); setPagination(prev => ({ ...prev, page: 1 })); }}
        >
          我的申请
        </button>
        <button 
          className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => { setActiveTab('pending'); setPagination(prev => ({ ...prev, page: 1 })); }}
        >
          待审批
        </button>
        <button 
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => { setActiveTab('all'); setPagination(prev => ({ ...prev, page: 1 })); }}
        >
          全部申请
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="filter-bar">
        {activeTab !== 'pending' && (
          <div className="filter-item">
            <label>状态：</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">全部</option>
              <option value="pending">待审批</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
        )}
        <div className="filter-item">
          <label>搜索：</label>
          <input
            type="text"
            placeholder="申请单号/项目/申请人"
            value={filters.keyword}
            onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            onKeyPress={(e) => e.key === 'Enter' && fetchList()}
          />
        </div>
        <button className="btn-search" onClick={() => fetchList()}>搜索</button>
      </div>

      {/* 列表 */}
      <div className="list-container">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : list.length === 0 ? (
          <div className="empty">暂无数据</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>申请单号</th>
                <th>项目名称</th>
                {activeTab !== 'my' && <th>申请人</th>}
                <th>物资数量</th>
                <th>状态</th>
                <th>申请时间</th>
                {activeTab !== 'my' && <th>审批人</th>}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id}>
                  <td>{item.application_no}</td>
                  <td>{item.project_name || '-'}</td>
                  {activeTab !== 'my' && <td>{item.applicant_name || '-'}</td>}
                  <td>{item.item_count || 0} 项</td>
                  <td>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: STATUS_MAP[item.status]?.color || '#999' }}
                    >
                      {STATUS_MAP[item.status]?.text || item.status}
                    </span>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  {activeTab !== 'my' && <td>{item.approver_name || '-'}</td>}
                  <td>
                    <button className="btn-link" onClick={() => handleViewDetail(item.id)}>
                      详情
                    </button>
                    {activeTab === 'my' && item.status === 'pending' && (
                      <button 
                        className="btn-link btn-danger" 
                        onClick={() => handleDelete(item.id)}
                      >
                        撤销
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
          <div className="pagination">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            >
              上一页
            </button>
            <span>
              第 {pagination.page} 页 / 共 {Math.ceil(pagination.total / pagination.pageSize)} 页
            </span>
            <button
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.pageSize)}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      {/* 新建申请弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content create-modal">
            <div className="modal-header">
              <h3>新建领用申请</h3>
              <button className="btn-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-item">
                <label><span className="required">*</span> 领用项目：</label>
                <select
                  value={newApplication.project_id}
                  onChange={(e) => setNewApplication(prev => ({ ...prev, project_id: parseInt(e.target.value) }))}
                >
                  <option value="">请选择项目</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.project_no} - {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-item">
                <label><span className="required">*</span> 领用原因：</label>
                <textarea
                  value={newApplication.reason}
                  onChange={(e) => setNewApplication(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="请详细说明领用原因"
                  rows={3}
                />
              </div>

              <div className="form-item">
                <label>领用物资：</label>
                <div className="material-actions">
                  <button 
                    className="btn-secondary"
                    onClick={() => setShowMaterialPicker(true)}
                  >
                    + 添加物资
                  </button>
                </div>
                
                {newApplication.items.length > 0 && (
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>物资名称</th>
                        <th>规格型号</th>
                        <th>单位</th>
                        <th>可领数量</th>
                        <th>申请数量</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newApplication.items.map((item, index) => (
                        <tr key={index}>
                          <td>{item.material_name}</td>
                          <td>{item.specification || '-'}</td>
                          <td>{item.unit || '-'}</td>
                          <td className={item.available_quantity <= 0 ? 'warning' : ''}>
                            {item.available_quantity}
                          </td>
                          <td>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                              min="0"
                              max={item.available_quantity}
                            />
                          </td>
                          <td>
                            <button 
                              className="btn-link btn-danger"
                              onClick={() => handleRemoveItem(index)}
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="form-item">
                <label>备注：</label>
                <textarea
                  value={newApplication.remark}
                  onChange={(e) => setNewApplication(prev => ({ ...prev, remark: e.target.value }))}
                  placeholder="可选"
                  rows={2}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSubmit}>
                提交申请
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 物资选择弹窗 */}
      {showMaterialPicker && (
        <div className="modal-overlay">
          <div className="modal-content picker-modal">
            <div className="modal-header">
              <h3>选择物资</h3>
              <button className="btn-close" onClick={() => setShowMaterialPicker(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="搜索物资名称或规格..."
                  value={materialSearchKeyword}
                  onChange={(e) => handleMaterialSearch(e.target.value)}
                />
              </div>
              <div className="material-list">
                {availableMaterials.map(material => (
                  <div 
                    key={material.id}
                    className="material-item"
                    onClick={() => handleSelectMaterial(material)}
                  >
                    <div className="material-name">{material.material_name}</div>
                    <div className="material-info">
                      <span>规格: {material.specification || '-'}</span>
                      <span>单位: {material.unit || '-'}</span>
                      <span className="available">可领: {material.available_quantity}</span>
                    </div>
                  </div>
                ))}
                {availableMaterials.length === 0 && (
                  <div className="empty-tip">暂无可领用物资</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetailModal && currentApplication && (
        <div className="modal-overlay">
          <div className="modal-content detail-modal">
            <div className="modal-header">
              <h3>领用申请详情 - {currentApplication.application_no}</h3>
              <button className="btn-close" onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <div className="detail-row">
                  <label>申请单号：</label>
                  <span>{currentApplication.application_no}</span>
                </div>
                <div className="detail-row">
                  <label>项目名称：</label>
                  <span>{currentApplication.project_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>申请人：</label>
                  <span>{currentApplication.applicant_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>状态：</label>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: STATUS_MAP[currentApplication.status]?.color }}
                  >
                    {STATUS_MAP[currentApplication.status]?.text}
                  </span>
                </div>
                <div className="detail-row">
                  <label>领用原因：</label>
                  <span>{currentApplication.reason}</span>
                </div>
                {currentApplication.remark && (
                  <div className="detail-row">
                    <label>备注：</label>
                    <span>{currentApplication.remark}</span>
                  </div>
                )}
                <div className="detail-row">
                  <label>申请时间：</label>
                  <span>{formatDate(currentApplication.created_at)}</span>
                </div>
                {currentApplication.status !== 'pending' && (
                  <>
                    <div className="detail-row">
                      <label>审批人：</label>
                      <span>{currentApplication.approver_name || '-'}</span>
                    </div>
                    {currentApplication.approve_comment && (
                      <div className="detail-row">
                        <label>审批意见：</label>
                        <span>{currentApplication.approve_comment}</span>
                      </div>
                    )}
                    {currentApplication.reject_reason && (
                      <div className="detail-row">
                        <label>拒绝原因：</label>
                        <span className="reject-reason">{currentApplication.reject_reason}</span>
                      </div>
                    )}
                    <div className="detail-row">
                      <label>审批时间：</label>
                      <span>{formatDate(currentApplication.approved_at || currentApplication.rejected_at)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="detail-section">
                <h4>领用物资明细</h4>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>物资名称</th>
                      <th>规格型号</th>
                      <th>单位</th>
                      <th>申请数量</th>
                      <th>当时可领</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentApplication.items?.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>{item.material_name}</td>
                        <td>{item.specification || '-'}</td>
                        <td>{item.unit || '-'}</td>
                        <td>{item.quantity}</td>
                        <td>{item.available_quantity}</td>
                        <td>{item.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="modal-footer">
              {currentApplication.status === 'pending' && activeTab === 'my' && (
                <>
                  <button className="btn-danger" onClick={() => handleDelete(currentApplication.id)}>
                    撤销申请
                  </button>
                </>
              )}
              {currentApplication.status === 'pending' && activeTab === 'pending' && (
                <>
                  <button 
                    className="btn-danger" 
                    onClick={() => {
                      const reason = prompt('请输入拒绝原因：');
                      if (reason !== null) {
                        handleReject(currentApplication.id, reason);
                      }
                    }}
                  >
                    拒绝
                  </button>
                  <button 
                    className="btn-primary"
                    onClick={() => {
                      const comment = prompt('审批意见（可选）：');
                      if (comment !== null) {
                        handleApprove(currentApplication.id, comment);
                      }
                    }}
                  >
                    审批通过
                  </button>
                </>
              )}
              {currentApplication.status !== 'pending' && (
                <button className="btn-secondary" onClick={() => setShowDetailModal(false)}>
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockOutApply;
