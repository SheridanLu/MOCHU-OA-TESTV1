import { useState, useEffect } from 'react';
import { Table, Card, Button, Modal, Form, Input, Select, message, Tag, Typography, List, Avatar, Space, Badge } from 'antd';
import { BellOutlined, NotificationOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

function AnnouncementList() {
  const [loading, setLoading] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] = useState(null);

  // 模拟公告数据（实际应从后端获取）
  useEffect(() => {
    const mockData = [
      {
        id: 1,
        title: '系统升级通知',
        content: '系统将于本周六凌晨2点进行升级维护，届时系统将暂停服务约2小时，请提前做好相关准备工作。',
        type: 'system',
        priority: 'high',
        status: 'published',
        publisher: '系统管理员',
        publish_time: '2026-03-10 09:00:00',
        read_count: 156
      },
      {
        id: 2,
        title: '2026年第一季度财务报表发布',
        content: '2026年第一季度财务报表已完成，请各部门负责人登录系统查看详情。',
        type: 'finance',
        priority: 'normal',
        status: 'published',
        publisher: '财务部',
        publish_time: '2026-03-08 14:30:00',
        read_count: 89
      },
      {
        id: 3,
        title: '新员工入职培训通知',
        content: '本月新入职员工培训将于3月15日下午2点在会议室举行，请相关人员准时参加。',
        type: 'hr',
        priority: 'normal',
        status: 'published',
        publisher: '人力资源部',
        publish_time: '2026-03-05 10:00:00',
        read_count: 45
      },
      {
        id: 4,
        title: '办公区域安全提醒',
        content: '近期发现部分办公区域存在安全隐患，请各位同事注意用电安全，下班前检查电器关闭情况。',
        type: 'admin',
        priority: 'high',
        status: 'published',
        publisher: '行政部',
        publish_time: '2026-03-03 16:00:00',
        read_count: 234
      }
    ];
    setAnnouncements(mockData);
  }, []);

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

  return (
    <div className="announcement-list">
      {/* 公告列表 */}
      <Card 
        title={
          <Space>
            <BellOutlined />
            <span>通知公告</span>
            <Badge count={announcements.filter(a => a.priority === 'high').length} />
          </Space>
        }
      >
        <List
          loading={loading}
          itemLayout="horizontal"
          dataSource={announcements}
          renderItem={item => (
            <List.Item
              actions={[
                <Button type="link" onClick={() => showDetail(item)}>查看详情</Button>,
                <Text type="secondary">{dayjs(item.publish_time).format('MM-DD HH:mm')}</Text>
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar 
                    style={{ backgroundColor: typeMap[item.type]?.color || '#1890ff' }}
                    icon={typeMap[item.type]?.icon || <BellOutlined />}
                  />
                }
                title={
                  <Space>
                    {item.priority === 'high' && <Tag color="red">重要</Tag>}
                    <a onClick={() => showDetail(item)}>{item.title}</a>
                  </Space>
                }
                description={
                  <Space split={<Text type="secondary">|</Text>}>
                    <Text type="secondary">{item.publisher}</Text>
                    <Text type="secondary">阅读: {item.read_count}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
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
                <Text type="secondary">发布人: {currentAnnouncement.publisher}</Text>
                <Text type="secondary">发布时间: {currentAnnouncement.publish_time}</Text>
                <Text type="secondary">阅读: {currentAnnouncement.read_count}</Text>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default AnnouncementList;
