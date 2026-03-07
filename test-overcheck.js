/**
 * 测试支出合同超量校验功能
 * Task 30: 实现支出合同 - 超量校验
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'database.db');
const db = new Database(dbPath);

console.log('========== 测试支出合同超量校验功能 ==========\n');

// 1. 检查 contracts 表扩展字段
console.log('1. 检查 contracts 表扩展字段...');
const contractColumns = db.prepare("PRAGMA table_info(contracts)").all();
const overcheckColumns = ['overcheck_reason', 'overcheck_result', 'is_excessive', 'price_percentage', 'overcheck_status', 'budget_approver_id', 'budget_approved_at', 'budget_approve_comment'];
const existingColumns = contractColumns.map(c => c.name);
overcheckColumns.forEach(col => {
  if (existingColumns.includes(col)) {
    console.log(`  ✓ ${col} 字段已存在`);
  } else {
    console.log(`  ✗ ${col} 字段不存在`);
  }
});

// 2. 检查 approval_records 表
console.log('\n2. 检查 approval_records 表...');
try {
  const approvalRecordsColumns = db.prepare("PRAGMA table_info(approval_records)").all();
  if (approvalRecordsColumns.length > 0) {
    console.log('  ✓ approval_records 表已创建');
    approvalRecordsColumns.forEach(col => {
      console.log(`    - ${col.name} (${col.type})`);
    });
  } else {
    console.log('  ✗ approval_records 表不存在');
  }
} catch (e) {
  console.log('  ✗ approval_records 表查询失败:', e.message);
}

// 3. 检查 BUDGET 角色
console.log('\n3. 检查 BUDGET 角色...');
const budgetRole = db.prepare("SELECT * FROM roles WHERE code = 'BUDGET'").get();
if (budgetRole) {
  console.log('  ✓ BUDGET 角色已存在');
  console.log(`    - ID: ${budgetRole.id}`);
  console.log(`    - 名称: ${budgetRole.name}`);
  console.log(`    - 描述: ${budgetRole.description}`);
  const permissions = JSON.parse(budgetRole.permissions || '[]');
  console.log(`    - 权限数: ${permissions.length}`);
  if (permissions.includes('contract:approve')) {
    console.log('    ✓ 包含 contract:approve 权限（可审批超量校验）');
  }
} else {
  console.log('  ✗ BUDGET 角色不存在');
}

// 4. 测试超量校验逻辑
console.log('\n4. 测试超量校验逻辑...');

// 查找一个支出合同
const expenseContract = db.prepare(`
  SELECT c.*, p.contract_amount as project_budget
  FROM contracts c
  LEFT JOIN projects p ON c.project_id = p.id
  WHERE c.type = 'expense'
  LIMIT 1
`).get();

if (expenseContract) {
  console.log('  找到支出合同:');
  console.log(`    - 合同编号: ${expenseContract.contract_no}`);
  console.log(`    - 合同名称: ${expenseContract.name}`);
  console.log(`    - 合同金额: ¥${expenseContract.amount || 0}`);
  console.log(`    - 项目预算: ¥${expenseContract.project_budget || 0}`);
  console.log(`    - 超量状态: ${expenseContract.overcheck_status || 'none'}`);

  // 判断是否需要超量校验
  let needOvercheck = false;
  let reasons = [];

  if (!expenseContract.project_budget || expenseContract.project_budget === 0) {
    needOvercheck = true;
    reasons.push('项目暂未分配成本');
  }

  if (expenseContract.project_budget && expenseContract.project_budget > 0 && 
      expenseContract.amount > expenseContract.project_budget) {
    needOvercheck = true;
    const percentage = ((expenseContract.amount - expenseContract.project_budget) / expenseContract.project_budget * 100).toFixed(2);
    reasons.push(`合同金额超出项目预算 ${percentage}%`);
  }

  if (needOvercheck) {
    console.log('  ⚠️  需要超量校验:');
    reasons.forEach(r => console.log(`    - ${r}`));
  } else {
    console.log('  ✓ 无需超量校验');
  }
} else {
  console.log('  ! 未找到支出合同，跳过测试');
}

// 5. 检查超量审批记录
console.log('\n5. 检查审批记录...');
const approvalRecords = db.prepare("SELECT * FROM approval_records LIMIT 5").all();
console.log(`  审批记录数: ${approvalRecords.length}`);
if (approvalRecords.length > 0) {
  approvalRecords.forEach(record => {
    console.log(`    - ID: ${record.id}, 合同ID: ${record.contract_id}, 步骤: ${record.step_name}, 动作: ${record.action}`);
  });
}

console.log('\n========== 测试完成 ==========');

db.close();
