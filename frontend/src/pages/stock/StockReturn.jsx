/**
 * 物资退库管理
 * Task 43: 物资退库
 * 
 * 功能：
 * - 退库单列表
 * - 新建退库单（选择出库记录）
 * - 退库物资明细
 * - 打印退库单
 */

import React, { useState, useEffect } from 'react';
import './StockIn.css'; // 复用入库页面的样式

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
  draft: { text: '草稿', color: '#999' },
  confirmed: { text: '已确认', color: '#52c41a' },
  cancelled: { text: '已取消', color: '#ff4d4f' }
};

function StockReturn() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  
  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [currentReturn, setCurrentReturn] = useState(null);
  const [printData, setPrintData] = useState(null);
  
  // 新建退库单
  const [stockOutList, setStockOutList] = useState([]);
  const [selectedStockOut, setSelectedStockOut] = useState(null);
  const [newReturn, setNewReturn] = useState({
    stock_out_id: '',
    project_id: '',
    items: [],
    remark: ''
  });

  useEffect(() => {
    fetchList();
  }, [pagination.page, filters]);

  // 获取退库单列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);

      const response = await fetch(`${API_BASE}/stock/return?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setList(result.data);
        setPagination(prev => ({ ...prev, total: result.pagination.total }));
      }
    } catch (error) {
      console.error('获取退库单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取可退库的出库单列表
  const fetchStockOutList = async (keyword = '') => {
    try {
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);

      const response = await fetch(`${API_BASE}/stock/return/out-list?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setStockOutList(result.data);
      }
    } catch (error) {
      console.error('获取出库单列表失败:', error);
    }
  };

  // 打开新建弹窗
  const handleOpenCreate = async () => {
    await fetchStockOutList();
    setNewReturn({
      stock_out_id: '',
      project_id: '',
      items: [],
      remark: ''
    });
    setSelectedStockOut(null);
    setShowCreateModal(true);
  };

  // 选择出库单
  const handleSelectStockOut = (stockOut) => {
    setSelectedStockOut(stockOut);
    setNewReturn(prev => ({
      ...prev,
      stock_out_id: stockOut.id,
      project_id: stockOut.project_id,
      items: stockOut.items.map(item => ({
        material_name: item.material_name,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity, // 默认全部退库
        unit_price: item.unit_price,
        reason: '' // 退库原因需要填写
      }))
    }));
  };

  // 更新退库物资
  const handleItemChange = (index, field, value) => {
    setNewReturn(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  // 创建退库单
  const handleCreate = async () => {
    if (!newReturn.stock_out_id) {
      alert('请选择出库单');
      return;
    }
    if (newReturn.items.length === 0) {
      alert('请添加退库物资');
      return;
    }
    
    // 检查退库原因
    const hasEmptyReason = newReturn.items.some(item => !item.reason || item.reason.trim() === '');
    if (hasEmptyReason) {
      alert('请填写所有物资的退库原因');
      return;
    }

    // 检查退库数量
    const hasZeroQuantity = newReturn.items.some(item => !item.quantity || item.quantity <= 0);
    if (hasZeroQuantity) {
      alert('退库数量必须大于0');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/return`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newReturn)
      });
      const result = await response.json();

      if (result.success) {
        alert('退库单创建成功');
        setShowCreateModal(false);
        fetchList();
      } else {
        alert(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建退库单失败:', error);
      alert('创建失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/return/${id}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setCurrentReturn(result.data);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('获取退库单详情失败:', error);
    }
  };

  // 确认退库
  const handleConfirm = async (id) => {
    if (!confirm('确认退库后库存将增加，是否继续？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/return/${id}/confirm`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        alert('退库确认成功，库存已增加');
        fetchList();
        if (showDetailModal && currentReturn && currentReturn.id === id) {
          setCurrentReturn(result.data.stock_return);
        }
      } else {
        alert(result.message || '确认失败');
      }
    } catch (error) {
      console.error('确认退库失败:', error);
      alert('确认失败');
    }
  };

  // 删除退库单
  const handleDelete = async (id) => {
    if (!confirm('确定要删除此退库单吗？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/return/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        alert('退库单删除成功');
        fetchList();
      } else {
        alert(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除退库单失败:', error);
      alert('删除失败');
    }
  };

  // 打印退库单
  const handlePrint = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/return/print/${id}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setPrintData(result.data);
        setShowPrintModal(true);
      }
    } catch (error) {
      console.error('获取打印数据失败:', error);
    }
  };

  // 格式化金额
  const formatAmount = (amount) => {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
  };

  // 执行打印
  const doPrint = () => {
    window.print();
  };

  return (
    <div className="stock-in-page">
      <div className="page-header">
        <h2>物资退库管理</h2>
        <button className="btn-primary" onClick={handleOpenCreate}>
          + 新建退库单
        </button>
      </div>

      {/* 筛选条件 */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="搜索退库单号/项目名称/出库单号"
          value={filters.keyword}
          onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
          style={{ width: '280px' }}
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="confirmed">已确认</option>
        </select>
        <button className="btn-secondary" onClick={() => setPagination(prev => ({ ...prev, page: 1 }))}>
          搜索
        </button>
      </div>

      {/* 退库单列表 */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>退库单号</th>
              <th>关联出库单</th>
              <th>项目名称</th>
              <th>物资数量</th>
              <th>总金额</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>加载中...</td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center' }}>暂无数据</td>
              </tr>
            ) : (
              list.map(item => (
                <tr key={item.id}>
                  <td>{item.return_no}</td>
                  <td>{item.stock_out_no || '-'}</td>
                  <td>{item.project_name || '-'}</td>
                  <td>{item.total_quantity} ({item.item_count}项)</td>
                  <td>¥{formatAmount(item.total_amount)}</td>
                  <td>
                    <span style={{ 
                      color: STATUS_MAP[item.status]?.color || '#999',
                      fontWeight: 'bold'
                    }}>
                      {STATUS_MAP[item.status]?.text || item.status}
                    </span>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div className="action-btns">
                      <button className="btn-link" onClick={() => handleViewDetail(item.id)}>
                        详情
                      </button>
                      {item.status === 'draft' && (
                        <>
                          <button className="btn-link success" onClick={() => handleConfirm(item.id)}>
                            确认
                          </button>
                          <button className="btn-link danger" onClick={() => handleDelete(item.id)}>
                            删除
                          </button>
                        </>
                      )}
                      {item.status === 'confirmed' && (
                        <button className="btn-link" onClick={() => handlePrint(item.id)}>
                          打印
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
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

      {/* 新建退库单弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '900px', maxWidth: '95vw' }}>
            <div className="modal-header">
              <h3>新建退库单</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* 步骤1：选择出库单 */}
              {!selectedStockOut ? (
                <div className="step-section">
                  <h4>选择出库单</h4>
                  <div className="search-bar" style={{ marginBottom: '15px' }}>
                    <input
                      type="text"
                      placeholder="搜索出库单号/项目名称"
                      onChange={(e) => fetchStockOutList(e.target.value)}
                      style={{ width: '300px' }}
                    />
                  </div>
                  <div className="stock-out-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {stockOutList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                        暂无可退库的出库单
                      </div>
                    ) : (
                      stockOutList.map(stockOut => (
                        <div 
                          key={stockOut.id} 
                          className="stock-out-card"
                          style={{ 
                            border: '1px solid #e8e8e8', 
                            borderRadius: '4px', 
                            padding: '12px', 
                            marginBottom: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => handleSelectStockOut(stockOut)}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#1890ff'}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e8e8e8'}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 'bold' }}>{stockOut.stock_out_no}</span>
                            <span style={{ color: '#52c41a' }}>已确认</span>
                          </div>
                          <div style={{ color: '#666', marginTop: '5px' }}>
                            项目：{stockOut.project_name} ({stockOut.project_no})
                          </div>
                          <div style={{ color: '#999', fontSize: '12px', marginTop: '5px' }}>
                            物资数量：{stockOut.item_count}项 | 
                            出库日期：{formatDate(stockOut.confirmed_at)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                /* 步骤2：填写退库明细 */
                <div className="step-section">
                  <div className="selected-info" style={{ 
                    background: '#f6f6f6', 
                    padding: '12px', 
                    borderRadius: '4px', 
                    marginBottom: '15px' 
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 'bold' }}>已选择出库单：{selectedStockOut.stock_out_no}</span>
                        <span style={{ color: '#666', marginLeft: '15px' }}>
                          项目：{selectedStockOut.project_name}
                        </span>
                      </div>
                      <button 
                        className="btn-link"
                        onClick={() => {
                          setSelectedStockOut(null);
                          setNewReturn(prev => ({ ...prev, stock_out_id: '', project_id: '', items: [] }));
                        }}
                      >
                        重新选择
                      </button>
                    </div>
                  </div>

                  <h4>退库物资明细</h4>
                  <p style={{ color: '#ff4d4f', fontSize: '12px', marginBottom: '10px' }}>
                    * 退库原因必填
                  </p>
                  <table className="data-table" style={{ marginBottom: '15px' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }}>#</th>
                        <th>物资名称</th>
                        <th>规格型号</th>
                        <th>单位</th>
                        <th>可退数量</th>
                        <th style={{ width: '100px' }}>退库数量</th>
                        <th>单价</th>
                        <th>金额</th>
                        <th style={{ width: '200px' }}>退库原因 *</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newReturn.items.map((item, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td>{item.material_name}</td>
                          <td>{item.specification || '-'}</td>
                          <td>{item.unit || '-'}</td>
                          <td>{selectedStockOut.items[index]?.quantity || 0}</td>
                          <td>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                              min="0"
                              max={selectedStockOut.items[index]?.quantity || 0}
                              style={{ width: '80px' }}
                            />
                          </td>
                          <td>¥{formatAmount(item.unit_price)}</td>
                          <td>¥{formatAmount((item.quantity || 0) * (item.unit_price || 0))}</td>
                          <td>
                            <input
                              type="text"
                              value={item.reason}
                              onChange={(e) => handleItemChange(index, 'reason', e.target.value)}
                              placeholder="请填写退库原因"
                              style={{ width: '100%' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* 汇总信息 */}
                  <div className="summary-info" style={{ 
                    background: '#f6f6f6', 
                    padding: '12px', 
                    borderRadius: '4px',
                    marginBottom: '15px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>退库物资：{newReturn.items.length} 项</span>
                      <span>
                        退库总金额：
                        <span style={{ fontWeight: 'bold', color: '#1890ff', fontSize: '16px' }}>
                          ¥{formatAmount(newReturn.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0), 0))}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* 备注 */}
                  <div className="form-group">
                    <label>备注</label>
                    <textarea
                      value={newReturn.remark}
                      onChange={(e) => setNewReturn(prev => ({ ...prev, remark: e.target.value }))}
                      placeholder="请输入备注信息"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {selectedStockOut && (
                <>
                  <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                    取消
                  </button>
                  <button className="btn-primary" onClick={handleCreate}>
                    创建退库单
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetailModal && currentReturn && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: '900px', maxWidth: '95vw' }}>
            <div className="modal-header">
              <h3>退库单详情</h3>
              <button className="close-btn" onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* 基本信息 */}
              <div className="info-section" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '15px',
                marginBottom: '20px'
              }}>
                <div>
                  <label style={{ color: '#999' }}>退库单号</label>
                  <div style={{ fontWeight: 'bold' }}>{currentReturn.return_no}</div>
                </div>
                <div>
                  <label style={{ color: '#999' }}>关联出库单</label>
                  <div>{currentReturn.stock_out_no}</div>
                </div>
                <div>
                  <label style={{ color: '#999' }}>项目名称</label>
                  <div>{currentReturn.project_name}</div>
                </div>
                <div>
                  <label style={{ color: '#999' }}>状态</label>
                  <div>
                    <span style={{ 
                      color: STATUS_MAP[currentReturn.status]?.color || '#999',
                      fontWeight: 'bold'
                    }}>
                      {STATUS_MAP[currentReturn.status]?.text || currentReturn.status}
                    </span>
                  </div>
                </div>
                <div>
                  <label style={{ color: '#999' }}>创建时间</label>
                  <div>{formatDate(currentReturn.created_at)}</div>
                </div>
                <div>
                  <label style={{ color: '#999' }}>确认时间</label>
                  <div>{currentReturn.confirmed_at ? formatDate(currentReturn.confirmed_at) : '-'}</div>
                </div>
              </div>

              {/* 物资明细 */}
              <h4 style={{ marginBottom: '10px' }}>退库物资明细</h4>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>物资名称</th>
                    <th>规格型号</th>
                    <th>单位</th>
                    <th>退库数量</th>
                    <th>单价</th>
                    <th>金额</th>
                    <th>退库原因</th>
                  </tr>
                </thead>
                <tbody>
                  {currentReturn.items && currentReturn.items.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.material_name}</td>
                      <td>{item.specification || '-'}</td>
                      <td>{item.unit || '-'}</td>
                      <td>{item.quantity}</td>
                      <td>¥{formatAmount(item.unit_price)}</td>
                      <td>¥{formatAmount(item.amount)}</td>
                      <td>{item.reason || '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 'bold', background: '#fafafa' }}>
                    <td colSpan="4">合计</td>
                    <td>{currentReturn.summary?.total_quantity || 0}</td>
                    <td></td>
                    <td>¥{formatAmount(currentReturn.summary?.total_amount || 0)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {/* 备注 */}
              {currentReturn.remark && (
                <div style={{ marginTop: '15px' }}>
                  <label style={{ color: '#999' }}>备注</label>
                  <div>{currentReturn.remark}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDetailModal(false)}>
                关闭
              </button>
              {currentReturn.status === 'draft' && (
                <>
                  <button className="btn-primary" onClick={() => {
                    handleConfirm(currentReturn.id);
                  }}>
                    确认退库
                  </button>
                  <button className="btn-danger" onClick={() => {
                    handleDelete(currentReturn.id);
                    setShowDetailModal(false);
                  }}>
                    删除
                  </button>
                </>
              )}
              {currentReturn.status === 'confirmed' && (
                <button className="btn-primary" onClick={() => {
                  handlePrint(currentReturn.id);
                }}>
                  打印
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 打印弹窗 */}
      {showPrintModal && printData && (
        <div className="modal-overlay">
          <div className="modal-content print-modal" style={{ width: '800px', maxWidth: '95vw' }}>
            <div className="modal-header no-print">
              <h3>打印退库单</h3>
              <button className="close-btn" onClick={() => setShowPrintModal(false)}>×</button>
            </div>
            <div className="modal-body print-content" style={{ padding: '30px' }}>
              {/* 打印内容 */}
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <h2 style={{ margin: 0 }}>物资退库单</h2>
                <p style={{ margin: '10px 0 0', color: '#666' }}>{printData.return_no}</p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <table style={{ width: '100%', fontSize: '14px' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '5px 0', width: '15%' }}>项目名称：</td>
                      <td style={{ padding: '5px 0', width: '35%' }}>{printData.project?.name}</td>
                      <td style={{ padding: '5px 0', width: '15%' }}>项目编号：</td>
                      <td style={{ padding: '5px 0', width: '35%' }}>{printData.project?.project_no}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '5px 0' }}>关联出库单：</td>
                      <td style={{ padding: '5px 0' }}>{printData.stock_out_no}</td>
                      <td style={{ padding: '5px 0' }}>退库日期：</td>
                      <td style={{ padding: '5px 0' }}>{formatDate(printData.confirmed_at || printData.created_at)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <table className="print-table" style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                marginBottom: '20px'
              }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ border: '1px solid #ddd', padding: '10px', width: '40px' }}>序号</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px' }}>物资名称</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px' }}>规格型号</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px', width: '60px' }}>单位</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px', width: '80px' }}>退库数量</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px', width: '100px' }}>单价</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px', width: '100px' }}>金额</th>
                    <th style={{ border: '1px solid #ddd', padding: '10px' }}>退库原因</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.items.map((item, index) => (
                    <tr key={index}>
                      <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{item.index}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.material_name}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.specification}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right' }}>¥{formatAmount(item.unit_price)}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'right' }}>¥{formatAmount(item.amount)}</td>
                      <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fafafa', fontWeight: 'bold' }}>
                    <td colSpan="4" style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>合计</td>
                    <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'right' }}>{printData.summary.total_quantity}</td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}></td>
                    <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'right' }}>¥{formatAmount(printData.summary.total_amount)}</td>
                    <td style={{ border: '1px solid #ddd', padding: '10px' }}></td>
                  </tr>
                </tfoot>
              </table>

              {printData.remark && (
                <div style={{ marginBottom: '20px' }}>
                  <span style={{ color: '#999' }}>备注：</span>
                  <span>{printData.remark}</span>
                </div>
              )}

              {/* 签字栏 */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginTop: '50px',
                paddingTop: '20px',
                borderTop: '1px dashed #ddd'
              }}>
                <div style={{ width: '45%' }}>
                  <span>退库人签字：</span>
                  <span style={{ borderBottom: '1px solid #333', display: 'inline-block', width: '150px' }}></span>
                </div>
                <div style={{ width: '45%' }}>
                  <span>库管员签字：</span>
                  <span style={{ borderBottom: '1px solid #333', display: 'inline-block', width: '150px' }}></span>
                </div>
              </div>

              <div style={{ marginTop: '30px', textAlign: 'right', color: '#999', fontSize: '12px' }}>
                打印时间：{new Date().toLocaleString('zh-CN')}
              </div>
            </div>
            <div className="modal-footer no-print">
              <button className="btn-secondary" onClick={() => setShowPrintModal(false)}>
                关闭
              </button>
              <button className="btn-primary" onClick={doPrint}>
                打印
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockReturn;
