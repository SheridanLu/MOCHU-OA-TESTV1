/**
 * Task 36 & 37: 零星采购管理与预警
 * 功能：
 * - 零星采购列表
 * - 新建零星采购（无需关联合同）
 * - 直接录入物资清单
 * - 审批状态显示
 * - 限额监控（1.5%预警）
 * - 预警提示和处理
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Input, Select, Modal, Form, message,
  Tag, Tooltip, Popconfirm, Divider, Statistic, Row, Col, Alert,
  Descriptions, Steps, List, Empty, Spin, Badge, Typography, InputNumber,
  Progress, Tabs
} from 'antd';
import {
  PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, ReloadOutlined, SendOutlined, CheckOutlined,
  CloseOutlined, WarningOutlined, ShoppingCartOutlined, AlertOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

const { Search } = Input;
const { Option } = Select;
const { TextArea } = Input;
const { Text, Title } = Typography;

const SporadicPurchase = () => {
  // 状态管理
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [sporadicList, setSporadicList] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  // 筛选状态
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [currentDetail, setCurrentDetail] = useState(null);
  const [detailItems, setDetailItems] = useState([]);
  const [detailApprovals, setDetailApprovals] = useState([]);
  const [isEdit, setIsEdit] = useState(false);

  // 表单
  const [form] = Form.useForm();
  const [formItems, setFormItems] = useState([]);

  // 限额检查
  const [limitCheck, setLimitCheck] = useState(null);

  // 预警列表
  const [warnings, setWarnings] = useState([]);
  const [warningPagination, setWarningPagination] = useState({ current: 1, pageSize: 20, total: 0 });

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

  // 获取零星采购列表
  const fetchSporadicList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProjectId) params.append('project_id', selectedProjectId);
      if (selectedStatus) params.append('status', selectedStatus);
      if (searchKeyword) params.append('keyword', searchKeyword);
      params.append('page', pagination.current);
      params.append('pageSize', pagination.pageSize);

      const res = await fetch(`/api/purchase/sporadic?${params}`);
      const data = await res.json();
      if (data.success) {
        setSporadicList(data.data || []);
        setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
      }
    } catch (err) {
      console.error('获取零星采购列表失败:', err);
      message.error('获取零星采购列表失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, selectedStatus, searchKeyword, pagination.current, pagination.pageSize]);

  // 获取预警列表
  const fetchWarnings = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('page', warningPagination.current);
      params.append('pageSize', warningPagination.pageSize);

      const res = await fetch(`/api/purchase/sporadic/warnings?${params}`);
      const data = await res.json();
      if (data.success) {
        setWarnings(data.data || []);
        setWarningPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
      }
    } catch (err) {
      console.error('获取预警列表失败:', err);
    }
  }, [warningPagination.current, warningPagination.pageSize]);

  // 初始化加载
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // 筛选变化时重新加载
  useEffect(() => {
    fetchSporadicList();
  }, [fetchSporadicList]);

  // 检查限额
  const checkLimit = async (projectId, items) => {
    if (!projectId) {
      setLimitCheck(null);
      return;
    }
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price || 0), 0);
    try {
      const res = await fetch(`/api/purchase/sporadic/check-limit?project_id=${projectId}&amount=${totalAmount}`);
      const data = await res.json();
      if (data.success) {
        setLimitCheck(data.data);
      }
    } catch (err) {
      console.error('检查限额失败:', err);
    }
  };

  // 打开新建弹窗
  const handleCreate = () => {
    setIsEdit(false);
    form.resetFields();
    setFormItems([]);
    setLimitCheck(null);
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const handleEdit = async (record) => {
    setIsEdit(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/purchase/sporadic/${record.id}`);
      const data = await res.json();
      if (data.success) {
        form.setFieldsValue({
          project_id: data.data.project_id,
          reason: data.data.reason,
          remark: data.data.remark
        });
        setFormItems(data.data.items || []);
        setLimitCheck(null);
        setModalVisible(true);
      }
    } catch (err) {
      message.error('获取详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 查看详情
  const handleViewDetail = async (record) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchase/sporadic/${record.id}`);
      const data = await res.json();
      if (data.success) {
        setCurrentDetail(data.data);
        setDetailItems(data.data.items || []);
        setDetailApprovals(data.data.approvals || []);
        setDetailVisible(true);
      }
    } catch (err) {
      message.error('获取详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 添加物资项
  const handleAddItem = () => {
    setFormItems([...formItems, {
      key: Date.now(),
      material_name: '',
      specification: '',
      unit: '',
      quantity: 1,
      unit_price: 0,
      remark: ''
    }]);
  };

  // 删除物资项
  const handleRemoveItem = (index) => {
    const newItems = formItems.filter((_, i) => i !== index);
    setFormItems(newItems);
    // 重新检查限额
    const projectId = form.getFieldValue('project_id');
    if (projectId) {
      checkLimit(projectId, newItems);
    }
  };

  // 更新物资项
  const handleUpdateItem = (index, field, value) => {
    const newItems = [...formItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormItems(newItems);
    // 重新检查限额
    const projectId = form.getFieldValue('project_id');
    if (projectId) {
      checkLimit(projectId, newItems);
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (formItems.length === 0) {
        message.error('请添加物资清单');
        return;
      }

      // 验证物资项
      for (const item of formItems) {
        if (!item.material_name || !item.material_name.trim()) {
          message.error('物资名称不能为空');
          return;
        }
        if (!item.quantity || item.quantity <= 0) {
          message.error('数量必须大于0');
          return;
        }
      }

      const body = {
        project_id: values.project_id,
        reason: values.reason,
        remark: values.remark,
        items: formItems
      };

      const url = isEdit 
        ? `/api/purchase/sporadic/${currentDetail?.id}`
        : '/api/purchase/sporadic';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.success) {
        message.success(data.message);
        setModalVisible(false);
        form.resetFields();
        setFormItems([]);
        fetchSporadicList();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      console.error('提交失败:', err);
    }
  };

  // 删除
  const handleDelete = async (id) => {
    try {
      const res = await fetch(`/api/purchase/sporadic/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        fetchSporadicList();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      message.error('删除失败');
    }
  };

  // 提交审批
  const handleSubmitApproval = async (id) => {
    try {
      const res = await fetch(`/api/purchase/sporadic/${id}/submit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        fetchSporadicList();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      message.error('提交审批失败');
    }
  };

  // 审批通过
  const handleApprove = async (id, comment) => {
    try {
      const res = await fetch(`/api/purchase/sporadic/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        setDetailVisible(false);
        fetchSporadicList();
      } else {
        message.error(data.message);
      }
    } catch (err) {
      message.error('审批失败');
    }
  };

  // 审批拒绝
  const handleReject = async (id) => {
    Modal.confirm({
      title: '审批拒绝',
      content: (
        <TextArea
          id="reject-reason"
          placeholder="请输入拒绝原因"
          rows={3}
        />
      ),
      onOk: async () => {
        const reason = document.getElementById('reject-reason')?.value;
        if (!reason?.trim()) {
          message.error('请输入拒绝原因');
          return Promise.reject();
        }
        try {
          const res = await fetch(`/api/purchase/sporadic/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: reason })
          });
          const data = await res.json();
          if (data.success) {
            message.success(data.message);
            setDetailVisible(false);
            fetchSporadicList();
          } else {
            message.error(data.message);
          }
        } catch (err) {
          message.error('操作失败');
        }
      }
    });
  };

  // 处理预警
  const handleWarning = async (warningId) => {
    Modal.confirm({
      title: '处理预警',
      content: (
        <div>
          <p>请确认处理此预警：</p>
          <TextArea
            id="handle-remark"
            placeholder="处理说明（可选）"
            rows={3}
          />
        </div>
      ),
      onOk: async () => {
        const remark = document.getElementById('handle-remark')?.value;
        try {
          const res = await fetch(`/api/purchase/sporadic/warnings/${warningId}/handle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle_remark: remark, status: 'handled' })
          });
          const data = await res.json();
          if (data.success) {
            message.success('预警处理成功');
            fetchWarnings();
          } else {
            message.error(data.message);
          }
        } catch (err) {
          message.error('处理失败');
        }
      }
    });
  };

  // 状态映射
  const statusMap = {
    draft: { color: 'default', text: '草稿' },
    pending: { color: 'processing', text: '待审批' },
    approved: { color: 'success', text: '已通过' },
    rejected: { color: 'error', text: '已拒绝' },
    cancelled: { color: 'default', text: '已取消' }
  };

  // 预警状态映射
  const warningStatusMap = {
    active: { color: 'error', text: '待处理' },
    handled: { color: 'success', text: '已处理' },
    ignored: { color: 'default', text: '已忽略' }
  };

  // 表格列
  const columns = [
    {
      title: '采购编号',
      dataIndex: 'sporadic_no',
      key: 'sporadic_no',
      width: 130,
      render: (text, record) => (
        <a onClick={() => handleViewDetail(record)}>{text}</a>
      )
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '采购原因',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      width: 200
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
      render: (val, record) => {
        const amount = val || 0;
        // 如果该项目超限，显示红色
        return (
          <Text style={{ color: record.is_excessive ? '#ff4d4f' : undefined }}>
            ¥{amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </Text>
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
        const s = statusMap[status] || { color: 'default', text: status };
        return <Tag color={s.color}>{s.text}</Tag>;
      }
    },
    {
      title: '当前审批',
      dataIndex: 'current_approver',
      key: 'current_approver',
      width: 100,
      render: (approver) => approver || '-'
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
      render: (text) => text ? new Date(text).toLocaleString('zh-CN') : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
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
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                编辑
              </Button>
              <Button
                type="link"
                size="small"
                icon={<SendOutlined />}
                onClick={() => handleSubmitApproval(record.id)}
              >
                提交
              </Button>
              <Popconfirm
                title="确定要删除此零星采购吗？"
                onConfirm={() => handleDelete(record.id)}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
          {record.status === 'rejected' && (
            <Popconfirm
              title="确定要删除此零星采购吗？"
              onConfirm={() => handleDelete(record.id)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  // 预警表格列
  const warningColumns = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      ellipsis: true
    },
    {
      title: '批量采购总额',
      dataIndex: 'batch_total',
      key: 'batch_total',
      width: 140,
      align: 'right',
      render: (val) => `¥${(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '零星采购总额',
      dataIndex: 'sporadic_total',
      key: 'sporadic_total',
      width: 140,
      align: 'right',
      render: (val) => `¥${(val || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
    },
    {
      title: '占比',
      dataIndex: 'percentage',
      key: 'percentage',
      width: 120,
      align: 'center',
      render: (percentage) => {
        const isExcessive = percentage > 1.5;
        return (
          <Space>
            <Text strong style={{ color: isExcessive ? '#ff4d4f' : undefined }}>
              {percentage ? `${percentage.toFixed(2)}%` : '-'}
            </Text>
            {isExcessive && (
              <Tooltip title="超出1.5%限额">
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
              </Tooltip>
            )}
          </Space>
        );
      }
    },
    {
      title: '预警消息',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (status) => {
        const s = warningStatusMap[status] || { color: 'default', text: status };
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
      width: 100,
      fixed: 'right',
      render: (_, record) => {
        if (record.status === 'active') {
          return (
            <Button
              type="link"
              size="small"
              onClick={() => handleWarning(record.id)}
            >
              处理
            </Button>
          );
        }
        if (record.handler_name) {
          return (
            <Tooltip title={`处理人: ${record.handler_name}`}>
              <Text type="secondary">{record.handler_name}</Text>
            </Tooltip>
          );
        }
        return '-';
      }
    }
  ];

  // 物资表格列（表单中）
  const itemColumns = [
    {
      title: '材料名称',
      dataIndex: 'material_name',
      width: 150,
      render: (val, _, index) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateItem(index, 'material_name', e.target.value)}
          placeholder="材料名称"
        />
      )
    },
    {
      title: '规格型号',
      dataIndex: 'specification',
      width: 100,
      render: (val, _, index) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateItem(index, 'specification', e.target.value)}
          placeholder="规格"
        />
      )
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      render: (val, _, index) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateItem(index, 'unit', e.target.value)}
          placeholder="单位"
        />
      )
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      render: (val, _, index) => (
        <InputNumber
          value={val}
          onChange={(v) => handleUpdateItem(index, 'quantity', v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '单价',
      dataIndex: 'unit_price',
      width: 100,
      render: (val, _, index) => (
        <InputNumber
          value={val}
          onChange={(v) => handleUpdateItem(index, 'unit_price', v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          prefix="¥"
        />
      )
    },
    {
      title: '总价',
      key: 'total_price',
      width: 100,
      render: (_, record) => {
        const total = (record.quantity || 0) * (record.unit_price || 0);
        return <Text>¥{total.toFixed(2)}</Text>;
      }
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 100,
      render: (val, _, index) => (
        <Input
          value={val}
          onChange={(e) => handleUpdateItem(index, 'remark', e.target.value)}
          placeholder="备注"
        />
      )
    },
    {
      title: '操作',
      width: 60,
      render: (_, __, index) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(index)}
        />
      )
    }
  ];

  // 详情物资表格列
  const detailItemColumns = [
    { title: '序号', width: 60, render: (_, __, index) => index + 1 },
    { title: '材料名称', dataIndex: 'material_name', key: 'material_name' },
    { title: '规格型号', dataIndex: 'specification', key: 'specification' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' },
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
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true }
  ];

  // 计算表单总金额
  const formTotalAmount = formItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0);

  // 计算限额进度条百分比
  const limitPercent = limitCheck ? Math.min((limitCheck.percentage / 1.5) * 100, 150) : 0;

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col flex="auto">
            <h2 style={{ margin: 0 }}>
              <ShoppingCartOutlined style={{ marginRight: 8 }} />
              零星采购管理
            </h2>
            <Text type="secondary">非合同采购流程，无需关联合同</Text>
          </Col>
          <Col>
            <Button 
              icon={<AlertOutlined />}
              onClick={() => {
                fetchWarnings();
                setWarningModalVisible(true);
              }}
            >
              预警管理
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 限额预警提示 - 在表单弹窗外显示 */}
      {limitCheck?.isExcessive && (
        <Alert
          message="限额预警"
          description={
            <div>
              <p>当前零星采购金额将超出批量采购的1.5%限额！</p>
              <p>
                批量采购总额：¥{limitCheck.batchAmount?.toFixed(2) || '0.00'}，
                零星采购累计：¥{limitCheck.totalAmount?.toFixed(2) || '0.00'}，
                占比：<Text strong style={{ color: '#ff4d4f' }}>{limitCheck.percentage?.toFixed(2) || '0.00'}%</Text>
                （限额 1.5%）
              </p>
              <p>提交后需预算员额外审批</p>
            </div>
          }
          type="error"
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
            <Select
              placeholder="选择状态"
              allowClear
              style={{ width: 120 }}
              value={selectedStatus}
              onChange={setSelectedStatus}
            >
              <Option value="draft">草稿</Option>
              <Option value="pending">待审批</Option>
              <Option value="approved">已通过</Option>
              <Option value="rejected">已拒绝</Option>
            </Select>
            <Search
              placeholder="搜索编号/原因"
              allowClear
              style={{ width: 200 }}
              onSearch={setSearchKeyword}
              onChange={(e) => !e.target.value && setSearchKeyword('')}
            />
          </Space>
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              新建零星采购
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchSporadicList}>
              刷新
            </Button>
          </Space>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={sporadicList}
          rowKey="id"
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`
          }}
          onChange={(p) => setPagination({ ...pagination, current: p.current, pageSize: p.pageSize })}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* 新建/编辑弹窗 */}
      <Modal
        title={isEdit ? '编辑零星采购' : '新建零星采购'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setFormItems([]);
          setLimitCheck(null);
        }}
        width={950}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="project_id"
                label="关联项目"
                rules={[{ required: true, message: '请选择项目' }]}
              >
                <Select 
                  placeholder="选择项目"
                  onChange={(val) => checkLimit(val, formItems)}
                >
                  {projects.map(p => (
                    <Option key={p.id} value={p.id}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="预计总金额">
                <Text strong style={{ fontSize: 18, color: limitCheck?.isExcessive ? '#ff4d4f' : '#1890ff' }}>
                  ¥{formTotalAmount.toFixed(2)}
                </Text>
              </Form.Item>
            </Col>
          </Row>

          {/* 限额监控卡片 */}
          {limitCheck && (
            <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Row gutter={24}>
                <Col span={8}>
                  <Statistic 
                    title="批量采购总额" 
                    value={limitCheck.batchAmount || 0} 
                    prefix="¥"
                    precision={2}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="零星采购累计" 
                    value={limitCheck.totalAmount || 0} 
                    prefix="¥"
                    precision={2}
                    valueStyle={{ color: limitCheck.isExcessive ? '#ff4d4f' : undefined }}
                  />
                </Col>
                <Col span={8}>
                  <Statistic 
                    title="占比" 
                    value={limitCheck.percentage || 0} 
                    suffix="%"
                    precision={2}
                    valueStyle={{ color: limitCheck.isExcessive ? '#ff4d4f' : undefined }}
                  />
                  <Progress 
                    percent={limitPercent} 
                    size="small"
                    strokeColor={limitCheck.isExcessive ? '#ff4d4f' : '#1890ff'}
                    format={() => `限额 1.5%`}
                  />
                </Col>
              </Row>
            </Card>
          )}

          <Form.Item
            name="reason"
            label="采购原因"
            rules={[{ required: true, message: '请填写采购原因' }]}
          >
            <TextArea rows={2} placeholder="请说明本次零星采购的原因" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={1} placeholder="备注信息（可选）" />
          </Form.Item>

          <Divider>物资清单</Divider>

          <div style={{ marginBottom: 8 }}>
            <Button type="dashed" block icon={<PlusOutlined />} onClick={handleAddItem}>
              添加物资
            </Button>
          </div>

          <Table
            columns={itemColumns}
            dataSource={formItems}
            rowKey="key"
            pagination={false}
            size="small"
            scroll={{ x: 800 }}
            locale={{ emptyText: '请添加物资' }}
          />

          {formItems.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Text type="secondary">合计： </Text>
              <Text strong style={{ fontSize: 16 }}>
                ¥{formTotalAmount.toFixed(2)}
              </Text>
            </div>
          )}
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title="零星采购详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={
          currentDetail?.status === 'pending' ? (
            <Space>
              <Button onClick={() => setDetailVisible(false)}>关闭</Button>
              <Button danger onClick={() => handleReject(currentDetail.id)}>
                拒绝
              </Button>
              <Button type="primary" onClick={() => {
                Modal.confirm({
                  title: '审批确认',
                  content: '确定通过此零星采购申请？',
                  onOk: () => handleApprove(currentDetail.id, '同意')
                });
              }}>
                通过
              </Button>
            </Space>
          ) : null
        }
        width={900}
      >
        {currentDetail && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="采购编号">{currentDetail.sporadic_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[currentDetail.status]?.color}>
                  {statusMap[currentDetail.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="关联项目">{currentDetail.project_name}</Descriptions.Item>
              <Descriptions.Item label="总金额">
                <Text strong style={{ color: '#1890ff' }}>
                  ¥{(currentDetail.total_amount || 0).toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="采购原因" span={2}>{currentDetail.reason}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{currentDetail.remark || '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{currentDetail.creator_name}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {currentDetail.created_at ? new Date(currentDetail.created_at).toLocaleString('zh-CN') : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider>物资清单</Divider>

            <Table
              columns={detailItemColumns}
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
                      <Text strong>{totalQuantity.toFixed(2)}</Text>
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

            {detailApprovals.length > 0 && (
              <>
                <Divider>审批流程</Divider>
                <Steps
                  current={detailApprovals.findIndex(a => a.action === 'pending')}
                  status={currentDetail.status === 'rejected' ? 'error' : 'process'}
                  items={detailApprovals.map(a => ({
                    title: a.step_name,
                    description: a.action === 'pending' 
                      ? '待审批' 
                      : a.action === 'approve'
                        ? `${a.approver_name || '已通过'}${a.comment ? `: ${a.comment}` : ''}`
                        : `${a.approver_name || '已拒绝'}: ${a.comment || ''}`,
                    status: a.action === 'pending' 
                      ? 'wait' 
                      : a.action === 'approve' 
                        ? 'finish' 
                        : 'error'
                  }))}
                />
              </>
            )}
          </>
        )}
      </Modal>

      {/* 预警管理弹窗 */}
      <Modal
        title={
          <Space>
            <AlertOutlined />
            零星采购预警管理
          </Space>
        }
        open={warningModalVisible}
        onCancel={() => setWarningModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setWarningModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={1000}
      >
        <Alert
          message="预警说明"
          description="当零星采购累计金额超出批量采购总额的1.5%时，系统将自动生成预警。超限的采购申请需预算员额外审批。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          columns={warningColumns}
          dataSource={warnings}
          rowKey="id"
          pagination={{
            ...warningPagination,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }}
          onChange={(p) => setWarningPagination({ ...warningPagination, current: p.current, pageSize: p.pageSize })}
        />
      </Modal>
    </div>
  );
};

export default SporadicPurchase;
