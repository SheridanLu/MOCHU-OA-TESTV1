/**
 * 合同编号生成器
 * 
 * 收入合同编号规则：IC + YYMMDD + 2位序号（每日重置）
 * 例如：IC25030701
 * - IC：收入合同标识 (Income Contract)
 * - 250307：日期 YYMMDD
 * - 01：当日序号
 * 
 * 支出合同编号规则：EC + YYMMDD + 2位序号（每日重置）
 * 例如：EC25030701
 * - EC：支出合同标识 (Expense Contract)
 * - 250307：日期 YYMMDD
 * - 01：当日序号
 */

const { db } = require('../models/database');

/**
 * 获取当前日期的 YYMMDD 格式
 * @returns {string} 日期字符串，如 "250307"
 */
function getDatePrefix() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2); // 取后两位
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 生成收入合同编号
 * 使用数据库事务保证唯一性
 * @returns {string} 合同编号，如 "IC25030701"
 */
function getIncomeContractNo() {
  const datePrefix = getDatePrefix();
  const contractPrefix = `IC${datePrefix}`;
  
  // 使用事务确保编号唯一性
  const transaction = db.transaction(() => {
    // 查询当日已有收入合同数量
    const countResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM contracts 
      WHERE contract_no LIKE ? AND type = 'income'
    `).get(`${contractPrefix}%`);
    
    const nextSeq = (countResult.count || 0) + 1;
    // 序号格式化为2位，如 01, 02
    const seqStr = String(nextSeq).padStart(2, '0');
    
    return `${contractPrefix}${seqStr}`;
  });
  
  return transaction();
}

/**
 * 预览下一个收入合同编号（不实际占用）
 * @returns {string} 预览的合同编号
 */
function previewIncomeContractNo() {
  const datePrefix = getDatePrefix();
  const contractPrefix = `IC${datePrefix}`;
  
  // 查询当日已有收入合同数量
  const countResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM contracts 
    WHERE contract_no LIKE ? AND type = 'income'
  `).get(`${contractPrefix}%`);
  
  const nextSeq = (countResult.count || 0) + 1;
  const seqStr = String(nextSeq).padStart(2, '0');
  
  return `${contractPrefix}${seqStr}`;
}

/**
 * 生成支出合同编号
 * 规则：EC + YYMMDD + 2位序号（每日重置）
 * 例如：EC25030701
 * @returns {string} 支出合同编号
 */
function getExpenseContractNo() {
  const datePrefix = getDatePrefix();
  const contractPrefix = `EC${datePrefix}`;
  
  // 使用事务确保编号唯一性
  const transaction = db.transaction(() => {
    // 查询当日已有支出合同数量
    const countResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM contracts 
      WHERE contract_no LIKE ? AND type = 'expense'
    `).get(`${contractPrefix}%`);
    
    const nextSeq = (countResult.count || 0) + 1;
    // 序号格式化为2位，如 01, 02
    const seqStr = String(nextSeq).padStart(2, '0');
    
    return `${contractPrefix}${seqStr}`;
  });
  
  return transaction();
}

/**
 * 预览下一个支出合同编号（不实际占用）
 * @returns {string} 预览的支出合同编号
 */
function previewExpenseContractNo() {
  const datePrefix = getDatePrefix();
  const contractPrefix = `EC${datePrefix}`;
  
  // 查询当日已有支出合同数量
  const countResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM contracts 
    WHERE contract_no LIKE ? AND type = 'expense'
  `).get(`${contractPrefix}%`);
  
  const nextSeq = (countResult.count || 0) + 1;
  const seqStr = String(nextSeq).padStart(2, '0');
  
  return `${contractPrefix}${seqStr}`;
}

/**
 * 统一入口：根据类型生成合同编号
 * @param {string} type - 合同类型：'income' 或 'expense'
 * @returns {string} 合同编号
 */
function getContractNo(type = 'income') {
  if (type === 'expense') {
    return getExpenseContractNo();
  }
  return getIncomeContractNo();
}

/**
 * 统一入口：预览下一个合同编号（不实际占用）
 * @param {string} type - 合同类型：'income' 或 'expense'
 * @returns {string} 预览的合同编号
 */
function previewContractNo(type = 'income') {
  if (type === 'expense') {
    return previewExpenseContractNo();
  }
  return previewIncomeContractNo();
}

module.exports = {
  getIncomeContractNo,
  previewIncomeContractNo,
  getExpenseContractNo,
  previewExpenseContractNo,
  getContractNo,
  previewContractNo,
  getDatePrefix
};
