import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
  Card,
  Tag,
  Tooltip,
  Row,
  Col,
  Statistic,
  Badge,
  DatePicker,
  Divider,
  Typography
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  ExportOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

const { Option } = Select;
const { RangePicker } = DatePicker;

// 预警级别颜色映射
const WARNING_COLORS = {
  normal: 'green',
  warning: 'orange',
  danger: 'red'
};

const WARNING_TEXT = {
  normal: '正常',
  warning: '警告',
  danger: '严重'
};

// 材料类别选项
const CATEGORIES = [
  { value: '钢材', label: '钢材' },
  { value: '水泥', label: '水泥' },
  { value: '砂石', label: '砂石' },
  { value: '木材', label: '木材' },
  { value: '管材', label: '管材' },
  { value: '电缆', label: '电缆' },
  { value: '涂料', label: '涂料' },
  { value: '五金', label: '五金' },
  { value: '其他', label: '其他' }
];

// 单位选项
const UNITS = [
  { value: '吨', label: '吨' },
  { value: '公斤', label: '公斤' },
  { value: '米', label: '米' },
  { value: '根', label: '根' },
  { value: '块', label: '块' },
  { value: '套', label: '套' },
  { value: '个', label: '个' },
  { value: '件', label: '件' },
  { value: '平方', label: '平方' },
  { value: '立方', label: '立方' }
];

