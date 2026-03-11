import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Button,
  Space,
  message,
  Row,
  Col,
  Divider,
  Tag,
  Table,
  Alert,
  Modal,
  Tooltip,
  Badge
} from 'antd';
import {
  SaveOutlined,
  RollbackOutlined,
  FileTextOutlined,
  NumberOutlined,
  WarningOutlined,
  PlusOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

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

/**
 * 支出合同创建页面
 * 编号规则：EC + YYMMDD + 2位序号（每日重置）
 * 例如：EC25030701
 * 
 * 功能：
 * - 支出合同必须关联实体项目
 * - 供应商列表下拉选择
 * - 价格预警信息查询
 * - 超量校验（超出项目采购清单需预算员审批）
 */
function ExpenseContractCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [previewNo, setPreviewNo] = useState('');
  const [projects, setProjects] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [priceWarnings, setPriceWarnings] = useState([]);
  const [overageWarnings, setOverageWarnings] = useState([]);
  const [contractItems, setContractItems] = useState([]);
  const [hasOverage, setHasOverage] = useState(false);
  const [addSupplierVisible, setAddSupplierVisible] = useState(false);
  const [supplierForm] = Form.useForm();

  // 加载项目列表（仅实体项目）
  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/projects?type=entity&pageSize=100`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('加载项目列表失败:', error);
    }
  }, []);

  // 加载供应商列表
  const loadSuppliers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/contracts/suppliers`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setSuppliers(result.data || []);
      }
    } catch (error) {
      console.error('加载供应商列表失败:', error);
    }
  }, []);

  // 加载预览合同编号
  const loadPreviewNo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/contracts/preview-no?type=expense`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setPreviewNo(result.contractNo);
      }
    } catch (error) {
      console.error('预览合同编号失败:', error);
    }
  }, []);

  // 加载价格预警列表
  const loadPriceWarnings = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/contracts/price-warnings?status=pending&pageSize=10`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setPriceWarnings(result.data || []);
      }
    } catch (error) {
      console.error('加载价格预警失败:', error);
    }
  }, []);

  // 初始化
  useEffect(() => {
    loadProjects();
    loadSuppliers();
    loadPreviewNo();
    loadPriceWarnings();
  }, [loadProjects, loadSuppliers, loadPreviewNo, loadPriceWarnings]);

  // 执行超量校验
  const performOverageCheck = async (items) => {
    if (!selectedProjectId || !items || items.length === 0) {
      setOverageWarnings([]);
      setHasOverage(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/contracts/expense/overage-check`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          project_id: selectedProjectId,
          items: items.filter(item => item.material_name && item.unit_price)
        })
      });

      const result = await response.json();
      if (result.success) {
        setOverageWarnings(result.data.warnings || []);
        setHasOverage(result.data.hasOverage);
      }
    } catch (error) {
      console.error('超量校验失败:', error);
    }
  };

  // 执行价格校验
  const performPriceCheck = async (items) => {
    if (!items || items.length === 0) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/contracts/expense/overcheck`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          project_id: selectedProjectId,
          items: items.filter(item => item.material_name && item.unit_price)
        })
      });

      const result = await response.json();
      if (result.success && result.data.hasWarnings) {
        // 在界面上显示价格预警
        const warningMessages = result.data.warnings.map(w => 
          `${w.material_name}: 单价 ¥${w.unit_price} 超出${w.reference_type} ¥${w.reference_price} (${w.overage_percent}%)`
        );
        message.warning(warningMessages.join('\n'), 5);
      }
    } catch (error) {
      console.error('价格校验失败:', error);
    }
  };

  // 处理项目选择变化
  const handleProjectChange = (projectId) => {
    setSelectedProjectId(projectId);
    // 重新执行超量校验
    if (contractItems.length > 0) {
      performOverageCheck(contractItems);
    }
  };

  // 处理合同明细变化
  const handleItemsChange = (items) => {
    setContractItems(items);
    performOverageCheck(items);
    performPriceCheck(items);
  };

  // 添加合同明细行
  const addItem = () => {
    const newItem = {
      key: Date.now(),
      material_name: '',
      specification: '',
      unit: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0
    };
    handleItemsChange([...contractItems, newItem]);
  };

  // 删除合同明细行
  const removeItem = (key) => {
    const newItems = contractItems.filter(item => item.key !== key);
    handleItemsChange(newItems);
  };

  // 更新合同明细
  const updateItem = (key, field, value) => {
    const newItems = contractItems.map(item => {
      if (item.key === key) {
        const updated = { ...item, [field]: value };
        // 计算小计
        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = (updated.quantity || 0) * (updated.unit_price || 0);
        }
        return updated;
      }
      return item;
    });
    handleItemsChange(newItems);
  };

  // 计算总金额
  const calculateTotalAmount = () => {
    return contractItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
  };

  // 创建新供应商
  const handleAddSupplier = async (values) => {
    try {
      const response = await fetch(`${API_BASE}/contracts/suppliers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(values)
      });

      const result = await response.json();
      if (result.success) {
        message.success('供应商创建成功');
        setAddSupplierVisible(false);
        supplierForm.resetFields();
        loadSuppliers();
        // 自动选择新创建的供应商
        form.setFieldsValue({ supplier_id: result.data.id });
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建供应商失败:', error);
      message.error('创建供应商失败');
    }
  };

  // 提交表单
  const handleSubmit = async (values) => {
    // 检查是否有关联项目
    if (!values.project_id) {
      message.error('支出合同必须关联实体项目');
      return;
    }

    // 检查是否有超量情况
    if (hasOverage) {
      Modal.confirm({
        title: '超量警告',
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p>当前合同存在超量采购情况，需要预算员审批。</p>
            <p>是否继续提交？</p>
          </div>
        ),
        onOk: () => submitContract(values)
      });
      return;
    }

    await submitContract(values);
  };

  // 提交合同
  const submitContract = async (values) => {
    setLoading(true);
    try {
      // 处理日期
      const [start_date, end_date] = values.dateRange || [null, null];
      
      // 获取供应商名称
      const selectedSupplier = suppliers.find(s => s.id === values.supplier_id);
      
      const submitData = {
        name: values.name,
        project_id: values.project_id,
        supplier_id: values.supplier_id,
        party_b: selectedSupplier?.name || values.party_b,
        amount: calculateTotalAmount() || values.amount || 0,
        sign_date: values.sign_date ? values.sign_date.format('YYYY-MM-DD') : null,
        start_date: start_date ? start_date.format('YYYY-MM-DD') : null,
        end_date: end_date ? end_date.format('YYYY-MM-DD') : null,
        description: values.description
      };

      const response = await fetch(`${API_BASE}/contracts/expense`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(submitData)
      });

      const result = await response.json();

      if (result.success) {
        message.success(`支出合同创建成功！合同编号：${result.data.contract_no}`);
        // 如果有超量，提示需要额外审批
        if (hasOverage) {
          message.info('由于存在超量采购，该合同需要预算员审批');
        }
        // 跳转到合同列表
        navigate('/contract/list');
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建合同失败:', error);
      message.error('创建合同失败');
    } finally {
      setLoading(false);
    }
  };

  // 取消
  const handleCancel = () => {
    navigate('/contract/list');
  };

  // 合同明细表格列定义
  const itemColumns = [
    {
      title: '物料名称',
      dataIndex: 'material_name',
      width: 200,
      render: (value, record) => (
        <Input
          value={value}
          onChange={(e) => updateItem(record.key, 'material_name', e.target.value)}
          placeholder="请输入物料名称"
        />
      )
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      width: 120,
      render: (value, record) => (
        <Input
          value={value}
          onChange={(e) => updateItem(record.key, 'specification', e.target.value)}
          placeholder="规格"
        />
      )
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      render: (value, record) => (
        <Input
          value={value}
          onChange={(e) => updateItem(record.key, 'unit', e.target.value)}
          placeholder="单位"
        />
      )
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      render: (value, record) => (
        <InputNumber
          value={value}
          onChange={(val) => updateItem(record.key, 'quantity', val || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '单价（元）',
      dataIndex: 'unit_price',
      width: 120,
      render: (value, record) => (
        <InputNumber
          value={value}
          onChange={(val) => updateItem(record.key, 'unit_price', val || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          formatter={val => `¥${val}`}
          parser={val => val.replace(/¥\s?|(,*)/g, '')}
        />
      )
    },
    {
      title: '小计（元）',
      dataIndex: 'total_price',
      width: 120,
      render: (value) => (
        <span style={{ fontWeight: 'bold' }}>
          ¥{(value || 0).toFixed(2)}
        </span>
      )
    },
    {
      title: '操作',
      width: 60,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.key)}
        />
      )
    }
  ];

  // 价格预警表格列定义
  const warningColumns = [
    {
      title: '物料名称',
      dataIndex: 'material_name',
      width: 120
    },
    {
      title: '当前单价',
      dataIndex: 'unit_price',
      width: 100,
      render: (val) => `¥${val}`
    },
    {
      title: '基准价',
      dataIndex: 'base_price',
      width: 100,
      render: (val) => `¥${val}`
    },
    {
      title: '超出比例',
      dataIndex: 'overage_percent',
      width: 100,
      render: (val) => (
        <Tag color={val >= 20 ? 'red' : val >= 10 ? 'orange' : 'blue'}>
          {val}%
        </Tag>
      )
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title={
          <Space>
            <FileTextOutlined />
            <span>创建支出合同</span>
            {hasOverage && (
              <Badge status="warning" text="存在超量采购" />
            )}
          </Space>
        }
        extra={
          <Space>
            <Button icon={<RollbackOutlined />} onClick={handleCancel}>
              返回列表
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            amount: 0,
            party_a: '本公司'
          }}
        >
          {/* 合同编号预览 */}
          <Row gutter={24}>
            <Col span={24}>
              <div style={{ 
                padding: '16px', 
                background: '#f5f5f5', 
                borderRadius: '4px', 
                marginBottom: '24px' 
              }}>
                <Space>
                  <NumberOutlined style={{ color: '#1890ff' }} />
                  <span>自动生成合同编号：</span>
                  <Tag color="blue" style={{ fontSize: '16px', padding: '4px 12px' }}>
                    {previewNo || '加载中...'}
                  </Tag>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    （编号格式：EC + YYMMDD + 2位序号，提交后自动生成）
                  </span>
                </Space>
              </div>
            </Col>
          </Row>

          {/* 价格预警提示 */}
          {priceWarnings.length > 0 && (
            <Alert
              message="价格预警提醒"
              description={
                <div>
                  <p>当前存在 {priceWarnings.length} 条价格预警待处理：</p>
                  <Table
                    columns={warningColumns}
                    dataSource={priceWarnings}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                </div>
              }
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              style={{ marginBottom: '24px' }}
            />
          )}

          {/* 超量警告 */}
          {overageWarnings.length > 0 && (
            <Alert
              message="超量采购警告"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {overageWarnings.map((w, idx) => (
                    <li key={idx}>{w.message}</li>
                  ))}
                </ul>
              }
              type="error"
              showIcon
              style={{ marginBottom: '24px' }}
            />
          )}

          <Divider orientation="left">基本信息</Divider>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="name"
                label="合同名称"
                rules={[{ required: true, message: '请输入合同名称' }]}
              >
                <Input placeholder="请输入合同名称" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="project_id"
                label="关联项目"
                rules={[{ required: true, message: '支出合同必须关联实体项目' }]}
              >
                <Select
                  placeholder="请选择关联的实体项目"
                  showSearch
                  optionFilterProp="children"
                  onChange={handleProjectChange}
                >
                  {projects.map(project => (
                    <Option key={project.id} value={project.id}>
                      {project.project_no} - {project.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="合同总金额（元）">
                <InputNumber
                  value={calculateTotalAmount()}
                  style={{ width: '100%' }}
                  precision={2}
                  formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/¥\s?|(,*)/g, '')}
                  disabled
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">供应商信息</Divider>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="supplier_id"
                label="供应商"
                rules={[{ required: true, message: '请选择供应商' }]}
              >
                <Select
                  placeholder="请选择供应商"
                  showSearch
                  optionFilterProp="children"
                  dropdownRender={menu => (
                    <div>
                      {menu}
                      <Divider style={{ margin: '4px 0' }} />
                      <div
                        style={{ padding: '8px', cursor: 'pointer' }}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setAddSupplierVisible(true)}
                      >
                        <PlusOutlined /> 新增供应商
                      </div>
                    </div>
                  )}
                >
                  {suppliers.map(supplier => (
                    <Option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                      {supplier.contact_person && ` (${supplier.contact_person})`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="party_b"
                label="乙方（供应商/分包商）"
                extra="选择供应商后自动填充"
              >
                <Input placeholder="自动填充或手动输入" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="party_a"
                label="甲方（本公司）"
              >
                <Input placeholder="甲方默认为本公司" maxLength={100} disabled />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">日期信息</Divider>

          <Row gutter={24}>
            <Col xs={24} sm={8} md={8}>
              <Form.Item
                name="sign_date"
                label="签订日期"
              >
                <DatePicker 
                  style={{ width: '100%' }}
                  placeholder="请选择签订日期"
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={16} md={16}>
              <Form.Item
                name="dateRange"
                label="合同有效期"
              >
                <RangePicker 
                  style={{ width: '100%' }}
                  placeholder={['开始日期', '结束日期']}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">
            <Space>
              <span>合同明细</span>
              <Tooltip title="添加采购明细后系统将自动进行超量校验">
                <WarningOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          </Divider>

          <Row gutter={24}>
            <Col span={24}>
              <div style={{ marginBottom: '16px' }}>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={addItem}
                  style={{ width: '100%' }}
                >
                  添加采购明细
                </Button>
              </div>
              
              <Table
                columns={itemColumns}
                dataSource={contractItems}
                rowKey="key"
                pagination={false}
                size="small"
                scroll={{ x: 800 }}
                locale={{ emptyText: '暂无采购明细，点击上方按钮添加' }}
              />

              <div style={{ 
                marginTop: '16px', 
                padding: '12px', 
                background: '#fafafa', 
                borderRadius: '4px',
                textAlign: 'right'
              }}>
                <Space size="large">
                  <span>明细数量：{contractItems.length} 项</span>
                  <span style={{ fontSize: '16px', fontWeight: 'bold' }}>
                    合计金额：¥{calculateTotalAmount().toFixed(2)}
                  </span>
                </Space>
              </div>
            </Col>
          </Row>

          <Divider orientation="left">其他信息</Divider>

          <Row gutter={24}>
            <Col span={24}>
              <Form.Item
                name="description"
                label="备注说明"
              >
                <TextArea 
                  rows={4}
                  placeholder="请输入备注说明（可选）"
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Row>
            <Col span={24} style={{ textAlign: 'center' }}>
              <Space size="large">
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={loading}
                  size="large"
                  style={{ background: '#1890ff', borderColor: '#1890ff' }}
                >
                  创建支出合同
                  {hasOverage && '（需超量审批）'}
                </Button>
                <Button
                  onClick={handleCancel}
                  size="large"
                >
                  取消
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      {/* 新增供应商弹窗 */}
      <Modal
        title="新增供应商"
        open={addSupplierVisible}
        onCancel={() => {
          setAddSupplierVisible(false);
          supplierForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={supplierForm}
          layout="vertical"
          onFinish={handleAddSupplier}
        >
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[{ required: true, message: '请输入供应商名称' }]}
          >
            <Input placeholder="请输入供应商名称" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="contact_person"
                label="联系人"
              >
                <Input placeholder="联系人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="联系电话"
              >
                <Input placeholder="联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="email"
            label="邮箱"
          >
            <Input placeholder="邮箱地址" />
          </Form.Item>
          <Form.Item
            name="address"
            label="地址"
          >
            <Input placeholder="详细地址" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="bank_name"
                label="开户银行"
              >
                <Input placeholder="开户银行" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="bank_account"
                label="银行账号"
              >
                <Input placeholder="银行账号" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setAddSupplierVisible(false);
                supplierForm.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default ExpenseContractCreate;
