/**
 * 物资入库管理
 * Task 38: 入库单生成
 * 
 * 功能：
 * - 入库单列表
 * - 新建入库单（关联采购订单）
 * - 入库物资明细
 * - 打印入库单
 */

import React, { useState, useEffect, useRef } from 'react';
import './StockIn.css';

const API_BASE = 'http://localhost:3001/api';

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
  confirmed: { text: '已入库', color: '#52c41a' }
};

function StockIn() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  
  // 弹窗状态
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [currentStockIn, setCurrentStockIn] = useState(null);
  const [printData, setPrintData] = useState(null);
  
  // 新建入库单
  const [availablePurchases, setAvailablePurchases] = useState([]);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [newStockIn, setNewStockIn] = useState({
    purchase_id: '',
    supplier_id: '',
    items: [],
    remark: ''
  });

  useEffect(() => {
    fetchList();
  }, [pagination.page, filters]);

  // 获取入库单列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);

      const response = await fetch(`${API_BASE}/stock/in?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setList(result.data);
        setPagination(prev => ({ ...prev, total: result.pagination.total }));
      }
    } catch (error) {
      console.error('获取入库单列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取可入库的采购订单
  const fetchAvailablePurchases = async (keyword = '') => {
    try {
      const params = new URLSearchParams();
      if (keyword) params.append('keyword', keyword);

      const response = await fetch(`${API_BASE}/stock/in/purchases/available?${params}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setAvailablePurchases(result.data);
      }
    } catch (error) {
      console.error('获取采购订单失败:', error);
    }
  };

  // 获取采购订单明细
  const fetchPurchaseItems = async (purchaseId) => {
    try {
      const response = await fetch(`${API_BASE}/stock/in/purchase/${purchaseId}/items`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setPurchaseItems(result.data.items);
        // 自动填充入库物资（默认全部待入库数量）
        const items = result.data.items
          .filter(item => item.pending_quantity > 0)
          .map(item => ({
            material_name: item.material_name,
            specification: item.specification,
            unit: item.unit,
            quantity: item.pending_quantity,
            unit_price: item.unit_price,
            remark: ''
          }));
        setNewStockIn(prev => ({
          ...prev,
          items,
          supplier_id: result.data.purchase.supplier_id
        }));
      }
    } catch (error) {
      console.error('获取采购订单明细失败:', error);
    }
  };

  // 打开新建弹窗
  const handleOpenCreate = async () => {
    await fetchAvailablePurchases();
    setNewStockIn({
      purchase_id: '',
      supplier_id: '',
      items: [],
      remark: ''
    });
    setSelectedPurchase(null);
    setPurchaseItems([]);
    setShowCreateModal(true);
  };

  // 选择采购订单
  const handleSelectPurchase = (purchase) => {
    setSelectedPurchase(purchase);
    setNewStockIn(prev => ({
      ...prev,
      purchase_id: purchase.id
    }));
    fetchPurchaseItems(purchase.id);
  };

  // 更新入库物资
  const handleItemChange = (index, field, value) => {
    setNewStockIn(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  // 创建入库单
  const handleCreate = async () => {
    if (!newStockIn.purchase_id) {
      alert('请选择采购订单');
      return;
    }
    if (newStockIn.items.length === 0) {
      alert('请添加入库物资');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/in`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newStockIn)
      });
      const result = await response.json();

      if (result.success) {
        alert('入库单创建成功');
        setShowCreateModal(false);
        fetchList();
      } else {
        alert(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建入库单失败:', error);
      alert('创建失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/in/${id}`, {
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setCurrentStockIn(result.data);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('获取入库单详情失败:', error);
    }
  };

  // 确认入库
  const handleConfirm = async (id) => {
    if (!window.confirm('确认入库后将更新库存，确定继续吗？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/in/${id}/confirm`, {
        method: 'POST',
        headers: getHeaders()
      });
      const result = await response.json();

      if (result.success) {
        alert('入库确认成功');
        setShowDetailModal(false);
        fetchList();
      } else {
        alert(result.message || '确认失败');
      }
    } catch (error) {
      console.error('确认入库失败:', error);
      alert('确认失败');
    }
  };

  // 删除入库单
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除该入库单吗？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/stock/in/${id}`, {
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
      console.error('删除入库单失败:', error);
      alert('删除失败');
    }
  };

  // 打印入库单
  const handlePrint = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/stock/in/${id}/print`, {
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
        <h2>物资入库管理</h2>
        <button className="btn-primary" onClick={handleOpenCreate}>
          + 新建入库单
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
            <option value="confirmed">已入库</option>
          </select>
        </div>
        <div className="filter-item">
          <label>搜索：</label>
          <input
            type="text"
            placeholder="入库单号/供应商"
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
                <th>入库单号</th>
                <th>采购订单</th>
                <th>供应商</th>
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
                  <td>{item.stock_in_no}</td>
                  <td>{item.purchase_no || '-'}</td>
                  <td>{item.supplier_name || '-'}</td>
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

      {/* 新建入库单弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content create-modal">
            <div className="modal-header">
              <h3>新建入库单</h3>
              <button className="btn-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* 第一步：选择采购订单 */}
              {!selectedPurchase ? (
                <div className="step-content">
                  <h4>选择采购订单</h4>
                  <div className="search-box">
                    <input
                      type="text"
                      placeholder="搜索采购订单..."
                      onChange={(e) => fetchAvailablePurchases(e.target.value)}
                    />
                  </div>
                  <div className="purchase-list">
                    {availablePurchases.map(purchase => (
                      <div
                        key={purchase.id}
                        className="purchase-item"
                        onClick={() => handleSelectPurchase(purchase)}
                      >
                        <div className="purchase-no">{purchase.batch_no}</div>
                        <div className="purchase-info">
                          <span>合同：{purchase.contract_name || '-'}</span>
                          <span>项目：{purchase.project_name || '-'}</span>
                        </div>
                        <div className="purchase-supplier">
                          供应商：{purchase.supplier_name || '-'}
                        </div>
                      </div>
                    ))}
                    {availablePurchases.length === 0 && (
                      <div className="empty-tip">暂无可入库的采购订单</div>
                    )}
                  </div>
                </div>
              ) : (
                /* 第二步：填写入库信息 */
                <div className="step-content">
                  <div className="selected-purchase">
                    <span>采购订单：{selectedPurchase.batch_no}</span>
                    <span>供应商：{selectedPurchase.supplier_name}</span>
                  </div>

                  <div className="form-item">
                    <label>入库物资明细：</label>
                    <table className="items-table">
                      <thead>
                        <tr>
                          <th>物资名称</th>
                          <th>规格型号</th>
                          <th>单位</th>
                          <th>入库数量</th>
                          <th>单价</th>
                          <th>金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {newStockIn.items.map((item, index) => (
                          <tr key={index}>
                            <td>{item.material_name}</td>
                            <td>{item.specification || '-'}</td>
                            <td>{item.unit || '-'}</td>
                            <td>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                                min="0"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => handleItemChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
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
                            newStockIn.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
                          )}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="form-item">
                    <label>备注：</label>
                    <textarea
                      value={newStockIn.remark}
                      onChange={(e) => setNewStockIn(prev => ({ ...prev, remark: e.target.value }))}
                      placeholder="请输入备注"
                    />
                  </div>
                </div>
              )}
            </div>
            {selectedPurchase && (
              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setSelectedPurchase(null)}>
                  返回选择
                </button>
                <button className="btn-primary" onClick={handleCreate}>
                  创建入库单
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {showDetailModal && currentStockIn && (
        <div className="modal-overlay">
          <div className="modal-content detail-modal">
            <div className="modal-header">
              <h3>入库单详情 - {currentStockIn.stock_in_no}</h3>
              <button className="btn-close" onClick={() => setShowDetailModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-section">
                <div className="detail-row">
                  <label>入库单号：</label>
                  <span>{currentStockIn.stock_in_no}</span>
                </div>
                <div className="detail-row">
                  <label>采购订单：</label>
                  <span>{currentStockIn.purchase_no || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>关联合同：</label>
                  <span>{currentStockIn.contract_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>关联项目：</label>
                  <span>{currentStockIn.project_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>供应商：</label>
                  <span>{currentStockIn.supplier_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>状态：</label>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: STATUS_MAP[currentStockIn.status]?.color }}
                  >
                    {STATUS_MAP[currentStockIn.status]?.text}
                  </span>
                </div>
                <div className="detail-row">
                  <label>入库人：</label>
                  <span>{currentStockIn.operator_name || '-'}</span>
                </div>
                <div className="detail-row">
                  <label>创建时间：</label>
                  <span>{formatDate(currentStockIn.created_at)}</span>
                </div>
                {currentStockIn.remark && (
                  <div className="detail-row">
                    <label>备注：</label>
                    <span>{currentStockIn.remark}</span>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h4>入库物资明细</h4>
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
                    {currentStockIn.items?.map((item, index) => (
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
                      <td>{currentStockIn.summary?.total_quantity || 0}</td>
                      <td></td>
                      <td>¥{formatAmount(currentStockIn.summary?.total_amount || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              {currentStockIn.status === 'draft' && (
                <>
                  <button className="btn-danger" onClick={() => handleDelete(currentStockIn.id)}>
                    删除
                  </button>
                  <button className="btn-secondary" onClick={() => handlePrint(currentStockIn.id)}>
                    打印
                  </button>
                  <button className="btn-primary" onClick={() => handleConfirm(currentStockIn.id)}>
                    确认入库
                  </button>
                </>
              )}
              {currentStockIn.status === 'confirmed' && (
                <button className="btn-secondary" onClick={() => handlePrint(currentStockIn.id)}>
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
                <h1>物资入库单</h1>
                <div className="print-no">单号：{printData.stock_in_no}</div>
              </div>
              
              <div className="print-info">
                <div className="print-row">
                  <div><label>供应商：</label><span>{printData.supplier?.name}</span></div>
                  <div><label>联系人：</label><span>{printData.supplier?.contact || '-'}</span></div>
                  <div><label>电话：</label><span>{printData.supplier?.phone || '-'}</span></div>
                </div>
                <div className="print-row">
                  <div><label>采购订单：</label><span>{printData.purchase?.no || '-'}</span></div>
                  <div><label>项目：</label><span>{printData.purchase?.project_name || '-'}</span></div>
                  <div><label>合同：</label><span>{printData.purchase?.contract_name || '-'}</span></div>
                </div>
                <div className="print-row">
                  <div><label>入库时间：</label><span>{formatDate(printData.created_at)}</span></div>
                  <div><label>经办人：</label><span>{printData.operator_name || '-'}</span></div>
                  <div><label>状态：</label><span>{printData.status}</span></div>
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
                  <div>验收人签字：_______________</div>
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

export default StockIn;
