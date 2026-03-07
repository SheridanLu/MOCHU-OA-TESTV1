/**
 * 成本汇总报表服务
 * Task 49: 实现项目成本统计和分析功能
 */

const { db } = require('../models/database');

/**
 * 成本分类定义
 */
const COST_CATEGORIES = {
  labor: { name: '人工费', code: 'labor' },
  material: { name: '材料费', code: 'material' },
  equipment: { name: '设备费', code: 'equipment' },
  other: { name: '其他费用', code: 'other' }
};

/**
 * 获取成本汇总
 * @param {number|null} projectId - 项目ID，null表示全部项目
 * @returns {Object} 成本汇总数据
 */
function getCostSummary(projectId = null) {
  let whereClause = '';
  const params = [];

  if (projectId) {
    whereClause = 'WHERE c.project_id = ?';
    params.push(projectId);
  }

  // 获取收入合同总金额（合同金额）
  const incomeContractResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_amount
    FROM contracts
    WHERE type = 'income' AND status = 'approved'
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取支出合同总金额（预算成本）
  const expenseContractResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_amount
    FROM contracts
    WHERE type = 'expense' AND status = 'approved'
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取人工费已付金额
  const laborPaidResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_amount
    FROM labor_payments
    WHERE status = 'paid'
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取人工费待付金额
  const laborPendingResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_amount
    FROM labor_payments
    WHERE status IN ('pending', 'approved')
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取材料款已付金额
  const materialPaidResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_amount
    FROM material_payments
    WHERE status = 'paid'
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取材料款待付金额
  const materialPendingResult = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_amount
    FROM material_payments
    WHERE status IN ('pending', 'approved')
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取采购金额（批量采购 + 零星采购）
  const batchPurchaseResult = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total_amount
    FROM batch_purchases
    WHERE status IN ('approved', 'completed')
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  const sporadicPurchaseResult = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total_amount
    FROM sporadic_purchases
    WHERE status = 'approved'
    ${projectId ? 'AND project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 获取库存出库金额（实际消耗）
  const stockOutResult = db.prepare(`
    SELECT COALESCE(SUM(so.total_amount), 0) as total_amount
    FROM stock_out so
    WHERE so.status = 'confirmed'
    ${projectId ? 'AND so.project_id = ?' : ''}
  `).get(...(projectId ? [projectId] : []));

  // 计算各成本分类
  const contractAmount = parseFloat(incomeContractResult?.total_amount || 0);
  const expenseAmount = parseFloat(expenseContractResult?.total_amount || 0);
  const laborPaid = parseFloat(laborPaidResult?.total_amount || 0);
  const laborPending = parseFloat(laborPendingResult?.total_amount || 0);
  const materialPaid = parseFloat(materialPaidResult?.total_amount || 0);
  const materialPending = parseFloat(materialPendingResult?.total_amount || 0);
  const batchPurchase = parseFloat(batchPurchaseResult?.total_amount || 0);
  const sporadicPurchase = parseFloat(sporadicPurchaseResult?.total_amount || 0);
  const stockOut = parseFloat(stockOutResult?.total_amount || 0);

  // 人工费总额
  const laborTotal = laborPaid + laborPending;
  // 材料费总额
  const materialTotal = materialPaid + materialPending + batchPurchase + sporadicPurchase;
  // 设备费（暂从支出合同中按比例估算，实际业务需要单独字段）
  const equipmentTotal = 0;
  // 其他费用
  const otherTotal = 0;

  // 已付总额
  const totalPaid = laborPaid + materialPaid;
  // 待付总额
  const totalPending = laborPending + materialPending;
  // 总成本
  const totalCost = laborTotal + materialTotal + equipmentTotal + otherTotal;

  // 计算成本占比
  const laborRatio = totalCost > 0 ? (laborTotal / totalCost * 100) : 0;
  const materialRatio = totalCost > 0 ? (materialTotal / totalCost * 100) : 0;
  const equipmentRatio = totalCost > 0 ? (equipmentTotal / totalCost * 100) : 0;
  const otherRatio = totalCost > 0 ? (otherTotal / totalCost * 100) : 0;

  // 计算利润率
  const profit = contractAmount - totalCost;
  const profitRate = contractAmount > 0 ? (profit / contractAmount * 100) : 0;

  return {
    // 汇总数据
    summary: {
      contractAmount: Math.round(contractAmount * 100) / 100,
      expenseAmount: Math.round(expenseAmount * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitRate: Math.round(profitRate * 100) / 100
    },
    // 分类统计
    categories: [
      {
        key: 'labor',
        name: '人工费',
        amount: Math.round(laborTotal * 100) / 100,
        paid: Math.round(laborPaid * 100) / 100,
        pending: Math.round(laborPending * 100) / 100,
        ratio: Math.round(laborRatio * 100) / 100
      },
      {
        key: 'material',
        name: '材料费',
        amount: Math.round(materialTotal * 100) / 100,
        paid: Math.round(materialPaid * 100) / 100,
        pending: Math.round(materialPending * 100) / 100,
        ratio: Math.round(materialRatio * 100) / 100
      },
      {
        key: 'equipment',
        name: '设备费',
        amount: Math.round(equipmentTotal * 100) / 100,
        paid: 0,
        pending: 0,
        ratio: Math.round(equipmentRatio * 100) / 100
      },
      {
        key: 'other',
        name: '其他费用',
        amount: Math.round(otherTotal * 100) / 100,
        paid: 0,
        pending: 0,
        ratio: Math.round(otherRatio * 100) / 100
      }
    ],
    // 采购统计
    purchase: {
      batch: Math.round(batchPurchase * 100) / 100,
      sporadic: Math.round(sporadicPurchase * 100) / 100
    },
    // 库存出库
    stockOut: Math.round(stockOut * 100) / 100
  };
}

/**
 * 获取按项目统计的成本数据
 * @param {Object} options - 查询选项
 * @returns {Object} 项目成本列表
 */
function getCostByProject(options = {}) {
  const { page = 1, pageSize = 20, keyword, status } = options;
  const offset = (page - 1) * pageSize;

  // 构建查询条件
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (keyword) {
    whereClause += ' AND (p.name LIKE ? OR p.project_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (status) {
    whereClause += ' AND p.status = ?';
    params.push(status);
  }

  // 获取项目列表
  const projects = db.prepare(`
    SELECT 
      p.id,
      p.project_no,
      p.name,
      p.type,
      p.status,
      p.contract_amount,
      u.real_name as manager_name,
      p.start_date,
      p.end_date
    FROM projects p
    LEFT JOIN users u ON p.manager_id = u.id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  // 获取总数
  const countResult = db.prepare(`
    SELECT COUNT(*) as total
    FROM projects p
    ${whereClause}
  `).get(...params);

  // 为每个项目计算成本
  const projectCosts = projects.map(project => {
    const summary = getCostSummary(project.id);
    return {
      ...project,
      contract_amount: parseFloat(project.contract_amount || 0),
      cost: {
        total: summary.summary.totalCost,
        paid: summary.summary.totalPaid,
        pending: summary.summary.totalPending,
        profit: summary.summary.profit,
        profitRate: summary.summary.profitRate
      },
      categories: summary.categories
    };
  });

  return {
    data: projectCosts,
    pagination: {
      page,
      pageSize,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / pageSize)
    }
  };
}

/**
 * 获取按类别统计的成本数据
 * @param {number|null} projectId - 项目ID
 * @returns {Object} 分类统计
 */
function getCostByCategory(projectId = null) {
  const summary = getCostSummary(projectId);
  
  // 获取更详细的分类明细
  let whereClause = '';
  const params = [];

  if (projectId) {
    whereClause = 'WHERE c.project_id = ?';
    params.push(projectId);
  }

  // 获取人工费明细
  const laborPayments = db.prepare(`
    SELECT 
      lp.id,
      lp.payment_no,
      lp.payee_name,
      lp.amount,
      lp.status,
      lp.created_at,
      p.name as project_name
    FROM labor_payments lp
    LEFT JOIN projects p ON lp.project_id = p.id
    ${projectId ? 'WHERE lp.project_id = ?' : ''}
    ORDER BY lp.created_at DESC
    LIMIT 100
  `).all(...(projectId ? [projectId] : []));

  // 获取材料费明细
  const materialPayments = db.prepare(`
    SELECT 
      mp.id,
      mp.payment_no,
      s.name as supplier_name,
      mp.amount,
      mp.status,
      mp.created_at,
      p.name as project_name
    FROM material_payments mp
    LEFT JOIN projects p ON mp.project_id = p.id
    LEFT JOIN suppliers s ON mp.supplier_id = s.id
    ${projectId ? 'WHERE mp.project_id = ?' : ''}
    ORDER BY mp.created_at DESC
    LIMIT 100
  `).all(...(projectId ? [projectId] : []));

  // 获取采购明细
  const purchases = db.prepare(`
    SELECT 
      bp.id,
      bp.batch_no,
      bp.total_amount,
      bp.status,
      bp.created_at,
      p.name as project_name,
      'batch' as purchase_type
    FROM batch_purchases bp
    LEFT JOIN projects p ON bp.project_id = p.id
    ${projectId ? 'WHERE bp.project_id = ?' : ''}
    UNION ALL
    SELECT 
      sp.id,
      sp.sporadic_no as batch_no,
      sp.total_amount,
      sp.status,
      sp.created_at,
      p.name as project_name,
      'sporadic' as purchase_type
    FROM sporadic_purchases sp
    LEFT JOIN projects p ON sp.project_id = p.id
    ${projectId ? 'WHERE sp.project_id = ?' : ''}
    ORDER BY created_at DESC
    LIMIT 100
  `).all(...(projectId ? [projectId, projectId] : []));

  return {
    summary: summary.categories,
    details: {
      labor: laborPayments.map(item => ({
        ...item,
        amount: parseFloat(item.amount || 0)
      })),
      material: materialPayments.map(item => ({
        ...item,
        amount: parseFloat(item.amount || 0)
      })),
      purchases: purchases.map(item => ({
        ...item,
        total_amount: parseFloat(item.total_amount || 0)
      }))
    }
  };
}

/**
 * 获取成本趋势数据
 * @param {number|null} projectId - 项目ID
 * @param {number} months - 月数，默认12个月
 * @returns {Object} 趋势数据
 */
function getCostTrend(projectId = null, months = 12) {
  const trends = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = date.toISOString().slice(0, 7);
    const monthName = `${date.getFullYear()}年${date.getMonth() + 1}月`;

    // 当月开始和结束日期
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    // 构建查询条件
    const projectFilter = projectId ? 'AND project_id = ?' : '';
    const params = projectId ? [projectId] : [];

    // 当月人工费付款
    const laborResult = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM labor_payments
      WHERE status = 'paid'
      AND date(paid_at) >= date(?) AND date(paid_at) <= date(?)
      ${projectFilter}
    `).get(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], ...params);

    // 当月材料款付款
    const materialResult = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM material_payments
      WHERE status = 'paid'
      AND date(paid_at) >= date(?) AND date(paid_at) <= date(?)
      ${projectFilter}
    `).get(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], ...params);

    // 当月采购金额
    const purchaseResult = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM batch_purchases
      WHERE status IN ('approved', 'completed')
      AND date(created_at) >= date(?) AND date(created_at) <= date(?)
      ${projectFilter}
    `).get(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], ...params);

    // 当月零星采购
    const sporadicResult = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sporadic_purchases
      WHERE status = 'approved'
      AND date(created_at) >= date(?) AND date(created_at) <= date(?)
      ${projectFilter}
    `).get(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], ...params);

    const labor = parseFloat(laborResult?.total || 0);
    const material = parseFloat(materialResult?.total || 0);
    const purchase = parseFloat(purchaseResult?.total || 0);
    const sporadic = parseFloat(sporadicResult?.total || 0);

    trends.push({
      yearMonth,
      monthName,
      labor: Math.round(labor * 100) / 100,
      material: Math.round(material * 100) / 100,
      purchase: Math.round(purchase * 100) / 100,
      sporadic: Math.round(sporadic * 100) / 100,
      total: Math.round((labor + material + purchase + sporadic) * 100) / 100
    });
  }

  return {
    trends,
    summary: {
      totalMonths: months,
      totalCost: trends.reduce((sum, t) => sum + t.total, 0),
      avgCost: trends.reduce((sum, t) => sum + t.total, 0) / months
    }
  };
}

/**
 * 导出成本报表
 * @param {number|null} projectId - 项目ID
 * @param {string} format - 导出格式 (csv/json)
 * @returns {Object} 导出数据
 */
function exportCostReport(projectId = null, format = 'json') {
  const summary = getCostSummary(projectId);
  const byProject = projectId ? null : getCostByProject({ pageSize: 1000 });
  const byCategory = getCostByCategory(projectId);
  const trend = getCostTrend(projectId, 12);

  // 获取项目信息
  let projectInfo = null;
  if (projectId) {
    projectInfo = db.prepare(`
      SELECT 
        p.*,
        u.real_name as manager_name
      FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      WHERE p.id = ?
    `).get(projectId);
  }

  const reportData = {
    title: projectId ? `项目成本报表 - ${projectInfo?.name || ''}` : '成本汇总报表',
    generatedAt: new Date().toISOString(),
    project: projectInfo,
    summary: summary.summary,
    categories: summary.categories,
    byProject: byProject?.data || null,
    byCategory: byCategory.summary,
    trend: trend.trends
  };

  if (format === 'csv') {
    // 生成CSV格式
    let csv = '成本汇总报表\n';
    csv += `生成时间,${reportData.generatedAt}\n\n`;
    
    csv += '汇总数据\n';
    csv += '项目,金额\n';
    csv += `合同金额,${summary.summary.contractAmount}\n`;
    csv += `总成本,${summary.summary.totalCost}\n`;
    csv += `已付金额,${summary.summary.totalPaid}\n`;
    csv += `待付金额,${summary.summary.totalPending}\n`;
    csv += `利润,${summary.summary.profit}\n`;
    csv += `利润率(%),${summary.summary.profitRate}\n\n`;
    
    csv += '成本分类\n';
    csv += '分类,金额,已付,待付,占比(%)\n';
    summary.categories.forEach(cat => {
      csv += `${cat.name},${cat.amount},${cat.paid},${cat.pending},${cat.ratio}\n`;
    });

    return {
      format: 'csv',
      filename: `成本报表_${new Date().toISOString().split('T')[0]}.csv`,
      content: csv
    };
  }

  return {
    format: 'json',
    filename: `成本报表_${new Date().toISOString().split('T')[0]}.json`,
    content: JSON.stringify(reportData, null, 2)
  };
}

/**
 * 获取项目列表（用于筛选）
 */
function getProjectList() {
  return db.prepare(`
    SELECT id, project_no, name, status, contract_amount
    FROM projects
    WHERE status != 'cancelled'
    ORDER BY created_at DESC
  `).all();
}

module.exports = {
  getCostSummary,
  getCostByProject,
  getCostByCategory,
  getCostTrend,
  exportCostReport,
  getProjectList,
  COST_CATEGORIES
};
