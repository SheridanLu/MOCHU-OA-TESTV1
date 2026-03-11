import { useState, useEffect } from 'react';
import { Table, Card, Button, Tag, Space, Modal, Form, Input, DatePicker, InputNumber, Select, message, Tabs, Badge, Descriptions, Statistic, Row, Col } from 'antd';
import dayjs from 'dayjs';
import axios from 'axios';

const { RangePicker } = DatePicker;
const { Option } = Select;

function PaymentList() {
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [laborPayments, setLaborPayments] = useState([]);
  const [materialPayments, setMaterialPayments] = useState([]);
  const [statistics, setStatistics] = useState({
    totalPending: 0,
    totalPaid: 0,
    laborTotal: 0,
    materialTotal: 0
  });

  // 获取付款数据
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // 并行获取人工费和材料款
      const [laborRes, materialRes] = await Promise.all([
        axios.get('http://localhost:3001/api/labor-payments', { headers }),
        axios.get('http://localhost:3001/api/material-payments', { headers })
      ]);

      const labor = laborRes.data.data || [];
      const material = materialRes.data.data || [];

      setLaborPayments(labor);
      setMaterialPayments(material);

      // 计算统计数据
      const laborPaid = labor.filter(p => p.status === 'paid').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const laborPending = labor.filter(p => p.status === 'pending').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const materialPaid = material.filter(p => p.status === 'paid').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const materialPending = material.filter(p => p.status === 'pending').reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

      setStatistics({
        totalPending: laborPending + materialPending,
        totalPaid: laborPaid + materialPaid,
        laborTotal: laborPending + laborPaid,
        materialTotal: materialPending + materialPaid
      });
    } catch (error) {
      console.error('获取付款数据失败:', error);
      message.error('获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理付款
  const handlePay = async (type, id) => {
    try {
      const token = localStorage.getItem('token');
      const url = type === 'labor' 
        ? `http://localhost:3001/api/labor-payments/${id}/pay`
        : `http://localhost:3001/api/material-payments/${id}/pay`;
      
      await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } });
      message.success('付款成功');
      fetchData();
    } catch (error) {
      message.error('付款失败');
    }
  };

  // 状态标签
  const renderStatus = (status) => {
    const statusMap = {
      pending: { color: 'orange', text: '待付款' },
      paid: { color: 'green', text: '已付款' },
      cancelled: { color: 'red', text: '已取消' }
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 人工费表格列
  const laborColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '关联对账单', dataIndex: 'statement_id', key: 'statement_id', width: 100 },
    { title: '收款人', dataIndex: 'payee_name', key: 'payee_name' },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v) => `¥${parseFloat(v).toLocaleString()}` },
    { title: '状态', dataIndex: 'status', key: 'status', render: renderStatus },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        record.status === 'pending' && (
          <Button type="link" onClick={() => handlePay('labor', record.id)}>
            确认付款
          </Button>
        )
      )
    }
  ];

  // 材料款表格列
  const materialColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '关联入库单', dataIndex: 'stock_in_id', key: 'stock_in_id', width: 100 },
    { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name' },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v) => `¥${parseFloat(v).toLocaleString()}` },
    { title: '状态', dataIndex: 'status', key: 'status', render: renderStatus },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        record.status === 'pending' && (
          <Button type="link" onClick={() => handlePay('material', record.id)}>
            确认付款
          </Button>
        )
      )
    }
  ];

  return (
    <div className="payment-list">
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待付款总额"
              value={statistics.totalPending}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已付款总额"
              value={statistics.totalPaid}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="人工费总额"
              value={statistics.laborTotal}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="材料款总额"
              value={statistics.materialTotal}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
      </Row>

      {/* 标签页 */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab="全部" key="all">
            <Table
              loading={loading}
              dataSource={[...laborPayments.map(p => ({ ...p, type: 'labor' })), ...materialPayments.map(p => ({ ...p, type: 'material' }))]}
              columns={[
                { title: '类型', dataIndex: 'type', key: 'type', render: (v) => v === 'labor' ? '人工费' : '材料款' },
                { title: '收款方', dataIndex: 'payee_name', key: 'payee_name', render: (v, r) => v || r.supplier_name },
                { title: '金额', dataIndex: 'amount', key: 'amount', render: (v) => `¥${parseFloat(v).toLocaleString()}` },
                { title: '状态', dataIndex: 'status', key: 'status', render: renderStatus },
                { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
              ]}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>
          <Tabs.TabPane tab={`人工费 (${laborPayments.length})`} key="labor">
            <Table
              loading={loading}
              dataSource={laborPayments}
              columns={laborColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>
          <Tabs.TabPane tab={`材料款 (${materialPayments.length})`} key="material">
            <Table
              loading={loading}
              dataSource={materialPayments}
              columns={materialColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>
  );
}

export default PaymentList;
