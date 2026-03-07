/**
 * 成本汇总报表页面
 * Task 49: 实现项目成本统计和分析功能
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Select,
  Button,
  Space,
  DatePicker,
  Tabs,
  Progress,
  Tag,
  message,
  Spin,
  Empty,
  Tooltip,
  Modal
} from 'antd';
import {
  DollarOutlined,
  TransactionOutlined,
  RiseOutlined,
  FallOutlined,
  DownloadOutlined,
  PieChartOutlined,
  LineChartOutlined,
  BarChartOutlined,
  FileExcelOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as echarts from 'echarts';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

// 颜色配置
const COLORS = {
  labor: '#1890ff',
  material: '#52c41a',
  equipment: '#faad14',
  other: '#eb2f96',
  primary: '#1890ff',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f'
};

const CATEGORY_COLORS = ['#1890ff', '#52c41a', '#faad14', '#eb2f96'];

const CostReport = () => {
  // 状态
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [projectCosts, setProjectCosts] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [activeTab, setActiveTab] = useState('summary');

  // 图表引用
  const pieChartRef = useRef(null);
  const trendChartRef = useRef(null);
  const pieChartInstance = useRef(null);
  const trendChartInstance = useRef(null);

  // 加载项目列表
  useEffect(() => {
    fetchProjects();
  }, []);

  // 加载报表数据
  useEffect(() => {
    fetchReportData();
  }, [projectId]);

  // 初始化/更新图表
  useEffect(() => {
    if (categoryData && pieChartRef.current) {
      initPieChart();
    }
    if (trendData && trendChartRef.current) {
      initTrendChart();
    }
  }, [categoryData, trendData, activeTab]);

  // 窗口大小改变时重绘图表
  useEffect(() => {
    const handleResize = () => {
      pieChartInstance.current?.resize();
      trendChartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      pieChartInstance.current?.dispose();
      trendChartInstance.current?.dispose();
    };
  }, []);

  // 获取项目列表
  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/reports/cost/projects', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setProjects(result.data || []);
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
    }
  };

  // 获取报表数据
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (projectId) params.append('projectId', projectId);

      // 并行获取所有数据
      const [summaryRes, categoryRes, trendRes] = await Promise.all([
        fetch(`/api/reports/cost/summary?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/reports/cost/by-category?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/reports/cost/trend?${params}&months=12`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const [summaryResult, categoryResult, trendResult] = await Promise.all([
        summaryRes.json(),
        categoryRes.json(),
        trendRes.json()
      ]);

      if (summaryResult.success) {
        setSummary(summaryResult.data);
      }
      if (categoryResult.success) {
        setCategoryData(categoryResult.data);
      }
      if (trendResult.success) {
        setTrendData(trendResult.data);
      }

      // 如果没有选择项目，加载项目列表数据
      if (!projectId) {
        fetchProjectCosts(1);
      }
    } catch (error) {
      console.error('获取报表数据失败:', error);
      message.error('获取报表数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取项目成本列表
  const fetchProjectCosts = async (page) => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('pageSize', pagination.pageSize);

      const response = await fetch(`/api/reports/cost/by-project?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (result.success) {
        setProjectCosts(result.data || []);
        setPagination(prev => ({
          ...prev,
          current: page,
          total: result.pagination?.total || 0
        }));
      }
    } catch (error) {
      console.error('获取项目成本列表失败:', error);
    }
  };

  // 初始化饼图
  const initPieChart = () => {
    if (!pieChartRef.current || !categoryData) return;

    if (pieChartInstance.current) {
      pieChartInstance.current.dispose();
    }

    pieChartInstance.current = echarts.init(pieChartRef.current);

    const pieData = categoryData.summary.map((item, index) => ({
      name: item.name,
      value: item.amount,
      itemStyle: { color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }
    }));

    const option = {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: ¥{c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        right: '5%',
        top: 'center'
      },
      series: [
        {
          name: '成本分类',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: false
          },
          data: pieData
        }
      ]
    };

    pieChartInstance.current.setOption(option);
  };

  // 初始化趋势图
  const initTrendChart = () => {
    if (!trendChartRef.current || !trendData) return;

    if (trendChartInstance.current) {
      trendChartInstance.current.dispose();
    }

    trendChartInstance.current = echarts.init(trendChartRef.current);

    const months = trendData.trends.map(t => t.monthName);
    const laborData = trendData.trends.map(t => t.labor);
    const materialData = trendData.trends.map(t => t.material);
    const purchaseData = trendData.trends.map(t => t.purchase);
    const totalData = trendData.trends.map(t => t.total);

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: (params) => {
          let result = params[0].axisValue + '<br/>';
          let total = 0;
          params.forEach(param => {
            result += `${param.marker} ${param.seriesName}: ¥${param.value.toLocaleString()}<br/>`;
            total += param.value;
          });
          result += `<strong>合计: ¥${total.toLocaleString()}</strong>`;
          return result;
        }
      },
      legend: {
        data: ['人工费', '材料款', '采购金额', '总成本'],
        bottom: 0
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: months,
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (value) => {
            if (value >= 10000) {
              return (value / 10000) + '万';
            }
            return value;
          }
        }
      },
      series: [
        {
          name: '人工费',
          type: 'bar',
          stack: 'cost',
          data: laborData,
          itemStyle: { color: COLORS.labor }
        },
        {
          name: '材料款',
          type: 'bar',
          stack: 'cost',
          data: materialData,
          itemStyle: { color: COLORS.material }
        },
        {
          name: '采购金额',
          type: 'bar',
          stack: 'cost',
          data: purchaseData,
          itemStyle: { color: COLORS.warning }
        },
        {
          name: '总成本',
          type: 'line',
          data: totalData,
          itemStyle: { color: COLORS.danger },
          lineStyle: { width: 2 },
          symbol: 'circle',
          symbolSize: 6
        }
      ]
    };

    trendChartInstance.current.setOption(option);
  };

  // 导出报表
  const handleExport = async (format) => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (projectId) params.append('projectId', projectId);
      params.append('format', format);

      const response = await fetch(`/api/reports/cost/export?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `成本报表_${dayjs().format('YYYY-MM-DD')}.${format === 'csv' ? 'csv' : 'json'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败');
    }
  };

  // 格式化金额
  const formatMoney = (value) => {
    if (!value && value !== 0) return '-';
    return `¥${parseFloat(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 项目成本表格列定义
  const projectColumns = [
    {
      title: '项目编号',
      dataIndex: 'project_no',
      key: 'project_no',
      width: 120
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true
    },
    {
      title: '合同金额',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      width: 140,
      align: 'right',
      render: (val) => formatMoney(val)
    },
    {
      title: '总成本',
      dataIndex: ['cost', 'total'],
      key: 'cost_total',
      width: 140,
      align: 'right',
      render: (val) => formatMoney(val)
    },
    {
      title: '已付金额',
      dataIndex: ['cost', 'paid'],
      key: 'cost_paid',
      width: 140,
      align: 'right',
      render: (val) => formatMoney(val)
    },
    {
      title: '待付金额',
      dataIndex: ['cost', 'pending'],
      key: 'cost_pending',
      width: 140,
      align: 'right',
      render: (val) => formatMoney(val)
    },
    {
      title: '利润',
      dataIndex: ['cost', 'profit'],
      key: 'profit',
      width: 140,
      align: 'right',
      render: (val) => (
        <span style={{ color: val >= 0 ? COLORS.success : COLORS.danger }}>
          {formatMoney(val)}
        </span>
      )
    },
    {
      title: '利润率',
      dataIndex: ['cost', 'profitRate'],
      key: 'profitRate',
      width: 100,
      align: 'center',
      render: (val) => (
        <Tag color={val >= 0 ? 'success' : 'error'}>
          {val ? `${val}%` : '-'}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusMap = {
          pending: { text: '待审批', color: 'default' },
          approved: { text: '进行中', color: 'processing' },
          completed: { text: '已完成', color: 'success' },
          cancelled: { text: '已取消', color: 'error' }
        };
        const config = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    }
  ];

  // 分类明细表格列定义
  const categoryDetailColumns = [
    {
      title: '单号',
      dataIndex: 'payment_no',
      key: 'payment_no',
      width: 140
    },
    {
      title: '项目',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      align: 'right',
      render: (val) => formatMoney(val)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status) => {
        const statusMap = {
          pending: { text: '待审批', color: 'default' },
          approved: { text: '已审批', color: 'processing' },
          paid: { text: '已付款', color: 'success' }
        };
        const config = statusMap[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '日期',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD') : '-'
    }
  ];

  return (
    <div className="cost-report-page" style={{ padding: 24, background: '#f0f2f5', minHeight: '100vh' }}>
      {/* 页面标题和筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="large">
              <h2 style={{ margin: 0 }}>
                <BarChartOutlined /> 成本汇总报表
              </h2>
              <Select
                placeholder="选择项目（可选）"
                allowClear
                style={{ width: 250 }}
                value={projectId}
                onChange={setProjectId}
              >
                {projects.map(p => (
                  <Option key={p.id} value={p.id}>
                    {p.project_no} - {p.name}
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => handleExport('csv')}>
                导出CSV
              </Button>
              <Button type="primary" icon={<FileExcelOutlined />} onClick={() => handleExport('json')}>
                导出JSON
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Spin spinning={loading}>
        {/* 汇总统计卡片 */}
        {summary && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title={
                    <span>
                      合同金额
                      <Tooltip title="所有已审批收入合同的总金额">
                        <InfoCircleOutlined style={{ marginLeft: 8, color: '#999' }} />
                      </Tooltip>
                    </span>
                  }
                  value={summary.summary.contractAmount}
                  precision={2}
                  prefix={<DollarOutlined />}
                  suffix="元"
                  valueStyle={{ color: COLORS.primary }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="总成本"
                  value={summary.summary.totalCost}
                  precision={2}
                  prefix={<TransactionOutlined />}
                  suffix="元"
                  valueStyle={{ color: COLORS.warning }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="已付金额"
                  value={summary.summary.totalPaid}
                  precision={2}
                  prefix={<FallOutlined />}
                  suffix="元"
                  valueStyle={{ color: COLORS.danger }}
                />
                <Progress
                  percent={summary.summary.totalCost > 0 ? (summary.summary.totalPaid / summary.summary.totalCost * 100) : 0}
                  size="small"
                  showInfo={false}
                  strokeColor={COLORS.danger}
                  style={{ marginTop: 8 }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic
                  title="利润"
                  value={summary.summary.profit}
                  precision={2}
                  prefix={summary.summary.profit >= 0 ? <RiseOutlined /> : <FallOutlined />}
                  suffix="元"
                  valueStyle={{ color: summary.summary.profit >= 0 ? COLORS.success : COLORS.danger }}
                />
                <div style={{ marginTop: 8 }}>
                  <span style={{ color: '#999' }}>利润率: </span>
                  <Tag color={summary.summary.profitRate >= 0 ? 'success' : 'error'}>
                    {summary.summary.profitRate}%
                  </Tag>
                </div>
              </Card>
            </Col>
          </Row>
        )}

        {/* 分类统计卡片 */}
        {summary && (
          <Card title="成本分类" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              {summary.categories.map((cat, index) => (
                <Col xs={24} sm={12} md={6} key={cat.key}>
                  <Card
                    size="small"
                    style={{ borderColor: CATEGORY_COLORS[index], borderTopWidth: 3 }}
                  >
                    <Statistic
                      title={
                        <span style={{ color: CATEGORY_COLORS[index] }}>
                          {cat.name}
                        </span>
                      }
                      value={cat.amount}
                      precision={2}
                      suffix="元"
                    />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                      <Row justify="space-between">
                        <Col>已付: {formatMoney(cat.paid)}</Col>
                        <Col>待付: {formatMoney(cat.pending)}</Col>
                      </Row>
                      <Progress
                        percent={cat.ratio}
                        size="small"
                        format={() => `${cat.ratio}%`}
                        strokeColor={CATEGORY_COLORS[index]}
                        style={{ marginTop: 4 }}
                      />
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}

        {/* 详细数据标签页 */}
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane
            tab={<span><PieChartOutlined /> 分类统计</span>}
            key="category"
          >
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Card title="成本分布">
                  {categoryData ? (
                    <div ref={pieChartRef} style={{ height: 350 }} />
                  ) : (
                    <Empty description="暂无数据" />
                  )}
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card title="分类明细">
                  {categoryData?.summary ? (
                    <Table
                      dataSource={categoryData.summary}
                      rowKey="key"
                      pagination={false}
                      size="small"
                      columns={[
                        {
                          title: '分类',
                          dataIndex: 'name',
                          key: 'name'
                        },
                        {
                          title: '金额',
                          dataIndex: 'amount',
                          key: 'amount',
                          align: 'right',
                          render: (val) => formatMoney(val)
                        },
                        {
                          title: '已付',
                          dataIndex: 'paid',
                          key: 'paid',
                          align: 'right',
                          render: (val) => formatMoney(val)
                        },
                        {
                          title: '待付',
                          dataIndex: 'pending',
                          key: 'pending',
                          align: 'right',
                          render: (val) => formatMoney(val)
                        },
                        {
                          title: '占比',
                          dataIndex: 'ratio',
                          key: 'ratio',
                          align: 'center',
                          render: (val) => `${val}%`
                        }
                      ]}
                    />
                  ) : (
                    <Empty description="暂无数据" />
                  )}
                </Card>
              </Col>
            </Row>
          </TabPane>

          <TabPane
            tab={<span><LineChartOutlined /> 成本趋势</span>}
            key="trend"
          >
            <Card>
              {trendData ? (
                <>
                  <div ref={trendChartRef} style={{ height: 400 }} />
                  <Row gutter={16} style={{ marginTop: 16, textAlign: 'center' }}>
                    <Col span={8}>
                      <Statistic
                        title="统计月数"
                        value={trendData.summary.totalMonths}
                        suffix="个月"
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="累计成本"
                        value={trendData.summary.totalCost}
                        precision={2}
                        prefix="¥"
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="月均成本"
                        value={trendData.summary.avgCost}
                        precision={2}
                        prefix="¥"
                      />
                    </Col>
                  </Row>
                </>
              ) : (
                <Empty description="暂无数据" />
              )}
            </Card>
          </TabPane>

          {!projectId && (
            <TabPane
              tab={<span><BarChartOutlined /> 项目统计</span>}
              key="project"
            >
              <Card>
                <Table
                  dataSource={projectCosts}
                  rowKey="id"
                  columns={projectColumns}
                  pagination={{
                    ...pagination,
                    showSizeChanger: true,
                    showTotal: (total) => `共 ${total} 条`,
                    onChange: (page) => fetchProjectCosts(page)
                  }}
                  scroll={{ x: 1300 }}
                />
              </Card>
            </TabPane>
          )}

          {/* 人工费明细 */}
          <TabPane tab="人工费明细" key="labor">
            <Card>
              {categoryData?.details?.labor ? (
                <Table
                  dataSource={categoryData.details.labor}
                  rowKey="id"
                  columns={[
                    ...categoryDetailColumns,
                    {
                      title: '收款人',
                      dataIndex: 'payee_name',
                      key: 'payee_name',
                      width: 120
                    }
                  ]}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 900 }}
                />
              ) : (
                <Empty description="暂无人工费数据" />
              )}
            </Card>
          </TabPane>

          {/* 材料费明细 */}
          <TabPane tab="材料费明细" key="material">
            <Card>
              {categoryData?.details?.material ? (
                <Table
                  dataSource={categoryData.details.material}
                  rowKey="id"
                  columns={[
                    ...categoryDetailColumns,
                    {
                      title: '供应商',
                      dataIndex: 'supplier_name',
                      key: 'supplier_name',
                      width: 120
                    }
                  ]}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 900 }}
                />
              ) : (
                <Empty description="暂无材料费数据" />
              )}
            </Card>
          </TabPane>

          {/* 采购明细 */}
          <TabPane tab="采购明细" key="purchase">
            <Card>
              {categoryData?.details?.purchases ? (
                <Table
                  dataSource={categoryData.details.purchases}
                  rowKey="id"
                  columns={[
                    {
                      title: '单号',
                      dataIndex: 'batch_no',
                      key: 'batch_no',
                      width: 140
                    },
                    {
                      title: '类型',
                      dataIndex: 'purchase_type',
                      key: 'purchase_type',
                      width: 100,
                      render: (type) => (
                        <Tag color={type === 'batch' ? 'blue' : 'orange'}>
                          {type === 'batch' ? '批量采购' : '零星采购'}
                        </Tag>
                      )
                    },
                    {
                      title: '项目',
                      dataIndex: 'project_name',
                      key: 'project_name',
                      ellipsis: true
                    },
                    {
                      title: '金额',
                      dataIndex: 'total_amount',
                      key: 'total_amount',
                      width: 120,
                      align: 'right',
                      render: (val) => formatMoney(val)
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      width: 100
                    },
                    {
                      title: '日期',
                      dataIndex: 'created_at',
                      key: 'created_at',
                      width: 120,
                      render: (val) => val ? dayjs(val).format('YYYY-MM-DD') : '-'
                    }
                  ]}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 900 }}
                />
              ) : (
                <Empty description="暂无采购数据" />
              )}
            </Card>
          </TabPane>
        </Tabs>
      </Spin>
    </div>
  );
};

export default CostReport;
