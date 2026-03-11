import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import './App.css';

// 登录相关
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';

// 系统管理模块
import DepartmentManage from './pages/system/DepartmentManage';
import UserManage from './pages/system/UserManage';
import RoleManage from './pages/system/RoleManage';
import PermissionManage from './pages/system/PermissionManage';
import AuditLog from './pages/system/AuditLog';
import AnnouncementList from './pages/system/AnnouncementList';

// 通讯录
import Directory from './pages/directory/Directory';

// 项目管理模块
import ProjectList from './pages/project/ProjectList';
import ProjectCreate from './pages/project/ProjectCreate';
import ProjectDetail from './pages/project/ProjectDetail';
import VirtualProjectCreate from './pages/project/VirtualProjectCreate';
import ProjectProgress from './pages/project/ProjectProgress';
import ApprovalList from './pages/approval/ApprovalList';

// 合同管理模块
import ContractList from './pages/contract/ContractList';
import ContractCreate from './pages/contract/ContractCreate';
import ExpenseContractCreate from './pages/contract/ExpenseContractCreate';
import ExpenseContractDetail from './pages/contract/ExpenseContractDetail';
import OvercheckApproval from './pages/contract/OvercheckApproval';

// 采购管理模块
import PriceLibrary from './pages/material/PriceLibrary';
import PurchaseListList from './pages/purchase/PurchaseListList';
import PurchaseListDetail from './pages/purchase/PurchaseListDetail';
import BatchPurchase from './pages/purchase/BatchPurchase';
import SporadicPurchase from './pages/purchase/SporadicPurchase';
import OverageApply from './pages/purchase/OverageApply';

// 物资管理模块
import StockIn from './pages/stock/StockIn';
import StockOut from './pages/stock/StockOut';
import StockOutApply from './pages/stock/StockOutApply';
import StockReturn from './pages/stock/StockReturn';
import StockQuery from './pages/stock/StockQuery';

// 财务管理模块
import IncomeStatement from './pages/finance/IncomeStatement';
import LaborPayment from './pages/finance/LaborPayment';
import MaterialPayment from './pages/finance/MaterialPayment';
import CostReport from './pages/report/CostReport';
import PaymentList from './pages/finance/PaymentList';
import FinanceChart from './pages/finance/FinanceChart';

// 施工管理模块
import Milestone from './pages/construction/Milestone';
import ProgressReport from './pages/construction/ProgressReport';
import DeviationWarning from './pages/construction/DeviationWarning';

// 变更管理模块
import OverageChange from './pages/change/OverageChange';
import SiteVisa from './pages/change/SiteVisa';
import OwnerChange from './pages/change/OwnerChange';

// 竣工管理模块
import LaborSettlement from './pages/completion/LaborSettlement';
import DrawingUpload from './pages/completion/DrawingUpload';

