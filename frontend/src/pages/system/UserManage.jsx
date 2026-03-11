import { useState, useEffect, useCallback } from 'react';
import {
  Typography,
  Table,
  Button,
  Space,
  Card,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tag,
  Tooltip,
  TreeSelect,
  Row,
  Col,
  Dropdown,
  Badge,
} from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  TeamOutlined,
  MoreOutlined,
  LockOutlined,
  StopOutlined,
  CheckCircleOutlined,
  
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { Option } = Select;

// 用户状态颜色映射
const statusColors = {
  active: 'green',
  disabled: 'red',
  deleted: 'default'
};

// 用户状态文本映射
const statusText = {
  active: '正常',
  disabled: '禁用',
  deleted: '已删除'
};

function UserManage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [departmentTree, setDepartmentTree] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add' | 'edit'
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // 搜索和筛选状态
  const [searchParams, setSearchParams] = useState({
    keyword: '',
    department_id: null,
    status: 'all'
  });

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: '姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 100,
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      width: 150,
      render: (text) => text || <Text type="secondary">未分配</Text>,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 180,
      ellipsis: true,
    },
    {
      title: '职位',
      dataIndex: 'position',
      key: 'position',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => (
        <Tag color={statusColors[status] || 'default'}>
          {statusText[status] || status}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'toggleStatus',
                  label: record.status === 'active' ? '禁用' : '启用',
                  icon: record.status === 'active' ? <StopOutlined /> : <CheckCircleOutlined />,
                },
                {
                  key: 'resetPassword',
                  label: '重置密码',
                  icon: <LockOutlined />,
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: '删除',
                  icon: <DeleteOutlined />,
                  danger: true,
                },
              ],
              onClick: ({ key }) => {
                console.log('Dropdown clicked:', key, record);
                if (key === 'toggleStatus') {
                  handleToggleStatus(record);
                } else if (key === 'resetPassword') {
                  handleResetPassword(record);
                } else if (key === 'delete') {
                  handleDeleteConfirm(record);
                }
              },
            }}
            trigger={['click']}
          >
            <Button type="link" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  // 获取用户列表
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchParams.keyword) {
        queryParams.append('keyword', searchParams.keyword);
      }
      if (searchParams.department_id) {
        queryParams.append('department_id', searchParams.department_id);
      }
      if (searchParams.status && searchParams.status !== 'all') {
        queryParams.append('status', searchParams.status);
      }

      const url = `/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await api.get(url);
      
      if (response.data.success) {
        setUsers(response.data.data);
      }
    } catch (error) {
      message.error('获取用户列表失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  // 获取部门列表
  const fetchDepartments = async () => {
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        const { tree } = response.data.data;
        setDepartmentTree(tree);
      }
    } catch (error) {
      message.error('获取部门列表失败');
      console.error(error);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 构建部门树选项
  const buildDepartmentOptions = () => {
    const buildOptions = (items) => {
      return items.map(item => ({
        value: item.id,
        label: item.title || item.name,
        children: item.children ? buildOptions(item.children) : undefined,
      }));
    };

    return [
      { value: null, label: '未分配部门' },
      ...buildOptions(departmentTree)
    ];
  };

  // 打开新增弹窗
  const handleAdd = () => {
    setModalType('add');
    setCurrentUser(null);
    form.resetFields();
    // 如果有筛选部门，默认选择该部门
    if (searchParams.department_id) {
      form.setFieldsValue({ department_id: searchParams.department_id });
    }
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const handleEdit = (record) => {
    setModalType('edit');
    setCurrentUser(record);
    form.setFieldsValue({
      username: record.username,
      real_name: record.real_name,
      phone: record.phone,
      email: record.email,
      department_id: record.department_id,
      position: record.position,
      status: record.status,
      password: '', // 密码留空
    });
    setModalVisible(true);
  };

  // 切换用户状态
  const handleToggleStatus = async (record) => {
    try {
      const newStatus = record.status === 'active' ? 'disabled' : 'active';
      const response = await api.put(`/users/${record.id}`, { status: newStatus });
      
      if (response.data.success) {
        message.success(`用户已${newStatus === 'active' ? '启用' : '禁用'}`);
        fetchUsers();
      }
    } catch (error) {
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else {
        message.error('操作失败');
      }
    }
  };

  // 重置密码
  const handleResetPassword = (record) => {
    Modal.confirm({
      title: '重置密码',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确定要重置用户 <Text strong>{record.real_name}</Text> 的密码吗？</p>
          <p>密码将被重置为：<Text code>123456</Text></p>
        </div>
      ),
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await api.put(`/users/${record.id}`, { password: '123456' });
          if (response.data.success) {
            message.success('密码已重置为 123456');
          } else {
            message.error(response.data.message || '重置密码失败');
          }
        } catch (error) {
          console.error('重置密码失败:', error);
          message.error(error.response?.data?.message || '重置密码失败');
        }
      },
    });
  };

  // 删除确认
  const handleDeleteConfirm = (record) => {
    console.log('handleDeleteConfirm called:', record);
    Modal.confirm({
      getContainer: () => document.body,
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确定要删除用户 <Text strong>{record.real_name}</Text> 吗？</p>
          <p><Text type="secondary">此操作为软删除，用户数据仍会保留。</Text></p>
        </div>
      ),
      okText: '确定',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        console.log('Delete onOk called, user id:', record.id);
        try {
          const response = await api.delete(`/users/${record.id}`);
          console.log('Delete response:', response);
          if (response.data.success) {
            message.success('用户删除成功');
            fetchUsers();
          } else {
            message.error(response.data.message || '删除用户失败');
          }
        } catch (error) {
          console.error('删除用户失败:', error);
          message.error(error.response?.data?.message || '删除用户失败');
        }
      },
    });
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      // 清理空值
      Object.keys(values).forEach(key => {
        if (values[key] === '' || values[key] === undefined) {
          values[key] = null;
        }
      });

      if (modalType === 'add') {
        const response = await api.post('/users', values);
        if (response.data.success) {
          message.success('用户创建成功');
          setModalVisible(false);
          fetchUsers();
        }
      } else {
        // 编辑时，如果密码为空则不提交密码字段
        if (!values.password) {
          delete values.password;
        }
        const response = await api.put(`/users/${currentUser.id}`, values);
        if (response.data.success) {
          message.success('用户更新成功');
          setModalVisible(false);
          fetchUsers();
        }
      }
    } catch (error) {
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else if (error.errorFields) {
        // 表单验证错误
        return;
      } else {
        message.error(modalType === 'add' ? '创建用户失败' : '更新用户失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 批量操作
  const handleBatchAction = async (action) => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要操作的用户');
      return;
    }

    Modal.confirm({
      title: '批量操作确认',
      icon: <ExclamationCircleOutlined />,
      content: `确定要${action === 'active' ? '启用' : '禁用'}选中的 ${selectedRowKeys.length} 个用户吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await api.put('/users/batch-status', {
            ids: selectedRowKeys,
            status: action
          });
          if (response.data.success) {
            message.success(response.data.message);
            setSelectedRowKeys([]);
            fetchUsers();
          }
        } catch {
          message.error('批量操作失败');
        }
      },
    });
  };

  // 搜索
  const handleSearch = () => {
    fetchUsers();
  };

  // 重置搜索
  const handleResetSearch = () => {
    setSearchParams({
      keyword: '',
      department_id: null,
      status: 'all'
    });
  };

  // 表格行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_INVERT,
      Table.SELECTION_NONE,
    ],
  };

  return (
    <div style={{ padding: '24px' }}>
      <Title level={4} style={{ marginBottom: '24px' }}>
        <UserOutlined style={{ marginRight: '8px' }} />
        用户管理
      </Title>

      {/* 搜索和筛选 */}
      <Card style={{ marginBottom: '16px' }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="搜索用户名/姓名/手机号/邮箱"
              prefix={<SearchOutlined />}
              value={searchParams.keyword}
              onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col span={5}>
            <TreeSelect
              style={{ width: '100%' }}
              placeholder="选择部门"
              value={searchParams.department_id}
              onChange={(value) => setSearchParams({ ...searchParams, department_id: value })}
              treeData={buildDepartmentOptions()}
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="label"
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="状态筛选"
              value={searchParams.status}
              onChange={(value) => setSearchParams({ ...searchParams, status: value })}
            >
              <Option value="all">全部状态</Option>
              <Option value="active">正常</Option>
              <Option value="disabled">禁用</Option>
            </Select>
          </Col>
          <Col span={9}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button onClick={handleResetSearch}>重置</Button>
              <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 操作栏 */}
      <Card>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              新增用户
            </Button>
            {selectedRowKeys.length > 0 && (
              <>
                <Button onClick={() => handleBatchAction('active')}>
                  批量启用 ({selectedRowKeys.length})
                </Button>
                <Button danger onClick={() => handleBatchAction('disabled')}>
                  批量禁用 ({selectedRowKeys.length})
                </Button>
              </>
            )}
          </Space>
          <Text type="secondary">共 {users.length} 条记录</Text>
        </div>

        {/* 用户列表 */}
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          scroll={{ x: 1300 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            defaultPageSize: 10,
          }}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={modalType === 'add' ? '新增用户' : '编辑用户'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnClose
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ status: 'active', department_id: null }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '用户名只能包含字母、数字、下划线，长度3-20位' },
                ]}
              >
                <Input 
                  placeholder="请输入用户名" 
                  maxLength={20}
                  disabled={modalType === 'edit'}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="real_name"
                label="姓名"
                rules={[
                  { required: true, message: '请输入姓名' },
                  { max: 20, message: '姓名不能超过20个字符' },
                ]}
              >
                <Input placeholder="请输入姓名" maxLength={20} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="password"
                label={modalType === 'edit' ? '新密码（留空则不修改）' : '密码'}
                rules={modalType === 'add' ? [
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码长度不能少于6位' },
                ] : [
                  { min: 6, message: '密码长度不能少于6位' },
                ]}
              >
                <Input.Password 
                  placeholder={modalType === 'edit' ? '留空则不修改密码' : '请输入密码'} 
                  maxLength={50}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
                ]}
              >
                <Input placeholder="请输入手机号" maxLength={11} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入正确的邮箱地址' },
                ]}
              >
                <Input placeholder="请输入邮箱" maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="position"
                label="职位"
              >
                <Input placeholder="请输入职位" maxLength={50} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="department_id"
                label="所属部门"
              >
                <TreeSelect
                  style={{ width: '100%' }}
                  placeholder="请选择部门"
                  treeData={buildDepartmentOptions()}
                  allowClear
                  showSearch
                  treeDefaultExpandAll
                  treeNodeFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select placeholder="请选择状态">
                  <Option value="active">正常</Option>
                  <Option value="disabled">禁用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {modalType === 'edit' && (
            <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px', marginBottom: '16px' }}>
              <Text type="secondary">
                提示：密码留空则不修改原密码。如需修改密码，请输入新密码。
              </Text>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
}

export default UserManage;
