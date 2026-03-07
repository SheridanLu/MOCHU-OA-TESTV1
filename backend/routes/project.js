/**
 * 项目路由
 * 处理实体项目和虚拟项目的 CRUD 操作
 */

const express = require('express');
const { db } = require('../models/database');
const { getProjectNo, previewProjectNo } = require('../utils/projectNo');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const router = express.Router();

// 简化中间件引用 - 开发阶段暂时跳过权限检查
const authenticateToken = authMiddleware;
const requirePermission = (permission) => {
  return (req, res, next) => {
    // TODO: 生产环境需要启用权限检查
    // 目前开发阶段暂时跳过
    next();
  };
};

/**
 * GET /api/projects/preview-no
 * 预览下一个项目编号（不实际占用）
 * 查询参数: type=entity|virtual
 */
router.get('/preview-no', authMiddleware, (req, res) => {
  const { type = 'entity' } = req.query;
  
  if (!['entity', 'virtual'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: '无效的项目类型'
    });
  }
  
  const projectNo = previewProjectNo(type);
  
  res.json({
    success: true,
    projectNo
  });
});

/**
 * GET /api/projects
 * 获取项目列表
 * 查询参数: type, status, page, pageSize
 */
router.get('/', authMiddleware, (req, res) => {
  const { type, status, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT p.*, u.real_name as manager_name,
           vp.name as virtual_from_name,
           ep.name as converted_to_name
    FROM projects p
    LEFT JOIN users u ON p.manager_id = u.id
    LEFT JOIN projects vp ON p.virtual_from = vp.id
    LEFT JOIN projects ep ON p.converted_to = ep.id
    WHERE 1=1
  `;
  const params = [];
  
  if (type) {
    sql += ` AND p.type = ?`;
    params.push(type);
  }
  
  if (status) {
    sql += ` AND p.status = ?`;
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT p\.\*, u\.real_name as manager_name,\s*vp\.name as virtual_from_name,\s*ep\.name as converted_to_name/,
    'SELECT COUNT(*) as total'
  ).replace(/LEFT JOIN users u[\s\S]*?LEFT JOIN projects ep[\s\S]*?WHERE/, 'WHERE');
  
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const projects = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: projects,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * GET /api/projects/:id
 * 获取单个项目详情
 */
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const project = db.prepare(`
    SELECT p.*, u.real_name as manager_name,
           vp.name as virtual_from_name, vp.project_no as virtual_from_no,
           ep.name as converted_to_name, ep.project_no as converted_to_no
    FROM projects p
    LEFT JOIN users u ON p.manager_id = u.id
    LEFT JOIN projects vp ON p.virtual_from = vp.id
    LEFT JOIN projects ep ON p.converted_to = ep.id
    WHERE p.id = ?
  `).get(id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      message: '项目不存在'
    });
  }
  
  res.json({
    success: true,
    data: project
  });
});

/**
 * POST /api/projects
 * 创建实体项目
 */
router.post('/', authMiddleware, checkPermission('project:create'), (req, res) => {
  const {
    name,
    customer,
    contract_amount,
    manager_id,
    start_date,
    end_date,
    description
  } = req.body;
  
  // 验证必填字段
  if (!name) {
    return res.status(400).json({
      success: false,
      message: '项目名称不能为空'
    });
  }
  
  // 生成项目编号
  const projectNo = getProjectNo('entity');
  
  try {
    const result = db.prepare(`
      INSERT INTO projects (
        project_no, name, type, customer, contract_amount,
        manager_id, start_date, end_date, status
      ) VALUES (?, ?, 'entity', ?, ?, ?, ?, ?, 'pending')
    `).run(
      projectNo, name, customer, contract_amount || 0,
      manager_id, start_date, end_date
    );
    
    const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '项目创建成功',
      data: newProject
    });
  } catch (error) {
    console.error('创建项目失败:', error);
    res.status(500).json({
      success: false,
      message: '创建项目失败: ' + error.message
    });
  }
});

/**
 * POST /api/projects/virtual
 * 创建虚拟项目
 * 虚拟项目特点：
 * - 可能没有合同金额（处于跟踪阶段）
 * - 类型标记为 'virtual'
 * - 可关联来源项目（virtual_from）
 */
router.post('/virtual', authMiddleware, checkPermission('project:create'), (req, res) => {
  const {
    name,
    customer,
    estimated_amount,  // 预估金额（可选）
    manager_id,
    start_date,
    end_date,
    virtual_from,      // 来源项目ID（可选）
    description,
    tracking_stage     // 跟踪阶段
  } = req.body;
  
  // 验证必填字段
  if (!name) {
    return res.status(400).json({
      success: false,
      message: '项目名称不能为空'
    });
  }
  
  // 生成虚拟项目编号
  const projectNo = getProjectNo('virtual');
  
  try {
    const result = db.prepare(`
      INSERT INTO projects (
        project_no, name, type, customer, contract_amount,
        manager_id, start_date, end_date, status, virtual_from
      ) VALUES (?, ?, 'virtual', ?, ?, ?, ?, ?, 'tracking', ?)
    `).run(
      projectNo, name, customer, estimated_amount || 0,
      manager_id, start_date, end_date, virtual_from || null
    );
    
    const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({
      success: true,
      message: '虚拟项目创建成功',
      data: newProject
    });
  } catch (error) {
    console.error('创建虚拟项目失败:', error);
    res.status(500).json({
      success: false,
      message: '创建虚拟项目失败: ' + error.message
    });
  }
});

/**
 * PUT /api/projects/:id
 * 更新项目信息
 */
router.put('/:id', authMiddleware, checkPermission('project:edit'), (req, res) => {
  const { id } = req.params;
  const {
    name,
    customer,
    contract_amount,
    manager_id,
    start_date,
    end_date,
    status,
    description
  } = req.body;
  
  // 检查项目是否存在
  const existingProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existingProject) {
    return res.status(404).json({
      success: false,
      message: '项目不存在'
    });
  }
  
  // 检查是否为已转换的虚拟项目（转换后不可修改）
  if (existingProject.type === 'virtual' && existingProject.status === 'converted') {
    return res.status(403).json({
      success: false,
      message: '已转换的虚拟项目不可修改'
    });
  }
  
  try {
    db.prepare(`
      UPDATE projects SET
        name = COALESCE(?, name),
        customer = COALESCE(?, customer),
        contract_amount = COALESCE(?, contract_amount),
        manager_id = COALESCE(?, manager_id),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, customer, contract_amount, manager_id,
      start_date, end_date, status, id
    );
    
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    
    res.json({
      success: true,
      message: '项目更新成功',
      data: updatedProject
    });
  } catch (error) {
    console.error('更新项目失败:', error);
    res.status(500).json({
      success: false,
      message: '更新项目失败: ' + error.message
    });
  }
});

