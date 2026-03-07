import { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Typography, message, Space, Tabs } from 'antd';
import { LockOutlined, MobileOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

const { Title, Text } = Typography;

/**
 * 登录页面 - 第二阶段：密码/验证码认证
 * 支持两种登录方式：
 * 1. 密码登录
 * 2. 短信验证码登录（带60秒倒计时限制）
 */
const LoginVerify = () => {
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0); // 倒计时秒数
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();

  // 从上一页获取用户信息
  const { user, account } = location.state || {};

  // 如果没有用户信息，返回第一步
  useEffect(() => {
    if (!user || !account) {
      message.warning('请先输入账号');
      navigate('/login');
    }
  }, [user, account, navigate]);

  // 倒计时效果
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  /**
   * 发送短信验证码
   */
  const handleSendCode = useCallback(async () => {
    // 如果正在倒计时，不允许发送
    if (countdown > 0) {
      return;
    }

    setSendingCode(true);

    try {
      const response = await axios.post('/api/auth/send-sms', {
        phone: user.phone
      });

      if (response.data.success) {
        message.success('验证码已发送');
        setCountdown(60); // 开始60秒倒计时

        // 开发环境显示验证码
        if (response.data._devCode) {
          console.log('验证码:', response.data._devCode);
          message.info(`验证码: ${response.data._devCode} (开发模式)`, 5);
        }
      } else {
        // 服务器返回等待时间
        if (response.data.waitTime) {
          message.warning(`请等待 ${response.data.waitTime} 秒后再试`);
          setCountdown(response.data.waitTime);
        } else {
          message.error(response.data.message || '发送失败');
        }
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || '发送验证码失败';
      const waitTime = error.response?.data?.waitTime;
      
      if (waitTime) {
        message.warning(`请等待 ${waitTime} 秒后再试`);
        setCountdown(waitTime);
      } else {
        message.error(errorMsg);
      }
    } finally {
      setSendingCode(false);
    }
  }, [countdown, user?.phone]);

  /**
   * 密码登录
   */
  const handlePasswordLogin = async (values) => {
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/login-password', {
        account: account,
        password: values.password
      });

      if (response.data.success) {
        message.success('登录成功');
        // 存储 token
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        // 跳转到首页
        navigate('/');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || '登录失败';
      const lockTime = error.response?.data?.lockTime;
      
      if (lockTime) {
        message.error(`${errorMsg}`);
      } else {
        message.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * 验证码登录
   */
  const handleSmsLogin = async (values) => {
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/login-sms', {
        phone: user.phone,
        code: values.code
      });

      if (response.data.success) {
        message.success('登录成功');
        // 存储 token
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        // 跳转到首页
        navigate('/');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || '登录失败';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 返回上一步
   */
  const handleGoBack = () => {
    navigate('/login');
  };

  // 获取显示的账号（脱敏处理）
  const getDisplayAccount = () => {
    if (!account) return '';
    if (user?.phone) {
      // 手机号脱敏：138****8888
      return account.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    }
    return account;
  };

  // Tab 项配置
  const tabItems = [
    {
      key: 'password',
      label: '密码登录',
      children: (
        <Form
          form={form}
          name="password-login"
          onFinish={handlePasswordLogin}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="input-icon" />}
              placeholder="请输入密码"
              maxLength={20}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className="login-button"
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
          form={form}
          name="sms-login"
          onFinish={handleSmsLogin}
          autoComplete="off"
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="code"
            rules={[
              { required: true, message: '请输入验证码' },
              { pattern: /^\d{6}$/, message: '验证码为6位数字' }
            ]}
          >
            <div style={{ display: 'flex', gap: '12px' }}>
              <Input
                prefix={<MobileOutlined className="input-icon" />}
                placeholder="请输入验证码"
                maxLength={6}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                onClick={handleSendCode}
                loading={sendingCode}
                disabled={countdown > 0}
                style={{ 
                  minWidth: '110px',
                  background: countdown > 0 ? '#d9d9d9' : undefined,
                  borderColor: countdown > 0 ? '#d9d9d9' : undefined
                }}
              >
                {countdown > 0 ? `${countdown}秒后重发` : '获取验证码'}
              </Button>
            </div>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              className="login-button"
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      )
    }
  ];

  if (!user || !account) {
    return null;
  }

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="login-overlay" />
      </div>
      
      <Card className="login-card" bordered={false}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 返回按钮和标题 */}
          <div className="login-header">
            <Button 
              type="text" 
              icon={<ArrowLeftOutlined />} 
              onClick={handleGoBack}
              style={{ position: 'absolute', left: 0, top: 0 }}
            >
              返回
            </Button>
            <div className="login-logo">🔐</div>
            <Title level={2} className="login-title">
              安全验证
            </Title>
            <Text type="secondary" className="login-subtitle">
              账号: {getDisplayAccount()}
            </Text>
          </div>

          {/* 步骤指示器 */}
          <div className="login-steps">
            <div className="step completed">
              <span className="step-number">✓</span>
              <span className="step-text">输入账号</span>
            </div>
            <div className="step-line completed" />
            <div className="step active">
              <span className="step-number">2</span>
              <span className="step-text">安全验证</span>
            </div>
          </div>

          {/* 登录方式选择 */}
          <Tabs 
            defaultActiveKey="password" 
            items={tabItems}
            centered
            style={{ width: '100%' }}
          />

          {/* 辅助信息 */}
          <div className="login-footer">
            <Text type="secondary" className="footer-text">
              <LockOutlined /> 登录即表示您同意服务条款和隐私政策
            </Text>
          </div>
        </Space>
      </Card>

      {/* 版权信息 */}
      <div className="login-copyright">
        <Text type="secondary">
          © 2024-2026 MOCHU OA System. All rights reserved.
        </Text>
      </div>
    </div>
  );
};

export default LoginVerify;
