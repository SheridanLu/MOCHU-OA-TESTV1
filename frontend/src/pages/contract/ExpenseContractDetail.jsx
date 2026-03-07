import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Tabs,
  Table,
  Timeline,
  Modal,
  Form,
  Input,
  message,
  Divider,
  Steps,
  Badge,
  Alert,
  Tooltip,
  Statistic,
  Row,
  Col
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  FileTextOutlined,
  WarningOutlined,
  EyeOutlined,
  DollarOutlined,
  ShoppingOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';

const { TabPane } = Tabs;
const { TextArea } = Input;

// API 基础地址
const API_BASE = 'http://localhost:3001/api';

// 获取请求头
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 合同状态映射
const STATUS_MAP = {
  draft: { text: '草稿', color: 'default' },
  pending: { text: '待审批', color: 'orange' },
  finance_approved: { text: '财务已审', color: 'blue' },
  legal_approved: { text: '法务已审', color: 'cyan' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已拒绝', color: 'red' },
  active: { text: '执行中', color: 'green' },
  completed: { text: '已完成', color: 'default' }
};

// 审批节点映射
const APPROVER_MAP = {
  FINANCE: '财务',
  LEGAL: '法务',
  GM: '总经理',
  BUDGETER: '预算员'
};

/**
 * 支出合同详情页面
 * 
 * 功能：
 * - 查看合同基本信息
 * - 查看超量校验状态
 * - 查看价格预警
 * - 查看审批历史
 * - 提交审批
 * - 审批操作
 */
function ExpenseContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [contract, setContract] = useState(null);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [priceWarnings, setPriceWarnings] = useState([]);
  const [overageRecords, setOverageRecords] = useState([]);
  const [purchaseListItems, setPurchaseListItems] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [checkResult, setCheckResult] = useState(null);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

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

  // 加载合同详情
  const loadContract = useCallback(async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      // 获取合同详情
      const response = await fetch(`${API_BASE}/contracts/${id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setContract(result.data);
      } else {
        message.error(result.message || '获取合同详情失败');
      }
    } catch (error) {
      console.error('加载合同详情失败:', error);
      message.error('加载合同详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // 加载审批历史
  const loadApprovalHistory = useCallback(async () => {
    if (!id) return;
    
    try {
      const response = await fetch(`${API_BASE}/contracts/${id}/history`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setApprovalHistory(result.data || []);
      }
    } catch (error) {
      console.error('加载审批历史失败:', error);
    }
  }, [id]);

  // 加载价格预警
  const loadPriceWarnings = useCallback(async () => {
    if (!id) return;
    
    try {
      const response = await fetch(`${API_BASE}/contracts/price-warnings?module=contract&status=all`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        // 过滤当前合同的价格预警
        const contractWarnings = (result.data?.list || []).filter(w => w.contract_id === parseInt(id));
        setPriceWarnings(contractWarnings);
      }
    } catch (error) {
      console.error('加载价格预警失败:', error);
    }
  }, [id]);

  // 加载超量记录
  const loadOverageRecords = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/contracts/overcheck?status=all`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        // 过滤当前合同的超量记录
        const contractOverages = (result.data?.list || []).filter(r => r.contract_id === parseInt(id));
        setOverageRecords(contractOverages);
      }
    } catch (error) {
      console.error('加载超量记录失败:', error);
    }
  }, [id]);

  // 检查合同可签订状态
  const checkContract = useCallback(async () => {
    if (!id) return;
    
    try {
      const response = await fetch(`${API_BASE}/contracts/${id}/check`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setCheckResult(result.data);
      }
    } catch (error) {
      console.error('检查合同失败:', error);
    }
  }, [id]);

  // 初始化数据
  useEffect(() => {
    loadContract();
    loadApprovalHistory();
    loadPriceWarnings();
    loadOverageRecords();
    checkContract();
  }, [loadContract, loadApprovalHistory, loadPriceWarnings, loadOverageRecords, checkContract]);

  // 提交审批
  const handleSubmit = async () => {
    Modal.confirm({
      title: '确认提交',
      content: `确定要提交合同 "${contract.name}" 进行审批吗？`,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/contracts/${id}/submit`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          const result = await response.json();
          
          if (result.success) {
            message.success(result.message);
            loadContract();
            loadApprovalHistory();
          } else {
            message.error(result.message);
          }
        } catch (error) {
          console.error('提交审批失败:', error);
          message.error('提交审批失败');
        }
      }
    });
  };

  // 审批通过
  const handleApprove = async () => {
    Modal.confirm({
      title: '审批通过',
      content: (
        <div>
          <p>确定要通过此合同的审批吗？</p>
          <TextArea
            id="approve-comment"
            placeholder="审批意见（可选）"
            rows={3}
          />
        </div>
      ),
      onOk: async () => {
        const comment = document.getElementById('approve-comment')?.value || '';
        try {
          const response = await fetch(`${API_BASE}/contracts/${id}/approve`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comment })
          });
          const result = await response.json();
          
          if (result.success) {
            message.success(result.message);
            loadContract();
            loadApprovalHistory();
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
  const handleReject = () => {
    setRejectVisible(true);
  };

  // 确认拒绝
  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      message.error('请填写拒绝原因');
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/contracts/${id}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ comment: rejectReason })
      });
      const result = await response.json();
      
      if (result.success) {
        message.success(result.message);
        setRejectVisible(false);
        setRejectReason('');
        loadContract();
        loadApprovalHistory();
      } else {
        message.error(result.message);
      }
    } catch (error) {
      console.error('拒绝失败:', error);
      message.error('拒绝失败');
    }
  };

  // 检查用户是否可以审批
  const canApprove = () => {
    if (!contract || contract.status !== 'pending') return false;
    const currentApprover = contract.current_approver;
    
    if (userRoles.includes('GM')) return true;
    if (currentApprover === 'FINANCE' && userRoles.includes('FINANCE')) return true;
    if (currentApprover === 'LEGAL' && userRoles.includes('LEGAL')) return true;
    if (currentApprover === 'BUDGETER' && userRoles.includes('BUDGETER')) return true;
    
    return false;
  };

  // 获取审批进度步骤
  const getApprovalSteps = () => {
    if (!contract) return { steps: [], current: 0 };
    
    const steps = [
      { title: '提交申请', description: '采购员创建' },
      { title: '财务审批', description: APPROVER_MAP['FINANCE'] },
      { title: '法务审批', description: APPROVER_MAP['LEGAL'] },
      { title: '总经理审批', description: APPROVER_MAP['GM'] },
      { title: '审批完成', description: '' }
    ];
    
    let current = 0;
    if (contract.status === 'pending') {
      if (contract.current_approver === 'FINANCE') current = 1;
      else if (contract.current_approver === 'LEGAL') current = 2;
      else if (contract.current_approver === 'GM') current = 3;
    } else if (contract.status === 'finance_approved') {
      current = 2;
    } else if (contract.status === 'legal_approved') {
      current = 3;
    } else if (contract.status === 'approved') {
      current = 4;
    } else if (contract.status === 'rejected') {
      current = -1;
    }
    
    return { steps, current };
  };

  // 价格预警表格列
  const warningColumns = [
    {
      title: '材料名称',
      dataIndex: 'material_name',
      key: 'material_name',
      width: 150
    },
    {
      title: '规格',
      dataIndex: 'specification',
      key: 'specification',
      width: 100
    },
    {
      title: '实际单价',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      render: (val) => `¥${val}`
    },
    {
      title: '基准价',
      dataIndex: 'base_price',
      key: 'base_price',
      width: 100,
      render: (val) => `¥${val}`
    },
    {
      title: '超出比例',
      dataIndex: 'overage_percent',
      key: 'overage_percent',
      width: 100,
      render: (val) => (
        <Tag color={val >= 20 ? 'red' : val >= 10 ? 'orange' : 'blue'}>
          {val}%
        </Tag>
      )
    },
    {
      title: '预警级别',
      dataIndex: 'warning_level',
      key: 'warning_level',
      width: 100,
      render: (level) => (
        <Tag color={level === 'danger' ? 'red' : 'orange'}>
          {level === 'danger' ? '严重' : '警告'}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => (
        <Tag color={status === 'handled' ? 'green' : 'orange'}>
          {status === 'handled' ? '已处理' : '待处理'}
        </Tag>
      )
    }
  ];

  // 超量记录表格列
  const overageColumns = [
    {
      title: '物料名称',
      dataIndex: 'item_name',
      key: 'item_name',
      width: 150
    },
    {
      title: '原数量',
      dataIndex: 'original_quantity',
      key: 'original_quantity',
      width: 100
    },
    {
      title: '实际数量',
      dataIndex: 'actual_quantity',
      key: 'actual_quantity',
      width: 100
    },
    {
      title: '超量数量',
      dataIndex: 'overage_quantity',
      key: 'overage_quantity',
      width: 100,
      render: (val) => <Tag color="orange">{val}</Tag>
    },
    {
      title: '超量金额',
      dataIndex: 'overage_amount',
      key: 'overage_amount',
      width: 120,
      render: (val) => <span style={{ color: '#f5222d' }}>¥{val}</span>
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => (
        <Tag color={status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'orange'}>
          {status === 'approved' ? '已批准' : status === 'rejected' ? '已拒绝' : '待审批'}
        </Tag>
      )
    }
  ];

  const { steps, current } = getApprovalSteps();

  if (!contract) {
    return (
      <Card loading={loading}>
        <div style={{ textAlign: 'center', padding: '50px' }}>
          加载中...
        </div>
      </Card>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>支出合同详情</span>
            <Tag color={STATUS_MAP[contract.status]?.color || 'default'}>
              {STATUS_MAP[contract.status]?.text || contract.status}
            </Tag>
            {priceWarnings.length > 0 && (
              <Badge count={priceWarnings.filter(w => w.status === 'pending').length}>
                <Button size="small" icon={<WarningOutlined />} danger>
                  价格预警
                </Button>
              </Badge>
            )}
            {overageRecords.length > 0 && (
              <Badge count={overageRecords.filter(r => r.status === 'pending').length}>
                <Button size="small" icon={<ShoppingOutlined />} type="primary" ghost>
                  超量申请
                </Button>
              </Badge>
            )}
          </Space>
        }
        extra={
          <Space>
            {contract.status === 'draft' && (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSubmit}
              >
                提交审批
              </Button>
            )}
            {canApprove() && (
              <>
                <Button danger onClick={handleReject}>
                  拒绝
                </Button>
                <Button type="primary" onClick={handleApprove}>
                  通过
                </Button>
              </>
            )}
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contract/list')}>
              返回列表
            </Button>
          </Space>
        }
      >
        <Tabs defaultActiveKey="basic">
          {/* 基本信息 */}
          <TabPane tab="基本信息" key="basic">
            {/* 审批进度 */}
            {contract.status !== 'draft' && (
              <Card size="small" title="审批进度" style={{ marginBottom: 16 }}>
                {current >= 0 ? (
                  <Steps current={current} size="small">
                    {steps.map((step, index) => (
                      <Steps.Step
                        key={index}
                        title={step.title}
                        description={step.description}
                      />
                    ))}
                  </Steps>
                ) : (
                  <Tag color="red">已拒绝</Tag>
                )}
              </Card>
            )}

            <Descriptions title="合同信息" bordered column={2} size="small">
              <Descriptions.Item label="合同编号">{contract.contract_no}</Descriptions.Item>
              <Descriptions.Item label="合同名称">{contract.name}</Descriptions.Item>
              <Descriptions.Item label="合同类型">
                <Tag color="orange">支出合同</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[contract.status]?.color}>
                  {STATUS_MAP[contract.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="甲方">{contract.party_a}</Descriptions.Item>
              <Descriptions.Item label="乙方">{contract.party_b}</Descriptions.Item>
              <Descriptions.Item label="合同金额">
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#1890ff' }}>
                  ¥{parseFloat(contract.amount || 0).toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="关联项目">
                {contract.project_name || '未关联'}
              </Descriptions.Item>
              <Descriptions.Item label="签订日期">{contract.sign_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="有效期">
                {contract.start_date && contract.end_date
                  ? `${contract.start_date} 至 ${contract.end_date}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建人">{contract.creator_name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(contract.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {contract.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            {/* 合同检查结果 */}
            {checkResult && (
              <>
                <Divider>合同检查</Divider>
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="基本信息"
                      value={checkResult.checks.basic_info.passed ? '完整' : '不完整'}
                      valueStyle={{ color: checkResult.checks.basic_info.passed ? '#3f8600' : '#cf1322' }}
                      prefix={checkResult.checks.basic_info.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="项目关联"
                      value={checkResult.checks.project.passed ? '已关联' : '未关联'}
                      valueStyle={{ color: checkResult.checks.project.passed ? '#3f8600' : '#cf1322' }}
                      prefix={checkResult.checks.project.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="审批状态"
                      value={checkResult.checks.approval.passed ? '正常' : '异常'}
                      valueStyle={{ color: checkResult.checks.approval.passed ? '#3f8600' : '#cf1322' }}
                      prefix={checkResult.checks.approval.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="合同金额"
                      value={checkResult.checks.amount.passed ? '有效' : '无效'}
                      valueStyle={{ color: checkResult.checks.amount.passed ? '#3f8600' : '#cf1322' }}
                      prefix={checkResult.checks.amount.passed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    />
                  </Col>
                </Row>
                {checkResult.issues.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message="存在问题"
                    description={
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {checkResult.issues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    }
                    style={{ marginTop: 16 }}
                  />
                )}
              </>
            )}
          </TabPane>

          {/* 超量校验 */}
          <TabPane 
            tab={
              <Badge count={overageRecords.filter(r => r.status === 'pending').length} offset={[10, 0]}>
                超量校验
              </Badge>
            } 
            key="overcheck"
          >
            {overageRecords.length > 0 ? (
              <>
                <Alert
                  message="超量采购提示"
                  description="以下物料超出项目采购清单数量，需要预算员审批"
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Table
                  columns={overageColumns}
                  dataSource={overageRecords}
                  rowKey="id"
                  pagination={false}
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <CheckCircleOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
                <p style={{ marginTop: '16px' }}>无超量采购记录</p>
              </div>
            )}
          </TabPane>

          {/* 价格预警 */}
          <TabPane 
            tab={
              <Badge count={priceWarnings.filter(w => w.status === 'pending').length} offset={[10, 0]}>
                价格预警
              </Badge>
            } 
            key="price-warnings"
          >
            {priceWarnings.length > 0 ? (
              <>
                <Alert
                  message="价格预警提示"
                  description="以下物料单价超出基准价，请注意审核"
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Table
                  columns={warningColumns}
                  dataSource={priceWarnings}
                  rowKey="id"
                  pagination={false}
                />
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <CheckCircleOutlined style={{ fontSize: '48px', color: '#52c41a' }} />
                <p style={{ marginTop: '16px' }}>无价格预警</p>
              </div>
            )}
          </TabPane>

          {/* 审批历史 */}
          <TabPane 
            tab={
              <Space>
                <HistoryOutlined />
                审批历史
              </Space>
            } 
            key="history"
          >
            {approvalHistory.length > 0 ? (
              <Timeline
                items={approvalHistory.map(item => ({
                  color: item.status === 'approved' ? 'green' : item.status === 'rejected' ? 'red' : 'gray',
                  children: (
                    <div>
                      <div>
                        <strong>第 {item.step} 步：{APPROVER_MAP[item.role] || item.role}</strong>
                        <Tag 
                          color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'default'}
                          style={{ marginLeft: 8 }}
                        >
                          {item.status === 'approved' ? '已通过' : item.status === 'rejected' ? '已拒绝' : '待审批'}
                        </Tag>
                      </div>
                      {item.approver_name && (
                        <div style={{ color: '#666' }}>审批人：{item.approver_name}</div>
                      )}
                      {item.comment && (
                        <div style={{ color: '#666' }}>意见：{item.comment}</div>
                      )}
                      {item.approved_at && (
                        <div style={{ color: '#999', fontSize: '12px' }}>
                          {new Date(item.approved_at).toLocaleString('zh-CN')}
                        </div>
                      )}
                    </div>
                  )
                }))}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                暂无审批历史
              </div>
            )}
          </TabPane>
        </Tabs>
      </Card>

      {/* 拒绝原因弹窗 */}
      <Modal
        title="审批拒绝"
        open={rejectVisible}
        onCancel={() => {
          setRejectVisible(false);
          setRejectReason('');
        }}
        onOk={confirmReject}
        okText="确认拒绝"
        okButtonProps={{ danger: true }}
      >
        <Alert
          message="请填写拒绝原因"
          type="warning"
          style={{ marginBottom: 16 }}
        />
        <TextArea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="请输入拒绝原因（必填）"
          rows={4}
        />
      </Modal>
    </div>
  );
}

export default ExpenseContractDetail;
