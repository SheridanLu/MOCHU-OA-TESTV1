/**
 * 批量采购管理页面
 * 实现依据合同的批量采购功能
 * 
 * Task 35: 批量采购
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './BatchPurchase.css';

// API 基础路径
const API_BASE = window.location.origin + '/api';

// 状态映射
const STATUS_MAP = {
  draft: { text: '草稿', color: '#8c8c8c' },
  pending: { text: '待审批', color: '#faad14' },
  approved: { text: '已通过', color: '#52c41a' },
  rejected: { text: '已拒绝', color: '#ff4d4f' },
  completed: { text: '已完成', color: '#1890ff' },
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

// 批量采购列表组件
function BatchPurchaseList({ onView, onCreate, onRefresh }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });

  // 获取列表
  const fetchList = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);
      params.append('page', pagination.page);
      params.append('pageSize', pagination.pageSize);

      const res = await fetch(`${API_BASE}/purchase/batch?${params}`, {
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setList(data.data);
        setPagination(prev => ({ ...prev, total: data.pagination.total }));
      }
    } catch (error) {
      console.error('获取批量采购列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [pagination.page, filters.status]);

  // 删除
  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这条批量采购记录吗？')) return;

    try {
      const res = await fetch(`${API_BASE}/purchase/batch/${id}`, {
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

  // 提交审批
  const handleSubmit = async (id) => {
    if (!window.confirm('确定要提交审批吗？')) return;

    try {
      const res = await fetch(`${API_BASE}/purchase/batch/${id}/submit`, {
        method: 'POST',
        headers: getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        alert('提交成功');
        fetchList();
      } else {
        alert(data.message || '提交失败');
      }
    } catch (error) {
      alert('提交失败: ' + error.message);
    }
  };

  return (
    <div className="batch-purchase-list">
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
            placeholder="搜索采购编号/合同名称"
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && fetchList()}
          />
          <button onClick={fetchList}>搜索</button>
        </div>
        <button className="btn-primary" onClick={onCreate}>+ 新建批量采购</button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>采购编号</th>
                <th>关联合同</th>
                <th>关联项目</th>
                <th>供应商</th>
                <th>总金额</th>
                <th>状态</th>
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
                  <td>{item.batch_no}</td>
                  <td>{item.contract_name || '-'}</td>
                  <td>{item.project_name || '-'}</td>
                  <td>{item.supplier_name || '-'}</td>
                  <td>¥{(item.total_amount || 0).toLocaleString()}</td>
                  <td>
                    <span
                      className="status-tag"
                      style={{ backgroundColor: STATUS_MAP[item.status]?.color || '#8c8c8c' }}
                    >
                      {STATUS_MAP[item.status]?.text || item.status}
                    </span>
                  </td>
                  <td>{item.created_at?.split('T')[0]}</td>
                  <td className="actions">
                    <button onClick={() => onView(item.id)}>查看</button>
                    {item.status === 'draft' && (
                      <>
                        <button onClick={() => handleSubmit(item.id)}>提交</button>
                        <button className="btn-danger" onClick={() => handleDelete(item.id)}>删除</button>
                      </>
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

// 新建/编辑批量采购弹窗
function BatchPurchaseForm({ onClose, onSuccess, editData }) {
  const [contracts, setContracts] = useState([]);
  const [selectedContract, setSelectedContract] = useState(null);
  const [purchaseLists, setPurchaseLists] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);

  // 获取支出合同列表
  useEffect(() => {
    const fetchContracts = async () => {
      try {
        const res = await fetch(`${API_BASE}/purchase/batch/contracts/expense`, {
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
  }, []);

  // 选择合同时获取采购清单
  const handleContractChange = async (contractId) => {
    if (!contractId) {
      setSelectedContract(null);
      setPurchaseLists([]);
      setSelectedItems([]);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/purchase/batch/contracts/${contractId}/purchase-list`, {
        headers: getHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setSelectedContract(data.data.contract);
        setPurchaseLists(data.data.purchaseLists);
        setSelectedItems([]);
      }
    } catch (error) {
      console.error('获取采购清单失败:', error);
    }
  };

  // 选择/取消选择清单项
  const toggleItem = (listId, item) => {
    const key = `${listId}-${item.id}`;
    const exists = selectedItems.find(i => i.key === key);
    if (exists) {
      setSelectedItems(selectedItems.filter(i => i.key !== key));
    } else {
      setSelectedItems([...selectedItems, {
        key,
        purchase_list_item_id: item.id,
        material_name: item.material_name,
        specification: item.specification,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        remark: ''
      }]);
    }
  };

  // 更新选中项
  const updateSelectedItem = (key, field, value) => {
    setSelectedItems(selectedItems.map(item => {
      if (item.key === key) {
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = (updated.quantity || 0) * (updated.unit_price || 0);
        }
        return updated;
      }
      return item;
    }));
  };

  // 提交创建
  const handleSubmit = async () => {
    if (!selectedContract) {
      alert('请选择支出合同');
      return;
    }

    if (selectedItems.length === 0) {
      alert('请选择采购清单项');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/purchase/batch`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          contract_id: selectedContract.id,
          project_id: selectedContract.project_id,
          items: selectedItems.map(i => ({
            purchase_list_item_id: i.purchase_list_item_id,
            material_name: i.material_name,
            specification: i.specification,
            unit: i.unit,
            quantity: parseFloat(i.quantity) || 0,
            unit_price: parseFloat(i.unit_price) || 0,
            remark: i.remark
          })),
          remark
        })
      });
      const data = await res.json();

      if (data.success) {
        alert('创建成功');
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

  const totalAmount = selectedItems.reduce((sum, item) => {
    return sum + ((item.quantity || 0) * (item.unit_price || 0));
  }, 0);

  return (
    <div className="modal-overlay">
      <div className="modal-content batch-purchase-form">
        <div className="modal-header">
          <h3>新建批量采购</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <label>选择支出合同 <span className="required">*</span></label>
            <select
              value={selectedContract?.id || ''}
              onChange={(e) => handleContractChange(e.target.value)}
            >
              <option value="">请选择支出合同</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.contract_no} - {c.name} ({c.supplier_name || '未知供应商'})
                </option>
              ))}
            </select>
          </div>

          {selectedContract && (
            <div className="contract-info">
              <p><strong>合同编号：</strong>{selectedContract.contract_no}</p>
              <p><strong>合同名称：</strong>{selectedContract.name}</p>
              <p><strong>关联项目：</strong>{selectedContract.project_name || '-'}</p>
              <p><strong>供应商：</strong>{selectedContract.supplier_name || '-'}</p>
            </div>
          )}

          {purchaseLists.length > 0 && (
            <div className="purchase-lists-section">
              <h4>采购清单（请勾选需要采购的项目）</h4>
              {purchaseLists.map(list => (
                <div key={list.id} className="purchase-list-card">
                  <div className="list-title">{list.name} ({list.item_count}项)</div>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th width="40">选择</th>
                        <th>材料名称</th>
                        <th>规格</th>
                        <th>单位</th>
                        <th>数量</th>
                        <th>单价</th>
                        <th>基准价</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.items.map(item => {
                        const key = `${list.id}-${item.id}`;
                        const selected = selectedItems.find(i => i.key === key);
                        return (
                          <tr key={item.id} className={selected ? 'selected' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                checked={!!selected}
                                onChange={() => toggleItem(list.id, item)}
                              />
                            </td>
                            <td>{item.material_name}</td>
                            <td>{item.specification || '-'}</td>
                            <td>{item.unit || '-'}</td>
                            <td>{item.quantity}</td>
                            <td>{item.unit_price}</td>
                            <td>{item.base_price || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {selectedItems.length > 0 && (
            <div className="selected-items-section">
              <h4>已选采购项</h4>
              <table className="items-table">
                <thead>
                  <tr>
                    <th>材料名称</th>
                    <th>规格</th>
                    <th>单位</th>
                    <th>数量</th>
                    <th>单价</th>
                    <th>小计</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItems.map(item => (
                    <tr key={item.key}>
                      <td>{item.material_name}</td>
                      <td>{item.specification || '-'}</td>
                      <td>{item.unit || '-'}</td>
                      <td>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateSelectedItem(item.key, 'quantity', e.target.value)}
                          min="0"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateSelectedItem(item.key, 'unit_price', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td>¥{((item.quantity || 0) * (item.unit_price || 0)).toFixed(2)}</td>
                      <td>
                        <button
                          className="btn-link"
                          onClick={() => setSelectedItems(selectedItems.filter(i => i.key !== item.key))}
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5"><strong>合计</strong></td>
                    <td colSpan="2"><strong>¥{totalAmount.toFixed(2)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="form-section">
            <label>备注</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="请输入备注信息"
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>取消</button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || !selectedContract || selectedItems.length === 0}
          >
            {loading ? '提交中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 批量采购详情弹窗
function BatchPurchaseDetail({ id, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`${API_BASE}/purchase/batch/${id}`, {
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
    fetchDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="loading">加载中...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <p>数据不存在</p>
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content batch-purchase-detail">
        <div className="modal-header">
          <h3>批量采购详情</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div className="info-section">
            <div className="info-row">
              <span className="label">采购编号：</span>
              <span className="value">{data.batch_no}</span>
            </div>
            <div className="info-row">
              <span className="label">关联合同：</span>
              <span className="value">{data.contract_name || '-'}</span>
            </div>
            <div className="info-row">
              <span className="label">关联项目：</span>
              <span className="value">{data.project_name || '-'}</span>
            </div>
            <div className="info-row">
              <span className="label">供应商：</span>
              <span className="value">{data.supplier_name || '-'}</span>
            </div>
            <div className="info-row">
              <span className="label">总金额：</span>
              <span className="value">¥{(data.total_amount || 0).toLocaleString()}</span>
            </div>
            <div className="info-row">
              <span className="label">状态：</span>
              <span
                className="status-tag"
                style={{ backgroundColor: STATUS_MAP[data.status]?.color || '#8c8c8c' }}
              >
                {STATUS_MAP[data.status]?.text || data.status}
              </span>
            </div>
            <div className="info-row">
              <span className="label">创建人：</span>
              <span className="value">{data.creator_name || '-'}</span>
            </div>
            <div className="info-row">
              <span className="label">创建时间：</span>
              <span className="value">{data.created_at}</span>
            </div>
            {data.remark && (
              <div className="info-row">
                <span className="label">备注：</span>
                <span className="value">{data.remark}</span>
              </div>
            )}
          </div>

          <h4>采购明细</h4>
          <table className="items-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>材料名称</th>
                <th>规格</th>
                <th>单位</th>
                <th>数量</th>
                <th>单价</th>
                <th>小计</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.material_name}</td>
                  <td>{item.specification || '-'}</td>
                  <td>{item.unit || '-'}</td>
                  <td>{item.quantity}</td>
                  <td>¥{item.unit_price}</td>
                  <td>¥{(item.total_price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.approvals && data.approvals.length > 0 && (
            <>
              <h4>审批记录</h4>
              <table className="items-table">
                <thead>
                  <tr>
                    <th>步骤</th>
                    <th>审批人</th>
                    <th>状态</th>
                    <th>意见</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.approvals.map(approval => (
                    <tr key={approval.id}>
                      <td>{approval.step_name}</td>
                      <td>{approval.approver_name || '-'}</td>
                      <td>
                        <span
                          className="status-tag"
                          style={{
                            backgroundColor: approval.action === 'approve' ? '#52c41a' :
                              approval.action === 'reject' ? '#ff4d4f' : '#faad14'
                          }}
                        >
                          {approval.action === 'approve' ? '已通过' :
                            approval.action === 'reject' ? '已拒绝' : '待审批'}
                        </span>
                      </td>
                      <td>{approval.comment || '-'}</td>
                      <td>{approval.updated_at || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

// 主组件
export default function BatchPurchase() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="batch-purchase-page">
      <div className="page-header">
        <h2>批量采购管理</h2>
        <p>基于支出合同的批量采购流程</p>
      </div>

      <BatchPurchaseList
        key={refreshKey}
        onView={(id) => setViewId(id)}
        onCreate={() => setShowForm(true)}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />

      {showForm && (
        <BatchPurchaseForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {viewId && (
        <BatchPurchaseDetail
          id={viewId}
          onClose={() => setViewId(null)}
        />
      )}
    </div>
  );
}
