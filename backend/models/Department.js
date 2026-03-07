/**
 * Department 模型 - 部门管理
 */
const { db } = require('./database');

class Department {
  /**
   * 获取所有部门（平铺列表）
   */
  static findAll() {
    return db.prepare(`
      SELECT d.*, 
             u.real_name as manager_name,
             p.name as parent_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      LEFT JOIN departments p ON d.parent_id = p.id
      ORDER BY d.sort_order ASC, d.id ASC
    `).all();
  }

  /**
   * 根据 ID 获取部门
   */
  static findById(id) {
    return db.prepare(`
      SELECT d.*, 
             u.real_name as manager_name,
             p.name as parent_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      LEFT JOIN departments p ON d.parent_id = p.id
      WHERE d.id = ?
    `).get(id);
  }

  /**
   * 获取部门树结构
   * 递归构建树形结构
   */
  static getTree() {
    const departments = db.prepare(`
      SELECT d.*, 
             u.real_name as manager_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      ORDER BY d.sort_order ASC, d.id ASC
    `).all();

    // 构建树结构
    const buildTree = (items, parentId = null) => {
      return items
        .filter(item => item.parent_id === parentId)
        .map(item => ({
          id: item.id,
          key: String(item.id),
          title: item.name,
          manager_id: item.manager_id,
          manager_name: item.manager_name,
          sort_order: item.sort_order,
          created_at: item.created_at,
          children: buildTree(items, item.id)
        }));
    };

    return buildTree(departments);
  }

  /**
   * 创建部门
   */
  static create(data) {
    const { name, parent_id = null, manager_id = null, sort_order = 0 } = data;
    
    const stmt = db.prepare(`
      INSERT INTO departments (name, parent_id, manager_id, sort_order)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(name, parent_id, manager_id, sort_order);
    return this.findById(result.lastInsertRowid);
  }

  /**
   * 更新部门
   */
  static update(id, data) {
    const { name, parent_id, manager_id, sort_order } = data;
    
    const stmt = db.prepare(`
      UPDATE departments 
      SET name = ?, parent_id = ?, manager_id = ?, sort_order = ?
      WHERE id = ?
    `);
    
    stmt.run(name, parent_id, manager_id, sort_order, id);
    return this.findById(id);
  }

  /**
   * 删除部门
   * 注意：需要先检查是否有子部门或关联用户
   */
  static delete(id) {
    // 检查是否有子部门
    const children = db.prepare(`
      SELECT COUNT(*) as count FROM departments WHERE parent_id = ?
    `).get(id);
    
    if (children.count > 0) {
      return { success: false, message: '该部门下还有子部门，无法删除' };
    }

    // 检查是否有用户
    const users = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE department_id = ?
    `).get(id);
    
    if (users.count > 0) {
      return { success: false, message: '该部门下还有用户，无法删除' };
    }

    db.prepare('DELETE FROM departments WHERE id = ?').run(id);
    return { success: true, message: '删除成功' };
  }

  /**
   * 搜索部门
   */
  static search(keyword) {
    return db.prepare(`
      SELECT d.*, 
             u.real_name as manager_name,
             p.name as parent_name
      FROM departments d
      LEFT JOIN users u ON d.manager_id = u.id
      LEFT JOIN departments p ON d.parent_id = p.id
      WHERE d.name LIKE ?
      ORDER BY d.sort_order ASC, d.id ASC
    `).all(`%${keyword}%`);
  }

  /**
   * 获取部门下的用户数量
   */
  static getUserCount(departmentId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE department_id = ?
    `).get(departmentId).count;
  }

  /**
   * 获取部门的所有子部门 ID（包括自己）
   */
  static getAllChildrenIds(departmentId) {
    const ids = [departmentId];
    
    const getChildren = (parentId) => {
      const children = db.prepare(`
        SELECT id FROM departments WHERE parent_id = ?
      `).all(parentId);
      
      children.forEach(child => {
        ids.push(child.id);
        getChildren(child.id);
      });
    };
    
    getChildren(departmentId);
    return ids;
  }
}

module.exports = Department;
