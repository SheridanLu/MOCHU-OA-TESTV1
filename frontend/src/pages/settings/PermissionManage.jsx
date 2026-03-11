/**
 * 权限管理页面
 * Task 18: 实现RBAC - 权限分配
 * 
 * 功能：
 * 1. 用户角色分配 - 选择用户 → 分配角色（一个用户可以有多个角色）
 * 2. 角色权限分配 - 选择角色 → 配置权限（权限树形展示）
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tabs,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Tree,
  Form,
  message,
  Popconfirm,
  Tooltip,
  Row,
  Col,
  Descriptions,
  Divider,
  Empty,
  Spin
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  UserOutlined,
  TeamOutlined,
  SafetyOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined
} from '@ant-design/icons';
import api from '../../services/api';

const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

// API 基础地址
const API_BASE = window.location.origin + '/api';

// 权限管理页面
function PermissionManage() {
  // ========== 状态定义 ==========
  
  // 通用状态
  const [loading, setLoading] = useState(false);
  
  // 用户角色分配相关
  const [users, setUsers] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);
  const [userKeyword, setUserKeyword] = useState('');
  const [roles, setRoles] = useState([]);
  
  // 角色权限分配相关
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [permissionDefs, setPermissionDefs] = useState({});
  const [permissionTreeData, setPermissionTreeData] = useState([]);
  const [checkedKeys, setCheckedKeys] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  
  // 弹窗状态
  const [userRoleModalVisible, setUserRoleModalVisible] = useState(false);
  const [rolePermModalVisible, setRolePermModalVisible] = useState(false);
  const [roleFormModalVisible, setRoleFormModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [roleForm] = Form.useForm();
  const [roleFormType, setRoleFormType] = useState('add');

  // ========== 数据加载 ==========

  // 加载角色列表
  const loadRoles = useCallback(async () => {
    try {
      const response = await api.get('/permissions/roles');
      if (response.data.success) {
        setRoles(response.data.data || []);
      }
    } catch (error) {
      console.error('加载角色列表失败:', error);
      message.error('加载角色列表失败');
    }
  }, []);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: userPage.toString(),
        pageSize: userPageSize.toString()
      });

      if (userKeyword) {
        params.append('keyword', userKeyword);
      }

      const response = await api.get(`/permissions/users?${params.toString()}`);
      if (response.data.success) {
        setUsers(response.data.data.list || []);
        setUsersTotal(response.data.data.total || 0);
      } else {
        message.error(response.data.message || '加载用户列表失败');
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [userPage, userPageSize, userKeyword]);

  // 加载权限定义
  const loadPermissionDefs = useCallback(async () => {
    try {
      const response = await api.get('/permissions');
      if (response.data.success) {
        const defs = response.data.data;
        setPermissionDefs(defs);
        
        // 构建权限树数据
        const treeData = Object.entries(defs).map(([moduleKey, module]) => ({
          key: moduleKey,
          title: module.name,
          children: module.permissions.map(perm => ({
            key: perm.code,
            title: `${perm.name} (${perm.code})`
          }))
        }));
        
        setPermissionTreeData(treeData);
        
        // 默认展开所有模块
        setExpandedKeys(Object.keys(defs));
      }
    } catch (error) {
      console.error('加载权限定义失败:', error);
      message.error('加载权限定义失败');
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    loadRoles();
    loadPermissionDefs();
  }, [loadRoles, loadPermissionDefs]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ========== 用户角色分配 ==========

  // 打开用户角色分配弹窗
  const handleOpenUserRoleModal = (user) => {
    setCurrentUser(user);
    // 设置用户当前的角色ID
    const currentRoleIds = user.roles ? user.roles.map(r => r.id) : [];
    setSelectedRoleIds(currentRoleIds);
    setUserRoleModalVisible(true);
  };

  // 提交用户角色分配
  const handleUserRoleSubmit = async () => {
    if (!currentUser) return;
    
    setSaving(true);
    try {
      const response = await api.put(`/permissions/user/${currentUser.id}`, {
        roleIds: selectedRoleIds
      });
      
      if (response.data.success) {
        message.success('用户角色分配成功');
        setUserRoleModalVisible(false);
        loadUsers(); // 刷新用户列表
      } else {
        message.error(response.data.message || '分配失败');
      }
    } catch (error) {
      console.error('分配用户角色失败:', error);
      message.error('分配用户角色失败');
    } finally {
      setSaving(false);
    }
  };

  // ========== 角色权限分配 ==========

  // 选择角色查看权限
  const handleSelectRole = async (role) => {
    setSelectedRole(role);
    try {
      const response = await api.get(`/permissions/role/${role.id}`);
      if (response.data.success) {
        const permCodes = response.data.data.permissions || [];
        setCheckedKeys(permCodes);
      }
    } catch (error) {
      console.error('获取角色权限失败:', error);
      message.error('获取角色权限失败');
    }
  };

  // 打开角色权限配置弹窗
  const handleOpenRolePermModal = () => {
    if (!selectedRole) {
      message.warning('请先选择一个角色');
      return;
    }
    setRolePermModalVisible(true);
  };

  // 提交角色权限配置
  const handleRolePermSubmit = async () => {
    if (!selectedRole) return;
    
    setSaving(true);
    try {
      const response = await api.put(`/permissions/role/${selectedRole.id}`, {
        permissions: checkedKeys
      });
      
      if (response.data.success) {
        message.success('角色权限配置成功');
        setRolePermModalVisible(false);
        loadRoles(); // 刷新角色列表
      } else {
        message.error(response.data.message || '配置失败');
      }
    } catch (error) {
      console.error('配置角色权限失败:', error);
      message.error('配置角色权限失败');
    } finally {
      setSaving(false);
    }
  };

  // 树节点选中事件
  const handleTreeCheck = (keys) => {
    setCheckedKeys(keys);
  };

  // 全选
  const handleSelectAll = () => {
    const allCodes = [];
    Object.values(permissionDefs).forEach(module => {
      module.permissions.forEach(perm => {
        allCodes.push(perm.code);
      });
    });
    setCheckedKeys(allCodes);
  };

  // 反选
  const handleInvertSelection = () => {
    const allCodes = [];
    Object.values(permissionDefs).forEach(module => {
      module.permissions.forEach(perm => {
        allCodes.push(perm.code);
      });
    });
    const newChecked = allCodes.filter(code => !checkedKeys.includes(code));
    setCheckedKeys(newChecked);
  };

  // 清空
  const handleClearSelection = () => {
    setCheckedKeys([]);
  };

  // ========== 角色管理 ==========

  // 打开新增角色弹窗
  const handleAddRole = () => {
    setRoleFormType('add');
    roleForm.resetFields();
    setRoleFormModalVisible(true);
  };

  // 打开编辑角色弹窗
  const handleEditRole = () => {
    if (!selectedRole) {
      message.warning('请先选择一个角色');
      return;
    }
    setRoleFormType('edit');
    roleForm.setFieldsValue({
      name: selectedRole.name,
      code: selectedRole.code,
      description: selectedRole.description
    });
    setRoleFormModalVisible(true);
  };

  // 提交角色表单
  const handleRoleFormSubmit = async () => {
    try {
      const values = await roleForm.validateFields();
      setSaving(true);

      if (roleFormType === 'add') {
        const response = await api.post('/permissions/roles', values);
        if (response.data.success) {
          message.success('角色创建成功');
          setRoleFormModalVisible(false);
          loadRoles();
        } else {
          message.error(response.data.message || '创建失败');
        }
      } else {
        const response = await api.put(`/permissions/roles/${selectedRole.id}`, values);
        if (response.data.success) {
          message.success('角色更新成功');
          setRoleFormModalVisible(false);
          loadRoles();
          // 更新选中角色信息
          setSelectedRole({ ...selectedRole, ...values });
        } else {
          message.error(response.data.message || '更新失败');
        }
      }
    } catch (error) {
      if (!error.errorFields) {
        console.error('角色操作失败:', error);
        message.error('操作失败');
      }
    } finally {
      setSaving(false);
    }
  };

  // 删除角色
  const handleDeleteRole = async () => {
    if (!selectedRole) return;
    
    try {
      const response = await api.delete(`/permissions/roles/${selectedRole.id}`);
      if (response.data.success) {
        message.success('角色删除成功');
        setSelectedRole(null);
        setCheckedKeys([]);
        loadRoles();
      } else {
        message.error(response.data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除角色失败:', error);
      message.error('删除角色失败');
    }
  };

  // ========== 表格列定义 ==========

  // 用户表格列
  const userColumns = [
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
      width: 100,
      render: (text) => text || '-'
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
      title: '当前角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 200,
      render: (roles) => (
        roles && roles.length > 0 ? (
          <Space size={[0, 4]} wrap>
            {roles.map(role => (
              <Tag color="blue" key={role.id}>{role.name}</Tag>
            ))}
          </Space>
        ) : (
          <span style={{ color: '#999' }}>未分配角色</span>
        )
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => handleOpenUserRoleModal(record)}
        >
          分配角色
        </Button>
      )
    }
  ];

  // 角色表格列
  const roleColumns = [
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      width: 120
    },
    {
      title: '角色代码',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code) => <Tag>{code}</Tag>
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '用户数',
      dataIndex: 'user_count',
      key: 'user_count',
      width: 80,
      align: 'center'
    },
    {
      title: '权限数',
      dataIndex: 'permission_count',
      key: 'permission_count',
      width: 80,
      align: 'center'
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => handleSelectRole(record)}
        >
          查看权限
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Tabs defaultActiveKey="userRole" size="large">
        {/* Tab 1: 用户角色分配 */}
        <TabPane
          tab={
            <span>
              <UserOutlined />
              用户角色分配
            </span>
          }
          key="userRole"
        >
          <Card>
            {/* 搜索区域 */}
            <div style={{ marginBottom: '16px' }}>
              <Space wrap>
                <Input
                  placeholder="搜索用户名/姓名"
                  prefix={<SearchOutlined />}
                  value={userKeyword}
                  onChange={(e) => setUserKeyword(e.target.value)}
                  onPressEnter={() => {
                    setUserPage(1);
                    loadUsers();
                  }}
                  allowClear
                  style={{ width: 200 }}
                />
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />}
                  onClick={() => {
                    setUserPage(1);
                    loadUsers();
                  }}
                >
                  搜索
                </Button>
                <Button 
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setUserKeyword('');
                    setUserPage(1);
                  }}
                >
                  重置
                </Button>
              </Space>
            </div>

            {/* 用户列表 */}
            <Table
              columns={userColumns}
              dataSource={users}
              rowKey="id"
              loading={loading}
              pagination={{
                current: userPage,
                pageSize: userPageSize,
                total: usersTotal,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条记录`,
                pageSizeOptions: ['10', '20', '50'],
                onChange: (page, pageSize) => {
                  setUserPage(page);
                  setUserPageSize(pageSize);
                }
              }}
              scroll={{ x: 900 }}
              size="middle"
            />
          </Card>
        </TabPane>

        {/* Tab 2: 角色权限分配 */}
        <TabPane
          tab={
            <span>
              <SafetyOutlined />
              角色权限分配
            </span>
          }
          key="rolePerm"
        >
          <div style={{ display: 'flex', gap: '24px' }}>
            {/* 左侧角色列表 */}
            <Card
              title="角色列表"
              style={{ width: 450, minHeight: 500 }}
              extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRole}>
                  新增角色
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
                <Space>
                  <Button 
                    icon={<EditOutlined />} 
                    onClick={handleEditRole}
                    disabled={!selectedRole}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="确认删除"
                    description="确定要删除该角色吗？"
                    onConfirm={handleDeleteRole}
                    okText="确定"
                    cancelText="取消"
                    disabled={!selectedRole}
                  >
                    <Button 
                      danger 
                      icon={<DeleteOutlined />}
                      disabled={!selectedRole}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              </Space>

              <Table
                columns={roleColumns}
                dataSource={roles}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ y: 350 }}
                onRow={(record) => ({
                  onClick: () => handleSelectRole(record),
                  style: {
                    cursor: 'pointer',
                    backgroundColor: selectedRole?.id === record.id ? '#e6f7ff' : undefined
                  }
                })}
              />
            </Card>

            {/* 右侧权限配置 */}
            <Card
              title={selectedRole ? `权限配置 - ${selectedRole.name}` : '权限配置'}
              style={{ flex: 1, minHeight: 500 }}
              extra={
                selectedRole && (
                  <Button 
                    type="primary" 
                    icon={<CheckCircleOutlined />}
                    onClick={handleOpenRolePermModal}
                  >
                    配置权限
                  </Button>
                )
              }
            >
              {selectedRole ? (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Space>
                      <Button size="small" onClick={handleSelectAll}>
                        全选
                      </Button>
                      <Button size="small" onClick={handleInvertSelection}>
                        反选
                      </Button>
                      <Button size="small" onClick={handleClearSelection}>
                        清空
                      </Button>
                    </Space>
                    <span style={{ marginLeft: 16, color: '#666' }}>
                      已选择 {checkedKeys.length} 项权限
                    </span>
                  </div>
                  <Divider style={{ margin: '12px 0' }} />
                  
                  {permissionTreeData.length > 0 ? (
                    <Tree
                      checkable
                      checkedKeys={checkedKeys}
                      expandedKeys={expandedKeys}
                      onExpand={setExpandedKeys}
                      onCheck={handleTreeCheck}
                      treeData={permissionTreeData}
                      style={{ marginTop: 8 }}
                    />
                  ) : (
                    <Empty description="暂无权限定义" />
                  )}
                </>
              ) : (
                <Empty description="请从左侧选择角色查看权限" />
              )}
            </Card>
          </div>
        </TabPane>
      </Tabs>

      {/* 用户角色分配弹窗 */}
      <Modal
        title={`分配角色 - ${currentUser?.real_name || currentUser?.username}`}
        open={userRoleModalVisible}
        onCancel={() => setUserRoleModalVisible(false)}
        onOk={handleUserRoleSubmit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <div style={{ marginBottom: 16 }}>
          <span style={{ marginRight: 8 }}>选择角色：</span>
          <span style={{ color: '#999' }}>(可多选)</span>
        </div>
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          placeholder="请选择角色"
          value={selectedRoleIds}
          onChange={setSelectedRoleIds}
          optionLabelProp="label"
        >
          {roles.map(role => (
            <Option key={role.id} value={role.id} label={role.name}>
              <div>
                <span style={{ marginRight: 8 }}>{role.name}</span>
                <Tag>{role.code}</Tag>
              </div>
            </Option>
          ))}
        </Select>
        
        {currentUser?.roles && currentUser.roles.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, color: '#666' }}>当前角色：</div>
            <Space size={[0, 8]} wrap>
              {currentUser.roles.map(role => (
                <Tag color="blue" key={role.id}>{role.name}</Tag>
              ))}
            </Space>
          </div>
        )}
      </Modal>

      {/* 角色权限配置弹窗 */}
      <Modal
        title={`配置权限 - ${selectedRole?.name}`}
        open={rolePermModalVisible}
        onCancel={() => setRolePermModalVisible(false)}
        onOk={handleRolePermSubmit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button size="small" onClick={handleSelectAll}>全选</Button>
            <Button size="small" onClick={handleInvertSelection}>反选</Button>
            <Button size="small" onClick={handleClearSelection}>清空</Button>
          </Space>
          <span style={{ marginLeft: 16, color: '#666' }}>
            已选择 {checkedKeys.length} 项权限
          </span>
        </div>
        
        {permissionTreeData.length > 0 ? (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <Tree
              checkable
              checkedKeys={checkedKeys}
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              onCheck={handleTreeCheck}
              treeData={permissionTreeData}
            />
          </div>
        ) : (
          <Empty description="暂无权限定义" />
        )}
      </Modal>

      {/* 新增/编辑角色弹窗 */}
      <Modal
        title={roleFormType === 'add' ? '新增角色' : '编辑角色'}
        open={roleFormModalVisible}
        onCancel={() => setRoleFormModalVisible(false)}
        onOk={handleRoleFormSubmit}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form
          form={roleForm}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[
              { required: true, message: '请输入角色名称' },
              { max: 50, message: '角色名称不能超过50个字符' }
            ]}
          >
            <Input placeholder="请输入角色名称" maxLength={50} />
          </Form.Item>
          
          <Form.Item
            name="code"
            label="角色代码"
            rules={[
              { required: true, message: '请输入角色代码' },
              { pattern: /^[a-z_]+$/, message: '角色代码只能包含小写字母和下划线' },
              { max: 50, message: '角色代码不能超过50个字符' }
            ]}
            extra={roleFormType === 'add' ? '角色代码创建后不可修改' : '角色代码不可修改'}
          >
            <Input 
              placeholder="请输入角色代码" 
              maxLength={50} 
              disabled={roleFormType === 'edit'}
            />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea 
              rows={3} 
              placeholder="请输入角色描述" 
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PermissionManage;
