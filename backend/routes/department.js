const express = require('express');
const { db } = require('../models/database');

const router = express.Router();

/**
 * 获取所有部门（树形结构）
 * GET /api/departments
 */
router.get('/', (req, res) => {
  try {
    // 获取所有部门
    const departments = db.prepare(`
      SELECT 
        d.id, 
        d.name, 
        d.parent_id, 
        d.sort_order,
        d.manager_id,
        d.remark,
        d.created_at,
        u.real_name as manager_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      ORDER BY d.sort_order ASC, d.id ASC
    `).all();

    // 构建树形结构
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          ...item,
          key: item.id,
          value: item.id,
          title: item.name,
          children: buildTree(items, item.id)
        }));
    };

    const tree = buildTree(departments);

    res.json({
      success: true,
      data: {
        list: departments,
        tree: tree
      }
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
 * 获取单个部门详情
 * GET /api/departments/:id
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    const department = db.prepare(`
      SELECT 
        d.id, 
        d.name, 
        d.parent_id, 
        d.sort_order,
        d.manager_id,
        d.remark,
        d.created_at,
        u.real_name as manager_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      WHERE d.id = ?
    `).get(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: '部门不存在'
      });
    }

    res.json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('获取部门详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取部门详情失败'
    });
  }
});

/**
 * 新增部门
 * POST /api/departments
 * 请求体: { name, parent_id, sort_order, manager_id, remark }
 */
router.post('/', (req, res) => {
  try {
    const { name, parent_id = null, sort_order = 0, manager_id = null, remark = '' } = req.body;

    // 参数验证
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: '部门名称不能为空'
      });
    }

    // 检查部门名称是否重复（同级下不能重名）
    const existingDept = db.prepare(`
      SELECT id FROM departments WHERE name = ? AND parent_id IS ?
    `).get(name.trim(), parent_id || null);

    if (existingDept) {
      return res.status(400).json({
        success: false,
        message: '同级部门下已存在相同名称的部门'
      });
    }

    // 如果指定了上级部门，检查上级部门是否存在
    if (parent_id) {
      const parentDept = db.prepare('SELECT id FROM departments WHERE id = ?').get(parent_id);
      if (!parentDept) {
        return res.status(400).json({
          success: false,
          message: '上级部门不存在'
        });
      }
    }

    // 检查 departments 表是否有 sort_order 和 remark 字段，如果没有则添加
    try {
      db.exec(`ALTER TABLE departments ADD COLUMN sort_order INTEGER DEFAULT 0`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
    try {
      db.exec(`ALTER TABLE departments ADD COLUMN remark TEXT DEFAULT ''`);
    } catch (e) {
      // 字段已存在，忽略错误
    }

    // 插入部门
    const stmt = db.prepare(`
      INSERT INTO departments (name, parent_id, sort_order, manager_id, remark)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name.trim(), 
      parent_id || null, 
      sort_order || 0, 
      manager_id || null, 
      remark || ''
    );

    // 获取新创建的部门
    const newDept = db.prepare(`
      SELECT 
        d.id, 
        d.name, 
        d.parent_id, 
        d.sort_order,
        d.manager_id,
        d.remark,
        d.created_at,
        u.real_name as manager_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      WHERE d.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: '部门创建成功',
      data: newDept
    });
  } catch (error) {
    console.error('创建部门失败:', error);
    res.status(500).json({
      success: false,
      message: '创建部门失败'
    });
  }
});

