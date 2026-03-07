const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Initialize database
const { db, initDatabase } = require('./models/database');
initDatabase();

// Initialize default departments
const { initDepartments } = require('./init/departments');
initDepartments(db);

// Initialize default roles
const { initRoles } = require('./init/roles');
initRoles(db);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files (production build)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'OA System API is running' });
});

// Import routes
const authRoutes = require('./routes/auth');
const departmentRoutes = require('./routes/department');
const userRoutes = require('./routes/user');
const hrRoutes = require('./routes/hr');
const directoryRoutes = require('./routes/directory');
const emailRoutes = require('./routes/email');
const roleRoutes = require('./routes/role');
const permissionRoutes = require('./routes/permission');
const projectRoutes = require('./routes/project');
const approvalRoutes = require('./routes/approval');
const contractRoutes = require('./routes/contract');
const materialRoutes = require('./routes/material');
const purchaseRoutes = require('./routes/purchase');
const zeroPurchaseRoutes = require('./routes/zeroPurchase');
const batchPurchaseRoutes = require('./routes/batchPurchase');
const stockRoutes = require('./routes/stock');
// Task 45: 收入对账单路由
const incomeStatementRoutes = require('./routes/incomeStatement');
// Task 47 & 48: 付款管理路由（人工费 + 材料款）
const paymentRoutes = require('./routes/payment');
// Task 54: 施工管理路由（里程碑设置）
const constructionRoutes = require('./routes/construction');
// Task 50 & 52: 变更管理路由
const changeRoutes = require('./routes/change');
// Task 57 & 58: 竣工管理路由（劳务结算 + 竣工图纸）
const completionRoutes = require('./routes/completion');
// Task 60: 系统管理 - 审计日志
const auditRoutes = require('./routes/audit');

app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/approval', approvalRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/purchase-lists', purchaseRoutes);
app.use('/api/purchase', purchaseRoutes);
app.use('/api/zero-purchases', zeroPurchaseRoutes);
app.use('/api/purchase', batchPurchaseRoutes);
app.use('/api/stock', stockRoutes);
// Task 45: 收入对账单 API
app.use('/api/income-statements', incomeStatementRoutes);
// Task 47 & 48: 付款管理 API（人工费 + 材料款）
app.use('/api/payments', paymentRoutes);
// Task 54: 施工管理 API（里程碑设置）
app.use('/api/construction', constructionRoutes);
// Task 57 & 58: 竣工管理 API（劳务结算 + 竣工图纸）
app.use('/api/completion', completionRoutes);
// Task 60: 系统管理 - 审计日志 API
app.use('/api/audit', auditRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`OA Backend Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  
  // Task 45: 启动收入对账单定时任务（每月25日自动生成）
  try {
    const incomeStatementScheduler = require('./services/incomeStatementScheduler');
    incomeStatementScheduler.startScheduler();
  } catch (error) {
    console.log('收入对账单定时任务启动失败（可能缺少 node-cron）:', error.message);
    console.log('提示: 请运行 npm install node-cron 安装依赖');
  }
});
