/**
 * 收入对账单路由
 * Task 45: 实现收入对账单每月25日自动生成功能
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const incomeStatementService = require('../services/incomeStatementService');

const router = express.Router();

// 所有路由需要认证
router.use(authMiddleware);

/**
 * GET /api/income-statements
 * 获取对账单列表
 * 查询参数: projectId, status, yearMonth, page, pageSize
 */
router.get('/', (req, res) => {
  try {
    const { projectId, status, yearMonth, page, pageSize } = req.query;
    
    const result = incomeStatementService.getStatements({
      projectId,
      status,
      yearMonth,
      page,
      pageSize
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取对账单列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取对账单列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/income-statements/:id
 * 获取对账单详情
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const statement = incomeStatementService.getStatementById(parseInt(id));
    
    if (!statement) {
      return res.status(404).json({
        success: false,
        message: '对账单不存在'
      });
    }

    res.json({
      success: true,
      data: statement
    });
  } catch (error) {
    console.error('获取对账单详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取对账单详情失败: ' + error.message
    });
  }
});

/**
 * POST /api/income-statements/generate
 * 手动生成对账单
 * 请求体: { projectId, periodStart?, periodEnd? }
 */
router.post('/generate', (req, res) => {
  try {
    const { projectId, periodStart, periodEnd } = req.body;
    const userId = req.user?.id;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: '请选择项目'
      });
    }

    const statement = incomeStatementService.generateMonthly(projectId, {
      periodStart,
      periodEnd,
      creatorId: userId
    });

    res.json({
      success: true,
      message: '对账单生成成功',
      data: statement
    });
  } catch (error) {
    console.error('生成对账单失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '生成对账单失败'
    });
  }
});

/**
 * POST /api/income-statements/generate-all
 * 为所有活跃项目生成对账单
 */
router.post('/generate-all', (req, res) => {
  try {
    const result = incomeStatementService.autoGenerateForAllProjects();

    res.json({
      success: true,
      message: `已生成 ${result.success} 个对账单，失败 ${result.failed} 个`,
      data: result
    });
  } catch (error) {
    console.error('批量生成对账单失败:', error);
    res.status(500).json({
      success: false,
      message: '批量生成对账单失败: ' + error.message
    });
  }
});

/**
 * PUT /api/income-statements/:id
 * 更新对账单
 * 请求体: { progressRate?, confirmedAmount?, difference?, remark? }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { progressRate, confirmedAmount, difference, remark } = req.body;

    // 如果提供了进度率，重新计算确认金额和差异
    let updates = { remark };
    
    if (progressRate !== undefined) {
      const statement = db.prepare('SELECT * FROM income_statements WHERE id = ?').get(id);
      if (statement) {
        const contractAmount = parseFloat(statement.contract_amount) || 0;
        const newConfirmedAmount = Math.round(contractAmount * progressRate / 100 * 100) / 100;
        const progressAmount = parseFloat(statement.progress_amount) || 0;
        const newDifference = Math.round((progressAmount - newConfirmedAmount) * 100) / 100;
        
        updates.progressRate = progressRate;
        updates.confirmedAmount = newConfirmedAmount;
        updates.difference = newDifference;
      }
    } else if (confirmedAmount !== undefined) {
      updates.confirmedAmount = confirmedAmount;
      if (difference !== undefined) {
        updates.difference = difference;
      }
    }

    const statement = incomeStatementService.updateStatement(parseInt(id), updates);

    res.json({
      success: true,
      message: '对账单更新成功',
      data: statement
    });
  } catch (error) {
    console.error('更新对账单失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '更新对账单失败'
    });
  }
});

/**
 * POST /api/income-statements/:id/confirm
 * 确认对账单
 */
router.post('/:id/confirm', (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const statement = incomeStatementService.confirmStatement(parseInt(id), userId);

    res.json({
      success: true,
      message: '对账单确认成功',
      data: statement
    });
  } catch (error) {
    console.error('确认对账单失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '确认对账单失败'
    });
  }
});