/**
 * POST /api/projects/:id/convert
 * 将虚拟项目转换为实体项目
 * 需要填写中标通知书信息
 */
router.post('/:id/convert', authMiddleware, checkPermission('project:convert'), (req, res) => {
  const { id } = req.params;
  const {
    bid_notice_no,      // 中标通知书编号（必填）
    bid_notice_date,    // 中标日期（必填）
    contract_amount,    // 合同金额（可选，覆盖原预估金额）
    start_date,         // 项目开始日期（可选）
    end_date            // 项目结束日期（可选）
  } = req.body;
  
  // 检查项目是否存在且为虚拟项目
  const virtualProject = db.prepare('SELECT * FROM projects WHERE id = ? AND type = ?').get(id, 'virtual');
  if (!virtualProject) {
    return res.status(404).json({
      success: false,
      message: '虚拟项目不存在或不是虚拟项目'
    });
  }
  
  // 检查项目状态是否为"跟踪中"（只有跟踪中的项目可以转换）
  if (virtualProject.status !== 'tracking') {
    return res.status(400).json({
      success: false,
      message: '只有"跟踪中"状态的虚拟项目才能转换为实体项目'
    });
  }
  
  // 检查是否已转换
  if (virtualProject.converted_to) {
    return res.status(400).json({
      success: false,
      message: '该虚拟项目已转换为实体项目'
    });
  }
  
  // 验证必填字段：中标通知书编号和日期
  if (!bid_notice_no || !bid_notice_no.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写中标通知书编号'
    });
  }
  
  if (!bid_notice_date) {
    return res.status(400).json({
      success: false,
      message: '请填写中标日期'
    });
  }
  
  const transaction = db.transaction(() => {
    // 生成实体项目编号
    const entityProjectNo = getProjectNo('entity');
    
    // 创建实体项目（包含中标通知书信息）
    const result = db.prepare(`
      INSERT INTO projects (
        project_no, name, type, customer, contract_amount,
        manager_id, start_date, end_date, status, converted_from,
        bid_notice_no, bid_notice_date
      ) VALUES (?, ?, 'entity', ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      entityProjectNo,
      virtualProject.name,
      virtualProject.customer,
      contract_amount || virtualProject.contract_amount || 0,
      virtualProject.manager_id,
      start_date || virtualProject.start_date,
      end_date || virtualProject.end_date,
      id,
      bid_notice_no.trim(),
      bid_notice_date
    );
    
    const entityId = result.lastInsertRowid;
    
    // 更新虚拟项目的转换信息（标记为已转换，不可修改）
    db.prepare(`
      UPDATE projects SET
        converted_to = ?,
        converted_at = CURRENT_TIMESTAMP,
        status = 'converted',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(entityId, id);
    
    return entityId;
  });
  
  try {
    const entityId = transaction();
    const entityProject = db.prepare(`
      SELECT p.*, u.real_name as manager_name
      FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      WHERE p.id = ?
    `).get(entityId);
    
    // 格式化金额
    entityProject.contract_amount = parseFloat(entityProject.contract_amount) || 0;
    
    res.json({
      success: true,
      message: '虚拟项目转换成功',
      data: {
        virtualId: parseInt(id),
        entityProject
      }
    });
  } catch (error) {
    console.error('转换项目失败:', error);
    res.status(500).json({
      success: false,
      message: '转换项目失败: ' + error.message
    });
  }
});

