/**
 * 审计日志管理页面
 * Task 60: 系统管理 - 日志审计
 */

import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Button,
  Input,
  Select,
  DatePicker,
  Space,
  Tag,
  Modal,
  Descriptions,
  Statistic,
  Row,
  Col,
  message,
  Popconfirm,
  Tooltip,
  Divider
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  DeleteOutlined,
  UserOutlined,
  HistoryOutlined,
  DashboardOutlined,
  BarChartOutlined,
  ExportOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import './AuditLog.css';

const { RangePicker } = DatePicker;
const { Option } = Select;

// 操作类型配置
const ACTION_TYPES = [
  { value: 'login', label: '登录', color: 'green' },
  { value: 'logout', label: '登出', color: 'orange' },
  { value: 'create', label: '新增', color: 'blue' },
  { value: 'update', label: '编辑', color: 'cyan' },
  { value: 'delete', label: '删除', color: 'red' },
  { value: 'approve', label: '审批通过', color: 'green' },
  { value: 'reject', label: '审批拒绝', color: 'red' },
  { value: 'upload', label: '上传', color: 'purple' },
  { value: 'download', label: '下载', color: 'geekblue' },
  { value: 'export', label: '导出', color: 'gold' },
  { value: 'import', label: '导入', color: 'lime' }
];

// 模块配置
const MODULES = [
  { value: 'auth', label: '认证管理' },
  { value: 'user', label: '用户管理' },
  { value: 'department', label: '部门管理' },
  { value: 'role', label: '角色管理' },
  { value: 'permission', label: '权限管理' },
  { value: 'project', label: '项目管理' },
  { value: 'contract', label: '合同管理' },
  { value: 'purchase', label: '采购管理' },
  { value: 'stock', label: '库存管理' },
  { value: 'finance', label: '财务管理' },
  { value: 'approval', label: '审批管理' },
  { value: 'change', label: '变更管理' },
  { value: 'construction', label: '施工管理' },
  { value: 'completion', label: '竣工管理' },
  { value: 'report', label: '报表管理' },
  { value: 'system', label: '系统管理' }
];

// 获取操作类型的标签颜色
const getActionColor = (action) => {
  const found = ACTION_TYPES.find(t => t.value === action);
  return found?.color || 'default';
};

// 获取操作类型的显示名称
const getActionLabel = (action) => {
  const found = ACTION_TYPES.find(t => t.value === action);
  return found?.label || action;
};

// 获取模块的显示名称
const getModuleLabel = (module) => {
  const found = MODULES.find(m => m.value === module);
  return found?.label || module;
};