// 菜单配置
const menuConfig = [
  {
    key: 'system',
    name: '系统管理',
    icon: '⚙️',
    children: [
      { key: 'organization', name: '组织架构', path: '/system/organization' },
      { key: 'users', name: '用户管理', path: '/system/users' },
      { key: 'roles', name: '角色管理', path: '/system/roles' },
      { key: 'permissions', name: '权限分配', path: '/system/permissions' },
      { key: 'announcements', name: '通知公告', path: '/system/announcements' },
      { key: 'announcements', name: '通知公告', path: '/system/announcements' },
      { key: 'audit', name: '操作日志', path: '/system/audit' },
    ]
  },
  {
    key: 'project',
    name: '项目管理',
    icon: '📁',
    children: [
      { key: 'list', name: '项目列表', path: '/project/list' },
      { key: 'progress', name: '项目进度', path: '/project/progress' },
      { key: 'create', name: '项目立项', path: '/project/create' },
      { key: 'virtual', name: '虚拟项目', path: '/project/virtual-create' },
      { key: 'approval', name: '审批管理', path: '/project/approval' },
    ]
  },
  {
    key: 'contract',
    name: '合同管理',
    icon: '📄',
    children: [
      { key: 'list', name: '合同列表', path: '/contract/list' },
      { key: 'income', name: '收入合同', path: '/contract/create' },
      { key: 'expense', name: '支出合同', path: '/contract/expense-create' },
      { key: 'overcheck', name: '超量审批', path: '/contract/overcheck-approval' },
    ]
  },
  {
    key: 'purchase',
    name: '采购管理',
    icon: '🛒',
    children: [
      { key: 'price', name: '材料基准价', path: '/purchase/price-library' },
      { key: 'list', name: '采购清单', path: '/purchase/list' },
      { key: 'batch', name: '批量采购', path: '/purchase/batch' },
      { key: 'sporadic', name: '零星采购', path: '/purchase/sporadic' },
      { key: 'overage', name: '超量申请', path: '/purchase/overage-apply' },
    ]
  },
  {
    key: 'material',
    name: '物资管理',
    icon: '📦',
    children: [
      { key: 'in', name: '物资入库', path: '/material/in' },
      { key: 'out-apply', name: '物资领用', path: '/material/out-apply' },
      { key: 'out', name: '物资出库', path: '/material/out' },
      { key: 'return', name: '物资退库', path: '/material/return' },
      { key: 'query', name: '库存查询', path: '/material/query' },
    ]
  },
  {
    key: 'finance',
    name: '财务管理',
    icon: '💰',
    children: [
      { key: 'chart', name: '财务统计', path: '/finance/chart' },
      { key: 'statement', name: '收入对账单', path: '/finance/income-statement' },
      { key: 'payments', name: '付款管理', path: '/finance/payments' },
      { key: 'labor', name: '人工费付款', path: '/finance/labor-payment' },
      { key: 'material', name: '材料款付款', path: '/finance/material-payment' },
      { key: 'report', name: '成本报表', path: '/finance/cost-report' },
    ]
  },
  {
    key: 'construction',
    name: '施工管理',
    icon: '🏗️',
    children: [
      { key: 'milestone', name: '里程碑设置', path: '/construction/milestone' },
      { key: 'progress', name: '进度填报', path: '/construction/progress' },
      { key: 'warning', name: '偏差预警', path: '/construction/warning' },
    ]
  },
  {
    key: 'change',
    name: '变更管理',
    icon: '🔄',
    children: [
      { key: 'overage', name: '超量采购变更', path: '/change/overage' },
      { key: 'visa', name: '现场签证', path: '/change/visa' },
      { key: 'owner', name: '甲方需求变更', path: '/change/owner' },
    ]
  },
  {
    key: 'completion',
    name: '竣工管理',
    icon: '✅',
    children: [
      { key: 'settlement', name: '劳务结算', path: '/completion/settlement' },
      { key: 'drawings', name: '竣工图纸', path: '/completion/drawings' },
    ]
  },
  {
    key: 'directory',
    name: '通讯录',
    icon: '📒',
    path: '/directory'
  },
];

