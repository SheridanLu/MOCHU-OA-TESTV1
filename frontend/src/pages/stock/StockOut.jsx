/**
 * 物资出库管理
 * Task 41: 出库单生成
 * 
 * 功能：
 * - 出库单列表
 * - 新建出库单（选择领用申请）
 * - 出库物资明细
 * - 打印出库单
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
  confirmed: { text: '已出库', color: '#52c41a' },
  cancelled: { text: '已取消', color: '#ff4d4f' }
};

function StockOut() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  
  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [currentStockOut, setCurrentStockOut] = useState(null);
  const [printData, setPrintData] = useState(null);
  
  // 新建出库单
  const [approvedApplications, setApprovedApplications] = useState([]);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [newStockOut, setNewStockOut] = useState({
    project_id: '',
    application_id: '',
    items: [],
    remark: ''
  });

  useEffect(() => {
    fetchList();
  }, [pagination.page, filters]);

  // 获取出库单列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);

      const response = await fetch(`${API_BASE}/stock/out?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setList(result.data);
        setPagination(prev => ({ ...prev, total: result.pagination.total }));
      }
    } catch (error) {
      console.error('获取出库单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取已审批的领用申请
  const fetchApprovedApplications = async (keyword = '') => {
    try {
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);

      const response = await fetch(`${API_BASE}/stock/out/applications/approved?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setApprovedApplications(result.data);
      }
    } catch (error) {
      console.error('获取领用申请失败:', error);
    }
  };

  // 打开新建弹窗
  const handleOpenCreate = async () => {
    await fetchApprovedApplications();
    setNewStockOut({
      project_id: '',
      application_id: '',
      items: [],
      remark: ''
    });
    setSelectedApplication(null);
    setShowCreateModal(true);
  };

  // 选择领用申请
  const handleSelectApplication = (application) => {
    setSelectedApplication(application);
    setNewStockOut(prev => ({
      ...prev,
      project_id: application.project_id,
      application_id: application.id,
      items: application.items.map(item => ({
        material_id: item.material_id,
        material_name: item.material_name,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: 0, // 需要用户填写
        remark: ''
      }))
    }));
  };

  // 更新出库物资
  const handleItemChange = (index, field, value) => {
    setNewStockOut(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  // 创建出库单
  const handleCreate = async () => {
    if (!newStockOut.application_id) {
      alert('请选择领用申请');
      return;
    }
    if (newStockOut.items.length === 0) {
      alert('请添加出库物资');
      return;
    }
    
    // 检查是否所有物资都填写了单价
    const hasEmptyPrice = newStockOut.items.some(item => !item.unit_price || item.unit_price <= 0);
    if (hasEmptyPrice) {
      alert('请填写所有物资的单价');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/out`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newStockOut)
      });
      const result = await response.json();

      if (result.success) {
        alert('出库单创建成功');
        setShowCreateModal(false);
        fetchList();
      } else {
        alert(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建出库单失败:', error);
      alert('创建失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/out/${id}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setCurrentStockOut(result.data);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('获取出库单详情失败:', error);
    }
  };

  // 确认出库
  const handleConfirm = async (id) => {
    if (!window.confirm('确认出库后将扣减库存，确定继续吗？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/out/${id}/confirm`, {
        method: 'PUT',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        alert('出库确认成功');
        setShowDetailModal(false);
        fetchList();
      } else {
        alert(result.message || '确认失败');
      }
    } catch (error) {
      console.error('确认出库失败:', error);
      alert('确认失败');
    }
  };

  // 删除出库单
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除该出库单吗？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/out/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        alert('删除成功');
        setShowDetailModal(false);
        fetchList();
      } else {
        alert(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除出库单失败:', error);
      alert('删除失败');
    }
  };

  // 打印出库单
  const handlePrint = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/out/print/${id}`, {
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

  // 执行打印
  const doPrint = () => {
    window.print();
  };

  // 搜索
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchList();
  };

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  // 格式化金额
  const formatAmount = (amount) => {
    return parseFloat(amount || 0).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="stock-in-page">
      <div className="page-header">
        <h2>物资出库管理</h2>
        <button className="btn-primary" onClick={handleOpenCreate}>
          + 新建出库单
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="filter-bar">
        <div className="filter-item">
          <label>状态：</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">全部</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已出库</option>
          </select>
        </div>
        <div className="filter-item">
          <label>搜索：</label>
          <input
            type="text"
            placeholder="出库单号/项目名称/申请单号"
            value={filters.keyword}
            onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button className="btn-search" onClick={handleSearch}>搜索</button>
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
                <th>出库单号</th>
                <th>项目名称</th>
                <th>领用申请</th>
                <th>物资数量</th>
                <th>总金额</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id}>
                  <td>{item.stock_out_no}</td>
                  <td>{item.project_name || '-'}</td>
                  <td>{item.application_no || '-'}</td>
                  <td>{item.item_count} 项</td>
                  <td>¥{formatAmount(item.total_amount)}</td>
                  <td>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: STATUS_MAP[item.status]?.color || '#999' }}
                    >
                      {STATUS_MAP[item.status]?.text || item.status}
                    </span>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <button className="btn-link" onClick={() => handleViewDetail(item.id)}>
                      详情
                    </button>
                    {item.status === 'draft' && (
                      <button className="btn-link" onClick={() => handlePrint(item.id)}>
                        打印
                      </button>
                    )}
                    {item.status === 'confirmed' && (
                      <button className="btn-link" onClick={() => handlePrint(item.id)}>
                        打印
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

      {/* 新建出库单弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content create-modal">
            <div className="modal-header">
              <h3>新建出库单</h3>
              <button className="btn-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* 第一步：选择领用申请 */}
              {!selectedApplication ? (
                <div className="step-content">
                  <h4>选择领用申请</h4>
                  <div className="search-box">
                    <input
                      type="text"
                      placeholder="搜索领用申请..."
                      onChange={(e) => fetchApprovedApplications(e.target.value)}
                    />
                  </div>
                  <div className="application-list">
                    {approvedApplications.map(app => (
                      <div
                        key={app.id}
                        className={`purchase-item ${app.stock_out_count > 0 ? 'disabled' : ''}`}
                        onClick={() => {
                          if (app.stock_out_count === 0) {
                            handleSelectApplication(app);
                          }
                        }}
                        style={{
                          opacity: app.stock_out_count > 0 ? 0.5 : 1,
                          cursor: app.stock_out_count > 0 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <div className="purchase-no">{app.application_no}</div>
                        <div className="purchase-info">
                          <span>项目：{app.project_name || '-'}</span>
                          <span>申请人：{app.applicant_name || '-'}</span>
                        </div>
                        <div className="purchase-supplier">
                          领用原因：{app.reason || '-'}
                          {app.stock_out_count > 0 && (
                            <span style={{ color: '#ff4d4f', marginLeft: '10px' }}>
                              (已创建出库单)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {approvedApplications.length === 0 && (
                      <div className="empty-tip">暂无可出库的领用申请</div>
                    )}
                  </div>
                </div>
              ) : (
                /* 第二步：填写出库信息 */
                <div className="step-content">
                  <div className="selected-purchase">
                    <span>领用申请：{selectedApplication.application_no}</span>
                    <span>项目：{selectedApplication.project_name}</span>
                  </div>

                  <div className="form-item">
                    <label>出库物资明细：</label>
                    <table className="items-table">
                      <thead>
                        <tr>
                          <th>物资名称</th>
                          <th>规格型号</th>
                          <th>单位</th>
                          <th>数量</th>
                          <th>单价</th>
                          <th>金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newStockOut.items.map((item, index) => (
                          <tr key={index}>
                            <td>{item.material_name}</td>
                            <td>{item.specification || '-'}</td>
                            <td>{item.unit || '-'}</td>
                            <td>{item.quantity}</td>
                            <td>
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                placeholder="请输入单价"
                              />
                            </td>
                            <td>¥{formatAmount(item.quantity * item.unit_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'right' }}>合计：</td>
                          <td>¥{formatAmount(
                            newStockOut.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
                          )}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="form-item">
                    <label>备注：</label>
                    <textarea
                      value={newStockOut.remark}
                      onChange={(e) => setNewStockOut(prev => ({ ...prev, remark: e.target.value }))}
                      placeholder="请输入备注"
                    />
                  </div>
                </div>
              )}
            </div>
            {selectedApplication && (
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setSelectedApplication(null)}>
                  返回选择
                </button>
                <button className="btn-primary" onClick={handleCreate}>
                  创建出库单
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetailModal && currentStockOut && (
        <div className="modal-overlay">
          <div className="modal-content detail-modal">
            <div className="modal-header">
              <h3>出库单详情 - {currentStockOut.stock_out_no}</h3>
              <button className="btn-close" onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <div className="detail-row">
                  <label>出库单号：</label>
                  <span>{currentStockOut.stock_out_no}</span>
                </div>
                <div className="detail-row">
                  <label>领用申请：</label>
                  <span>{currentStockOut.application_no || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>关联项目：</label>
                  <span>{currentStockOut.project_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>领用原因：</label>
                  <span>{currentStockOut.application_reason || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>申请人：</label>
                  <span>{currentStockOut.applicant_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>状态：</label>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: STATUS_MAP[currentStockOut.status]?.color }}
                  >
                    {STATUS_MAP[currentStockOut.status]?.text}
                  </span>
                </div>
                <div className="detail-row">
                  <label>出库人：</label>
                  <span>{currentStockOut.operator_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>创建时间：</label>
                  <span>{formatDate(currentStockOut.created_at)}</span>
                </div>
                {currentStockOut.remark && (
                  <div className="detail-row">
                    <label>备注：</label>
                    <span>{currentStockOut.remark}</span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h4>出库物资明细</h4>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>序号</th>
                      <th>物资名称</th>
                      <th>规格型号</th>
                      <th>单位</th>
                      <th>数量</th>
                      <th>单价</th>
                      <th>金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentStockOut.items?.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>{item.material_name}</td>
                        <td>{item.specification || '-'}</td>
                        <td>{item.unit || '-'}</td>
                        <td>{item.quantity}</td>
                        <td>¥{formatAmount(item.unit_price)}</td>
                        <td>¥{formatAmount(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right' }}>合计：</td>
                      <td>{currentStockOut.summary?.total_quantity || 0}</td>
                      <td></td>
                      <td>¥{formatAmount(currentStockOut.summary?.total_amount || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              {currentStockOut.status === 'draft' && (
                <>
                  <button className="btn-danger" onClick={() => handleDelete(currentStockOut.id)}>
                    删除
                  </button>
                  <button className="btn-secondary" onClick={() => handlePrint(currentStockOut.id)}>
                    打印
                  </button>
                  <button className="btn-primary" onClick={() => handleConfirm(currentStockOut.id)}>
                    确认出库
                  </button>
                </>
              )}
              {currentStockOut.status === 'confirmed' && (
                <button className="btn-secondary" onClick={() => handlePrint(currentStockOut.id)}>
                  打印
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 打印弹窗 */}
      {showPrintModal && printData && (
        <div className="modal-overlay print-overlay">
          <div className="print-container">
            <div className="print-actions">
              <button className="btn-primary" onClick={doPrint}>打印</button>
              <button className="btn-secondary" onClick={() => setShowPrintModal(false)}>关闭</button>
            </div>
            <div className="print-content">
              <div className="print-header">
                <h1>物资出库单</h1>
                <div className="print-no">单号：{printData.stock_out_no}</div>
              </div>
              
              <div className="print-info">
                <div className="print-row">
                  <div><label>项目：</label><span>{printData.project?.name || '-'}</span></div>
                  <div><label>项目编号：</label><span>{printData.project?.project_no || '-'}</span></div>
                  <div><label>申请人：</label><span>{printData.applicant_name || '-'}</span></div>
                </div>
                <div className="print-row">
                  <div><label>领用申请：</label><span>{printData.application?.no || '-'}</span></div>
                  <div><label>领用原因：</label><span>{printData.application?.reason || '-'}</span></div>
                  <div><label>出库人：</label><span>{printData.operator_name || '-'}</span></div>
                </div>
                <div className="print-row">
                  <div><label>出库时间：</label><span>{formatDate(printData.created_at)}</span></div>
                  <div><label>状态：</label><span>{STATUS_MAP[printData.status]?.text || printData.status}</span></div>
                  <div></div>
                </div>
              </div>

              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>序号</th>
                    <th>物资名称</th>
                    <th>规格型号</th>
                    <th style={{ width: '60px' }}>单位</th>
                    <th style={{ width: '80px' }}>数量</th>
                    <th style={{ width: '100px' }}>单价</th>
                    <th style={{ width: '100px' }}>金额</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {printData.items.map((item, index) => (
                    <tr key={index}>
                      <td style={{ textAlign: 'center' }}>{item.index}</td>
                      <td>{item.material_name}</td>
                      <td>{item.specification}</td>
                      <td style={{ textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>¥{formatAmount(item.unit_price)}</td>
                      <td style={{ textAlign: 'right' }}>¥{formatAmount(item.amount)}</td>
                      <td>{item.remark}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'right' }}>合计：</td>
                    <td style={{ textAlign: 'right' }}>{printData.summary.total_quantity}</td>
                    <td></td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                      ¥{formatAmount(printData.summary.total_amount)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              {printData.remark && (
                <div className="print-remark">
                  <label>备注：</label>
                  <span>{printData.remark}</span>
                </div>
              )}

              <div className="print-footer">
                <div className="print-sign">
                  <div>领用人签字：_______________</div>
                  <div>日期：_______________</div>
                </div>
                <div className="print-sign">
                  <div>库管员签字：_______________</div>
                  <div>日期：_______________</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockOut;
