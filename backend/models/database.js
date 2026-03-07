const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      real_name TEXT,
      email TEXT,
      phone TEXT,
      department_id INTEGER,
      position TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Departments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      manager_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES departments(id),
      FOREIGN KEY (manager_id) REFERENCES users(id)
    )
  `);

  // 检查并添加 sort_order 字段（兼容旧数据）
  try {
    db.exec(`ALTER TABLE departments ADD COLUMN sort_order INTEGER DEFAULT 0`);
  } catch (e) {
    // 字段已存在，忽略错误
  }

  // HR联动字段扩展 - 为 users 表添加员工信息字段
  const hrColumns = [
    { name: 'employee_id', type: 'TEXT UNIQUE' },
    { name: 'entry_date', type: 'DATE' },
    { name: 'resign_date', type: 'DATE' },
    { name: 'in_directory', type: 'INTEGER DEFAULT 1' }
  ];

  hrColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 企业邮箱字段扩展 - 为 users 表添加企业邮箱相关字段
  const emailColumns = [
    { name: 'company_email', type: 'TEXT UNIQUE' },
    { name: 'email_enabled', type: 'INTEGER DEFAULT 1' },
    { name: 'email_disabled_at', type: 'DATETIME' },
    { name: 'email_disabled_reason', type: 'TEXT' }
  ];

  emailColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 为企业邮箱创建索引
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_company_email ON users(company_email)`);
  } catch (e) {
    // 索引已存在，忽略错误
  }

  // 拼音字段支持 - 用于通讯录搜索
  const pinyinColumns = [
    { name: 'pinyin', type: 'TEXT' },          // 完整拼音
    { name: 'pinyin_abbr', type: 'TEXT' },     // 拼音首字母
    { name: 'avatar', type: 'TEXT' }           // 头像URL
  ];

  pinyinColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // Roles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      permissions TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 检查并添加 permissions 字段（兼容旧数据）
  try {
    db.exec(`ALTER TABLE roles ADD COLUMN permissions TEXT DEFAULT '[]'`);
  } catch (e) {
    // 字段已存在，忽略错误
  }

  // User-Role mapping
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL,
      role_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, role_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

  // Login attempts table - 登录失败记录
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      attempt_count INTEGER DEFAULT 0,
      locked_until DATETIME,
      last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 为 user_id 创建索引以提高查询效率
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON login_attempts(user_id)
  `);

  // 短信验证码表 - 用于验证码60秒限制
  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    )
  `);

  // 为手机号创建索引以提高查询效率
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone, created_at)
  `);

  // HR操作日志表 - 记录HR联动操作
  db.exec(`
    CREATE TABLE IF NOT EXISTS hr_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  // 为 hr_logs 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hr_logs_user_id ON hr_logs(user_id, created_at)
  `);

  // Projects table - 项目表
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'entity',
      customer TEXT,
      contract_amount DECIMAL(15,2) DEFAULT 0,
      manager_id INTEGER,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES users(id)
    )
  `);

  // 为项目编号创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_no ON projects(project_no)
  `);

  // 为项目状态创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)
  `);

  // 虚拟项目相关字段扩展
  const virtualProjectColumns = [
    { name: 'virtual_from', type: 'INTEGER' },      // 虚拟项目的来源项目ID
    { name: 'converted_to', type: 'INTEGER' },      // 转换后的实体项目ID
    { name: 'converted_at', type: 'DATETIME' }      // 转换时间
  ];

  virtualProjectColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 虚拟项目转实体扩展字段
  const convertProjectColumns = [
    { name: 'bid_notice_no', type: 'TEXT' },          // 中标通知书编号
    { name: 'bid_notice_date', type: 'DATE' },        // 中标日期
    { name: 'converted_from', type: 'INTEGER' }       // 转换来源的虚拟项目ID
  ];

  convertProjectColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 虚拟项目中止扩展字段
  const abortProjectColumns = [
    { name: 'abort_reason', type: 'TEXT' },           // 中止原因
    { name: 'abort_remarks', type: 'TEXT' },          // 中止备注
    { name: 'aborted_at', type: 'DATETIME' }          // 中止时间
  ];

  abortProjectColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // Contracts table - 合同表
  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'income',
      project_id INTEGER,
      party_a TEXT,
      party_b TEXT,
      amount DECIMAL(15,2) DEFAULT 0,
      sign_date DATE,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'pending',
      description TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为合同编号创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contracts_no ON contracts(contract_no)
  `);

  // 为合同类型创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(type)
  `);

  // 为合同状态创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)
  `);

  // 为项目关联创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id)
  `);

  // 支出合同扩展字段 - supplier_id（供应商ID）和 purchase_list_id（采购清单ID）
  const expenseContractColumns = [
    { name: 'supplier_id', type: 'INTEGER' },           // 供应商ID
    { name: 'purchase_list_id', type: 'INTEGER' }       // 采购清单ID（可选）
  ];

  expenseContractColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE contracts ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 合同审批流程扩展字段
  const contractApprovalColumns = [
    { name: 'current_approver', type: 'TEXT' },      // 当前审批人角色 (FINANCE/LEGAL/GM)
    { name: 'submitter_id', type: 'INTEGER' }        // 提交人ID
  ];

  contractApprovalColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE contracts ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 合同审批历史表 - contract_approval_history
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_approval_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      approver_id INTEGER,
      approver_name TEXT,
      comment TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为合同审批历史创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contract_approval_contract_id ON contract_approval_history(contract_id)
  `);

  // 审批主表 - approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      type TEXT DEFAULT 'project' NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      submitter_id INTEGER NOT NULL,
      current_step INTEGER DEFAULT 1,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (submitter_id) REFERENCES users(id)
    )
  `);

  // 审批流程节点表 - approval_flows
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'pending' NOT NULL,
      approver_id INTEGER,
      comment TEXT,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为审批表创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approvals_project_id ON approvals(project_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approval_flows_approval_id ON approval_flows(approval_id)
  `);

  // ========== Task 28: 支出合同超量校验相关表 ==========

  // 供应商表 - suppliers
  db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      bank_name TEXT,
      bank_account TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为供应商名称创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)
  `);

  // 采购清单表 - purchase_lists
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_amount DECIMAL(15,2) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `);

  // 采购清单明细表 - purchase_list_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_list_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      total_price DECIMAL(15,2) DEFAULT 0,
      base_price DECIMAL(10,2),
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_list_id) REFERENCES purchase_lists(id) ON DELETE CASCADE
    )
  `);

  // 为采购清单项目关联创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_purchase_lists_project ON purchase_lists(project_id)
  `);

  // 材料基准价表 - material_base_prices
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_base_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      base_price DECIMAL(10,2) NOT NULL,
      effective_date DATE,
      expiry_date DATE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为材料名称创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_base_prices_name ON material_base_prices(material_name)
  `);

  // 价格预警表 - price_warnings
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER,
      purchase_list_item_id INTEGER,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit_price DECIMAL(10,2) NOT NULL,
      base_price DECIMAL(10,2) NOT NULL,
      overage_percent DECIMAL(5,2) NOT NULL,
      warning_level TEXT DEFAULT 'warning',
      status TEXT DEFAULT 'pending',
      handler_id INTEGER,
      handle_remark TEXT,
      handled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (purchase_list_item_id) REFERENCES purchase_list_items(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    )
  `);

  // 为价格预警创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_warnings_contract ON price_warnings(contract_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_warnings_status ON price_warnings(status)
  `);

  // 支出合同超量记录表 - expense_overage_records
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_overage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      purchase_list_id INTEGER,
      item_name TEXT NOT NULL,
      original_quantity DECIMAL(10,2),
      original_price DECIMAL(10,2),
      actual_quantity DECIMAL(10,2),
      actual_price DECIMAL(10,2),
      overage_quantity DECIMAL(10,2),
      overage_amount DECIMAL(15,2),
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (purchase_list_id) REFERENCES purchase_lists(id)
    )
  `);

  // 为超量记录创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expense_overage_contract ON expense_overage_records(contract_id)
  `);

  // ========== Task 31: 材料价格信息库 - 基准价管理 ==========

  // 材料基准价扩展字段
  const materialBasePriceColumns = [
    { name: 'supplier_id', type: 'INTEGER' },       // 关联供应商ID
    { name: 'remarks', type: 'TEXT' },              // 备注
    { name: 'created_by', type: 'INTEGER' },        // 创建人ID
    { name: 'updated_by', type: 'INTEGER' }         // 更新人ID
  ];

  materialBasePriceColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE material_base_prices ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 材料价格历史记录表 - material_price_history
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      old_price DECIMAL(10,2),
      new_price DECIMAL(10,2) NOT NULL,
      changed_by INTEGER,
      change_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES material_base_prices(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id)
    )
  `);

  // 为材料价格历史创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_price_history_material ON material_price_history(material_id)
  `);

  // ========== Task 30: 支出合同超量校验扩展字段 ==========
  
  // contracts 表扩展字段
  const contractOvercheckColumns = [
    { name: 'overcheck_reason', type: 'TEXT' },           // 超量说明
    { name: 'overcheck_result', type: 'TEXT' },           // 超量校验结果（JSON）
    { name: 'is_excessive', type: 'INTEGER DEFAULT 0' },  // 是否超出合同总价的1.5%
    { name: 'price_percentage', type: 'DECIMAL(5,2)' },   // 价格偏差百分比
    { name: 'overcheck_status', type: "TEXT DEFAULT 'none'" }, // 超量校验状态: none/pending/approved/rejected
    { name: 'budget_approver_id', type: 'INTEGER' },      // 预算员审批人ID
    { name: 'budget_approved_at', type: 'DATETIME' },     // 预算员审批时间
    { name: 'budget_approve_comment', type: 'TEXT' }      // 预算员审批意见
  ];

  contractOvercheckColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE contracts ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 审批记录表 - approval_records
  db.exec(`
    CREATE TABLE IF NOT EXISTS approval_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为审批记录创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approval_records_contract ON approval_records(contract_id)
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_approval_records_role ON approval_records(role)
  `);

  // ========== Task 34: 项目采购清单 - 批量采购与零星采购 ==========

  // purchase_lists 表扩展字段
  const purchaseListColumns = [
    { name: 'batch_purchase_id', type: 'INTEGER' },           // 关联批量采购记录ID
    { name: 'sporadic_purchase', type: 'INTEGER DEFAULT 0' }, // 零星采购标记（0否/1是）
    { name: 'batch_purchase_order_id', type: 'INTEGER' },     // 关联批量采购订单ID
    { name: 'batch_purchase_threshold', type: 'DECIMAL(5,2) DEFAULT 0' }, // 批量采购预警阈值（百分比）
    { name: 'list_id', type: 'TEXT UNIQUE' },                 // 清单唯一标识
    { name: 'supplier_id', type: 'INTEGER' }                  // 供应商ID
  ];

  purchaseListColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE purchase_lists ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // purchase_list_items 表扩展字段
  const purchaseListItemColumns = [
    { name: 'material_id', type: 'INTEGER' },           // 关联物资ID
    { name: 'batch_id', type: 'INTEGER' },              // 关联批量采购记录ID
    { name: 'is_batch_purchase', type: 'INTEGER DEFAULT 0' }, // 是否批量采购（0否/1是）
    { name: 'batch_purchase_order_id', type: 'INTEGER' },// 关联批量采购订单ID
    { name: 'sort_order', type: 'INTEGER DEFAULT 0' }   // 排序号
  ];

  purchaseListItemColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE purchase_list_items ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 批量采购订单表 - batch_purchase_orders
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      total_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'pending',
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 批量采购订单明细表 - batch_purchase_order_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_order_id INTEGER NOT NULL,
      purchase_list_item_id INTEGER,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      total_price DECIMAL(15,2) DEFAULT 0,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_order_id) REFERENCES batch_purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (purchase_list_item_id) REFERENCES purchase_list_items(id)
    )
  `);

  // 为批量采购订单创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_orders_no ON batch_purchase_orders(batch_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_orders_project ON batch_purchase_orders(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_orders_supplier ON batch_purchase_orders(supplier_id)
  `);

  // 批量采购预警表 - batch_purchase_warnings
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchase_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      purchase_list_id INTEGER,
      batch_order_id INTEGER,
      threshold DECIMAL(5,2) DEFAULT 0,
      actual_percent DECIMAL(5,2) DEFAULT 0,
      warning_level TEXT DEFAULT 'info',
      message TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (purchase_list_id) REFERENCES purchase_lists(id),
      FOREIGN KEY (batch_order_id) REFERENCES batch_purchase_orders(id)
    )
  `);

  // 批量采购日志表 - batch_purchase_logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchase_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_order_id INTEGER,
      purchase_list_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_order_id) REFERENCES batch_purchase_orders(id),
      FOREIGN KEY (purchase_list_id) REFERENCES purchase_lists(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  // 为批量采购预警和日志创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_warnings_project ON batch_purchase_warnings(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_warnings_status ON batch_purchase_warnings(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_logs_batch ON batch_purchase_logs(batch_order_id)
  `);

  // ========== Task 32: 零星采购相关表 ==========

  // 零星采购主表 - zero_purchases
  db.exec(`
    CREATE TABLE IF NOT EXISTS zero_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      supplier_id INTEGER,
      total_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      warning_level TEXT DEFAULT 'none',
      price_warning_count INTEGER DEFAULT 0,
      is_excessive INTEGER DEFAULT 0,
      is_legal_review INTEGER DEFAULT 0,
      remarks TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为零星采购创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_zero_purchases_no ON zero_purchases(purchase_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_zero_purchases_status ON zero_purchases(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_zero_purchases_created ON zero_purchases(created_at)
  `);

  // 零星采购明细表 - zero_purchase_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS zero_purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      base_price DECIMAL(10,2),
      total_price DECIMAL(15,2) DEFAULT 0,
      has_warning INTEGER DEFAULT 0,
      warning_level TEXT DEFAULT 'none',
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES zero_purchases(id) ON DELETE CASCADE
    )
  `);

  // 为零星采购明细创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_zero_purchase_items_purchase ON zero_purchase_items(purchase_id)
  `);

  // 零星采购审批记录表 - zero_purchase_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS zero_purchase_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES zero_purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为零星采购审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_zero_purchase_approvals_purchase ON zero_purchase_approvals(purchase_id)
  `);

  // 零星采购月度统计表 - zero_purchase_monthly_stats
  db.exec(`
    CREATE TABLE IF NOT EXISTS zero_purchase_monthly_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year_month TEXT NOT NULL UNIQUE,
      batch_total_amount DECIMAL(15,2) DEFAULT 0,
      zero_purchase_total DECIMAL(15,2) DEFAULT 0,
      limit_amount DECIMAL(15,2) DEFAULT 0,
      used_percentage DECIMAL(5,2) DEFAULT 0,
      is_excessive INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ========== Task 36: 零星采购管理 ==========

  // 零星采购表 - sporadic_purchases
  db.exec(`
    CREATE TABLE IF NOT EXISTS sporadic_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sporadic_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      total_amount DECIMAL(15,2) DEFAULT 0,
      approval_step INTEGER DEFAULT 0,
      current_approver TEXT,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 零星采购明细表 - sporadic_purchase_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS sporadic_purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sporadic_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      total_price DECIMAL(15,2) DEFAULT 0,
      remark TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sporadic_id) REFERENCES sporadic_purchases(id) ON DELETE CASCADE
    )
  `);

  // 零星采购审批记录表 - sporadic_purchase_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS sporadic_purchase_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sporadic_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sporadic_id) REFERENCES sporadic_purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为零星采购创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_purchases_no ON sporadic_purchases(sporadic_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_purchases_project ON sporadic_purchases(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_purchases_status ON sporadic_purchases(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_purchase_items_sporadic ON sporadic_purchase_items(sporadic_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_purchase_approvals_sporadic ON sporadic_purchase_approvals(sporadic_id)
  `);

  // ========== Task 35: 批量采购相关表 ==========

  // 批量采购主表 - batch_purchases
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT UNIQUE NOT NULL,
      contract_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      total_amount DECIMAL(15,2) DEFAULT 0,
      current_approver TEXT,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为批量采购创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchases_no ON batch_purchases(batch_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchases_contract ON batch_purchases(contract_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchases_project ON batch_purchases(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchases_status ON batch_purchases(status)
  `);

  // 批量采购明细表 - batch_purchase_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_purchase_id INTEGER NOT NULL,
      purchase_list_item_id INTEGER,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      total_price DECIMAL(15,2) DEFAULT 0,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_purchase_id) REFERENCES batch_purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (purchase_list_item_id) REFERENCES purchase_list_items(id)
    )
  `);

  // 为批量采购明细创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_items_batch ON batch_purchase_items(batch_purchase_id)
  `);

  // 批量采购审批记录表 - batch_purchase_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_purchase_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_purchase_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_purchase_id) REFERENCES batch_purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为批量采购审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_batch_purchase_approvals_batch ON batch_purchase_approvals(batch_purchase_id)
  `);

  // ========== Task 37: 零星采购预警表 ==========

  // 零星采购预警表 - sporadic_warnings
  db.exec(`
    CREATE TABLE IF NOT EXISTS sporadic_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      sporadic_id INTEGER,
      batch_total DECIMAL(15,2) DEFAULT 0,
      sporadic_total DECIMAL(15,2) DEFAULT 0,
      percentage DECIMAL(5,2) DEFAULT 0,
      status TEXT DEFAULT 'active',
      message TEXT,
      handler_id INTEGER,
      handle_remark TEXT,
      handled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (sporadic_id) REFERENCES sporadic_purchases(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    )
  `);

  // 为零星采购预警创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_warnings_project ON sporadic_warnings(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_warnings_status ON sporadic_warnings(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sporadic_warnings_sporadic ON sporadic_warnings(sporadic_id)
  `);

  // ========== Task 38: 物资入库相关表 ==========

  // 入库单主表 - stock_in
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_in (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_in_no TEXT UNIQUE NOT NULL,
      purchase_id INTEGER,
      supplier_id INTEGER,
      total_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      operator_id INTEGER,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_id) REFERENCES batch_purchases(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (operator_id) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为入库单创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_no ON stock_in(stock_in_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_purchase ON stock_in(purchase_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_supplier ON stock_in(supplier_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_status ON stock_in(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_created ON stock_in(created_at)
  `);

  // 入库单明细表 - stock_in_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_in_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_in_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      amount DECIMAL(15,2) DEFAULT 0,
      remark TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_in_id) REFERENCES stock_in(id) ON DELETE CASCADE
    )
  `);

  // 为入库单明细创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_in_items_stock_in ON stock_in_items(stock_in_id)
  `);

  // 库存表 - inventory
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      total_value DECIMAL(15,2) DEFAULT 0,
      last_stock_in_id INTEGER,
      last_stock_in_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 为库存创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_material ON inventory(material_name, specification)
  `);

  // 库存变动记录表 - inventory_logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER,
      material_name TEXT NOT NULL,
      specification TEXT,
      change_type TEXT NOT NULL,
      change_quantity DECIMAL(10,2) DEFAULT 0,
      before_quantity DECIMAL(10,2) DEFAULT 0,
      after_quantity DECIMAL(10,2) DEFAULT 0,
      stock_in_id INTEGER,
      stock_out_id INTEGER,
      operator_id INTEGER,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (inventory_id) REFERENCES inventory(id),
      FOREIGN KEY (stock_in_id) REFERENCES stock_in(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    )
  `);

  // 为库存变动记录创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_material ON inventory_logs(material_name)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_type ON inventory_logs(change_type)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_logs_created ON inventory_logs(created_at)
  `);

  // ========== Task 39: 物资入库 - 库存更新扩展字段 ==========

  // stock_in 表扩展字段
  const stockInColumns = [
    { name: 'project_id', type: 'INTEGER' },
    { name: 'batch_purchase_id', type: 'INTEGER' },
    { name: 'sporadic_purchase_id', type: 'INTEGER' },
    { name: 'total_quantity', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'handler_id', type: 'INTEGER' },
    { name: 'handler_name', type: 'TEXT' },
    { name: 'in_date', type: 'DATE' },
    { name: 'payment_status', type: "TEXT DEFAULT 'unpaid'" }  // Task 48: 入库单付款状态
  ];

  stockInColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE stock_in ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // stock_in_items 表扩展字段
  const stockInItemColumns = [
    { name: 'available_quantity', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'total_price', type: 'DECIMAL(15,2) DEFAULT 0' }
  ];

  stockInItemColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE stock_in_items ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // inventory 表扩展字段（库存管理）
  const inventoryColumns = [
    { name: 'available_quantity', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'locked_quantity', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'max_quantity', type: 'DECIMAL(10,2)' },
    { name: 'min_quantity', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'warning_quantity', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'location', type: 'TEXT' },
    { name: 'status', type: "TEXT DEFAULT 'normal'" },
    { name: 'last_out_date', type: 'DATE' }
  ];

  inventoryColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE inventory ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // inventory_logs 表扩展字段
  const inventoryLogColumns = [
    { name: 'available_before', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'available_after', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'source_type', type: 'TEXT' },
    { name: 'source_no', type: 'TEXT' },
    { name: 'operator_name', type: 'TEXT' }
  ];

  inventoryLogColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE inventory_logs ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 创建新索引（如果不存在）
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_in_project ON stock_in(project_id)`);
  } catch (e) {
    // 索引已存在或列不存在，忽略
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_stock_in_date ON stock_in(in_date)`);
  } catch (e) {
    // 索引已存在或列不存在，忽略
  }

  // ========== Task 45: 收入对账单相关表 ==========

  // 收入对账单主表 - income_statements
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      contract_id INTEGER,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      contract_amount DECIMAL(15,2) DEFAULT 0,
      progress_amount DECIMAL(15,2) DEFAULT 0,
      progress_rate DECIMAL(5,2) DEFAULT 0,
      confirmed_amount DECIMAL(15,2) DEFAULT 0,
      difference DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      confirmed_by INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (confirmed_by) REFERENCES users(id)
    )
  `);

  // 为收入对账单创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statements_no ON income_statements(statement_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statements_project ON income_statements(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statements_contract ON income_statements(contract_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statements_status ON income_statements(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statements_period ON income_statements(period_start, period_end)
  `);

  // 收入对账单明细表 - income_statement_details
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_statement_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      description TEXT,
      amount DECIMAL(15,2) DEFAULT 0,
      progress_value DECIMAL(5,2) DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (statement_id) REFERENCES income_statements(id) ON DELETE CASCADE
    )
  `);

  // 为收入对账单明细创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statement_details_statement ON income_statement_details(statement_id)
  `);

  // ========== Task 46: 收入对账单 - 产值确认扩展字段 ==========

  // income_statements 表扩展字段 - 进度确认相关
  const incomeStatementColumns = [
    { name: 'accumulated_amount', type: 'DECIMAL(15,2) DEFAULT 0' },      // 累计产值
    { name: 'progress_confirmed_by', type: 'INTEGER' },                    // 进度确认人ID
    { name: 'progress_confirmed_at', type: 'DATETIME' },                   // 进度确认时间
    { name: 'progress_status', type: "TEXT DEFAULT 'pending'" }            // 进度状态: pending/confirmed
  ];

  incomeStatementColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE income_statements ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 进度历史表 - income_statement_progress
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_statement_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL,
      progress_rate DECIMAL(5,2) NOT NULL,
      progress_amount DECIMAL(15,2) DEFAULT 0,
      accumulated_amount DECIMAL(15,2) DEFAULT 0,
      remark TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (statement_id) REFERENCES income_statements(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 为进度历史创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statement_progress_statement ON income_statement_progress(statement_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_income_statement_progress_created ON income_statement_progress(created_at)
  `);

  // ========== Task 41: 物资出库 - 出库单相关表 ==========

  // 出库单主表 - stock_out
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_out (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_out_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      application_id INTEGER NOT NULL,
      total_quantity DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      operator_id INTEGER,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (application_id) REFERENCES stock_out_applications(id),
      FOREIGN KEY (operator_id) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // Task 42: 出库单扩展字段 - 确认时间和确认人
  const stockOutColumns = [
    { name: 'confirmed_at', type: 'DATETIME' },
    { name: 'confirmed_by', type: 'INTEGER' }
  ];

  stockOutColumns.forEach(col => {
    try {
      db.exec(`ALTER TABLE stock_out ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
  });

  // 为出库单创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_no ON stock_out(stock_out_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_project ON stock_out(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_application ON stock_out(application_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_status ON stock_out(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_created ON stock_out(created_at)
  `);

  // 出库单明细表 - stock_out_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_out_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_out_id INTEGER NOT NULL,
      material_id INTEGER,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      amount DECIMAL(15,2) DEFAULT 0,
      remark TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_out_id) REFERENCES stock_out(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES inventory(id)
    )
  `);

  // 为出库单明细创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_items_stock_out ON stock_out_items(stock_out_id)
  `);

  // ========== Task 43: 物资退库相关表 ==========

  // 退库单主表 - stock_return
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_return (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_no TEXT UNIQUE NOT NULL,
      stock_out_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      total_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      remark TEXT,
      operator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      confirmed_by INTEGER,
      FOREIGN KEY (stock_out_id) REFERENCES stock_out(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (operator_id) REFERENCES users(id),
      FOREIGN KEY (confirmed_by) REFERENCES users(id)
    )
  `);

  // 为退库单创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_return_no ON stock_return(return_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_return_stock_out ON stock_return(stock_out_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_return_project ON stock_return(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_return_status ON stock_return(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_return_created ON stock_return(created_at)
  `);

  // 退库单明细表 - stock_return_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      unit_price DECIMAL(10,2) DEFAULT 0,
      amount DECIMAL(15,2) DEFAULT 0,
      reason TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (return_id) REFERENCES stock_return(id) ON DELETE CASCADE
    )
  `);

  // 为退库单明细创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_return_items_return ON stock_return_items(return_id)
  `);

  // ========== Task 40: 物资出库 - 领用申请相关表 ==========

  // 出库领用申请主表 - stock_out_applications
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_out_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      applicant_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approve_comment TEXT,
      approved_at DATETIME,
      reject_reason TEXT,
      rejected_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (applicant_id) REFERENCES users(id),
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 出库领用申请明细表 - stock_out_application_items
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_out_application_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      material_id INTEGER,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      quantity DECIMAL(10,2) DEFAULT 0,
      available_quantity DECIMAL(10,2) DEFAULT 0,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (application_id) REFERENCES stock_out_applications(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES inventory(id)
    )
  `);

  // 为出库领用申请创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_applications_no ON stock_out_applications(application_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_applications_project ON stock_out_applications(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_applications_applicant ON stock_out_applications(applicant_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_applications_status ON stock_out_applications(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_out_application_items_application ON stock_out_application_items(application_id)
  `);

  // ========== Task 47: 人工费付款相关表 ==========

  // 人工费付款主表 - labor_payments
  db.exec(`
    CREATE TABLE IF NOT EXISTS labor_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_no TEXT UNIQUE NOT NULL,
      statement_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      amount DECIMAL(15,2) DEFAULT 0,
      payee_name TEXT NOT NULL,
      payee_account TEXT,
      bank_name TEXT,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at DATETIME,
      paid_by INTEGER,
      paid_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (statement_id) REFERENCES income_statements(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (approved_by) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为人工费付款创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_payments_no ON labor_payments(payment_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_payments_statement ON labor_payments(statement_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_payments_project ON labor_payments(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_payments_status ON labor_payments(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_payments_created ON labor_payments(created_at)
  `);

  // 人工费付款审批记录表 - labor_payment_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS labor_payment_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES labor_payments(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为人工费付款审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_payment_approvals_payment ON labor_payment_approvals(payment_id)
  `);

  // ========== Task 48: 材料款付款相关表 ==========

  // 材料款付款主表 - material_payments
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_no TEXT UNIQUE NOT NULL,
      stock_in_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      supplier_id INTEGER,
      amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'pending',
      approved_by INTEGER,
      approved_at DATETIME,
      paid_by INTEGER,
      paid_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (stock_in_id) REFERENCES stock_in(id),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (approved_by) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为材料款付款创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payments_no ON material_payments(payment_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payments_stock_in ON material_payments(stock_in_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payments_project ON material_payments(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payments_supplier ON material_payments(supplier_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payments_status ON material_payments(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payments_created ON material_payments(created_at)
  `);

  // 材料款付款审批记录表 - material_payment_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_payment_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES material_payments(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为材料款付款审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_payment_approvals_payment ON material_payment_approvals(payment_id)
  `);

  // ========== Task 50: 变更管理 - 超量采购申请 ==========

  // 超量采购变更申请主表 - change_overage
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_overage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      contract_id INTEGER NOT NULL,
      overage_type TEXT NOT NULL,
      overage_amount DECIMAL(15,2) DEFAULT 0,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approved_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为超量采购变更创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_no ON change_overage(change_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_project ON change_overage(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_contract ON change_overage(contract_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_status ON change_overage(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_created ON change_overage(created_at)
  `);

  // 超量采购变更审批记录表 - change_overage_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_overage_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      overage_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (overage_id) REFERENCES change_overage(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为超量采购变更审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_approvals_overage ON change_overage_approvals(overage_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_overage_approvals_role ON change_overage_approvals(role)
  `);

  // ========== Task 52: 变更管理 - 现场签证 ==========

  // 现场签证主表 - change_visa
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_visa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visa_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      visa_content TEXT NOT NULL,
      reason TEXT NOT NULL,
      amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approved_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为现场签证创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_visa_no ON change_visa(visa_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_visa_project ON change_visa(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_visa_status ON change_visa(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_visa_created ON change_visa(created_at)
  `);

  // 现场签证审批记录表 - change_visa_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_visa_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visa_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visa_id) REFERENCES change_visa(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为现场签证审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_visa_approvals_visa ON change_visa_approvals(visa_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_visa_approvals_role ON change_visa_approvals(role)
  `);

  // ========== Task 51: 变更管理 - 新增设备材料 ==========

  // 新增设备材料申请表 - change_material
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_material (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      material_name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      reason TEXT NOT NULL,
      estimated_price DECIMAL(10,2),
      status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approved_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为新增材料申请创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_material_no ON change_material(change_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_material_project ON change_material(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_material_status ON change_material(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_material_created ON change_material(created_at)
  `);

  // 新增材料审批记录表 - material_change_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS material_change_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_change_id INTEGER NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_change_id) REFERENCES change_material(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为新增材料审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_material_change_approvals_material ON material_change_approvals(material_change_id)
  `);

  // ========== Task 53: 变更管理 - 甲方需求变更 ==========

  // 甲方需求变更主表 - change_owner
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_owner (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      change_content TEXT NOT NULL,
      reason TEXT NOT NULL,
      impact_assessment TEXT,
      cost_impact DECIMAL(15,2) DEFAULT 0,
      schedule_impact INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approved_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为甲方需求变更创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_owner_no ON change_owner(change_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_owner_project ON change_owner(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_owner_status ON change_owner(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_owner_created ON change_owner(created_at)
  `);

  // 甲方需求变更审批记录表 - change_owner_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_owner_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_change_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_change_id) REFERENCES change_owner(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为甲方需求变更审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_owner_approvals_owner ON change_owner_approvals(owner_change_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_owner_approvals_role ON change_owner_approvals(role)
  `);

  // ========== Task 54: 施工管理 - 里程碑设置 ==========

  // 里程碑主表 - construction_milestones
  db.exec(`
    CREATE TABLE IF NOT EXISTS construction_milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      milestone_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      planned_date DATE NOT NULL,
      actual_date DATE,
      status TEXT DEFAULT 'pending',
      progress_rate DECIMAL(5,2) DEFAULT 0,
      remark TEXT,
      creator_id INTEGER,
      completed_by INTEGER,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (creator_id) REFERENCES users(id),
      FOREIGN KEY (completed_by) REFERENCES users(id)
    )
  `);

  // 为里程碑创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_milestones_no ON construction_milestones(milestone_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_milestones_project ON construction_milestones(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_milestones_status ON construction_milestones(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_milestones_planned_date ON construction_milestones(planned_date)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_milestones_created ON construction_milestones(created_at)
  `);

  // ========== Task 55: 施工管理 - 进度填报 ==========

  // 施工进度填报表 - construction_progress
  db.exec(`
    CREATE TABLE IF NOT EXISTS construction_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      progress_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      milestone_id INTEGER,
      report_date DATE NOT NULL,
      progress_rate DECIMAL(5,2) DEFAULT 0,
      work_content TEXT,
      issues TEXT,
      next_plan TEXT,
      reporter_id INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (milestone_id) REFERENCES construction_milestones(id),
      FOREIGN KEY (reporter_id) REFERENCES users(id)
    )
  `);

  // 为进度填报创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_progress_no ON construction_progress(progress_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_progress_project ON construction_progress(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_progress_milestone ON construction_progress(milestone_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_progress_reporter ON construction_progress(reporter_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_progress_date ON construction_progress(report_date)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_progress_status ON construction_progress(status)
  `);

  // ========== Task 56: 施工管理 - 偏差预警 ==========

  // 施工偏差预警表 - construction_warnings
  db.exec(`
    CREATE TABLE IF NOT EXISTS construction_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      milestone_id INTEGER NOT NULL,
      planned_progress DECIMAL(5,2) DEFAULT 0,
      actual_progress DECIMAL(5,2) DEFAULT 0,
      deviation_rate DECIMAL(5,2) DEFAULT 0,
      warning_level TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      handler_id INTEGER,
      handle_remark TEXT,
      handled_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (milestone_id) REFERENCES construction_milestones(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    )
  `);

  // 为施工偏差预警创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_warnings_project ON construction_warnings(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_warnings_milestone ON construction_warnings(milestone_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_warnings_level ON construction_warnings(warning_level)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_warnings_status ON construction_warnings(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_construction_warnings_created ON construction_warnings(created_at)
  `);

  // ========== Task 57: 竣工管理 - 劳务结算 ==========

  // 劳务结算主表 - labor_settlement
  db.exec(`
    CREATE TABLE IF NOT EXISTS labor_settlement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      statement_id INTEGER,
      total_amount DECIMAL(15,2) DEFAULT 0,
      paid_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'pending',
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (statement_id) REFERENCES income_statements(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为劳务结算创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_settlement_no ON labor_settlement(settlement_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_settlement_project ON labor_settlement(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_settlement_statement ON labor_settlement(statement_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_labor_settlement_status ON labor_settlement(status)
  `);

  // ========== Task 58: 竣工管理 - 竣工图纸 ==========

  // 竣工图纸表 - completion_drawings
  db.exec(`
    CREATE TABLE IF NOT EXISTS completion_drawings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      drawing_name TEXT NOT NULL,
      drawing_type TEXT DEFAULT 'general',
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      upload_date DATE,
      uploader_id INTEGER,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (uploader_id) REFERENCES users(id)
    )
  `);

  // 为竣工图纸创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_drawings_project ON completion_drawings(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_drawings_type ON completion_drawings(drawing_type)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_drawings_upload_date ON completion_drawings(upload_date)
  `);

  // ========== Task 57: 竣工管理 - 劳务结算 ==========

  // 劳务结算主表 - completion_labor_settlements
  db.exec(`
    CREATE TABLE IF NOT EXISTS completion_labor_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_no TEXT UNIQUE NOT NULL,
      project_id INTEGER NOT NULL,
      worker_name TEXT NOT NULL,
      work_type TEXT NOT NULL,
      work_days DECIMAL(10,2) DEFAULT 0,
      daily_rate DECIMAL(10,2) DEFAULT 0,
      total_amount DECIMAL(15,2) DEFAULT 0,
      deduction DECIMAL(15,2) DEFAULT 0,
      actual_amount DECIMAL(15,2) DEFAULT 0,
      status TEXT DEFAULT 'pending',
      approver_id INTEGER,
      approved_at DATETIME,
      paid_by INTEGER,
      paid_at DATETIME,
      remark TEXT,
      creator_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (approver_id) REFERENCES users(id),
      FOREIGN KEY (paid_by) REFERENCES users(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    )
  `);

  // 为劳务结算创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlements_no ON completion_labor_settlements(settlement_no)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlements_project ON completion_labor_settlements(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlements_status ON completion_labor_settlements(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlements_worker ON completion_labor_settlements(worker_name)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlements_created ON completion_labor_settlements(created_at)
  `);

  // 劳务结算审批记录表 - completion_labor_settlement_approvals
  db.exec(`
    CREATE TABLE IF NOT EXISTS completion_labor_settlement_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL,
      step INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      role TEXT NOT NULL,
      approver_id INTEGER,
      action TEXT DEFAULT 'pending',
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (settlement_id) REFERENCES completion_labor_settlements(id) ON DELETE CASCADE,
      FOREIGN KEY (approver_id) REFERENCES users(id)
    )
  `);

  // 为劳务结算审批创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlement_approvals_settlement ON completion_labor_settlement_approvals(settlement_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_labor_settlement_approvals_role ON completion_labor_settlement_approvals(role)
  `);

  // ========== Task 59: 竣工管理 - 文档归档 ==========

  // 文档归档表 - completion_documents
  db.exec(`
    CREATE TABLE IF NOT EXISTS completion_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      doc_name TEXT NOT NULL,
      doc_type TEXT NOT NULL DEFAULT 'other',
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      upload_date DATE,
      uploader_id INTEGER,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (uploader_id) REFERENCES users(id)
    )
  `);

  // 为文档归档创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_documents_project ON completion_documents(project_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_documents_type ON completion_documents(doc_type)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_completion_documents_upload_date ON completion_documents(upload_date)
  `);

  console.log('Database initialized successfully');

  // 初始化部门数据
  try {
    const { initDepartments } = require('../scripts/init-departments');
    initDepartments();
  } catch (e) {
    console.log('部门数据初始化跳过:', e.message);
  }
}

module.exports = { db, initDatabase };
