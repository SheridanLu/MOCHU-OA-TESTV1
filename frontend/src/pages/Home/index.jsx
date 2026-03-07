import { Card, Row, Col, Statistic, Progress, Typography, Space, List, Avatar, Tag } from 'antd';
import {
  ProjectOutlined,
  FileTextOutlined,
  DollarOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

function Home() {
  // 模拟统计数据
  const stats = {
    totalProjects: 156,
    activeProjects: 42,
    pendingContracts: 18,
    totalRevenue: 12860000,
  };

  // 模拟项目列表
  const recentProjects = [
    { id: 1, name: '某某商业综合体项目', status: '进行中', progress: 65, manager: '张三' },
    { id: 2, name: '某某住宅小区工程', status: '已完成', progress: 100, manager: '李四' },
    { id: 3, name: '某某办公楼装修', status: '待审批', progress: 0, manager: '王五' },
    { id: 4, name: '某某厂房建设', status: '进行中', progress: 30, manager: '赵六' },
    { id: 5, name: '某某学校改造', status: '进行中', progress: 85, manager: '钱七' },
  ];

  // 模拟待办事项
  const todoList = [
    { id: 1, title: '审核采购申请单 #2026030701', type: '采购', priority: 'high' },
    { id: 2, title: '确认收入合同 #HT2026030001', type: '合同', priority: 'medium' },
    { id: 3, title: '审批项目立项申请', type: '项目', priority: 'high' },
    { id: 4, title: '查看物资库存预警', type: '库存', priority: 'low' },
  ];

  const getStatusTag = (status) => {
    const statusMap = {
      '进行中': { color: 'processing', icon: <ClockCircleOutlined /> },
      '已完成': { color: 'success', icon: <CheckCircleOutlined /> },
      '待审批': { color: 'warning', icon: <WarningOutlined /> },
    };
    return statusMap[status] || { color: 'default', icon: null };
  };

  const getPriorityTag = (priority) => {
    const priorityMap = {
      high: { color: 'red', text: '紧急' },
      medium: { color: 'orange', text: '中等' },
      low: { color: 'blue', text: '一般' },
    };
    return priorityMap[priority] || { color: 'default', text: '未知' };
  };

  return (
    <div className="home-page">
      <Title level={4} style={{ marginBottom: 24 }}>工作台</Title>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="项目总数"
              value={stats.totalProjects}
              prefix={<ProjectOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="进行中项目"
              value={stats.activeProjects}
              prefix={<ClockCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="待处理合同"
              value={stats.pendingContracts}
              prefix={<FileTextOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Statistic
              title="累计收入（元）"
              value={stats.totalRevenue}
              prefix={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 项目和待办 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 最近项目 */}
        <Col xs={24} lg={14}>
          <Card title="最近项目" extra={<a href="/project/list">查看全部</a>}>
            <List
              itemLayout="horizontal"
              dataSource={recentProjects}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<ProjectOutlined />} style={{ backgroundColor: '#1890ff' }} />}
                    title={
                      <Space>
                        <span>{item.name}</span>
                        <Tag color={getStatusTag(item.status).color} icon={getStatusTag(item.status).icon}>
                          {item.status}
                        </Tag>
                      </Space>
                    }
                    description={`负责人：${item.manager}`}
                  />
                  <div style={{ width: 150 }}>
                    <Progress percent={item.progress} size="small" status={item.progress === 100 ? 'success' : 'active'} />
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* 待办事项 */}
        <Col xs={24} lg={10}>
          <Card title="待办事项" extra={<a href="/todo">查看全部</a>}>
            <List
              itemLayout="horizontal"
              dataSource={todoList}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Avatar icon={<FileTextOutlined />} style={{ backgroundColor: '#faad14' }} />}
                    title={item.title}
                    description={
                      <Space>
                        <Tag>{item.type}</Tag>
                        <Tag color={getPriorityTag(item.priority).color}>
                          {getPriorityTag(item.priority).text}
                        </Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 快捷入口 */}
      <Card title="快捷入口" style={{ marginTop: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable style={{ textAlign: 'center', border: '1px dashed #d9d9d9' }}>
              <ProjectOutlined style={{ fontSize: 32, color: '#1890ff' }} />
              <div style={{ marginTop: 8 }}>新建项目</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable style={{ textAlign: 'center', border: '1px dashed #d9d9d9' }}>
              <FileTextOutlined style={{ fontSize: 32, color: '#52c41a' }} />
              <div style={{ marginTop: 8 }}>合同审批</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable style={{ textAlign: 'center', border: '1px dashed #d9d9d9' }}>
              <TeamOutlined style={{ fontSize: 32, color: '#722ed1' }} />
              <div style={{ marginTop: 8 }}>物资采购</div>
            </Card>
          </Col>
          <Col xs={12} sm={8} md={6} lg={4}>
            <Card hoverable style={{ textAlign: 'center', border: '1px dashed #d9d9d9' }}>
              <DollarOutlined style={{ fontSize: 32, color: '#faad14' }} />
              <div style={{ marginTop: 8 }}>成本报表</div>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

export default Home;
