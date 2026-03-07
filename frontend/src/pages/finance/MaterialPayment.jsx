/**
 * 材料款付款管理页面
 * Task 48: 材料款付款 - 必须关联入库单
 */

import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Card,
  Tag,
  Space,
  Descriptions,
  Divider,
  Steps,
  List,
  Tooltip,
  Statistic,
  Row,
  Col,
  InputNumber
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  DollarOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;
const { Step } = Steps;

// 付款状态映射
const statusMap = {
  pending: { text: '待审批', color: 'blue' },
  approved: { text: '已审批', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  paid: { text: '已支付', color: 'purple' },
  cancelled: { text: '已取消', color: 'default' }
};

// 材料款付款管理组件
function MaterialPayment() {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [searchParams, setSearchParams] = useState({ keyword: '', status: 'all' });

  // 统计数据
  const [statistics, setStatistics] = useState({});

  // 弹窗状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [payConfirmModalVisible, setPayConfirmModalVisible] = useState(false);

  // 当前选中的付款记录
  const [currentPayment, setCurrentPayment] = useState(null);

  // 可用入库单列表
  const [availableStockIns, setAvailableStockIns] = useState([]);

  // 表单
  const [createForm] = Form.useForm();
  const [approveForm] = Form.useForm();

  // 获取付款列表
  const fetchPayments = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        pageSize,
        ...searchParams
      });

      const response = await fetch(`/api/payments/material?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setPayments(result.data);
        setPagination({
          ...pagination,
          current: page,
          total: result.pagination.total
        });
      } else {
        message.error(result.message || '获取付款列表失败');
      }
    } catch (error) {
      console.error('获取付款列表失败:', error);
      message.error('获取付款列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取统计数据
  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/payments/material/statistics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setStatistics(result.data.summary || {});
      }
    } catch (error) {
      console.error('获取统计数据失败:', error);
    }
  };

  // 获取可用入库单
  const fetchAvailableStockIns = async () => {
    try {
      const response = await fetch('/api/payments/material/stock-in/available', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setAvailableStockIns(result.data);
      }
    } catch (error) {
      console.error('获取入库单列表失败:', error);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStatistics();
  }, [searchParams]);

  // 打开新建弹窗
  const handleCreate = () => {
    createForm.resetFields();
    fetchAvailableStockIns();
    setCreateModalVisible(true);
  };

  // 提交新建付款申请
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const stockIn = availableStockIns.find(s => s.id === values.stock_in_id);

      const data = {
        stock_in_id: values.stock_in_id,
        project_id: stockIn.project_id,
        supplier_id: stockIn.supplier_id,
        amount: values.amount,
        remark: values.remark
      };

      const response = await fetch('/api/payments/material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (result.success) {
        message.success('付款申请创建成功');
        setCreateModalVisible(false);
        fetchPayments(pagination.current, pagination.pageSize);
        fetchStatistics();
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建付款申请失败:', error);
      message.error('创建失败');
    }
  };

  // 查看付款详情
  const handleViewDetail = async (record) => {
    try {
      const response = await fetch(`/api/payments/material/${record.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setCurrentPayment(result.data);
        setDetailModalVisible(true);
      } else {
        message.error(result.message || '获取详情失败');
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      message.error('获取详情失败');
    }
  };

  // 打开审批弹窗
  const handleOpenApprove = async (record) => {
    try {
      const response = await fetch(`/api/payments/material/${record.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setCurrentPayment(result.data);
        approveForm.resetFields();
        setApproveModalVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
    }
  };

  // 提交审批
  const handleApproveSubmit = async (action) => {
    try {
      const values = await approveForm.validateFields();

      const response = await fetch(`/api/payments/material/${currentPayment.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          action,
          comment: values.comment
        })
      });

      const result = await response.json();
      if (result.success) {
        message.success(result.message);
        setApproveModalVisible(false);
        fetchPayments(pagination.current, pagination.pageSize);
        fetchStatistics();
      } else {
        message.error(result.message || '审批失败');
      }
    } catch (error) {
      console.error('审批失败:', error);
      message.error('审批失败');
    }
  };

  // 确认支付
  const handlePay = async (record) => {
    try {
      const response = await fetch(`/api/payments/material/${record.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setCurrentPayment(result.data);
        setPayConfirmModalVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
    }
  };

  // 确认支付提交
  const handlePayConfirm = async () => {
    try {
      const response = await fetch(`/api/payments/material/${currentPayment.id}/pay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        message.success('支付确认成功');
        setPayConfirmModalVisible(false);
        fetchPayments(pagination.current, pagination.pageSize);
        fetchStatistics();
      } else {
        message.error(result.message || '确认支付失败');
      }
    } catch (error) {
      console.error('确认支付失败:', error);
      message.error('确认支付失败');
    }
  };

  // 删除付款记录
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/payments/material/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        message.success('删除成功');
        fetchPayments(pagination.current, pagination.pageSize);
        fetchStatistics();
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '付款编号',
      dataIndex: 'payment_no',
      key: 'payment_no',
      width: 120,
      fixed: 'left'
    },
    {
      title: '入库单号',
      dataIndex: 'stock_in_no',
      key: 'stock_in_no',
      width: 120
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      ellipsis: true
    },
    {
      title: '供应商',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      width: 120
    },
    {
      title: '入库金额',
      dataIndex: 'stock_in_amount',
      key: 'stock_in_amount',
      width: 100,
      align: 'right',
      render: (val) => `¥${parseFloat(val || 0).toLocaleString()}`
    },
    {
      title: '付款金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      align: 'right',
      render: (val) => (
        <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
          ¥{parseFloat(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => {
        const config = statusMap[status] || { text: status, color: 'default' };
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
      width: 150,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const actions = [
          <Button
            key="view"
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
        ];

        // 待审批状态：可审批
        if (record.status === 'pending') {
          actions.push(
            <Button
              key="approve"
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleOpenApprove(record)}
            >
              审批
            </Button>
          );
          actions.push(
            <Popconfirm
              key="delete"
              title="确定要删除此付款申请吗？"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          );
        }

        // 已审批状态：可确认支付
        if (record.status === 'approved') {
          actions.push(
            <Button
              key="pay"
              type="link"
              size="small"
              icon={<DollarOutlined />}
              onClick={() => handlePay(record)}
              style={{ color: '#52c41a' }}
            >
              确认支付
            </Button>
          );
        }

        return <Space size={0}>{actions}</Space>;
      }
    }
  ];

  // 搜索表单
  const handleSearch = (key, value) => {
    setSearchParams({ ...searchParams, [key]: value });
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="付款总额"
              value={statistics.total_amount || 0}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="待审批金额"
              value={statistics.pending_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已审批金额"
              value={statistics.approved_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已支付金额"
              value={statistics.paid_amount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 主内容区 */}
      <Card
        title={
          <Space>
            <DollarOutlined />
            <span>材料款付款管理</span>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="搜索付款编号/项目/供应商"
              prefix={<SearchOutlined />}
              value={searchParams.keyword}
              onChange={(e) => handleSearch('keyword', e.target.value)}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              value={searchParams.status}
              onChange={(val) => handleSearch('status', val)}
              style={{ width: 120 }}
            >
              <Option value="all">全部状态</Option>
              <Option value="pending">待审批</Option>
              <Option value="approved">已审批</Option>
              <Option value="rejected">已拒绝</Option>
              <Option value="paid">已支付</Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新建付款申请
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={payments}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => fetchPayments(page, pageSize)
          }}
        />
      </Card>

      {/* 新建付款申请弹窗 */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>新建材料款付款申请</span>
          </Space>
        }
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={handleCreateSubmit}
        width={700}
        okText="提交申请"
        cancelText="取消"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="stock_in_id"
            label="选择入库单"
            rules={[{ required: true, message: '请选择入库单' }]}
          >
            <Select
              placeholder="请选择已确认的入库单"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {availableStockIns.map(item => (
                <Option key={item.id} value={item.id}>
                  {item.stock_in_no} - {item.project_name} - {item.supplier_name}
                  （¥{parseFloat(item.total_amount || 0).toLocaleString()}）
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const stockInId = getFieldValue('stock_in_id');
              const stockIn = availableStockIns.find(s => s.id === stockInId);
              if (stockIn) {
                return (
                  <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                    <Descriptions column={2} size="small">
                      <Descriptions.Item label="入库单号">{stockIn.stock_in_no}</Descriptions.Item>
                      <Descriptions.Item label="入库日期">{stockIn.in_date || '-'}</Descriptions.Item>
                      <Descriptions.Item label="项目">{stockIn.project_name}</Descriptions.Item>
                      <Descriptions.Item label="供应商">{stockIn.supplier_name}</Descriptions.Item>
                      <Descriptions.Item label="入库金额">
                        <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                          ¥{parseFloat(stockIn.total_amount || 0).toLocaleString()}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="入库数量">{stockIn.total_quantity || 0}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item
            name="amount"
            label="付款金额"
            rules={[
              { required: true, message: '请输入付款金额' },
              { type: 'number', min: 0.01, message: '付款金额必须大于0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              prefix="¥"
              placeholder="请输入付款金额"
            />
          </Form.Item>

          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const stockInId = getFieldValue('stock_in_id');
              const amount = getFieldValue('amount');
              const stockIn = availableStockIns.find(s => s.id === stockInId);
              if (stockIn && amount && parseFloat(amount) > parseFloat(stockIn.total_amount)) {
                return (
                  <div style={{ color: '#ff4d4f', marginBottom: 16 }}>
                    警告：付款金额超过入库单金额 ¥{parseFloat(stockIn.total_amount).toLocaleString()}
                  </div>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 付款详情弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>付款详情</span>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {currentPayment && (
          <div>
            <Descriptions title="基本信息" column={2} bordered size="small">
              <Descriptions.Item label="付款编号">{currentPayment.payment_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[currentPayment.status]?.color}>
                  {statusMap[currentPayment.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="入库单号">{currentPayment.stock_in_no}</Descriptions.Item>
              <Descriptions.Item label="入库日期">{currentPayment.in_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="项目">{currentPayment.project_name}</Descriptions.Item>
              <Descriptions.Item label="项目编号">{currentPayment.project_no}</Descriptions.Item>
              <Descriptions.Item label="供应商">{currentPayment.supplier_name}</Descriptions.Item>
              <Descriptions.Item label="联系人">{currentPayment.contact_person || '-'}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{currentPayment.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="开户银行">{currentPayment.bank_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="银行账号">{currentPayment.bank_account || '-'}</Descriptions.Item>
            </Descriptions>

            <Divider />

            <Descriptions title="金额信息" column={2} bordered size="small">
              <Descriptions.Item label="入库金额">
                <span style={{ color: '#666' }}>
                  ¥{parseFloat(currentPayment.stock_in_amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="付款金额">
                <span style={{ color: '#1890ff', fontWeight: 'bold', fontSize: 16 }}>
                  ¥{parseFloat(currentPayment.amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <Descriptions title="审批信息" column={2} bordered size="small">
              <Descriptions.Item label="申请人">{currentPayment.creator_name}</Descriptions.Item>
              <Descriptions.Item label="申请时间">
                {currentPayment.created_at ? dayjs(currentPayment.created_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="审批人">{currentPayment.approver_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="审批时间">
                {currentPayment.approved_at ? dayjs(currentPayment.approved_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="支付人">{currentPayment.payer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="支付时间">
                {currentPayment.paid_at ? dayjs(currentPayment.paid_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{currentPayment.remark || '-'}</Descriptions.Item>
            </Descriptions>

            {/* 入库单明细 */}
            {currentPayment.stock_in_items && currentPayment.stock_in_items.length > 0 && (
              <>
                <Divider />
                <h4>入库物资明细</h4>
                <Table
                  dataSource={currentPayment.stock_in_items}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '物资名称', dataIndex: 'material_name', key: 'material_name' },
                    { title: '规格型号', dataIndex: 'specification', key: 'specification' },
                    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
                    { title: '数量', dataIndex: 'quantity', key: 'quantity', align: 'right' },
                    { title: '单价', dataIndex: 'unit_price', key: 'unit_price', align: 'right', render: v => `¥${parseFloat(v || 0).toLocaleString()}` },
                    { title: '金额', dataIndex: 'total_price', key: 'total_price', align: 'right', render: v => `¥${parseFloat(v || 0).toLocaleString()}` }
                  ]}
                />
              </>
            )}

            {/* 审批流程 */}
            {currentPayment.approvals && currentPayment.approvals.length > 0 && (
              <>
                <Divider />
                <h4>审批流程</h4>
                <Steps
                  current={currentPayment.approvals.findIndex(a => a.action === 'pending')}
                  status={currentPayment.status === 'rejected' ? 'error' : 'process'}
                  size="small"
                >
                  {currentPayment.approvals.map((approval, index) => (
                    <Step
                      key={index}
                      title={approval.step_name}
                      description={
                        approval.action === 'pending' ? '待审批' :
                        approval.action === 'approve' ? (
                          <span style={{ color: '#52c41a' }}>
                            已通过 - {approval.approver_name}
                            {approval.comment && <br />}
                            {approval.comment}
                          </span>
                        ) : (
                          <span style={{ color: '#ff4d4f' }}>
                            已拒绝 - {approval.approver_name}
                            {approval.comment && <br />}
                            {approval.comment}
                          </span>
                        )
                      }
                      status={
                        approval.action === 'pending' ? 'wait' :
                        approval.action === 'approve' ? 'finish' : 'error'
                      }
                    />
                  ))}
                </Steps>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title={
          <Space>
            <CheckOutlined />
            <span>审批付款申请</span>
          </Space>
        }
        open={approveModalVisible}
        onCancel={() => setApproveModalVisible(false)}
        footer={null}
        width={600}
      >
        {currentPayment && (
          <div>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="付款编号">{currentPayment.payment_no}</Descriptions.Item>
              <Descriptions.Item label="入库单号">{currentPayment.stock_in_no}</Descriptions.Item>
              <Descriptions.Item label="项目">{currentPayment.project_name}</Descriptions.Item>
              <Descriptions.Item label="供应商">{currentPayment.supplier_name}</Descriptions.Item>
              <Descriptions.Item label="入库金额">
                ¥{parseFloat(currentPayment.stock_in_amount || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="付款金额">
                <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                  ¥{parseFloat(currentPayment.amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="申请人">{currentPayment.creator_name}</Descriptions.Item>
              <Descriptions.Item label="申请时间">
                {dayjs(currentPayment.created_at).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              {currentPayment.remark && (
                <Descriptions.Item label="备注" span={2}>{currentPayment.remark}</Descriptions.Item>
              )}
            </Descriptions>

            <Form form={approveForm} layout="vertical">
              <Form.Item name="comment" label="审批意见">
                <TextArea rows={3} placeholder="请输入审批意见（可选）" />
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Space>
                <Button onClick={() => setApproveModalVisible(false)}>取消</Button>
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleApproveSubmit('reject')}
                >
                  拒绝
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleApproveSubmit('approve')}
                >
                  通过
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      {/* 支付确认弹窗 */}
      <Modal
        title={
          <Space>
            <DollarOutlined />
            <span>确认支付</span>
          </Space>
        }
        open={payConfirmModalVisible}
        onCancel={() => setPayConfirmModalVisible(false)}
        onOk={handlePayConfirm}
        okText="确认支付"
        cancelText="取消"
        okButtonProps={{ type: 'primary', danger: true }}
      >
        {currentPayment && (
          <div>
            <p style={{ fontSize: 16, marginBottom: 16 }}>
              确认支付以下款项？
            </p>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="付款编号">{currentPayment.payment_no}</Descriptions.Item>
              <Descriptions.Item label="入库单号">{currentPayment.stock_in_no}</Descriptions.Item>
              <Descriptions.Item label="供应商">{currentPayment.supplier_name}</Descriptions.Item>
              <Descriptions.Item label="开户银行">{currentPayment.bank_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="银行账号">{currentPayment.bank_account || '-'}</Descriptions.Item>
              <Descriptions.Item label="付款金额">
                <span style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 18 }}>
                  ¥{parseFloat(currentPayment.amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
            </Descriptions>
            <p style={{ marginTop: 16, color: '#ff4d4f' }}>
              注意：确认支付后将无法撤销！
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default MaterialPayment;
