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
  ProjectOutlined,
  NumberOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

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

/**
 * 项目立项页面 - 创建实体项目
 */
function ProjectCreate() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [previewNo, setPreviewNo] = useState('');
  const [managers, setManagers] = useState([]);

  // 加载负责人列表（用户列表）
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
      const response = await fetch(`${API_BASE}/projects/preview-no`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setPreviewNo(result.data.project_no);
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
    console.log('开始提交项目:', values);
    setLoading(true);
    try {
      // 处理日期
      const [start_date, end_date] = values.dateRange || [null, null];
      
      const submitData = {
        name: values.name,
        customer: values.customer,
        contract_amount: values.contract_amount || 0,
        manager_id: values.manager_id,
        start_date: start_date ? start_date.format('YYYY-MM-DD') : null,
        end_date: end_date ? end_date.format('YYYY-MM-DD') : null
      };

      console.log('提交数据:', submitData);
      
      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(submitData)
      });

      const result = await response.json();
      console.log('响应结果:', result);

      if (result.success) {
        message.success(`项目创建成功！项目编号：${result.data.project_no}`);
        // 跳转到项目列表
        setTimeout(() => {
          navigate('/project/list');
        }, 500);
      } else {
        message.error(result.message || '创建失败');
      }
    } catch (error) {
      console.error('创建项目失败:', error);
      message.error('创建项目失败: ' + error.message);
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
            <ProjectOutlined />
            <span>项目立项申请</span>
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
            contract_amount: 0
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
                  <NumberOutlined style={{ color: '#1890ff' }} />
                  <span>自动生成项目编号：</span>
                  <Tag color="blue" style={{ fontSize: '16px', padding: '4px 12px' }}>
                    {previewNo || '加载中...'}
                  </Tag>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    （编号格式：P + YYMMDD + 3位序号，提交后自动生成）
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
                name="project_type"
                label="项目类型"
                initialValue="智能化项目"
              >
                <Select placeholder="请选择项目类型">
                  <Select.Option value="智能化项目">智能化项目</Select.Option>
                  <Select.Option value="消防项目">消防项目</Select.Option>
                  <Select.Option value="EPC项目">EPC项目</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                name="contract_amount"
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
            <Col xs={24} sm={16} md={16}>
              <Form.Item
                name="dateRange"
                label="项目周期"
              >
                <RangePicker 
                  style={{ width: '100%' }}
                  placeholder={['开始日期', '结束日期']}
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
                >
                  提交立项申请
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

export default ProjectCreate;