function AuditLog() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  
  // 筛选条件
  const [filters, setFilters] = useState({
    keyword: '',
    action: undefined,
    module: undefined,
    dateRange: null
  });
  
  // 日志详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentLog, setCurrentLog] = useState(null);
  
  // 统计弹窗
  const [statsVisible, setStatsVisible] = useState(false);
  
  // 导出弹窗
  const [exportVisible, setExportVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);

  // 加载日志列表
  const loadLogs = async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('pageSize', pageSize);
      
      if (filters.keyword) {
        params.append('keyword', filters.keyword);
      }
      if (filters.action) {
        params.append('action', filters.action);
      }
      if (filters.module) {
        params.append('module', filters.module);
      }
      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        params.append('start_date', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/audit/logs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setLogs(result.data.list);
        setPagination({
          current: result.data.pagination.page,
          pageSize: result.data.pagination.pageSize,
          total: result.data.pagination.total
        });
      } else {
        message.error(result.message || '加载日志失败');
      }
    } catch (error) {
      console.error('加载日志失败:', error);
      message.error('加载日志失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计数据
  const loadStats = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        params.append('start_date', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/audit/stats?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadLogs();
    loadStats();
  }, []);

  // 搜索
  const handleSearch = () => {
    loadLogs(1, pagination.pageSize);
    loadStats();
  };

  // 重置
  const handleReset = () => {
    setFilters({
      keyword: '',
      action: undefined,
      module: undefined,
      dateRange: null
    });
    // 重置后重新加载
    setTimeout(() => {
      loadLogs(1, pagination.pageSize);
      loadStats();
    }, 0);
  };

  // 分页变化
  const handleTableChange = (newPagination) => {
    loadLogs(newPagination.current, newPagination.pageSize);
  };

  // 查看详情
  const handleViewDetail = async (record) => {
    setCurrentLog(record);
    setDetailVisible(true);
  };

  // 查看统计
  const handleViewStats = () => {
    loadStats();
    setStatsVisible(true);
  };

  // 导出日志
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.append('format', exportFormat);
      
      if (filters.keyword) {
        params.append('keyword', filters.keyword);
      }
      if (filters.action) {
        params.append('action', filters.action);
      }
      if (filters.module) {
        params.append('module', filters.module);
      }
      if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
        params.append('start_date', filters.dateRange[0].format('YYYY-MM-DD'));
        params.append('end_date', filters.dateRange[1].format('YYYY-MM-DD'));
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/audit/logs/export?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (exportFormat === 'json') {
        const result = await response.json();
        if (result.success) {
          // 创建 JSON 文件下载
          const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `audit_logs_${dayjs().format('YYYYMMDDHHmmss')}.json`;
          a.click();
          window.URL.revokeObjectURL(url);
          message.success(`成功导出 ${result.data.total} 条日志`);
        } else {
          message.error(result.message || '导出失败');
        }
      } else {
        // CSV 格式直接下载
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        message.success('导出成功');
      }
      
      setExportVisible(false);
    } catch (error) {
      console.error('导出日志失败:', error);
      message.error('导出日志失败');
    } finally {
      setExporting(false);
    }
  };

  // 清理过期日志
  const handleCleanLogs = async (days) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/audit/logs/clean?days=${days}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success(result.message);
        loadLogs();
        loadStats();
      } else {
        message.error(result.message || '清理失败');
      }
    } catch (error) {
      console.error('清理日志失败:', error);
      message.error('清理日志失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (text) => text || '-'
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (text) => (
        <Tag color={getActionColor(text)}>{getActionLabel(text)}</Tag>
      )
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 100,
      render: (text) => getModuleLabel(text)
    },
    {
      title: '目标类型',
      dataIndex: 'target_type',
      key: 'target_type',
      width: 100,
      render: (text) => text || '-'
    },
    {
      title: '操作详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          {text || '-'}
        </Tooltip>
      )
    },
    {
      title: 'IP地址',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (text) => text || '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          详情
        </Button>
      )
    }
  ];

  return (
    <div className="audit-log-page">
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="今日日志"
              value={stats?.todayCount || 0}
              prefix={<HistoryOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="本周日志"
              value={stats?.weekCount || 0}
              prefix={<HistoryOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="本月日志"
              value={stats?.monthCount || 0}
              prefix={<HistoryOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="登录次数"
              value={stats?.loginCount || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="新增操作"
              value={stats?.operationStats?.create_count || 0}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="总日志数"
              value={stats?.total || 0}
              prefix={<DashboardOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 主内容 */}
      <Card>
        {/* 筛选区域 */}
        <div className="filter-section" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Input
              placeholder="搜索用户/详情"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              onPressEnter={handleSearch}
              style={{ width: 200 }}
            />
            <Select
              placeholder="操作类型"
              value={filters.action}
              onChange={(value) => setFilters({ ...filters, action: value })}
              allowClear
              style={{ width: 120 }}
            >
              {ACTION_TYPES.map(type => (
                <Option key={type.value} value={type.value}>
                  <Tag color={type.color} style={{ marginRight: 0 }}>{type.label}</Tag>
                </Option>
              ))}
            </Select>
            <Select
              placeholder="模块"
              value={filters.module}
              onChange={(value) => setFilters({ ...filters, module: value })}
              allowClear
              style={{ width: 140 }}
            >
              {MODULES.map(mod => (
                <Option key={mod.value} value={mod.value}>{mod.label}</Option>
              ))}
            </Select>
            <RangePicker
              value={filters.dateRange}
              onChange={(dates) => setFilters({ ...filters, dateRange: dates })}
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
            <Button 
              icon={<ExportOutlined />} 
              onClick={() => setExportVisible(true)}
            >
              导出
            </Button>
            <Button icon={<BarChartOutlined />} onClick={handleViewStats}>
              统计分析
            </Button>
          </Space>
        </div>

        {/* 日志列表 */}
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </Card>

      {/* 日志详情弹窗 */}
      <Modal
        title="日志详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {currentLog && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="日志ID">{currentLog.id}</Descriptions.Item>
            <Descriptions.Item label="操作时间">
              {dayjs(currentLog.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="用户ID">{currentLog.user_id || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户名">{currentLog.username || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作类型">
              <Tag color={getActionColor(currentLog.action)}>
                {getActionLabel(currentLog.action)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="模块">{getModuleLabel(currentLog.module)}</Descriptions.Item>
            <Descriptions.Item label="目标类型">{currentLog.target_type || '-'}</Descriptions.Item>
            <Descriptions.Item label="目标ID">{currentLog.target_id || '-'}</Descriptions.Item>
            <Descriptions.Item label="IP地址">{currentLog.ip || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户代理" span={2}>
              <div style={{ wordBreak: 'break-all' }}>
                {currentLog.user_agent || '-'}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="操作详情" span={2}>
              {currentLog.detail || '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 统计分析弹窗 */}
      <Modal
        title="日志统计分析"
        open={statsVisible}
        onCancel={() => setStatsVisible(false)}
        footer={
          <Space>
            <Popconfirm
              title="确认清理"
              description="确定要清理180天前的日志吗？此操作不可恢复。"
              onConfirm={() => handleCleanLogs(180)}
              okText="确定"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                清理180天前日志
              </Button>
            </Popconfirm>
            <Popconfirm
              title="确认清理"
              description="确定要清理90天前的日志吗？此操作不可恢复。"
              onConfirm={() => handleCleanLogs(90)}
              okText="确定"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                清理90天前日志
              </Button>
            </Popconfirm>
            <Button onClick={() => setStatsVisible(false)}>关闭</Button>
          </Space>
        }
        width={900}
      >
        {stats && (
          <div className="stats-content">
            <Row gutter={[16, 16]}>
              {/* 基础统计 */}
              <Col span={24}>
                <Card title="基础统计" size="small">
                  <Row gutter={16}>
                    <Col span={6}>
                      <Statistic title="总日志数" value={stats.total} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="今日日志" value={stats.todayCount} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="本周日志" value={stats.weekCount} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="本月日志" value={stats.monthCount} />
                    </Col>
                  </Row>
                </Card>
              </Col>

              {/* 操作类型统计 */}
              <Col span={12}>
                <Card title="按操作类型统计" size="small">
                  <Table
                    dataSource={stats.actionStats}
                    rowKey="action"
                    pagination={false}
                    size="small"
                    columns={[
                      {
                        title: '操作类型',
                        dataIndex: 'action',
                        render: (text) => (
                          <Tag color={getActionColor(text)}>{getActionLabel(text)}</Tag>
                        )
                      },
                      {
                        title: '数量',
                        dataIndex: 'count',
                        sorter: (a, b) => a.count - b.count
                      },
                      {
                        title: '占比',
                        render: (_, record) => 
                          stats.total > 0 ? `${((record.count / stats.total) * 100).toFixed(1)}%` : '0%'
                      }
                    ]}
                  />
                </Card>
              </Col>

              {/* 模块统计 */}
              <Col span={12}>
                <Card title="按模块统计" size="small">
                  <Table
                    dataSource={stats.moduleStats}
                    rowKey="module"
                    pagination={false}
                    size="small"
                    columns={[
                      {
                        title: '模块',
                        dataIndex: 'module',
                        render: (text) => getModuleLabel(text)
                      },
                      {
                        title: '数量',
                        dataIndex: 'count',
                        sorter: (a, b) => a.count - b.count
                      },
                      {
                        title: '占比',
                        render: (_, record) => 
                          stats.total > 0 ? `${((record.count / stats.total) * 100).toFixed(1)}%` : '0%'
                      }
                    ]}
                  />
                </Card>
              </Col>

              {/* 用户统计 */}
              <Col span={12}>
                <Card title="活跃用户 TOP 10" size="small">
                  <Table
                    dataSource={stats.userStats}
                    rowKey="user_id"
                    pagination={false}
                    size="small"
                    columns={[
                      {
                        title: '用户名',
                        dataIndex: 'username',
                        render: (text) => text || '-'
                      },
                      {
                        title: '操作次数',
                        dataIndex: 'count',
                        sorter: (a, b) => a.count - b.count
                      },
                      {
                        title: '占比',
                        render: (_, record) => 
                          stats.total > 0 ? `${((record.count / stats.total) * 100).toFixed(1)}%` : '0%'
                      }
                    ]}
                  />
                </Card>
              </Col>

              {/* 日期统计 */}
              <Col span={12}>
                <Card title="最近30天日志趋势" size="small">
                  <Table
                    dataSource={stats.dateStats}
                    rowKey="date"
                    pagination={false}
                    size="small"
                    scroll={{ y: 200 }}
                    columns={[
                      {
                        title: '日期',
                        dataIndex: 'date'
                      },
                      {
                        title: '日志数',
                        dataIndex: 'count',
                        sorter: (a, b) => a.count - b.count
                      }
                    ]}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* 导出弹窗 */}
      <Modal
        title="导出审计日志"
        open={exportVisible}
        onCancel={() => setExportVisible(false)}
        onOk={handleExport}
        confirmLoading={exporting}
        okText="导出"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 8 }}>选择导出格式：</p>
          <Select
            value={exportFormat}
            onChange={setExportFormat}
            style={{ width: 200 }}
          >
            <Option value="csv">
              <Space>
                <DownloadOutlined />
                CSV 格式
              </Space>
            </Option>
            <Option value="json">
              <Space>
                <DownloadOutlined />
                JSON 格式
              </Space>
            </Option>
          </Select>
        </div>
        
        <Divider style={{ margin: '12px 0' }} />
        
        <div>
          <p style={{ color: '#666', marginBottom: 8 }}>当前筛选条件：</p>
          <Space wrap>
            {filters.keyword && <Tag>关键词: {filters.keyword}</Tag>}
            {filters.action && <Tag color={getActionColor(filters.action)}>操作: {getActionLabel(filters.action)}</Tag>}
            {filters.module && <Tag>模块: {getModuleLabel(filters.module)}</Tag>}
            {filters.dateRange && filters.dateRange[0] && filters.dateRange[1] && (
              <Tag>
                日期: {filters.dateRange[0].format('YYYY-MM-DD')} ~ {filters.dateRange[1].format('YYYY-MM-DD')}
              </Tag>
            )}
            {!filters.keyword && !filters.action && !filters.module && !filters.dateRange && (
              <Tag>全部日志</Tag>
            )}
          </Space>
        </div>
      </Modal>
    </div>
  );
}

export default AuditLog;
