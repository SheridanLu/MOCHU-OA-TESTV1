import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  InputNumber,
  Modal,
  Form,
  message,
  Popconfirm,
  Descriptions,
  Tooltip,
  Divider,
  Statistic,
  Row,
  Col,
  Empty
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  CloseOutlined,
  ShoppingOutlined,
  FileTextOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined
} from '@ant-design/icons';

const { TextArea } = Input;

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
 * 采购清单详情页
 * Task 33: 采购清单 - 物资明细
 */
function PurchaseListDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // 状态
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    total_items: 0,
    total_quantity: 0,
    total_amount: 0
  });
  
  // 排序
  const [sortField, setSortField] = useState('sort_order');
  const [sortOrder, setSortOrder] = useState('ASC');
  
  // 弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form] = Form.useForm();
  
  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('sort_field', sortField);
      params.append('sort_order', sortOrder);
      
      const response = await fetch(`${API_BASE}/purchase-lists/${id}/items?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setList(result.data.list);
        setItems(result.data.items);
        setSummary(result.data.summary);
      } else {
        message.error(result.message || '加载失败');
      }
    } catch (error) {
      console.error('加载物资明细失败:', error);
      message.error('加载物资明细失败');
    } finally {
      setLoading(false);
    }
  }, [id, sortField, sortOrder]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // 新增物资
  const handleAdd = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      quantity: 1,
      unit_price: 0
    });
    setModalVisible(true);
  };
  
  // 编辑物资
  const handleEdit = (record) => {
    setEditingItem(record);
    form.setFieldsValue({
      material_name: record.material_name,
      specification: record.specification,
      unit: record.unit,
      quantity: record.quantity,
      unit_price: record.unit_price,
      remarks: record.remarks
    });
    setModalVisible(true);
  };
  
  // 删除物资
  const handleDelete = async (itemId) => {
    try {
      const response = await fetch(`${API_BASE}/purchase-lists/${id}/items/${itemId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('删除成功');
        loadData();
      } else {
        message.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除物资失败:', error);
      message.error('删除物资失败');
    }
  };
  
  // 保存物资
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      const url = editingItem
        ? `${API_BASE}/purchase-lists/${id}/items/${editingItem.id}`
        : `${API_BASE}/purchase-lists/${id}/items`;
      
      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(editingItem ? '更新成功' : '添加成功');
        setModalVisible(false);
        loadData();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      if (error.errorFields) {
        return; // 表单校验错误
      }
      console.error('保存物资失败:', error);
      message.error('保存物资失败');
    }
  };
  
  // 切换排序
  const handleSortChange = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortField(field);
      setSortOrder('ASC');
    }
  };
  
  // 计算金额
  const calculateAmount = () => {
    const quantity = form.getFieldValue('quantity') || 0;
    const unitPrice = form.getFieldValue('unit_price') || 0;
    return (quantity * unitPrice).toFixed(2);
  };
  
  // 表格列定义
  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      align: 'center',
      render: (_, __, index) => index + 1
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (text) => (
        <Tag color={text === 'equipment' ? 'blue' : 'green'}>
          {text === 'equipment' ? '设备' : '材料'}
        </Tag>
      )
    },
    {
      title: (
        <Space onClick={() => handleSortChange('material_name')} style={{ cursor: 'pointer' }}>
          名称
          {sortField === 'material_name' && (
            sortOrder === 'ASC' ? <SortAscendingOutlined /> : <SortDescendingOutlined />
          )}
        </Space>
      ),
      dataIndex: 'material_name',
      key: 'material_name',
      width: 160,
      ellipsis: true
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      key: 'specification',
      width: 120,
      ellipsis: true,
      render: (text, record) => {
        if (record.category === 'equipment') {
          return <span style={{color: '#999'}}>-</span>;
        }
        return text || '-';
      }
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      align: 'center',
      render: (text) => text || '-'
    },
    {
      title: (
        <Space onClick={() => handleSortChange('quantity')} style={{ cursor: 'pointer' }}>
          数量
          {sortField === 'quantity' && (
            sortOrder === 'ASC' ? <SortAscendingOutlined /> : <SortDescendingOutlined />
          )}
        </Space>
      ),
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right',
      render: (value) => parseFloat(value).toLocaleString()
    },
    {
      title: (
        <Space onClick={() => handleSortChange('unit_price')} style={{ cursor: 'pointer' }}>
          单价
          {sortField === 'unit_price' && (
            sortOrder === 'ASC' ? <SortAscendingOutlined /> : <SortDescendingOutlined />
          )}
        </Space>
      ),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      align: 'right',
      render: (value) => `¥${parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    },
    {
      title: (
        <Space onClick={() => handleSortChange('total_price')} style={{ cursor: 'pointer' }}>
          金额
          {sortField === 'total_price' && (
            sortOrder === 'ASC' ? <SortAscendingOutlined /> : <SortDescendingOutlined />
          )}
        </Space>
      ),
      dataIndex: 'total_price',
      key: 'total_price',
      width: 130,
      align: 'right',
      render: (value) => (
        <span style={{ fontWeight: 500, color: '#1890ff' }}>
          ¥{parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          {text || '-'}
        </Tooltip>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此物资吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
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
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        style={{ marginBottom: 16 }}
      >
        返回
      </Button>
      
      {/* 基本信息卡片 */}
      <Card
        loading={loading && !list}
        style={{ marginBottom: 16 }}
      >
        {list && (
          <>
            <Descriptions title={
              <Space>
                <FileTextOutlined />
                <span>采购清单详情</span>
              </Space>
            } bordered column={4} size="small">
              <Descriptions.Item label="清单名称" span={2}>{list.name}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[list.status]?.color}>{STATUS_MAP[list.status]?.text}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="物资数量">{summary.total_items} 项</Descriptions.Item>
              <Descriptions.Item label="关联项目">{list.project_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="项目编号">{list.project_no || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(list.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {new Date(list.updated_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>
            
            {/* 统计信息 */}
            <Divider />
            <Row gutter={24}>
              <Col span={8}>
                <Statistic
                  title="物资项数"
                  value={summary.total_items}
                  suffix="项"
                  prefix={<ShoppingOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="总数量"
                  value={summary.total_quantity}
                  precision={2}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="合计金额"
                  value={summary.total_amount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#1890ff', fontWeight: 600 }}
                />
              </Col>
            </Row>
          </>
        )}
      </Card>
      
      {/* 物资明细表格 */}
      <Card
        title={
          <Space>
            <ShoppingOutlined />
            <span>物资明细</span>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAdd}
          >
            新增物资
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: (
              <Empty
                description="暂无物资"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                  添加第一个物资
                </Button>
              </Empty>
            )
          }}
          summary={() => {
            if (items.length === 0) return null;
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4} align="center">
                    <strong>合计</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    <strong>{parseFloat(summary.total_quantity).toLocaleString()}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} align="right">
                    <strong style={{ color: '#1890ff', fontSize: 16 }}>
                      ¥{parseFloat(summary.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={3} />
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      </Card>
      
      {/* 新增/编辑物资弹窗 */}
      <Modal
        title={
          <Space>
            {editingItem ? <EditOutlined /> : <PlusOutlined />}
            {editingItem ? '编辑物资' : '新增物资'}
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={600}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            <CloseOutlined /> 取消
          </Button>,
          <Button key="save" type="primary" onClick={handleSave}>
            <SaveOutlined /> 保存
          </Button>
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={(changedValues, allValues) => {
            // 当数量或单价变化时，强制更新显示金额
            if (changedValues.quantity !== undefined || changedValues.unit_price !== undefined) {
              form.setFieldsValue({}); // 触发重新渲染
            }
          }}
        >
          <Form.Item
            name="category"
            label="分类"
            initialValue="material"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="请选择分类">
              <Option value="equipment">设备类</Option>
              <Option value="material">材料类</Option>
            </Select>
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="material_name"
                label="名称"
                rules={[{ required: true, message: '请输入名称' }]}
              >
                <Input placeholder="请输入名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="specification"
                label="规格型号"
                rules={[
                  { required: form.getFieldValue('category') === 'material', message: '材料类必须填写规格型号' }
                ]}
              >
                <Input placeholder="请输入规格型号" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="unit"
                label="单位"
                rules={[{ required: true, message: '请输入单位' }]}
              >
                <Select placeholder="请选择单位" allowClear>
                  <Option value="套">套</Option>
                  <Option value="台">台</Option>
                  <Option value="个">个</Option>
                  <Option value="支">支</Option>
                  <Option value="件">件</Option>
                  <Option value="米">米</Option>
                  <Option value="kg">kg</Option>
                  <Option value="m²">m²</Option>
                  <Option value="m³">m³</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="quantity"
                label="数量"
                rules={[
                  { required: true, message: '请输入数量' },
                  { type: 'number', min: 0.01, message: '数量必须大于0' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  placeholder="请输入数量"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="unit_price"
                label="单价"
                rules={[
                  { required: true, message: '请输入单价' },
                  { type: 'number', min: 0, message: '单价不能为负' }
                ]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  prefix="¥"
                  placeholder="请输入单价"
                />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item label="金额">
            <Input
              value={`¥${calculateAmount()}`}
              disabled
              style={{ fontWeight: 600, color: '#1890ff' }}
            />
          </Form.Item>
          
          <Form.Item
            name="remarks"
            label="备注"
          >
            <TextArea
              placeholder="请输入备注信息"
              rows={3}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default PurchaseListDetail;
