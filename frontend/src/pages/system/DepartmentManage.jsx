import { useState, useEffect } from 'react';
import {
  Typography,
  Tree,
  Button,
  Space,
  Card,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
  Empty,
  Spin,
  Descriptions,
  Divider,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  TeamOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import api from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

function DepartmentManage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add' | 'edit'
  const [submitting, setSubmitting] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  // 获取部门列表
  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/departments');
      if (response.data.success) {
        const { list, tree } = response.data.data;
        setDepartments(list);
        setTreeData(tree);
        // 默认展开所有节点
        const allKeys = list.map(d => d.id);
        setExpandedKeys(allKeys);
      }
    } catch (error) {
      message.error('获取部门列表失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  // 选择部门节点
  const handleSelect = (selectedKeys, info) => {
    if (selectedKeys.length > 0) {
      const deptId = selectedKeys[0];
      const dept = departments.find(d => d.id === deptId);
      setSelectedNode(dept);
    }
  };

  // 打开新增弹窗
  const handleAdd = () => {
    setModalType('add');
    form.resetFields();
    // 如果选中了节点，则默认父部门为当前选中的节点
    if (selectedNode) {
      form.setFieldsValue({ parent_id: selectedNode.id });
    }
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const handleEdit = () => {
    if (!selectedNode) {
      message.warning('请先选择要编辑的部门');
      return;
    }
    setModalType('edit');
    form.setFieldsValue({
      name: selectedNode.name,
      parent_id: selectedNode.parent_id,
      sort_order: selectedNode.sort_order || 0,
      remark: selectedNode.remark || '',
    });
    setModalVisible(true);
  };

  // 删除部门
  const handleDelete = async () => {
    if (!selectedNode) {
      message.warning('请先选择要删除的部门');
      return;
    }

    try {
      const response = await api.delete(`/departments/${selectedNode.id}`);
      if (response.data.success) {
        message.success('部门删除成功');
        setSelectedNode(null);
        fetchDepartments();
      }
    } catch (error) {
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else {
        message.error('删除部门失败');
      }
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (modalType === 'add') {
        const response = await api.post('/departments', values);
        if (response.data.success) {
          message.success('部门创建成功');
          setModalVisible(false);
          fetchDepartments();
        }
      } else {
        const response = await api.put(`/departments/${selectedNode.id}`, values);
        if (response.data.success) {
          message.success('部门更新成功');
          setModalVisible(false);
          fetchDepartments();
          // 更新选中节点信息
          if (response.data.data) {
            setSelectedNode(response.data.data);
          }
        }
      }
    } catch (error) {
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      } else if (error.errorFields) {
        // 表单验证错误
        return;
      } else {
        message.error(modalType === 'add' ? '创建部门失败' : '更新部门失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 构建父部门下拉选项（排除当前部门及其子部门）
  const buildParentOptions = () => {
    // 获取当前节点及其所有子节点的ID
    const getDescendantIds = (deptId) => {
      const ids = [deptId];
      departments.filter(d => d.parent_id === deptId).forEach(child => {
        ids.push(...getDescendantIds(child.id));
      });
      return ids;
    };

    const excludeIds = modalType === 'edit' && selectedNode ? getDescendantIds(selectedNode.id) : [];

    // 构建树形选项
    const buildOptions = (parentId = null, level = 0) => {
      return departments
        .filter(d => d.parent_id === parentId && !excludeIds.includes(d.id))
        .map(d => ({
          value: d.id,
          label: `${'　'.repeat(level)}${d.name}`,
          children: buildOptions(d.id, level + 1),
        }))
        .filter(d => d.label);
    };

    // 添加顶级选项
    return [
      { value: null, label: '顶级部门' },
      ...buildOptions(),
    ];
  };

  // 自定义树节点图标
  const switcherIcon = ({ expanded }) => {
    return expanded ? <FolderOpenOutlined /> : <FolderOutlined />;
  };

  return (
    <div style={{ padding: '24px' }}>
      <Title level={4} style={{ marginBottom: '24px' }}>
        <TeamOutlined style={{ marginRight: '8px' }} />
        部门管理
      </Title>

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* 左侧部门树 */}
        <Card
          title="部门架构"
          style={{ width: '400px', minHeight: '500px' }}
          extra={
            <Button icon={<ReloadOutlined />} onClick={fetchDepartments} loading={loading}>
              刷新
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                新增
              </Button>
              <Button icon={<EditOutlined />} onClick={handleEdit} disabled={!selectedNode}>
                编辑
              </Button>
              <Popconfirm
                title="确认删除"
                description="确定要删除该部门吗？"
                onConfirm={handleDelete}
                okText="确定"
                cancelText="取消"
                disabled={!selectedNode}
              >
                <Button 
                  danger 
                  icon={<DeleteOutlined />} 
                  disabled={!selectedNode}
                >
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </Space>

          <Divider style={{ margin: '12px 0' }} />

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin />
            </div>
          ) : treeData.length > 0 ? (
            <Tree
              showLine
              showIcon
              switcherIcon={switcherIcon}
              treeData={treeData}
              selectedKeys={selectedNode ? [selectedNode.id] : []}
              expandedKeys={expandedKeys}
              onExpand={setExpandedKeys}
              onSelect={handleSelect}
              style={{ marginTop: '8px' }}
            />
          ) : (
            <Empty description="暂无部门数据" />
          )}
        </Card>

        {/* 右侧部门详情 */}
        <Card
          title="部门详情"
          style={{ flex: 1, minHeight: '500px' }}
        >
          {selectedNode ? (
            <Descriptions column={2} bordered>
              <Descriptions.Item label="部门名称" span={2}>
                <Text strong>{selectedNode.name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="上级部门">
                {selectedNode.parent_id 
                  ? departments.find(d => d.id === selectedNode.parent_id)?.name || '-'
                  : <Tag>顶级部门</Tag>
                }
              </Descriptions.Item>
              <Descriptions.Item label="排序号">
                {selectedNode.sort_order || 0}
              </Descriptions.Item>
              <Descriptions.Item label="部门负责人">
                {selectedNode.manager_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {selectedNode.created_at 
                  ? new Date(selectedNode.created_at).toLocaleString('zh-CN')
                  : '-'
                }
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {selectedNode.remark || '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Empty description="请从左侧选择部门查看详情" />
          )}
        </Card>
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={modalType === 'add' ? '新增部门' : '编辑部门'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        destroyOnClose
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ sort_order: 0, parent_id: null }}
        >
          <Form.Item
            name="name"
            label="部门名称"
            rules={[
              { required: true, message: '请输入部门名称' },
              { max: 50, message: '部门名称不能超过50个字符' },
            ]}
          >
            <Input placeholder="请输入部门名称" maxLength={50} />
          </Form.Item>

          <Form.Item
            name="parent_id"
            label="上级部门"
          >
            <Select
              placeholder="请选择上级部门"
              options={buildParentOptions()}
              allowClear
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          <Form.Item
            name="sort_order"
            label="排序号"
            extra="数字越小越靠前"
          >
            <InputNumber
              min={0}
              max={9999}
              style={{ width: '100%' }}
              placeholder="请输入排序号"
            />
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <TextArea
              rows={3}
              placeholder="请输入备注"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default DepartmentManage;
