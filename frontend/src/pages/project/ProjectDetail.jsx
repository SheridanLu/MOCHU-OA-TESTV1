/**
 * 项目详情页面
 * 显示项目详情和审批状态
 * 支持虚拟项目中止和转实体
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Timeline,
  Steps,
  Modal,
  Input,
  InputNumber,
  DatePicker,
  message,
  Spin,
  Empty,
  Alert,
  Divider,
  Popconfirm,
  Badge,
  Form
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  AuditOutlined,
  FileTextOutlined,
  StopOutlined,
  SwapRightOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as approvalService from '../../services/approval';

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

// 项目状态映射
const PROJECT_STATUS_MAP = {
  pending: { text: '草稿', color: 'default' },
  pending_approval: { text: '待审批', color: 'orange' },
  approval_rejected: { text: '审批被拒', color: 'red' },
  active: { text: '进行中', color: 'blue' },
  completed: { text: '已完成', color: 'green' },
  cancelled: { text: '已取消', color: 'default' },
  // 虚拟项目状态
  tracking: { text: '跟踪中', color: 'processing' },
  converted: { text: '已转实体', color: 'success' },
  aborted: { text: '已中止', color: 'error' }
};

// 项目类型映射
const PROJECT_TYPE_MAP = {
  entity: { text: '实体项目', color: 'blue' },
  virtual: { text: '虚拟项目', color: 'purple' }
};

// 审批状态映射
const APPROVAL_STATUS_MAP = {
  pending: { text: '待审批', color: 'orange', icon: <ClockCircleOutlined /> },
  finance_approved: { text: '财务已审', color: 'blue', icon: <CheckCircleOutlined /> },
  approved: { text: '已通过', color: 'green', icon: <CheckCircleOutlined /> },
  rejected: { text: '已拒绝', color: 'red', icon: <CloseCircleOutlined /> }
};

// 角色名称映射
const ROLE_NAME_MAP = {
  FINANCE: '财务',
  GM: '总经理'
};

// 审批节点状态映射
const NODE_STATUS_MAP = {
  pending: { text: '待审批', color: 'default' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已拒绝', color: 'error' }
};

function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // 状态
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [approval, setApproval] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  // 弹窗状态
  const [approveVisible, setApproveVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [submitVisible, setSubmitVisible] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 虚拟项目转换弹窗
  const [convertVisible, setConvertVisible] = useState(false);
  const [convertForm] = Form.useForm();

  // 虚拟项目中止弹窗
  const [abortVisible, setAbortVisible] = useState(false);
  const [abortForm] = Form.useForm();

  // 获取当前用户信息
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
        // 从 token 解析角色或从 API 获取
        fetchUserRole();
      } catch (e) {
        console.error('解析用户信息失败:', e);
      }
    }
  }, []);

  // 获取用户角色
  const fetchUserRole = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success && result.data) {
        setCurrentUserRole(result.data.role);
      }
    } catch (error) {
      console.error('获取用户角色失败:', error);
    }
  };

  // 加载项目详情
  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      // 获取项目详情
      const projectResponse = await fetch(`${API_BASE}/projects/${id}`, {
        headers: getAuthHeaders()
      });
      const projectResult = await projectResponse.json();
      
      if (projectResult.success) {
        setProject(projectResult.data);

        // 获取审批信息
        try {
          const approvalResult = await approvalService.getProjectApproval(id);
          if (approvalResult.data.success) {
            setApproval(approvalResult.data.data);
          }
        } catch (error) {
          console.error('获取审批信息失败:', error);
        }
      } else {
        message.error(projectResult.message || '加载项目详情失败');
      }
    } catch (error) {
      console.error('加载项目详情失败:', error);
      message.error('加载项目详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // 提交审批
  const handleSubmitApproval = async () => {
    setSubmitting(true);
    try {
      const result = await approvalService.submitApproval(id);
      if (result.data.success) {
        message.success('审批提交成功');
        setSubmitVisible(false);
        loadProject();
      } else {
        message.error(result.data.message || '提交失败');
      }
    } catch (error) {
      message.error(error.response?.data?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 审批通过
  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const result = await approvalService.approveProject(id, comment);
      if (result.data.success) {
        message.success('审批通过');
        setApproveVisible(false);
        loadProject();
      } else {
        message.error(result.data.message || '审批失败');
      }
    } catch (error) {
      message.error(error.response?.data?.message || '审批失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 审批拒绝
  const handleReject = async () => {
    if (!comment.trim()) {
      message.warning('请填写拒绝原因');
      return;
    }

    setSubmitting(true);
    try {
      const result = await approvalService.rejectProject(id, comment);
      if (result.data.success) {
        message.success('审批已拒绝');
        setRejectVisible(false);
        loadProject();
      } else {
        message.error(result.data.message || '操作失败');
      }
    } catch (error) {
      message.error(error.response?.data?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 判断是否可以提交审批
  const canSubmitApproval = () => {
    if (!project) return false;
    // 草稿或审批被拒状态可以提交
    return ['pending', 'approval_rejected'].includes(project.status);
  };

  // 判断是否可以审批
  const canApprove = () => {
    return approval?.canApprove === true;
  };

  // 虚拟项目转实体
  const openConvertModal = () => {
    convertForm.resetFields();
    convertForm.setFieldsValue({
      contract_amount: parseFloat(project?.contract_amount) || 0
    });
    setConvertVisible(true);
  };

  const handleConvert = async () => {
    try {
      const values = await convertForm.validateFields();
      setSubmitting(true);

      const data = {
        id: project.id,
        bid_notice_no: values.bid_notice_no,
        bid_notice_date: values.bid_notice_date?.format('YYYY-MM-DD'),
        contract_amount: values.contract_amount,
        start_date: values.start_date?.format('YYYY-MM-DD'),
        end_date: values.end_date?.format('YYYY-MM-DD')
      };

      const response = await fetch(`${API_BASE}/projects/virtual/convert`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (result.success) {
        message.success(`虚拟项目转换成功！新实体项目编号：${result.data.entityProject.project_no}`);
        setConvertVisible(false);
        // 跳转到新实体项目
        navigate(`/project/detail/${result.data.entityProject.id}`);
      } else {
        message.error(result.message || '转换失败');
      }
    } catch (error) {
      console.error('转换项目失败:', error);
      message.error('转换项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 虚拟项目中止
  const openAbortModal = () => {
    abortForm.resetFields();
    setAbortVisible(true);
  };

  const handleAbort = async () => {
    try {
      const values = await abortForm.validateFields();
      setSubmitting(true);

      const response = await fetch(`${API_BASE}/projects/${project.id}/abort`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          reason: values.abort_reason,
          remarks: values.abort_remarks
        })
      });

      const result = await response.json();
      if (result.success) {
        message.success('虚拟项目已中止');
        setAbortVisible(false);
        loadProject();
      } else {
        message.error(result.message || '中止失败');
      }
    } catch (error) {
      console.error('中止项目失败:', error);
      message.error('中止项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 查看关联的实体项目
  const handleViewEntityProject = () => {
    if (project?.converted_to) {
      navigate(`/project/detail/${project.converted_to}`);
    }
  };

  // 渲染审批流程进度
  const renderApprovalSteps = () => {
    if (!approval || !approval.flows) return null;

    const currentStep = approval.flows.findIndex(f => f.status === 'pending');
    const stepIndex = currentStep >= 0 ? currentStep : approval.flows.length;

    return (
      <Steps
        current={stepIndex}
        size="small"
        items={approval.flows.map(flow => ({
          title: ROLE_NAME_MAP[flow.role] || flow.role,
          status: flow.status === 'approved' ? 'finish' : 
                  flow.status === 'rejected' ? 'error' : 'wait',
          icon: flow.status === 'approved' ? <CheckCircleOutlined /> :
                flow.status === 'rejected' ? <CloseCircleOutlined /> :
                <ClockCircleOutlined />,
          description: flow.approver_name ? (
            <span>
              {flow.approver_name}
              {flow.approved_at && (
                <>
                  <br />
                  <span style={{ fontSize: 12, color: '#999' }}>
                    {new Date(flow.approved_at).toLocaleString('zh-CN')}
                  </span>
                </>
              )}
            </span>
          ) : '待审批'
        }))}
      />
    );
  };

  // 渲染审批历史时间线
  const renderApprovalTimeline = () => {
    if (!approval || !approval.flows) return null;

    return (
      <Timeline
        items={approval.flows.map(flow => ({
          color: flow.status === 'approved' ? 'green' :
                 flow.status === 'rejected' ? 'red' : 'gray',
          dot: flow.status === 'approved' ? <CheckCircleOutlined /> :
               flow.status === 'rejected' ? <CloseCircleOutlined /> :
               <ClockCircleOutlined />,
          children: (
            <div>
              <div>
                <strong>{ROLE_NAME_MAP[flow.role] || flow.role}</strong>
                <Tag 
                  color={NODE_STATUS_MAP[flow.status]?.color} 
                  style={{ marginLeft: 8 }}
                >
                  {NODE_STATUS_MAP[flow.status]?.text}
                </Tag>
              </div>
              {flow.approver_name && (
                <div style={{ color: '#666' }}>审批人：{flow.approver_name}</div>
              )}
              {flow.comment && (
                <div style={{ color: '#666' }}>意见：{flow.comment}</div>
              )}
              {flow.approved_at && (
                <div style={{ fontSize: 12, color: '#999' }}>
                  {new Date(flow.approved_at).toLocaleString('zh-CN')}
                </div>
              )}
            </div>
          )
        }))}
      />
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 100, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: 100, textAlign: 'center' }}>
        <Empty description="项目不存在" />
        <Button type="link" onClick={() => navigate(-1)}>返回</Button>
      </div>
    );
  }

  const statusConfig = PROJECT_STATUS_MAP[project.status] || PROJECT_STATUS_MAP.pending;

  return (
    <div className="project-detail-container" style={{ padding: 24 }}>
      {/* 页面头部 */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            返回
          </Button>
          <h2 style={{ margin: 0 }}>
            {project.name}
            <Tag color={statusConfig.color} style={{ marginLeft: 12 }}>
              {statusConfig.text}
            </Tag>
          </h2>
        </Space>
      </div>

      {/* 审批状态提示 */}
      {approval && (
        <Alert
          message={
            <Space>
              <Badge status={approval.status === 'approved' ? 'success' : 
                            approval.status === 'rejected' ? 'error' : 'processing'} />
              <span>
                审批状态：
                <Tag color={APPROVAL_STATUS_MAP[approval.status]?.color}>
                  {APPROVAL_STATUS_MAP[approval.status]?.text}
                </Tag>
              </span>
              {approval.current_step && approval.status !== 'approved' && approval.status !== 'rejected' && (
                <span>
                  当前步骤：
                  <Tag color="blue">
                    {approval.current_step === 1 ? '财务审批中' : '总经理审批中'}
                  </Tag>
                </span>
              )}
            </Space>
          }
          type={approval.status === 'approved' ? 'success' : 
                approval.status === 'rejected' ? 'error' : 'info'}
          showIcon
          icon={<AuditOutlined />}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 操作按钮区域 */}
      <Card style={{ marginBottom: 24 }}>
        <Space wrap>
          {/* 提交审批按钮 */}
          {canSubmitApproval() && (
            <Popconfirm
              title="提交审批"
              description="确定要提交审批吗？"
              onConfirm={() => setSubmitVisible(true)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="primary" icon={<AuditOutlined />}>
                提交审批
              </Button>
            </Popconfirm>
          )}

          {/* 审批操作按钮 */}
          {canApprove() && (
            <>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={() => {
                  setComment('');
                  setApproveVisible(true);
                }}
              >
                审批通过
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => {
                  setComment('');
                  setRejectVisible(true);
                }}
              >
                审批拒绝
              </Button>
            </>
          )}

          {/* 重新提交按钮（审批被拒时） */}
          {project.status === 'approval_rejected' && (
            <Popconfirm
              title="重新提交"
              description="确定要重新提交审批吗？"
              onConfirm={() => setSubmitVisible(true)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="primary" icon={<AuditOutlined />}>
                重新提交审批
              </Button>
            </Popconfirm>
          )}

          {/* 虚拟项目操作按钮 */}
          {project.type === 'virtual' && project.status === 'tracking' && (
            <>
              <Divider type="vertical" />
              <Button
                type="primary"
                icon={<SwapRightOutlined />}
                style={{ background: '#52c41a', borderColor: '#52c41a' }}
                onClick={openConvertModal}
              >
                转为实体项目
              </Button>
              <Button
                danger
                icon={<StopOutlined />}
                onClick={openAbortModal}
              >
                中止项目
              </Button>
            </>
          )}

          {/* 已转换的虚拟项目 - 跳转按钮 */}
          {project.type === 'virtual' && project.status === 'converted' && project.converted_to && (
            <>
              <Divider type="vertical" />
              <Button
                type="primary"
                icon={<SwapRightOutlined />}
                onClick={handleViewEntityProject}
              >
                查看实体项目
              </Button>
            </>
          )}
        </Space>
      </Card>

      {/* 项目基本信息 */}
      <Card title="项目信息" style={{ marginBottom: 24 }}>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="项目编号">
            <Tag color="blue">{project.project_no}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="项目名称">{project.name}</Descriptions.Item>
          <Descriptions.Item label="项目类型">
            <Tag>{project.type === 'entity' ? '实体项目' : '虚拟项目'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="客户">{project.customer || '-'}</Descriptions.Item>
          <Descriptions.Item label="合同金额">
            <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
              ¥{(project.contract_amount || 0).toLocaleString()}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="项目负责人">
            {project.manager_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="开始日期">
            {project.start_date || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="结束日期">
            {project.end_date || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {project.created_at ? new Date(project.created_at).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '-'}
          </Descriptions.Item>

          {/* 实体项目显示中标信息 */}
          {project.type === 'entity' && project.bid_notice_no && (
            <>
              <Descriptions.Item label="中标通知书编号" span={2}>
                {project.bid_notice_no}
              </Descriptions.Item>
              <Descriptions.Item label="中标日期" span={2}>
                {project.bid_notice_date || '-'}
              </Descriptions.Item>
            </>
          )}

          {/* 虚拟项目显示转换信息 */}
          {project.type === 'virtual' && project.status === 'converted' && (
            <>
              <Descriptions.Item label="转换时间" span={2}>
                {project.converted_at ? new Date(project.converted_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              {project.converted_to_name && (
                <Descriptions.Item label="转换后实体项目" span={2}>
                  <Tag color="blue">{project.converted_to_no}</Tag>
                  {' '}
                  {project.converted_to_name}
                  <Button type="link" size="small" onClick={handleViewEntityProject}>
                    查看
                  </Button>
                </Descriptions.Item>
              )}
            </>
          )}

          {/* 虚拟项目显示中止信息 */}
          {project.type === 'virtual' && project.status === 'aborted' && (
            <>
              <Descriptions.Item label="中止时间" span={2}>
                {project.aborted_at ? dayjs(project.aborted_at).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              {project.abort_reason && (
                <Descriptions.Item label="中止原因" span={2}>
                  {project.abort_reason}
                </Descriptions.Item>
              )}
              {project.abort_remarks && (
                <Descriptions.Item label="中止备注" span={2}>
                  {project.abort_remarks}
                </Descriptions.Item>
              )}
            </>
          )}

          {/* 实体项目显示来源虚拟项目 */}
          {project.type === 'entity' && project.converted_from && (
            <Descriptions.Item label="来源虚拟项目" span={2}>
              {project.virtual_from_no && (
                <Tag color="purple">{project.virtual_from_no}</Tag>
              )}
              {' '}
              {project.virtual_from_name || '-'}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 审批流程 */}
      {approval && (
        <Card title="审批流程" style={{ marginBottom: 24 }}>
          {renderApprovalSteps()}
        </Card>
      )}

      {/* 审批历史 */}
      {approval && approval.flows && approval.flows.length > 0 && (
        <Card title="审批历史">
          {renderApprovalTimeline()}
        </Card>
      )}

      {/* 提交审批弹窗 */}
      <Modal
        title="提交审批"
        open={submitVisible}
        onOk={handleSubmitApproval}
        onCancel={() => setSubmitVisible(false)}
        confirmLoading={submitting}
        okText="确认提交"
        cancelText="取消"
        width={400}
      >
        <p>确定要提交项目 <strong>{project.name}</strong> 进行审批？</p>
        <p style={{ color: '#666', fontSize: 12 }}>
          审批流程：采购员提交 → 财务审批 → 总经理审批
        </p>
      </Modal>

      {/* 审批通过弹窗 */}
      <Modal
        title="审批通过"
        open={approveVisible}
        onOk={handleApprove}
        onCancel={() => setApproveVisible(false)}
        confirmLoading={submitting}
        okText="确认通过"
        cancelText="取消"
        width={500}
      >
        <p>确定通过项目 <strong>{project.name}</strong> 的审批？</p>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8 }}>审批意见（可选）：</div>
          <Input.TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="请输入审批意见"
            rows={3}
          />
        </div>
      </Modal>

      {/* 审批拒绝弹窗 */}
      <Modal
        title="审批拒绝"
        open={rejectVisible}
        onOk={handleReject}
        onCancel={() => setRejectVisible(false)}
        confirmLoading={submitting}
        okText="确认拒绝"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={500}
      >
        <p>确定拒绝项目 <strong>{project.name}</strong> 的审批？</p>
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 8, color: '#ff4d4f' }}>拒绝原因（必填）：</div>
          <Input.TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="请输入拒绝原因"
            rows={3}
            status={!comment.trim() && 'error'}
          />
        </div>
      </Modal>

      {/* 虚拟项目转实体弹窗 */}
      <Modal
        title={
          <Space>
            <SwapRightOutlined style={{ color: '#52c41a' }} />
            <span>虚拟项目转实体</span>
          </Space>
        }
        open={convertVisible}
        onOk={handleConvert}
        onCancel={() => setConvertVisible(false)}
        confirmLoading={submitting}
        okText="确认转换"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <div style={{
          padding: '12px 16px',
          background: '#f6ffed',
          borderRadius: 4,
          marginBottom: 16
        }}>
          <Space>
            <span>原虚拟项目：</span>
            <Tag color="purple">{project?.project_no}</Tag>
            <span>{project?.name}</span>
          </Space>
        </div>

        <Form form={convertForm} layout="vertical">
          <Form.Item
            name="bid_notice_no"
            label="中标通知书编号"
            rules={[{ required: true, message: '请输入中标通知书编号' }]}
          >
            <Input placeholder="请输入中标通知书编号" />
          </Form.Item>

          <Form.Item
            name="bid_notice_date"
            label="中标日期"
            rules={[{ required: true, message: '请选择中标日期' }]}
          >
            <DatePicker style={{ width: '100%' }} placeholder="请选择中标日期" />
          </Form.Item>

          <Form.Item
            name="contract_amount"
            label="合同金额（元）"
            rules={[{ type: 'number', min: 0, message: '金额不能为负数' }]}
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

          <Form.Item label="项目周期">
            <Space>
              <Form.Item name="start_date" noStyle>
                <DatePicker placeholder="开始日期" />
              </Form.Item>
              <span>至</span>
              <Form.Item name="end_date" noStyle>
                <DatePicker placeholder="结束日期" />
              </Form.Item>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 虚拟项目中止弹窗 */}
      <Modal
        title={
          <Space>
            <StopOutlined style={{ color: '#ff4d4f' }} />
            <span>中止虚拟项目</span>
          </Space>
        }
        open={abortVisible}
        onOk={handleAbort}
        onCancel={() => setAbortVisible(false)}
        confirmLoading={submitting}
        okText="确认中止"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        width={500}
        destroyOnClose
      >
        <div style={{
          padding: '12px 16px',
          background: '#fff2f0',
          borderRadius: 4,
          marginBottom: 16
        }}>
          <Space>
            <span>中止项目：</span>
            <Tag color="purple">{project?.project_no}</Tag>
            <span>{project?.name}</span>
          </Space>
        </div>

        <Form form={abortForm} layout="vertical">
          <Form.Item
            name="abort_reason"
            label="中止原因"
            rules={[{ required: true, message: '请输入中止原因' }]}
          >
            <Input placeholder="请输入中止原因" />
          </Form.Item>

          <Form.Item
            name="abort_remarks"
            label="备注"
          >
            <Input.TextArea rows={3} placeholder="请输入备注（可选）" />
          </Form.Item>
        </Form>

        <div style={{ color: '#ff4d4f', fontSize: 12 }}>
          提示：中止后虚拟项目将不可恢复
        </div>
      </Modal>
    </div>
  );
}

export default ProjectDetail;
