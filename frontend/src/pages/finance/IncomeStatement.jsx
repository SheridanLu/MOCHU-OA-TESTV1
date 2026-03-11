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
  Statistic,
  Row,
  Col,
  Divider,
  DatePicker,
  Form,
  InputNumber,
  Tooltip,
  Progress,
  Timeline,
  Alert
} from 'antd';
import {
  FileTextOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  PlusOutlined,
  DeleteOutlined,
  PercentageOutlined,
  LineChartOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

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

// 对账单状态映射
const STATUS_MAP = {
  draft: { text: '草稿', color: 'default' },
  confirmed: { text: '已确认', color: 'green' }
};

// 进度状态映射
const PROGRESS_STATUS_MAP = {
  pending: { text: '待确认', color: 'orange' },
  confirmed: { text: '已确认', color: 'green' }
};

/**
 * 收入对账单列表页面
 * Task 45: 实现收入对账单每月25日自动生成功能
 * Task 46: 实现收入对账单 - 产值确认
 */
function IncomeStatement() {
  const [loading, setLoading] = useState(false);
  const [statements, setStatements] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    status: '',
    yearMonth: '',
    projectId: ''
  });
  const [projects, setProjects] = useState([]);
  
  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentStatement, setCurrentStatement] = useState(null);
  
  // 生成对账单弹窗
  const [generateVisible, setGenerateVisible] = useState(false);
  const [generateForm] = Form.useForm();

  // Task 46: 进度管理相关状态
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressForm] = Form.useForm();
  const [progressHistory, setProgressHistory] = useState([]);
  const [progressHistoryVisible, setProgressHistoryVisible] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [editingStatement, setEditingStatement] = useState(null);

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

  // 加载对账单列表
  const loadStatements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.yearMonth) params.append('yearMonth', filters.yearMonth);
      if (filters.projectId) params.append('projectId', filters.projectId);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/income-statements?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setStatements(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载对账单列表失败:', error);
      message.error('加载对账单列表失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.yearMonth, filters.projectId, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadStatements();
  }, [loadStatements]);

  // 查看详情
  const handleViewDetail = async (record) => {
    try {
      const response = await fetch(`${API_BASE}/income-statements/${record.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setCurrentStatement(result.data);
        setDetailVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      message.error('获取详情失败');
    }
  };

  // 生成对账单
  const handleGenerate = async (values) => {
    try {
      const body = { projectId: values.projectId };
      if (values.period && values.period.length === 2) {
        body.periodStart = values.period[0].format('YYYY-MM-DD');
        body.periodEnd = values.period[1].format('YYYY-MM-DD');
      }

      const response = await fetch(`${API_BASE}/income-statements/generate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('对账单生成成功');
        setGenerateVisible(false);
        generateForm.resetFields();
        loadStatements();
      } else {
        message.error(result.message || '生成失败');
      }
    } catch (error) {
      console.error('生成对账单失败:', error);
      message.error('生成对账单失败');
    }
  };

  // 为所有项目生成
  const handleGenerateAll = async () => {
    Modal.confirm({
      title: '批量生成确认',
      content: '确定要为所有活跃项目生成本月对账单吗？',
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/income-statements/generate-all`, {
            method: 'POST',
            headers: getAuthHeaders()
          });
          const result = await response.json();
          
          if (result.success) {
            message.success(result.message);
            loadStatements();
          } else {
            message.error(result.message || '批量生成失败');
          }
        } catch (error) {
          console.error('批量生成失败:', error);
          message.error('批量生成失败');
        }
      }
    });
  };

  // 删除对账单
  const handleDelete = (record) => {
    Modal.confirm({
      title: '删除对账单',
      content: `确定要删除对账单 "${record.statement_no}" 吗？`,
      okType: 'danger',
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/income-statements/${record.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
          });
          const result = await response.json();
          
          if (result.success) {
            message.success('删除成功');
            loadStatements();
          } else {
            message.error(result.message || '删除失败');
          }
        } catch (error) {
          console.error('删除对账单失败:', error);
          message.error('删除对账单失败');
        }
      }
    });
  };

  // ==================== Task 46: 进度管理功能 ====================

  // 打开进度管理弹窗
  const handleOpenProgress = (record) => {
    setEditingStatement(record);
    progressForm.setFieldsValue({
      progressRate: record.progress_rate || 0,
      remark: ''
    });
    setProgressVisible(true);
  };

  // 计算当期产值和累计产值预览
  const calculatePreview = (progressRate) => {
    if (!editingStatement) return { progressAmount: 0, accumulatedAmount: 0 };
    
    const contractAmount = parseFloat(editingStatement.contract_amount) || 0;
    const accumulatedAmount = Math.round(contractAmount * progressRate / 100 * 100) / 100;
    
    return {
      progressAmount: accumulatedAmount,
      accumulatedAmount
    };
  };

  // 更新进度
  const handleUpdateProgress = async (values) => {
    setProgressLoading(true);
    try {
      const response = await fetch(`${API_BASE}/income-statements/${editingStatement.id}/progress`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          progressRate: values.progressRate,
          remark: values.remark
        })
      });
      const result = await response.json();
      
      if (result.success) {
        message.success('进度更新成功');
        setProgressVisible(false);
        progressForm.resetFields();
        setEditingStatement(null);
        loadStatements();
      } else {
        message.error(result.message || '更新失败');
      }
    } catch (error) {
      console.error('更新进度失败:', error);
      message.error('更新进度失败');
    } finally {
      setProgressLoading(false);
    }
  };

  // 查看进度历史
  const handleViewProgressHistory = async (record) => {
    setEditingStatement(record);
    setProgressHistoryVisible(true);
    try {
      const response = await fetch(`${API_BASE}/income-statements/${record.id}/progress-history`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      
      if (result.success) {
        setProgressHistory(result.data || []);
      } else {
        message.error(result.message || '获取历史失败');
      }
    } catch (error) {
      console.error('获取进度历史失败:', error);
      message.error('获取进度历史失败');
    }
  };

  // 确认进度
  const handleConfirmProgress = (record) => {
    Modal.confirm({
      title: '确认进度',
      content: (
        <div>
          <p>确定要确认对账单 "{record.statement_no}" 的进度吗？</p>
          <p>当前进度: <strong>{parseFloat(record.progress_rate || 0).toFixed(2)}%</strong></p>
          <p>确认金额: <strong>¥{parseFloat(record.confirmed_amount || 0).toLocaleString()}</strong></p>
          <p style={{ color: '#ff4d4f' }}>确认后将不可修改！</p>
        </div>
      ),
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE}/income-statements/${record.id}/confirm-progress`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ comment: '进度确认' })
          });
          const result = await response.json();
          
          if (result.success) {
            message.success('进度确认成功');
            loadStatements();
          } else {
            message.error(result.message || '确认失败');
          }
        } catch (error) {
          console.error('确认进度失败:', error);
          message.error('确认进度失败');
        }
      }
    });
  };

  // 表格列定义
  const columns = [
    {
      title: '对账单编号',
      dataIndex: 'statement_no',
      key: 'statement_no',
      width: 150,
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 200,
      ellipsis: true
    },
    {
      title: '项目编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 120
    },
    {
      title: '期间',
      key: 'period',
      width: 180,
      render: (_, record) => `${record.period_start} ~ ${record.period_end}`
    },
    {
      title: '合同金额',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      width: 120,
      align: 'right',
      render: (val) => `¥${parseFloat(val || 0).toLocaleString()}`
    },
    {
      title: '进度比例',
      dataIndex: 'progress_rate',
      key: 'progress_rate',
      width: 140,
      align: 'center',
      render: (val) => {
        const rate = parseFloat(val || 0);
        let status = 'normal';
        if (rate >= 100) status = 'success';
        else if (rate >= 80) status = 'active';
        
        return (
          <div style={{ width: '100%' }}>
            <Progress 
              percent={rate} 
              size="small" 
              status={status}
              format={(percent) => `${percent.toFixed(1)}%`}
            />
          </div>
        );
      }
    },
    {
      title: '当期产值',
      dataIndex: 'progress_amount',
      key: 'progress_amount',
      width: 120,
      align: 'right',
      render: (val) => (
        <span style={{ color: '#1890ff' }}>
          ¥{parseFloat(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      title: '累计产值',
      dataIndex: 'accumulated_amount',
      key: 'accumulated_amount',
      width: 120,
      align: 'right',
      render: (val) => (
        <span style={{ color: '#52c41a', fontWeight: 500 }}>
          ¥{parseFloat(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      title: '差异',
      dataIndex: 'difference',
      key: 'difference',
      width: 100,
      align: 'right',
      render: (val) => {
        const diff = parseFloat(val || 0);
        const color = diff > 0 ? '#f5222d' : diff < 0 ? '#1890ff' : '#52c41a';
        return (
          <span style={{ color }}>
            {diff > 0 ? '+' : ''}{diff.toLocaleString()}
          </span>
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status) => {
        const config = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right',
      render: (_, record) => {
        const isDraft = record.status === 'draft';
        return (
          <Space size="small" wrap>
            <Tooltip title="查看详情">
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleViewDetail(record)}
              />
            </Tooltip>
            {isDraft && (
              <>
                <Tooltip title="进度管理">
                  <Button
                    type="link"
                    size="small"
                    icon={<LineChartOutlined />}
                    onClick={() => handleOpenProgress(record)}
                    style={{ color: '#1890ff' }}
                  />
                </Tooltip>
                <Tooltip title="进度历史">
                  <Button
                    type="link"
                    size="small"
                    icon={<HistoryOutlined />}
                    onClick={() => handleViewProgressHistory(record)}
                    style={{ color: '#722ed1' }}
                  />
                </Tooltip>
                <Tooltip title="确认进度">
                  <Button
                    type="link"
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleConfirmProgress(record)}
                    style={{ color: '#52c41a' }}
                  />
                </Tooltip>
                <Tooltip title="删除">
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(record)}
                  />
                </Tooltip>
              </>
            )}
            {!isDraft && (
              <Tooltip title="进度历史">
                <Button
                  type="link"
                  size="small"
                  icon={<HistoryOutlined />}
                  onClick={() => handleViewProgressHistory(record)}
                  style={{ color: '#722ed1' }}
                />
              </Tooltip>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: '8px' }} />
            收入对账单 - 产值确认
          </h2>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setGenerateVisible(true)}
            >
              生成对账单
            </Button>
            <Button
              icon={<SyncOutlined />}
              onClick={handleGenerateAll}
            >
              批量生成
            </Button>
          </Space>
        </div>

        {/* 筛选区域 */}
        <div style={{ marginBottom: '16px' }}>
          <Space wrap>
            <Select
              placeholder="选择项目"
              allowClear
              style={{ width: 200 }}
              value={filters.projectId || undefined}
              onChange={(val) => setFilters({ ...filters, projectId: val })}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>{p.name}</Option>
              ))}
            </Select>
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 120 }}
              value={filters.status || undefined}
              onChange={(val) => setFilters({ ...filters, status: val })}
            >
              <Option value="draft">草稿</Option>
              <Option value="confirmed">已确认</Option>
            </Select>
            <DatePicker.MonthPicker
              placeholder="选择月份"
              style={{ width: 150 }}
              onChange={(date) => setFilters({ 
                ...filters, 
                yearMonth: date ? date.format('YYYY-MM') : '' 
              })}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => {
                setPagination({ ...pagination, current: 1 });
                loadStatements();
              }}
            >
              查询
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={statements}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1800 }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize });
            }
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="对账单详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setCurrentStatement(null);
        }}
        footer={null}
        width={900}
      >
        {currentStatement && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="对账单编号" span={2}>
                <strong>{currentStatement.statement_no}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="项目名称">
                {currentStatement.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="项目编号">
                {currentStatement.project_no}
              </Descriptions.Item>
              <Descriptions.Item label="合同编号">
                {currentStatement.contract_no || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="合同名称">
                {currentStatement.contract_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="期间开始">
                {currentStatement.period_start}
              </Descriptions.Item>
              <Descriptions.Item label="期间结束">
                {currentStatement.period_end}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">进度与产值信息</Divider>
            
            <Row gutter={16}>
              <Col span={4}>
                <Statistic
                  title="合同金额"
                  value={currentStatement.contract_amount}
                  precision={2}
                  prefix="¥"
                />
              </Col>
              <Col span={4}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>进度比例</div>
                  <Progress 
                    type="circle" 
                    percent={parseFloat(currentStatement.progress_rate || 0)} 
                    size={80}
                    format={(percent) => `${percent.toFixed(1)}%`}
                  />
                </div>
              </Col>
              <Col span={4}>
                <Statistic
                  title="当期产值"
                  value={currentStatement.progress_amount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="累计产值"
                  value={currentStatement.accumulated_amount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="确认金额"
                  value={currentStatement.confirmed_amount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#722ed1' }}
                />
              </Col>
              <Col span={4}>
                <Statistic
                  title="差异"
                  value={Math.abs(parseFloat(currentStatement.difference || 0))}
                  precision={2}
                  prefix={parseFloat(currentStatement.difference || 0) >= 0 ? '+¥' : '-¥'}
                  valueStyle={{ 
                    color: parseFloat(currentStatement.difference || 0) > 0 ? '#cf1322' : 
                           parseFloat(currentStatement.difference || 0) < 0 ? '#1890ff' : '#3f8600'
                  }}
                />
              </Col>
            </Row>

            {currentStatement.details && currentStatement.details.length > 0 && (
              <>
                <Divider orientation="left">明细</Divider>
                <Table
                  dataSource={currentStatement.details}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '项目', dataIndex: 'item_name', key: 'item_name' },
                    { title: '说明', dataIndex: 'description', key: 'description' },
                    { 
                      title: '金额', 
                      dataIndex: 'amount', 
                      key: 'amount',
                      align: 'right',
                      render: (val) => `¥${parseFloat(val || 0).toLocaleString()}`
                    },
                    { 
                      title: '进度', 
                      dataIndex: 'progress_value', 
                      key: 'progress_value',
                      align: 'center',
                      render: (val) => `${parseFloat(val || 0).toFixed(2)}%`
                    }
                  ]}
                />
              </>
            )}

            {currentStatement.remark && (
              <>
                <Divider orientation="left">备注</Divider>
                <p>{currentStatement.remark}</p>
              </>
            )}

            <Divider />
            <Descriptions column={3} size="small">
              <Descriptions.Item label="创建人">
                {currentStatement.creator_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentStatement.created_at}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={currentStatement.status === 'confirmed' ? 'green' : 'default'}>
                  {currentStatement.status === 'confirmed' ? '已确认' : '草稿'}
                </Tag>
              </Descriptions.Item>
              {currentStatement.progress_confirmed_by && (
                <>
                  <Descriptions.Item label="进度确认人">
                    {currentStatement.progress_confirmed_by}
                  </Descriptions.Item>
                  <Descriptions.Item label="进度确认时间">
                    {currentStatement.progress_confirmed_at}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>

      {/* 生成对账单弹窗 */}
      <Modal
        title="生成对账单"
        open={generateVisible}
        onCancel={() => {
          setGenerateVisible(false);
          generateForm.resetFields();
        }}
        onOk={() => generateForm.submit()}
        okText="生成"
        cancelText="取消"
      >
        <Form
          form={generateForm}
          layout="vertical"
          onFinish={handleGenerate}
        >
          <Form.Item
            name="projectId"
            label="选择项目"
            rules={[{ required: true, message: '请选择项目' }]}
          >
            <Select
              placeholder="请选择项目"
              showSearch
              optionFilterProp="children"
            >
              {projects.filter(p => p.type === 'entity').map(p => (
                <Option key={p.id} value={p.id}>
                  {p.project_no} - {p.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="period"
            label="对账期间"
            extra="默认为上月"
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Task 46: 进度管理弹窗 */}
      <Modal
        title="进度管理 - 产值确认"
        open={progressVisible}
        onCancel={() => {
          setProgressVisible(false);
          progressForm.resetFields();
          setEditingStatement(null);
        }}
        footer={null}
        width={600}
      >
        {editingStatement && (
          <Form
            form={progressForm}
            layout="vertical"
            onFinish={handleUpdateProgress}
          >
            <Alert
              message="业务规则"
              description={
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>进度范围：0-100%</li>
                  <li>进度只能增加不能减少</li>
                  <li>产值不能超过合同金额</li>
                  <li>当期产值 = 进度百分比 × 合同金额</li>
                </ul>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="对账单编号">
                  <Input value={editingStatement.statement_no} disabled />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="合同金额">
                  <Input 
                    value={`¥${parseFloat(editingStatement.contract_amount || 0).toLocaleString()}`} 
                    disabled 
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="当前进度">
                  <Input 
                    value={`${parseFloat(editingStatement.progress_rate || 0).toFixed(2)}%`} 
                    disabled 
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="累计产值">
                  <Input 
                    value={`¥${parseFloat(editingStatement.accumulated_amount || 0).toLocaleString()}`} 
                    disabled 
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="progressRate"
              label="新进度百分比 (%)"
              rules={[
                { required: true, message: '请输入进度百分比' },
                { type: 'number', min: 0, max: 100, message: '进度必须在 0-100 之间' }
              ]}
              extra={`进度只能大于当前进度 ${parseFloat(editingStatement.progress_rate || 0).toFixed(2)}%`}
            >
              <InputNumber
                min={parseFloat(editingStatement.progress_rate || 0)}
                max={100}
                precision={2}
                style={{ width: '100%' }}
                prefix={<PercentageOutlined />}
              />
            </Form.Item>

            <Form.Item
              name="remark"
              label="备注"
            >
              <TextArea rows={3} placeholder="请输入备注说明（可选）" />
            </Form.Item>

            <Form.Item 
              shouldUpdate={(prevValues, currentValues) => prevValues.progressRate !== currentValues.progressRate}
            >
              {({ getFieldValue }) => {
                const progressRate = getFieldValue('progressRate') || 0;
                const preview = calculatePreview(progressRate);
                return (
                  <Card size="small" style={{ background: '#fafafa' }}>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Statistic
                          title="预计当期产值"
                          value={preview.progressAmount}
                          precision={2}
                          prefix="¥"
                          valueStyle={{ fontSize: 18 }}
                        />
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="预计累计产值"
                          value={preview.accumulatedAmount}
                          precision={2}
                          prefix="¥"
                          valueStyle={{ fontSize: 18, color: '#52c41a' }}
                        />
                      </Col>
                    </Row>
                  </Card>
                );
              }}
            </Form.Item>

            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => {
                  setProgressVisible(false);
                  progressForm.resetFields();
                  setEditingStatement(null);
                }}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit" loading={progressLoading}>
                  更新进度
                </Button>
              </Space>
            </div>
          </Form>
        )}
      </Modal>

      {/* Task 46: 进度历史弹窗 */}
      <Modal
        title="进度历史"
        open={progressHistoryVisible}
        onCancel={() => {
          setProgressHistoryVisible(false);
          setProgressHistory([]);
          setEditingStatement(null);
        }}
        footer={null}
        width={700}
      >
        {editingStatement && (
          <div>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="对账单编号">
                {editingStatement.statement_no}
              </Descriptions.Item>
              <Descriptions.Item label="项目名称">
                {editingStatement.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="合同金额">
                ¥{parseFloat(editingStatement.contract_amount || 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="当前进度">
                {parseFloat(editingStatement.progress_rate || 0).toFixed(2)}%
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">变更记录</Divider>

            {progressHistory.length > 0 ? (
              <Timeline
                items={progressHistory.map((item, index) => ({
                  color: index === 0 ? 'green' : 'blue',
                  children: (
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        进度: {parseFloat(item.progress_rate).toFixed(2)}%
                        <Tag color="blue" style={{ marginLeft: 8 }}>
                          当期产值: ¥{parseFloat(item.progress_amount || 0).toLocaleString()}
                        </Tag>
                        <Tag color="green" style={{ marginLeft: 4 }}>
                          累计产值: ¥{parseFloat(item.accumulated_amount || 0).toLocaleString()}
                        </Tag>
                      </div>
                      {item.remark && (
                        <div style={{ color: '#666', marginTop: 4 }}>{item.remark}</div>
                      )}
                      <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                        {item.creator_name || '系统'} · {dayjs(item.created_at).format('YYYY-MM-DD HH:mm:ss')}
                      </div>
                    </div>
                  )
                }))}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>
                暂无进度变更记录
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default IncomeStatement;
