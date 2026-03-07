/**
 * 审计日志路由
 * Task 60: 系统管理 - 日志审计
 */

const express = require('express');
const router = express.Router();
const auditService = require('../services/auditService');

/**
 * 获取审计日志列表
 * GET /api/audit/logs
 * 查询参数:
 * - page: 页码
 * - pageSize: 每页数量
 * - user_id: 用户ID
 * - username: 用户名
 * - action: 操作类型
 * - module: 模块名称
 * - start_date: 开始日期
 * - end_date: 结束日期
 * - keyword: 关键词搜索
 */
router.get('/logs', (req, res) => {
  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
      user_id: req.query.user_id,
      username: req.query.username,
      action: req.query.action,
      module: req.query.module,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      keyword: req.query.keyword
    };

    const result = auditService.getLogs(options);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取审计日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取审计日志失败',
      error: error.message
    });
  }
});

/**
 * 获取日志详情
 * GET /api/audit/logs/:id
 */
router.get('/logs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const log = auditService.getLogById(parseInt(id));

    if (!log) {
      return res.status(404).json({
        success: false,
        message: '日志不存在'
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('获取日志详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志详情失败',
      error: error.message
    });
  }
});

/**
 * 获取用户操作日志
 * GET /api/audit/logs/user/:userId
 */
router.get('/logs/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const options = {
      page: parseInt(req.query.page) || 1,
      pageSize: parseInt(req.query.pageSize) || 20,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      action: req.query.action
    };

    const result = auditService.getUserLogs(parseInt(userId), options);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取用户操作日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户操作日志失败',
      error: error.message
    });
  }
});

/**
 * 获取日志统计
 * GET /api/audit/stats
 * 查询参数:
 * - start_date: 开始日期
 * - end_date: 结束日期
 */
router.get('/stats', (req, res) => {
  try {
    const options = {
      start_date: req.query.start_date,
      end_date: req.query.end_date
    };

    const stats = auditService.getStats(options);
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取日志统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取日志统计失败',
      error: error.message
    });
  }
});

/**
 * 获取操作类型列表
 * GET /api/audit/action-types
 */
router.get('/action-types', (req, res) => {
  try {
    const types = auditService.getActionTypes();
    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    console.error('获取操作类型失败:', error);
    res.status(500).json({
      success: false,
      message: '获取操作类型失败',
      error: error.message
    });
  }
});

/**
 * 获取模块列表
 * GET /api/audit/modules
 */
router.get('/modules', (req, res) => {
  try {
    const modules = auditService.getModules();
    res.json({
      success: true,
      data: modules
    });
  } catch (error) {
    console.error('获取模块列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取模块列表失败',
      error: error.message
    });
  }
});

/**
 * 记录审计日志（供其他模块调用）
 * POST /api/audit/logs
 */
router.post('/logs', (req, res) => {
  try {
    const logData = {
      user_id: req.body.user_id || req.user?.id,
      username: req.body.username || req.user?.username,
      action: req.body.action,
      module: req.body.module,
      target_type: req.body.target_type,
      target_id: req.body.target_id,
      detail: req.body.detail,
      ip: req.body.ip || req.ip || req.connection?.remoteAddress,
      user_agent: req.body.user_agent || req.get('User-Agent')
    };

    if (!logData.action || !logData.module) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数：action 和 module'
      });
    }

    const log = auditService.log(logData);
    res.json({
      success: true,
      data: log,
      message: '日志记录成功'
    });
  } catch (error) {
    console.error('记录审计日志失败:', error);
    res.status(500).json({
      success: false,
      message: '记录审计日志失败',
      error: error.message
    });
  }
});

/**
 * 清理过期日志（管理员权限）
 * DELETE /api/audit/logs/clean
 * 查询参数:
 * - days: 保留天数（默认180天）
 */
router.delete('/logs/clean', (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 180;
    
    if (daysToKeep < 30) {
      return res.status(400).json({
        success: false,
        message: '保留天数不能少于30天'
      });
    }

    const deletedCount = auditService.cleanOldLogs(daysToKeep);
    res.json({
      success: true,
      message: `成功清理 ${deletedCount} 条过期日志`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('清理过期日志失败:', error);
    res.status(500).json({
      success: false,
      message: '清理过期日志失败',
      error: error.message
    });
  }
});

/**
 * 导出审计日志
 * GET /api/audit/logs/export
 * 查询参数:
 * - format: 导出格式（csv/json，默认csv）
 * - user_id: 用户ID
 * - username: 用户名
 * - action: 操作类型
 * - module: 模块名称
 * - start_date: 开始日期
 * - end_date: 结束日期
 * - keyword: 关键词搜索
 */
router.get('/logs/export', (req, res) => {
  try {
    const options = {
      page: 1,
      pageSize: 10000, // 导出最多10000条
      user_id: req.query.user_id,
      username: req.query.username,
      action: req.query.action,
      module: req.query.module,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      keyword: req.query.keyword
    };

    const result = auditService.getLogs(options);
    const logs = result.list;
    
    const format = req.query.format || 'csv';
    
    if (format === 'json') {
      // JSON格式导出
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.json`);
      res.json({
        success: true,
        data: {
          logs,
          exportedAt: new Date().toISOString(),
          total: logs.length
        }
      });
    } else {
      // CSV格式导出
      const headers = ['ID', '用户ID', '用户名', '操作类型', '模块', '目标类型', '目标ID', '操作详情', 'IP地址', '创建时间'];
      const actionMap = {
        'login': '登录',
        'logout': '登出',
        'create': '新增',
        'update': '编辑',
        'delete': '删除',
        'approve': '审批通过',
        'reject': '审批拒绝',
        'upload': '上传',
        'download': '下载',
        'export': '导出',
        'import': '导入'
      };
      const moduleMap = {
        'auth': '认证管理',
        'user': '用户管理',
        'department': '部门管理',
        'role': '角色管理',
        'permission': '权限管理',
        'project': '项目管理',
        'contract': '合同管理',
        'purchase': '采购管理',
        'stock': '库存管理',
        'finance': '财务管理',
        'approval': '审批管理',
        'change': '变更管理',
        'construction': '施工管理',
        'completion': '竣工管理',
        'report': '报表管理',
        'system': '系统管理'
      };
      
      const csvRows = [headers.join(',')];
      
      logs.forEach(log => {
        const row = [
          log.id,
          log.user_id || '',
          log.username || '',
          actionMap[log.action] || log.action,
          moduleMap[log.module] || log.module,
          log.target_type || '',
          log.target_id || '',
          `"${(log.detail || '').replace(/"/g, '""')}"`,
          log.ip || '',
          log.created_at || ''
        ];
        csvRows.push(row.join(','));
      });
      
      // 添加 BOM 以支持中文
      const csvContent = '\uFEFF' + csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.csv`);
      res.send(csvContent);
    }
  } catch (error) {
    console.error('导出审计日志失败:', error);
    res.status(500).json({
      success: false,
      message: '导出审计日志失败',
      error: error.message
    });
  }
});

module.exports = router;
