import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Select,
  message,
  Modal,
  Descriptions,
  Statistic,
  Row,
  Col,
  Divider,
  Form,
  Input,
  Tooltip,
  Progress,
  Alert,
  Tabs,
  Empty
} from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import {
  WarningOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  AlertOutlined,
  
  BarChartOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as echarts from 'echarts';

const { Option } = Select;
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

// 预警级别映射
const WARNING_LEVEL_MAP = {
  normal: { text: '正常', color: 'green', icon: <CheckCircleOutlined /> },
  warning: { text: '警告', color: 'orange', icon: <ExclamationCircleOutlined /> },
  severe: { text: '严重', color: 'red', icon: <AlertOutlined /> }
};

// 预警状态映射
const STATUS_MAP = {
  pending: { text: '待处理', color: 'orange' },
  handled: { text: '已处理', color: 'green' }
};

/**
 * 偏差预警页面
 * Task 56: 实现施工管理 - 偏差预警
 */
function DeviationWarning() {
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState({
    projectId: '',
    warningLevel: '',
    status: ''
  });
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    normalCount: 0,
    warningCount: 0,
    severeCount: 0,
    pendingCount: 0,
    handledCount: 0,
    avgDeviationRate: 0
  });

  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentWarning, setCurrentWarning] = useState(null);

  // 处理弹窗
  const [handleVisible, setHandleVisible] = useState(false);
  const [handleForm] = Form.useForm();
  const [handleLoading, setHandleLoading] = useState(false);

  // 偏差分析弹窗
  const [analysisVisible, setAnalysisVisible] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // 图表引用
  const chartRef = useState(null);

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/construction/projects/active`, {
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

  // 加载预警列表
  const loadWarnings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.projectId) params.append('projectId', filters.projectId);
      if (filters.warningLevel) params.append('warningLevel', filters.warningLevel);
      if (filters.status) params.append('status', filters.status);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`${API_BASE}/construction/warnings?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setWarnings(result.data || []);
        setPagination(prev => ({
          ...prev,
          total: result.pagination.total
        }));
      }
    } catch (error) {
      console.error('加载预警列表失败:', error);
      message.error('加载预警列表失败');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.projectId, filters.warningLevel, filters.status, pagination.current, pagination.pageSize]);

  // 加载统计数据
  const loadStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.projectId) params.append('projectId', filters.projectId);

      const response = await fetch(`${API_BASE}/construction/warnings/stats?${params}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setStats(result.data || {});
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }, [filters.projectId]);

  useEffect(() => {
    loadWarnings();
    loadStats();
  }, [loadWarnings, loadStats]);

  // 检查偏差
  const handleCheckDeviation = async () => {
    try {
      const body = filters.projectId 
        ? { projectId: filters.projectId }
        : {};

      const url = filters.projectId 
        ? `${API_BASE}/construction/warnings/check`
        : `${API_BASE}/construction/warnings/check-all`;

      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const result = await response.json();

      if (result.success) {
        message.success(result.message);
        loadWarnings();
        loadStats();
      } else {
        message.error(result.message || '检查失败');
      }
    } catch (error) {
      console.error('检查偏差失败:', error);
      message.error('检查偏差失败');
    }
  };

  // 查看详情
  const handleViewDetail = async (record) => {
    try {
      const response = await fetch(`${API_BASE}/construction/warnings/${record.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setCurrentWarning(result.data);
        setDetailVisible(true);
      }
    } catch (error) {
      console.error('获取详情失败:', error);
      message.error('获取详情失败');
    }
  };

  // 打开处理弹窗
  const handleOpenHandle = (record) => {
    setCurrentWarning(record);
    handleForm.setFieldsValue({
      handleRemark: ''
    });
    setHandleVisible(true);
  };

  // 处理预警
  const handleWarningSubmit = async (values) => {
    setHandleLoading(true);
    try {
      const response = await fetch(`${API_BASE}/construction/warnings/${currentWarning.id}/handle`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          handleRemark: values.handleRemark
        })
      });
      const result = await response.json();

      if (result.success) {
        message.success('预警处理成功');
        setHandleVisible(false);
        handleForm.resetFields();
        setCurrentWarning(null);
        loadWarnings();
        loadStats();
      } else {
        message.error(result.message || '处理失败');
      }
    } catch (error) {
      console.error('处理预警失败:', error);
      message.error('处理预警失败');
    } finally {
      setHandleLoading(false);
    }
  };

  // 查看偏差分析
  const handleViewAnalysis = async (projectId) => {
    setSelectedProjectId(projectId);
    setAnalysisVisible(true);
    try {
      const response = await fetch(`${API_BASE}/construction/warnings/analysis/${projectId}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setAnalysisData(result.data);
        // 延迟渲染图表
        setTimeout(() => {
          renderChart(result.data);
        }, 100);
      } else {
        message.error(result.message || '获取分析失败');
      }
    } catch (error) {
      console.error('获取偏差分析失败:', error);
      message.error('获取偏差分析失败');
    }
  };

  // 渲染图表
  const renderChart = (data) => {
    const chartDom = document.getElementById('deviation-chart');
    if (!chartDom || !data) return;

    const myChart = echarts.init(chartDom);

    const option = {
      title: {
        text: '里程碑进度偏差分析',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: {
        data: ['计划进度', '实际进度', '偏差率'],
        top: 30
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.analysis.map(a => a.milestoneName),
        axisLabel: {
          rotate: 30,
          interval: 0
        }
      },
      yAxis: [
        {
          type: 'value',
          name: '进度 (%)',
          max: 100
        },
        {
          type: 'value',
          name: '偏差率 (%)'
        }
      ],
      series: [
        {
          name: '计划进度',
          type: 'bar',
          data: data.analysis.map(a => a.plannedProgress),
          itemStyle: {
            color: '#1890ff'
          }
        },
        {
          name: '实际进度',
          type: 'bar',
          data: data.analysis.map(a => a.actualProgress),
          itemStyle: {
            color: '#52c41a'
          }
        },
        {
          name: '偏差率',
          type: 'line',
          yAxisIndex: 1,
          data: data.analysis.map(a => a.deviationRate),
          itemStyle: {
            color: '#ff4d4f'
          },
          lineStyle: {
            width: 2
          },
          symbol: 'circle',
          symbolSize: 6
        }
      ]
    };

    myChart.setOption(option);
  };

  // 表格列定义
  const columns = [
    {
      title: '预警ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '项目',
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
      title: '里程碑',
      dataIndex: 'milestone_name',
      key: 'milestone_name',
      width: 150,
      ellipsis: true,
      render: (text, record) => (
        <Tooltip title={`${record.milestone_no} - ${text}`}>
          <span>{text}</span>
        </Tooltip>
      )
    },
    {
      title: '计划进度',
      dataIndex: 'planned_progress',
      key: 'planned_progress',
      width: 100,
      align: 'center',
      render: (val) => (
        <Progress 
          percent={parseFloat(val || 0)} 
          size="small" 
          format={(percent) => `${percent.toFixed(1)}%`}
          strokeColor="#1890ff"
        />
      )
    },
    {
      title: '实际进度',
      dataIndex: 'actual_progress',
      key: 'actual_progress',
      width: 100,
      align: 'center',
      render: (val) => (
        <Progress 
          percent={parseFloat(val || 0)} 
          size="small" 
          format={(percent) => `${percent.toFixed(1)}%`}
          strokeColor="#52c41a"
        />
      )
    },
    {
      title: '偏差率',
      dataIndex: 'deviation_rate',
      key: 'deviation_rate',
      width: 100,
      align: 'center',
      render: (val) => {
        const rate = parseFloat(val || 0);
        const color = rate > 10 ? '#ff4d4f' : rate > 5 ? '#fa8c16' : '#52c41a';
        return (
          <span style={{ color, fontWeight: 500 }}>
            {rate > 0 ? '+' : ''}{rate.toFixed(2)}%
          </span>
        );
      }
    },
    {
      title: '预警级别',
      dataIndex: 'warning_level',
      key: 'warning_level',
      width: 100,
      align: 'center',
      render: (level) => {
        const config = WARNING_LEVEL_MAP[level] || WARNING_LEVEL_MAP.normal;
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
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
      width: 180,
      fixed: 'right',
      render: (_, record) => {
        const isPending = record.status === 'pending';
        return (
          <Space size="small">
            <Tooltip title="查看详情">
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleViewDetail(record)}
              />
            </Tooltip>
            {isPending && (
              <Tooltip title="处理预警">
                <Button
                  type="link"
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleOpenHandle(record)}
                  style={{ color: '#52c41a' }}
                />
              </Tooltip>
            )}
            <Tooltip title="偏差分析">
              <Button
                type="link"
                size="small"
                icon={<BarChartOutlined />}
                onClick={() => handleViewAnalysis(record.project_id)}
                style={{ color: '#722ed1' }}
              />
            </Tooltip>
          </Space>
        );
      }
    }
  ];

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="总预警数"
              value={stats.total}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="正常"
              value={stats.normalCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            style={{ cursor: 'pointer' }}
            onClick={() => setFilters({ ...filters, warningLevel: 'warning' })}
          >
            <Statistic
              title="警告"
              value={stats.warningCount}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            style={{ cursor: 'pointer' }}
            onClick={() => setFilters({ ...filters, warningLevel: 'severe' })}
          >
            <Statistic
              title="严重"
              value={stats.severeCount}
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<AlertOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card 
            style={{ cursor: 'pointer' }}
            onClick={() => setFilters({ ...filters, status: 'pending' })}
          >
            <Statistic
              title="待处理"
              value={stats.pendingCount}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="平均偏差率"
              value={stats.avgDeviationRate}
              suffix="%"
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            <WarningOutlined style={{ marginRight: '8px', color: '#fa8c16' }} />
            偏差预警管理
          </h2>
          <Space>
            <Button
              type="primary"
              icon={<SyncOutlined />}
              onClick={handleCheckDeviation}
            >
              {filters.projectId ? '检查当前项目' : '检查所有项目'}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                loadWarnings();
                loadStats();
              }}
            >
              刷新
            </Button>
          </Space>
        </div>

        {/* 筛选区域 */}
        <div style={{ marginBottom: '16px' }}>
          <Space wrap>
            <Select
              placeholder="选择项目"
              allowClear
              showSearch
              optionFilterProp="children"
              style={{ width: 220 }}
              value={filters.projectId || undefined}
              onChange={(val) => setFilters({ ...filters, projectId: val })}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>{p.project_no} - {p.name}</Option>
              ))}
            </Select>
            <Select
              placeholder="预警级别"
              allowClear
              style={{ width: 120 }}
              value={filters.warningLevel || undefined}
              onChange={(val) => setFilters({ ...filters, warningLevel: val })}
            >
              <Option value="warning">警告</Option>
              <Option value="severe">严重</Option>
            </Select>
            <Select
              placeholder="状态"
              allowClear
              style={{ width: 120 }}
              value={filters.status || undefined}
              onChange={(val) => setFilters({ ...filters, status: val })}
            >
              <Option value="pending">待处理</Option>
              <Option value="handled">已处理</Option>
            </Select>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => {
                setPagination({ ...pagination, current: 1 });
                loadWarnings();
              }}
            >
              查询
            </Button>
            <Button
              onClick={() => {
                setFilters({ projectId: '', warningLevel: '', status: '' });
                setPagination({ ...pagination, current: 1 });
              }}
            >
              重置
            </Button>
          </Space>
        </div>

        {/* 预警说明 */}
        <Alert
          message="预警级别说明"
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li><Tag color="green">正常</Tag> 偏差 &lt; 5%：进度在正常范围内</li>
              <li><Tag color="orange">警告</Tag> 偏差 5%-10%：需要关注并采取措施</li>
              <li><Tag color="red">严重</Tag> 偏差 &gt; 10%：需要立即处理</li>
            </ul>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Table
          columns={columns}
          dataSource={warnings}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
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
        title="预警详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setCurrentWarning(null);
        }}
        footer={null}
        width={700}
      >
        {currentWarning && (
          <div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="项目" span={2}>
                {currentWarning.project_no} - {currentWarning.project_name}
              </Descriptions.Item>
              <Descriptions.Item label="里程碑">
                {currentWarning.milestone_no} - {currentWarning.milestone_name}
              </Descriptions.Item>
              <Descriptions.Item label="计划日期">
                {currentWarning.planned_date || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="计划进度">
                <Progress 
                  percent={parseFloat(currentWarning.planned_progress || 0)} 
                  size="small"
                  strokeColor="#1890ff"
                />
              </Descriptions.Item>
              <Descriptions.Item label="实际进度">
                <Progress 
                  percent={parseFloat(currentWarning.actual_progress || 0)} 
                  size="small"
                  strokeColor="#52c41a"
                />
              </Descriptions.Item>
              <Descriptions.Item label="偏差率">
                <span style={{ 
                  color: parseFloat(currentWarning.deviation_rate) > 10 ? '#ff4d4f' : 
                         parseFloat(currentWarning.deviation_rate) > 5 ? '#fa8c16' : '#52c41a',
                  fontWeight: 500,
                  fontSize: 16
                }}>
                  {parseFloat(currentWarning.deviation_rate || 0).toFixed(2)}%
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="预警级别">
                <Tag color={WARNING_LEVEL_MAP[currentWarning.warning_level]?.color || 'default'}>
                  {currentWarning.warningLevelName || currentWarning.warning_level}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="状态" span={2}>
                <Tag color={STATUS_MAP[currentWarning.status]?.color || 'default'}>
                  {STATUS_MAP[currentWarning.status]?.text || currentWarning.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentWarning.created_at ? dayjs(currentWarning.created_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
            </Descriptions>

            {currentWarning.status === 'handled' && (
              <>
                <Divider orientation="left">处理信息</Divider>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="处理人">
                    {currentWarning.handler_name || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="处理时间">
                    {currentWarning.handled_at ? dayjs(currentWarning.handled_at).format('YYYY-MM-DD HH:mm:ss') : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="处理备注" span={2}>
                    {currentWarning.handle_remark || '-'}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* 处理弹窗 */}
      <Modal
        title="处理预警"
        open={handleVisible}
        onCancel={() => {
          setHandleVisible(false);
          handleForm.resetFields();
          setCurrentWarning(null);
        }}
        onOk={() => handleForm.submit()}
        confirmLoading={handleLoading}
        okText="确认处理"
        cancelText="取消"
      >
        {currentWarning && (
          <div>
            <Alert
              message={`预警：${currentWarning.project_name} - ${currentWarning.milestone_name}`}
              description={`偏差率 ${parseFloat(currentWarning.deviation_rate).toFixed(2)}%，请填写处理措施。`}
              type={currentWarning.warning_level === 'severe' ? 'error' : 'warning'}
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form
              form={handleForm}
              layout="vertical"
              onFinish={handleWarningSubmit}
            >
              <Form.Item
                name="handleRemark"
                label="处理措施"
                rules={[{ required: true, message: '请填写处理措施' }]}
              >
                <TextArea 
                  rows={4} 
                  placeholder="请描述针对该预警采取的措施..."
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* 偏差分析弹窗 */}
      <Modal
        title="偏差分析"
        open={analysisVisible}
        onCancel={() => {
          setAnalysisVisible(false);
          setAnalysisData(null);
          setSelectedProjectId(null);
        }}
        footer={null}
        width={900}
      >
        {analysisData ? (
          <div>
            {/* 分析汇总 */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic
                  title="总里程碑"
                  value={analysisData.summary.total}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="已完成"
                  value={analysisData.summary.completed}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="落后"
                  value={analysisData.summary.behind}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="平均偏差率"
                  value={analysisData.summary.avgDeviationRate}
                  suffix="%"
                />
              </Col>
            </Row>

            <Divider orientation="left">预警分布</Divider>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title={<Tag color="green">正常</Tag>}
                    value={analysisData.summary.warningLevels.normal}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title={<Tag color="orange">警告</Tag>}
                    value={analysisData.summary.warningLevels.warning}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card size="small">
                  <Statistic
                    title={<Tag color="red">严重</Tag>}
                    value={analysisData.summary.warningLevels.severe}
                  />
                </Card>
              </Col>
            </Row>

            <Divider orientation="left">偏差图表</Divider>
            <div id="deviation-chart" style={{ width: '100%', height: 350 }}></div>

            <Divider orientation="left">里程碑明细</Divider>
            <Table
              dataSource={analysisData.analysis}
              rowKey="key"
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
              columns={[
                { 
                  title: '里程碑', 
                  dataIndex: 'milestoneName', 
                  key: 'milestoneName',
                  ellipsis: true
                },
                { 
                  title: '计划日期', 
                  dataIndex: 'plannedDate', 
                  key: 'plannedDate',
                  width: 110
                },
                { 
                  title: '状态', 
                  dataIndex: 'status', 
                  key: 'status',
                  width: 80,
                  render: (status) => (
                    <Tag color={status === 'completed' ? 'green' : 'orange'}>
                      {status === 'completed' ? '已完成' : '进行中'}
                    </Tag>
                  )
                },
                { 
                  title: '计划进度', 
                  dataIndex: 'plannedProgress', 
                  key: 'plannedProgress',
                  width: 100,
                  render: (val) => `${parseFloat(val || 0).toFixed(1)}%`
                },
                { 
                  title: '实际进度', 
                  dataIndex: 'actualProgress', 
                  key: 'actualProgress',
                  width: 100,
                  render: (val) => `${parseFloat(val || 0).toFixed(1)}%`
                },
                { 
                  title: '偏差率', 
                  dataIndex: 'deviationRate', 
                  key: 'deviationRate',
                  width: 100,
                  render: (val) => {
                    const rate = parseFloat(val || 0);
                    const color = rate > 10 ? '#ff4d4f' : rate > 5 ? '#fa8c16' : '#52c41a';
                    return (
                      <span style={{ color }}>
                        {rate > 0 ? '+' : ''}{rate.toFixed(2)}%
                      </span>
                    );
                  }
                },
                { 
                  title: '预警级别', 
                  dataIndex: 'warningLevel', 
                  key: 'warningLevel',
                  width: 90,
                  render: (level) => {
                    const config = WARNING_LEVEL_MAP[level] || WARNING_LEVEL_MAP.normal;
                    return <Tag color={config.color}>{config.text}</Tag>;
                  }
                }
              ]}
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Empty description="加载中..." />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default DeviationWarning;