// 受保护的路由组件
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// 侧边栏组件
function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState(['system']);

  const toggleKey = (key) => {
    setOpenKeys(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <h2>{collapsed ? 'OA' : 'MOCHU-OA'}</h2>
        <button onClick={onToggle} className="toggle-btn">
          {collapsed ? '→' : '←'}
        </button>
      </div>
      
      <nav className="sidebar-nav">
        {menuConfig.map(menu => (
          <div key={menu.key} className="menu-group">
            {menu.path ? (
              <Link 
                to={menu.path} 
                className={`menu-item ${location.pathname === menu.path ? 'active' : ''}`}
              >
                <span className="menu-icon">{menu.icon}</span>
                {!collapsed && <span className="menu-name">{menu.name}</span>}
              </Link>
            ) : (
              <>
                <div 
                  className={`menu-title ${openKeys.includes(menu.key) ? 'open' : ''}`}
                  onClick={() => toggleKey(menu.key)}
                >
                  <span className="menu-icon">{menu.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="menu-name">{menu.name}</span>
                      <span className="menu-arrow">{openKeys.includes(menu.key) ? '▼' : '▶'}</span>
                    </>
                  )}
                </div>
                {openKeys.includes(menu.key) && !collapsed && (
                  <div className="menu-children">
                    {menu.children.map(child => (
                      <Link
                        key={child.key}
                        to={child.path}
                        className={`menu-child ${location.pathname === child.path ? 'active' : ''}`}
                      >
                        {child.name}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}

// 主布局组件
function MainLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="main-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`main-content ${collapsed ? 'expanded' : ''}`}>
        <header className="main-header">
          <div className="header-left">
            <h1>MOCHU OA 办公系统</h1>
          </div>
          <div className="header-right">
            <span className="user-info">
              欢迎，{user.real_name || user.username}
            </span>
            <button onClick={handleLogout} className="logout-btn">
              退出登录
            </button>
          </div>
        </header>
        <main className="main-body">
          {children}
        </main>
      </div>
    </div>
  );
}

// 首页组件
function HomePage() {
  const menuItems = [
    { path: '/project/create', name: '项目立项', icon: '📁', desc: '创建新的实体/虚拟项目' },
    { path: '/contract/create', name: '收入合同', icon: '📄', desc: '创建收入合同' },
    { path: '/purchase/list', name: '采购清单', icon: '🛒', desc: '管理采购清单' },
    { path: '/material/in', name: '物资入库', icon: '📦', desc: '录入入库物资' },
    { path: '/finance/income-statement', name: '收入对账', icon: '💰', desc: '查看对账单' },
    { path: '/system/users', name: '用户管理', icon: '👥', desc: '管理用户账号' },
  ];

  return (
    <div className="home-page">
      <div className="welcome-section">
        <h2>欢迎使用 MOCHU OA 办公系统</h2>
        <p>工程企业管理一体化解决方案</p>
      </div>
      
      <div className="quick-actions">
        <h3>快捷入口</h3>
        <div className="action-grid">
          {menuItems.map(item => (
            <a key={item.path} href={item.path} className="action-card">
              <span className="action-icon">{item.icon}</span>
              <span className="action-name">{item.name}</span>
              <span className="action-desc">{item.desc}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="business-flow">
        <h3>业务流程</h3>
        <div className="flow-steps">
          <div className="flow-step">1. 项目立项</div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">2. 合同签订</div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">3. 采购执行</div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">4. 物资管理</div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">5. 施工过程</div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">6. 财务结算</div>
          <div className="flow-arrow">→</div>
          <div className="flow-step">7. 竣工归档</div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页面 */}
        <Route path="/login" element={<Login />} />
        <Route path="/login/verify" element={<LoginVerify />} />
        
        {/* 主布局 */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout>
              <HomePage />
            </MainLayout>
          </ProtectedRoute>
        } />

        {/* 系统管理 */}
        <Route path="/system/organization" element={
          <ProtectedRoute><MainLayout><DepartmentManage /></MainLayout></ProtectedRoute>
        } />
        <Route path="/system/users" element={
          <ProtectedRoute><MainLayout><UserManage /></MainLayout></ProtectedRoute>
        } />
        <Route path="/system/roles" element={
          <ProtectedRoute><MainLayout><RoleManage /></MainLayout></ProtectedRoute>
        } />
        <Route path="/system/permissions" element={
          <ProtectedRoute><MainLayout><PermissionManage /></MainLayout></ProtectedRoute>
        } />
        <Route path="/system/announcements" element={
          <ProtectedRoute><MainLayout><AnnouncementList /></MainLayout></ProtectedRoute>
        } />
        <Route path="/system/audit" element={
          <ProtectedRoute><MainLayout><AuditLog /></MainLayout></ProtectedRoute>
        } />

        {/* 通讯录 */}
        <Route path="/directory" element={
          <ProtectedRoute><MainLayout><Directory /></MainLayout></ProtectedRoute>
        } />

        {/* 项目管理 */}
        <Route path="/project/list" element={
          <ProtectedRoute><MainLayout><ProjectList /></MainLayout></ProtectedRoute>
        } />
        <Route path="/project/progress" element={
          <ProtectedRoute><MainLayout><ProjectProgress /></MainLayout></ProtectedRoute>
        } />
        <Route path="/project/create" element={
          <ProtectedRoute><MainLayout><ProjectCreate /></MainLayout></ProtectedRoute>
        } />
        <Route path="/project/virtual-create" element={
          <ProtectedRoute><MainLayout><VirtualProjectCreate /></MainLayout></ProtectedRoute>
        } />
        <Route path="/project/detail/:id" element={
          <ProtectedRoute><MainLayout><ProjectDetail /></MainLayout></ProtectedRoute>
        } />
        <Route path="/project/approval" element={
          <ProtectedRoute><MainLayout><ApprovalList /></MainLayout></ProtectedRoute>
        } />

        {/* 合同管理 */}
        <Route path="/contract/list" element={
          <ProtectedRoute><MainLayout><ContractList /></MainLayout></ProtectedRoute>
        } />
        <Route path="/contract/create" element={
          <ProtectedRoute><MainLayout><ContractCreate /></MainLayout></ProtectedRoute>
        } />
        <Route path="/contract/expense-create" element={
          <ProtectedRoute><MainLayout><ExpenseContractCreate /></MainLayout></ProtectedRoute>
        } />
        <Route path="/contract/expense/:id" element={
          <ProtectedRoute><MainLayout><ExpenseContractDetail /></MainLayout></ProtectedRoute>
        } />
        <Route path="/contract/overcheck-approval" element={
          <ProtectedRoute><MainLayout><OvercheckApproval /></MainLayout></ProtectedRoute>
        } />

        {/* 采购管理 */}
        <Route path="/purchase/price-library" element={
          <ProtectedRoute><MainLayout><PriceLibrary /></MainLayout></ProtectedRoute>
        } />
        <Route path="/purchase/list" element={
          <ProtectedRoute><MainLayout><PurchaseListList /></MainLayout></ProtectedRoute>
        } />
        <Route path="/purchase/list/:id" element={
          <ProtectedRoute><MainLayout><PurchaseListDetail /></MainLayout></ProtectedRoute>
        } />
        <Route path="/purchase/batch" element={
          <ProtectedRoute><MainLayout><BatchPurchase /></MainLayout></ProtectedRoute>
        } />
        <Route path="/purchase/sporadic" element={
          <ProtectedRoute><MainLayout><SporadicPurchase /></MainLayout></ProtectedRoute>
        } />
        <Route path="/purchase/overage-apply" element={
          <ProtectedRoute><MainLayout><OverageApply /></MainLayout></ProtectedRoute>
        } />

        {/* 物资管理 */}
        <Route path="/material/in" element={
          <ProtectedRoute><MainLayout><StockIn /></MainLayout></ProtectedRoute>
        } />
        <Route path="/material/out-apply" element={
          <ProtectedRoute><MainLayout><StockOutApply /></MainLayout></ProtectedRoute>
        } />
        <Route path="/material/out" element={
          <ProtectedRoute><MainLayout><StockOut /></MainLayout></ProtectedRoute>
        } />
        <Route path="/material/return" element={
          <ProtectedRoute><MainLayout><StockReturn /></MainLayout></ProtectedRoute>
        } />
        <Route path="/material/query" element={
          <ProtectedRoute><MainLayout><StockQuery /></MainLayout></ProtectedRoute>
        } />

        {/* 财务管理 */}
        <Route path="/finance/chart" element={
          <ProtectedRoute><MainLayout><FinanceChart /></MainLayout></ProtectedRoute>
        } />
        <Route path="/finance/income-statement" element={
          <ProtectedRoute><MainLayout><IncomeStatement /></MainLayout></ProtectedRoute>
        } />
        <Route path="/finance/payments" element={
          <ProtectedRoute><MainLayout><PaymentList /></MainLayout></ProtectedRoute>
        } />
        <Route path="/finance/payments" element={
          <ProtectedRoute><MainLayout><PaymentList /></MainLayout></ProtectedRoute>
        } />
        <Route path="/finance/labor-payment" element={
          <ProtectedRoute><MainLayout><LaborPayment /></MainLayout></ProtectedRoute>
        } />
        <Route path="/finance/material-payment" element={
          <ProtectedRoute><MainLayout><MaterialPayment /></MainLayout></ProtectedRoute>
        } />
        <Route path="/finance/cost-report" element={
          <ProtectedRoute><MainLayout><CostReport /></MainLayout></ProtectedRoute>
        } />

        {/* 施工管理 */}
        <Route path="/construction/milestone" element={
          <ProtectedRoute><MainLayout><Milestone /></MainLayout></ProtectedRoute>
        } />
        <Route path="/construction/progress" element={
          <ProtectedRoute><MainLayout><ProgressReport /></MainLayout></ProtectedRoute>
        } />
        <Route path="/construction/warning" element={
          <ProtectedRoute><MainLayout><DeviationWarning /></MainLayout></ProtectedRoute>
        } />

        {/* 变更管理 */}
        <Route path="/change/overage" element={
          <ProtectedRoute><MainLayout><OverageChange /></MainLayout></ProtectedRoute>
        } />
        <Route path="/change/visa" element={
          <ProtectedRoute><MainLayout><SiteVisa /></MainLayout></ProtectedRoute>
        } />
        <Route path="/change/owner" element={
          <ProtectedRoute><MainLayout><OwnerChange /></MainLayout></ProtectedRoute>
        } />

        {/* 竣工管理 */}
        <Route path="/completion/settlement" element={
          <ProtectedRoute><MainLayout><LaborSettlement /></MainLayout></ProtectedRoute>
        } />
        <Route path="/completion/drawings" element={
          <ProtectedRoute><MainLayout><DrawingUpload /></MainLayout></ProtectedRoute>
        } />

        {/* 兼容旧路由 - 重定向到新路由 */}
        <Route path="/organization/department" element={<Navigate to="/system/organization" replace />} />
        <Route path="/user/manage" element={<Navigate to="/system/users" replace />} />
        <Route path="/settings/role" element={<Navigate to="/system/roles" replace />} />
        <Route path="/settings/permission" element={<Navigate to="/system/permissions" replace />} />
        <Route path="/system/audit" element={<Navigate to="/system/audit" replace />} />
        <Route path="/stock/in" element={<Navigate to="/material/in" replace />} />
        <Route path="/stock/out" element={<Navigate to="/material/out" replace />} />
        <Route path="/stock/out/apply" element={<Navigate to="/material/out-apply" replace />} />
        <Route path="/stock/return" element={<Navigate to="/material/return" replace />} />
        <Route path="/stock/query" element={<Navigate to="/material/query" replace />} />
        <Route path="/material/price-library" element={<Navigate to="/purchase/price-library" replace />} />
        <Route path="/report/cost" element={<Navigate to="/finance/cost-report" replace />} />
        <Route path="/approval" element={<Navigate to="/project/approval" replace />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