/**
 * GET /api/projects/virtual
 * 获取虚拟项目列表
 * 查询参数: status, page, pageSize
 */
router.get('/virtual', authMiddleware, (req, res) => {
  const { status, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT p.*, u.real_name as manager_name,
           ep.name as converted_to_name, ep.project_no as converted_to_no
    FROM projects p
    LEFT JOIN users u ON p.manager_id = u.id
    LEFT JOIN projects ep ON p.converted_to = ep.id
    WHERE p.type = 'virtual'
  `;
  const params = [];
  
  if (status) {
    sql += ` AND p.status = ?`;
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace(
    /SELECT p\.\*, u\.real_name as manager_name,\s*ep\.name as converted_to_name, ep\.project_no as converted_to_no/,
    'SELECT COUNT(*) as total'
  ).replace(/LEFT JOIN users u[\s\S]*?LEFT JOIN projects ep[\s\S]*?WHERE/, 'WHERE');
  
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  const projects = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: projects,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

/**
 * POST /api/projects/virtual/convert
 * 虚拟项目转实体（通过ID）
 * 查询参数: id - 虚拟项目ID
 */
router.post('/virtual/convert', authMiddleware, checkPermission('project:convert'), (req, res) => {
  const { id, bid_notice_no, bid_notice_date, contract_amount, start_date, end_date } = req.body;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      message: '缺少虚拟项目ID'
    });
  }
  
  // 检查项目是否存在且为虚拟项目
  const virtualProject = db.prepare('SELECT * FROM projects WHERE id = ? AND type = ?').get(id, 'virtual');
  if (!virtualProject) {
    return res.status(404).json({
      success: false,
      message: '虚拟项目不存在或不是虚拟项目'
    });
  }
  
  // 检查项目状态是否为"跟踪中"（只有跟踪中的项目可以转换）
  if (virtualProject.status !== 'tracking') {
    return res.status(400).json({
      success: false,
      message: '只有"跟踪中"状态的虚拟项目才能转换为实体项目'
    });
  }
  
  // 检查是否已转换
  if (virtualProject.converted_to) {
    return res.status(400).json({
      success: false,
      message: '该虚拟项目已转换为实体项目'
    });
  }
  
  // 验证必填字段：中标通知书编号和日期
  if (!bid_notice_no || !bid_notice_no.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写中标通知书编号'
    });
  }
  
  if (!bid_notice_date) {
    return res.status(400).json({
      success: false,
      message: '请填写中标日期'
    });
  }
  
  const transaction = db.transaction(() => {
    // 生成实体项目编号
    const entityProjectNo = getProjectNo('entity');
    
    // 创建实体项目（包含中标通知书信息）
    const result = db.prepare(`
      INSERT INTO projects (
        project_no, name, type, customer, contract_amount,
        manager_id, start_date, end_date, status, converted_from,
        bid_notice_no, bid_notice_date
      ) VALUES (?, ?, 'entity', ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      entityProjectNo,
      virtualProject.name,
      virtualProject.customer,
      contract_amount || virtualProject.contract_amount || 0,
      virtualProject.manager_id,
      start_date || virtualProject.start_date,
      end_date || virtualProject.end_date,
      id,
      bid_notice_no.trim(),
      bid_notice_date
    );
    
    const entityId = result.lastInsertRowid;
    
    // 更新虚拟项目的转换信息（标记为已转换，不可修改）
    db.prepare(`
      UPDATE projects SET
        converted_to = ?,
        converted_at = CURRENT_TIMESTAMP,
        status = 'converted',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(entityId, id);
    
    return entityId;
  });
  
  try {
    const entityId = transaction();
    const entityProject = db.prepare(`
      SELECT p.*, u.real_name as manager_name
      FROM projects p
      LEFT JOIN users u ON p.manager_id = u.id
      WHERE p.id = ?
    `).get(entityId);
    
    // 格式化金额
    entityProject.contract_amount = parseFloat(entityProject.contract_amount) || 0;
    
    res.json({
      success: true,
      message: '虚拟项目转换成功',
      data: {
        virtualId: parseInt(id),
        entityProject
      }
    });
  } catch (error) {
    console.error('转换项目失败:', error);
    res.status(500).json({
      success: false,
      message: '转换项目失败: ' + error.message
    });
  }
});

/**
 * POST /api/projects/:id/abort
 * 中止虚拟项目
 * 条件：输入中止原因、时间
 * 字段：中止原因、备注、中止时间
 */
router.post('/:id/abort', authMiddleware, checkPermission('project:abort'), (req, res) => {
  const { id } = req.params;
  const { reason, remarks } = req.body;
  
  // 检查项目是否存在且为虚拟项目
  const virtualProject = db.prepare('SELECT * FROM projects WHERE id = ? AND type = ?').get(id, 'virtual');
  if (!virtualProject) {
    return res.status(404).json({
      success: false,
      message: '虚拟项目不存在'
    });
  }
  
  // 检查是否已转换或已中止
  if (virtualProject.converted_to) {
    return res.status(400).json({
      success: false,
      message: '该虚拟项目已转换为实体项目，无法中止'
    });
  }
  
  if (virtualProject.status === 'aborted') {
    return res.status(400).json({
      success: false,
      message: '该虚拟项目已中止'
    });
  }
  
  // 验证中止原因（必填）
  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写中止原因'
    });
  }
  
  try {
    db.prepare(`
      UPDATE projects SET
        status = 'aborted',
        abort_reason = ?,
        abort_remarks = ?,
        aborted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason.trim(), remarks || null, id);
    
    const updatedProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    
    res.json({
      success: true,
      message: '虚拟项目已中止',
      data: updatedProject
    });
  } catch (error) {
    console.error('中止项目失败:', error);
    res.status(500).json({
      success: false,
      message: '中止项目失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/projects/:id
 * 删除项目（仅限虚拟项目且未转换的）
 */
router.delete('/:id', authMiddleware, checkPermission('project:delete'), (req, res) => {
  const { id } = req.params;
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: '项目不存在'
    });
  }
  
  // 虚拟项目：已转换的不能删除
  if (project.type === 'virtual' && project.converted_to) {
    return res.status(403).json({
      success: false,
      message: '已转换的虚拟项目不能删除'
    });
  }
  
  // 实体项目：只有 pending 状态可以删除
  if (project.type === 'entity' && project.status !== 'pending') {
    return res.status(403).json({
      success: false,
      message: '只有待审批状态的实体项目可以删除'
    });
  }
  
  // 非待审批状态的虚拟项目不能删除
  if (project.type === 'virtual' && !['pending', 'approval_rejected'].includes(project.status)) {
    return res.status(403).json({
      success: false,
      message: '当前状态的虚拟项目不能删除'
    });
  }
  
  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: '项目删除成功'
    });
  } catch (error) {
    console.error('删除项目失败:', error);
    res.status(500).json({
      success: false,
      message: '删除项目失败: ' + error.message
    });
  }
});

/**
 * GET /api/projects/stats/overview
 * 获取项目统计概览
 */
router.get('/stats/overview', authMiddleware, (req, res) => {
  try {
    // 实体项目统计
    const entityStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM projects WHERE type = 'entity'
    `).get();
    
    // 虚拟项目统计
    const virtualStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'tracking' THEN 1 ELSE 0 END) as tracking,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted,
        SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) as aborted
      FROM projects WHERE type = 'virtual'
    `).get();
    
    // 本月虚拟项目
    const monthPrefix = new Date().toISOString().slice(2, 7).replace('-', '');
    const monthlyVirtual = db.prepare(`
      SELECT COUNT(*) as count
      FROM projects 
      WHERE type = 'virtual' AND project_no LIKE ?
    `).get(`V${monthPrefix}%`);
    
    res.json({
      success: true,
      data: {
        entity: entityStats,
        virtual: virtualStats,
        monthlyVirtual: monthlyVirtual.count
      }
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计失败: ' + error.message
    });
  }
});

module.exports = router;
