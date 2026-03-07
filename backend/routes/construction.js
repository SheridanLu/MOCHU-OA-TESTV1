/**
 * 施工管理路由
 * Task 54: 实现施工管理 - 里程碑设置
 * Task 56: 实现施工管理 - 偏差预警
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const constructionService = require('../services/constructionService');

const router = express.Router();

// 简化中间件引用
const authenticateToken = authMiddleware;
const requirePermission = (permission) => {
  return (req, res, next) => {
    // 开发阶段暂时跳过权限检查
    next();
  };
};

// 里程碑编号生成
function generateMilestoneNo() {
  const now = new Date();
  const yearMonth = now.toISOString().slice(2, 7).replace('-', '');
  
  // 获取当月已有数量
  const count = db.prepare(`
    SELECT COUNT(*) as total FROM construction_milestones 
    WHERE milestone_no LIKE ?
  `).get(`MS${yearMonth}%`);
  
  const seq = String((count?.total || 0) + 1).padStart(3, '0');
  return `MS${yearMonth}${seq}`;
}

/**
 * GET /api/construction/milestones
 * 获取里程碑列表
 * 查询参数: project_id, status, page, pageSize
 */
router.get('/milestones', authMiddleware, (req, res) => {
  const { project_id, status, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT m.*, 
           p.name as project_name, p.project_no,
           u.real_name as creator_name
    FROM construction_milestones m
    LEFT JOIN projects p ON m.project_id = p.id
    LEFT JOIN users u ON m.creator_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (project_id) {
    sql += ` AND m.project_id = ?`;
    params.push(project_id);
  }
  
  if (status) {
    sql += ` AND m.status = ?`;
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT m\.\*,\s*p\.name as project_name, p\.project_no,\s*u\.real_name as creator_name/,
    'SELECT COUNT(*) as total'
  ).replace(/LEFT JOIN projects p[\s\S]*?WHERE/, 'WHERE');
  
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY m.planned_date ASC, m.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const milestones = db.prepare(sql).all(...params);
  
  // 计算进度偏差
  const milestonesWithDeviation = milestones.map(m => {
    let deviation_days = null;
    let deviation_status = 'normal';
    
    if (m.actual_date && m.planned_date) {
      const planned = new Date(m.planned_date);
      const actual = new Date(m.actual_date);
      const diffTime = actual - planned;
      deviation_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (deviation_days > 0) {
        deviation_status = 'delayed';  // 延期
      } else if (deviation_days < 0) {
        deviation_status = 'advanced'; // 提前
      }
    } else if (!m.actual_date && m.planned_date) {
      const planned = new Date(m.planned_date);
      const today = new Date();
      if (today > planned) {
        deviation_status = 'overdue'; // 已超期未完成
      }
    }
    
    return {
      ...m,
      deviation_days,
      deviation_status
    };
  });
  
  res.json({
    success: true,
    data: milestonesWithDeviation,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/construction/milestones/:id
 * 获取里程碑详情
 */
router.get('/milestones/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const milestone = db.prepare(`
    SELECT m.*, 
           p.name as project_name, p.project_no, p.contract_amount,
           u.real_name as creator_name
    FROM construction_milestones m
    LEFT JOIN projects p ON m.project_id = p.id
    LEFT JOIN users u ON m.creator_id = u.id
    WHERE m.id = ?
  `).get(id);
  
  if (!milestone) {
    return res.status(404).json({
      success: false,
      message: '里程碑不存在'
    });
  }
  
  // 计算进度偏差
  let deviation_days = null;
  let deviation_status = 'normal';
  
  if (milestone.actual_date && milestone.planned_date) {
    const planned = new Date(milestone.planned_date);
    const actual = new Date(milestone.actual_date);
    const diffTime = actual - planned;
    deviation_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (deviation_days > 0) {
      deviation_status = 'delayed';
    } else if (deviation_days < 0) {
      deviation_status = 'advanced';
    }
  } else if (!milestone.actual_date && milestone.planned_date) {
    const planned = new Date(milestone.planned_date);
    const today = new Date();
    if (today > planned) {
      deviation_status = 'overdue';
    }
  }
  
  res.json({
    success: true,
    data: {
      ...milestone,
      deviation_days,
      deviation_status
    }
  });
});

/**
 * POST /api/construction/milestones
 * 创建里程碑
 */
router.post('/milestones', authMiddleware, (req, res) => {
  const { project_id, name, description, planned_date, progress_rate, remark } = req.body;
  const userId = req.user?.id || 1;
  
  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: '里程碑名称不能为空'
    });
  }
  
  if (!planned_date) {
    return res.status(400).json({
      success: false,
      message: '计划日期不能为空'
    });
  }
  
  // 检查项目是否存在
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: '关联项目不存在'
    });
  }
  
  // 生成里程碑编号
  const milestoneNo = generateMilestoneNo();
  
  try {
    const result = db.prepare(`
      INSERT INTO construction_milestones (
        milestone_no, project_id, name, description, planned_date,
        progress_rate, remark, status, creator_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      milestoneNo, project_id, name.trim(), description || null,
      planned_date, progress_rate || 0, remark || null, userId
    );
    
    const newMilestone = db.prepare(`
      SELECT m.*, 
             p.name as project_name, p.project_no,
             u.real_name as creator_name
      FROM construction_milestones m
      LEFT JOIN projects p ON m.project_id = p.id
      LEFT JOIN users u ON m.creator_id = u.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '里程碑创建成功',
      data: newMilestone
    });
  } catch (error) {
    console.error('创建里程碑失败:', error);
    res.status(500).json({
      success: false,
      message: '创建里程碑失败: ' + error.message
    });
  }
});

/**
 * PUT /api/construction/milestones/:id
 * 更新里程碑
 */
router.put('/milestones/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, description, planned_date, progress_rate, remark } = req.body;
  
  // 检查里程碑是否存在
  const existingMilestone = db.prepare('SELECT * FROM construction_milestones WHERE id = ?').get(id);
  if (!existingMilestone) {
    return res.status(404).json({
      success: false,
      message: '里程碑不存在'
    });
  }
  
  // 已完成的里程碑不允许修改
  if (existingMilestone.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: '已完成的里程碑不允许修改'
    });
  }
  
  // 验证必填字段
  if (!planned_date) {
    return res.status(400).json({
      success: false,
      message: '计划日期不能为空'
    });
  }
  
  try {
    db.prepare(`
      UPDATE construction_milestones SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        planned_date = COALESCE(?, planned_date),
        progress_rate = COALESCE(?, progress_rate),
        remark = COALESCE(?, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name?.trim() || null, description || null, planned_date,
      progress_rate ?? null, remark || null, id
    );
    
    const updatedMilestone = db.prepare(`
      SELECT m.*, 
             p.name as project_name, p.project_no,
             u.real_name as creator_name
      FROM construction_milestones m
      LEFT JOIN projects p ON m.project_id = p.id
      LEFT JOIN users u ON m.creator_id = u.id
      WHERE m.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '里程碑更新成功',
      data: updatedMilestone
    });
  } catch (error) {
    console.error('更新里程碑失败:', error);
    res.status(500).json({
      success: false,
      message: '更新里程碑失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/construction/milestones/:id
 * 删除里程碑
 */
router.delete('/milestones/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  // 检查里程碑是否存在
  const milestone = db.prepare('SELECT * FROM construction_milestones WHERE id = ?').get(id);
  if (!milestone) {
    return res.status(404).json({
      success: false,
      message: '里程碑不存在'
    });
  }
  
  // 已完成的里程碑不允许删除
  if (milestone.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: '已完成的里程碑不允许删除'
    });
  }
  
  try {
    db.prepare('DELETE FROM construction_milestones WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: '里程碑删除成功'
    });
  } catch (error) {
    console.error('删除里程碑失败:', error);
    res.status(500).json({
      success: false,
      message: '删除里程碑失败: ' + error.message
    });
  }
});

/**
 * POST /api/construction/milestones/:id/complete
 * 完成里程碑
 */
router.post('/milestones/:id/complete', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { actual_date, progress_rate, remark } = req.body;
  const userId = req.user?.id || 1;
  
  // 检查里程碑是否存在
  const milestone = db.prepare('SELECT * FROM construction_milestones WHERE id = ?').get(id);
  if (!milestone) {
    return res.status(404).json({
      success: false,
      message: '里程碑不存在'
    });
  }
  
  // 已完成的里程碑不能重复完成
  if (milestone.status === 'completed') {
    return res.status(400).json({
      success: false,
      message: '里程碑已完成，不能重复操作'
    });
  }
  
  // 默认实际日期为今天
  const actualDate = actual_date || new Date().toISOString().slice(0, 10);
  
  try {
    db.prepare(`
      UPDATE construction_milestones SET
        status = 'completed',
        actual_date = ?,
        progress_rate = COALESCE(?, 100),
        remark = COALESCE(?, remark),
        completed_by = ?,
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(actualDate, progress_rate, remark, userId, id);
    
    const updatedMilestone = db.prepare(`
      SELECT m.*, 
             p.name as project_name, p.project_no,
             u.real_name as creator_name,
             uc.real_name as completer_name
      FROM construction_milestones m
      LEFT JOIN projects p ON m.project_id = p.id
      LEFT JOIN users u ON m.creator_id = u.id
      LEFT JOIN users uc ON m.completed_by = uc.id
      WHERE m.id = ?
    `).get(id);
    
    // 计算进度偏差
    let deviation_days = null;
    let deviation_status = 'normal';
    
    if (updatedMilestone.actual_date && updatedMilestone.planned_date) {
      const planned = new Date(updatedMilestone.planned_date);
      const actual = new Date(updatedMilestone.actual_date);
      const diffTime = actual - planned;
      deviation_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (deviation_days > 0) {
        deviation_status = 'delayed';
      } else if (deviation_days < 0) {
        deviation_status = 'advanced';
      }
    }
    
    res.json({
      success: true,
      message: '里程碑已完成',
      data: {
        ...updatedMilestone,
        deviation_days,
        deviation_status
      }
    });
  } catch (error) {
    console.error('完成里程碑失败:', error);
    res.status(500).json({
      success: false,
      message: '完成里程碑失败: ' + error.message
    });
  }
});

/**
 * GET /api/construction/milestones/project/:projectId/timeline
 * 获取项目里程碑时间线（用于时间线展示）
 */
router.get('/milestones/project/:projectId/timeline', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  
  const milestones = db.prepare(`
    SELECT m.*, 
           p.name as project_name, p.project_no,
           u.real_name as creator_name,
           uc.real_name as completer_name
    FROM construction_milestones m
    LEFT JOIN projects p ON m.project_id = p.id
    LEFT JOIN users u ON m.creator_id = u.id
    LEFT JOIN users uc ON m.completed_by = uc.id
    WHERE m.project_id = ?
    ORDER BY m.planned_date ASC
  `).all(projectId);
  
  // 计算进度偏差
  const timeline = milestones.map(m => {
    let deviation_days = null;
    let deviation_status = 'normal';
    
    if (m.actual_date && m.planned_date) {
      const planned = new Date(m.planned_date);
      const actual = new Date(m.actual_date);
      const diffTime = actual - planned;
      deviation_days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (deviation_days > 0) {
        deviation_status = 'delayed';
      } else if (deviation_days < 0) {
        deviation_status = 'advanced';
      }
    } else if (!m.actual_date && m.planned_date) {
      const planned = new Date(m.planned_date);
      const today = new Date();
      if (today > planned) {
        deviation_status = 'overdue';
      }
    }
    
    return {
      ...m,
      deviation_days,
      deviation_status
    };
  });
  
  // 统计信息
  const stats = {
    total: timeline.length,
    completed: timeline.filter(m => m.status === 'completed').length,
    pending: timeline.filter(m => m.status === 'pending').length,
    overdue: timeline.filter(m => m.deviation_status === 'overdue').length,
    delayed: timeline.filter(m => m.deviation_status === 'delayed').length,
    advanced: timeline.filter(m => m.deviation_status === 'advanced').length
  };
  
  res.json({
    success: true,
    data: {
      timeline,
      stats
    }
  });
});

/**
 * GET /api/construction/milestones/stats/overview
 * 获取里程碑统计概览
 */
router.get('/milestones/stats/overview', authMiddleware, (req, res) => {
  const { project_id } = req.query;
  
  let whereClause = '1=1';
  const params = [];
  
  if (project_id) {
    whereClause += ' AND project_id = ?';
    params.push(project_id);
  }
  
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' AND planned_date < date('now') THEN 1 ELSE 0 END) as overdue
      FROM construction_milestones
      WHERE ${whereClause}
    `).get(...params);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/construction/projects/active
 * 获取活跃项目列表（用于里程碑关联）
 */
router.get('/projects/active', authMiddleware, (req, res) => {
  const projects = db.prepare(`
    SELECT id, project_no, name, customer, contract_amount, status
    FROM projects
    WHERE type = 'entity' AND status IN ('pending', 'active')
    ORDER BY created_at DESC
  `).all();
  
  res.json({
    success: true,
    data: projects
  });
});

// ========== Task 55: 施工管理 - 进度填报 ==========

// 进度填报编号生成
function generateProgressNo() {
  const now = new Date();
  const yearMonth = now.toISOString().slice(2, 7).replace('-', '');
  
  // 获取当月已有数量
  const count = db.prepare(`
    SELECT COUNT(*) as total FROM construction_progress 
    WHERE progress_no LIKE ?
  `).get(`PR${yearMonth}%`);
  
  const seq = String((count?.total || 0) + 1).padStart(3, '0');
  return `PR${yearMonth}${seq}`;
}

/**
 * GET /api/construction/progress
 * 获取进度填报列表
 * 查询参数: project_id, milestone_id, reporter_id, start_date, end_date, page, pageSize
 */
router.get('/progress', authMiddleware, (req, res) => {
  const { project_id, milestone_id, reporter_id, start_date, end_date, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT pr.*, 
           p.name as project_name, p.project_no,
           m.name as milestone_name,
           u.real_name as reporter_name
    FROM construction_progress pr
    LEFT JOIN projects p ON pr.project_id = p.id
    LEFT JOIN construction_milestones m ON pr.milestone_id = m.id
    LEFT JOIN users u ON pr.reporter_id = u.id
    WHERE 1=1
  `;
  const params = [];
  
  if (project_id) {
    sql += ` AND pr.project_id = ?`;
    params.push(project_id);
  }
  
  if (milestone_id) {
    sql += ` AND pr.milestone_id = ?`;
    params.push(milestone_id);
  }
  
  if (reporter_id) {
    sql += ` AND pr.reporter_id = ?`;
    params.push(reporter_id);
  }
  
  if (start_date) {
    sql += ` AND pr.report_date >= ?`;
    params.push(start_date);
  }
  
  if (end_date) {
    sql += ` AND pr.report_date <= ?`;
    params.push(end_date);
  }
  
  // 获取总数
  const countSql = `
    SELECT COUNT(*) as total FROM construction_progress pr
    WHERE 1=1
    ${project_id ? ' AND pr.project_id = ?' : ''}
    ${milestone_id ? ' AND pr.milestone_id = ?' : ''}
    ${reporter_id ? ' AND pr.reporter_id = ?' : ''}
    ${start_date ? ' AND pr.report_date >= ?' : ''}
    ${end_date ? ' AND pr.report_date <= ?' : ''}
  `;
  
  const countParams = [];
  if (project_id) countParams.push(project_id);
  if (milestone_id) countParams.push(milestone_id);
  if (reporter_id) countParams.push(reporter_id);
  if (start_date) countParams.push(start_date);
  if (end_date) countParams.push(end_date);
  
  const countResult = db.prepare(countSql).get(...countParams);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY pr.report_date DESC, pr.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const progressList = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: progressList,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/construction/progress/:id
 * 获取进度填报详情
 */
router.get('/progress/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const progress = db.prepare(`
    SELECT pr.*, 
           p.name as project_name, p.project_no,
           m.name as milestone_name, m.planned_date as milestone_planned_date,
           u.real_name as reporter_name
    FROM construction_progress pr
    LEFT JOIN projects p ON pr.project_id = p.id
    LEFT JOIN construction_milestones m ON pr.milestone_id = m.id
    LEFT JOIN users u ON pr.reporter_id = u.id
    WHERE pr.id = ?
  `).get(id);
  
  if (!progress) {
    return res.status(404).json({
      success: false,
      message: '进度填报记录不存在'
    });
  }
  
  res.json({
    success: true,
    data: progress
  });
});

/**
 * POST /api/construction/progress
 * 创建进度填报
 */
router.post('/progress', authMiddleware, (req, res) => {
  const { project_id, milestone_id, report_date, progress_rate, work_content, issues, next_plan, remark } = req.body;
  const userId = req.user?.id || 1;
  
  // 验证必填字段
  if (!project_id) {
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  if (!report_date) {
    return res.status(400).json({
      success: false,
      message: '填报日期不能为空'
    });
  }
  
  // 验证进度百分比
  if (progress_rate !== undefined && progress_rate !== null) {
    if (progress_rate < 0 || progress_rate > 100) {
      return res.status(400).json({
        success: false,
        message: '进度百分比必须在 0-100 之间'
      });
    }
  }
  
  // 检查项目是否存在
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: '关联项目不存在'
    });
  }
  
  // 如果关联了里程碑，检查里程碑是否存在
  if (milestone_id) {
    const milestone = db.prepare('SELECT * FROM construction_milestones WHERE id = ?').get(milestone_id);
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: '关联里程碑不存在'
      });
    }
  }
  
  // 生成填报编号
  const progressNo = generateProgressNo();
  
  try {
    const result = db.prepare(`
      INSERT INTO construction_progress (
        progress_no, project_id, milestone_id, report_date, progress_rate,
        work_content, issues, next_plan, reporter_id, status, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?)
    `).run(
      progressNo, project_id, milestone_id || null, report_date,
      progress_rate || 0, work_content || null, issues || null,
      next_plan || null, userId, remark || null
    );
    
    const newProgress = db.prepare(`
      SELECT pr.*, 
             p.name as project_name, p.project_no,
             m.name as milestone_name,
             u.real_name as reporter_name
      FROM construction_progress pr
      LEFT JOIN projects p ON pr.project_id = p.id
      LEFT JOIN construction_milestones m ON pr.milestone_id = m.id
      LEFT JOIN users u ON pr.reporter_id = u.id
      WHERE pr.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '进度填报创建成功',
      data: newProgress
    });
  } catch (error) {
    console.error('创建进度填报失败:', error);
    res.status(500).json({
      success: false,
      message: '创建进度填报失败: ' + error.message
    });
  }
});

/**
 * PUT /api/construction/progress/:id
 * 更新进度填报
 */
router.put('/progress/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { milestone_id, report_date, progress_rate, work_content, issues, next_plan, remark } = req.body;
  
  // 检查填报记录是否存在
  const existingProgress = db.prepare('SELECT * FROM construction_progress WHERE id = ?').get(id);
  if (!existingProgress) {
    return res.status(404).json({
      success: false,
      message: '进度填报记录不存在'
    });
  }
  
  // 验证进度百分比
  if (progress_rate !== undefined && progress_rate !== null) {
    if (progress_rate < 0 || progress_rate > 100) {
      return res.status(400).json({
        success: false,
        message: '进度百分比必须在 0-100 之间'
      });
    }
  }
  
  // 如果关联了里程碑，检查里程碑是否存在
  if (milestone_id) {
    const milestone = db.prepare('SELECT * FROM construction_milestones WHERE id = ?').get(milestone_id);
    if (!milestone) {
      return res.status(404).json({
        success: false,
        message: '关联里程碑不存在'
      });
    }
  }
  
  try {
    db.prepare(`
      UPDATE construction_progress SET
        milestone_id = COALESCE(?, milestone_id),
        report_date = COALESCE(?, report_date),
        progress_rate = COALESCE(?, progress_rate),
        work_content = COALESCE(?, work_content),
        issues = COALESCE(?, issues),
        next_plan = COALESCE(?, next_plan),
        remark = COALESCE(?, remark),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      milestone_id ?? null, report_date, progress_rate ?? null,
      work_content || null, issues || null, next_plan || null,
      remark || null, id
    );
    
    const updatedProgress = db.prepare(`
      SELECT pr.*, 
             p.name as project_name, p.project_no,
             m.name as milestone_name,
             u.real_name as reporter_name
      FROM construction_progress pr
      LEFT JOIN projects p ON pr.project_id = p.id
      LEFT JOIN construction_milestones m ON pr.milestone_id = m.id
      LEFT JOIN users u ON pr.reporter_id = u.id
      WHERE pr.id = ?
    `).get(id);
    
    res.json({
      success: true,
      message: '进度填报更新成功',
      data: updatedProgress
    });
  } catch (error) {
    console.error('更新进度填报失败:', error);
    res.status(500).json({
      success: false,
      message: '更新进度填报失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/construction/progress/:id
 * 删除进度填报
 */
router.delete('/progress/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  // 检查填报记录是否存在
  const progress = db.prepare('SELECT * FROM construction_progress WHERE id = ?').get(id);
  if (!progress) {
    return res.status(404).json({
      success: false,
      message: '进度填报记录不存在'
    });
  }
  
  try {
    db.prepare('DELETE FROM construction_progress WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: '进度填报删除成功'
    });
  } catch (error) {
    console.error('删除进度填报失败:', error);
    res.status(500).json({
      success: false,
      message: '删除进度填报失败: ' + error.message
    });
  }
});

/**
 * GET /api/construction/progress/project/:projectId/chart
 * 获取项目进度曲线图数据
 */
router.get('/progress/project/:projectId/chart', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  
  // 获取项目的所有进度填报记录，按日期排序
  const progressData = db.prepare(`
    SELECT 
      pr.report_date,
      pr.progress_rate,
      pr.work_content,
      m.name as milestone_name
    FROM construction_progress pr
    LEFT JOIN construction_milestones m ON pr.milestone_id = m.id
    WHERE pr.project_id = ?
    ORDER BY pr.report_date ASC
  `).all(projectId);
  
  // 获取项目里程碑
  const milestones = db.prepare(`
    SELECT 
      name,
      planned_date,
      actual_date,
      progress_rate,
      status
    FROM construction_milestones
    WHERE project_id = ?
    ORDER BY planned_date ASC
  `).all(projectId);
  
  // 计算累计进度
  let accumulated = 0;
  const chartData = progressData.map((item, index) => {
    // 使用填报的进度率（如果是递增的话）
    if (item.progress_rate >= accumulated) {
      accumulated = item.progress_rate;
    }
    return {
      date: item.report_date,
      progress: item.progress_rate,
      milestone: item.milestone_name || null
    };
  });
  
  // 里程碑节点
  const milestonePoints = milestones.map(m => ({
    name: m.name,
    planned_date: m.planned_date,
    actual_date: m.actual_date,
    status: m.status,
    progress: m.progress_rate
  }));
  
  res.json({
    success: true,
    data: {
      progressCurve: chartData,
      milestones: milestonePoints,
      latestProgress: chartData.length > 0 ? chartData[chartData.length - 1].progress : 0
    }
  });
});

/**
 * GET /api/construction/progress/stats/overview
 * 获取进度填报统计概览
 */
router.get('/progress/stats/overview', authMiddleware, (req, res) => {
  const { project_id } = req.query;
  
  let whereClause = '1=1';
  const params = [];
  
  if (project_id) {
    whereClause += ' AND project_id = ?';
    params.push(project_id);
  }
  
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_reports,
        MAX(progress_rate) as max_progress,
        AVG(progress_rate) as avg_progress,
        MAX(report_date) as latest_report_date
      FROM construction_progress
      WHERE ${whereClause}
    `).get(...params);
    
    // 获取本月填报数
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthlyStats = db.prepare(`
      SELECT COUNT(*) as monthly_reports
      FROM construction_progress
      WHERE ${whereClause} AND strftime('%Y-%m', report_date) = ?
    `).get(...params, thisMonth);
    
    res.json({
      success: true,
      data: {
        ...stats,
        monthly_reports: monthlyStats?.monthly_reports || 0
      }
    });
  } catch (error) {
    console.error('获取进度统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取进度统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/construction/progress/project/:projectId/milestones
 * 获取项目的里程碑列表（用于进度填报关联）
 */
router.get('/progress/project/:projectId/milestones', authMiddleware, (req, res) => {
  const { projectId } = req.params;
  
  const milestones = db.prepare(`
    SELECT id, milestone_no, name, planned_date, actual_date, progress_rate, status
    FROM construction_milestones
    WHERE project_id = ?
    ORDER BY planned_date ASC
  `).all(projectId);
  
  res.json({
    success: true,
    data: milestones
  });
});

// ==================== Task 56: 偏差预警 API ====================

/**
 * GET /api/construction/warnings
 * 获取偏差预警列表
 * 查询参数: projectId, warningLevel, status, page, pageSize
 */
router.get('/warnings', authMiddleware, (req, res) => {
  const { projectId, warningLevel, status, page = 1, pageSize = 20 } = req.query;

  try {
    const result = constructionService.getWarnings({
      projectId: projectId ? parseInt(projectId) : null,
      warningLevel,
      status,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });

    res.json({
      success: true,
      data: result.list,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取预警列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取预警列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/construction/warnings/stats
 * 获取预警统计
 */
router.get('/warnings/stats', authMiddleware, (req, res) => {
  const { projectId } = req.query;

  try {
    const stats = constructionService.getWarningStats(projectId ? parseInt(projectId) : null);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取预警统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取预警统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/construction/warnings/:id
 * 获取预警详情
 */
router.get('/warnings/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  try {
    const warning = constructionService.getWarningById(parseInt(id));

    if (!warning) {
      return res.status(404).json({
        success: false,
        message: '预警记录不存在'
      });
    }

    res.json({
      success: true,
      data: warning
    });
  } catch (error) {
    console.error('获取预警详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取预警详情失败: ' + error.message
    });
  }
});

/**
 * POST /api/construction/warnings/check
 * 检查偏差
 * 请求体: { projectId }
 */
router.post('/warnings/check', authMiddleware, (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      message: '项目ID不能为空'
    });
  }

  try {
    // 检查偏差并自动创建预警
    const createdWarnings = constructionService.checkAndCreateWarnings(parseInt(projectId));
    
    // 获取最新的检查结果
    const deviationResult = constructionService.checkDeviation(parseInt(projectId));

    res.json({
      success: true,
      message: `检查完成，发现 ${deviationResult.warnings.length} 个偏差，创建了 ${createdWarnings.length} 条预警`,
      data: {
        deviationResult,
        createdWarnings
      }
    });
  } catch (error) {
    console.error('检查偏差失败:', error);
    res.status(500).json({
      success: false,
      message: '检查偏差失败: ' + error.message
    });
  }
});

/**
 * POST /api/construction/warnings/check-all
 * 检查所有项目的偏差
 */
router.post('/warnings/check-all', authMiddleware, (req, res) => {
  try {
    // 获取所有活跃项目
    const projects = db.prepare(`
      SELECT id, project_no, name FROM projects 
      WHERE type = 'entity' AND status IN ('pending', 'active')
    `).all();

    const results = [];
    
    for (const project of projects) {
      const createdWarnings = constructionService.checkAndCreateWarnings(project.id);
      const deviationResult = constructionService.checkDeviation(project.id);
      
      results.push({
        projectId: project.id,
        projectNo: project.project_no,
        projectName: project.name,
        warningCount: deviationResult.warnings.length,
        createdCount: createdWarnings.length
      });
    }

    const totalCreated = results.reduce((sum, r) => sum + r.createdCount, 0);

    res.json({
      success: true,
      message: `检查了 ${projects.length} 个项目，创建了 ${totalCreated} 条预警`,
      data: results
    });
  } catch (error) {
    console.error('检查所有项目偏差失败:', error);
    res.status(500).json({
      success: false,
      message: '检查所有项目偏差失败: ' + error.message
    });
  }
});

/**
 * PUT /api/construction/warnings/:id/handle
 * 处理预警
 * 请求体: { handleRemark }
 */
router.put('/warnings/:id/handle', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { handleRemark } = req.body;
  const userId = req.user?.id || 1;

  try {
    const warning = constructionService.handleWarning(
      parseInt(id),
      userId,
      handleRemark
    );

    res.json({
      success: true,
      message: '预警处理成功',
      data: warning
    });
  } catch (error) {
    console.error('处理预警失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '处理预警失败'
    });
  }
});

/**
 * GET /api/construction/warnings/analysis/:projectId
 * 获取项目偏差分析（用于图表展示）
 */
router.get('/warnings/analysis/:projectId', authMiddleware, (req, res) => {
  const { projectId } = req.params;

  try {
    const analysis = constructionService.getDeviationAnalysis(parseInt(projectId));

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('获取偏差分析失败:', error);
    res.status(500).json({
      success: false,
      message: '获取偏差分析失败: ' + error.message
    });
  }
});

module.exports = router;
