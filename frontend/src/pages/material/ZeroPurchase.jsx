/**
 * 零星采购管理页面
 * Task 32: 实现零星采购预警 - 超批量采购总额1.5%预警
 * 
 * 编号规则：
 * - 零星采购编号: LX + YYMM + 3位序号 (如: LX250301)
 * - 序号每月重置
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  message,
  Modal,
  Descriptions,
  Form,
  InputNumber,
  DatePicker,
  Alert,
  Tooltip,
  Badge,
  Divider,
  Statistic,
  Row,
  Col,
  Popconfirm,
  Typography,
  Spin
} from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  WarningOutlined,
  ShoppingCartOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  SendOutlined,
  AuditOutlined,
  DollarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// API 基础地址
const API_BASE = 'http://localhost:3001/api';

// 获取请求头
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 状态映射
const STATUS_MAP = {
  draft: { text: '草稿', color: 'default' },
  pending: { text: '待审批', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  completed: { text: '已完成', color: 'blue' },
  cancelled: { text: '已取消', color: 'default' }
};

// 预警级别映射
const WARNING_LEVEL_MAP = {
  none: { text: '正常', color: 'success' },
  warning: { text: '价格预警', color: 'warning' },
  danger: { text: '价格超标', color: 'error' },
  excessive: { text: '超1.5%限额', color: 'error' }
};

/**
 * 零星采购管理页面
 */
