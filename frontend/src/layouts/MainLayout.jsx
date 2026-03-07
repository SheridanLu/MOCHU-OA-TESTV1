import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Dropdown, Avatar, Badge, Button, Breadcrumb, theme } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  ProjectOutlined,
  FileTextOutlined,
  ShopOutlined,
  DollarOutlined,
  TeamOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  LogoutOutlined,
  DownOutlined,
  FileAddOutlined,
  UnorderedListOutlined,
  ShoppingOutlined,
  InboxOutlined,
  ExportOutlined,
  SearchOutlined,
  TransactionOutlined,
  BankOutlined,
} from '@ant-design/icons';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;

// 菜单配置
const menuItems = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: '首页',
  },
  {
    key: '/project',
    icon: <ProjectOutlined />,
    label: '项目管理',
    children: [
      {
        key: '/project/list',
        icon: <UnorderedListOutlined />,
        label: '项目列表',
      },
      {
        key: '/project/create',
        icon: <FileAddOutlined />,
        label: '项目立项',
      },
      {
        key: '/project/contract',
        icon: <FileTextOutlined />,
        label: '合同管理',
      },
    ],
  },
  {
    key: '/material',
    icon: <ShopOutlined />,
    label: '物资管理',
    children: [
      {
        key: '/material/purchase',
        icon: <ShoppingOutlined />,
        label: '采购管理',
      },
      {
        key: '/material/inbound',
        icon: <InboxOutlined />,
        label: '入库管理',
      },
      {
        key: '/material/outbound',
        icon: <ExportOutlined />,
        label: '出库管理',
      },
      {
        key: '/material/inventory',
        icon: <SearchOutlined />,
        label: '库存查询',
      },
    ],
  },
  {
    key: '/cost',
    icon: <DollarOutlined />,
    label: '成本管理',
    children: [
      {
        key: '/cost/income',
        icon: <TransactionOutlined />,
        label: '收入对账',
      },
      {
        key: '/cost/payment',
        icon: <BankOutlined />,
        label: '付款管理',
      },
    ],
  },
  {
    key: '/organization',
    icon: <TeamOutlined />,
    label: '组织架构',
    children: [
      {
        key: '/organization/department',
        icon: <TeamOutlined />,
        label: '部门管理',
      },
      {
        key: '/organization/user',
        icon: <UserOutlined />,
        label: '用户管理',
      },
    ],
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '系统设置',
  },
];

// 生成面包屑映射
const breadcrumbNameMap = {
  '/': '首页',
  '/project': '项目管理',
  '/project/list': '项目列表',
  '/project/create': '项目立项',
  '/project/contract': '合同管理',
  '/material': '物资管理',
  '/material/purchase': '采购管理',
  '/material/inbound': '入库管理',
  '/material/outbound': '出库管理',
  '/material/inventory': '库存查询',
  '/cost': '成本管理',
  '/cost/income': '收入对账',
  '/cost/payment': '付款管理',
  '/organization': '组织架构',
  '/organization/department': '部门管理',
  '/organization/user': '用户管理',
  '/settings': '系统设置',
};

function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState({ name: '用户', avatar: null });
  const [notificationCount, setNotificationCount] = useState(3);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 获取当前用户信息
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user);
      } catch (e) {
        console.error('解析用户信息失败', e);
      }
    }
  }, []);

  // 处理菜单点击
  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  // 处理退出登录
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // 处理个人设置
  const handleProfile = () => {
    navigate('/profile');
  };

  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人设置',
      onClick: handleProfile,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  // 生成面包屑
  const getBreadcrumbItems = () => {
    const pathSnippets = location.pathname.split('/').filter((i) => i);
    const items = [
      {
        title: '首页',
        href: '/',
      },
    ];

    let currentPath = '';
    pathSnippets.forEach((snippet) => {
      currentPath += `/${snippet}`;
      if (breadcrumbNameMap[currentPath]) {
        items.push({
          title: breadcrumbNameMap[currentPath],
        });
      }
    });

    return items;
  };

  // 获取当前选中的菜单项
  const getSelectedKeys = () => {
    const pathname = location.pathname;
    // 如果是根路径，选中首页
    if (pathname === '/') return ['/'];
    // 否则选中当前路径
    return [pathname];
  };

  // 获取当前展开的菜单项
  const getOpenKeys = () => {
    const pathname = location.pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 1) {
      return [`/${parts[0]}`];
    }
    return [];
  };

  const [openKeys, setOpenKeys] = useState(getOpenKeys());

  // 处理子菜单展开/收起
  const handleOpenChange = (keys) => {
    // 只保留最后一个打开的子菜单（手风琴模式）
    const latestOpenKey = keys.find((key) => openKeys.indexOf(key) === -1);
    if (latestOpenKey) {
      setOpenKeys([latestOpenKey]);
    } else {
      setOpenKeys(keys);
    }
  };

  return (
    <Layout className="main-layout">
      {/* 侧边栏 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        className="sider"
        width={220}
        collapsedWidth={80}
      >
        {/* Logo 区域 */}
        <div className="logo">
          {collapsed ? (
            <span className="logo-mini">OA</span>
          ) : (
            <span className="logo-text">OA 办公系统</span>
          )}
        </div>

        {/* 菜单 */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={handleOpenChange}
          onClick={handleMenuClick}
          items={menuItems}
        />
      </Sider>

      <Layout className="layout-wrapper">
        {/* 顶部导航栏 */}
        <Header className="header" style={{ background: colorBgContainer }}>
          <div className="header-left">
            {/* 折叠按钮 */}
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="collapse-btn"
            />
          </div>

          <div className="header-right">
            {/* 消息通知 */}
            <Badge count={notificationCount} size="small">
              <Button
                type="text"
                icon={<BellOutlined />}
                className="notification-btn"
                onClick={() => setNotificationCount(0)}
              />
            </Badge>

            {/* 用户信息 */}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div className="user-info">
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  src={currentUser.avatar}
                  className="user-avatar"
                />
                <span className="user-name">{currentUser.name || '用户'}</span>
                <DownOutlined className="down-icon" />
              </div>
            </Dropdown>
          </div>
        </Header>

        {/* 主内容区 */}
        <Content className="content" style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}>
          {/* 面包屑导航 */}
          <Breadcrumb
            className="breadcrumb"
            items={getBreadcrumbItems()}
          />

          {/* 内容区域 */}
          <div className="content-wrapper">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
