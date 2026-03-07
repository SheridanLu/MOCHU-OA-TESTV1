import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
  Descriptions,
  Timeline,
  Tabs,
  Row,
  Col,
  Statistic,
  Tooltip
} from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  
  WarningOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;
const { TextArea } = Input;

// 状态配置
const STATUS_CONFIG = {
  pending: { color: 'orange', text: '待审批' },
  budget_approved: { color: 'blue', text: '预算员已审' },
  finance_approved: { color: 'cyan', text: '财务已审' },
  approved: { color: 'green', text: '审批通过' },
  rejected: { color: 'red', text: '已拒绝' },
  cancelled: { color: 'default', text: '已取消' }
};

// 超量类型配置
const OVERAGE_TYPE_CONFIG = {
  quantity: { color: 'orange', text: '数量超量' },
  amount: { color: 'red', text: '金额超量' },
  price: { color: 'purple', text: '单价超量' }
};

const OverageApply = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [searchParams, setSearchParams] = useState({
    keyword: '',
    status: '',
    project_id: ''
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [approveVisible, setApproveVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [form] = Form.useForm();
  const [approveForm] = Form.useForm();
  const [projects, setProjects] = useState([]);
  const [purchaseLists, setPurchaseLists] = useState([]);
  const [purchaseListItems, setPurchaseListItems] = useState([]);
  const [stats, setStats] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    loadData();
    loadProjects();
    loadStats();
  }, []);

  // 加载项目列表
  const loadProjects = async () => {
    try {
      const response = await axios.get('/api/projects', {
        params: { pageSize: 1000, status: 'active' }
      });
      if (response.data.success) {
        setProjects(response.data.data || []);
      }
    } catch (error) {
      console.error('加载项目失败:', error);
    }
  };

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await axios.get('/api/purchase/overage-apply/stats');
      if (response.data.success) {
        setStats(response.data.data || {});
      }
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 加载列表数据
  const loadData = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = {
        page,
        pageSize,
        ...searchParams
      };
      const response = await axios.get('/api/purchase/overage-apply', { params });
      if (response.data.success) {
        setData(response.data.data || []);
        setPagination({
          current: response.data.pagination.page,
          pageSize: response.data.pagination.pageSize,
          total: response.data.pagination.total
        });
      }
    } catch (error) {
      message.error('加载数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // 加载项目的采购清单
  const loadPurchaseLists = async (projectId) => {
    if (!projectId) {
      setPurchaseLists([]);
      return;
    }
    try {
      const response = await axios.get(`/api/purchase/overage-apply/projects/${projectId}/purchase-lists`);
      if (response.data.success) {
        setPurchaseLists(response.data.data || []);
      }
    } catch (error) {
      console.error('加载采购清单失败:', error);
    }
  };

  // 加载采购清单的物资明细
  const loadPurchaseListItems = async (listId) => {
    if (!listId) {
      setPurchaseListItems([]);
      return;
    }
    try {
      const response = await axios.get(`/api/purchase/overage-apply/purchase-lists/${listId}/items`);
      if (response.data.success) {
        setPurchaseListItems(response.data.data || []);
      }
    } catch (error) {
      console.error('加载物资明细失败:', error);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '申请编号',
      dataIndex: 'apply_no',
      key: 'apply_no',
      width: 140,
      fixed: 'left'
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true
    },
    {
      title: '物资名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 150,
      ellipsis: true
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      key: 'specification',
      width: 100,
      ellipsis: true
    },
    {
      title: '超量类型',
      dataIndex: 'overage_type',
      key: 'overage_type',
      width: 100,
      render: (type) => {
        const config = OVERAGE_TYPE_CONFIG[type] || { color: 'default', text: type };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '超量数量',
      dataIndex: 'overage_quantity',
      key: 'overage_quantity',
      width: 100,
      render: (val) => val?.toFixed(2) || '0.00'
    },
    {
      title: '超量金额',
      dataIndex: 'overage_amount',
      key: 'overage_amount',
      width: 120,
      render: (val) => `¥${(val || 0).toFixed(2)}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status) => {
        const config = STATUS_CONFIG[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '申请人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 80
    },
    {
      title: '申请时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (val) => val ? new Date(val).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => {
        const isCreator = record.creator_id === parseInt(localStorage.getItem('userId'));
        const canEdit = record.status === 'pending' && isCreator;
        const canDelete = ['pending', 'rejected'].includes(record.status) && isCreator;
        const canApprove = ['pending', 'budget_approved', 'finance_approved'].includes(record.status);

        return (
          <Space size="small">
            <Tooltip title="查看详情">
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => showDetail(record)}
              />
            </Tooltip>
            {canEdit && (
              <Tooltip title="编辑">
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => showEditModal(record)}
                />
              </Tooltip>
            )}
            {canApprove && (
              <Tooltip title="审批">
                <Button
                  type="link"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => showApproveModal(record)}
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
            )}
            {canDelete && (
              <Popconfirm
                title="确定要删除这条申请吗？"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Tooltip title="删除">
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      }
    }
  ];

  // 显示新建弹窗
  const showCreateModal = () => {
    setEditingId(null);
    form.resetFields();
    setPurchaseLists([]);
    setPurchaseListItems([]);
    setModalVisible(true);
  };

  // 显示编辑弹窗
  const showEditModal = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      project_id: record.project_id,
      purchase_list_id: record.purchase_list_id,
      item_name: record.item_name,
      specification: record.specification,
      unit: record.unit,
      original_quantity: record.original_quantity,
      original_price: record.original_price,
      actual_quantity: record.actual_quantity,
      actual_price: record.actual_price,
      overage_type: record.overage_type,
      reason: record.reason
    });
    loadPurchaseLists(record.project_id);
    setModalVisible(true);
  };

  // 显示详情弹窗
  const showDetail = async (record) => {
    try {
      const response = await axios.get(`/api/purchase/overage-apply/${record.id}`);
      if (response.data.success) {
        setCurrentItem(response.data.data);
        setDetailVisible(true);
      }
    } catch (error) {
      message.error('加载详情失败');
    }
  };

  // 显示审批弹窗
  const showApproveModal = (record) => {
    setCurrentItem(record);
    approveForm.resetFields();
    setApproveVisible(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingId) {
        // 更新
        const response = await axios.put(`/api/purchase/overage-apply/${editingId}`, values);
        if (response.data.success) {
          message.success('更新成功');
          setModalVisible(false);
          loadData(pagination.current, pagination.pageSize);
        }
      } else {
        // 创建
        const response = await axios.post('/api/purchase/overage-apply', values);
        if (response.data.success) {
          message.success('创建成功');
          setModalVisible(false);
          loadData(pagination.current, pagination.pageSize);
          loadStats();
        }
      }
    } catch (error) {
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      }
    }
  };

  // 审批通过
  const handleApprove = async () => {
    try {
      const values = await approveForm.validateFields();
      const response = await axios.post(`/api/purchase/overage-apply/${currentItem.id}/approve`, {
        comment: values.comment
      });
      if (response.data.success) {
        message.success('审批通过');
        setApproveVisible(false);
        loadData(pagination.current, pagination.pageSize);
        loadStats();
      }
    } catch (error) {
      message.error(error.response?.data?.message || '审批失败');
    }
  };

  // 审批拒绝
  const handleReject = async () => {
    try {
      const values = await approveForm.validateFields(['reject_reason']);
      if (!values.reject_reason) {
        message.error('请填写拒绝原因');
        return;
      }
      const response = await axios.post(`/api/purchase/overage-apply/${currentItem.id}/reject`, {
        comment: values.reject_reason
      });
      if (response.data.success) {
        message.success('已拒绝');
        setApproveVisible(false);
        loadData(pagination.current, pagination.pageSize);
        loadStats();
      }
    } catch (error) {
      message.error(error.response?.data?.message || '拒绝失败');
    }
  };

  // 删除
  const handleDelete = async (id) => {
    try {
      const response = await axios.delete(`/api/purchase/overage-apply/${id}`);
      if (response.data.success) {
        message.success('删除成功');
        loadData(pagination.current, pagination.pageSize);
        loadStats();
      }
    } catch (error) {
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  // 搜索
  const handleSearch = () => {
    loadData(1, pagination.pageSize);
  };

  // 重置
  const handleReset = () => {
    setSearchParams({
      keyword: '',
      status: '',
      project_id: ''
    });
    loadData(1, pagination.pageSize);
  };

  // 表格分页变化
  const handleTableChange = (newPagination) => {
    loadData(newPagination.current, newPagination.pageSize);
  };

  // 监听项目变化
  const handleProjectChange = (projectId) => {
    form.setFieldsValue({ purchase_list_id: undefined, item_name: undefined });
    loadPurchaseLists(projectId);
    setPurchaseListItems([]);
  };

  // 监听采购清单变化
  const handlePurchaseListChange = (listId) => {
    loadPurchaseListItems(listId);
  };

  // 从物资明细选择
  const handleSelectItem = (item) => {
    form.setFieldsValue({
      item_name: item.material_name,
      specification: item.specification,
      unit: item.unit,
      original_quantity: item.quantity,
      original_price: item.unit_price
    });
  };

  return (
    <div className="overage-apply-page">
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="总申请数"
              value={stats.total || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="待审批"
              value={stats.pending_count || 0}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="预算员已审"
              value={stats.budget_approved_count || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="财务已审"
              value={stats.finance_approved_count || 0}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="已通过"
              value={stats.approved_count || 0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="已拒绝"
              value={stats.rejected_count || 0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索区域 */}
      <Card style={{ marginBottom: 16 }}>
        <Space size="middle" wrap>
          <Input.Search
            placeholder="搜索申请编号/物资名称/项目"
            style={{ width: 250 }}
            value={searchParams.keyword}
            onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
          />
          <Select
            placeholder="选择项目"
            style={{ width: 200 }}
            allowClear
            value={searchParams.project_id || undefined}
            onChange={(val) => setSearchParams({ ...searchParams, project_id: val })}
          >
            {projects.map((p) => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Select>
          <Select
            placeholder="选择状态"
            style={{ width: 150 }}
            allowClear
            value={searchParams.status || undefined}
            onChange={(val) => setSearchParams({ ...searchParams, status: val })}
          >
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <Option key={key} value={key}>{config.text}</Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
            新建申请
          </Button>
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={pagination}
          onChange={handleTableChange}
          scroll={{ x: 1600 }}
        />
      </Card>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingId ? '编辑超量采购申请' : '新建超量采购申请'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_id"
                label="关联项目"
                rules={[{ required: true, message: '请选择关联项目' }]}
              >
                <Select
                  placeholder="请选择项目"
                  onChange={handleProjectChange}
                  showSearch
                  filterOption={(input, option) =>
                    option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                  }
                >
                  {projects.map((p) => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="purchase_list_id" label="关联采购清单（可选）">
                <Select
                  placeholder="请选择采购清单"
                  onChange={handlePurchaseListChange}
                  allowClear
                >
                  {purchaseLists.map((list) => (
                    <Option key={list.id} value={list.id}>{list.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {purchaseListItems.length > 0 && (
            <Card size="small" title="从采购清单选择物资" style={{ marginBottom: 16 }}>
              <div style={{ maxHeight: 150, overflow: 'auto' }}>
                {purchaseListItems.map((item) => (
                  <Button
                    key={item.id}
                    size="small"
                    style={{ margin: 4 }}
                    onClick={() => handleSelectItem(item)}
                  >
                    {item.material_name} ({item.quantity}{item.unit})
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="item_name"
                label="物资名称"
                rules={[{ required: true, message: '请填写物资名称' }]}
              >
                <Input placeholder="请输入物资名称" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="specification" label="规格型号">
                <Input placeholder="规格型号" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="unit" label="单位">
                <Input placeholder="单位" />
              </Form.Item>
            </Col>
          </Row>

          <Card size="small" title="原采购清单信息" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="original_quantity" label="原数量">
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="original_price" label="原单价">
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card size="small" title="实际采购信息" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="actual_quantity" label="实际数量">
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="actual_price" label="实际单价">
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="overage_type" label="超量类型" initialValue="quantity">
                <Select>
                  <Option value="quantity">数量超量</Option>
                  <Option value="amount">金额超量</Option>
                  <Option value="price">单价超量</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="reason"
            label="超量原因"
            rules={[{ required: true, message: '请填写超量原因' }]}
          >
            <TextArea rows={3} placeholder="请详细说明超量采购的原因" />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <strong>审批流程：</strong>
          <br />
          预算员审批 → 财务审批 → 总经理审批
        </div>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="超量采购申请详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {currentItem && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="申请编号">{currentItem.apply_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_CONFIG[currentItem.status]?.color}>
                  {STATUS_CONFIG[currentItem.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="项目名称">{currentItem.project_name}</Descriptions.Item>
              <Descriptions.Item label="项目编号">{currentItem.project_no}</Descriptions.Item>
              <Descriptions.Item label="物资名称">{currentItem.item_name}</Descriptions.Item>
              <Descriptions.Item label="规格型号">{currentItem.specification || '-'}</Descriptions.Item>
              <Descriptions.Item label="单位">{currentItem.unit || '-'}</Descriptions.Item>
              <Descriptions.Item label="超量类型">
                <Tag color={OVERAGE_TYPE_CONFIG[currentItem.overage_type]?.color}>
                  {OVERAGE_TYPE_CONFIG[currentItem.overage_type]?.text}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="数量与金额对比" style={{ margin: '16px 0' }}>
              <Row gutter={24}>
                <Col span={8}>
                  <Statistic
                    title="原数量"
                    value={currentItem.original_quantity || 0}
                    suffix={currentItem.unit || '个'}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="实际数量"
                    value={currentItem.actual_quantity || 0}
                    suffix={currentItem.unit || '个'}
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="超量数量"
                    value={currentItem.overage_quantity || 0}
                    suffix={currentItem.unit || '个'}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Col>
              </Row>
              <Row gutter={24} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <Statistic
                    title="原单价"
                    value={currentItem.original_price || 0}
                    prefix="¥"
                    precision={2}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="实际单价"
                    value={currentItem.actual_price || 0}
                    prefix="¥"
                    precision={2}
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="超量金额"
                    value={currentItem.overage_amount || 0}
                    prefix="¥"
                    precision={2}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Col>
              </Row>
            </Card>

            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="超量原因">{currentItem.reason}</Descriptions.Item>
              {currentItem.remark && (
                <Descriptions.Item label="备注">{currentItem.remark}</Descriptions.Item>
              )}
              <Descriptions.Item label="申请人">{currentItem.creator_name}</Descriptions.Item>
              <Descriptions.Item label="申请时间">
                {currentItem.created_at ? new Date(currentItem.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              {currentItem.approver_name && (
                <Descriptions.Item label="审批人">{currentItem.approver_name}</Descriptions.Item>
              )}
              {currentItem.approved_at && (
                <Descriptions.Item label="审批时间">
                  {new Date(currentItem.approved_at).toLocaleString('zh-CN')}
                </Descriptions.Item>
              )}
            </Descriptions>

            {currentItem.approval_records && currentItem.approval_records.length > 0 && (
              <Card size="small" title="审批记录" style={{ marginTop: 16 }}>
                <Timeline
                  items={currentItem.approval_records.map((record) => ({
                    color: record.action === 'approve' ? 'green' : record.action === 'reject' ? 'red' : 'blue',
                    children: (
                      <div>
                        <div>
                          <strong>{record.step_name}</strong>
                          <Tag 
                            color={record.action === 'approve' ? 'success' : record.action === 'reject' ? 'error' : 'processing'}
                            style={{ marginLeft: 8 }}
                          >
                            {record.action === 'approve' ? '已通过' : record.action === 'reject' ? '已拒绝' : '待审批'}
                          </Tag>
                        </div>
                        {record.approver_name && (
                          <div style={{ color: '#666', marginTop: 4 }}>
                            审批人：{record.approver_name}
                          </div>
                        )}
                        {record.comment && (
                          <div style={{ color: '#666', marginTop: 4 }}>
                            意见：{record.comment}
                          </div>
                        )}
                        {record.updated_at && (
                          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                            {new Date(record.updated_at).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    )
                  }))}
                />
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title="审批超量采购申请"
        open={approveVisible}
        onCancel={() => setApproveVisible(false)}
        footer={null}
        width={600}
      >
        {currentItem && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="申请编号">{currentItem.apply_no}</Descriptions.Item>
              <Descriptions.Item label="项目">{currentItem.project_name}</Descriptions.Item>
              <Descriptions.Item label="物资名称">{currentItem.item_name}</Descriptions.Item>
              <Descriptions.Item label="超量类型">
                <Tag color={OVERAGE_TYPE_CONFIG[currentItem.overage_type]?.color}>
                  {OVERAGE_TYPE_CONFIG[currentItem.overage_type]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="超量数量">{currentItem.overage_quantity}</Descriptions.Item>
              <Descriptions.Item label="超量金额">
                <span style={{ color: '#ff4d4f' }}>¥{(currentItem.overage_amount || 0).toFixed(2)}</span>
              </Descriptions.Item>
            </Descriptions>

            <Form form={approveForm} layout="vertical">
              <Form.Item name="comment" label="审批意见（通过时选填）">
                <TextArea rows={3} placeholder="请填写审批意见" />
              </Form.Item>
              <Form.Item name="reject_reason" label="拒绝原因（拒绝时必填）">
                <TextArea rows={2} placeholder="拒绝时请填写原因" />
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setApproveVisible(false)}>取消</Button>
                <Button danger onClick={handleReject} icon={<CloseOutlined />}>
                  拒绝
                </Button>
                <Button type="primary" onClick={handleApprove} icon={<CheckOutlined />}>
                  通过
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OverageApply;
