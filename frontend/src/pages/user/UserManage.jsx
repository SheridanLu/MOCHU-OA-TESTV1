import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Input,
  Select,
  Space,
  Card,
  Tag,
  Modal,
  Descriptions,
  message,
  Popconfirm,
  Tooltip,
  Form,
  Row,
  Col
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  StopOutlined,
  CheckCircleOutlined,
  UserAddOutlined
} from '@ant-design/icons';
import './UserManage.css';

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

// 用户管理页面
function UserManage() {
  // 状态
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [departments, setDepartments] = useState([]);

  // 搜索和筛选条件
  const [keyword, setKeyword] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 弹窗状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [editForm] = Form.useForm();
  const [addForm] = Form.useForm();

  // 加载部门列表（用于筛选）
  const loadDepartments = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/departments`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setDepartments(result.data.list || []);
      }
    } catch (error) {
      console.error('加载部门列表失败:', error);
    }
  }, []);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      if (keyword) params.append('keyword', keyword);
      if (departmentFilter) params.append('department', departmentFilter);
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(`${API_BASE}/users?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        // 后端返回的 data 可能是数组或 {list, total} 格式
        const userData = Array.isArray(result.data) ? result.data : (result.data.list || []);
        setUsers(userData);
        setTotal(result.data.total || userData.length);
      } else {
        message.error(result.message || '加载用户列表失败');
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, departmentFilter, statusFilter]);

  // 初始化加载
  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadUsers();
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setDepartmentFilter('');
    setStatusFilter('');
    setPage(1);
  };

  // 分页改变
  const handleTableChange = (pagination) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  // 查看详情
  const handleViewDetail = async (user) => {
    try {
      const response = await fetch(`${API_BASE}/users/${user.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setCurrentUser(result.data);
        setDetailVisible(true);
      } else {
        message.error(result.message || '获取用户详情失败');
      }
    } catch (error) {
      console.error('获取用户详情失败:', error);
      message.error('获取用户详情失败');
    }
  };

  // 打开新增用户弹窗
  const handleAddUser = () => {
    addForm.resetFields();
    setAddVisible(true);
  };

  // 提交新增用户
  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields();
      const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (result.success) {
        message.success('用户创建成功');
        setAddVisible(false);
        addForm.resetFields();
        loadUsers();
      } else {
        message.error(result.message || '创建用户失败');
      }
    } catch (error) {
      console.error('创建用户失败:', error);
      message.error('创建用户失败');
    }
  };

  // 打开编辑弹窗
  const handleEdit = async (user) => {
    try {
      const response = await fetch(`${API_BASE}/users/${user.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setCurrentUser(result.data);
        editForm.setFieldsValue({
          real_name: result.data.real_name,
          phone: result.data.phone,
          email: result.data.email,
          department_id: result.data.department_id,
          position: result.data.position
        });
        setEditVisible(true);
      } else {
        message.error(result.message || '获取用户信息失败');
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
      message.error('获取用户信息失败');
    }
  };

  // 提交编辑
  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      const response = await fetch(`${API_BASE}/users/${currentUser.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (result.success) {
        message.success('用户信息更新成功');
        setEditVisible(false);
        loadUsers();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新用户信息失败:', error);
      message.error('更新用户信息失败');
    }
  };

  // 切换用户状态
  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      const response = await fetch(`${API_BASE}/users/${user.id}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      const result = await response.json();
      if (result.success) {
        message.success(result.message);
        loadUsers();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (error) {
      console.error('更新用户状态失败:', error);
      message.error('更新用户状态失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120
    },
    {
      title: '姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 100
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (text) => text || '-'
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '启用' : '禁用'}
        </Tag>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              详情
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Popconfirm
            title={record.status === 'active' ? '确定要禁用该用户吗？' : '确定要启用该用户吗？'}
            onConfirm={() => handleToggleStatus(record)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title={record.status === 'active' ? '禁用用户' : '启用用户'}>
              <Button
                type="link"
                size="small"
                danger={record.status === 'active'}
                icon={record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />}
              >
                {record.status === 'active' ? '禁用' : '启用'}
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="user-manage-container">
      <Card title="用户管理" className="user-manage-card">
        {/* 搜索和筛选区域 */}
        <div className="filter-section">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder="搜索用户名/姓名/手机号"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Select
                placeholder="选择部门"
                value={departmentFilter}
                onChange={setDepartmentFilter}
                allowClear
                style={{ width: '100%' }}
              >
                {departments.map(dept => (
                  <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={8} lg={4}>
              <Select
                placeholder="选择状态"
                value={statusFilter}
                onChange={setStatusFilter}
                allowClear
                style={{ width: '100%' }}
              >
                <Option value="active">启用</Option>
                <Option value="inactive">禁用</Option>
              </Select>
            </Col>
            <Col xs={24} sm={24} md={24} lg={9}>
              <Space wrap>
                <Button type="primary" icon={<UserAddOutlined />} onClick={handleAddUser}>
                  新增用户
                </Button>
                <Button icon={<SearchOutlined />} onClick={handleSearch}>
                  搜索
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  重置
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* 用户列表表格 */}
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50'],
            onChange: (page, pageSize) => {
              setPage(page);
              setPageSize(pageSize);
            }
          }}
          onChange={handleTableChange}
          scroll={{ x: 1000 }}
          size="middle"
        />
      </Card>

      {/* 用户详情弹窗 */}
      <Modal
        title="用户详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {currentUser && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="用户名">{currentUser.username}</Descriptions.Item>
            <Descriptions.Item label="姓名">{currentUser.real_name}</Descriptions.Item>
            <Descriptions.Item label="部门">{currentUser.department_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="职位">{currentUser.position || '-'}</Descriptions.Item>
            <Descriptions.Item label="手机号">{currentUser.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{currentUser.email || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={currentUser.status === 'active' ? 'green' : 'red'}>
                {currentUser.status === 'active' ? '启用' : '禁用'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {currentUser.created_at ? new Date(currentUser.created_at).toLocaleString('zh-CN') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 编辑用户弹窗 */}
      <Modal
        title="编辑用户"
        open={editVisible}
        onOk={handleEditSubmit}
        onCancel={() => setEditVisible(false)}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          name="editUserForm"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="real_name"
                label="姓名"
                rules={[{ required: true, message: '请输入姓名' }]}
              >
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
                ]}
              >
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入正确的邮箱地址' }
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department_id" label="所属部门">
                <Select placeholder="请选择部门" allowClear>
                  {departments.map(dept => (
                    <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="position" label="职位">
                <Input placeholder="请输入职位" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 新增用户弹窗 */}
      <Modal
        title="新增用户"
        open={addVisible}
        onOk={handleAddSubmit}
        onCancel={() => setAddVisible(false)}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form
          form={addForm}
          layout="vertical"
          name="addUserForm"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '用户名为3-20位字母、数字或下划线' }
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="password"
                label="初始密码"
                rules={[
                  { required: true, message: '请输入初始密码' },
                  { min: 6, message: '密码至少6位' }
                ]}
              >
                <Input.Password placeholder="请输入初始密码" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="real_name"
                label="姓名"
                rules={[{ required: true, message: '请输入姓名' }]}
              >
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
                ]}
              >
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入正确的邮箱地址' }
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department_id" label="所属部门">
                <Select placeholder="请选择部门" allowClear>
                  {departments.map(dept => (
                    <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="position" label="职位">
                <Input placeholder="请输入职位" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}

export default UserManage;
