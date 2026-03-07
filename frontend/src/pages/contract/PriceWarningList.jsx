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
  Tabs,
  Badge,
  Descriptions,
  Divider,
  Alert,
  Statistic,
  Row,
  Col
} from 'antd';
import {
  WarningOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  DollarOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Option } = Select;
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

/**
 * 价格预警列表页面
 * 
 * 功能：
 * - 显示所有价格预警
 * - 按模块分组（合同/采购）
 * - 处理价格预警
 */
function PriceWarningList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [groupedWarnings, setGroupedWarnings] = useState({ contract: [], purchase: [] });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    module: 'all',
    status: 'pending'
  });
  const [activeTab, setActiveTab] = useState('all');
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentWarning, setCurrentWarning] = useState(null);
  const [handleRemark, setHandleRemark] = useState('');

  // 加载价格预警列表
  const loadWarnings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('module', filters.module);
      params.append('status', filters.status);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/contracts/price-warnings?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setWarnings(result.data?.list || []);
        setGroupedWarnings(result.data?.grouped || { contract: [], purchase: [] });
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载价格预警失败:', error);
      message.error('加载价格预警失败');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadWarnings();
  }, [loadWarnings]);

  // 处理价格预警
  const handleWarning = (record) => {
    setCurrentWarning(record);
    setDetailVisible(true);
  };

  // 确认处理
  const confirmHandle = async () => {
    if (!currentWarning) return;
    
    try {
      const response = await fetch(`${API_BASE}/contracts/price-warnings/${currentWarning.id}/handle`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          remark: handleRemark,
          action: 'confirm'
        })
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('价格预警处理成功');
        setDetailVisible(false);
        setHandleRemark('');
        setCurrentWarning(null);
        loadWarnings();
      } else {
        message.error(result.message);
      }
    } catch (error) {
      console.error('处理价格预警失败:', error);
      message.error('处理价格预警失败');
    }
  };

  // Tab 切换
  const handleTabChange = (key) => {
    setActiveTab(key);
    setFilters({
      ...filters,
      module: key
    });
  };

  // 查看合同详情
  const viewContract = (contractId) => {
    navigate(`/contract/expense/${contractId}`);
  };

  // 表格列定义
  const columns = [
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
      render: (val) => <span style={{ color: '#ff4d4f' }}>¥{val}</span>
    },
    {
      title: '基准价',
      dataIndex: 'base_price',
      key: 'base_price',
      width: 100,
      render: (val) => <span>¥{val}</span>
    },
    {
      title: '超出比例',
      dataIndex: 'overage_percent',
      key: 'overage_percent',
      width: 100,
      render: (val) => (
        <Tag color={val >= 20 ? 'red' : val >= 10 ? 'orange' : 'blue'}>
          +{val}%
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
      title: '关联合同',
      dataIndex: 'contract_name',
      key: 'contract_name',
      width: 150,
      ellipsis: true,
      render: (text, record) => (
        <a onClick={() => viewContract(record.contract_id)}>
          {record.contract_no} - {text}
        </a>
      )
    },
    {
      title: '项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      ellipsis: true
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
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.status === 'pending' && (
            <Button
              type="link"
              size="small"
              onClick={() => handleWarning(record)}
            >
              处理
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => viewContract(record.contract_id)}
          >
            查看合同
          </Button>
        </Space>
      )
    }
  ];

  // 统计数据
  const pendingCount = warnings.filter(w => w.status === 'pending').length;
  const dangerCount = warnings.filter(w => w.warning_level === 'danger' && w.status === 'pending').length;
  const handledCount = warnings.filter(w => w.status === 'handled').length;

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title={
          <Space>
            <DollarOutlined />
            <span>价格预警管理</span>
          </Space>
        }
        extra={
          <Space>
            <Select
              placeholder="处理状态"
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              style={{ width: 120 }}
            >
              <Option value="all">全部</Option>
              <Option value="pending">待处理</Option>
              <Option value="handled">已处理</Option>
            </Select>
            <Button type="primary" onClick={loadWarnings}>
              刷新
            </Button>
          </Space>
        }
      >
        {/* 统计概览 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="预警总数"
                value={warnings.length}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="待处理"
                value={pendingCount}
                valueStyle={{ color: '#faad14' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="严重预警"
                value={dangerCount}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="已处理"
                value={handledCount}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>

        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane
            tab={
              <Badge count={warnings.length} offset={[10, 0]} showZero={false}>
                全部
              </Badge>
            }
            key="all"
          />
          <TabPane
            tab={
              <Badge count={groupedWarnings.contract.length} offset={[10, 0]} showZero={false}>
                合同模块
              </Badge>
            }
            key="contract"
          />
          <TabPane
            tab={
              <Badge count={groupedWarnings.purchase.length} offset={[10, 0]} showZero={false}>
                采购模块
              </Badge>
            }
            key="purchase"
          />
        </Tabs>

        {/* 警告提示 */}
        {dangerCount > 0 && (
          <Alert
            message={`存在 ${dangerCount} 条严重价格预警`}
            description="部分材料单价超出基准价 20% 以上，请及时审核处理。"
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
          />
        )}

        <Table
          columns={columns}
          dataSource={warnings}
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
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* 处理价格预警弹窗 */}
      <Modal
        title="处理价格预警"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setHandleRemark('');
          setCurrentWarning(null);
        }}
        onOk={confirmHandle}
        okText="确认处理"
      >
        {currentWarning && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="材料名称">{currentWarning.material_name}</Descriptions.Item>
              <Descriptions.Item label="规格">{currentWarning.specification || '-'}</Descriptions.Item>
              <Descriptions.Item label="实际单价">
                <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                  ¥{currentWarning.unit_price}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="基准价">¥{currentWarning.base_price}</Descriptions.Item>
              <Descriptions.Item label="超出比例">
                <Tag color={currentWarning.overage_percent >= 20 ? 'red' : 'orange'}>
                  +{currentWarning.overage_percent}%
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="预警级别">
                <Tag color={currentWarning.warning_level === 'danger' ? 'red' : 'orange'}>
                  {currentWarning.warning_level === 'danger' ? '严重' : '警告'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="关联合同" span={2}>
                <a onClick={() => viewContract(currentWarning.contract_id)}>
                  {currentWarning.contract_no} - {currentWarning.contract_name}
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="项目" span={2}>
                {currentWarning.project_name}
              </Descriptions.Item>
            </Descriptions>

            <Divider>处理备注</Divider>
            
            <TextArea
              value={handleRemark}
              onChange={(e) => setHandleRemark(e.target.value)}
              placeholder="请输入处理说明（可选）"
              rows={4}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

export default PriceWarningList;