/**
 * 更新部门
 * PUT /api/departments/:id
 * 请求体: { name, parent_id, sort_order, manager_id, remark }
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, sort_order, manager_id, remark } = req.body;

    // 检查部门是否存在
    const existingDept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    if (!existingDept) {
      return res.status(404).json({
        success: false,
        message: '部门不存在'
      });
    }

    // 参数验证
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({
        success: false,
        message: '部门名称不能为空'
      });
    }

    // 如果修改了名称，检查同级下是否重名
    if (name && name !== existingDept.name) {
      const duplicateName = db.prepare(`
        SELECT id FROM departments WHERE name = ? AND parent_id IS ? AND id != ?
      `).get(name.trim(), parent_id !== undefined ? (parent_id || null) : existingDept.parent_id, id);

      if (duplicateName) {
        return res.status(400).json({
          success: false,
          message: '同级部门下已存在相同名称的部门'
        });
      }
    }

    // 如果修改了上级部门，检查是否会造成循环引用
    if (parent_id !== undefined && parent_id !== null) {
      // 不能将自己设为上级部门
      if (parseInt(parent_id) === parseInt(id)) {
        return res.status(400).json({
          success: false,
          message: '不能将部门设为自己的上级部门'
        });
      }

      // 检查上级部门是否存在
      const parentDept = db.prepare('SELECT id FROM departments WHERE id = ?').get(parent_id);
      if (!parentDept) {
        return res.status(400).json({
          success: false,
          message: '上级部门不存在'
        });
      }

      // 检查是否会造成循环引用（新上级部门不能是当前部门的子部门）
      const checkCircular = (deptId, targetParentId) => {
        const children = db.prepare('SELECT id FROM departments WHERE parent_id = ?').all(deptId);
        for (const child of children) {
          if (child.id === targetParentId) {
            return true;
          }
          if (checkCircular(child.id, targetParentId)) {
            return true;
          }
        }
        return false;
      };

      if (checkCircular(id, parseInt(parent_id))) {
        return res.status(400).json({
          success: false,
          message: '不能将子部门设为上级部门'
        });
      }
    }

    // 检查 departments 表是否有 sort_order 和 remark 字段，如果没有则添加
    try {
      db.exec(`ALTER TABLE departments ADD COLUMN sort_order INTEGER DEFAULT 0`);
    } catch (e) {
      // 字段已存在，忽略错误
    }
    try {
      db.exec(`ALTER TABLE departments ADD COLUMN remark TEXT DEFAULT ''`);
    } catch (e) {
      // 字段已存在，忽略错误
    }

    // 构建更新语句
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (parent_id !== undefined) {
      updates.push('parent_id = ?');
      values.push(parent_id || null);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      values.push(sort_order || 0);
    }
    if (manager_id !== undefined) {
      updates.push('manager_id = ?');
      values.push(manager_id || null);
    }
    if (remark !== undefined) {
      updates.push('remark = ?');
      values.push(remark || '');
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的内容'
      });
    }

    values.push(id);
    db.prepare(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // 获取更新后的部门
    const updatedDept = db.prepare(`
      SELECT 
        d.id, 
        d.name, 
        d.parent_id, 
        d.sort_order,
        d.manager_id,
        d.remark,
        d.created_at,
        u.real_name as manager_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      WHERE d.id = ?
    `).get(id);

    res.json({
      success: true,
      message: '部门更新成功',
      data: updatedDept
    });
  } catch (error) {
    console.error('更新部门失败:', error);
    res.status(500).json({
      success: false,
      message: '更新部门失败'
    });
  }
});

/**
 * 删除部门
 * DELETE /api/departments/:id
 * 有子部门或员工时禁止删除
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 检查部门是否存在
    const existingDept = db.prepare('SELECT * FROM departments WHERE id = ?').get(id);
    if (!existingDept) {
      return res.status(404).json({
        success: false,
        message: '部门不存在'
      });
    }

    // 检查是否有子部门
    const childDepts = db.prepare('SELECT id, name FROM departments WHERE parent_id = ?').all(id);
    if (childDepts.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该部门下存在子部门，无法删除',
        data: { children: childDepts }
      });
    }

    // 检查是否有员工
    const employees = db.prepare('SELECT id, real_name, username FROM users WHERE department_id = ?').all(id);
    if (employees.length > 0) {
      return res.status(400).json({
        success: false,
        message: '该部门下存在员工，无法删除',
        data: { employees: employees }
      });
    }

    // 删除部门
    db.prepare('DELETE FROM departments WHERE id = ?').run(id);

    res.json({
      success: true,
      message: '部门删除成功'
    });
  } catch (error) {
    console.error('删除部门失败:', error);
    res.status(500).json({
      success: false,
      message: '删除部门失败'
    });
  }
});

/**
 * 获取部门下的员工列表
 * GET /api/departments/:id/employees
 */
router.get('/:id/employees', (req, res) => {
  try {
    const { id } = req.params;

    const employees = db.prepare(`
      SELECT id, username, real_name, email, phone, position, status, created_at
      FROM users
      WHERE department_id = ?
      ORDER BY created_at DESC
    `).all(id);

    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    console.error('获取部门员工失败:', error);
    res.status(500).json({
      success: false,
      message: '获取部门员工失败'
    });
  }
});

/**
 * 获取部门树选项（用于下拉选择）
 * GET /api/departments/tree-options
 */
router.get('/tree-options/list', (req, res) => {
  try {
    const departments = db.prepare(`
      SELECT id, name, parent_id
      FROM departments
      ORDER BY sort_order ASC, id ASC
    `).all();

    // 构建树形结构
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          value: item.id,
          label: item.name,
          children: buildTree(items, item.id)
        }))
        .filter(item => item.label); // 过滤空项
    };

    const tree = buildTree(departments);

    res.json({
      success: true,
      data: tree
    });
  } catch (error) {
    console.error('获取部门树选项失败:', error);
    res.status(500).json({
      success: false,
      message: '获取部门树选项失败'
    });
  }
});

module.exports = router;
