/**
 * Task 34: 项目采购清单 - 批量采购与零星采购
 * 实现批量采购和零星采购的管理界面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Select, Modal, Form, message,
  Tag, Tooltip, Popconfirm, Divider, Statistic, Row, Col, Alert,
  Tabs, List, Empty, Spin, Badge, Typography, Upload
} from 'antd';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  ExportOutlined, ImportOutlined, FileAddOutlined, WarningOutlined,
  ShoppingOutlined, EyeOutlined, ReloadOutlined
} from '@ant-design/icons';

const { Search } = Input;
const { Option } = Select;
const { TabPane } = Tabs;
const { Text } = Typography;

const SporadicPurchase = () => {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('lists');
  const [projects, setProjects] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseLists, setPurchaseLists] = useState([]);
  const [batchOrders, setBatchOrders] = useState([]);
  const [sporadicLists, setSporadicLists] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [overview, setOverview] = useState({});

  // 筛选状态
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 分页状态
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  // 弹窗状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [sporadicModalVisible, setSporadicModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [currentDetail, setCurrentDetail] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  // 表单
  const [batchForm] = Form.useForm();
  const [sporadicForm] = Form.useForm();
  const [selectedListItems, setSelectedListItems] = useState([]);

  // 获取项目列表
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?pageSize=1000');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data || []);
      }
    } catch (err) {
      console.error('获取项目列表失败:', err);
    }
  }, []);

  // 获取供应商列表
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/purchase-lists/suppliers');
      const data = await res.json();
      if (data.success) {
        setSuppliers(data.data || []);
      }
    } catch (err) {
      console.error('获取供应商列表失败:', err);
    }
  }, []);

  // 获取采购概览
  const fetchOverview = useCallback(async () => {
    try {
      const params = selectedProjectId ? `?project_id=${selectedProjectId}` : '';
      const res = await fetch(`/api/purchase-lists/overview${params}`);
      const data = await res.json();
      if (data.success) {
        setOverview(data.data);
      }
    } catch (err) {
      console.error('获取采购概览失败:', err);
    }
  }, [selectedProjectId]);

  // 获取采购清单列表
  const fetchPurchaseLists = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.append('project_id', selectedProjectId);
      if (searchKeyword) params.append('keyword', searchKeyword);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const res = await fetch(`/api/purchase-lists?${params}`);
      const data = await res.json();
      if (data.success) {
        // 分离批量采购和零星采购
        const allLists = data.data || [];
        const sporadic = allLists.filter(item => item.sporadic_purchase === 1);
        const regular = allLists.filter(item => item.sporadic_purchase !== 1);
        setPurchaseLists(regular);
        setSporadicLists(sporadic);
        setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
      }
    } catch (err) {
      console.error('获取采购清单失败:', err);
      message.error('获取采购清单失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, searchKeyword, pagination.current, pagination.pageSize]);

  // 获取批量采购订单
  const fetchBatchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.append('project_id', selectedProjectId);
      if (searchKeyword) params.append('keyword', searchKeyword);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const res = await fetch(`/api/purchase-lists/batch-orders?${params}`);
      const data = await res.json();
      if (data.success) {
        setBatchOrders(data.data || []);
      }
    } catch (err) {
      console.error('获取批量采购订单失败:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, searchKeyword, pagination.current, pagination.pageSize]);

  // 获取预警列表
  const fetchWarnings = useCallback(async () => {
    try {
      const params = selectedProjectId ? `?project_id=${selectedProjectId}` : '';
      const res = await fetch(`/api/purchase-lists/warnings${params}`);
      const data = await res.json();
      if (data.success) {
        setWarnings(data.data || []);
      }
    } catch (err) {
      console.error('获取预警列表失败:', err);
    }
  }, [selectedProjectId]);

  // 初始化加载
  useEffect(() => {
    fetchProjects();
    fetchSuppliers();
  }, [fetchProjects, fetchSuppliers]);

  // 筛选变化时重新加载
  useEffect(() => {
    fetchOverview();
    if (activeTab === 'lists') {
      fetchPurchaseLists();
    } else if (activeTab === 'batch') {
      fetchBatchOrders();
    } else if (activeTab === 'warnings') {
      fetchWarnings();
    }
  }, [activeTab, selectedProjectId, searchKeyword, pagination.current, pagination.pageSize]);

  // 查看详情
  const handleViewDetail = async (record, isSporadic = false) => {
    setLoading(true);
    try {
      const url = isSporadic
        ? `/api/purchase-lists/sporadic/${record.id}/items`
        : `/api/purchase-lists/${record.id}/items`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCurrentDetail(data.data.list);
        setDetailItems(data.data.items || []);
        setDetailVisible(true);
      }
    } catch (err) {
      message.error('获取详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建批量采购
  const handleCreateBatch = async () => {
    try {
      const values = await batchForm.validateFields();
      const res = await fetch('/api/purchase-lists/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        setBatchModalVisible(false);
        batchForm.resetFields();
        setSelectedListItems([]);
        fetchBatchOrders();
        fetchOverview();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      console.error('创建批量采购失败:', err);
    }
  };

  // 创建零星采购
  const handleCreateSporadic = async () => {
    try {
      const values = await sporadicForm.validateFields();
      const res = await fetch('/api/purchase-lists/sporadic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        if (data.warning) {
          message.warning(data.warning.message);
        }
        setSporadicModalVisible(false);
        sporadicForm.resetFields();
        fetchPurchaseLists();
        fetchOverview();
        fetchWarnings();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      console.error('创建零星采购失败:', err);
    }
  };

  // 删除采购清单
  const handleDelete = async (id, isSporadic = false) => {
    try {
      const url = isSporadic
        ? `/api/purchase-lists/sporadic/${id}`
        : `/api/purchase-lists/${id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        fetchPurchaseLists();
        fetchOverview();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      message.error('删除失败');
    }
  };

  // 导出
  const handleExport = (record) => {
    window.open(`/api/purchase-lists/sporadic/${record.id}/items/export`, '_blank');
  };

  // 采购清单表格列
  const listColumns = [
    {
      title: '清单编号',
      dataIndex: 'list_id',
      key: 'list_id',
      width: 150,
      render: (text, record) => (
        <a onClick={() => handleViewDetail(record, record.sporadic_purchase === 1)}>
          {text || record.id}
        </a>
      )
    },
    {
      title: '清单名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '物资数量',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 100,
      align: 'center'
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      align: 'right',
      render: (val) => `¥${(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '类型',
      dataIndex: 'sporadic_purchase',
      key: 'type',
      width: 100,
      align: 'center',
      render: (val) => (
        <Tag color={val === 1 ? 'orange' : 'blue'}>
          {val === 1 ? '零星采购' : '常规清单'}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status) => {
        const statusMap = {
          pending: { color: 'default', text: '待处理' },
          approved: { color: 'green', text: '已审批' },
          completed: { color: 'success', text: '已完成' },
          cancelled: { color: 'red', text: '已取消' }
        };
        const s = statusMap[status] || { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record, record.sporadic_purchase === 1)}
          >
            详情
          </Button>
          {record.sporadic_purchase === 1 && (
            <Button
              type="link"
              size="small"
              icon={<ExportOutlined />}
              onClick={() => handleExport(record)}
            >
              导出
            </Button>
          )}
          <Popconfirm
            title="确定要删除此采购清单吗？"
            onConfirm={() => handleDelete(record.id, record.sporadic_purchase === 1)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // 批量采购订单表格列
  const batchColumns = [
    {
      title: '订单编号',
      dataIndex: 'batch_no',
      key: 'batch_no',
      width: 150
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '供应商',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      ellipsis: true
    },
    {
      title: '物资数量',
      dataIndex: 'item_count',
      key: 'item_count',
      width: 100,
      align: 'center'
    },
    {
      title: '总金额',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 120,
      align: 'right',
      render: (val) => `¥${(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status) => {
        const statusMap = {
          pending: { color: 'default', text: '待处理' },
          approved: { color: 'green', text: '已审批' },
          completed: { color: 'success', text: '已完成' },
          cancelled: { color: 'red', text: '已取消' }
        };
        const s = statusMap[status] || { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    }
  ];

  // 详情弹窗物资表格列
  const detailColumns = [
    { title: '序号', width: 60, render: (_, __, index) => index + 1 },
    { title: '材料名称', dataIndex: 'material_name', key: 'material_name' },
    { title: '规格型号', dataIndex: 'specification', key: 'specification' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right'
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      align: 'right',
      render: (val) => `¥${(val || 0).toFixed(2)}`
    },
    {
      title: '总价',
      dataIndex: 'total_price',
      key: 'total_price',
      width: 120,
      align: 'right',
      render: (val) => `¥${(val || 0).toFixed(2)}`
    },
    { title: '备注', dataIndex: 'remarks', key: 'remarks', ellipsis: true }
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 概览统计 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24}>
          <Col span={6}>
            <Statistic
              title="批量采购订单"
              value={overview.batch_purchase?.total_orders || 0}
              suffix="个"
              prefix={<ShoppingOutlined />}
            />
            <Text type="secondary">
              总金额: ¥{(overview.batch_purchase?.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </Text>
          </Col>
          <Col span={6}>
            <Statistic
              title="零星采购清单"
              value={overview.sporadic_purchase?.total_lists || 0}
              suffix="个"
              valueStyle={{ color: '#fa8c16' }}
            />
            <Text type="secondary">
              总金额: ¥{(overview.sporadic_purchase?.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </Text>
          </Col>
          <Col span={6}>
            <Statistic
              title="零星采购占比"
              value={overview.sporadic_purchase?.percent_of_batch || '0.00'}
              suffix="%"
              valueStyle={{
                color: parseFloat(overview.sporadic_purchase?.percent_of_batch || 0) >= 15 ? '#f5222d' : '#52c41a'
              }}
            />
            <Text type="secondary">（阈值: 15%）</Text>
          </Col>
          <Col span={6}>
            <Statistic
              title="活跃预警"
              value={overview.warnings?.active_count || 0}
              suffix="条"
              valueStyle={{ color: overview.warnings?.active_count > 0 ? '#f5222d' : '#52c41a' }}
              prefix={overview.warnings?.active_count > 0 ? <WarningOutlined /> : null}
            />
          </Col>
        </Row>
      </Card>

      {/* 预警提示 */}
      {overview.warnings?.active_count > 0 && (
        <Alert
          message="采购预警"
          description={`当前有 ${overview.warnings?.active_count} 条活跃预警，零星采购占比已达 ${overview.sporadic_purchase?.percent_of_batch || '0.00'}%`}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 主内容区 */}
      <Card>
        {/* 工具栏 */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <Space wrap>
            <Select
              placeholder="选择项目"
              allowClear
              style={{ width: 200 }}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>{p.name}</Option>
              ))}
            </Select>
            <Search
              placeholder="搜索清单名称/项目名称"
              allowClear
              style={{ width: 250 }}
              onSearch={setSearchKeyword}
              onChange={(e) => !e.target.value && setSearchKeyword('')}
            />
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setBatchModalVisible(true)}
            >
              批量采购
            </Button>
            <Button
              icon={<FileAddOutlined />}
              onClick={() => {
                // 检查是否有批量采购记录
                if (selectedProjectId && overview.batch_purchase?.total_orders === 0) {
                  message.warning('该项目没有批量采购记录，无法进行零星采购');
                  return;
                }
                setSporadicModalVisible(true);
              }}
            >
              零星采购
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>
              导入
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => {
              fetchOverview();
              if (activeTab === 'lists') fetchPurchaseLists();
              else if (activeTab === 'batch') fetchBatchOrders();
              else fetchWarnings();
            }}>
              刷新
            </Button>
          </Space>
        </div>

        {/* 标签页 */}
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="采购清单" key="lists">
            <Table
              columns={listColumns}
              dataSource={purchaseLists.concat(sporadicLists)}
              rowKey="id"
              loading={loading}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条`
              }}
              onChange={(p) => setPagination({ ...pagination, current: p.current, pageSize: p.pageSize })}
              scroll={{ x: 1200 }}
            />
          </TabPane>
          <TabPane tab="批量采购订单" key="batch">
            <Table
              columns={batchColumns}
              dataSource={batchOrders}
              rowKey="id"
              loading={loading}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条`
              }}
              onChange={(p) => setPagination({ ...pagination, current: p.current, pageSize: p.pageSize })}
              scroll={{ x: 1000 }}
            />
          </TabPane>
          <TabPane
            tab={
              <Badge count={overview.warnings?.active_count || 0} offset={[10, 0]}>
                预警记录
              </Badge>
            }
            key="warnings"
          >
            {warnings.length > 0 ? (
              <List
                dataSource={warnings}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Tag color={item.warning_level === 'danger' ? 'red' : 'orange'}>
                          {item.warning_level === 'danger' ? '严重' : '警告'}
                        </Tag>
                      }
                      title={`${item.project_name || '未知项目'} - 零星采购占比 ${item.actual_percent}%`}
                      description={item.message}
                    />
                    <Text type="secondary">
                      {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '-'}
                    </Text>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="暂无预警记录" />
            )}
          </TabPane>
        </Tabs>
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="采购清单详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={1000}
      >
        {currentDetail && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Text strong>清单名称: </Text>
                  <Text>{currentDetail.name}</Text>
                </Col>
                <Col span={8}>
                  <Text strong>项目: </Text>
                  <Text>{currentDetail.project_name}</Text>
                </Col>
                <Col span={8}>
                  <Text strong>状态: </Text>
                  <Tag>{currentDetail.status}</Tag>
                </Col>
              </Row>
            </div>
            <Divider>物资明细</Divider>
            <Table
              columns={detailColumns}
              dataSource={detailItems}
              rowKey="id"
              pagination={false}
              size="small"
              summary={() => {
                const totalAmount = detailItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
                const totalQuantity = detailItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong>合计</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong>{totalQuantity}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong>¥{totalAmount.toFixed(2)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} />
                  </Table.Summary.Row>
                );
              }}
            />
          </>
        )}
      </Modal>

      {/* 批量采购弹窗 */}
      <Modal
        title="创建批量采购"
        open={batchModalVisible}
        onOk={handleCreateBatch}
        onCancel={() => {
          setBatchModalVisible(false);
          batchForm.resetFields();
          setSelectedListItems([]);
        }}
        width={800}
      >
        <Form form={batchForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_id"
                label="选择项目"
                rules={[{ required: true, message: '请选择项目' }]}
              >
                <Select placeholder="请选择项目">
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="supplier_id"
                label="选择供应商"
                rules={[{ required: true, message: '请选择供应商' }]}
              >
                <Select placeholder="请选择供应商">
                  {suppliers.map(s => (
                    <Option key={s.id} value={s.id}>{s.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item
            name="items"
            label="采购物资"
            rules={[{ required: true, message: '请添加采购物资' }]}
          >
            <div style={{ marginBottom: 8 }}>
              <Button type="dashed" block icon={<PlusOutlined />}>
                添加物资
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 零星采购弹窗 */}
      <Modal
        title="创建零星采购"
        open={sporadicModalVisible}
        onOk={handleCreateSporadic}
        onCancel={() => {
          setSporadicModalVisible(false);
          sporadicForm.resetFields();
        }}
        width={800}
      >
        {overview.batch_purchase?.total_orders === 0 && selectedProjectId && (
          <Alert
            message="该项目没有批量采购记录，无法进行零星采购"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={sporadicForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_id"
                label="选择项目"
                rules={[{ required: true, message: '请选择项目' }]}
              >
                <Select placeholder="请选择项目">
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
          <Form.Item
            name="items"
            label="采购物资"
            rules={[{ required: true, message: '请添加采购物资' }]}
          >
            <div style={{ marginBottom: 8 }}>
              <Button type="dashed" block icon={<PlusOutlined />}>
                添加物资
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入弹窗 */}
      <Modal
        title="导入采购清单"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={null}
      >
        <Alert
          message="导入说明"
          description="支持 CSV/Excel 格式文件导入，请确保文件包含以下列：材料名称、规格型号、单位、数量、单价、备注"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Upload.Dragger accept=".csv,.xlsx,.xls">
          <p className="ant-upload-drag-icon">
            <ImportOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域</p>
        </Upload.Dragger>
      </Modal>
    </div>
  );
};

// Upload 组件已在顶部导入

export default SporadicPurchase;
