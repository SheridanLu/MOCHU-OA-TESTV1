import { useState, useEffect } from 'react';
import { Form, Input, Button, Tabs, Card, message, Space } from 'antd';
import { UserOutlined, LockOutlined, MobileOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

const API_BASE = import.meta.env.VITE_API_BASE || '';

function Login() {
  const [activeTab, setActiveTab] = useState('password');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [passwordForm] = Form.useForm();
  const [smsForm] = Form.useForm();
  const navigate = useNavigate();

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 密码登录
  const handlePasswordLogin = async (values) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login-password`, {
        account: values.account,
        password: values.password
      });

      if (response.data.success) {
        message.success('登录成功！');
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/');
      }
    } catch (error) {
      const data = error.response?.data;
      if (error.response?.status === 429) {
        message.error(data?.message || '账号已被锁定');
      } else {
        message.error(data?.message || '登录失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  };

  // 发送短信验证码
  const handleSendSms = async () => {
    try {
      await smsForm.validateFields(['phone']);
      const phone = smsForm.getFieldValue('phone');

      const response = await axios.post(`${API_BASE}/api/auth/send-sms`, { phone });

      if (response.data.success) {
        message.success('验证码已发送');
        setCountdown(60);
        
        // 开发模式下显示验证码
        if (response.data._devCode) {
          message.info(`验证码: ${response.data._devCode}`, 5);
        }
      }
    } catch (error) {
      const data = error.response?.data;
      if (error.response?.status === 429) {
        message.warning(data?.message || '请稍后再试');
        if (data?.waitTime) {
          setCountdown(data.waitTime);
        }
      } else {
        message.error(data?.message || '发送失败，请重试');
      }
    }
  };

  // 短信验证码登录
  const handleSmsLogin = async (values) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login-sms`, {
        phone: values.phone,
        code: values.code
      });

      if (response.data.success) {
        message.success('登录成功！');
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/');
      }
    } catch (error) {
      const data = error.response?.data;
      message.error(data?.message || '登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // Tab 标签页内容
  const tabItems = [
    {
      key: 'password',
      label: '密码登录',
      children: (
        <Form
          form={passwordForm}
          onFinish={handlePasswordLogin}
          layout="vertical"
          className="login-form"
        >
          <Form.Item
            name="account"
            rules={[
              { required: true, message: '请输入账号' },
              { min: 2, message: '账号至少2个字符' }
            ]}
          >
            <Input 
              prefix={<UserOutlined />}
              placeholder="用户名 / 手机号"
              size="large"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      )
    },
    {
      key: 'sms',
      label: '验证码登录',
      children: (
        <Form
          form={smsForm}
          onFinish={handleSmsLogin}
          layout="vertical"
          className="login-form"
        >
          <Form.Item
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
            ]}
          >
            <Input 
              prefix={<MobileOutlined />}
              placeholder="手机号"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="code"
            rules={[
              { required: true, message: '请输入验证码' },
              { len: 6, message: '验证码为6位数字' }
            ]}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input 
                prefix={<SafetyOutlined />}
                placeholder="验证码"
                size="large"
                maxLength={6}
                style={{ flex: 1 }}
              />
              <Button 
                size="large"
                disabled={countdown > 0}
                onClick={handleSendSms}
                style={{ width: 120 }}
              >
                {countdown > 0 ? `${countdown}s` : '获取验证码'}
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              size="large"
              loading={loading}
              block
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      )
    }
  ];

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-header">
          <h1>OA 办公系统</h1>
          <p>欢迎登录</p>
        </div>
        
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          centered
        />
      </Card>
    </div>
  );
}

export default Login;
