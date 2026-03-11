/**
 * 项目列表页面
 * 显示所有项目，支持创建、编辑、提交审批
 * 支持虚拟项目中止和转实体
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Input,
  Space,
  Card,
  Tag,
  Modal,
  Form,
  Select,
  InputNumber,
  DatePicker,
  message,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Badge,
  Tabs,
  Divider,
  Descriptions
} from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  AuditOutlined,
  StopOutlined,
  SwapRightOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

// API 基础地址
const API_BASE = window.location.origin + '/api';

// 获取请求头
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 项目状态映射
const PROJECT_STATUS_MAP = {
  pending: { text: '草稿', color: 'default' },
  pending_approval: { text: '待审批', color: 'orange' },
  approval_rejected: { text: '审批被拒', color: 'red' },
  active: { text: '进行中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
  // 虚拟项目状态
  tracking: { text: '跟踪中', color: 'processing' },
  converted: { text: '已转实体', color: 'success' },
  aborted: { text: '已中止', color: 'error' }
};

// 项目类型映射
const PROJECT_TYPE_MAP = {
  entity: { text: '实体项目', color: 'blue' },
  virtual: { text: '虚拟项目', color: 'purple' }
};

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

function ProjectList() {
  const navigate = useNavigate();

  // 状态
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // 弹窗状态
  const [createVisible, setCreateVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [currentProject, setCurrentProject] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // 虚拟项目转换弹窗
  const [convertVisible, setConvertVisible] = useState(false);
  const [convertingProject, setConvertingProject] = useState(null);
  const [convertForm] = Form.useForm();

  // 虚拟项目中止弹窗
  const [abortVisible, setAbortVisible] = useState(false);
  const [abortingProject, setAbortingProject] = useState(null);
  const [costTargets, setCostTargets] = useState({ entityProjects: [], departments: [] });
  const [abortForm] = Form.useForm();

  // 项目详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailProject, setDetailProject] = useState(null);

  // 用户列表（用于选择负责人）
  const [users, setUsers] = useState([]);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/users?page=1&pageSize=100&status=active`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        // 后端返回的 data 可能是数组或 {list, total} 格式
        const userData = Array.isArray(result.data) ? result.data : (result.data.list || []);
        setUsers(userData);
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  }, []);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      // 根据标签页筛选类型
      if (activeTab !== 'all') {
        params.append('type', activeTab);
      }

      if (keyword) params.append('keyword', keyword);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`${API_BASE}/projects?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setProjects(result.data || result.data.list || []);
        setTotal(result.pagination?.total || result.data?.total || 0);
      } else {
        message.error(result.message || '加载项目列表失败');
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
      message.error('加载项目列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, statusFilter, activeTab]);

  // 初始化加载
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadProjects();
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setStatusFilter('');
    setPage(1);
  };

  // 分页改变
  const handleTableChange = (pagination) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  // 查看详情
  const handleViewDetail = (project) => {
    navigate(`/project/detail/${project.id}`);
  };

  // 打开编辑弹窗
  const handleEdit = (project) => {
    setCurrentProject(project);
    editForm.setFieldsValue({
      name: project.name,
      customer: project.customer,
      contract_amount: project.contract_amount,
      manager_id: project.manager_id,
      date_range: project.start_date && project.end_date ? [
        dayjs(project.start_date),
        dayjs(project.end_date)
      ] : null
    });
    setEditVisible(true);
  };

  // 创建项目
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);

      const data = {
        name: values.name,
        customer: values.customer,
        contract_amount: values.contract_amount,
        manager_id: values.manager_id,
        start_date: values.date_range?.[0]?.format('YYYY-MM-DD'),
        end_date: values.date_range?.[1]?.format('YYYY-MM-DD')
      };

      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (result.success) {
        message.success('项目创建成功');
        setCreateVisible(false);
        createForm.resetFields();
        loadProjects();
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      message.error('创建项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 更新项目
  const handleUpdate = async () => {
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);

      const data = {
        name: values.name,
        customer: values.customer,
        contract_amount: values.contract_amount,
        manager_id: values.manager_id,
        start_date: values.date_range?.[0]?.format('YYYY-MM-DD'),
        end_date: values.date_range?.[1]?.format('YYYY-MM-DD')
      };

      const response = await fetch(`${API_BASE}/projects/${currentProject.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (result.success) {
        message.success('项目更新成功');
        setEditVisible(false);
        loadProjects();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新项目失败:', error);
      message.error('更新项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除项目
  const handleDelete = async (project) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${project.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const result = await response.json();
      if (result.success) {
        message.success('项目删除成功');
        loadProjects();
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除项目失败:', error);
      message.error('删除项目失败');
    }
  };

  // 检查是否可以编辑/删除
  const canModify = (project) => {
    // 草稿或审批被拒状态可以编辑删除
    // 虚拟项目已转换或已中止不可修改
    if (project.type === 'virtual' && ['converted', 'aborted'].includes(project.status)) {
      return false;
    }
    return ['pending', 'approval_rejected', 'tracking'].includes(project.status);
  };

  // 打开虚拟项目转换弹窗
  const openConvertModal = (project) => {
    setConvertingProject(project);
    convertForm.resetFields();
    convertForm.setFieldsValue({
      contract_amount: parseFloat(project.contract_amount) || 0
    });
    setConvertVisible(true);
  };

  // 执行虚拟项目转换（带审批流程）
  const handleConvert = async () => {
    try {
      const values = await convertForm.validateFields();
      setSubmitting(true);

      const data = {
        bid_notice_no: values.bid_notice_no,
        bid_notice_date: values.bid_notice_date?.format('YYYY-MM-DD'),
        contract_amount: values.contract_amount,
        start_date: values.date_range?.[0]?.format('YYYY-MM-DD'),
        end_date: values.date_range?.[1]?.format('YYYY-MM-DD')
      };

      const response = await fetch(`${API_BASE}/projects/${convertingProject.id}/convert-with-approval`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (result.success) {
        message.success('转实体申请已提交，等待审批');
        setConvertVisible(false);
        setConvertingProject(null);
        loadProjects();
      } else {
        message.error(result.message || '转换失败');
      }
    } catch (error) {
      console.error('转换项目失败:', error);
      message.error('转换项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 打开虚拟项目中止弹窗
  const openAbortModal = async (project) => {
    setAbortingProject(project);
    abortForm.resetFields();
    
    // 获取成本归集目标列表
    try {
      const response = await fetch(`${API_BASE}/projects/cost-targets`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setCostTargets(result.data);
      }
    } catch (error) {
      console.error('获取成本目标列表失败:', error);
    }
    
    setAbortVisible(true);
  };

  // 执行虚拟项目中止（带审批流程）
  const handleAbort = async () => {
    try {
      const values = await abortForm.validateFields();
      setSubmitting(true);

      const response = await fetch(`${API_BASE}/projects/${abortingProject.id}/abort-with-approval`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reason: values.abort_reason,
          remarks: values.abort_remarks,
          cost_target_type: values.cost_target_type,
          cost_target_id: values.cost_target_id
        })
      });

      const result = await response.json();
      if (result.success) {
        message.success('中止申请已提交，等待审批');
        setAbortVisible(false);
        setAbortingProject(null);
        loadProjects();
      } else {
        message.error(result.message || '中止失败');
      }
    } catch (error) {
      console.error('中止项目失败:', error);
      message.error('中止项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 查看项目详情（弹窗）
  const handleShowDetail = async (project) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${project.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setDetailProject(result.data);
        setDetailVisible(true);
      } else {
        message.error(result.message || '获取详情失败');
      }
    } catch (error) {
      message.error('获取详情失败');
    }
  };

  // 查看转换后的实体项目
  const handleViewEntityProject = async (entityId) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${entityId}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setDetailProject(result.data);
        setDetailVisible(true);
      }
    } catch (error) {
      message.error('获取实体项目详情失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '项目编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 140,
      render: (text, record) => (
        <Space>
          <Tag color={PROJECT_TYPE_MAP[record.type]?.color || 'default'}>
            {record.type === 'virtual' ? 'V' : 'P'}
          </Tag>
          <span style={{ fontFamily: 'monospace' }}>{text}</span>
        </Space>
      )
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (text, record) => (
        <Tooltip title={text}>
          <a onClick={() => handleShowDetail(record)}>{text}</a>
          {record.type === 'virtual' && record.status === 'converted' && (
            <Tag color="success" style={{ marginLeft: 8, fontSize: 10 }}>已转实体</Tag>
          )}
        </Tooltip>
      )
    },
    {
      title: '项目类型',
      dataIndex: 'project_type',
      key: 'project_type',
      width: 100,
      render: (text) => (
        <Tag color={text === '智能化项目' ? 'blue' : text === '消防项目' ? 'orange' : 'purple'}>
          {text || '智能化项目'}
        </Tag>
      )
    },
    {
      title: '客户',
      dataIndex: 'customer',
      key: 'customer',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '合同/预估金额',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      width: 130,
      align: 'right',
      render: (amount, record) => (
        <span style={{ color: amount > 0 ? '#52c41a' : '#999' }}>
          ¥{(parseFloat(amount) || 0).toLocaleString()}
          {record.type === 'virtual' && <span style={{ fontSize: 10, color: '#999' }}> (预估)</span>}
        </span>
      )
    },
    {
      title: '负责人',
      dataIndex: 'manager_name',
      key: 'manager_name',
      width: 100,
      render: (text) => text || '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = PROJECT_STATUS_MAP[status] || PROJECT_STATUS_MAP.pending;
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 110,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleShowDetail(record)}
          >
            详情
          </Button>

          {/* 虚拟项目且跟踪中状态 - 显示"转为实体"按钮 */}
          {record.type === 'virtual' && record.status === 'tracking' && (
            <Button
              type="link"
              size="small"
              icon={<SwapRightOutlined />}
              onClick={() => openConvertModal(record)}
              style={{ color: '#52c41a' }}
            >
              转实体
            </Button>
          )}

          {/* 虚拟项目且跟踪中状态 - 显示"中止"按钮 */}
          {record.type === 'virtual' && record.status === 'tracking' && (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => openAbortModal(record)}
            >
              中止
            </Button>
          )}

          {/* 已转换的虚拟项目 - 显示跳转到实体项目 */}
          {record.type === 'virtual' && record.status === 'converted' && record.converted_to && (
            <Button
              type="link"
              size="small"
              onClick={() => handleViewEntityProject(record.converted_to)}
            >
              查看实体项目
            </Button>
          )}

          {/* 实体项目操作 */}
          {record.type === 'entity' && canModify(record) && (
            <>
              <Tooltip title={canModify(record) ? '编辑' : '审批中的项目不可编辑'}>
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEdit(record)}
                  disabled={!canModify(record)}
                >
                  编辑
                </Button>
              </Tooltip>
              <Tooltip title={canModify(record) ? '删除' : '审批中的项目不可删除'}>
                <Popconfirm
                  title="确定要删除该项目吗？"
                  description="此操作不可恢复"
                  onConfirm={() => handleDelete(record)}
                  okText="确定"
                  cancelText="取消"
                  disabled={!canModify(record)}
                >
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={!canModify(record)}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Tooltip>
            </>
          )}
        </Space>
      )
    }
  ];

  // 表单布局
  const formItemLayout = {
    labelCol: { span: 6 },
    wrapperCol: { span: 18 }
  };

  // Tab 配置
  const tabItems = [
    { key: 'all', label: '全部项目' },
    { key: 'entity', label: '实体项目' },
    { key: 'virtual', label: '虚拟项目' }
  ];

  return (
    <div className="project-list-container" style={{ padding: 24 }}>
      <Card
        title="项目列表"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>
              新建实体项目
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/project/virtual-create')}>
              新建虚拟项目
            </Button>
          </Space>
        }
      >
        {/* 搜索和筛选区域 */}
        <div className="filter-section" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder="搜索项目名称/编号/客户"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Select
                placeholder="状态筛选"
                value={statusFilter}
                onChange={setStatusFilter}
                allowClear
                style={{ width: '100%' }}
              >
                <Option value="all">全部状态</Option>
                <Option value="tracking">跟踪中</Option>
                <Option value="converted">已转实体</Option>
                <Option value="aborted">已中止</Option>
                <Option value="pending">草稿</Option>
                <Option value="pending_approval">待审批</Option>
                <Option value="approval_rejected">审批被拒</Option>
                <Option value="active">进行中</Option>
                <Option value="completed">已完成</Option>
              </Select>
            </Col>
            <Col xs={24} sm={24} md={24} lg={12}>
              <Space wrap>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                  搜索
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  重置
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* Tab 切换 */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems.map(item => ({
            key: item.key,
            label: item.label
          }))}
        />

        {/* 项目列表表格 */}
        <Table
          columns={columns}
          dataSource={projects}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50']
          }}
          onChange={handleTableChange}
          scroll={{ x: 1400 }}
          size="middle"
        />
      </Card>

      {/* 创建项目弹窗 */}
      <Modal
        title="新建项目"
        open={createVisible}
        onOk={handleCreate}
        onCancel={() => setCreateVisible(false)}
        confirmLoading={submitting}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form
          form={createForm}
          {...formItemLayout}
          name="createProjectForm"
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item
            name="customer"
            label="客户"
          >
            <Input placeholder="请输入客户名称" />
          </Form.Item>
          <Form.Item
            name="contract_amount"
            label="合同金额"
          >
            <InputNumber
              placeholder="请输入合同金额"
              style={{ width: '100%' }}
              min={0}
              precision={2}
              formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/¥\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Form.Item
            name="manager_id"
            label="负责人"
          >
            <Select
              placeholder="请选择负责人"
              allowClear
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {users.map(user => (
                <Option key={user.id} value={user.id}>
                  {user.real_name || user.username}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="date_range"
            label="项目周期"
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑项目弹窗 */}
      <Modal
        title="编辑项目"
        open={editVisible}
        onOk={handleUpdate}
        onCancel={() => setEditVisible(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={editForm}
          {...formItemLayout}
          name="editProjectForm"
        >
          <Form.Item label="项目编号">
            <Input value={currentProject?.project_no} disabled />
          </Form.Item>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item
            name="customer"
            label="客户"
          >
            <Input placeholder="请输入客户名称" />
          </Form.Item>
          <Form.Item
            name="contract_amount"
            label="合同金额"
          >
            <InputNumber
              placeholder="请输入合同金额"
              style={{ width: '100%' }}
              min={0}
              precision={2}
              formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/¥\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Form.Item
            name="manager_id"
            label="负责人"
          >
            <Select
              placeholder="请选择负责人"
              allowClear
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
            >
              {users.map(user => (
                <Option key={user.id} value={user.id}>
                  {user.real_name || user.username}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="date_range"
            label="项目周期"
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 虚拟项目转实体弹窗 */}
      <Modal
        title={
          <Space>
            <SwapRightOutlined style={{ color: '#52c41a' }} />
            <span>虚拟项目转实体</span>
          </Space>
        }
        open={convertVisible}
        onOk={handleConvert}
        onCancel={() => {
          setConvertVisible(false);
          setConvertingProject(null);
        }}
        confirmLoading={submitting}
        okText="提交审批"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        {convertingProject && (
          <>
            <div style={{
              padding: '12px 16px',
              background: '#f6ffed',
              borderRadius: 4,
              marginBottom: 16
            }}>
              <Space>
                <span>原虚拟项目：</span>
                <Tag color="purple">{convertingProject.project_no}</Tag>
                <span>{convertingProject.name}</span>
              </Space>
            </div>

            <Form
              form={convertForm}
              layout="vertical"
            >
              <Form.Item
                name="bid_notice_no"
                label="中标通知书编号"
                rules={[{ required: true, message: '请输入中标通知书编号' }]}
              >
                <Input placeholder="请输入中标通知书编号" />
              </Form.Item>

              <Form.Item
                name="bid_notice_date"
                label="中标日期"
                rules={[{ required: true, message: '请选择中标日期' }]}
              >
                <DatePicker style={{ width: '100%' }} placeholder="请选择中标日期" />
              </Form.Item>

              <Form.Item
                name="contract_amount"
                label="合同金额（元）"
                rules={[
                  { type: 'number', min: 0, message: '金额不能为负数' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="请输入合同金额"
                  min={0}
                  precision={2}
                  formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/¥\s?|(,*)/g, '')}
                />
              </Form.Item>

              <Form.Item label="项目周期">
                <Space>
                  <Form.Item name="start_date" noStyle>
                    <DatePicker placeholder="开始日期" />
                  </Form.Item>
                  <span>至</span>
                  <Form.Item name="end_date" noStyle>
                    <DatePicker placeholder="结束日期" />
                  </Form.Item>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>

      {/* 虚拟项目中止弹窗 */}
      <Modal
        title={
          <Space>
            <StopOutlined style={{ color: '#ff4d4f' }} />
            <span>中止虚拟项目</span>
          </Space>
        }
        open={abortVisible}
        onOk={handleAbort}
        onCancel={() => {
          setAbortVisible(false);
          setAbortingProject(null);
        }}
        confirmLoading={submitting}
        okText="确认中止"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={500}
        destroyOnClose
      >
        {abortingProject && (
          <>
            <div style={{
              padding: '12px 16px',
              background: '#fff2f0',
              borderRadius: 4,
              marginBottom: 16
            }}>
              <Space>
                <span>中止项目：</span>
                <Tag color="purple">{abortingProject.project_no}</Tag>
                <span>{abortingProject.name}</span>
              </Space>
            </div>

            <Form
              form={abortForm}
              layout="vertical"
            >
              <Form.Item
                name="abort_reason"
                label="中止原因"
                rules={[{ required: true, message: '请输入中止原因' }]}
              >
                <Input placeholder="请输入中止原因" />
              </Form.Item>

              <Form.Item
                name="abort_remarks"
                label="备注"
              >
                <TextArea rows={2} placeholder="请输入备注（可选）" />
              </Form.Item>

              <Form.Item
                name="cost_target_type"
                label="成本归集目标类型"
                tooltip="中止后成本将归集到选择的目标"
              >
                <Select placeholder="请选择成本归集目标类型（可选）" allowClear>
                  <Select.Option value={1}>实体项目</Select.Option>
                  <Select.Option value={2}>部门成本</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="cost_target_id"
                label="成本归集目标"
                shouldUpdate={(prevValues, curValues) => prevValues.cost_target_type !== curValues.cost_target_type}
              >
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => {
                    const targetType = getFieldValue('cost_target_type');
                    if (targetType === 1) {
                      return (
                        <Select placeholder="请选择实体项目" allowClear showSearch optionFilterProp="children">
                          {costTargets.entityProjects.map(p => (
                            <Select.Option key={p.id} value={p.id}>
                              {p.project_no} - {p.name}
                            </Select.Option>
                          ))}
                        </Select>
                      );
                    } else if (targetType === 2) {
                      return (
                        <Select placeholder="请选择部门" allowClear showSearch optionFilterProp="children">
                          {costTargets.departments.map(d => (
                            <Select.Option key={d.id} value={d.id}>
                              {d.name}
                            </Select.Option>
                          ))}
                        </Select>
                      );
                    }
                    return <Select placeholder="请先选择成本归集目标类型" disabled />;
                  }}
                </Form.Item>
              </Form.Item>
            </Form>

            <div style={{ color: '#faad14', fontSize: 12 }}>
              提示：中止申请将进入审批流程（财务 → 总经理）
            </div>
          </>
        )}
      </Modal>

      {/* 项目详情弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>项目详情</span>
          </Space>
        }
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setDetailProject(null);
        }}
        footer={null}
        width={700}
      >
        {detailProject && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="项目编号" span={1}>
              <Tag color={PROJECT_TYPE_MAP[detailProject.type]?.color}>
                {detailProject.project_no}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="项目类型" span={1}>
              <Tag color={PROJECT_TYPE_MAP[detailProject.type]?.color}>
                {PROJECT_TYPE_MAP[detailProject.type]?.text}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="项目名称" span={2}>
              {detailProject.name}
            </Descriptions.Item>
            <Descriptions.Item label="客户名称" span={2}>
              {detailProject.customer || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="合同金额" span={1}>
              ¥{(parseFloat(detailProject.contract_amount) || 0).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="项目负责人" span={1}>
              {detailProject.manager_name || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="项目状态" span={1}>
              <Tag color={PROJECT_STATUS_MAP[detailProject.status]?.color}>
                {PROJECT_STATUS_MAP[detailProject.status]?.text || detailProject.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={1}>
              {detailProject.created_at ? dayjs(detailProject.created_at).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>

            {/* 实体项目显示中标信息 */}
            {detailProject.type === 'entity' && detailProject.bid_notice_no && (
              <>
                <Descriptions.Item label="中标通知书编号" span={2}>
                  {detailProject.bid_notice_no}
                </Descriptions.Item>
                <Descriptions.Item label="中标日期" span={2}>
                  {detailProject.bid_notice_date || '-'}
                </Descriptions.Item>
              </>
            )}

            {/* 虚拟项目显示转换信息 */}
            {detailProject.type === 'virtual' && detailProject.status === 'converted' && (
              <>
                <Descriptions.Item label="转换时间" span={2}>
                  {detailProject.converted_at ? dayjs(detailProject.converted_at).format('YYYY-MM-DD HH:mm') : '-'}
                </Descriptions.Item>
                {detailProject.converted_to_name && (
                  <Descriptions.Item label="转换后实体项目" span={2}>
                    <Tag color="blue">{detailProject.converted_to_no}</Tag>
                    {detailProject.converted_to_name}
                  </Descriptions.Item>
                )}
              </>
            )}

            {/* 虚拟项目显示中止信息 */}
            {detailProject.type === 'virtual' && detailProject.status === 'aborted' && (
              <>
                <Descriptions.Item label="中止时间" span={2}>
                  {detailProject.aborted_at ? dayjs(detailProject.aborted_at).format('YYYY-MM-DD HH:mm') : '-'}
                </Descriptions.Item>
                {detailProject.abort_reason && (
                  <Descriptions.Item label="中止原因" span={2}>
                    {detailProject.abort_reason}
                  </Descriptions.Item>
                )}
                {detailProject.abort_remarks && (
                  <Descriptions.Item label="中止备注" span={2}>
                    {detailProject.abort_remarks}
                  </Descriptions.Item>
                )}
              </>
            )}

            {/* 实体项目显示来源虚拟项目 */}
            {detailProject.type === 'entity' && detailProject.converted_from && (
              <Descriptions.Item label="来源虚拟项目" span={2}>
                {detailProject.virtual_from_no && (
                  <Tag color="purple">{detailProject.virtual_from_no}</Tag>
                )}
                {detailProject.virtual_from_name || '-'}
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}

export default ProjectList;
