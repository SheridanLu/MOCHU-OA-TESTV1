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
  Tag
} from 'antd';
import {
  SaveOutlined,
  RollbackOutlined,
  FileTextOutlined,
  NumberOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;
const { RangePicker } = DatePicker;
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

/**
 * 收入合同创建页面
 * 编号规则：IC + YYMMDD + 2位序号（每日重置）
 * 例如：IC25030701
 */
function ContractCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [previewNo, setPreviewNo] = useState('');
  const [projects, setProjects] = useState([]);

  // 加载项目列表（用于关联）
  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/projects?pageSize=100`, {
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

  // 加载预览合同编号
  const loadPreviewNo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/contracts/preview-no?type=income`, {
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

  // 初始化
  useEffect(() => {
    loadProjects();
    loadPreviewNo();
  }, [loadProjects, loadPreviewNo]);

  // 提交表单
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      // 处理日期
      const [start_date, end_date] = values.dateRange || [null, null];
      
      const submitData = {
        name: values.name,
        project_id: values.project_id,
        party_a: values.party_a,       // 甲方（客户）
        party_b: values.party_b,       // 乙方（本公司）
        amount: values.amount || 0,
        sign_date: values.sign_date ? values.sign_date.format('YYYY-MM-DD') : null,
        start_date: start_date ? start_date.format('YYYY-MM-DD') : null,
        end_date: end_date ? end_date.format('YYYY-MM-DD') : null,
        description: values.description
      };

      const response = await fetch(`${API_BASE}/contracts/income`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(submitData)
      });

      const result = await response.json();

      if (result.success) {
        message.success(`收入合同创建成功！合同编号：${result.data.contract_no}`);
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

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title={
          <Space>
            <FileTextOutlined />
            <span>创建收入合同</span>
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
            party_b: '本公司'
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
                  <NumberOutlined style={{ color: '#52c41a' }} />
                  <span>自动生成合同编号：</span>
                  <Tag color="green" style={{ fontSize: '16px', padding: '4px 12px' }}>
                    {previewNo || '加载中...'}
                  </Tag>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    （编号格式：IC + YYMMDD + 2位序号，提交后自动生成）
                  </span>
                </Space>
              </div>
            </Col>
          </Row>

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
              >
                <Select
                  placeholder="请选择关联项目（可选）"
                  allowClear
                  showSearch
                  optionFilterProp="children"
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
              <Form.Item
                name="amount"
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
            </Col>
          </Row>

          <Divider orientation="left">合同双方</Divider>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="party_a"
                label="甲方（客户）"
                rules={[{ required: true, message: '请输入甲方名称' }]}
              >
                <Input placeholder="请输入甲方（客户）名称" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="party_b"
                label="乙方（本公司）"
              >
                <Input placeholder="乙方默认为本公司" maxLength={100} />
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
                  style={{ background: '#52c41a', borderColor: '#52c41a' }}
                >
                  创建收入合同
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
    </div>
  );
}

export default ContractCreate;
