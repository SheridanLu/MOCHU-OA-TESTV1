/**
 * 成本汇总报表路由
 * Task 49: 实现项目成本统计和分析功能
 */

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const reportService = require('../services/reportService');

const router = express.Router();

// 所有路由需要认证
router.use(authMiddleware);

/**
 * GET /api/reports/cost/summary
 * 获取成本汇总
 * 查询参数: projectId (可选)
 */
router.get('/cost/summary', (req, res) => {
  try {
    const { projectId } = req.query;
    
    const summary = reportService.getCostSummary(
      projectId ? parseInt(projectId) : null
    );

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('获取成本汇总失败:', error);
    res.status(500).json({
      success: false,
      message: '获取成本汇总失败: ' + error.message
    });
  }
});

/**
 * GET /api/reports/cost/by-project
 * 按项目统计成本
 * 查询参数: page, pageSize, keyword, status
 */
router.get('/cost/by-project', (req, res) => {
  try {
    const { page, pageSize, keyword, status } = req.query;
    
    const result = reportService.getCostByProject({
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      keyword,
      status
    });

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取项目成本统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目成本统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/reports/cost/by-category
 * 按类别统计成本
 * 查询参数: projectId (可选)
 */
router.get('/cost/by-category', (req, res) => {
  try {
    const { projectId } = req.query;
    
    const result = reportService.getCostByCategory(
      projectId ? parseInt(projectId) : null
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取分类成本统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取分类成本统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/reports/cost/trend
 * 获取成本趋势
 * 查询参数: projectId (可选), months (默认12)
 */
router.get('/cost/trend', (req, res) => {
  try {
    const { projectId, months } = req.query;
    
    const result = reportService.getCostTrend(
      projectId ? parseInt(projectId) : null,
      parseInt(months) || 12
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取成本趋势失败:', error);
    res.status(500).json({
      success: false,
      message: '获取成本趋势失败: ' + error.message
    });
  }
});

/**
 * GET /api/reports/cost/export
 * 导出成本报表
 * 查询参数: projectId (可选), format (json/csv, 默认json)
 */
router.get('/cost/export', (req, res) => {
  try {
    const { projectId, format } = req.query;
    
    const result = reportService.exportCostReport(
      projectId ? parseInt(projectId) : null,
      format || 'json'
    );

    // 设置响应头
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      // 添加 BOM 以支持中文
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      res.send('\ufeff' + result.content);
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      res.send(result.content);
    }
  } catch (error) {
    console.error('导出成本报表失败:', error);
    res.status(500).json({
      success: false,
      message: '导出成本报表失败: ' + error.message
    });
  }
});

/**
 * GET /api/reports/cost/projects
 * 获取项目列表（用于筛选）
 */
router.get('/cost/projects', (req, res) => {
  try {
    const projects = reportService.getProjectList();
    
    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目列表失败: ' + error.message
    });
  }
});

module.exports = router;