/**
 * DELETE /api/income-statements/:id
 * 删除对账单（仅限草稿状态）
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const statement = db.prepare('SELECT * FROM income_statements WHERE id = ?').get(id);
    
    if (!statement) {
      return res.status(404).json({
        success: false,
        message: '对账单不存在'
      });
    }

    if (statement.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: '已确认的对账单不能删除'
      });
    }

    // 删除明细
    db.prepare('DELETE FROM income_statement_details WHERE statement_id = ?').run(id);
    
    // 删除主表
    db.prepare('DELETE FROM income_statements WHERE id = ?').run(id);

    res.json({
      success: true,
      message: '对账单删除成功'
    });
  } catch (error) {
    console.error('删除对账单失败:', error);
    res.status(500).json({
      success: false,
      message: '删除对账单失败: ' + error.message
    });
  }
});

/**
 * GET /api/income-statements/progress/:projectId
 * 获取项目进度信息
 */
router.get('/progress/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    
    const progressInfo = incomeStatementService.calculateProgress(parseInt(projectId));
    const contractInfo = incomeStatementService.syncContract(parseInt(projectId));

    res.json({
      success: true,
      data: {
        ...progressInfo,
        contractAmount: contractInfo.contractAmount,
        contractId: contractInfo.contractId
      }
    });
  } catch (error) {
    console.error('获取项目进度失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目进度失败: ' + error.message
    });
  }
});

/**
 * GET /api/income-statements/stats/overview
 * 获取对账单统计概览
 */
router.get('/stats/overview', (req, res) => {
  try {
    // 本月对账单统计
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_count,
        SUM(confirmed_amount) as total_confirmed_amount,
        SUM(progress_amount) as total_progress_amount
      FROM income_statements
      WHERE strftime('%Y-%m', created_at) = ?
    `).get(currentMonth);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计概览失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计概览失败: ' + error.message
    });
  }
});

// ==================== Task 46: 进度与产值确认 API ====================

/**
 * PUT /api/income-statements/:id/progress
 * 更新进度产值
 * 请求体: { progressRate, remark }
 */
router.put('/:id/progress', (req, res) => {
  try {
    const { id } = req.params;
    const { progressRate, remark } = req.body;
    const userId = req.user?.id;

    // 参数校验
    if (progressRate === undefined || progressRate === null) {
      return res.status(400).json({
        success: false,
        message: '请提供进度百分比'
      });
    }

    const rate = parseFloat(progressRate);
    if (isNaN(rate)) {
      return res.status(400).json({
        success: false,
        message: '进度百分比必须是数字'
      });
    }

    const statement = incomeStatementService.updateProgress(
      parseInt(id), 
      rate, 
      remark, 
      userId
    );

    res.json({
      success: true,
      message: '进度更新成功',
      data: statement
    });
  } catch (error) {
    console.error('更新进度失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '更新进度失败'
    });
  }
});

/**
 * GET /api/income-statements/:id/progress-history
 * 获取进度历史
 */
router.get('/:id/progress-history', (req, res) => {
  try {
    const { id } = req.params;
    
    const history = incomeStatementService.getProgressHistory(parseInt(id));

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('获取进度历史失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取进度历史失败'
    });
  }
});

/**
 * POST /api/income-statements/:id/confirm-progress
 * 确认进度
 * 请求体: { comment }
 */
router.post('/:id/confirm-progress', (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user?.id;

    const statement = incomeStatementService.confirmProgress(
      parseInt(id), 
      userId, 
      comment
    );

    res.json({
      success: true,
      message: '进度确认成功',
      data: statement
    });
  } catch (error) {
    console.error('确认进度失败:', error);
    res.status(400).json({
      success: false,
      message: error.message || '确认进度失败'
    });
  }
});

/**
 * GET /api/income-statements/project/:projectId/progress-stats
 * 获取项目进度统计
 */
router.get('/project/:projectId/progress-stats', (req, res) => {
  try {
    const { projectId } = req.params;
    
    const stats = incomeStatementService.getProjectProgressStats(parseInt(projectId));

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取项目进度统计失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '获取项目进度统计失败'
    });
  }
});

module.exports = router;
