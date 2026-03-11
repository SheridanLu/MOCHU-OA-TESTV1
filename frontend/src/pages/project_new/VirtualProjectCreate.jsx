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
  CloudOutlined,
  NumberOutlined,
  InfoCircleOutlined
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

// 跟踪阶段选项
const trackingStages = [
  { value: 'initial', label: '初步接触' },
  { value: 'negotiation', label: '商务谈判' },
  { value: 'bidding', label: '投标中' },
  { value: 'pending_result', label: '待定标' }
];

/**
 * 虚拟项目创建页面
 * 虚拟项目用于跟踪尚未中标的项目
 */
function VirtualProjectCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [previewNo, setPreviewNo] = useState('');
  const [managers, setManagers] = useState([]);

  // 加载负责人列表
  const loadManagers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/users?status=active`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setManagers(result.data || []);
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
    }
  }, []);

  // 加载预览项目编号
  const loadPreviewNo = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/projects/preview-no?type=virtual`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setPreviewNo(result.projectNo || result.data?.project_no);
      }
    } catch (error) {
      console.error('预览项目编号失败:', error);
    }
  }, []);

  // 初始化
  useEffect(() => {
    loadManagers();
    loadPreviewNo();
  }, [loadManagers, loadPreviewNo]);

  // 提交表单
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const [start_date, end_date] = values.dateRange || [null, null];
      
      const submitData = {
        name: values.name,
        customer: values.customer,
        estimated_amount: values.estimated_amount || 0,
        manager_id: values.manager_id,
        start_date: start_date ? start_date.format('YYYY-MM-DD') : null,
        end_date: end_date ? end_date.format('YYYY-MM-DD') : null,
        tracking_stage: values.tracking_stage
      };

      const response = await fetch(`${API_BASE}/projects/virtual`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(submitData)
      });

      const result = await response.json();

      if (result.success) {
        message.success(`虚拟项目创建成功！项目编号：${result.data.project_no}`);
        navigate('/project/list');
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建虚拟项目失败:', error);
      message.error('创建虚拟项目失败');
    } finally {
      setLoading(false);
    }
  };

  // 取消
  const handleCancel = () => {
    navigate('/project/list');
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card 
        title={
          <Space>
            <CloudOutlined style={{ color: '#722ed1' }} />
            <span>创建虚拟项目</span>
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
        {/* 说明信息 */}
        <div style={{ 
          padding: '16px', 
          background: '#f9f0ff', 
          borderRadius: '4px', 
          marginBottom: '24px',
          border: '1px solid #d3adf7'
        }}>
          <Space>
            <InfoCircleOutlined style={{ color: '#722ed1' }} />
            <span style={{ color: '#722ed1' }}>
              <strong>虚拟项目</strong>用于跟踪尚未中标的项目。取得中标通知书后，可将虚拟项目转换为实体项目。
            </span>
          </Space>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            estimated_amount: 0,
            tracking_stage: 'initial'
          }}
        >
          {/* 项目编号预览 */}
          <Row gutter={24}>
            <Col span={24}>
              <div style={{ 
                padding: '16px', 
                background: '#f5f5f5', 
                borderRadius: '4px', 
                marginBottom: '24px' 
              }}>
                <Space>
                  <NumberOutlined style={{ color: '#722ed1' }} />
                  <span>自动生成虚拟项目编号：</span>
                  <Tag color="purple" style={{ fontSize: '16px', padding: '4px 12px' }}>
                    {previewNo || '加载中...'}
                  </Tag>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    （编号格式：V + YYMM + 3位序号，每月重置）
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
                label="项目名称"
                rules={[{ required: true, message: '请输入项目名称' }]}
              >
                <Input placeholder="请输入项目名称" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="customer"
                label="客户名称"
              >
                <Input placeholder="请输入客户名称" maxLength={100} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="estimated_amount"
                label="预估金额（元）"
                tooltip="预估合同金额，中标后可修改"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="请输入预估金额"
                  min={0}
                  precision={2}
                  formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={value => value.replace(/¥\s?|(,*)/g, '')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="manager_id"
                label="项目负责人"
              >
                <Select
                  placeholder="请选择负责人"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {managers.map(user => (
                    <Option key={user.id} value={user.id}>
                      {user.real_name || user.username}
                      {user.department_name ? ` (${user.department_name})` : ''}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="tracking_stage"
                label="跟踪阶段"
              >
                <Select placeholder="请选择跟踪阶段">
                  {trackingStages.map(stage => (
                    <Option key={stage.value} value={stage.value}>
                      {stage.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={16} md={8}>
              <Form.Item
                name="dateRange"
                label="预计项目周期"
              >
                <RangePicker 
                  style={{ width: '100%' }}
                  placeholder={['预计开始日期', '预计结束日期']}
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
                  style={{ background: '#722ed1', borderColor: '#722ed1' }}
                >
                  创建虚拟项目
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

export default VirtualProjectCreate;
