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
  Statistic,
  Row,
  Col,
  Divider,
  Form,
  InputNumber,
  Tooltip,
  Badge,
  Steps,
  List
} from 'antd';
import {
  DollarOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  BankOutlined,
  CloseCircleOutlined,
  AuditOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

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

// 付款状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: 'orange' },
  approved: { text: '已审批', color: 'blue' },
  paid: { text: '已支付', color: 'green' },
  rejected: { text: '已驳回', color: 'red' }
};

/**
 * 人工费付款列表页面
 * Task 47: 实现人工费付款，必须关联对账单
 */
function LaborPayment() {
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    status: '',
    projectId: '',
    statementId: ''
  });
  const [projects, setProjects] = useState([]);
  const [statements, setStatements] = useState([]);
  
  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentPayment, setCurrentPayment] = useState(null);
  
  // 新建/编辑弹窗
  const [formVisible, setFormVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingPayment, setEditingPayment] = useState(null);
  
  // 审批弹窗
  const [approveVisible, setApproveVisible] = useState(false);
  const [approveForm] = Form.useForm();
  const [approvingPayment, setApprovingPayment] = useState(null);
  
  // 支付确认弹窗
  const [payVisible, setPayVisible] = useState(false);
  const [payForm] = Form.useForm();
  const [payingPayment, setPayingPayment] = useState(null);
  
  // 选择对账单后的信息
  const [selectedStatementInfo, setSelectedStatementInfo] = useState(null);

  // 加载项目列表
  useEffect(() => {
    loadProjects();
    loadStatements();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/projects?type=entity&pageSize=100`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    }
  };

  const loadStatements = async () => {
    try {
      const response = await fetch(`${API_BASE}/income-statements?status=confirmed&pageSize=100`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setStatements(result.data || []);
      }
    } catch (error) {
      console.error('加载对账单列表失败:', error);
    }
  };

  // 加载付款列表
  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.statementId) params.append('statementId', filters.statementId);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/payments/labor?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setPayments(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载付款列表失败:', error);
      message.error('加载付款列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // 查看详情
  const handleViewDetail = async (record) => {
    try {
      const response = await fetch(`${API_BASE}/payments/labor/${record.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setCurrentPayment(result.data);
        setDetailVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      message.error('获取详情失败');
    }
  };

  // 新建付款
  const handleCreate = () => {
    setEditingPayment(null);
    form.resetFields();
    setSelectedStatementInfo(null);
    setFormVisible(true);
  };

  // 编辑付款
  const handleEdit = (record) => {
    setEditingPayment(record);
    form.setFieldsValue({
      statementId: record.statement_id,
      projectId: record.project_id,
      amount: record.amount,
      payeeName: record.payee_name,
      payeeAccount: record.payee_account,
      bankName: record.bank_name,
      remark: record.remark
    });
    loadStatementInfo(record.statement_id);
    setFormVisible(true);
  };

  // 加载对账单劳务信息
  const loadStatementInfo = async (statementId) => {
    if (!statementId) {
      setSelectedStatementInfo(null);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/payments/labor/statement/${statementId}/info`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setSelectedStatementInfo(result.data);
      }
    } catch (error) {
      console.error('获取对账单信息失败:', error);
    }
  };

  // 选择对账单
  const handleStatementChange = (statementId) => {
    loadStatementInfo(statementId);
    
    // 自动填充项目ID
    const statement = statements.find(s => s.id === statementId);
    if (statement) {
      form.setFieldsValue({ projectId: statement.project_id });
    }
  };

  // 提交表单
  const handleSubmit = async (values) => {
    try {
      const url = editingPayment 
        ? `${API_BASE}/payments/labor/${editingPayment.id}`
        : `${API_BASE}/payments/labor`;
      
      const response = await fetch(url, {
        method: editingPayment ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          statementId: values.statementId,
          projectId: values.projectId,
          amount: values.amount,
          payeeName: values.payeeName,
          payeeAccount: values.payeeAccount,
          bankName: values.bankName,
          remark: values.remark
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(editingPayment ? '更新成功' : '创建成功');
        setFormVisible(false);
        form.resetFields();
        loadPayments();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败');
    }
  };

  // 删除付款
  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除付款申请 ${record.payment_no} 吗？`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/payments/labor/${record.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          const result = await response.json();
          
          if (result.success) {
            message.success('删除成功');
            loadPayments();
          } else {
            message.error(result.message || '删除失败');
          }
        } catch (error) {
          console.error('删除失败:', error);
          message.error('删除失败');
        }
      }
    });
  };

  // 打开审批弹窗
  const handleApprove = (record) => {
    setApprovingPayment(record);
    approveForm.resetFields();
    setApproveVisible(true);
  };

  // 提交审批
  const handleApproveSubmit = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/payments/labor/${approvingPayment.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();
      
      if (result.success) {
        message.success(result.message);
        setApproveVisible(false);
        loadPayments();
      } else {
        message.error(result.message || '审批失败');
      }
    } catch (error) {
      console.error('审批失败:', error);
      message.error('审批失败');
    }
  };

  // 打开支付确认弹窗
  const handlePay = (record) => {
    setPayingPayment(record);
    payForm.resetFields();
    setPayVisible(true);
  };

  // 确认支付
  const handlePaySubmit = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/payments/labor/${payingPayment.id}/pay`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('支付确认成功');
        setPayVisible(false);
        loadPayments();
      } else {
        message.error(result.message || '支付确认失败');
      }
    } catch (error) {
      console.error('支付确认失败:', error);
      message.error('支付确认失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '付款编号',
      dataIndex: 'payment_no',
      key: 'payment_no',
      width: 150,
      fixed: 'left'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '关联对账单',
      dataIndex: 'statement_no',
      key: 'statement_no',
      width: 150
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true
    },
    {
      title: '付款金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (amount) => (
        <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
          ¥{parseFloat(amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      title: '收款人',
      dataIndex: 'payee_name',
      key: 'payee_name',
      width: 120
    },
    {
      title: '收款账户',
      dataIndex: 'payee_account',
      key: 'payee_account',
      width: 180,
      ellipsis: true
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
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const actions = [
          <Tooltip key="view" title="查看详情">
            <Button 
              type="link" 
              icon={<EyeOutlined />} 
              onClick={() => handleViewDetail(record)}
            />
          </Tooltip>
        ];

        if (record.status === 'pending') {
          actions.push(
            <Tooltip key="edit" title="编辑">
              <Button 
                type="link" 
                icon={<EditOutlined />} 
                onClick={() => handleEdit(record)}
              />
            </Tooltip>,
            <Tooltip key="approve" title="审批">
              <Button 
                type="link" 
                icon={<AuditOutlined />} 
                onClick={() => handleApprove(record)}
              />
            </Tooltip>,
            <Tooltip key="delete" title="删除">
              <Button 
                type="link" 
                danger 
                icon={<DeleteOutlined />} 
                onClick={() => handleDelete(record)}
              />
            </Tooltip>
          );
        } else if (record.status === 'approved') {
          actions.push(
            <Tooltip key="pay" title="确认支付">
              <Button 
                type="link" 
                icon={<DollarOutlined />} 
                onClick={() => handlePay(record)}
                style={{ color: '#52c41a' }}
              />
            </Tooltip>
          );
        }

        return <Space size="small">{actions}</Space>;
      }
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ marginBottom: '16px' }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space size="middle">
                <Select
                  placeholder="选择项目"
                  style={{ width: 200 }}
                  allowClear
                  value={filters.projectId || undefined}
                  onChange={(val) => setFilters({ ...filters, projectId: val })}
                >
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
                <Select
                  placeholder="付款状态"
                  style={{ width: 120 }}
                  allowClear
                  value={filters.status || undefined}
                  onChange={(val) => setFilters({ ...filters, status: val })}
                >
                  {Object.entries(STATUS_MAP).map(([key, val]) => (
                    <Option key={key} value={key}>{val.text}</Option>
                  ))}
                </Select>
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />}
                  onClick={() => setPagination({ ...pagination, current: 1 })}
                >
                  查询
                </Button>
              </Space>
            </Col>
            <Col>
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={handleCreate}
              >
                新建付款申请
              </Button>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={payments}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="付款详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {currentPayment && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="付款编号" span={2}>
                {currentPayment.payment_no}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[currentPayment.status]?.color}>
                  {STATUS_MAP[currentPayment.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="付款金额">
                <span style={{ color: '#1890ff', fontWeight: 'bold', fontSize: '16px' }}>
                  ¥{parseFloat(currentPayment.amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="关联对账单">
                {currentPayment.statement_no}
              </Descriptions.Item>
              <Descriptions.Item label="对账期间">
                {currentPayment.period_start} ~ {currentPayment.period_end}
              </Descriptions.Item>
              <Descriptions.Item label="项目名称" span={2}>
                {currentPayment.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="收款人">
                {currentPayment.payee_name}
              </Descriptions.Item>
              <Descriptions.Item label="开户银行">
                {currentPayment.bank_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="收款账户" span={2}>
                {currentPayment.payee_account || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="劳务金额">
                ¥{parseFloat(currentPayment.laborAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="已付款金额">
                ¥{parseFloat(currentPayment.paidAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="创建人">
                {currentPayment.creator_name}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentPayment.created_at ? dayjs(currentPayment.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
              {currentPayment.approver_name && (
                <>
                  <Descriptions.Item label="审批人">
                    {currentPayment.approver_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="审批时间">
                    {currentPayment.approved_at ? dayjs(currentPayment.approved_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  </Descriptions.Item>
                </>
              )}
              {currentPayment.payer_name && (
                <>
                  <Descriptions.Item label="支付人">
                    {currentPayment.payer_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="支付时间">
                    {currentPayment.paid_at ? dayjs(currentPayment.paid_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  </Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="备注" span={2}>
                {currentPayment.remark || '-'}
              </Descriptions.Item>
            </Descriptions>

            {currentPayment.approvals && currentPayment.approvals.length > 0 && (
              <>
                <Divider orientation="left">审批流程</Divider>
                <Steps
                  current={currentPayment.approvals.findIndex(a => a.action === 'pending')}
                  status={currentPayment.status === 'rejected' ? 'error' : 'process'}
                  items={currentPayment.approvals.map(approval => ({
                    title: approval.step_name,
                    description: (
                      <div>
                        <Tag color={
                          approval.action === 'approve' ? 'green' :
                          approval.action === 'reject' ? 'red' : 'orange'
                        }>
                          {approval.action === 'approve' ? '通过' :
                           approval.action === 'reject' ? '驳回' : '待审批'}
                        </Tag>
                        {approval.approver_name && <div>审批人：{approval.approver_name}</div>}
                        {approval.comment && <div>意见：{approval.comment}</div>}
                      </div>
                    ),
                    status: approval.action === 'pending' ? 'wait' : 
                            approval.action === 'approve' ? 'finish' : 'error'
                  }))}
                />
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingPayment ? '编辑付款申请' : '新建付款申请'}
        open={formVisible}
        onOk={() => form.submit()}
        onCancel={() => setFormVisible(false)}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="statementId"
            label="关联对账单"
            rules={[{ required: true, message: '请选择对账单' }]}
          >
            <Select
              placeholder="请选择已确认的对账单"
              onChange={handleStatementChange}
              disabled={!!editingPayment}
              showSearch
              optionFilterProp="children"
            >
              {statements.map(s => (
                <Option key={s.id} value={s.id}>
                  {s.statement_no} - {s.project_name} ({s.period_start?.slice(0, 7)})
                </Option>
              ))}
            </Select>
          </Form.Item>

          {selectedStatementInfo && (
            <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic 
                    title="劳务金额" 
                    value={selectedStatementInfo.laborAmount} 
                    precision={2}
                    prefix="¥"
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="已付款金额" 
                    value={selectedStatementInfo.paidAmount} 
                    precision={2}
                    prefix="¥"
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="剩余可付" 
                    value={selectedStatementInfo.remainingAmount} 
                    precision={2}
                    prefix="¥"
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Col>
              </Row>
            </Card>
          )}

          <Form.Item
            name="projectId"
            label="项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select placeholder="请选择项目" disabled>
              {projects.map(p => (
                <Option key={p.id} value={p.id}>{p.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="amount"
            label="付款金额"
            rules={[
              { required: true, message: '请输入付款金额' },
              { type: 'number', min: 0.01, message: '金额必须大于0' }
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

          <Form.Item
            name="payeeName"
            label="收款人姓名"
            rules={[{ required: true, message: '请输入收款人姓名' }]}
          >
            <Input placeholder="请输入收款人姓名" />
          </Form.Item>

          <Form.Item
            name="bankName"
            label="开户银行"
          >
            <Input placeholder="请输入开户银行" />
          </Form.Item>

          <Form.Item
            name="payeeAccount"
            label="收款账户"
          >
            <Input placeholder="请输入收款账户" />
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title="审批付款申请"
        open={approveVisible}
        onOk={() => approveForm.submit()}
        onCancel={() => setApproveVisible(false)}
      >
        {approvingPayment && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>付款编号：</strong>{approvingPayment.payment_no}</p>
            <p><strong>付款金额：</strong>
              <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                ¥{parseFloat(approvingPayment.amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            </p>
            <p><strong>收款人：</strong>{approvingPayment.payee_name}</p>
          </div>
        )}
        <Form
          form={approveForm}
          layout="vertical"
          onFinish={handleApproveSubmit}
        >
          <Form.Item
            name="action"
            label="审批意见"
            rules={[{ required: true, message: '请选择审批意见' }]}
          >
            <Select placeholder="请选择">
              <Option value="approve">
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                通过
              </Option>
              <Option value="reject">
                <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                驳回
              </Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="comment"
            label="审批备注"
          >
            <TextArea rows={3} placeholder="请输入审批备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 支付确认弹窗 */}
      <Modal
        title="确认支付"
        open={payVisible}
        onOk={() => payForm.submit()}
        onCancel={() => setPayVisible(false)}
      >
        {payingPayment && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>付款编号：</strong>{payingPayment.payment_no}</p>
            <p><strong>付款金额：</strong>
              <span style={{ color: '#1890ff', fontWeight: 'bold', fontSize: '18px' }}>
                ¥{parseFloat(payingPayment.amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            </p>
            <p><strong>收款人：</strong>{payingPayment.payee_name}</p>
            {payingPayment.bank_name && <p><strong>开户银行：</strong>{payingPayment.bank_name}</p>}
            {payingPayment.payee_account && <p><strong>收款账户：</strong>{payingPayment.payee_account}</p>}
          </div>
        )}
        <Form
          form={payForm}
          layout="vertical"
          onFinish={handlePaySubmit}
        >
          <Form.Item
            name="remark"
            label="支付备注"
          >
            <TextArea rows={3} placeholder="请输入支付备注（如：银行流水号等）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default LaborPayment;
