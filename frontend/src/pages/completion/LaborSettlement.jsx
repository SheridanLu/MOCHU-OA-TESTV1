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
  Steps,
  Timeline
} from 'antd';
import {
  DollarOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CloseCircleOutlined,
  AuditOutlined,
  FileTextOutlined,
  TeamOutlined,
  BarChartOutlined
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

// 结算状态映射
const STATUS_MAP = {
  pending: { text: '待审批', color: 'orange' },
  approved: { text: '已审批', color: 'blue' },
  paid: { text: '已支付', color: 'green' },
  rejected: { text: '已驳回', color: 'red' }
};

// 工种类型
const WORK_TYPES = [
  { value: '木工', label: '木工' },
  { value: '钢筋工', label: '钢筋工' },
  { value: '混凝土工', label: '混凝土工' },
  { value: '瓦工', label: '瓦工' },
  { value: '抹灰工', label: '抹灰工' },
  { value: '油漆工', label: '油漆工' },
  { value: '电工', label: '电工' },
  { value: '水暖工', label: '水暖工' },
  { value: '架子工', label: '架子工' },
  { value: '焊工', label: '焊工' },
  { value: '机械工', label: '机械工' },
  { value: '普工', label: '普工' },
  { value: '其他', label: '其他' }
];

/**
 * 竣工管理 - 劳务结算页面
 * Task 57: 实现竣工后劳务费用结算功能
 */
function LaborSettlement() {
  const [loading, setLoading] = useState(false);
  const [settlements, setSettlements] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    status: '',
    projectId: '',
    keyword: ''
  });
  const [projects, setProjects] = useState([]);

  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentSettlement, setCurrentSettlement] = useState(null);

  // 新建/编辑弹窗
  const [formVisible, setFormVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingSettlement, setEditingSettlement] = useState(null);

  // 审批弹窗
  const [approveVisible, setApproveVisible] = useState(false);
  const [approveForm] = Form.useForm();
  const [approvingSettlement, setApprovingSettlement] = useState(null);

  // 支付确认弹窗
  const [payVisible, setPayVisible] = useState(false);
  const [payForm] = Form.useForm();
  const [payingSettlement, setPayingSettlement] = useState(null);

  // 项目统计弹窗
  const [statsVisible, setStatsVisible] = useState(false);
  const [projectStats, setProjectStats] = useState(null);

  // 加载项目列表
  useEffect(() => {
    loadProjects();
    loadStatistics();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/completion/labor-settlement/projects/completed`, {
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

  const loadStatistics = async () => {
    try {
      const response = await fetch(`${API_BASE}/completion/labor-settlement/statistics`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setStatistics(result.data);
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  };

  // 加载结算列表
  const loadSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.keyword) params.append('keyword', filters.keyword);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/completion/labor-settlement?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setSettlements(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载结算列表失败:', error);
      message.error('加载结算列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  // 查看详情
  const handleViewDetail = async (record) => {
    try {
      const response = await fetch(`${API_BASE}/completion/labor-settlement/${record.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setCurrentSettlement(result.data);
        setDetailVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      message.error('获取详情失败');
    }
  };

  // 新建结算
  const handleCreate = () => {
    setEditingSettlement(null);
    form.resetFields();
    setFormVisible(true);
  };

  // 编辑结算
  const handleEdit = (record) => {
    setEditingSettlement(record);
    form.setFieldsValue({
      projectId: record.project_id,
      workerName: record.worker_name,
      workType: record.work_type,
      workDays: record.work_days,
      dailyRate: record.daily_rate,
      deduction: record.deduction,
      remark: record.remark
    });
    setFormVisible(true);
  };

  // 计算金额
  const calculateAmount = () => {
    const workDays = form.getFieldValue('workDays') || 0;
    const dailyRate = form.getFieldValue('dailyRate') || 0;
    const deduction = form.getFieldValue('deduction') || 0;
    const total = parseFloat(workDays) * parseFloat(dailyRate);
    const actual = total - parseFloat(deduction);
    return { total, actual };
  };

  // 提交表单
  const handleSubmit = async (values) => {
    try {
      const url = editingSettlement
        ? `${API_BASE}/completion/labor-settlement/${editingSettlement.id}`
        : `${API_BASE}/completion/labor-settlement`;

      const response = await fetch(url, {
        method: editingSettlement ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          projectId: values.projectId,
          workerName: values.workerName,
          workType: values.workType,
          workDays: values.workDays,
          dailyRate: values.dailyRate,
          deduction: values.deduction || 0,
          remark: values.remark
        })
      });

      const result = await response.json();

      if (result.success) {
        message.success(editingSettlement ? '更新成功' : '创建成功');
        setFormVisible(false);
        form.resetFields();
        loadSettlements();
        loadStatistics();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败');
    }
  };

  // 删除结算
  const handleDelete = (record) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除结算单 ${record.settlement_no} 吗？`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/completion/labor-settlement/${record.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          const result = await response.json();

          if (result.success) {
            message.success('删除成功');
            loadSettlements();
            loadStatistics();
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
    setApprovingSettlement(record);
    approveForm.resetFields();
    setApproveVisible(true);
  };

  // 提交审批
  const handleApproveSubmit = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/completion/labor-settlement/${approvingSettlement.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();

      if (result.success) {
        message.success(result.message);
        setApproveVisible(false);
        loadSettlements();
        loadStatistics();
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
    setPayingSettlement(record);
    payForm.resetFields();
    setPayVisible(true);
  };

  // 确认支付
  const handlePaySubmit = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/completion/labor-settlement/${payingSettlement.id}/pay`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();

      if (result.success) {
        message.success('支付确认成功');
        setPayVisible(false);
        loadSettlements();
        loadStatistics();
      } else {
        message.error(result.message || '支付确认失败');
      }
    } catch (error) {
      console.error('支付确认失败:', error);
      message.error('支付确认失败');
    }
  };

  // 查看项目统计
  const handleViewProjectStats = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE}/completion/labor-settlement/project/${projectId}/stats`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setProjectStats(result.data);
        setStatsVisible(true);
      }
    } catch (error) {
      console.error('获取项目统计失败:', error);
      message.error('获取项目统计失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '结算单号',
      dataIndex: 'settlement_no',
      key: 'settlement_no',
      width: 130,
      fixed: 'left'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => {
        const config = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 180,
      ellipsis: true,
      render: (text, record) => (
        <a onClick={() => handleViewProjectStats(record.project_id)}>{text}</a>
      )
    },
    {
      title: '工人姓名',
      dataIndex: 'worker_name',
      key: 'worker_name',
      width: 100
    },
    {
      title: '工种',
      dataIndex: 'work_type',
      key: 'work_type',
      width: 90
    },
    {
      title: '工日',
      dataIndex: 'work_days',
      key: 'work_days',
      width: 70,
      align: 'right'
    },
    {
      title: '日工资',
      dataIndex: 'daily_rate',
      key: 'daily_rate',
      width: 90,
      align: 'right',
      render: (val) => `¥${parseFloat(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 100,
      align: 'right',
      render: (amount) => (
        <span style={{ color: '#1890ff' }}>
          ¥{parseFloat(amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      title: '扣款',
      dataIndex: 'deduction',
      key: 'deduction',
      width: 90,
      align: 'right',
      render: (val) => val > 0 ? (
        <span style={{ color: '#ff4d4f' }}>
          -¥{parseFloat(val).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      ) : '-'
    },
    {
      title: '实发金额',
      dataIndex: 'actual_amount',
      key: 'actual_amount',
      width: 110,
      align: 'right',
      render: (amount) => (
        <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
          ¥{parseFloat(amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      title: '创建人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 90
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
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
      {/* 统计卡片 */}
      {statistics && (
        <Card style={{ marginBottom: 16 }}>
          <Row gutter={24}>
            <Col span={4}>
              <Statistic
                title="结算总数"
                value={statistics.total_count || 0}
                suffix="笔"
                prefix={<FileTextOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="待审批"
                value={statistics.pending_count || 0}
                suffix="笔"
                valueStyle={{ color: '#faad14' }}
                prefix={<AuditOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="已审批"
                value={statistics.approved_count || 0}
                suffix="笔"
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="已支付"
                value={statistics.paid_count || 0}
                suffix="笔"
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="待付金额"
                value={statistics.approved_amount || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="已付金额"
                value={statistics.paid_amount || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#52c41a' }}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card>
        <div style={{ marginBottom: '16px' }}>
          <Row justify="space-between" align="middle">
            <Col>
              <Space size="middle">
                <Input
                  placeholder="搜索结算单号/工人/项目"
                  style={{ width: 200 }}
                  allowClear
                  value={filters.keyword}
                  onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                  onPressEnter={() => setPagination({ ...pagination, current: 1 })}
                />
                <Select
                  placeholder="选择项目"
                  style={{ width: 200 }}
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  value={filters.projectId || undefined}
                  onChange={(val) => setFilters({ ...filters, projectId: val })}
                >
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
                <Select
                  placeholder="结算状态"
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
                新建劳务结算
              </Button>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={settlements}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1600 }}
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
        title="劳务结算详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {currentSettlement && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="结算单号" span={2}>
                {currentSettlement.settlement_no}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[currentSettlement.status]?.color}>
                  {STATUS_MAP[currentSettlement.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="项目名称">
                {currentSettlement.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="工人姓名">
                {currentSettlement.worker_name}
              </Descriptions.Item>
              <Descriptions.Item label="工种">
                {currentSettlement.work_type}
              </Descriptions.Item>
              <Descriptions.Item label="工日">
                {currentSettlement.work_days} 天
              </Descriptions.Item>
              <Descriptions.Item label="日工资">
                ¥{parseFloat(currentSettlement.daily_rate || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="总金额">
                <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                  ¥{parseFloat(currentSettlement.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="扣款金额">
                {currentSettlement.deduction > 0 ? (
                  <span style={{ color: '#ff4d4f' }}>
                    -¥{parseFloat(currentSettlement.deduction).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                ) : '¥0.00'}
              </Descriptions.Item>
              <Descriptions.Item label="实发金额" span={2}>
                <span style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '18px' }}>
                  ¥{parseFloat(currentSettlement.actual_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="创建人">
                {currentSettlement.creator_name}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentSettlement.created_at ? dayjs(currentSettlement.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
              {currentSettlement.approver_name && (
                <>
                  <Descriptions.Item label="审批人">
                    {currentSettlement.approver_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="审批时间">
                    {currentSettlement.approved_at ? dayjs(currentSettlement.approved_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  </Descriptions.Item>
                </>
              )}
              {currentSettlement.payer_name && (
                <>
                  <Descriptions.Item label="支付人">
                    {currentSettlement.payer_name}
                  </Descriptions.Item>
                  <Descriptions.Item label="支付时间">
                    {currentSettlement.paid_at ? dayjs(currentSettlement.paid_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  </Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="备注" span={2}>
                {currentSettlement.remark || '-'}
              </Descriptions.Item>
            </Descriptions>

            {currentSettlement.approvals && currentSettlement.approvals.length > 0 && (
              <>
                <Divider orientation="left">审批流程</Divider>
                <Steps
                  current={currentSettlement.approvals.findIndex(a => a.action === 'pending')}
                  status={currentSettlement.status === 'rejected' ? 'error' : 'process'}
                  items={currentSettlement.approvals.map(approval => ({
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

            {currentSettlement.projectPaidAmount !== undefined && (
              <>
                <Divider orientation="left">项目结算统计</Divider>
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic title="本项目已支付" value={currentSettlement.projectPaidAmount} precision={2} prefix="¥" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="本笔金额" value={currentSettlement.actual_amount} precision={2} prefix="¥" />
                  </Col>
                </Row>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={editingSettlement ? '编辑劳务结算' : '新建劳务结算'}
        open={formVisible}
        onOk={() => form.submit()}
        onCancel={() => setFormVisible(false)}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={() => form.validateFields()}
        >
          <Form.Item
            name="projectId"
            label="关联项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select
              placeholder="请选择项目"
              showSearch
              optionFilterProp="children"
              disabled={!!editingSettlement}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>
                  {p.project_no} - {p.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="workerName"
            label="工人姓名"
            rules={[{ required: true, message: '请输入工人姓名' }]}
          >
            <Input placeholder="请输入工人姓名" maxLength={50} />
          </Form.Item>

          <Form.Item
            name="workType"
            label="工种"
            rules={[{ required: true, message: '请选择工种' }]}
          >
            <Select placeholder="请选择工种">
              {WORK_TYPES.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="workDays"
                label="工日"
                rules={[
                  { required: true, message: '请输入工日' },
                  { type: 'number', min: 0.5, message: '工日必须大于0' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={1}
                  min={0.5}
                  step={0.5}
                  placeholder="请输入工日"
                  addonAfter="天"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="dailyRate"
                label="日工资"
                rules={[
                  { required: true, message: '请输入日工资' },
                  { type: 'number', min: 1, message: '日工资必须大于0' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  precision={2}
                  min={1}
                  prefix="¥"
                  placeholder="请输入日工资"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="deduction"
            label="扣款金额"
            initialValue={0}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              prefix="¥"
              placeholder="请输入扣款金额（如有）"
            />
          </Form.Item>

          <Form.Item shouldUpdate>
            {() => {
              const { total, actual } = calculateAmount();
              return (
                <Card size="small" style={{ marginBottom: 16, background: '#f5f5f5' }}>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic
                        title="计算总金额"
                        value={total}
                        precision={2}
                        prefix="¥"
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="实发金额"
                        value={actual}
                        precision={2}
                        prefix="¥"
                        valueStyle={{ color: actual >= 0 ? '#52c41a' : '#ff4d4f' }}
                      />
                    </Col>
                  </Row>
                </Card>
              );
            }}
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <TextArea rows={3} placeholder="请输入备注信息（选填）" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title="审批劳务结算"
        open={approveVisible}
        onOk={() => approveForm.submit()}
        onCancel={() => setApproveVisible(false)}
      >
        {approvingSettlement && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>结算单号：</strong>{approvingSettlement.settlement_no}</p>
            <p><strong>工人姓名：</strong>{approvingSettlement.worker_name}</p>
            <p><strong>工种：</strong>{approvingSettlement.work_type}</p>
            <p><strong>实发金额：</strong>
              <span style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '16px' }}>
                ¥{parseFloat(approvingSettlement.actual_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            </p>
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
        {payingSettlement && (
          <div style={{ marginBottom: 16 }}>
            <p><strong>结算单号：</strong>{payingSettlement.settlement_no}</p>
            <p><strong>工人姓名：</strong>{payingSettlement.worker_name}</p>
            <p><strong>工种：</strong>{payingSettlement.work_type}</p>
            <p><strong>实发金额：</strong>
              <span style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '20px' }}>
                ¥{parseFloat(payingSettlement.actual_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
            </p>
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
            <TextArea rows={3} placeholder="请输入支付备注（如：银行流水号、支付方式等）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 项目统计弹窗 */}
      <Modal
        title="项目劳务结算统计"
        open={statsVisible}
        onCancel={() => setStatsVisible(false)}
        footer={null}
        width={600}
      >
        {projectStats && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="项目名称" span={2}>
                {projectStats.project?.name}
              </Descriptions.Item>
              <Descriptions.Item label="项目状态">
                <Tag color={projectStats.project?.status === 'completed' ? 'green' : 'blue'}>
                  {projectStats.project?.status === 'completed' ? '已竣工' : '进行中'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="合同金额">
                ¥{parseFloat(projectStats.project?.contract_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </Descriptions.Item>
            </Descriptions>

            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="结算总笔数"
                  value={projectStats.total_count || 0}
                  suffix="笔"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="结算总金额"
                  value={projectStats.total_amount || 0}
                  precision={2}
                  prefix="¥"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="扣款总额"
                  value={projectStats.total_deduction || 0}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
            <Divider />
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="已支付"
                  value={projectStats.paid_amount || 0}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="待支付"
                  value={projectStats.approved_amount || 0}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="待审批"
                  value={projectStats.pending_amount || 0}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#faad14' }}
                />
              </Col>
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default LaborSettlement;
