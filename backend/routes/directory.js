const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/directory
 * 获取通讯录列表
 * Query: keyword, department
 * 只返回 status='active' 且 in_directory=true 的用户
 */
router.get('/', (req, res) => {
  try {
    const {
      keyword = '',
      department = ''
    } = req.query;

    // 构建查询条件 - 只显示 active 状态且在通讯录中的用户
    let whereConditions = ['u.status = ?', '(u.in_directory = 1 OR u.in_directory IS NULL)'];
    let params = ['active'];

    // 关键词搜索（姓名、手机号、邮箱模糊匹配，支持拼音首字母）
    if (keyword && keyword.trim()) {
      const kw = keyword.trim();
      whereConditions.push(`(
        u.real_name LIKE ? OR 
        u.phone LIKE ? OR 
        u.email LIKE ? OR 
        u.position LIKE ? OR
        u.pinyin LIKE ? OR
        u.pinyin_abbr LIKE ?
      )`);
      const likeKeyword = `%${kw}%`;
      params.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword, likeKeyword);
    }

    // 部门筛选
    if (department && department.trim()) {
      whereConditions.push('u.department_id = ?');
      params.push(parseInt(department));
    }

    const whereClause = whereConditions.join(' AND ');

    // 查询列表
    const listSql = `
      SELECT 
        u.id,
        u.real_name,
        u.phone,
        u.email,
        u.company_email,
        u.department_id,
        u.position,
        u.avatar,
        u.pinyin,
        u.pinyin_abbr,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE ${whereClause}
      ORDER BY d.sort_order ASC, u.real_name ASC
    `;

    const list = db.prepare(listSql).all(...params);

    res.json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('获取通讯录列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取通讯录列表失败'
    });
  }
});

/**
 * GET /api/directory/departments
 * 获取部门列表（用于筛选，只返回有员工的部门）
 */
router.get('/departments', (req, res) => {
  try {
    // 查询有员工的部门
    const sql = `
      SELECT DISTINCT
        d.id,
        d.name,
        d.parent_id,
        d.sort_order
      FROM departments d
      INNER JOIN users u ON u.department_id = d.id
      WHERE u.status = 'active' AND (u.in_directory = 1 OR u.in_directory IS NULL)
      ORDER BY d.sort_order ASC, d.name ASC
    `;

    const departments = db.prepare(sql).all();

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('获取部门列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取部门列表失败'
    });
  }
});

/**
 * GET /api/directory/:id
 * 获取联系人详情
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        u.id,
        u.real_name,
        u.phone,
        u.email,
        u.company_email,
        u.department_id,
        u.position,
        u.avatar,
        u.employee_id,
        u.entry_date,
        u.pinyin,
        u.pinyin_abbr,
        d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ? AND u.status = 'active' AND (u.in_directory = 1 OR u.in_directory IS NULL)
    `;

    const user = db.prepare(sql).get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '联系人不存在或不显示在通讯录中'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('获取联系人详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取联系人详情失败'
    });
  }
});

module.exports = router;
