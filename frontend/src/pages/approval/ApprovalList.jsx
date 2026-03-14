/**
 * 待审批列表页面
 * 显示需要当前用户审批的项目列表
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Card,
  Tag,
  Modal,
  Descriptions,
  message,
  Input,
  Space,
  Steps,
  Timeline,
  Tooltip,
  Badge,
  Tabs,
  Empty,
  Spin,
  Popconfirm,
  Row,
  Col,
  Statistic
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FileTextOutlined,
  HistoryOutlined,
  AuditOutlined
} from '@ant-design/icons';
import * as approvalService from '../../services/approval';

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

// 审批状态映射
const APPROVAL_STATUS_MAP = {
  pending: { text: '待审批', color: 'orange', icon: <ClockCircleOutlined /> },
  finance_approved: { text: '财务已审', color: 'blue', icon: <CheckCircleOutlined /> },
  approved: { text: '已通过', color: 'green', icon: <CheckCircleOutlined /> },
  rejected: { text: '已拒绝', color: 'red', icon: <CloseCircleOutlined /> }
};

// 审批节点状态映射
const NODE_STATUS_MAP = {
  pending: { text: '待审批', color: 'default' },
  approved: { text: '已通过', color: 'success' },
  rejected: { text: '已拒绝', color: 'error' }
};

// 角色名称映射
const ROLE_NAME_MAP = {
  FINANCE: '财务',
  GM: '总经理'
};

// 待审批列表页面
function ApprovalList() {
  // 状态
  const [loading, setLoading] = useState(false);
  const [pendingList, setPendingList] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [mySubmissions, setMySubmissions] = useState([]);
  const [mySubmissionsTotal, setMySubmissionsTotal] = useState(0);
  const [myApprovedList, setMyApprovedList] = useState([]);
  const [myApprovedTotal, setMyApprovedTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState('pending');

  // 弹窗状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [approveVisible, setApproveVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [currentApproval, setCurrentApproval] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 统计数据
  const [stats, setStats] = useState({
    pending: 0,
    mySubmissions: 0,
    myApproved: 0
  });

  // 加载待审批列表
  const loadPendingList = useCallback(async () => {
    setLoading(true);
    try {
      const result = await approvalService.getPendingApprovals({ page, pageSize });
      if (result.data.success) {
        setPendingList(result.data.data.list || []);
        setPendingTotal(result.data.data.total || 0);
        setStats(prev => ({ ...prev, pending: result.data.data.total || 0 }));
      }
    } catch (error) {
      if (error.response?.status !== 403) {
        message.error('加载待审批列表失败');
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  // 加载我提交的审批
  const loadMySubmissions = useCallback(async () => {
    try {
      const result = await approvalService.getMySubmissions({ page, pageSize });
      if (result.data.success) {
        setMySubmissions(result.data.data.list || []);
        setMySubmissionsTotal(result.data.data.total || 0);
        setStats(prev => ({ ...prev, mySubmissions: result.data.data.total || 0 }));
      }
    } catch (error) {
      console.error('加载提交记录失败:', error);
    }
  }, [page, pageSize]);

  // 加载我已审批的列表
  const loadMyApproved = useCallback(async () => {
    try {
      const result = await approvalService.getMyApproved({ page, pageSize });
      if (result.data.success) {
        setMyApprovedList(result.data.data.list || []);
        setMyApprovedTotal(result.data.data.total || 0);
        setStats(prev => ({ ...prev, myApproved: result.data.data.total || 0 }));
      }
    } catch (error) {
      console.error('加载已审批记录失败:', error);
    }
  }, [page, pageSize]);

  // 初始化加载
  useEffect(() => {
    loadPendingList();
    loadMySubmissions();
    loadMyApproved();
  }, [loadPendingList, loadMySubmissions, loadMyApproved]);

  // 查看详情
  const handleViewDetail = (record) => {
    setCurrentApproval(record);
    setDetailVisible(true);
  };

  // 打开审批通过弹窗
  const handleOpenApprove = (record) => {
    setCurrentApproval(record);
    setComment('');
    setApproveVisible(true);
  };

  // 打开审批拒绝弹窗
  const handleOpenReject = (record) => {
    setCurrentApproval(record);
    setComment('');
    setRejectVisible(true);
  };

  // 确认审批通过
  const handleApprove = async () => {
    if (!currentApproval) {
      message.error('未选择审批记录');
      return;
    }
    
    console.log('开始审批:', currentApproval);
    setSubmitting(true);
    try {
      let result;
      
      // 根据审批来源调用不同的API
      const approvalType = currentApproval.approval_source || currentApproval.approval_type || currentApproval.type;
      console.log('审批类型:', approvalType);
      
      if (approvalType === 'project') {
        // 项目立项审批
        result = await approvalService.approveProject(
          currentApproval.project_id,
          comment
        );
      } else if (approvalType === 'sporadic') {
        // 零星采购审批
        const response = await fetch(`${API_BASE}/purchase/sporadic/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'purchase_list') {
        // 采购清单审批
        const response = await fetch(`${API_BASE}/purchase-lists/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'virtual_convert') {
        // 虚拟转实体审批
        const response = await fetch(`${API_BASE}/projects/${currentApproval.project_id}/process-conversion`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ approve: true, comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'virtual_abort') {
        // 虚拟中止审批
        const response = await fetch(`${API_BASE}/projects/${currentApproval.project_id}/process-abort`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ approve: true, comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'contract') {
        // 合同审批
        const response = await fetch(`${API_BASE}/contract/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'batch_purchase') {
        // 批量采购审批
        const response = await fetch(`${API_BASE}/batch-purchase/batch/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'material_payment') {
        // 材料付款审批
        const response = await fetch(`${API_BASE}/payment/material/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'labor_payment') {
        // 劳务付款审批
        const response = await fetch(`${API_BASE}/payment/labor/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'material_change') {
        // 材料变更审批
        const response = await fetch(`${API_BASE}/change/material/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'visa_change') {
        // 签证变更审批
        const response = await fetch(`${API_BASE}/change/visa/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'owner_change') {
        // 业主变更审批
        const response = await fetch(`${API_BASE}/change/owner/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'stock_out') {
        // 出库审批
        const response = await fetch(`${API_BASE}/stock/out/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'labor_settlement') {
        // 竣工结算审批
        const response = await fetch(`${API_BASE}/completion/labor-settlement/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'overage_application') {
        // 超量申请审批
        const response = await fetch(`${API_BASE}/purchase/overage-apply/${currentApproval.id}/approve`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else {
        // 默认使用项目审批API
        result = await approvalService.approveProject(
          currentApproval.project_id,
          comment
        );
      }
      
      if (result.data?.success) {
        message.success(result.data.message || '审批通过');
        setApproveVisible(false);
        loadPendingList();
        loadMyApproved();
      } else {
        message.error(result.data?.message || '审批失败');
      }
    } catch (error) {
      console.error('审批出错:', error);
      message.error(error.response?.data?.message || '审批失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 确认审批拒绝
  const handleReject = async () => {
    if (!currentApproval) return;
    
    if (!comment.trim()) {
      message.warning('请填写拒绝原因');
      return;
    }
    
    setSubmitting(true);
    try {
      let result;
      
      // 根据审批来源调用不同的API
      const approvalType = currentApproval.approval_source || currentApproval.approval_type || currentApproval.type;
      
      if (approvalType === 'project') {
        result = await approvalService.rejectProject(
          currentApproval.project_id,
          comment
        );
      } else if (approvalType === 'sporadic') {
        const response = await fetch(`${API_BASE}/purchase/sporadic/${currentApproval.id}/reject`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'purchase_list') {
        const response = await fetch(`${API_BASE}/purchase-lists/${currentApproval.id}/reject`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'virtual_convert') {
        const response = await fetch(`${API_BASE}/projects/${currentApproval.project_id}/process-conversion`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ approve: false, comment })
        });
        result = { data: await response.json() };
      } else if (approvalType === 'virtual_abort') {
        const response = await fetch(`${API_BASE}/projects/${currentApproval.project_id}/process-abort`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ approve: false, comment })
        });
        result = { data: await response.json() };
      } else {
        result = await approvalService.rejectProject(
          currentApproval.project_id,
          comment
        );
      }
      if (result.data.success) {
        message.success('审批已拒绝');
        setRejectVisible(false);
        loadPendingList();
        loadMyApproved();
      } else {
        message.error(result.data.message || '操作失败');
      }
    } catch (error) {
      message.error(error.response?.data?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 分页改变
  const handleTableChange = (pagination) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
  };

  // 待审批表格列定义
  const pendingColumns = [
    {
      title: '类型',
      dataIndex: 'source_name',
      key: 'source_name',
      width: 90,
      render: (text, record) => (
        <Tag color={record.approval_source === 'sporadic' ? 'purple' : 'blue'}>
          {text || '项目立项'}
        </Tag>
      )
    },
    {
      title: '编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 140,
      render: (text, record) => (
        <Tag color="blue">{text || record.sporadic_no}</Tag>
      )
    },
    {
      title: '名称/事由',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true,
      render: (text, record) => text || record.reason || '-'
    },
    {
      title: '客户',
      dataIndex: 'customer',
      key: 'customer',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '金额',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      width: 120,
      render: (amount, record) => {
        const val = amount || record.total_amount || 0;
        return `¥${val.toLocaleString()}`;
      }
    },
    {
      title: '提交人',
      dataIndex: 'submitter_name',
      key: 'submitter_name',
      width: 100,
      render: (text, record) => text || record.creator_name || '-'
    },
    {
      title: '当前步骤',
      dataIndex: 'current_step',
      key: 'current_step',
      width: 120,
      render: (step, record) => {
        const stepName = record.current_step_name || (step === 1 ? '财务审批' : '总经理审批');
        return <Tag color={step === 1 ? 'orange' : 'blue'}>{stepName}</Tag>;
      }
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              详情
            </Button>
          </Tooltip>
          <Tooltip title="审批通过">
            <Button
              type="link"
              size="small"
              style={{ color: '#52c41a' }}
              icon={<CheckCircleOutlined />}
              onClick={() => handleOpenApprove(record)}
            >
              通过
            </Button>
          </Tooltip>
          <Tooltip title="审批拒绝">
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => handleOpenReject(record)}
            >
              拒绝
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  // 提交记录表格列定义
  const submissionColumns = [
    {
      title: '项目编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 140,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '合同金额',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      width: 120,
      render: (amount) => `¥${(amount || 0).toLocaleString()}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = APPROVAL_STATUS_MAP[status] || APPROVAL_STATUS_MAP.pending;
        return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
      }
    },
    {
      title: '当前步骤',
      dataIndex: 'current_step',
      key: 'current_step',
      width: 100,
      render: (step, record) => {
        if (record.status === 'approved') return <Tag color="green">已完成</Tag>;
        if (record.status === 'rejected') return <Tag color="red">已拒绝</Tag>;
        return (
          <Tag color={step === 1 ? 'orange' : 'blue'}>
            {step === 1 ? '财务审批' : '总经理审批'}
          </Tag>
        );
      }
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          详情
        </Button>
      )
    }
  ];

  // 已审批记录表格列定义
  const approvedColumns = [
    {
      title: '项目编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 140,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '我的操作',
      dataIndex: 'my_action',
      key: 'my_action',
      width: 100,
      render: (status) => (
        <Tag color={status === 'approved' ? 'green' : 'red'}>
          {status === 'approved' ? '通过' : '拒绝'}
        </Tag>
      )
    },
    {
      title: '我的意见',
      dataIndex: 'my_comment',
      key: 'my_comment',
      width: 200,
      ellipsis: true,
      render: (text) => text || '-'
    },
    {
      title: '审批时间',
      dataIndex: 'my_approved_at',
      key: 'my_approved_at',
      width: 170,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '最终状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const config = APPROVAL_STATUS_MAP[status] || APPROVAL_STATUS_MAP.pending;
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          详情
        </Button>
      )
    }
  ];

  // 渲染审批流程进度
  const renderApprovalSteps = (flows) => {
    if (!flows || flows.length === 0) return null;

    const current = flows.findIndex(f => f.status === 'pending');
    const currentStep = current >= 0 ? current : flows.length;

    return (
      <Steps
        current={currentStep}
        size="small"
        items={flows.map(flow => ({
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
  const renderApprovalTimeline = (flows) => {
    if (!flows || flows.length === 0) return <Empty description="暂无审批记录" />;

    return (
      <Timeline
        items={flows.map(flow => ({
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

  return (
    <div className="approval-list-container" style={{ padding: 24 }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="待我审批"
              value={stats.pending}
              prefix={<AuditOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="我提交的"
              value={stats.mySubmissions}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="我已审批"
              value={stats.myApproved}
              prefix={<HistoryOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 标签页切换 */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'pending',
              label: (
                <span>
                  <Badge count={stats.pending} size="small" offset={[10, 0]}>
                    <AuditOutlined style={{ marginRight: 8 }} />
                    待我审批
                  </Badge>
                </span>
              ),
              children: (
                <Table
                  columns={pendingColumns}
                  dataSource={pendingList}
                  rowKey="id"
                  loading={loading}
                  pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: pendingTotal,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total) => `共 ${total} 条记录`
                  }}
                  onChange={handleTableChange}
                  scroll={{ x: 1200 }}
                  size="middle"
                  locale={{ emptyText: <Empty description="暂无待审批项目" /> }}
                />
              )
            },
            {
              key: 'mySubmissions',
              label: (
                <span>
                  <FileTextOutlined style={{ marginRight: 8 }} />
                  我提交的
                  {stats.mySubmissions > 0 && (
                    <Badge count={stats.mySubmissions} size="small" style={{ marginLeft: 8 }} />
                  )}
                </span>
              ),
              children: (
                <Table
                  columns={submissionColumns}
                  dataSource={mySubmissions}
                  rowKey="id"
                  pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: mySubmissionsTotal,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条记录`
                  }}
                  onChange={handleTableChange}
                  scroll={{ x: 1100 }}
                  size="middle"
                  locale={{ emptyText: <Empty description="暂无提交记录" /> }}
                />
              )
            },
            {
              key: 'myApproved',
              label: (
                <span>
                  <HistoryOutlined style={{ marginRight: 8 }} />
                  我已审批
                </span>
              ),
              children: (
                <Table
                  columns={approvedColumns}
                  dataSource={myApprovedList}
                  rowKey="id"
                  pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: myApprovedTotal,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条记录`
                  }}
                  onChange={handleTableChange}
                  scroll={{ x: 1100 }}
                  size="middle"
                  locale={{ emptyText: <Empty description="暂无审批记录" /> }}
                />
              )
            }
          ]}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="审批详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {currentApproval && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="项目编号">
                <Tag color="blue">{currentApproval.project_no}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="项目名称">
                {currentApproval.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="客户">
                {currentApproval.customer || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="合同金额">
                ¥{(currentApproval.contract_amount || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="项目负责人">
                {currentApproval.project_manager_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="提交人">
                {currentApproval.submitter_name}
              </Descriptions.Item>
              <Descriptions.Item label="提交时间">
                {currentApproval.created_at ? 
                  new Date(currentApproval.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color={APPROVAL_STATUS_MAP[currentApproval.status]?.color}>
                  {APPROVAL_STATUS_MAP[currentApproval.status]?.text}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {/* 审批流程进度 */}
            {currentApproval.flows && (
              <div style={{ marginTop: 24 }}>
                <h4>审批流程</h4>
                {renderApprovalSteps(currentApproval.flows)}
              </div>
            )}

            {/* 审批历史 */}
            {currentApproval.flows && (
              <div style={{ marginTop: 24 }}>
                <h4>审批历史</h4>
                {renderApprovalTimeline(currentApproval.flows)}
              </div>
            )}
          </>
        )}
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
        <p>确定通过项目 <strong>{currentApproval?.project_name}</strong> 的审批？</p>
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
        <p>确定拒绝项目 <strong>{currentApproval?.project_name}</strong> 的审批？</p>
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
    </div>
  );
}

export default ApprovalList;
