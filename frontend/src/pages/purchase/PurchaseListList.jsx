import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Form,
  Popconfirm,
  DatePicker
} from 'antd';
import {
  ShoppingOutlined,
  SearchOutlined,
  PlusOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined,
  AuditOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { RangePicker } = DatePicker;

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

// 清单状态映射
const STATUS_MAP = {
  draft: { text: '草稿', color: 'default' },
  pending: { text: '待审核', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  completed: { text: '已完成', color: 'blue' }
};

/**
 * 采购清单列表页
 * Task 32: 采购清单 - 项目关联
 */
function PurchaseListList() {
  const navigate = useNavigate();
  
  // 状态
  const [loading, setLoading] = useState(false);
  const [lists, setLists] = useState([]);
  const [projects, setProjects] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  
  // 筛选条件
  const [filters, setFilters] = useState({
    project_id: '',
    status: '',
    keyword: ''
  });
  
  // 新增/编辑弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [form] = Form.useForm();
  
  // 加载项目列表
  const loadProjects = async () => {
    try {
      // 获取所有实体项目（不限制状态，或只获取非中止的项目）
      const response = await fetch(`${API_BASE}/projects?type=entity&page=1&pageSize=100`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        // 过滤掉已中止和已转换的虚拟项目
        const activeProjects = (result.data || []).filter(p => 
          p.status !== 'aborted' && p.status !== 'converted'
        );
        setProjects(activeProjects);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    }
  };
  
  useEffect(() => {
    loadProjects();
  }, []);
  
  // 加载采购清单列表
  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.project_id) params.append('project_id', filters.project_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.keyword) params.append('keyword', filters.keyword);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);
      
      const response = await fetch(`${API_BASE}/purchase-lists?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setLists(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载采购清单失败:', error);
      message.error('加载采购清单失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);
  
  useEffect(() => {
    loadLists();
  }, [loadLists]);
  
  // 查看详情
  const handleView = (record) => {
    navigate(`/purchase/list/${record.id}`);
  };
  
  // 新增清单
  const handleAdd = () => {
    setEditingList(null);
    form.resetFields();
    form.setFieldsValue({
      status: 'pending'
    });
    setModalVisible(true);
  };
  
  // 编辑清单
  const handleEdit = (record) => {
    setEditingList(record);
    form.setFieldsValue({
      project_id: record.project_id,
      name: record.name,
      status: record.status
    });
    setModalVisible(true);
  };
  
  // 提交审批
  const handleSubmitApproval = async (record) => {
    try {
      const response = await fetch(`${API_BASE}/purchase-lists/${record.id}/submit`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('审批申请已提交');
        loadLists();
      } else {
        message.error(result.message || '提交失败');
      }
    } catch (error) {
      console.error('提交审批失败:', error);
      message.error('提交审批失败');
    }
  };

  // 删除清单
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/purchase-lists/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('删除成功');
        loadLists();
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除采购清单失败:', error);
      message.error('删除采购清单失败');
    }
  };
  
  // 保存清单
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      const url = editingList
        ? `${API_BASE}/purchase-lists/${editingList.id}`
        : `${API_BASE}/purchase-lists`;
      
      const response = await fetch(url, {
        method: editingList ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(editingList ? '更新成功' : '创建成功');
        setModalVisible(false);
        loadLists();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      if (error.errorFields) {
        return;
      }
      console.error('保存采购清单失败:', error);
      message.error('保存采购清单失败');
    }
  };
  
  // 表格列定义
  const columns = [
    {
      title: '清单名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      ellipsis: true,
      render: (text, record) => (
        <Space>
          <FileTextOutlined />
          <a onClick={() => handleView(record)}>{text}</a>
        </Space>
      )
    },
    {
      title: '关联项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 180,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '项目编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 120
    },
    {
      title: '物资项数',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 100,
      align: 'center',
      render: (count) => count || 0
    },
    {
      title: '清单金额',
      dataIndex: 'calculated_total',
      key: 'calculated_total',
      width: 130,
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 500, color: '#1890ff' }}>
          ¥{parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusInfo = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time) => new Date(time).toLocaleString('zh-CN')
    },
    {
      title: '审批状态',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: 100,
      render: (status) => {
        const statusMap = {
          'pending_approval': { text: '审批中', color: 'orange' },
          'approved': { text: '已通过', color: 'green' },
          'rejected': { text: '已驳回', color: 'red' }
        };
        const info = statusMap[status] || { text: '草稿', color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 250,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            详情
          </Button>
          {/* 提交审批按钮 - 草稿状态可见 */}
          {!record.approval_status && (
            <Button
              type="link"
              size="small"
              icon={<AuditOutlined />}
              onClick={() => handleSubmitApproval(record)}
            >
              提交审批
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
            disabled={record.approval_status === 'pending_approval' || record.approval_status === 'approved'}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此采购清单吗？相关的物资明细也将被删除。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.approval_status === 'pending_approval' || record.approval_status === 'approved'}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.approval_status === 'pending_approval' || record.approval_status === 'approved'}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];
  
  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <ShoppingOutlined />
            <span>采购清单</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增采购清单
          </Button>
        }
      >
        {/* 筛选条件 */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索清单名称"
            prefix={<SearchOutlined />}
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            style={{ width: 200 }}
            onPressEnter={loadLists}
          />
          <Select
            placeholder="选择项目"
            value={filters.project_id}
            onChange={(value) => setFilters({ ...filters, project_id: value })}
            style={{ width: 200 }}
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {projects.map(p => (
              <Option key={p.id} value={p.id}>{p.name}</Option>
            ))}
          </Select>
          <Select
            placeholder="状态"
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
            style={{ width: 120 }}
            allowClear
          >
            <Option value="all">全部</Option>
            {Object.entries(STATUS_MAP).map(([key, value]) => (
              <Option key={key} value={key}>{value.text}</Option>
            ))}
          </Select>
          <Button type="primary" onClick={loadLists}>
            查询
          </Button>
          <Button onClick={() => setFilters({ project_id: '', status: '', keyword: '' })}>
            重置
          </Button>
        </Space>
        
        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={lists}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
      
      {/* 新增/编辑弹窗 */}
      <Modal
        title={
          <Space>
            {editingList ? <EditOutlined /> : <PlusOutlined />}
            {editingList ? '编辑采购清单' : '新增采购清单'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="project_id"
            label="关联项目"
            rules={[{ required: true, message: '请选择关联项目' }]}
          >
            <Select
              placeholder="请选择项目"
              showSearch
              optionFilterProp="children"
              disabled={!!editingList}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>
                  {p.project_no} - {p.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            name="name"
            label="清单名称"
            rules={[{ required: true, message: '请输入清单名称' }]}
          >
            <Input placeholder="请输入采购清单名称" />
          </Form.Item>
          
          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select placeholder="请选择状态">
              {Object.entries(STATUS_MAP).map(([key, value]) => (
                <Option key={key} value={key}>{value.text}</Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PurchaseListList;
