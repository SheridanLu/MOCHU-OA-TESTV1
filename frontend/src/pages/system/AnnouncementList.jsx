import { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, message, Tag, Typography, Space, Badge, Popconfirm } from 'antd';
import { BellOutlined, NotificationOutlined, FileTextOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

function AnnouncementList() {
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add' | 'edit'
  const [form] = Form.useForm();

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const response = await api.get('/announcements');
      if (response.data.success) {
        setAnnouncements(response.data.data || []);
      }
    } catch (error) {
      console.error('获取公告失败:', error);
      // 如果API失败，使用模拟数据
      setAnnouncements([
        {
          id: 1,
          title: '系统升级通知',
          content: '系统将于本周六凌晨2点进行升级维护，届时系统将暂停服务约2小时，请提前做好相关准备工作。',
          type: 'system',
          priority: 'high',
          status: 'published',
          publisher_name: '系统管理员',
          publish_time: '2026-03-10 09:00:00',
          read_count: 156
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 类型标签
  const typeMap = {
    system: { color: 'blue', icon: <NotificationOutlined />, text: '系统公告' },
    finance: { color: 'green', icon: <FileTextOutlined />, text: '财务公告' },
    hr: { color: 'purple', icon: <BellOutlined />, text: '人事公告' },
    admin: { color: 'orange', icon: <BellOutlined />, text: '行政公告' }
  };

  const priorityMap = {
    high: { color: 'red', text: '重要' },
    normal: { color: 'default', text: '普通' }
  };

  // 查看详情
  const showDetail = (record) => {
    setCurrentAnnouncement(record);
    setDetailVisible(true);
  };

  // 打开新增弹窗
  const openAddModal = () => {
    setModalType('add');
    form.resetFields();
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const openEditModal = (record) => {
    setModalType('edit');
    form.setFieldsValue({
      title: record.title,
      content: record.content,
      type: record.type,
      priority: record.priority
    });
    setCurrentAnnouncement(record);
    setModalVisible(true);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (modalType === 'add') {
        const response = await api.post('/announcements', values);
        if (response.data.success) {
          message.success('公告发布成功');
          fetchAnnouncements();
        }
      } else {
        const response = await api.put(`/announcements/${currentAnnouncement.id}`, values);
        if (response.data.success) {
          message.success('公告更新成功');
          fetchAnnouncements();
        }
      }
      
      setModalVisible(false);
    } catch (error) {
      console.error('操作失败:', error);
      message.error('操作失败');
    }
  };

  // 删除公告
  const handleDelete = async (id) => {
    try {
      const response = await api.delete(`/announcements/${id}`);
      if (response.data.success) {
        message.success('公告删除成功');
        fetchAnnouncements();
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  // 撤回公告
  const handleRevoke = async (id) => {
    try {
      const response = await api.post(`/announcements/${id}/revoke`);
      if (response.data.success) {
        message.success('公告已撤回');
        fetchAnnouncements();
      }
    } catch (error) {
      message.error('撤回失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Space>
          {record.priority === 'high' && <Tag color="red">重要</Tag>}
          <a onClick={() => showDetail(record)}>{text}</a>
        </Space>
      )
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => {
        const config = typeMap[type] || typeMap.system;
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '发布人',
      dataIndex: 'publisher_name',
      key: 'publisher_name',
      width: 100
    },
    {
      title: '阅读数',
      dataIndex: 'read_count',
      key: 'read_count',
      width: 80,
      render: (count) => <Badge count={count} showZero color="blue" />
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status) => (
        <Tag color={status === 'published' ? 'green' : 'default'}>
          {status === 'published' ? '已发布' : '已撤回'}
        </Tag>
      )
    },
    {
      title: '发布时间',
      dataIndex: 'publish_time',
      key: 'publish_time',
      width: 150,
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>
            查看
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          {record.status === 'published' && (
            <Button type="link" size="small" onClick={() => handleRevoke(record.id)}>
              撤回
            </Button>
          )}
          <Popconfirm
            title="确定要删除这个公告吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div className="announcement-list">
      <Card 
        title={
          <Space>
            <BellOutlined />
            <span>通知公告管理</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            发布公告
          </Button>
        }
      >
        <Table
          loading={loading}
          dataSource={announcements}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={currentAnnouncement?.title}
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {currentAnnouncement && (
          <div>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={typeMap[currentAnnouncement.type]?.color}>
                {typeMap[currentAnnouncement.type]?.text}
              </Tag>
              {currentAnnouncement.priority === 'high' && (
                <Tag color="red">重要公告</Tag>
              )}
            </Space>
            <Paragraph style={{ fontSize: 16, lineHeight: 1.8 }}>
              {currentAnnouncement.content}
            </Paragraph>
            <div style={{ marginTop: 24, color: '#999' }}>
              <Space split={<Text type="secondary">|</Text>}>
                <Text type="secondary">发布人: {currentAnnouncement.publisher_name}</Text>
                <Text type="secondary">发布时间: {currentAnnouncement.publish_time}</Text>
                <Text type="secondary">阅读: {currentAnnouncement.read_count}</Text>
              </Space>
            </div>
          </div>
        )}
      </Modal>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={modalType === 'add' ? '发布公告' : '编辑公告'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="公告标题"
            rules={[{ required: true, message: '请输入公告标题' }]}
          >
            <Input placeholder="请输入公告标题" />
          </Form.Item>
          <Form.Item
            name="content"
            label="公告内容"
            rules={[{ required: true, message: '请输入公告内容' }]}
          >
            <TextArea rows={6} placeholder="请输入公告内容" />
          </Form.Item>
          <Form.Item name="type" label="公告类型" initialValue="system">
            <Select>
              <Option value="system">系统公告</Option>
              <Option value="finance">财务公告</Option>
              <Option value="hr">人事公告</Option>
              <Option value="admin">行政公告</Option>
            </Select>
          </Form.Item>
          <Form.Item name="priority" label="优先级" initialValue="normal">
            <Select>
              <Option value="normal">普通</Option>
              <Option value="high">重要</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default AnnouncementList;