function ZeroPurchase() {
  const [loading, setLoading] = useState(false);
  const [zeroPurchases, setZeroPurchases] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    keyword: '',
    status: '',
    warningLevel: ''
  });
  
  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [excessiveModalVisible, setExcessiveModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  
  // 当前操作的数据
  const [currentPurchase, setCurrentPurchase] = useState(null);
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [warningInfo, setWarningInfo] = useState(null);
  const [excessiveInfo, setExcessiveInfo] = useState(null);
  const [monthlyStats, setMonthlyStats] = useState(null);
  
  // 表单
  const [form] = Form.useForm();
  const [addItemForm] = Form.useForm();
  
  // 选中的行
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);

  // 加载零星采购列表
  const loadZeroPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);
      if (filters.keyword) params.append('keyword', filters.keyword);
      if (filters.status) params.append('status', filters.status);
      if (filters.warningLevel) params.append('warningLevel', filters.warningLevel);

      const response = await fetch(`${API_BASE}/zero-purchases?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setZeroPurchases(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination?.total || 0
        }));
        setMonthlyStats(result.monthlyStats || null);
      } else {
        message.error(result.message || '加载失败');
      }
    } catch (error) {
      console.error('加载零星采购列表失败:', error);
      message.error('加载零星采购列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadZeroPurchases();
  }, [loadZeroPurchases]);

  // 加载采购清单详情
  const loadPurchaseItems = async (purchaseId) => {
    try {
      const response = await fetch(`${API_BASE}/zero-purchases/${purchaseId}/items`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setPurchaseItems(result.data || []);
      } else {
        message.error(result.message || '加载采购清单失败');
      }
    } catch (error) {
      console.error('加载采购清单失败:', error);
      message.error('加载采购清单失败');
    }
  };

  // 打开创建模态框
  const handleCreate = () => {
    form.resetFields();
    setPurchaseItems([]);
    setCreateModalVisible(true);
  };

  // 提交创建
  const handleCreateSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // 检查是否有采购清单
      if (purchaseItems.length === 0) {
        message.warning('请至少添加一项采购清单');
        return;
      }
      
      // 计算总金额
      const totalAmount = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      
      // 检查是否超出月度1.5%限额
      const checkResponse = await fetch(`${API_BASE}/zero-purchases/check-excessive`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: totalAmount,
          items: purchaseItems
        })
      });
      const checkResult = await checkResponse.json();
      
      if (checkResult.success && checkResult.data.isExcessive) {
        // 显示超量预警
        setExcessiveInfo(checkResult.data);
        setExcessiveModalVisible(true);
        return;
      }
      
      // 检查价格预警
      const priceWarningResponse = await fetch(`${API_BASE}/materials/price-warning`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ items: purchaseItems })
      });
      const priceWarningResult = await priceWarningResponse.json();
      
      if (priceWarningResult.success && priceWarningResult.data.hasWarning) {
        setWarningInfo(priceWarningResult.data);
        setWarningModalVisible(true);
        return;
      }
      
      // 创建零星采购
      const response = await fetch(`${API_BASE}/zero-purchases`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...values,
          items: purchaseItems,
          total_amount: totalAmount
        })
      });
      const result = await response.json();
      
      if (result.success) {
        setCreateModalVisible(false);
        setSuccessModalVisible(true);
        loadZeroPurchases();
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建零星采购失败:', error);
      message.error('创建零星采购失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (record) => {
    setCurrentPurchase(record);
    await loadPurchaseItems(record.id);
    setDetailModalVisible(true);
  };

  // 打开编辑模态框
  const handleEdit = async (record) => {
    setCurrentPurchase(record);
    await loadPurchaseItems(record.id);
    form.setFieldsValue(record);
    setEditModalVisible(true);
  };

  // 提交编辑
  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const response = await fetch(`${API_BASE}/zero-purchases/${currentPurchase.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...values,
          items: purchaseItems
        })
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('更新成功');
        setEditModalVisible(false);
        loadZeroPurchases();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新零星采购失败:', error);
      message.error('更新零星采购失败');
    }
  };

  // 删除
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/zero-purchases/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('删除成功');
        loadZeroPurchases();
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除零星采购失败:', error);
      message.error('删除零星采购失败');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的记录');
      return;
    }
    
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？`,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/zero-purchases/batch-delete`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ids: selectedRowKeys })
          });
          const result = await response.json();
          
          if (result.success) {
            message.success(`成功删除 ${result.data.deletedCount} 条记录`);
            setSelectedRowKeys([]);
            loadZeroPurchases();
          } else {
            message.error(result.message || '批量删除失败');
          }
        } catch (error) {
          console.error('批量删除失败:', error);
          message.error('批量删除失败');
        }
      }
    });
  };

  // 打开添加采购清单模态框
  const handleAddItem = () => {
    addItemForm.resetFields();
    setAddItemModalVisible(true);
  };

  // 提交添加采购清单
  const handleAddItemSubmit = async () => {
    try {
      const values = await addItemForm.validateFields();
      
      // 查询基准价
      let basePrice = null;
      if (values.material_name) {
        const response = await fetch(`${API_BASE}/materials/base?keyword=${encodeURIComponent(values.material_name)}&pageSize=1`, {
          headers: getAuthHeaders()
        });
        const result = await response.json();
        if (result.success && result.data && result.data.length > 0) {
          basePrice = result.data[0].base_price;
        }
      }
      
      const newItem = {
        ...values,
        id: Date.now(), // 临时ID
        base_price: basePrice,
        total_price: values.quantity * values.unit_price
      };
      
      setPurchaseItems([...purchaseItems, newItem]);
      setAddItemModalVisible(false);
      addItemForm.resetFields();
    } catch (error) {
      console.error('添加采购清单失败:', error);
    }
  };

  // 删除采购清单项
  const handleRemoveItem = (itemId) => {
    setPurchaseItems(purchaseItems.filter(item => item.id !== itemId));
  };

  // 提交审批
  const handleSubmitApproval = async (record) => {
    Modal.confirm({
      title: '提交审批',
      icon: <ExclamationCircleOutlined />,
      content: `确定要提交 "${record.purchase_no}" 进行审批吗？`,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/zero-purchases/${record.id}/submit`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          const result = await response.json();
          
          if (result.success) {
            message.success('提交审批成功');
            setSuccessModalVisible(true);
            loadZeroPurchases();
          } else {
            message.error(result.message || '提交审批失败');
          }
        } catch (error) {
          console.error('提交审批失败:', error);
          message.error('提交审批失败');
        }
      }
    });
  };

  // 表格列定义
  const columns = [
    {
      title: '采购编号',
      dataIndex: 'purchase_no',
      key: 'purchase_no',
      width: 130,
      fixed: 'left',
      render: (text, record) => (
        <Space>
          <FileTextOutlined />
          <span style={{ fontWeight: 500 }}>{text}</span>
          {record.warning_level && record.warning_level !== 'none' && (
            <Tooltip title={WARNING_LEVEL_MAP[record.warning_level]?.text}>
              <WarningOutlined style={{ color: WARNING_LEVEL_MAP[record.warning_level]?.color === 'error' ? '#ff4d4f' : '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: '采购名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      ellipsis: true
    },
    {
      title: '供应商',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      align: 'right',
      render: (amount) => <span style={{ fontWeight: 500 }}>¥{(amount || 0).toLocaleString()}</span>
    },
    {
      title: '清单数量',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 90,
      align: 'center',
      render: (count) => <Badge count={count || 0} showZero color="blue" />
    },
    {
      title: '价格预警',
      dataIndex: 'price_warning_count',
      key: 'price_warning_count',
      width: 100,
      align: 'center',
      render: (count) => count > 0 ? (
        <Tag color="warning">{count} 项预警</Tag>
      ) : (
        <Tag color="success">无预警</Tag>
      )
    },
    {
      title: '预警级别',
      dataIndex: 'warning_level',
      key: 'warning_level',
      width: 100,
      render: (level) => {
        const info = WARNING_LEVEL_MAP[level] || WARNING_LEVEL_MAP.none;
        return <Badge status={info.color} text={info.text} />;
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => {
        const info = STATUS_MAP[status] || STATUS_MAP.draft;
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: '创建人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 100
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time) => time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.status === 'draft' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定要删除吗？"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
          {record.status === 'draft' && (
            <Button
              type="link"
              size="small"
              icon={<SendOutlined />}
              onClick={() => handleSubmitApproval(record)}
            >
              提交审批
            </Button>
          )}
        </Space>
      )
    }
  ];

  // 采购清单表格列
  const itemColumns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_, __, index) => index + 1
    },
    {
      title: '物资名称',
      dataIndex: 'material_name',
      key: 'material_name',
      width: 150,
      ellipsis: true
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      key: 'specification',
      width: 120,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 70,
      render: (text) => text || '-'
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right'
    },
    {
      title: '基准价',
      dataIndex: 'base_price',
      key: 'base_price',
      width: 100,
      align: 'right',
      render: (price) => price ? `¥${price.toLocaleString()}` : '-'
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      align: 'right',
      render: (price, record) => {
        const basePrice = record.base_price;
        if (basePrice && price > basePrice) {
          return (
            <Tooltip title={`超出基准价 ¥${(price - basePrice).toFixed(2)}`}>
              <span style={{ color: '#ff4d4f', fontWeight: 500 }}>
                ¥{price.toLocaleString()}
                <WarningOutlined style={{ marginLeft: 4 }} />
              </span>
            </Tooltip>
          );
        }
        return `¥${(price || 0).toLocaleString()}`;
      }
    },
    {
      title: '金额',
      dataIndex: 'total_price',
      key: 'total_price',
      width: 120,
      align: 'right',
      render: (price) => <span style={{ fontWeight: 500 }}>¥{(price || 0).toLocaleString()}</span>
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 120,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(record.id)}
        >
          删除
        </Button>
      )
    }
  ];

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      setSelectedItems(rows);
    }
  };

  // 计算采购清单总金额
  const totalAmount = purchaseItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  return (
    <div style={{ padding: '24px' }}>
      {/* 月度统计 */}
      {monthlyStats && (
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={24}>
            <Col span={6}>
              <Statistic
                title="本月零星采购总额"
                value={monthlyStats.totalAmount || 0}
                precision={2}
                prefix={<DollarOutlined />}
                suffix="元"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="批量采购基准总额"
                value={monthlyStats.batchTotalAmount || 0}
                precision={2}
                prefix="¥"
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="占比 (1.5%限额)"
                value={monthlyStats.percentage || 0}
                precision={2}
                suffix="%"
                valueStyle={{ 
                  color: monthlyStats.isExcessive ? '#ff4d4f' : '#3f8600' 
                }}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="预警状态"
                value={monthlyStats.isExcessive ? '已超限' : '正常'}
                valueStyle={{ 
                  color: monthlyStats.isExcessive ? '#ff4d4f' : '#3f8600' 
                }}
                prefix={monthlyStats.isExcessive ? <WarningOutlined /> : <CheckCircleOutlined />}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* 零星采购列表 */}
      <Card
        title={
          <Space>
            <ShoppingCartOutlined />
            <span>零星采购管理</span>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="搜索采购编号/名称"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              style={{ width: 200 }}
              onPressEnter={loadZeroPurchases}
            />
            <Select
              placeholder="状态"
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              style={{ width: 120 }}
              allowClear
            >
              {Object.entries(STATUS_MAP).map(([key, value]) => (
                <Option key={key} value={key}>{value.text}</Option>
              ))}
            </Select>
            <Select
              placeholder="预警级别"
              value={filters.warningLevel}
              onChange={(value) => setFilters({ ...filters, warningLevel: value })}
              style={{ width: 120 }}
              allowClear
            >
              {Object.entries(WARNING_LEVEL_MAP).map(([key, value]) => (
                <Option key={key} value={key}>{value.text}</Option>
              ))}
            </Select>
            <Button type="primary" onClick={loadZeroPurchases}>
              查询
            </Button>
          </Space>
        }
      >
        {/* 操作按钮 */}
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
            >
              新增零星采购
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handleBatchDelete}
            >
              批量删除
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={zeroPurchases}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
          scroll={{ x: 1500 }}
          size="small"
          style={{ width: '100%' }}
          onRow={(record) => ({
            onClick: () => handleViewDetail(record),
            style: { cursor: 'pointer' }
          })}
        />
      </Card>

      {/* 创建零星采购模态框 */}
      <Modal
        title="新增零星采购"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        width={1000}
        footer={[
          <Button key="cancel" onClick={() => setCreateModalVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleCreateSubmit}>
            创建
          </Button>
        ]}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="采购名称"
                rules={[{ required: true, message: '请输入采购名称' }]}
              >
                <Input placeholder="请输入采购名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplier_id" label="供应商">
                <Input placeholder="请选择供应商" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>

        <Divider>采购清单</Divider>

        {/* 采购清单表格 */}
        <div style={{ marginBottom: 16 }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddItem}>
            新增到采购清单
          </Button>
        </div>

        <Table
          columns={itemColumns.filter(col => col.key !== 'action' || createModalVisible)}
          dataSource={purchaseItems}
          rowKey="id"
          pagination={false}
          scroll={{ y: 300 }}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7} align="right">
                  <Text strong>合计：</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ color: '#1890ff' }}>¥{totalAmount.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Modal>

      {/* 编辑零星采购模态框 */}
      <Modal
        title="编辑零星采购"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        width={1000}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleEditSubmit}>
            保存
          </Button>
        ]}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="采购名称"
                rules={[{ required: true, message: '请输入采购名称' }]}
              >
                <Input placeholder="请输入采购名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplier_id" label="供应商">
                <Input placeholder="请选择供应商" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>

        <Divider>采购清单</Divider>

        <div style={{ marginBottom: 16 }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddItem}>
            新增到采购清单
          </Button>
        </div>

        <Table
          columns={itemColumns}
          dataSource={purchaseItems}
          rowKey="id"
          pagination={false}
          scroll={{ y: 300 }}
          size="small"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7} align="right">
                  <Text strong>合计：</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ color: '#1890ff' }}>¥{totalAmount.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Modal>

      {/* 采购清单详情模态框 */}
      <Modal
        title="零星采购详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        width={1000}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          currentPurchase?.status === 'draft' && (
            <Button 
              key="submit" 
              type="primary" 
              icon={<SendOutlined />}
              onClick={() => {
                setDetailModalVisible(false);
                handleSubmitApproval(currentPurchase);
              }}
            >
              提交审批
            </Button>
          )
        ]}
      >
        {currentPurchase && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="采购编号">{currentPurchase.purchase_no}</Descriptions.Item>
              <Descriptions.Item label="采购名称">{currentPurchase.name}</Descriptions.Item>
              <Descriptions.Item label="供应商">{currentPurchase.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[currentPurchase.status]?.color}>
                  {STATUS_MAP[currentPurchase.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="预警级别">
                <Badge 
                  status={WARNING_LEVEL_MAP[currentPurchase.warning_level]?.color} 
                  text={WARNING_LEVEL_MAP[currentPurchase.warning_level]?.text} 
                />
              </Descriptions.Item>
              <Descriptions.Item label="价格预警">
                {currentPurchase.price_warning_count > 0 ? (
                  <Tag color="warning">{currentPurchase.price_warning_count} 项预警</Tag>
                ) : (
                  <Tag color="success">无预警</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="总金额" span={2}>
                <Text strong style={{ fontSize: 16, color: '#1890ff' }}>
                  ¥{(currentPurchase.total_amount || 0).toLocaleString()}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {currentPurchase.remarks || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建人">{currentPurchase.creator_name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentPurchase.created_at ? dayjs(currentPurchase.created_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider>采购清单明细</Divider>

            <Table
              columns={itemColumns.filter(col => col.key !== 'action')}
              dataSource={purchaseItems}
              rowKey="id"
              pagination={false}
              scroll={{ y: 300 }}
              size="small"
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={8} align="right">
                      <Text strong>合计：</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong style={{ color: '#1890ff' }}>
                        ¥{purchaseItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0).toLocaleString()}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </>
        )}
      </Modal>

      {/* 新增采购清单模态框 */}
      <Modal
        title="新增到采购清单"
        open={addItemModalVisible}
        onCancel={() => setAddItemModalVisible(false)}
        onOk={handleAddItemSubmit}
        width={600}
      >
        <Form form={addItemForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="material_name"
                label="物资名称"
                rules={[{ required: true, message: '请输入物资名称' }]}
              >
                <Input placeholder="请输入物资名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="specification" label="规格型号">
                <Input placeholder="请输入规格型号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="unit" label="单位">
                <Input placeholder="如：个/件/套" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="quantity"
                label="数量"
                rules={[{ required: true, message: '请输入数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="数量" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="unit_price"
                label="单价"
                rules={[{ required: true, message: '请输入单价' }]}
              >
                <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="单价" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remarks" label="备注">
            <TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 价格预警模态框 */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>价格预警提示</span>
          </Space>
        }
        open={warningModalVisible}
        onCancel={() => setWarningModalVisible(false)}
        onOk={() => {
          setWarningModalVisible(false);
          // 继续创建
        }}
        okText="确认提交"
        cancelText="取消"
        width={700}
      >
        <Alert
          message="以下物资价格超出基准价"
          description="请确认是否继续提交采购申请"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {warningInfo?.warnings?.map((item, index) => (
          <Card key={index} size="small" style={{ marginBottom: 8 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Text strong>{item.material_name}</Text>
                <br />
                <Text type="secondary">{item.specification || '-'}</Text>
              </Col>
              <Col span={6}>
                <Text>基准价：¥{item.base_price?.toLocaleString()}</Text>
              </Col>
              <Col span={6}>
                <Text type="danger">实际价：¥{item.unit_price?.toLocaleString()}</Text>
              </Col>
              <Col span={4}>
                <Tag color={item.warning_level === 'danger' ? 'error' : 'warning'}>
                  +{item.overage_percent}%
                </Tag>
              </Col>
            </Row>
          </Card>
        ))}
      </Modal>

      {/* 超量预警模态框 (超1.5%限额) */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            <span>超量采购预警</span>
          </Space>
        }
        open={excessiveModalVisible}
        onCancel={() => setExcessiveModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExcessiveModalVisible(false)}>
            取消
          </Button>,
          <Button key="continue" type="primary" danger onClick={() => {
            // 需要法务审核，继续创建但标记为需要法务审批
            setExcessiveModalVisible(false);
            // 继续创建流程...
          }}>
            提交法务审核
          </Button>
        ]}
        width={600}
      >
        <Alert
          message="采购金额已超出月度1.5%限额"
          description={
            <div>
              <p>当前采购将超出零星采购月度限额，需要法务审核。</p>
              <ul style={{ marginTop: 8 }}>
                <li>月度批量采购总额：¥{excessiveInfo?.batchTotalAmount?.toLocaleString()}</li>
                <li>1.5%限额：¥{excessiveInfo?.limitAmount?.toLocaleString()}</li>
                <li>本月已使用：¥{excessiveInfo?.usedAmount?.toLocaleString()}</li>
                <li>本次采购：¥{excessiveInfo?.currentAmount?.toLocaleString()}</li>
              </ul>
            </div>
          }
          type="error"
          showIcon
        />
      </Modal>

      {/* 审批提交成功模态框 */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>提交成功</span>
          </Space>
        }
        open={successModalVisible}
        onCancel={() => setSuccessModalVisible(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setSuccessModalVisible(false)}>
            确定
          </Button>
        ]}
      >
        <Alert
          message="零星采购已提交审批"
          description="请等待审批人审核，您可以在列表中查看审批进度。"
          type="success"
          showIcon
        />
      </Modal>
    </div>
  );
}

export default ZeroPurchase;