function PriceLibrary() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [form] = Form.useForm();
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0
  });
  const [searchParams, setSearchParams] = useState({
    keyword: '',
    status: 'active',
    category: 'all'
  });
  const [priceCheckVisible, setPriceCheckVisible] = useState(false);
  const [priceCheckForm] = Form.useForm();
  const [priceCheckResult, setPriceCheckResult] = useState(null);

  // 获取材料列表
  const fetchMaterials = useCallback(async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const params = {
        page,
        pageSize,
        ...searchParams
      };
      
      const response = await axios.get('/api/materials/base', { params });
      
      if (response.data.success) {
        setMaterials(response.data.data || []);
        setPagination(prev => ({
          ...prev,
          current: page,
          pageSize,
          total: response.data.pagination?.total || 0
        }));
      }
    } catch (error) {
      console.error('获取材料列表失败:', error);
      message.error('获取材料列表失败');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // 打开新增/编辑弹窗
  const handleOpenModal = (material = null) => {
    setEditingMaterial(material);
    if (material) {
      form.setFieldsValue(material);
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 关闭弹窗
  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingMaterial(null);
    form.resetFields();
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingMaterial) {
        // 更新
        const response = await axios.put(`/api/materials/${editingMaterial.id}`, values);
        if (response.data.success) {
          message.success('更新成功');
          handleCloseModal();
          fetchMaterials(pagination.current, pagination.pageSize);
        } else {
          message.error(response.data.message || '更新失败');
        }
      } else {
        // 新增
        const response = await axios.post('/api/materials', values);
        if (response.data.success) {
          message.success('新增成功');
          handleCloseModal();
          fetchMaterials(pagination.current, pagination.pageSize);
        } else {
          message.error(response.data.message || '新增失败');
        }
      }
    } catch (error) {
      console.error('提交失败:', error);
      message.error('操作失败');
    }
  };

  // 删除材料
  const handleDelete = async (id) => {
    try {
      const response = await axios.delete(`/api/materials/${id}`);
      if (response.data.success) {
        message.success('删除成功');
        fetchMaterials(pagination.current, pagination.pageSize);
      } else {
        message.error(response.data.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  // 检查价格预警
  const handleCheckPrice = async () => {
    try {
      const values = await priceCheckForm.validateFields();
      
      const response = await axios.post('/api/materials/price-warning', {
        items: [{
          material_name: values.material_name,
          specification: values.specification,
          unit_price: values.unit_price,
          quantity: values.quantity || 1
        }]
      });
      
      if (response.data.success) {
        setPriceCheckResult(response.data.data);
      }
    } catch (error) {
      console.error('价格检查失败:', error);
      message.error('价格检查失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1
    },
    {
      title: '材料名称',
      dataIndex: 'material_name',
      key: 'material_name',
      width: 180,
      ellipsis: true
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      key: 'specification',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      align: 'center'
    },
    {
      title: '基准价(元)',
      dataIndex: 'base_price',
      key: 'base_price',
      width: 120,
      align: 'right',
      render: (value) => (
        <Text strong style={{ color: '#1890ff' }}>
          ¥{Number(value).toFixed(2)}
        </Text>
      )
    },
    {
      title: '生效日期',
      dataIndex: 'effective_date',
      key: 'effective_date',
      width: 120,
      render: (text) => text || '-'
    },
    {
      title: '失效日期',
      dataIndex: 'expiry_date',
      key: 'expiry_date',
      width: 120,
      render: (text) => text || '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (status) => {
        const statusConfig = {
          active: { color: 'green', text: '有效' },
          expired: { color: 'default', text: '已过期' },
          deleted: { color: 'red', text: '已删除' }
        };
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除此材料吗？"
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

  // 预警级别显示组件
  const WarningLevelDisplay = ({ level, percent }) => {
    const color = WARNING_COLORS[level] || 'green';
    const text = WARNING_TEXT[level] || '正常';
    
    if (level === 'normal') {
      return <Tag color="green">正常</Tag>;
    }
    
    return (
      <Tooltip title={`超出基准价 ${percent}%`}>
        <Tag color={color} icon={level === 'danger' ? <WarningOutlined /> : null}>
          {text} (+{percent}%)
        </Tag>
      </Tooltip>
    );
  };

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 页面标题 */}
      <Card style={{ marginBottom: '16px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>材料基准价信息库</Title>
            <Text type="secondary">管理材料基准价，设置价格预警阈值</Text>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ExclamationCircleOutlined />}
                onClick={() => setPriceCheckVisible(true)}
              >
                价格预警检查
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleOpenModal()}
              >
                新增材料
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: '16px' }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="材料总数"
              value={pagination.total}
              suffix="种"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="生效中"
              value={materials.filter(m => m.status === 'active').length}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="预警阈值"
              value="10%"
              prefix={<WarningOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="严重阈值"
              value="20%"
              prefix={<WarningOutlined style={{ color: '#f5222d' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* 搜索栏 */}
      <Card style={{ marginBottom: '16px' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space>
              <Input
                placeholder="搜索材料名称/规格"
                prefix={<SearchOutlined />}
                value={searchParams.keyword}
                onChange={(e) => setSearchParams(prev => ({ ...prev, keyword: e.target.value }))}
                onPressEnter={() => fetchMaterials(1, pagination.pageSize)}
                style={{ width: 200 }}
              />
              <Select
                placeholder="状态筛选"
                value={searchParams.status}
                onChange={(value) => setSearchParams(prev => ({ ...prev, status: value }))}
                style={{ width: 120 }}
              >
                <Option value="all">全部状态</Option>
                <Option value="active">有效</Option>
                <Option value="expired">已过期</Option>
              </Select>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => fetchMaterials(1, pagination.pageSize)}
              >
                搜索
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setSearchParams({ keyword: '', status: 'active', category: 'all' });
                  fetchMaterials(1, pagination.pageSize);
                }}
              >
                重置
              </Button>
            </Space>
          </Col>
          <Col>
            <Button icon={<ExportOutlined />}>导出</Button>
          </Col>
        </Row>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={materials}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              fetchMaterials(page, pageSize);
            }
          }}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </Card>

      {/* 新增/编辑材料弹窗 */}
      <Modal
        title={editingMaterial ? '编辑材料' : '新增材料'}
        open={modalVisible}
        onCancel={handleCloseModal}
        onOk={handleSubmit}
        width={600}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          preserve={false}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="material_name"
                label="材料名称"
                rules={[{ required: true, message: '请输入材料名称' }]}
              >
                <Input placeholder="请输入材料名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="specification"
                label="规格型号"
              >
                <Input placeholder="请输入规格型号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="unit"
                label="单位"
              >
                <Select placeholder="请选择单位" allowClear>
                  {UNITS.map(u => (
                    <Option key={u.value} value={u.value}>{u.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="base_price"
                label="基准价(元)"
                rules={[
                  { required: true, message: '请输入基准价' },
                  { type: 'number', min: 0.01, message: '基准价必须大于0' }
                ]}
              >
                <InputNumber
                  placeholder="请输入基准价"
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  prefix="¥"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="effective_date"
                label="生效日期"
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="expiry_date"
                label="失效日期"
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="remarks"
            label="备注"
          >
            <Input.TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 价格预警检查弹窗 */}
      <Modal
        title="价格预警检查"
        open={priceCheckVisible}
        onCancel={() => {
          setPriceCheckVisible(false);
          setPriceCheckResult(null);
          priceCheckForm.resetFields();
        }}
        onOk={handleCheckPrice}
        okText="检查价格"
        width={600}
        destroyOnClose
      >
        <Form
          form={priceCheckForm}
          layout="vertical"
          preserve={false}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="material_name"
                label="材料名称"
                rules={[{ required: true, message: '请输入材料名称' }]}
              >
                <Input placeholder="请输入材料名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="specification"
                label="规格型号"
              >
                <Input placeholder="请输入规格型号（可选）" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="unit_price"
                label="实际单价(元)"
                rules={[{ required: true, message: '请输入实际单价' }]}
              >
                <InputNumber
                  placeholder="请输入实际单价"
                  style={{ width: '100%' }}
                  precision={2}
                  min={0}
                  prefix="¥"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="quantity"
                label="数量"
                initialValue={1}
              >
                <InputNumber
                  placeholder="请输入数量"
                  style={{ width: '100%' }}
                  min={1}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {/* 检查结果展示 */}
        {priceCheckResult && (
          <div style={{ marginTop: '16px' }}>
            <Divider>检查结果</Divider>
            {priceCheckResult.hasWarning ? (
              <div>
                {priceCheckResult.warnings.map((warning, index) => (
                  <Card
                    key={index}
                    size="small"
                    style={{
                      marginBottom: '8px',
                      borderLeft: `4px solid ${WARNING_COLORS[warning.warning_level]}`
                    }}
                  >
                    <Row gutter={16}>
                      <Col span={12}>
                        <Text strong>{warning.material_name}</Text>
                        {warning.specification && (
                          <Text type="secondary"> ({warning.specification})</Text>
                        )}
                      </Col>
                      <Col span={12} style={{ textAlign: 'right' }}>
                        <WarningLevelDisplay
                          level={warning.warning_level}
                          percent={warning.overage_percent}
                        />
                      </Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: '8px' }}>
                      <Col span={8}>
                        <Text type="secondary">基准价: </Text>
                        <Text>¥{warning.base_price}</Text>
                      </Col>
                      <Col span={8}>
                        <Text type="secondary">实际价: </Text>
                        <Text strong style={{ color: '#f5222d' }}>
                          ¥{warning.unit_price}
                        </Text>
                      </Col>
                      <Col span={8}>
                        <Text type="secondary">超出金额: </Text>
                        <Text type="danger">¥{warning.overage_amount}</Text>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Text type="success" style={{ fontSize: '16px' }}>
                  ✓ 价格检查通过，未发现异常
                </Text>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 底部说明 */}
      <Card style={{ marginTop: '16px' }}>
        <Title level={5}>价格预警规则说明</Title>
        <ul style={{ color: '#666', margin: '8px 0', paddingLeft: '20px' }}>
          <li>
            <Tag color="orange">警告</Tag>
            实际单价超出基准价 <Text strong>10%</Text> 但未超过 <Text strong>20%</Text>
          </li>
          <li>
            <Tag color="red">严重</Tag>
            实际单价超出基准价 <Text strong>20%</Text> 及以上
          </li>
          <li>超出基准价的采购需要预算员审批后方可继续</li>
        </ul>
      </Card>
    </div>
  );
}

export default PriceLibrary;
