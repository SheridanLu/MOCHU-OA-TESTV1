/**
 * 库存查询页面 - Task 44
 * 实现库存综合查询、统计、详情查看和导出功能
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Input, Select, Button, Space, Tag, Modal, Descriptions,
  Statistic, Row, Col, message, Tooltip, Badge, Empty, Spin, Pagination,
  DatePicker, Tabs
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, ExportOutlined, EyeOutlined,
  WarningOutlined, StockOutlined, DollarOutlined, ShopOutlined,
  InboxOutlined, SyncOutlined, FilterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import './StockQuery.css';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

// 库存状态映射
const WARNING_STATUS_MAP = {
  normal: { text: '正常', color: 'success' },
  warning: { text: '预警', color: 'warning' },
  urgent: { text: '紧急', color: 'error' },
  overstock: { text: '超储', color: 'blue' }
};

// 库存记录状态映射
const STOCK_STATUS_MAP = {
  normal: { text: '正常', color: 'success' },
  locked: { text: '锁定', color: 'warning' },
  disabled: { text: '禁用', color: 'default' }
};

// 变动类型映射
const CHANGE_TYPE_MAP = {
  in: { text: '入库', color: 'green' },
  out: { text: '出库', color: 'orange' },
  adjust: { text: '调整', color: 'blue' },
  return: { text: '退库', color: 'purple' }
};

const StockQuery = () => {
  // 状态定义
  const [loading, setLoading] = useState(false);
  const [statistics, setStatistics] = useState(null);
  const [stockList, setStockList] = useState([]);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [locations, setLocations] = useState([]);
  
  // 搜索条件
  const [searchParams, setSearchParams] = useState({
    keyword: '',
    material_name: '',
    specification: '',
    location: '',
    status: 'all',
    warning_status: 'all'
  });
  
  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 当前选中的预警状态标签（快捷筛选）
  const [activeWarningTab, setActiveWarningTab] = useState('all');
  
  // 加载统计数据
  const loadStatistics = useCallback(async () => {
    try {
      const response = await fetch('/api/stock/query/statistics', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const result = await response.json();
      if (result.success) {
        setStatistics(result.data);
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  }, []);
  
  // 加载库存列表
  const loadStockList = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        pageSize,
        ...searchParams
      });
      
      const response = await fetch(`/api/stock/query?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const result = await response.json();
      
      if (result.success) {
        setStockList(result.data);
        setPagination(prev => ({
          ...prev,
          current: page,
          pageSize,
          total: result.pagination.total
        }));
      } else {
        message.error(result.message || '加载库存列表失败');
      }
    } catch (error) {
      console.error('加载库存列表失败:', error);
      message.error('加载库存列表失败');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);
  
  // 加载仓库位置列表
  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch('/api/stock/query/locations', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const result = await response.json();
      if (result.success) {
        setLocations(result.data);
      }
    } catch (error) {
      console.error('加载位置列表失败:', error);
    }
  }, []);
  
  // 加载库存详情
  const loadStockDetail = async (id) => {
    setDetailLoading(true);
    setDetailVisible(true);
    try {
      const response = await fetch(`/api/stock/query/detail/${id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const result = await response.json();
      
      if (result.success) {
        setDetailData(result.data);
      } else {
        message.error(result.message || '加载库存详情失败');
      }
    } catch (error) {
      console.error('加载库存详情失败:', error);
      message.error('加载库存详情失败');
    } finally {
      setDetailLoading(false);
    }
  };
  
  // 导出库存数据
  const handleExport = async () => {
    try {
      message.loading({ content: '正在导出...', key: 'export' });
      
      const params = new URLSearchParams({
        ...searchParams,
        format: 'csv'
      });
      
      const response = await fetch(`/api/stock/query/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `库存导出_${dayjs().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      message.success({ content: '导出成功', key: 'export' });
    } catch (error) {
      console.error('导出失败:', error);
      message.error({ content: '导出失败', key: 'export' });
    }
  };
  
  // 搜索
  const handleSearch = () => {
    loadStockList(1, pagination.pageSize);
  };
  
  // 重置搜索
  const handleReset = () => {
    setSearchParams({
      keyword: '',
      material_name: '',
      specification: '',
      location: '',
      status: 'all',
      warning_status: 'all'
    });
    setActiveWarningTab('all');
  };
  
  // 预警状态标签点击
  const handleWarningTabChange = (key) => {
    setActiveWarningTab(key);
    setSearchParams(prev => ({
      ...prev,
      warning_status: key
    }));
  };
  
  // 初始化
  useEffect(() => {
    loadStatistics();
    loadLocations();
  }, [loadStatistics, loadLocations]);
  
  // 加载库存列表
  useEffect(() => {
    loadStockList(pagination.current, pagination.pageSize);
  }, [searchParams.warning_status]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // 表格列定义
  const columns = [
    {
      title: '物资名称',
      dataIndex: 'material_name',
      key: 'material_name',
      width: 180,
      fixed: 'left',
      render: (text, record) => (
        <Space>
          <span>{text}</span>
          {record.warning_status !== 'normal' && (
            <Tooltip title={record.warning_message}>
              <WarningOutlined style={{ color: record.warning_status === 'urgent' ? '#ff4d4f' : '#faad14' }} />
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      key: 'specification',
      width: 150,
      render: (text) => text || '-'
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      render: (text) => text || '-'
    },
    {
      title: '库存数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      align: 'right',
      render: (value, record) => (
        <span style={{
          color: record.warning_status === 'urgent' ? '#ff4d4f' : 
                 record.warning_status === 'warning' ? '#faad14' : 'inherit'
        }}>
          {parseFloat(value || 0).toFixed(2)}
        </span>
      )
    },
    {
      title: '可领数量',
      dataIndex: 'available_quantity',
      key: 'available_quantity',
      width: 100,
      align: 'right',
      render: (value) => parseFloat(value || 0).toFixed(2)
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      align: 'right',
      render: (value) => `¥${parseFloat(value || 0).toFixed(2)}`
    },
    {
      title: '库存金额',
      dataIndex: 'total_value',
      key: 'total_value',
      width: 120,
      align: 'right',
      render: (value) => `¥${parseFloat(value || 0).toFixed(2)}`
    },
    {
      title: '存放位置',
      dataIndex: 'location',
      key: 'location',
      width: 120,
      render: (text) => text || '-'
    },
    {
      title: '库存状态',
      dataIndex: 'warning_status',
      key: 'warning_status',
      width: 100,
      filters: [
        { text: '正常', value: 'normal' },
        { text: '预警', value: 'warning' },
        { text: '紧急', value: 'urgent' },
        { text: '超储', value: 'overstock' }
      ],
      render: (status) => {
        const config = WARNING_STATUS_MAP[status] || WARNING_STATUS_MAP.normal;
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '最后入库',
      dataIndex: 'last_stock_in_date',
      key: 'last_stock_in_date',
      width: 110,
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '最后出库',
      dataIndex: 'last_out_date',
      key: 'last_out_date',
      width: 110,
      render: (date) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Button 
          type="link" 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => loadStockDetail(record.id)}
        >
          详情
        </Button>
      )
    }
  ];
  
  // 详情弹窗的变动记录列
  const logColumns = [
    {
      title: '变动类型',
      dataIndex: 'change_type',
      key: 'change_type',
      width: 80,
      render: (type) => {
        const config = CHANGE_TYPE_MAP[type] || { text: type, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '变动数量',
      dataIndex: 'change_quantity',
      key: 'change_quantity',
      width: 100,
      align: 'right',
      render: (value, record) => (
        <span style={{ color: record.change_type === 'in' ? '#52c41a' : '#ff4d4f' }}>
          {record.change_type === 'in' ? '+' : '-'}{parseFloat(value || 0).toFixed(2)}
        </span>
      )
    },
    {
      title: '变动前',
      dataIndex: 'before_quantity',
      key: 'before_quantity',
      width: 100,
      align: 'right',
      render: (value) => parseFloat(value || 0).toFixed(2)
    },
    {
      title: '变动后',
      dataIndex: 'after_quantity',
      key: 'after_quantity',
      width: 100,
      align: 'right',
      render: (value) => parseFloat(value || 0).toFixed(2)
    },
    {
      title: '操作人',
      dataIndex: 'operator_real_name',
      key: 'operator_real_name',
      width: 100,
      render: (text) => text || '-'
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (text) => text || '-'
    }
  ];
  
  return (
    <div className="stock-query-page">
      {/* 统计卡片 */}
      <Row gutter={16} className="statistics-row">
        <Col xs={12} sm={6} lg={4}>
          <Card className="stat-card" hoverable onClick={() => handleWarningTabChange('all')}>
            <Statistic
              title="物资种类"
              value={statistics?.total_types || 0}
              prefix={<InboxOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} lg={5}>
          <Card className="stat-card">
            <Statistic
              title="总库存金额"
              value={statistics?.total_value || 0}
              precision={2}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} lg={4}>
          <Card 
            className={`stat-card warning ${activeWarningTab === 'warning' ? 'active' : ''}`} 
            hoverable 
            onClick={() => handleWarningTabChange('warning')}
          >
            <Statistic
              title="预警物资"
              value={statistics?.warning_count || 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} lg={4}>
          <Card 
            className={`stat-card danger ${activeWarningTab === 'urgent' ? 'active' : ''}`} 
            hoverable 
            onClick={() => handleWarningTabChange('urgent')}
          >
            <Statistic
              title="紧急物资"
              value={statistics?.urgent_count || 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} lg={4}>
          <Card 
            className={`stat-card info ${activeWarningTab === 'overstock' ? 'active' : ''}`} 
            hoverable 
            onClick={() => handleWarningTabChange('overstock')}
          >
            <Statistic
              title="超储物资"
              value={statistics?.overstock_count || 0}
              prefix={<StockOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} lg={3}>
          <Card className="stat-card">
            <Statistic
              title="零库存"
              value={statistics?.zero_stock_count || 0}
              prefix={<ShopOutlined />}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>
      
      {/* 主内容区 */}
      <Card className="main-card">
        {/* 搜索区域 */}
        <div className="search-area">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder="搜索物资名称/规格/位置"
                prefix={<SearchOutlined />}
                value={searchParams.keyword}
                onChange={(e) => setSearchParams(prev => ({ ...prev, keyword: e.target.value }))}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={4}>
              <Input
                placeholder="物资名称"
                value={searchParams.material_name}
                onChange={(e) => setSearchParams(prev => ({ ...prev, material_name: e.target.value }))}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={4}>
              <Input
                placeholder="规格型号"
                value={searchParams.specification}
                onChange={(e) => setSearchParams(prev => ({ ...prev, specification: e.target.value }))}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={4}>
              <Select
                placeholder="存放位置"
                value={searchParams.location || undefined}
                onChange={(value) => setSearchParams(prev => ({ ...prev, location: value || '' }))}
                allowClear
                style={{ width: '100%' }}
              >
                {locations.map(loc => (
                  <Option key={loc} value={loc}>{loc}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={8} lg={3}>
              <Select
                placeholder="记录状态"
                value={searchParams.status}
                onChange={(value) => setSearchParams(prev => ({ ...prev, status: value }))}
                style={{ width: '100%' }}
              >
                <Option value="all">全部状态</Option>
                <Option value="normal">正常</Option>
                <Option value="locked">锁定</Option>
                <Option value="disabled">禁用</Option>
              </Select>
            </Col>
            <Col xs={24} sm={12} md={8} lg={3}>
              <Select
                placeholder="库存状态"
                value={searchParams.warning_status}
                onChange={(value) => setSearchParams(prev => ({ ...prev, warning_status: value }))}
                style={{ width: '100%' }}
              >
                <Option value="all">全部</Option>
                <Option value="normal">正常</Option>
                <Option value="warning">预警</Option>
                <Option value="urgent">紧急</Option>
                <Option value="overstock">超储</Option>
              </Select>
            </Col>
          </Row>
          <div className="search-buttons">
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
              <Button icon={<ExportOutlined />} onClick={handleExport}>
                导出
              </Button>
            </Space>
          </div>
        </div>
        
        {/* 库存列表 */}
        <Table
          columns={columns}
          dataSource={stockList}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            onChange: (page, pageSize) => loadStockList(page, pageSize)
          }}
        />
      </Card>
      
      {/* 详情弹窗 */}
      <Modal
        title={
          <Space>
            <span>库存详情</span>
            {detailData && detailData.warning_status !== 'normal' && (
              <Tag color={WARNING_STATUS_MAP[detailData.warning_status]?.color || 'default'}>
                {WARNING_STATUS_MAP[detailData.warning_status]?.text || '未知'}
              </Tag>
            )}
          </Space>
        }
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setDetailData(null);
        }}
        footer={null}
        width={1000}
        className="stock-detail-modal"
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
          </div>
        ) : detailData ? (
          <div className="detail-content">
            {/* 基本信息 */}
            <Descriptions title="基本信息" bordered column={3} size="small">
              <Descriptions.Item label="物资名称">{detailData.material_name}</Descriptions.Item>
              <Descriptions.Item label="规格型号">{detailData.specification || '-'}</Descriptions.Item>
              <Descriptions.Item label="单位">{detailData.unit || '-'}</Descriptions.Item>
              <Descriptions.Item label="库存数量">
                <span style={{
                  color: detailData.warning_status === 'urgent' ? '#ff4d4f' : 
                         detailData.warning_status === 'warning' ? '#faad14' : 'inherit',
                  fontWeight: 'bold'
                }}>
                  {parseFloat(detailData.quantity || 0).toFixed(2)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="可领数量">{parseFloat(detailData.available_quantity || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="锁定数量">{parseFloat(detailData.locked_quantity || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="单价">¥{parseFloat(detailData.unit_price || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="库存金额">¥{parseFloat(detailData.total_value || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="记录状态">
                <Tag color={STOCK_STATUS_MAP[detailData.status]?.color || 'default'}>
                  {STOCK_STATUS_MAP[detailData.status]?.text || detailData.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="库存下限">{detailData.min_quantity || '-'}</Descriptions.Item>
              <Descriptions.Item label="预警值">{detailData.warning_quantity || '-'}</Descriptions.Item>
              <Descriptions.Item label="库存上限">{detailData.max_quantity || '-'}</Descriptions.Item>
              <Descriptions.Item label="存放位置" span={3}>{detailData.location || '-'}</Descriptions.Item>
              <Descriptions.Item label="最后入库日期">{detailData.last_stock_in_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="最后出库日期">{detailData.last_out_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(detailData.created_at).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            </Descriptions>
            
            {/* 库存预警提示 */}
            {detailData.warning_status !== 'normal' && (
              <div className="warning-tip">
                <WarningOutlined style={{ 
                  color: detailData.warning_status === 'urgent' ? '#ff4d4f' : '#faad14',
                  marginRight: 8 
                }} />
                <span>{detailData.warning_message}</span>
              </div>
            )}
            
            {/* 出入库记录 */}
            <div className="logs-section">
              <h4>出入库记录</h4>
              <Table
                columns={logColumns}
                dataSource={detailData.logs || []}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 800 }}
                locale={{ emptyText: '暂无记录' }}
              />
            </div>
          </div>
        ) : (
          <Empty description="暂无数据" />
        )}
      </Modal>
    </div>
  );
};

export default StockQuery;
