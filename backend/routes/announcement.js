const express = require('express');
const router = express.Router();
const db = require('../models/database');
const authMiddleware = require('../middleware/auth');

// 创建公告表
db.exec(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'system',
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'published',
    publisher_id INTEGER,
    publisher_name TEXT,
    publish_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_count INTEGER DEFAULT 0
  )
`);

// 获取公告列表
router.get('/', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, type, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = 'SELECT * FROM announcements WHERE 1=1';
  const params = [];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  
  // 获取总数
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ' ORDER BY publish_time DESC LIMIT ? OFFSET ?';
  params.push(parseInt(pageSize), offset);
  
  const announcements = db.prepare(sql).all(...params);
  
  res.json({
    success: true,
    data: announcements,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total
    }
  });
});

// 获取单个公告
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  
  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: '公告不存在'
    });
  }
  
  // 增加阅读计数
  db.prepare('UPDATE announcements SET read_count = read_count + 1 WHERE id = ?').run(id);
  
  res.json({
    success: true,
    data: announcement
  });
});

// 创建公告
router.post('/', authMiddleware, (req, res) => {
  const { title, content, type = 'system', priority = 'normal' } = req.body;
  const userId = req.user.id;
  
  // 获取用户名
  const user = db.prepare('SELECT real_name FROM users WHERE id = ?').get(userId);
  const publisherName = user ? user.real_name : '系统管理员';
  
  const result = db.prepare(`
    INSERT INTO announcements (title, content, type, priority, publisher_id, publisher_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(title, content, type, priority, userId, publisherName);
  
  res.json({
    success: true,
    message: '公告发布成功',
    data: {
      id: result.lastInsertRowid,
      title,
      content,
      type,
      priority,
      publisher_name: publisherName,
      publish_time: new Date().toISOString()
    }
  });
});

// 更新公告
router.put('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { title, content, type, priority, status } = req.body;
  
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  
  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: '公告不存在'
    });
  }
  
  db.prepare(`
    UPDATE announcements 
    SET title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        priority = COALESCE(?, priority),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, content, type, priority, status, id);
  
  res.json({
    success: true,
    message: '公告更新成功'
  });
});

// 删除公告
router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  
  if (!announcement) {
    return res.status(404).json({
      success: false,
      message: '公告不存在'
    });
  }
  
  db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
  
  res.json({
    success: true,
    message: '公告删除成功'
  });
});

// 撤回公告
router.post('/:id/revoke', authMiddleware, (req, res) => {
  const { id } = req.params;
  
  db.prepare('UPDATE announcements SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run('revoked', id);
  
  res.json({
    success: true,
    message: '公告已撤回'
  });
});

module.exports = router;
