import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Input,
  Select,
  Button,
  Space,
  Row,
  Col,
  List,
  Avatar,
  Modal,
  Descriptions,
  Tag,
  Tooltip,
  Empty,
  Spin,
  message,
  Typography
} from 'antd';
import {
  SearchOutlined,
  PhoneOutlined,
  MailOutlined,
  UserOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  ReloadOutlined,
  TeamOutlined
} from '@ant-design/icons';
import './Directory.css';

const { Option } = Select;
const { Title, Text } = Typography;

// API 基础地址
const API_BASE = 'http://localhost:3001/api';

// 获取请求头
function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// 生成随机头像颜色
function getAvatarColor(name) {
  if (!name) return '#1890ff';
  const colors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#1890ff', '#52c41a', '#eb2f96'];
  const charCode = name.charCodeAt(0) || 0;
  return colors[charCode % colors.length];
}

// 获取姓名首字
function getNameInitial(name) {
  if (!name) return '?';
  return name.charAt(0);
}

// 通讯录页面
function Directory() {
  // 状态
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'list'

  // 搜索和筛选条件
  const [keyword, setKeyword] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  // 详情弹窗
  const [detailVisible, setDetailVisible] = useState(false);
  const [currentContact, setCurrentContact] = useState(null);

  // 加载部门列表（用于筛选）
  const loadDepartments = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/directory/departments`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setDepartments(result.data || []);
      }
    } catch (error) {
      console.error('加载部门列表失败:', error);
    }
  }, []);

  // 加载通讯录列表
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      if (keyword) params.append('keyword', keyword);
      if (departmentFilter) params.append('department', departmentFilter);

      const response = await fetch(`${API_BASE}/directory?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();

      if (result.success) {
        setContacts(result.data || []);
      } else {
        message.error(result.message || '加载通讯录失败');
      }
    } catch (error) {
      console.error('加载通讯录失败:', error);
      message.error('加载通讯录失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, departmentFilter]);

  // 初始化加载
  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // 搜索
  const handleSearch = () => {
    loadContacts();
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword('');
    setDepartmentFilter('');
  };

  // 查看详情
  const handleViewDetail = async (contact) => {
    try {
      const response = await fetch(`${API_BASE}/directory/${contact.id}`, {
        headers: getAuthHeaders()
      });
      const result = await response.json();
      if (result.success) {
        setCurrentContact(result.data);
        setDetailVisible(true);
      } else {
        message.error(result.message || '获取联系人详情失败');
      }
    } catch (error) {
      console.error('获取联系人详情失败:', error);
      message.error('获取联系人详情失败');
    }
  };

  // 一键拨打电话
  const handleCall = (phone) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  // 一键发送邮件
  const handleEmail = (email) => {
    if (email) {
      window.location.href = `mailto:${email}`;
    }
  };

  // 按部门分组
  const groupByDepartment = (contacts) => {
    const groups = {};
    contacts.forEach(contact => {
      const deptName = contact.department_name || '未分配部门';
      if (!groups[deptName]) {
        groups[deptName] = [];
      }
      groups[deptName].push(contact);
    });
    return groups;
  };

  // 卡片视图渲染
  const renderCardView = () => {
    const grouped = groupByDepartment(contacts);
    const deptNames = Object.keys(grouped);

    if (deptNames.length === 0) {
      return <Empty description="暂无联系人" />;
    }

    return (
      <div className="directory-card-container">
        {deptNames.map(deptName => (
          <div key={deptName} className="department-section">
            <div className="department-header">
              <TeamOutlined /> {deptName}
              <span className="department-count">{grouped[deptName].length} 人</span>
            </div>
            <Row gutter={[16, 16]}>
              {grouped[deptName].map(contact => (
                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={contact.id}>
                  <Card
                    hoverable
                    className="contact-card"
                    onClick={() => handleViewDetail(contact)}
                  >
                    <div className="contact-avatar">
                      <Avatar
                        size={64}
                        style={{ backgroundColor: getAvatarColor(contact.real_name) }}
                      >
                        {getNameInitial(contact.real_name)}
                      </Avatar>
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">{contact.real_name}</div>
                      <div className="contact-position">{contact.position || '未设置职位'}</div>
                      <div className="contact-department">{contact.department_name || '-'}</div>
                    </div>
                    <div className="contact-actions">
                      <Tooltip title="拨打电话">
                        <Button
                          type="text"
                          icon={<PhoneOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCall(contact.phone);
                          }}
                          disabled={!contact.phone}
                        />
                      </Tooltip>
                      <Tooltip title="发送邮件">
                        <Button
                          type="text"
                          icon={<MailOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEmail(contact.company_email || contact.email);
                          }}
                          disabled={!contact.company_email && !contact.email}
                        />
                      </Tooltip>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        ))}
      </div>
    );
  };

  // 列表视图渲染
  const renderListView = () => {
    const grouped = groupByDepartment(contacts);
    const deptNames = Object.keys(grouped);

    if (deptNames.length === 0) {
      return <Empty description="暂无联系人" />;
    }

    return (
      <div className="directory-list-container">
        {deptNames.map(deptName => (
          <div key={deptName} className="department-section">
            <div className="department-header">
              <TeamOutlined /> {deptName}
              <span className="department-count">{grouped[deptName].length} 人</span>
            </div>
            <List
              itemLayout="horizontal"
              dataSource={grouped[deptName]}
              renderItem={contact => (
                <List.Item
                  className="contact-list-item"
                  onClick={() => handleViewDetail(contact)}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        size={48}
                        style={{ backgroundColor: getAvatarColor(contact.real_name) }}
                      >
                        {getNameInitial(contact.real_name)}
                      </Avatar>
                    }
                    title={
                      <Space>
                        <span>{contact.real_name}</span>
                        {contact.position && <Tag color="blue">{contact.position}</Tag>}
                      </Space>
                    }
                    description={
                      <Space split="|" size="small">
                        <span>{contact.department_name || '未分配部门'}</span>
                        {contact.phone && <span><PhoneOutlined /> {contact.phone}</span>}
                        {(contact.company_email || contact.email) && (
                          <span><MailOutlined /> {contact.company_email || contact.email}</span>
                        )}
                      </Space>
                    }
                  />
                  <Space>
                    <Tooltip title="拨打电话">
                      <Button
                        type="primary"
                        ghost
                        icon={<PhoneOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCall(contact.phone);
                        }}
                        disabled={!contact.phone}
                      />
                    </Tooltip>
                    <Tooltip title="发送邮件">
                      <Button
                        type="primary"
                        ghost
                        icon={<MailOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEmail(contact.company_email || contact.email);
                        }}
                        disabled={!contact.company_email && !contact.email}
                      />
                    </Tooltip>
                  </Space>
                </List.Item>
              )}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="directory-container">
      <Card className="directory-card">
        {/* 标题和视图切换 */}
        <div className="directory-header">
          <Title level={4}>
            <UserOutlined /> 企业通讯录
          </Title>
          <Space>
            <Button
              type={viewMode === 'card' ? 'primary' : 'default'}
              icon={<AppstoreOutlined />}
              onClick={() => setViewMode('card')}
            >
              卡片
            </Button>
            <Button
              type={viewMode === 'list' ? 'primary' : 'default'}
              icon={<UnorderedListOutlined />}
              onClick={() => setViewMode('list')}
            >
              列表
            </Button>
          </Space>
        </div>

        {/* 搜索和筛选区域 */}
        <div className="filter-section">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8} lg={6}>
              <Input
                placeholder="搜索姓名/手机/邮箱/拼音"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={5}>
              <Select
                placeholder="选择部门"
                value={departmentFilter}
                onChange={(value) => {
                  setDepartmentFilter(value);
                }}
                allowClear
                style={{ width: '100%' }}
              >
                {departments.map(dept => (
                  <Option key={dept.id} value={dept.id}>{dept.name}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={24} md={8} lg={6}>
              <Space wrap>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                  搜索
                </Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>
                  重置
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        {/* 联系人列表 */}
        <Spin spinning={loading}>
          {viewMode === 'card' ? renderCardView() : renderListView()}
        </Spin>

        {/* 统计信息 */}
        {!loading && contacts.length > 0 && (
          <div className="directory-footer">
            <Text type="secondary">共 {contacts.length} 位联系人</Text>
          </div>
        )}
      </Card>

      {/* 联系人详情弹窗 */}
      <Modal
        title="联系人详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailVisible(false)}>
            关闭
          </Button>,
          currentContact?.phone && (
            <Button
              key="call"
              type="primary"
              icon={<PhoneOutlined />}
              onClick={() => handleCall(currentContact.phone)}
            >
              拨打电话
            </Button>
          ),
          (currentContact?.company_email || currentContact?.email) && (
            <Button
              key="email"
              type="primary"
              ghost
              icon={<MailOutlined />}
              onClick={() => handleEmail(currentContact.company_email || currentContact.email)}
            >
              发送邮件
            </Button>
          )
        ].filter(Boolean)}
        width={600}
      >
        {currentContact && (
          <div className="contact-detail">
            <div className="contact-detail-avatar">
              <Avatar
                size={80}
                style={{ backgroundColor: getAvatarColor(currentContact.real_name) }}
              >
                {getNameInitial(currentContact.real_name)}
              </Avatar>
            </div>
            <Descriptions bordered column={2} size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="姓名" span={1}>
                {currentContact.real_name}
              </Descriptions.Item>
              <Descriptions.Item label="职位" span={1}>
                {currentContact.position || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="部门" span={2}>
                {currentContact.department_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="手机号" span={1}>
                {currentContact.phone ? (
                  <a href={`tel:${currentContact.phone}`}>
                    <PhoneOutlined /> {currentContact.phone}
                  </a>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="企业邮箱" span={1}>
                {currentContact.company_email ? (
                  <a href={`mailto:${currentContact.company_email}`}>
                    <MailOutlined /> {currentContact.company_email}
                  </a>
                ) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="个人邮箱" span={2}>
                {currentContact.email ? (
                  <a href={`mailto:${currentContact.email}`}>
                    <MailOutlined /> {currentContact.email}
                  </a>
                ) : '-'}
              </Descriptions.Item>
              {currentContact.employee_id && (
                <Descriptions.Item label="工号" span={1}>
                  {currentContact.employee_id}
                </Descriptions.Item>
              )}
              {currentContact.entry_date && (
                <Descriptions.Item label="入职日期" span={1}>
                  {currentContact.entry_date}
                </Descriptions.Item>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Directory;
