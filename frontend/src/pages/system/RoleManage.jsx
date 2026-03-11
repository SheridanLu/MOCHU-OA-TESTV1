import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Input,
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
  Col,
  Checkbox,
  Divider,
  Badge,
  Alert
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyOutlined,
  PlusOutlined,
  SettingOutlined
} from '@ant-design/icons';
import './RoleManage.css';

// API 基础地址
const API_BASE = '/api';

// 获取请求头
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 权限模块中文名映射
const MODULE_NAMES = {
  system: '系统管理',
  user: '用户管理',
  role: '角色权限',
  dept: '部门管理',
  project: '项目管理',
  contract: '合同管理',
  purchase: '采购管理',
  inventory: '库存管理',
  finance: '财务管理',
  hr: '人事管理',
  data: '数据管理',
  legal: '法务管理'
};

// 角色管理页面
function RoleManage() {
  // 状态
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');

  // 权限数据
  const [allPermissions, setAllPermissions] = useState({});
  const [groupedPermissions, setGroupedPermissions] = useState({});

  // 弹窗状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [permissionVisible, setPermissionVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [currentRole, setCurrentRole] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [editForm] = Form.useForm();
  const [createForm] = Form.useForm();

  // 加载权限列表
  const loadPermissions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/roles/permissions`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setAllPermissions(result.data.permissions);
        setGroupedPermissions(result.data.grouped);
      }
    } catch (error) {
      console.error('加载权限列表失败:', error);
    }
  }, []);

  // 加载角色列表
  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      if (keyword) params.append('keyword', keyword);

      const response = await fetch(`${API_BASE}/roles?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setRoles(result.data.list || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '加载角色列表失败');
      }
    } catch (error) {
      console.error('加载角色列表失败:', error);
      message.error('加载角色列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  // 初始化加载
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // 搜索
  const handleSearch = () => {
    setPage(1);
    loadRoles();
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setPage(1);
  };

  // 分页改变
  const handleTableChange = (pagination) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  // 查看详情
  const handleViewDetail = async (role) => {
    try {
      const response = await fetch(`${API_BASE}/roles/${role.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setCurrentRole(result.data);
        setDetailVisible(true);
      } else {
        message.error(result.message || '获取角色详情失败');
      }
    } catch (error) {
      console.error('获取角色详情失败:', error);
      message.error('获取角色详情失败');
    }
  };

  // 打开编辑弹窗
  const handleEdit = (role) => {
    setCurrentRole(role);
    editForm.setFieldsValue({
      name: role.name,
      description: role.description
    });
    setEditVisible(true);
  };

  // 提交编辑
  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      const response = await fetch(`${API_BASE}/roles/${currentRole.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (result.success) {
        message.success('角色信息更新成功');
        setEditVisible(false);
        loadRoles();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新角色信息失败:', error);
      message.error('更新角色信息失败');
    }
  };

  // 打开权限设置弹窗
  const handlePermission = async (role) => {
    try {
      const response = await fetch(`${API_BASE}/roles/${role.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setCurrentRole(result.data);
        setSelectedPermissions(result.data.permissions || []);
        setPermissionVisible(true);
      } else {
        message.error(result.message || '获取角色信息失败');
      }
    } catch (error) {
      console.error('获取角色信息失败:', error);
      message.error('获取角色信息失败');
    }
  };

  // 权限变更
  const handlePermissionChange = (module, checkedList) => {
    // 移除该模块下所有权限
    const otherPermissions = selectedPermissions.filter(p => !p.startsWith(module + ':'));
    // 添加新选择的权限
    setSelectedPermissions([...otherPermissions, ...checkedList]);
  };

  // 全选/取消全选某个模块
  const handleModuleCheckAll = (module, checked) => {
    const modulePermissions = groupedPermissions[module].map(p => p.code);
    if (checked) {
      // 添加该模块所有权限
      setSelectedPermissions([...new Set([...selectedPermissions, ...modulePermissions])]);
    } else {
      // 移除该模块所有权限
      setSelectedPermissions(selectedPermissions.filter(p => !p.startsWith(module + ':')));
    }
  };

  // 提交权限更新
  const handlePermissionSubmit = async () => {
    try {
      const response = await fetch(`${API_BASE}/roles/${currentRole.id}/permissions`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ permissions: selectedPermissions })
      });
      const result = await response.json();
      if (result.success) {
        message.success('权限更新成功');
        setPermissionVisible(false);
        loadRoles();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新权限失败:', error);
      message.error('更新权限失败');
    }
  };

  // 打开创建角色弹窗
  const handleCreate = () => {
    createForm.resetFields();
    setCreateVisible(true);
  };

  // 提交创建
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const response = await fetch(`${API_BASE}/roles`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (result.success) {
        message.success('角色创建成功');
        setCreateVisible(false);
        loadRoles();
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建角色失败:', error);
      message.error('创建角色失败');
    }
  };

  // 删除角色
  const handleDelete = async (role) => {
    try {
      const response = await fetch(`${API_BASE}/roles/${role.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        message.success('角色删除成功');
        loadRoles();
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除角色失败:', error);
      message.error('删除角色失败');
    }
  };

  // 检查是否为核心角色
  const isCoreRole = (role) => role.id <= 10;

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60
    },
    {
      title: '角色编码',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code, record) => (
        <Space>
          <Tag color={isCoreRole(record) ? 'blue' : 'default'}>{code}</Tag>
          {isCoreRole(record) && <Badge status="processing" title="核心角色" />}
        </Space>
      )
    },
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 120
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '权限数量',
      dataIndex: 'permissionCount',
      key: 'permissionCount',
      width: 100,
      render: (count) => <Tag color={count > 0 ? 'green' : 'default'}>{count} 个</Tag>
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
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
          <Tooltip title="设置权限">
            <Button
              type="link"
              size="small"
              icon={<SafetyOutlined />}
              onClick={() => handlePermission(record)}
              disabled={record.code === 'GM'}
            >
              权限
            </Button>
          </Tooltip>
          <Popconfirm
            title="确定要删除该角色吗？"
            description={isCoreRole(record) ? '核心角色不允许删除' : '此操作不可恢复'}
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
            disabled={isCoreRole(record)}
          >
            <Tooltip title={isCoreRole(record) ? '核心角色不允许删除' : '删除角色'}>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={isCoreRole(record)}
              >
                删除
              </Button>
            </Tooltip>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="role-manage-container">
      <Card title="角色管理" className="role-manage-card">
        {/* 搜索和筛选区域 */}
        <div className="filter-section">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder="搜索角色名称/编码"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={24} md={24} lg={18}>
              <Space wrap>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                  搜索
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  重置
                </Button>
                <Divider type="vertical" />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                  新增角色
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* 角色列表表格 */}
        <Table
          columns={columns}
          dataSource={roles}
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
          scroll={{ x: 1100 }}
          size="middle"
        />
      </Card>

      {/* 角色详情弹窗 */}
      <Modal
        title="角色详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {currentRole && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="角色编码">{currentRole.code}</Descriptions.Item>
              <Descriptions.Item label="角色名称">{currentRole.name}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{currentRole.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentRole.created_at ? new Date(currentRole.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="权限数量">{currentRole.permissions?.length || 0} 个</Descriptions.Item>
            </Descriptions>
            
            <Divider orientation="left">权限列表</Divider>
            <div className="permission-detail-list">
              {Object.entries(groupedPermissions).map(([module, perms]) => {
                const rolePerms = perms.filter(p => currentRole.permissions?.includes(p.code));
                if (rolePerms.length === 0) return null;
                return (
                  <div key={module} className="permission-module">
                    <div className="module-title">{MODULE_NAMES[module] || module}</div>
                    <div className="module-perms">
                      {rolePerms.map(p => (
                        <Tag key={p.code} color="blue" style={{ marginBottom: 4 }}>
                          {p.name}
                        </Tag>
                      ))}
                    </div>
                  </div>
                );
              })}
              {currentRole.permissions?.length === 0 && (
                <Alert message="该角色暂无权限" type="warning" showIcon />
              )}
            </div>
          </>
        )}
      </Modal>

      {/* 编辑角色弹窗 */}
      <Modal
        title="编辑角色"
        open={editVisible}
        onOk={handleEditSubmit}
        onCancel={() => setEditVisible(false)}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form
          form={editForm}
          layout="vertical"
          name="editRoleForm"
        >
          <Form.Item label="角色编码">
            <Input value={currentRole?.code} disabled />
          </Form.Item>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入角色描述" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 权限设置弹窗 */}
      <Modal
        title={`设置权限 - ${currentRole?.name || ''}`}
        open={permissionVisible}
        onOk={handlePermissionSubmit}
        onCancel={() => setPermissionVisible(false)}
        okText="保存"
        cancelText="取消"
        width={700}
        bodyStyle={{ maxHeight: '60vh', overflow: 'auto' }}
      >
        {currentRole?.code === 'GM' ? (
          <Alert message="总经理角色拥有全部权限，不可修改" type="info" showIcon />
        ) : (
          <>
            <Alert 
              message="已选择权限" 
              description={<Tag color="blue">{selectedPermissions.length} 个</Tag>}
              type="info"
              style={{ marginBottom: 16 }}
            />
            <div className="permission-setting-list">
              {Object.entries(groupedPermissions).map(([module, perms]) => {
                const modulePermCodes = perms.map(p => p.code);
                const selectedInModule = selectedPermissions.filter(p => modulePermCodes.includes(p));
                const allSelected = selectedInModule.length === perms.length;
                const indeterminate = selectedInModule.length > 0 && selectedInModule.length < perms.length;

                return (
                  <div key={module} className="permission-module-card">
                    <div className="module-header">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={indeterminate}
                        onChange={(e) => handleModuleCheckAll(module, e.target.checked)}
                      >
                        <strong>{MODULE_NAMES[module] || module}</strong>
                      </Checkbox>
                      <span className="perm-count">
                        {selectedInModule.length}/{perms.length}
                      </span>
                    </div>
                    <Checkbox.Group
                      value={selectedInModule}
                      onChange={(checkedList) => handlePermissionChange(module, checkedList)}
                      className="permission-checkbox-group"
                    >
                      <Row>
                        {perms.map(p => (
                          <Col span={12} key={p.code}>
                            <Checkbox value={p.code}>{p.name}</Checkbox>
                          </Col>
                        ))}
                      </Row>
                    </Checkbox.Group>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Modal>

      {/* 创建角色弹窗 */}
      <Modal
        title="新增角色"
        open={createVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateVisible(false)}
        okText="创建"
        cancelText="取消"
        width={500}
      >
        <Form
          form={createForm}
          layout="vertical"
          name="createRoleForm"
        >
          <Form.Item
            name="code"
            label="角色编码"
            rules={[
              { required: true, message: '请输入角色编码' },
              { pattern: /^[A-Z_]+$/, message: '编码只能包含大写字母和下划线' }
            ]}
          >
            <Input placeholder="例如：NEW_ROLE" />
          </Form.Item>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入角色描述" rows={3} />
          </Form.Item>
          <Form.Item name="permissions" label="初始权限">
            <Alert message="角色创建后，可在权限管理中设置具体权限" type="info" showIcon />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default RoleManage;
