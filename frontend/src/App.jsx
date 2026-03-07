import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import LoginVerify from './pages/LoginVerify';
import DepartmentManage from './pages/organization/DepartmentManage';
import UserManage from './pages/user/UserManage';
import Directory from './pages/directory/Directory';
import RoleManage from './pages/settings/RoleManage';
import PermissionManage from './pages/settings/PermissionManage';
import ProjectCreate from './pages/project/ProjectCreate';
import ProjectList from './pages/project/ProjectList';
import ProjectDetail from './pages/project/ProjectDetail';
import VirtualProjectCreate from './pages/project/VirtualProjectCreate';
import ContractCreate from './pages/contract/ContractCreate';
import ContractList from './pages/contract/ContractList';
import ExpenseContractCreate from './pages/contract/ExpenseContractCreate';
import ExpenseContractDetail from './pages/contract/ExpenseContractDetail';
import OvercheckApproval from './pages/contract/OvercheckApproval';
import ApprovalList from './pages/approval/ApprovalList';
import PriceLibrary from './pages/material/PriceLibrary';
import ZeroPurchase from './pages/material/ZeroPurchase';
import PurchaseListList from './pages/purchase/PurchaseListList';
import PurchaseListDetail from './pages/purchase/PurchaseListDetail';
import SporadicOld from './pages/purchase/Sporadic';
import SporadicPurchase from './pages/purchase/SporadicPurchase';
import BatchPurchase from './pages/purchase/BatchPurchase';
// Task 34: 超量采购申请
import OverageApply from './pages/purchase/OverageApply';
import StockIn from './pages/stock/StockIn';
import StockOut from './pages/stock/StockOut';
import StockOutApply from './pages/stock/StockOutApply';
import StockReturn from './pages/stock/StockReturn';
import StockQuery from './pages/stock/StockQuery';
// Task 45: 收入对账单
import IncomeStatement from './pages/finance/IncomeStatement';
// Task 47: 人工费付款
import LaborPayment from './pages/finance/LaborPayment';
// Task 48: 材料款付款
import MaterialPayment from './pages/finance/MaterialPayment';
// Task 49: 成本汇总报表
import CostReport from './pages/report/CostReport';
// Task 50: 变更管理 - 超量采购申请
import OverageChange from './pages/change/OverageChange';
// Task 52: 变更管理 - 现场签证
import SiteVisa from './pages/change/SiteVisa';
// Task 53: 变更管理 - 甲方需求变更
import OwnerChange from './pages/change/OwnerChange';
// Task 54: 施工管理 - 里程碑设置
import Milestone from './pages/construction/Milestone';
// Task 55: 施工管理 - 进度填报
import ProgressReport from './pages/construction/ProgressReport';
// Task 56: 施工管理 - 偏差预警
import DeviationWarning from './pages/construction/DeviationWarning';
// Task 57: 竣工管理 - 劳务结算
import LaborSettlement from './pages/completion/LaborSettlement';
// Task 60: 系统管理 - 日志审计
import AuditLog from './pages/system/AuditLog';
// Task 58: 竣工管理 - 竣工图纸
import DrawingUpload from './pages/completion/DrawingUpload';
import './App.css';

