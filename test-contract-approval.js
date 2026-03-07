/**
 * 测试收入合同审批流程
 */

const { db, initDatabase } = require('./backend/models/database');

// 初始化数据库
initDatabase();

console.log('\n========== 测试收入合同审批流程 ==========\n');

// 1. 查看数据库表结构
console.log('1. 检查 contracts 表结构:');
const contractsInfo = db.prepare("PRAGMA table_info(contracts)").all();
console.log('   contracts 表字段:', contractsInfo.map(col => col.name).join(', '));

// 2. 查看审批历史表
console.log('\n2. 检查 contract_approval_history 表:');
try {
  const historyInfo = db.prepare("PRAGMA table_info(contract_approval_history)").all();
  console.log('   contract_approval_history 表字段:', historyInfo.map(col => col.name).join(', '));
} catch (e) {
  console.log('   表不存在，需要重新初始化数据库');
}

// 3. 创建测试用户和角色
console.log('\n3. 创建测试数据:');

// 清理旧测试数据
db.prepare("DELETE FROM users WHERE username IN ('test_buyer', 'test_finance', 'test_legal', 'test_gm')").run();
db.prepare("DELETE FROM roles WHERE code IN ('BUYER', 'FINANCE', 'LEGAL', 'GM')").run();

// 创建测试角色
const roles = [
  { name: '采购员', code: 'BUYER', permissions: '["contract:create"]' },
  { name: '财务', code: 'FINANCE', permissions: '["contract:approve"]' },
  { name: '法务', code: 'LEGAL', permissions: '["contract:approve"]' },
  { name: '总经理', code: 'GM', permissions: '["*"]' }
];

roles.forEach(role => {
  db.prepare(`
    INSERT INTO roles (name, code, permissions)
    VALUES (?, ?, ?)
  `).run(role.name, role.code, role.permissions);
});
console.log('   ✓ 创建测试角色');

// 创建测试用户
const users = [
  { username: 'test_buyer', real_name: '测试采购员', role: 'BUYER' },
  { username: 'test_finance', real_name: '测试财务', role: 'FINANCE' },
  { username: 'test_legal', real_name: '测试法务', role: 'LEGAL' },
  { username: 'test_gm', real_name: '测试总经理', role: 'GM' }
];

users.forEach(user => {
  const result = db.prepare(`
    INSERT INTO users (username, password, real_name)
    VALUES (?, 'test123', ?)
  `).run(user.username, user.real_name);
  
  const userId = result.lastInsertRowid;
  const roleId = db.prepare('SELECT id FROM roles WHERE code = ?').get(user.role).id;
  
  db.prepare(`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (?, ?)
  `).run(userId, roleId);
});
console.log('   ✓ 创建测试用户');

// 4. 测试合同创建（草稿状态）
console.log('\n4. 测试合同创建:');
const buyerId = db.prepare('SELECT id FROM users WHERE username = ?').get('test_buyer').id;

const contractResult = db.prepare(`
  INSERT INTO contracts (
    contract_no, name, type, party_a, party_b, amount,
    status, creator_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run('IC25030701', '测试收入合同', 'income', '测试客户', '本公司', 100000, 'draft', buyerId);

const contractId = contractResult.lastInsertRowid;
console.log(`   ✓ 创建合同 ID: ${contractId}, 状态: draft`);

// 5. 测试提交审批
console.log('\n5. 测试提交审批:');

// 模拟提交审批逻辑
const transaction1 = db.transaction(() => {
  // 更新合同状态
  db.prepare(`
    UPDATE contracts 
    SET status = 'pending', 
        current_approver = 'FINANCE',
        submitter_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(buyerId, contractId);
  
  // 创建审批流程记录
  const approvalSteps = [
    { step: 1, role: 'FINANCE' },
    { step: 2, role: 'LEGAL' },
    { step: 3, role: 'GM' }
  ];
  
  approvalSteps.forEach(step => {
    db.prepare(`
      INSERT INTO contract_approval_history 
      (contract_id, step, role, status)
      VALUES (?, ?, ?, 'pending')
    `).run(contractId, step.step, step.role);
  });
});

transaction1();
console.log('   ✓ 提交审批，状态: pending, 当前审批人: FINANCE');

// 6. 测试财务审批
console.log('\n6. 测试财务审批:');
const financeId = db.prepare('SELECT id FROM users WHERE username = ?').get('test_finance').id;

const transaction2 = db.transaction(() => {
  // 更新审批记录
  db.prepare(`
    UPDATE contract_approval_history 
    SET status = 'approved',
        approver_id = ?,
        approver_name = '测试财务',
        comment = '财务审核通过',
        approved_at = CURRENT_TIMESTAMP
    WHERE contract_id = ? AND role = 'FINANCE' AND status = 'pending'
  `).run(financeId, contractId);
  
  // 更新合同状态
  db.prepare(`
    UPDATE contracts 
    SET current_approver = 'LEGAL',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(contractId);
});

transaction2();
console.log('   ✓ 财务审批通过，当前审批人: LEGAL');

// 7. 测试法务审批
console.log('\n7. 测试法务审批:');
const legalId = db.prepare('SELECT id FROM users WHERE username = ?').get('test_legal').id;

const transaction3 = db.transaction(() => {
  db.prepare(`
    UPDATE contract_approval_history 
    SET status = 'approved',
        approver_id = ?,
        approver_name = '测试法务',
        comment = '法务审核通过',
        approved_at = CURRENT_TIMESTAMP
    WHERE contract_id = ? AND role = 'LEGAL' AND status = 'pending'
  `).run(legalId, contractId);
  
  db.prepare(`
    UPDATE contracts 
    SET current_approver = 'GM',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(contractId);
});

transaction3();
console.log('   ✓ 法务审批通过，当前审批人: GM');

// 8. 测试总经理审批
console.log('\n8. 测试总经理审批:');
const gmId = db.prepare('SELECT id FROM users WHERE username = ?').get('test_gm').id;

const transaction4 = db.transaction(() => {
  db.prepare(`
    UPDATE contract_approval_history 
    SET status = 'approved',
        approver_id = ?,
        approver_name = '测试总经理',
        comment = '总经理审批通过',
        approved_at = CURRENT_TIMESTAMP
    WHERE contract_id = ? AND role = 'GM' AND status = 'pending'
  `).run(gmId, contractId);
  
  db.prepare(`
    UPDATE contracts 
    SET status = 'approved',
        current_approver = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(contractId);
});

transaction4();
console.log('   ✓ 总经理审批通过，合同状态: approved');

// 9. 查看最终结果
console.log('\n9. 最终结果:');
const finalContract = db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
console.log('   合同状态:', finalContract.status);
console.log('   当前审批人:', finalContract.current_approver || '无（流程完成）');

const history = db.prepare(`
  SELECT * FROM contract_approval_history 
  WHERE contract_id = ? 
  ORDER BY step
`).all(contractId);

console.log('\n   审批历史:');
history.forEach(h => {
  console.log(`     第${h.step}步 [${h.role}]: ${h.status}${h.approver_name ? ` (${h.approver_name})` : ''}${h.comment ? ` - ${h.comment}` : ''}`);
});

console.log('\n========== 测试完成 ==========\n');

// 关闭数据库
db.close();
