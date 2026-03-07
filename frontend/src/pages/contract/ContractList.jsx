import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  message,
  Modal,
  Descriptions,
  Divider,
  Steps,
  Timeline,
  Badge,
  Tooltip,
  Alert
} from 'antd';
import {
  FileTextOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  WarningOutlined,
  AuditOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import OvercheckModal from './OvercheckModal';

const { Option } = Select;
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

// 超量校验状态映射
const OVERCHECK_STATUS_MAP = {
  none: { text: '无需校验', color: 'default' },
  pending: { text: '待超量审批', color: 'orange' },
  approved: { text: '超量已审', color: 'green' },
  rejected: { text: '超量已拒', color: 'red' }
};

// 审批节点映射
const APPROVER_MAP = {
  FINANCE: '财务',
  LEGAL: '法务',
  GM: '总经理',
  BUDGET: '预算员'
};

/**
 * 合同列表页面
 * Task 30: 支出合同超量校验
 */
function ContractList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    keyword: ''
  });
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentContract, setCurrentContract] = useState(null);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [approvalRecords, setApprovalRecords] = useState([]);
  const [userRoles, setUserRoles] = useState([]);
  const [overcheckModalVisible, setOvercheckModalVisible] = useState(false);
  const [overcheckContract, setOvercheckContract] = useState(null);

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

  // 加载合同列表
  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.type) params.append('type', filters.type);
      if (filters.status) params.append('status', filters.status);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/contracts?${params}`, {
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
      console.error('加载合同列表失败:', error);
      message.error('加载合同列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  // 加载审批历史
  const loadApprovalHistory = async (contractId) => {
    try {
      // 获取审批记录（包括超量校验）
      const recordsResponse = await fetch(`${API_BASE}/contracts/${contractId}/records`, {
        headers: getAuthHeaders()
      });
      const recordsResult = await recordsResponse.json();
      
      if (recordsResult.success) {
        setApprovalRecords(recordsResult.data.records || []);
        setApprovalHistory(recordsResult.data.history || []);
      }
    } catch (error) {
      console.error('加载审批历史失败:', error);
    }
  };

  // 查看合同详情
  const handleViewDetail = async (record) => {
    setCurrentContract(record);
    setDetailVisible(true);
    await loadApprovalHistory(record.id);
  };

  // 提交审批
  const handleSubmit = async (record) => {
    Modal.confirm({
      title: '确认提交',
      content: `确定要提交合同 "${record.name}" 进行审批吗？`,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/contracts/${record.id}/submit`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          const result = await response.json();
          
          if (result.success) {
            message.success(result.message);
            loadContracts();
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
  const handleApprove = (record) => {
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
        const comment = document.getElementById('approve-comment').value;
        try {
          const response = await fetch(`${API_BASE}/contracts/${record.id}/approve`, {
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
      title: '审批拒绝',
      content: (
        <div>
          <p style={{ color: '#ff4d4f' }}>确定要拒绝此合同吗？</p>
          <TextArea
            id="reject-reason"
            placeholder="请填写拒绝原因（必填）"
            rows={3}
            required
          />
        </div>
      ),
      onOk: async () => {
        const reason = document.getElementById('reject-reason').value;
        if (!reason.trim()) {
          message.error('请填写拒绝原因');
          return Promise.reject();
        }
        
        try {
          const response = await fetch(`${API_BASE}/contracts/${record.id}/reject`, {
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

  // 检查用户是否可以审批
  const canApprove = (record) => {
    if (record.status !== 'pending') return false;
    const currentApprover = record.current_approver;
    
    // 如果是超量校验状态，需要先完成超量校验
    if (record.overcheck_status === 'pending') return false;
    
    // 检查用户是否有对应角色
    if (userRoles.includes('GM')) return true;
    if (currentApprover === 'FINANCE' && userRoles.includes('FINANCE')) return true;
    if (currentApprover === 'LEGAL' && userRoles.includes('LEGAL')) return true;
    
    return false;
  };

  // 打开超量校验弹窗
  const handleOvercheck = (record) => {
    setOvercheckContract(record);
    setOvercheckModalVisible(true);
  };

  // 超量校验成功回调
  const handleOvercheckSuccess = () => {
    loadContracts();
  };

  // 跳转到超量校验审批列表
  const goToOvercheckApproval = () => {
    navigate('/contract/overcheck-approval');
  };

  // 获取审批进度步骤
  const getApprovalSteps = () => {
    if (!currentContract) return { steps: [], current: 0 };

    // 判断是否需要超量校验步骤
    const needOvercheck = currentContract.overcheck_status && currentContract.overcheck_status !== 'none';
    
    const steps = [
      { title: '提交申请', description: '采购员创建' },
    ];

    // 如果需要超量校验，添加预算员审批步骤
    if (needOvercheck) {
      let overcheckStatus = 'wait';
      if (currentContract.overcheck_status === 'approved') {
        overcheckStatus = 'finish';
      } else if (currentContract.overcheck_status === 'pending') {
        overcheckStatus = 'process';
      } else if (currentContract.overcheck_status === 'rejected') {
        overcheckStatus = 'error';
      }
      steps.push({ 
        title: '超量校验', 
        description: '预算员审批', 
        status: overcheckStatus
      });
    }

    // 添加常规审批步骤
    steps.push({ title: '财务审批', description: APPROVER_MAP['FINANCE'] });
    steps.push({ title: '法务审批', description: APPROVER_MAP['LEGAL'] });
    steps.push({ title: '总经理审批', description: APPROVER_MAP['GM'] });
    steps.push({ title: '审批完成', description: '' });

    // 计算当前步骤
    let current = 0;
    const overcheckOffset = needOvercheck ? 1 : 0;
    
    if (currentContract.overcheck_status === 'pending') {
      current = 1;
    } else if (currentContract.status === 'pending') {
      if (currentContract.current_approver === 'FINANCE') {
        current = 1 + overcheckOffset;
      } else if (currentContract.current_approver === 'LEGAL') {
        current = 2 + overcheckOffset;
      } else if (currentContract.current_approver === 'GM') {
        current = 3 + overcheckOffset;
      }
    } else if (currentContract.status === 'finance_approved') {
      current = 2 + overcheckOffset;
    } else if (currentContract.status === 'legal_approved') {
      current = 3 + overcheckOffset;
    } else if (currentContract.status === 'approved') {
      current = steps.length - 1;
    } else if (currentContract.status === 'rejected') {
      current = -1;
    }

    // 更新步骤状态
    steps.forEach((step, index) => {
      if (!step.status) {
        if (index < current) {
          step.status = 'finish';
        } else if (index === current && current >= 0) {
          step.status = 'process';
        } else {
          step.status = 'wait';
        }
      }
    });

    return { steps, current };
  };

  // 表格列定义
  const columns = [
    {
      title: '合同编号',
      dataIndex: 'contract_no',
      key: 'contract_no',
      width: 150,
      fixed: 'left',
      render: (text, record) => (
        <Space>
          <FileTextOutlined />
          <span style={{ fontWeight: 500 }}>{text}</span>
          {record.overcheck_status === 'pending' && (
            <Tooltip title="待超量校验审批">
              <WarningOutlined style={{ color: '#faad14' }} />
            </Tooltip>
          )}
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
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (type) => (
        <Tag color={type === 'income' ? 'green' : 'orange'}>
          {type === 'income' ? '收入' : '支出'}
        </Tag>
      )
    },
    {
      title: '甲方',
      dataIndex: 'party_a',
      key: 'party_a',
      width: 150,
      ellipsis: true
    },
    {
      title: '乙方',
      dataIndex: 'party_b',
      key: 'party_b',
      width: 150,
      ellipsis: true
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (amount) => `¥${parseFloat(amount || 0).toLocaleString()}`
    },
    {
      title: '合同状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusInfo = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
      }
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
      title: '当前审批',
      dataIndex: 'current_approver',
      key: 'current_approver',
      width: 100,
      render: (approver) => approver ? APPROVER_MAP[approver] : '-'
    },
    {
      title: '创建人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 100
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time) => new Date(time).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 250,
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
          {record.status === 'draft' && (
            <Button
              type="link"
              size="small"
              icon={<SendOutlined />}
              onClick={() => handleSubmit(record)}
            >
              提交
            </Button>
          )}
          {record.type === 'expense' && (!record.overcheck_status || record.overcheck_status === 'none') && (
            <Button
              type="link"
              size="small"
              icon={<AuditOutlined />}
              onClick={() => handleOvercheck(record)}
            >
              超量校验
            </Button>
          )}
        </Space>
      )
    }
  ];

  const { steps, current } = getApprovalSteps();

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <FileTextOutlined />
            <span>合同列表</span>
          </Space>
        }
        extra={
          <Space>
            <Input
              placeholder="搜索合同名称/编号"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              style={{ width: 200 }}
              onPressEnter={loadContracts}
            />
            <Select
              placeholder="合同类型"
              value={filters.type}
              onChange={(value) => setFilters({ ...filters, type: value })}
              style={{ width: 120 }}
              allowClear
            >
              <Option value="income">收入合同</Option>
              <Option value="expense">支出合同</Option>
            </Select>
            <Select
              placeholder="状态"
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              style={{ width: 120 }}
              allowClear
            >
              {Object.entries(STATUS_MAP).map(([key, value]) => (
                <Option key={key} value={key}>{value.text}</Option>
              ))}
            </Select>
            <Button type="primary" onClick={loadContracts}>
              查询
            </Button>
            {(userRoles.includes('BUDGET') || userRoles.includes('GM')) && (
              <Button 
                icon={<AuditOutlined />} 
                onClick={goToOvercheckApproval}
              >
                超量校验审批
              </Button>
            )}
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={contracts}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
          scroll={{ x: 1600 }}
        />
      </Card>

      {/* 合同详情模态框 */}
      <Modal
        title="合同详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          currentContract && currentContract.type === 'expense' && 
          (!currentContract.overcheck_status || currentContract.overcheck_status === 'none') && (
            <Button 
              key="overcheck" 
              icon={<AuditOutlined />}
              onClick={() => {
                setDetailVisible(false);
                handleOvercheck(currentContract);
              }}
            >
              超量校验申请
            </Button>
          ),
          currentContract && currentContract.status === 'pending' && 
          currentContract.overcheck_status !== 'pending' &&
          canApprove(currentContract) && (
            <Button key="reject" danger onClick={() => handleReject(currentContract)}>
              拒绝
            </Button>
          ),
          currentContract && currentContract.status === 'pending' && 
          currentContract.overcheck_status !== 'pending' &&
          canApprove(currentContract) && (
            <Button key="approve" type="primary" onClick={() => handleApprove(currentContract)}>
              通过
            </Button>
          )
        ]}
      >
        {currentContract && (
          <>
            {/* 审批进度 */}
            {currentContract.status !== 'draft' && (
              <Card size="small" title="审批进度" style={{ marginBottom: 16 }}>
                {current >= 0 ? (
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
                ) : (
                  <Tag color="red">已拒绝</Tag>
                )}
              </Card>
            )}

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
            <Descriptions title="基本信息" bordered column={2} size="small">
              <Descriptions.Item label="合同编号">{currentContract.contract_no}</Descriptions.Item>
              <Descriptions.Item label="合同名称">{currentContract.name}</Descriptions.Item>
              <Descriptions.Item label="合同类型">
                <Tag color={currentContract.type === 'income' ? 'green' : 'orange'}>
                  {currentContract.type === 'income' ? '收入合同' : '支出合同'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_MAP[currentContract.status]?.color}>
                  {STATUS_MAP[currentContract.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="超量状态">
                <Badge 
                  status={OVERCHECK_STATUS_MAP[currentContract.overcheck_status]?.color === 'green' ? 'success' : 
                          OVERCHECK_STATUS_MAP[currentContract.overcheck_status]?.color === 'orange' ? 'warning' : 'default'} 
                  text={OVERCHECK_STATUS_MAP[currentContract.overcheck_status]?.text || '无需校验'} 
                />
              </Descriptions.Item>
              <Descriptions.Item label="当前审批">
                {currentContract.current_approver ? APPROVER_MAP[currentContract.current_approver] : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="甲方">{currentContract.party_a}</Descriptions.Item>
              <Descriptions.Item label="乙方">{currentContract.party_b}</Descriptions.Item>
              <Descriptions.Item label="合同金额">
                ¥{parseFloat(currentContract.amount || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="关联项目">
                {currentContract.project_name || '未关联'}
              </Descriptions.Item>
              <Descriptions.Item label="签订日期">{currentContract.sign_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="有效期">
                {currentContract.start_date && currentContract.end_date
                  ? `${currentContract.start_date} 至 ${currentContract.end_date}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建人">{currentContract.creator_name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {new Date(currentContract.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>
                {currentContract.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            {/* 审批记录（包括超量校验） */}
            {approvalRecords.length > 0 && (
              <>
                <Divider>审批记录</Divider>
                <Timeline
                  items={approvalRecords.map(item => ({
                    color: item.action === 'approve' ? 'green' : item.action === 'reject' ? 'red' : 'gray',
                    children: (
                      <div>
                        <div>
                          <strong>{item.step_name}</strong>
                          <Tag 
                            color={item.action === 'approve' ? 'success' : item.action === 'reject' ? 'error' : 'default'}
                            style={{ marginLeft: 8 }}
                          >
                            {item.action === 'approve' ? '已通过' : item.action === 'reject' ? '已拒绝' : '待审批'}
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

            {/* 合同审批历史 */}
            {approvalHistory.length > 0 && (
              <>
                <Divider>合同审批历史</Divider>
                <Timeline
                  items={approvalHistory.map(item => ({
                    color: item.status === 'approved' ? 'green' : item.status === 'rejected' ? 'red' : 'gray',
                    children: (
                      <div>
                        <div>
                          <strong>第 {item.step} 步：{APPROVER_MAP[item.role]}</strong>
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
              </>
            )}
          </>
        )}
      </Modal>

      {/* 超量校验弹窗 */}
      <OvercheckModal
        visible={overcheckModalVisible}
        contract={overcheckContract}
        onClose={() => {
          setOvercheckModalVisible(false);
          setOvercheckContract(null);
        }}
        onSuccess={handleOvercheckSuccess}
      />
    </div>
  );
}

export default ContractList;