// 受保护的路由组件
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// 首页组件（占位）
function Home() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };
  
  // 导航菜单
  const menuItems = [
    { path: '/organization/department', name: '组织架构', icon: '🏛️' },
    { path: '/user/manage', name: '用户管理', icon: '👥' },
    { path: '/directory', name: '通讯录', icon: '📒' },
    { path: '/project/list', name: '项目列表', icon: '📋' },
    { path: '/project/create', name: '项目立项', icon: '📁' },
    { path: '/project/virtual-create', name: '虚拟项目', icon: '☁️' },
    { path: '/contract/list', name: '合同列表', icon: '📑' },
    { path: '/contract/create', name: '收入合同', icon: '📄' },
    { path: '/contract/expense-create', name: '支出合同', icon: '📃' },
    { path: '/material/price-library', name: '材料基准价', icon: '💰' },
    { path: '/purchase/list', name: '采购清单', icon: '🛒' },
    { path: '/purchase/batch', name: '批量采购', icon: '📦' },
    { path: '/material/zero-purchase', name: '零星采购(旧)', icon: '🛍️' },
    { path: '/purchase/sporadic', name: '零星采购', icon: '🛒' },
    { path: '/purchase/overage-apply', name: '超量采购申请', icon: '⚠️' },
    { path: '/stock/in', name: '物资入库', icon: '📥' },
    { path: '/stock/out/apply', name: '物资领用', icon: '📋' },
    { path: '/stock/out', name: '物资出库', icon: '📤' },
    { path: '/stock/query', name: '库存查询', icon: '🔍' },
    { path: '/stock/return', name: '物资退库', icon: '↩️' },
    { path: '/approval', name: '审批管理', icon: '📝' },
    { path: '/change/overage', name: '超量采购申请', icon: '📝' },
    { path: '/change/visa', name: '现场签证', icon: '📋' },
    { path: '/change/owner', name: '甲方需求变更', icon: '🔄' },
    { path: '/construction/milestone', name: '里程碑管理', icon: '🏁' },
    { path: '/construction/progress', name: '进度填报', icon: '📊' },
    { path: '/settings/role', name: '角色管理', icon: '🔐' },
    { path: '/settings/permission', name: '权限分配', icon: '🔒' },
  ];
  
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1>🎉 登录成功！</h1>
      <p>欢迎，{user.real_name || user.username}</p>
      <p style={{ color: '#666' }}>首页功能开发中...</p>
      
      {/* 快捷导航 */}
      <div style={{ marginTop: '30px' }}>
        <h3>快捷入口</h3>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {menuItems.map(item => (
            <a
              key={item.path}
              href={item.path}
              style={{
                display: 'block',
                padding: '20px 30px',
                background: '#f5f5f5',
                borderRadius: '8px',
                textDecoration: 'none',
                color: '#333',
                transition: 'all 0.3s'
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#e6f7ff';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = '#f5f5f5';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>{item.icon}</span>
              <span>{item.name}</span>
            </a>
          ))}
        </div>
      </div>
      
      <button 
        onClick={handleLogout}
        style={{
          marginTop: '30px',
          padding: '10px 24px',
          fontSize: '16px',
          cursor: 'pointer'
        }}
      >
        退出登录
      </button>
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
        
        {/* 受保护的路由 */}
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } 
        />
        
        {/* 组织架构模块 */}
        <Route 
          path="/organization/department" 
          element={
            <ProtectedRoute>
              <DepartmentManage />
            </ProtectedRoute>
          } 
        />
        
        {/* 用户管理模块 */}
        <Route 
          path="/user/manage" 
          element={
            <ProtectedRoute>
              <UserManage />
            </ProtectedRoute>
          } 
        />
        
        {/* 通讯录模块 */}
        <Route 
          path="/directory" 
          element={
            <ProtectedRoute>
              <Directory />
            </ProtectedRoute>
          } 
        />
        
        {/* 角色管理模块 */}
        <Route 
          path="/settings/role" 
          element={
            <ProtectedRoute>
              <RoleManage />
            </ProtectedRoute>
          } 
        />
        
        {/* 权限分配模块 */}
        <Route 
          path="/settings/permission" 
          element={
            <ProtectedRoute>
              <PermissionManage />
            </ProtectedRoute>
          } 
        />
        
        {/* 项目管理模块 */}
        <Route 
          path="/project/list" 
          element={
            <ProtectedRoute>
              <ProjectList />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/project/create" 
          element={
            <ProtectedRoute>
              <ProjectCreate />
            </ProtectedRoute>
          } 
        />
        
        {/* 虚拟项目创建 */}
        <Route 
          path="/project/virtual-create" 
          element={
            <ProtectedRoute>
              <VirtualProjectCreate />
            </ProtectedRoute>
          } 
        />
        
        {/* 项目详情 */}
        <Route 
          path="/project/detail/:id" 
          element={
            <ProtectedRoute>
              <ProjectDetail />
            </ProtectedRoute>
          } 
        />
        
        {/* 审批管理 */}
        <Route 
          path="/approval" 
          element={
            <ProtectedRoute>
              <ApprovalList />
            </ProtectedRoute>
          } 
        />
        
        {/* 合同管理模块 */}
        <Route 
          path="/contract/list" 
          element={
            <ProtectedRoute>
              <ContractList />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/contract/create" 
          element={
            <ProtectedRoute>
              <ContractCreate />
            </ProtectedRoute>
          } 
        />
        
        {/* 支出合同创建 */}
        <Route 
          path="/contract/expense-create" 
          element={
            <ProtectedRoute>
              <ExpenseContractCreate />
            </ProtectedRoute>
          } 
        />
        
        {/* 支出合同详情 */}
        <Route 
          path="/contract/expense/:id" 
          element={
            <ProtectedRoute>
              <ExpenseContractDetail />
            </ProtectedRoute>
          } 
        />
        
        {/* 超量校验审批 */}
        <Route 
          path="/contract/overcheck-approval" 
          element={
            <ProtectedRoute>
              <OvercheckApproval />
            </ProtectedRoute>
          } 
        />
        
        {/* 材料基准价管理 */}
        <Route 
          path="/material/price-library" 
          element={
            <ProtectedRoute>
              <PriceLibrary />
            </ProtectedRoute>
          } 
        />
        
        {/* 零星采购管理 */}
        <Route 
          path="/material/zero-purchase" 
          element={
            <ProtectedRoute>
              <ZeroPurchase />
            </ProtectedRoute>
          } 
        />
        
        {/* 采购清单管理 */}
        <Route 
          path="/purchase/list" 
          element={
            <ProtectedRoute>
              <PurchaseListList />
            </ProtectedRoute>
          } 
        />
        
        {/* 采购清单详情 */}
        <Route 
          path="/purchase/list/:id" 
          element={
            <ProtectedRoute>
              <PurchaseListDetail />
            </ProtectedRoute>
          } 
        />
        
        {/* 批量采购与零星采购（旧版，保留备用） */}
        <Route 
          path="/purchase/sporadic-old" 
          element={
            <ProtectedRoute>
              <SporadicOld />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 36: 零星采购管理（新版） */}
        <Route 
          path="/purchase/sporadic" 
          element={
            <ProtectedRoute>
              <SporadicPurchase />
            </ProtectedRoute>
          } 
        />
        
        {/* 批量采购管理 */}
        <Route 
          path="/purchase/batch" 
          element={
            <ProtectedRoute>
              <BatchPurchase />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 34: 超量采购申请 */}
        <Route 
          path="/purchase/overage-apply" 
          element={
            <ProtectedRoute>
              <OverageApply />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 38: 物资入库管理 */}
        <Route 
          path="/stock/in" 
          element={
            <ProtectedRoute>
              <StockIn />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 41: 物资出库管理 */}
        <Route 
          path="/stock/out" 
          element={
            <ProtectedRoute>
              <StockOut />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 40: 物资领用申请 */}
        <Route 
          path="/stock/out/apply" 
          element={
            <ProtectedRoute>
              <StockOutApply />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 43: 物资退库 */}
        <Route 
          path="/stock/return" 
          element={
            <ProtectedRoute>
              <StockReturn />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 44: 库存查询 */}
        <Route 
          path="/stock/query" 
          element={
            <ProtectedRoute>
              <StockQuery />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 45: 收入对账单 */}
        <Route 
          path="/finance/income-statement" 
          element={
            <ProtectedRoute>
              <IncomeStatement />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 47: 人工费付款 */}
        <Route 
          path="/finance/labor-payment" 
          element={
            <ProtectedRoute>
              <LaborPayment />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 48: 材料款付款 */}
        <Route 
          path="/finance/material-payment" 
          element={
            <ProtectedRoute>
              <MaterialPayment />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 49: 成本汇总报表 */}
        <Route 
          path="/report/cost" 
          element={
            <ProtectedRoute>
              <CostReport />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 50: 超量采购变更申请 */}
        <Route 
          path="/change/overage" 
          element={
            <ProtectedRoute>
              <OverageChange />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 52: 现场签证 */}
        <Route 
          path="/change/visa" 
          element={
            <ProtectedRoute>
              <SiteVisa />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 53: 甲方需求变更 */}
        <Route 
          path="/change/owner" 
          element={
            <ProtectedRoute>
              <OwnerChange />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 54: 施工管理 - 里程碑设置 */}
        <Route 
          path="/construction/milestone" 
          element={
            <ProtectedRoute>
              <Milestone />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 55: 施工进度填报 */}
        <Route 
          path="/construction/progress" 
          element={
            <ProtectedRoute>
              <ProgressReport />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 57: 竣工管理 - 劳务结算 */}
        <Route 
          path="/completion/labor-settlement" 
          element={
            <ProtectedRoute>
              <LaborSettlement />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 58: 竣工图纸管理 */}
        <Route 
          path="/completion/drawings" 
          element={
            <ProtectedRoute>
              <DrawingUpload />
            </ProtectedRoute>
          } 
        />
        
        {/* Task 60: 系统管理 - 日志审计 */}
        <Route 
          path="/system/audit" 
          element={
            <ProtectedRoute>
              <AuditLog />
            </ProtectedRoute>
          } 
        />
        
        {/* 其他路由重定向到首页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
