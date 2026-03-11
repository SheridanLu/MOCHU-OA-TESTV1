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
 * GET /api/projects/cost-targets
 * 获取成本下挂目标列表（实体项目+部门）
 * 注意：此路由必须在 /:id 之前定义，否则会被当作项目ID
 */
router.get('/cost-targets', authMiddleware, (req, res) => {
  try {
    // 获取所有进行中的实体项目
    const entityProjects = db.prepare(`
      SELECT id, project_no, name, 'entity' as type
      FROM projects 
      WHERE type = 'entity' AND status IN ('pending', 'in_progress')
      ORDER BY created_at DESC
    `).all();
    
    // 获取所有部门
    const departments = db.prepare(`
      SELECT id, name, 'department' as type
      FROM departments
      ORDER BY name
    `).all();
    
    res.json({
      success: true,
      data: {
        entityProjects,
        departments
      }
    });
  } catch (error) {
    console.error('获取成本目标列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取成本目标列表失败'
    });
  }
});

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
  
  // 项目类型（智能化项目、消防项目、EPC项目）
  const { project_type } = req.body;
  
  try {
    const result = db.prepare(`
      INSERT INTO projects (
        project_no, name, type, customer, contract_amount,
        manager_id, start_date, end_date, status, project_type
      ) VALUES (?, ?, 'entity', ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      projectNo, name, customer, contract_amount || 0,
      manager_id, start_date, end_date, project_type || '智能化项目'
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
  
  // 项目类型
  const { project_type } = req.body;
  
  try {
    const result = db.prepare(`
      INSERT INTO projects (
        project_no, name, type, customer, contract_amount,
        manager_id, start_date, end_date, status, virtual_from, project_type
      ) VALUES (?, ?, 'virtual', ?, ?, ?, ?, ?, 'tracking', ?, ?)
    `).run(
      projectNo, name, customer, estimated_amount || 0,
      manager_id, start_date, end_date, virtual_from || null, project_type || '智能化项目'
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
  
  // 获取项目类型
  const { project_type } = req.body;
  
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
        project_type = COALESCE(?, project_type),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name, customer, contract_amount, manager_id,
      start_date, end_date, status, project_type, id
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

/**
 * POST /api/projects/:id/convert-with-approval
 * 提交虚拟转实体审批申请（采购员→财务→总经理）
 */
router.post('/:id/convert-with-approval', authMiddleware, checkPermission('project:convert'), (req, res) => {
  const { id } = req.params;
  const {
    bid_notice_no,      // 中标通知书编号（必填）
    bid_notice_date,    // 中标日期（必填）
    contract_amount,    // 合同金额
    start_date,         // 开始日期
    end_date,            // 结束日期
    manager_id,          // 项目经理
    remark               // 备注
  } = req.body;
  const userId = req.user?.userId || req.user?.id;
  
  // 检查项目是否存在且为虚拟项目
  const virtualProject = db.prepare('SELECT * FROM projects WHERE id = ? AND type = ?').get(id, 'virtual');
  if (!virtualProject) {
    return res.status(404).json({
      success: false,
      message: '虚拟项目不存在'
    });
  }
  
  // 检查项目状态
  if (virtualProject.status !== 'tracking') {
    return res.status(400).json({
      success: false,
      message: '只有"跟踪中"状态的虚拟项目才能申请转换'
    });
  }
  
  // 检查是否已提交审批
  if (virtualProject.status === 'converting' || virtualProject.converted_to) {
    return res.status(400).json({
      success: false,
      message: '该项目已提交审批或已完成转换'
    });
  }
  
  // 验证必填字段
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
    // 更新虚拟项目状态为"审批中"并保存申请信息
    db.prepare(`
      UPDATE projects SET
        status = 'converting',
        bid_notice_no = ?,
        bid_notice_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bid_notice_no.trim(), bid_notice_date, id);
    
    // 创建审批记录（使用现有的审批流程）
    const approvalResult = db.prepare(`
      INSERT INTO approvals (project_id, type, status, submitter_id, current_step, total_steps, comment)
      VALUES (?, 'virtual_convert', 'pending', ?, 1, 2, ?)
    `).run(id, userId, remark || '虚拟项目转实体申请');
    
    const approvalId = approvalResult.lastInsertRowid;
    
    // 创建审批流程节点（财务→总经理）
    // 步骤1：财务审批
    db.prepare(`
      INSERT INTO approval_flows (approval_id, step, role, status)
      VALUES (?, 1, 'FINANCE', 'pending')
    `).run(approvalId);
    
    // 步骤2：总经理审批
    db.prepare(`
      INSERT INTO approval_flows (approval_id, step, role, status)
      VALUES (?, 2, 'GM', 'pending')
    `).run(approvalId);
    
    return approvalId;
  });
  
  try {
    const approvalId = transaction();
    
    res.json({
      success: true,
      message: '虚拟转实体申请已提交，等待审批',
      data: {
        approvalId,
        projectId: parseInt(id)
      }
    });
  } catch (error) {
    console.error('提交审批失败:', error);
    res.status(500).json({
      success: false,
      message: '提交审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/projects/:id/abort-with-approval
 * 提交虚拟中止审批申请（采购员→财务→总经理）
 */
router.post('/:id/abort-with-approval', authMiddleware, checkPermission('project:abort'), (req, res) => {
  const { id } = req.params;
  const {
    reason,              // 中止原因（必填）
    remarks,             // 备注
    cost_target_type,    // 成本下挂类型：1=实体项目 2=部门成本
    cost_target_id       // 成本下挂目标ID
  } = req.body;
  const userId = req.user?.userId || req.user?.id;
  
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
      message: '该虚拟项目已转换为实体项目'
    });
  }
  
  if (virtualProject.status === 'aborted' || virtualProject.status === 'aborting') {
    return res.status(400).json({
      success: false,
      message: '该项目已中止或正在审批中'
    });
  }
  
  // 验证必填字段
  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: '请填写中止原因'
    });
  }
  
  // 如果选择了成本下挂，验证目标是否存在
  if (cost_target_type && cost_target_id) {
    if (cost_target_type === 1) {
      // 验证实体项目存在
      const targetProject = db.prepare('SELECT id FROM projects WHERE id = ? AND type = ?').get(cost_target_id, 'entity');
      if (!targetProject) {
        return res.status(400).json({
          success: false,
          message: '目标实体项目不存在'
        });
      }
    } else if (cost_target_type === 2) {
      // 验证部门存在
      const targetDept = db.prepare('SELECT id FROM departments WHERE id = ?').get(cost_target_id);
      if (!targetDept) {
        return res.status(400).json({
          success: false,
          message: '目标部门不存在'
        });
      }
    }
  }
  
  const transaction = db.transaction(() => {
    // 更新虚拟项目状态为"审批中"并保存中止信息
    db.prepare(`
      UPDATE projects SET
        status = 'aborting',
        abort_reason = ?,
        abort_remarks = ?,
        cost_target_type = ?,
        cost_target_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason.trim(), remarks || null, cost_target_type || null, cost_target_id || null, id);
    
    // 创建审批记录
    const approvalResult = db.prepare(`
      INSERT INTO approvals (project_id, type, status, submitter_id, current_step, total_steps, comment)
      VALUES (?, 'virtual_abort', 'pending', ?, 1, 2, ?)
    `).run(id, userId, reason.trim());
    
    const approvalId = approvalResult.lastInsertRowid;
    
    // 创建审批流程节点（财务→总经理）
    db.prepare(`
      INSERT INTO approval_flows (approval_id, step, role, status)
      VALUES (?, 1, 'FINANCE', 'pending')
    `).run(approvalId);
    
    db.prepare(`
      INSERT INTO approval_flows (approval_id, step, role, status)
      VALUES (?, 2, 'GM', 'pending')
    `).run(approvalId);
    
    return approvalId;
  });
  
  try {
    const approvalId = transaction();
    
    res.json({
      success: true,
      message: '虚拟中止申请已提交，等待审批',
      data: {
        approvalId,
        projectId: parseInt(id)
      }
    });
  } catch (error) {
    console.error('提交审批失败:', error);
    res.status(500).json({
      success: false,
      message: '提交审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/projects/:id/process-conversion
 * 处理虚拟转实体审批（财务/总经理审批通过后执行）
 */
router.post('/:id/process-conversion', authMiddleware, checkPermission('project:approve'), (req, res) => {
  const { id } = req.params;
  const { approve, comment, contract_amount, start_date, end_date } = req.body;
  const userId = req.user?.userId || req.user?.id;
  
  // 获取审批记录
  const approval = db.prepare(`
    SELECT * FROM approvals 
    WHERE project_id = ? AND type = 'virtual_convert' AND status = 'pending'
  `).get(id);
  
  if (!approval) {
    return res.status(404).json({
      success: false,
      message: '未找到待审批的转换申请'
    });
  }
  
  // 获取虚拟项目
  const virtualProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!virtualProject) {
    return res.status(404).json({
      success: false,
      message: '项目不存在'
    });
  }
  
  // 获取当前审批节点的角色要求
  const currentFlow = db.prepare(`
    SELECT * FROM approval_flows 
    WHERE approval_id = ? AND step = ? AND status = 'pending'
  `).get(approval.id, approval.current_step);
  
  if (!currentFlow) {
    return res.status(400).json({
      success: false,
      message: '当前没有待审批的节点'
    });
  }
  
  // 检查用户角色
  const userRoles = db.prepare(`
    SELECT r.code FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).all(userId);
  const roleCodes = userRoles.map(r => r.code);
  
  if (!roleCodes.includes(currentFlow.role) && !roleCodes.includes('GM')) {
    return res.status(403).json({
      success: false,
      message: '您没有审批权限'
    });
  }
  
  const transaction = db.transaction(() => {
    if (approve) {
      // 更新审批节点状态
      db.prepare(`
        UPDATE approval_flows SET
          status = 'approved',
          approver_id = ?,
          comment = ?,
          approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentFlow.id);
      
      // 检查是否是最后一步
      if (approval.current_step >= approval.total_steps) {
        // 最后一步（总经理）审批通过，执行转换
        db.prepare(`
          UPDATE approvals SET
            status = 'approved',
            current_step = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(approval.total_steps, approval.id);
        
        // 生成实体项目编号
        const entityProjectNo = getProjectNo('entity');
        
        // 创建实体项目
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
          virtualProject.bid_notice_no,
          virtualProject.bid_notice_date
        );
        
        const entityId = result.lastInsertRowid;
        
        // 更新虚拟项目状态
        db.prepare(`
          UPDATE projects SET
            converted_to = ?,
            converted_at = CURRENT_TIMESTAMP,
            status = 'converted',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(entityId, id);
        
        return { approved: true, entityId };
      } else {
        // 进入下一步
        db.prepare(`
          UPDATE approvals SET
            current_step = current_step + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(approval.id);
        
        return { approved: true, entityId: null };
      }
    } else {
      // 驳回
      db.prepare(`
        UPDATE approval_flows SET
          status = 'rejected',
          approver_id = ?,
          comment = ?,
          approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentFlow.id);
      
      db.prepare(`
        UPDATE approvals SET
          status = 'rejected',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approval.id);
      
      // 恢复项目状态
      db.prepare(`
        UPDATE projects SET
          status = 'tracking',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
      
      return { approved: false };
    }
  });
  
  try {
    const result = transaction();
    
    res.json({
      success: true,
      message: result.approved ? 
        (result.entityId ? '审批通过，虚拟项目已转换为实体项目' : '审批通过，等待下一级审批') :
        '审批已驳回',
      data: result
    });
  } catch (error) {
    console.error('处理审批失败:', error);
    res.status(500).json({
      success: false,
      message: '处理审批失败: ' + error.message
    });
  }
});

/**
 * POST /api/projects/:id/process-abort
 * 处理虚拟中止审批（财务/总经理审批通过后执行）
 */
router.post('/:id/process-abort', authMiddleware, checkPermission('project:approve'), (req, res) => {
  const { id } = req.params;
  const { approve, comment } = req.body;
  const userId = req.user?.userId || req.user?.id;
  
  // 获取审批记录
  const approval = db.prepare(`
    SELECT * FROM approvals 
    WHERE project_id = ? AND type = 'virtual_abort' AND status = 'pending'
  `).get(id);
  
  if (!approval) {
    return res.status(404).json({
      success: false,
      message: '未找到待审批的中止申请'
    });
  }
  
  // 获取虚拟项目
  const virtualProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!virtualProject) {
    return res.status(404).json({
      success: false,
      message: '项目不存在'
    });
  }
  
  // 获取当前审批节点
  const currentFlow = db.prepare(`
    SELECT * FROM approval_flows 
    WHERE approval_id = ? AND step = ? AND status = 'pending'
  `).get(approval.id, approval.current_step);
  
  if (!currentFlow) {
    return res.status(400).json({
      success: false,
      message: '当前没有待审批的节点'
    });
  }
  
  // 检查用户角色
  const userRoles = db.prepare(`
    SELECT r.code FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `).all(userId);
  const roleCodes = userRoles.map(r => r.code);
  
  if (!roleCodes.includes(currentFlow.role) && !roleCodes.includes('GM')) {
    return res.status(403).json({
      success: false,
      message: '您没有审批权限'
    });
  }
  
  const transaction = db.transaction(() => {
    if (approve) {
      // 更新审批节点状态
      db.prepare(`
        UPDATE approval_flows SET
          status = 'approved',
          approver_id = ?,
          comment = ?,
          approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentFlow.id);
      
      // 检查是否是最后一步
      if (approval.current_step >= approval.total_steps) {
        // 最后一步审批通过，执行中止
        db.prepare(`
          UPDATE approvals SET
            status = 'approved',
            current_step = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(approval.total_steps, approval.id);
        
        // 更新虚拟项目状态为已中止
        db.prepare(`
          UPDATE projects SET
            status = 'aborted',
            aborted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(id);
        
        // 如果有成本归集目标，记录归集关系
        if (virtualProject.cost_target_type && virtualProject.cost_target_id) {
          // 这里可以添加成本归集的具体业务逻辑
          // 例如：将虚拟项目的成本记录迁移到目标项目/部门
        }
        
        return { approved: true, aborted: true };
      } else {
        // 进入下一步
        db.prepare(`
          UPDATE approvals SET
            current_step = current_step + 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(approval.id);
        
        return { approved: true, aborted: false };
      }
    } else {
      // 驳回
      db.prepare(`
        UPDATE approval_flows SET
          status = 'rejected',
          approver_id = ?,
          comment = ?,
          approved_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(userId, comment || null, currentFlow.id);
      
      db.prepare(`
        UPDATE approvals SET
          status = 'rejected',
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(approval.id);
      
      // 恢复项目状态
      db.prepare(`
        UPDATE projects SET
          status = 'tracking',
          abort_reason = NULL,
          abort_remarks = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(id);
      
      return { approved: false };
    }
  });
  
  try {
    const result = transaction();
    
    res.json({
      success: true,
      message: result.approved ? 
        (result.aborted ? '审批通过，虚拟项目已中止' : '审批通过，等待下一级审批') :
        '审批已驳回',
      data: result
    });
  } catch (error) {
    console.error('处理审批失败:', error);
    res.status(500).json({
      success: false,
      message: '处理审批失败: ' + error.message
    });
  }
});

/**
 * GET /api/projects/:id/conversion-status
 * 获取虚拟转实体审批状态
 */
router.get('/:id/conversion-status', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const approval = db.prepare(`
    SELECT a.*, 
           p.name as project_name,
           p.project_no,
           p.status as project_status,
           p.bid_notice_no,
           p.bid_notice_date
    FROM approvals a
    LEFT JOIN projects p ON a.project_id = p.id
    WHERE a.project_id = ? AND a.type = 'virtual_convert'
    ORDER BY a.created_at DESC
    LIMIT 1
  `).get(id);
  
  if (!approval) {
    return res.json({
      success: true,
      data: null,
      message: '无审批记录'
    });
  }
  
  // 获取审批流程
  const flows = db.prepare(`
    SELECT af.*, u.real_name as approver_name
    FROM approval_flows af
    LEFT JOIN users u ON af.approver_id = u.id
    WHERE af.approval_id = ?
    ORDER BY af.step
  `).all(approval.id);
  
  res.json({
    success: true,
    data: {
      ...approval,
      flows
    }
  });
});

/**
 * GET /api/projects/:id/abort-status
 * 获取虚拟中止审批状态
 */
router.get('/:id/abort-status', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const approval = db.prepare(`
    SELECT a.*, 
           p.name as project_name,
           p.project_no,
           p.status as project_status,
           p.abort_reason,
           p.abort_remarks,
           p.cost_target_type,
           p.cost_target_id
    FROM approvals a
    LEFT JOIN projects p ON a.project_id = p.id
    WHERE a.project_id = ? AND a.type = 'virtual_abort'
    ORDER BY a.created_at DESC
    LIMIT 1
  `).get(id);
  
  if (!approval) {
    return res.json({
      success: true,
      data: null,
      message: '无审批记录'
    });
  }
  
  // 获取审批流程
  const flows = db.prepare(`
    SELECT af.*, u.real_name as approver_name
    FROM approval_flows af
    LEFT JOIN users u ON af.approver_id = u.id
    WHERE af.approval_id = ?
    ORDER BY af.step
  `).all(approval.id);
  
  // 获取成本归集目标名称
  let costTargetName = null;
  if (approval.cost_target_type && approval.cost_target_id) {
    if (approval.cost_target_type === 1) {
      const targetProject = db.prepare('SELECT name FROM projects WHERE id = ?').get(approval.cost_target_id);
      costTargetName = targetProject?.name;
    } else if (approval.cost_target_type === 2) {
      const targetDept = db.prepare('SELECT name FROM departments WHERE id = ?').get(approval.cost_target_id);
      costTargetName = targetDept?.name;
    }
  }
  
  res.json({
    success: true,
    data: {
      ...approval,
      flows,
      costTargetName
    }
  });
});

module.exports = router;
