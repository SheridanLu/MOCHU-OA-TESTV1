/**
 * 项目编号生成器
 * 实体项目编号规则：P + YYMMDD + 3位序号（每日重置）
 * 例如：P250307001
 * 
 * 虚拟项目编号规则：V + YYMM + 3位序号（每月重置）
 * 例如：V2503001
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
 * 获取当前年月的 YYMM 格式（用于虚拟项目编号）
 * @returns {string} 年月字符串，如 "2503"
 */
function getMonthPrefix() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2); // 取后两位
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

/**
 * 生成实体项目编号
 * 使用数据库事务保证唯一性
 * @returns {string} 项目编号，如 "P250307001"
 */
function getEntityProjectNo() {
  const datePrefix = getDatePrefix();
  const projectPrefix = `P${datePrefix}`;
  
  // 使用事务确保编号唯一性
  const transaction = db.transaction(() => {
    // 查询当日已有项目数量（查找以当天日期前缀开头的项目编号）
    const countResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM projects 
      WHERE project_no LIKE ?
    `).get(`${projectPrefix}%`);
    
    const nextSeq = (countResult.count || 0) + 1;
    // 序号格式化为3位，如 001, 002
    const seqStr = String(nextSeq).padStart(3, '0');
    
    return `${projectPrefix}${seqStr}`;
  });
  
  return transaction();
}

/**
 * 预览下一个实体项目编号（不实际占用）
 * @returns {string} 预览的项目编号
 */
function previewEntityProjectNo() {
  const datePrefix = getDatePrefix();
  const projectPrefix = `P${datePrefix}`;
  
  // 查询当日已有项目数量
  const countResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM projects 
    WHERE project_no LIKE ?
  `).get(`${projectPrefix}%`);
  
  const nextSeq = (countResult.count || 0) + 1;
  const seqStr = String(nextSeq).padStart(3, '0');
  
  return `${projectPrefix}${seqStr}`;
}

/**
 * 生成虚拟项目编号
 * 规则：V + YYMM + 3位序号（每月重置）
 * 例如：V2503001
 * @returns {string} 虚拟项目编号
 */
function getVirtualProjectNo() {
  const monthPrefix = getMonthPrefix();
  const projectPrefix = `V${monthPrefix}`;
  
  // 使用事务确保编号唯一性
  const transaction = db.transaction(() => {
    // 查询当月已有虚拟项目数量（查找以当月前缀开头的虚拟项目编号）
    const countResult = db.prepare(`
      SELECT COUNT(*) as count 
      FROM projects 
      WHERE project_no LIKE ? AND type = 'virtual'
    `).get(`${projectPrefix}%`);
    
    const nextSeq = (countResult.count || 0) + 1;
    // 序号格式化为3位，如 001, 002
    const seqStr = String(nextSeq).padStart(3, '0');
    
    return `${projectPrefix}${seqStr}`;
  });
  
  return transaction();
}

/**
 * 预览下一个虚拟项目编号（不实际占用）
 * @returns {string} 预览的虚拟项目编号
 */
function previewVirtualProjectNo() {
  const monthPrefix = getMonthPrefix();
  const projectPrefix = `V${monthPrefix}`;
  
  // 查询当月已有虚拟项目数量
  const countResult = db.prepare(`
    SELECT COUNT(*) as count 
    FROM projects 
    WHERE project_no LIKE ? AND type = 'virtual'
  `).get(`${projectPrefix}%`);
  
  const nextSeq = (countResult.count || 0) + 1;
  const seqStr = String(nextSeq).padStart(3, '0');
  
  return `${projectPrefix}${seqStr}`;
}

/**
 * 统一入口：根据类型生成项目编号
 * @param {string} type - 项目类型：'entity' 或 'virtual'
 * @returns {string} 项目编号
 */
function getProjectNo(type = 'entity') {
  if (type === 'virtual') {
    return getVirtualProjectNo();
  }
  return getEntityProjectNo();
}

/**
 * 统一入口：预览下一个项目编号（不实际占用）
 * @param {string} type - 项目类型：'entity' 或 'virtual'
 * @returns {string} 预览的项目编号
 */
function previewProjectNo(type = 'entity') {
  if (type === 'virtual') {
    return previewVirtualProjectNo();
  }
  return previewEntityProjectNo();
}

module.exports = {
  getEntityProjectNo,
  previewEntityProjectNo,
  getVirtualProjectNo,
  previewVirtualProjectNo,
  getProjectNo,
  previewProjectNo,
  getDatePrefix,
  getMonthPrefix
};
