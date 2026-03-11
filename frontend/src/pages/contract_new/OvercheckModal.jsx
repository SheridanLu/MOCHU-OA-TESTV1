import { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  message,
  Alert,
  Descriptions,
  Divider,
  Spin,
  Result
} from 'antd';
import {
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

const { Option } = Select;
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
 * 超量校验申请弹窗组件
 * Task 30: 支出合同超量校验
 * 
 * 功能：
 * - 检查合同是否需要超量校验
 * - 显示超量预警信息
 * - 提交超量校验申请
 */
function OvercheckModal({ 
  visible, 
  contract, 
  onClose, 
  onSuccess 
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [projects, setProjects] = useState([]);

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
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
  };

  // 验证是否需要超量校验
  useEffect(() => {
    if (visible && contract) {
      validateOvercheck();
    }
  }, [visible, contract]);

  const validateOvercheck = async () => {
    if (!contract?.id) return;

    setValidating(true);
    try {
      const response = await fetch(`${API_BASE}/contracts/${contract.id}/overcheck/validate`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setValidation(result.data);
      }
    } catch (error) {
      console.error('验证超量校验失败:', error);
    } finally {
      setValidating(false);
    }
  };

  // 提交超量校验申请
  const handleSubmit = async (values) => {
    if (!contract?.id) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/contracts/${contract.id}/overcheck`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reason: values.reason,
          items: []
        })
      });

      const result = await response.json();
      if (result.success) {
        message.success('超量校验申请已提交，等待预算员审批');
        form.resetFields();
        onSuccess?.();
        onClose();
      } else {
        message.error(result.message || '提交失败');
      }
    } catch (error) {
      console.error('提交超量校验失败:', error);
      message.error('提交失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取项目信息
  const getProjectInfo = () => {
    if (!contract?.project_id) return null;
    return projects.find(p => p.id === contract.project_id);
  };

  const projectInfo = getProjectInfo();

  // 判断是否需要超量校验
  const needOvercheck = validation?.need_overcheck;
  const warnings = validation?.warnings || [];

  // 如果已经提交过超量校验
  if (validation?.current_status === 'approved') {
    return (
      <Modal
        title="超量校验状态"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
        ]}
      >
        <Result
          status="success"
          title="超量校验已通过"
          subTitle="该合同的超量校验已通过预算员审批，可以继续审批流程。"
        />
      </Modal>
    );
  }

  if (validation?.current_status === 'pending') {
    return (
      <Modal
        title="超量校验状态"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
        ]}
      >
        <Result
          status="info"
          title="等待审批中"
          subTitle="该合同的超量校验申请已提交，正在等待预算员审批。"
        />
      </Modal>
    );
  }

  if (validation?.current_status === 'rejected') {
    return (
      <Modal
        title="超量校验状态"
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
        ]}
      >
        <Result
          status="error"
          title="超量校验已拒绝"
          subTitle="该合同的超量校验申请已被拒绝，请修改后重新提交。"
        />
      </Modal>
    );
  }

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>超量校验申请</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={700}
      footer={null}
    >
      <Spin spinning={validating}>
        {/* 验证结果提示 */}
        {validation && (
          <>
            {needOvercheck ? (
              <Alert
                message="需要超量校验"
                description={
                  <div>
                    <p>该合同需要进行超量校验，请填写超量原因说明。</p>
                    {warnings.map((w, idx) => (
                      <p key={idx} style={{ margin: 0 }}>
                        • {w.message}
                      </p>
                    ))}
                  </div>
                }
                type="warning"
                showIcon
                icon={<ExclamationCircleOutlined />}
                style={{ marginBottom: 16 }}
              />
            ) : (
              <Alert
                message="无需超量校验"
                description="该合同无需进行超量校验，可以直接提交审批。"
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: 16 }}
              />
            )}
          </>
        )}

        {/* 合同信息 */}
        {contract && (
          <>
            <Descriptions title="合同信息" bordered column={2} size="small">
              <Descriptions.Item label="合同编号">{contract.contract_no}</Descriptions.Item>
              <Descriptions.Item label="合同名称">{contract.name}</Descriptions.Item>
              <Descriptions.Item label="合同金额">
                <span style={{ fontWeight: 'bold' }}>
                  ¥{parseFloat(contract.amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="供应商">{contract.party_b || '-'}</Descriptions.Item>
              {projectInfo && (
                <>
                  <Descriptions.Item label="关联项目" span={2}>
                    {projectInfo.project_no} - {projectInfo.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="项目预算">
                    <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
                      ¥{parseFloat(projectInfo.contract_amount || 0).toLocaleString()}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="预算使用率">
                    {projectInfo.contract_amount > 0 ? (
                      <span style={{ 
                        color: (contract.amount / projectInfo.contract_amount) > 1 ? '#cf1322' : '#52c41a'
                      }}>
                        {((contract.amount / projectInfo.contract_amount) * 100).toFixed(2)}%
                      </span>
                    ) : '-'}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
            <Divider />
          </>
        )}

        {/* 超量校验申请表单 */}
        {needOvercheck && (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
          >
            <Form.Item
              name="reason"
              label="超量原因说明"
              rules={[
                { required: true, message: '请填写超量原因说明' },
                { min: 10, message: '原因说明至少10个字符' }
              ]}
              extra="请详细说明超量采购的原因，以便预算员审核。"
            >
              <TextArea
                rows={4}
                placeholder="例如：因项目现场实际情况变更，需要额外采购XX材料，具体原因如下..."
                maxLength={500}
                showCount
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={onClose}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit" loading={loading}>
                  提交超量校验申请
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}

        {/* 无需超量校验时的操作 */}
        {!needOvercheck && (
          <div style={{ textAlign: 'center' }}>
            <Space>
              <Button onClick={onClose}>
                关闭
              </Button>
              <Button type="primary" onClick={onClose}>
                确定
              </Button>
            </Space>
          </div>
        )}
      </Spin>
    </Modal>
  );
}

export default OvercheckModal;
