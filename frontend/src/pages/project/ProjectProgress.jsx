import { useState, useEffect } from 'react';
import { Table, Card, Progress, Tag, Button, Modal, Form, Input, DatePicker, Select, message, Timeline, Row, Col, Statistic } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';

const { Option } = Select;
const { TextArea } = Input;

function ProjectProgress() {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [milestones, setMilestones] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // 获取项目列表
      const projectRes = await axios.get('http://localhost:3001/api/projects?pageSize=100', { headers });
      const projectList = projectRes.data.data || [];

      // 获取里程碑
      const milestoneRes = await axios.get('http://localhost:3001/api/construction/milestones', { headers });
      const milestoneList = milestoneRes.data.data || [];

      setProjects(projectList);
      setMilestones(milestoneList);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 计算项目进度
  const getProjectProgress = (projectId) => {
    const projectMilestones = milestones.filter(m => m.project_id === projectId);
    if (projectMilestones.length === 0) return 0;
    const completed = projectMilestones.filter(m => m.status === 'completed').length;
    return Math.round((completed / projectMilestones.length) * 100);
  };

  // 状态标签
  const renderStatus = (status) => {
    const statusMap = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: '待开始' },
      in_progress: { color: 'processing', icon: <ClockCircleOutlined />, text: '进行中' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
      delayed: { color: 'error', icon: <CloseCircleOutlined />, text: '已延期' }
    };
    const config = statusMap[status] || statusMap.pending;
    return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
  };

  // 项目表格列
  const columns = [
    { title: '项目编号', dataIndex: 'project_no', key: 'project_no', width: 120 },
    { title: '项目名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (v) => v === 'entity' ? '实体项目' : '虚拟项目' },
    { 
      title: '进度', 
      key: 'progress',
      render: (_, record) => {
        const progress = getProjectProgress(record.id);
        return (
          <Progress 
            percent={progress} 
            size="small"
            status={progress === 100 ? 'success' : progress < 50 ? 'exception' : 'active'}
          />
        );
      }
    },
    { title: '状态', dataIndex: 'status', key: 'status', render: renderStatus },
    { title: '开始日期', dataIndex: 'start_date', key: 'start_date' },
    { title: '结束日期', dataIndex: 'end_date', key: 'end_date' },
  ];

  // 统计
  const stats = {
    total: projects.length,
    entity: projects.filter(p => p.type === 'entity').length,
    virtual: projects.filter(p => p.type === 'virtual').length,
    completed: projects.filter(p => p.status === 'completed').length
  };

  return (
    <div className="project-progress">
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="总项目数" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="实体项目" value={stats.entity} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="虚拟项目" value={stats.virtual} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已完成" value={stats.completed} />
          </Card>
        </Col>
      </Row>

      {/* 项目列表 */}
      <Card title="项目进度列表">
        <Table
          loading={loading}
          dataSource={projects}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) => {
              const projectMilestones = milestones.filter(m => m.project_id === record.id);
              if (projectMilestones.length === 0) {
                return <div style={{ padding: 12 }}>暂无里程碑</div>;
              }
              return (
                <Timeline
                  items={projectMilestones.map(m => ({
                    color: m.status === 'completed' ? 'green' : m.status === 'delayed' ? 'red' : 'blue',
                    children: (
                      <div>
                        <strong>{m.name}</strong>
                        <br />
                        <small>计划: {m.planned_date} | {renderStatus(m.status)}</small>
                      </div>
                    )
                  }))}
                />
              );
            }
          }}
        />
      </Card>
    </div>
  );
}

export default ProjectProgress;
