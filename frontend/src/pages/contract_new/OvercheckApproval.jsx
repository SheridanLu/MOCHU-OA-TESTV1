import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  message,
  Modal,
  Descriptions,
  Divider,
  Steps,
  Timeline,
  Alert,
  Badge,
  Tooltip,
  Result
} from 'antd';
import {
  WarningOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  AuditOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

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

// 超量校验状态映射
const OVERCHECK_STATUS_MAP = {
  none: { text: '无需校验', color: 'default' },
  pending: { text: '待审批', color: 'orange' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' }
};

// 审批动作映射
const ACTION_MAP = {
  pending: { text: '待处理', color: 'default' },
  approve: { text: '通过', color: 'success' },
  reject: { text: '拒绝', color: 'error' }
};

/**
 * 超量校验审批列表页面
 * Task 30: 支出合同超量校验
 * 
 * 功能：
 * - 预算员角色查看待审批的超量校验申请
 * - 查看超量详情和审批历史
 * - 通过/拒绝超量校验申请
 */
function OvercheckApproval() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentContract, setCurrentContract] = useState(null);
  const [userRoles, setUserRoles] = useState([]);

  // 加载用户角色
  useEffect(() => {
    loadUserRoles();
  }, []);

  const loadUserRoles = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success && result.roles) {
        setUserRoles(result.roles.map(r => r.code));
      }
    } catch (error) {
      console.error('加载用户角色失败:', error);
    }
  };

  // 检查是否有预算员权限
  const hasBudgetPermission = userRoles.includes('BUDGET') || userRoles.includes('GM');

  // 加载待超量校验列表
  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/contracts/overcheck/pending?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setContracts(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载超量校验列表失败:', error);
      message.error('加载超量校验列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize]);

  useEffect(() => {
    if (hasBudgetPermission) {
      loadContracts();
    }
  }, [loadContracts, hasBudgetPermission]);

  // 查看超量校验详情
  const handleViewDetail = async (record) => {
    try {
      const response = await fetch(`${API_BASE}/contracts/${record.id}/overcheck`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setCurrentContract(result.data);
        setDetailVisible(true);
      } else {
        message.error(result.message);
      }
    } catch (error) {
      console.error('获取超量校验详情失败:', error);
      message.error('获取详情失败');
    }
  };

  // 审批通过
  const handleApprove = (record) => {
    Modal.confirm({
      title: '超量校验审批通过',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      content: (
        <div>
          <p>确定要通过此超量校验申请吗？</p>
          <p>合同将通过超量校验，进入正常审批流程。</p>
          <div style={{ marginTop: 16 }}>
            <span>审批意见：</span>
            <TextArea
              id="approve-comment"
              placeholder="审批意见（可选）"
              rows={3}
              style={{ marginTop: 8 }}
            />
          </div>
        </div>
      ),
      okText: '确认通过',
      cancelText: '取消',
      onOk: async () => {
        const comment = document.getElementById('approve-comment')?.value || '';
        try {
          const response = await fetch(`${API_BASE}/contracts/${record.id}/overcheck/approve`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comment })
          });
          const result = await response.json();

          if (result.success) {
            message.success(result.message);
            setDetailVisible(false);
            loadContracts();
          } else {
            message.error(result.message);
          }
        } catch (error) {
          console.error('审批失败:', error);
          message.error('审批失败');
        }
      }
    });
  };

  // 审批拒绝
  const handleReject = (record) => {
    Modal.confirm({
      title: '超量校验审批拒绝',
      icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <Alert
            message="拒绝后合同将被退回，无法继续审批流程"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <div>
            <span style={{ color: '#ff4d4f' }}>* 拒绝原因（必填）：</span>
            <TextArea
              id="reject-reason"
              placeholder="请详细说明拒绝原因"
              rows={3}
              style={{ marginTop: 8 }}
              required
            />
          </div>
        </div>
      ),
      okText: '确认拒绝',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const reason = document.getElementById('reject-reason')?.value;
        if (!reason || !reason.trim()) {
          message.error('请填写拒绝原因');
          return Promise.reject();
        }

        try {
          const response = await fetch(`${API_BASE}/contracts/${record.id}/overcheck/reject`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comment: reason })
          });
          const result = await response.json();

          if (result.success) {
            message.success(result.message);
            setDetailVisible(false);
            loadContracts();
          } else {
            message.error(result.message);
          }
        } catch (error) {
          console.error('拒绝失败:', error);
          message.error('拒绝失败');
        }
      }
    });
  };

  // 获取审批进度步骤
  const getApprovalSteps = () => {
    if (!currentContract) return { steps: [], current: 0 };

    const steps = [
      { title: '创建合同', description: '采购员', status: 'finish' },
      { title: '超量校验', description: '预算员审批', status: currentContract.overcheck_status === 'approved' ? 'finish' : currentContract.overcheck_status === 'rejected' ? 'error' : 'process' },
      { title: '财务审批', description: '财务', status: currentContract.status === 'finance_approved' || currentContract.status === 'legal_approved' || currentContract.status === 'approved' ? 'finish' : 'wait' },
      { title: '法务审批', description: '法务', status: currentContract.status === 'legal_approved' || currentContract.status === 'approved' ? 'finish' : 'wait' },
      { title: '总经理审批', description: '总经理', status: currentContract.status === 'approved' ? 'finish' : 'wait' }
    ];

    let current = 1; // 默认在超量校验步骤
    if (currentContract.overcheck_status === 'approved') {
      current = 2;
    } else if (currentContract.overcheck_status === 'rejected') {
      current = 1;
    }

    return { steps, current };
  };

  // 表格列定义
  const columns = [
    {
      title: '合同编号',
      dataIndex: 'contract_no',
      key: 'contract_no',
      width: 140,
      fixed: 'left',
      render: (text) => (
        <Space>
          <FileTextOutlined />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      )
    },
    {
      title: '合同名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      ellipsis: true
    },
    {
      title: '关联项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 180,
      ellipsis: true,
      render: (text, record) => (
        <Tooltip title={`${record.project_no} - ${text}`}>
          <span>{record.project_no} - {text}</span>
        </Tooltip>
      )
    },
    {
      title: '供应商',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      width: 150,
      ellipsis: true
    },
    {
      title: '合同金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (amount) => (
        <span style={{ fontWeight: 'bold', color: '#cf1322' }}>
          ¥{parseFloat(amount || 0).toLocaleString()}
        </span>
      )
    },
    {
      title: '超量状态',
      dataIndex: 'overcheck_status',
      key: 'overcheck_status',
      width: 100,
      render: (status) => {
        const statusInfo = OVERCHECK_STATUS_MAP[status] || OVERCHECK_STATUS_MAP.none;
        return (
          <Badge 
            status={statusInfo.color === 'green' ? 'success' : statusInfo.color === 'orange' ? 'warning' : 'default'} 
            text={statusInfo.text} 
          />
        );
      }
    },
    {
      title: '申请人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 100
    },
    {
      title: '申请时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (time) => new Date(time).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.overcheck_status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleReject(record)}
              >
                拒绝
              </Button>
              <Button
                type="link"
                size="small"
                style={{ color: '#52c41a' }}
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(record)}
              >
                通过
              </Button>
            </>
          )}
        </Space>
      )
    }
  ];

  const { steps, current } = getApprovalSteps();

  // 无权限提示
  if (!hasBudgetPermission && userRoles.length > 0) {
    return (
      <div style={{ padding: '24px' }}>
        <Result
          status="403"
          title="无权限访问"
          subTitle="您没有预算员审批权限，请联系管理员"
          extra={
            <Button type="primary" onClick={() => navigate('/contract/list')}>
              返回合同列表
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <AuditOutlined />
            <span>超量校验审批</span>
            <Tag color="orange">{pagination.total} 条待审批</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button onClick={() => navigate('/contract/list')}>
              返回合同列表
            </Button>
            <Button type="primary" onClick={loadContracts}>
              刷新
            </Button>
          </Space>
        }
      >
        <Alert
          message="超量校验说明"
          description="当支出合同的采购需求超出项目采购清单时，需要预算员进行超量校验审批。通过后方可进入正常审批流程。"
          type="info"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={contracts}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条待审批`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* 超量校验详情模态框 */}
      <Modal
        title={
          <Space>
            <AuditOutlined />
            <span>超量校验详情</span>
            {currentContract && (
              <Tag color={OVERCHECK_STATUS_MAP[currentContract.overcheck_status]?.color}>
                {OVERCHECK_STATUS_MAP[currentContract.overcheck_status]?.text}
              </Tag>
            )}
          </Space>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          currentContract && currentContract.overcheck_status === 'pending' && (
            <Button key="reject" danger onClick={() => handleReject(currentContract)}>
              拒绝
            </Button>
          ),
          currentContract && currentContract.overcheck_status === 'pending' && (
            <Button key="approve" type="primary" onClick={() => handleApprove(currentContract)}>
              通过
            </Button>
          )
        ]}
      >
        {currentContract && (
          <>
            {/* 审批进度 */}
            <Card size="small" title="审批进度" style={{ marginBottom: 16 }}>
              <Steps current={current} size="small">
                {steps.map((step, index) => (
                  <Steps.Step
                    key={index}
                    title={step.title}
                    description={step.description}
                    status={step.status}
                  />
                ))}
              </Steps>
            </Card>

            {/* 超量说明 */}
            {currentContract.overcheck_reason && (
              <Alert
                message="超量申请说明"
                description={currentContract.overcheck_reason}
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            {/* 合同基本信息 */}
            <Descriptions title="合同基本信息" bordered column={2} size="small">
              <Descriptions.Item label="合同编号">{currentContract.contract_no}</Descriptions.Item>
              <Descriptions.Item label="合同名称">{currentContract.name}</Descriptions.Item>
              <Descriptions.Item label="关联项目">
                {currentContract.project_no} - {currentContract.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="供应商">{currentContract.supplier_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="合同金额">
                <span style={{ fontWeight: 'bold', color: '#cf1322', fontSize: '16px' }}>
                  ¥{parseFloat(currentContract.amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="项目预算">
                <span style={{ fontWeight: 'bold', color: '#1890ff' }}>
                  ¥{parseFloat(currentContract.project_budget || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="签订日期">{currentContract.sign_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="有效期">
                {currentContract.start_date && currentContract.end_date
                  ? `${currentContract.start_date} 至 ${currentContract.end_date}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="申请人">{currentContract.creator_name}</Descriptions.Item>
              <Descriptions.Item label="申请时间">
                {new Date(currentContract.updated_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              {currentContract.budget_approver_name && (
                <>
                  <Descriptions.Item label="审批人">{currentContract.budget_approver_name}</Descriptions.Item>
                  <Descriptions.Item label="审批时间">
                    {currentContract.budget_approved_at
                      ? new Date(currentContract.budget_approved_at).toLocaleString('zh-CN')
                      : '-'}
                  </Descriptions.Item>
                </>
              )}
              {currentContract.budget_approve_comment && (
                <Descriptions.Item label="审批意见" span={2}>
                  {currentContract.budget_approve_comment}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* 超量明细 */}
            {currentContract.overcheck_items && currentContract.overcheck_items.length > 0 && (
              <>
                <Divider>超量明细</Divider>
                <Table
                  dataSource={currentContract.overcheck_items}
                  rowKey={(record, index) => index}
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '物料名称', dataIndex: 'material_name', width: 150 },
                    { title: '规格', dataIndex: 'specification', width: 100 },
                    { title: '采购清单数量', dataIndex: 'list_quantity', width: 100 },
                    { title: '实际数量', dataIndex: 'actual_quantity', width: 100 },
                    { title: '超量数量', dataIndex: 'overage_quantity', width: 100, render: (v) => v ? <span style={{ color: '#cf1322' }}>{v}</span> : '-' },
                    { title: '备注', dataIndex: 'remark', ellipsis: true }
                  ]}
                />
              </>
            )}

            {/* 审批记录 */}
            {currentContract.approval_records && currentContract.approval_records.length > 0 && (
              <>
                <Divider>审批记录</Divider>
                <Timeline
                  items={currentContract.approval_records.map(item => ({
                    color: item.action === 'approve' ? 'green' : item.action === 'reject' ? 'red' : 'gray',
                    children: (
                      <div>
                        <div>
                          <strong>{item.step_name}</strong>
                          <Tag 
                            color={ACTION_MAP[item.action]?.color}
                            style={{ marginLeft: 8 }}
                          >
                            {ACTION_MAP[item.action]?.text}
                          </Tag>
                        </div>
                        {item.approver_name && (
                          <div style={{ color: '#666' }}>审批人：{item.approver_name}</div>
                        )}
                        {item.comment && (
                          <div style={{ color: '#666' }}>意见：{item.comment}</div>
                        )}
                        <div style={{ color: '#999', fontSize: '12px' }}>
                          {new Date(item.created_at).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    )
                  }))}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export default OvercheckApproval;
