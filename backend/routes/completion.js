/**
 * 竣工管理路由
 * Task 58: 实现竣工图纸上传和管理功能
 * 
 * 功能：
 * - GET /api/completion/drawings - 获取图纸列表
 * - POST /api/completion/drawings - 上传图纸
 * - GET /api/completion/drawings/:id - 获取详情
 * - DELETE /api/completion/drawings/:id - 删除图纸
 * - GET /api/completion/drawings/:id/download - 下载图纸
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

const router = express.Router();

// 为所有竣工管理路由添加认证
router.use(authMiddleware);

// ========================================
// 文件上传配置
// ========================================

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads', 'drawings');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳 + 随机数 + 原始扩展名
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + ext);
  }
});

// 文件过滤器 - 只允许图片和PDF格式
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式，仅支持 JPG、PNG、PDF 格式'), false);
  }
};

// 配置上传中间件
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB 限制
  }
});

// ========================================
// 竣工图纸 API
// ========================================

/**
 * GET /api/completion/drawings
 * 获取图纸列表
 * 支持筛选：project_id, drawing_type, keyword
 */
router.get('/drawings', (req, res) => {
  const { project_id, drawing_type, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT cd.*, p.name as project_name, p.project_no,
           u.real_name as uploader_name
    FROM completion_drawings cd
    LEFT JOIN projects p ON cd.project_id = p.id
    LEFT JOIN users u ON cd.uploader_id = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  // 项目筛选
  if (project_id) {
    sql += ` AND cd.project_id = ?`;
    params.push(project_id);
  }
  
  // 图纸类型筛选
  if (drawing_type) {
    sql += ` AND cd.drawing_type = ?`;
    params.push(drawing_type);
  }
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (cd.drawing_name LIKE ? OR p.name LIKE ? OR cd.remark LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY cd.upload_date DESC, cd.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  try {
    const drawings = db.prepare(sql).all(...params);
    
    // 格式化返回数据
    const formattedDrawings = drawings.map(drawing => ({
      ...drawing,
      file_size_formatted: formatFileSize(drawing.file_size),
      thumbnail_url: getThumbnailUrl(drawing.file_path)
    }));
    
    res.json({
      success: true,
      data: formattedDrawings,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取图纸列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取图纸列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/drawings/:id
 * 获取图纸详情
 */
router.get('/drawings/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const drawing = db.prepare(`
      SELECT cd.*, p.name as project_name, p.project_no,
             u.real_name as uploader_name
      FROM completion_drawings cd
      LEFT JOIN projects p ON cd.project_id = p.id
      LEFT JOIN users u ON cd.uploader_id = u.id
      WHERE cd.id = ?
    `).get(id);
    
    if (!drawing) {
      return res.status(404).json({
        success: false,
        message: '图纸不存在'
      });
    }
    
    // 格式化返回数据
    const result = {
      ...drawing,
      file_size_formatted: formatFileSize(drawing.file_size),
      thumbnail_url: getThumbnailUrl(drawing.file_path),
      download_url: `/api/completion/drawings/${id}/download`
    };
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取图纸详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取图纸详情失败: ' + error.message
    });
  }
});

/**
 * POST /api/completion/drawings
 * 上传图纸（支持多文件）
 */
router.post('/drawings', upload.array('files', 20), (req, res) => {
  const { project_id, drawing_type, remark } = req.body;
  const userId = req.user.id;
  
  // 验证必填字段
  if (!project_id) {
    // 清理已上传的文件
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
    }
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  // 检查是否有文件上传
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请选择要上传的图纸文件'
    });
  }
  
  // 验证项目是否存在
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) {
      // 清理已上传的文件
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
      return res.status(400).json({
        success: false,
        message: '关联项目不存在'
      });
    }
  } catch (error) {
    // 清理已上传的文件
    req.files.forEach(file => {
      fs.unlinkSync(file.path);
    });
    return res.status(500).json({
      success: false,
      message: '验证项目失败: ' + error.message
    });
  }
  
  const uploadDate = new Date().toISOString().split('T')[0];
  const uploadedDrawings = [];
  const errors = [];
  
  try {
    // 使用事务批量插入
    const insertStmt = db.prepare(`
      INSERT INTO completion_drawings (
        project_id, drawing_name, drawing_type, file_path, file_size,
        upload_date, uploader_id, remark, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const insertMany = db.transaction((files) => {
      files.forEach(file => {
        try {
          // 获取原始文件名（处理中文）
          const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const fileName = path.parse(originalName).name;
          
          const result = insertStmt.run(
            parseInt(project_id),
            fileName,
            drawing_type || 'general',
            file.path,
            file.size,
            uploadDate,
            userId,
            remark || null
          );
          
          // 获取插入的记录
          const newDrawing = db.prepare(`
            SELECT cd.*, p.name as project_name, u.real_name as uploader_name
            FROM completion_drawings cd
            LEFT JOIN projects p ON cd.project_id = p.id
            LEFT JOIN users u ON cd.uploader_id = u.id
            WHERE cd.id = ?
          `).get(result.lastInsertRowid);
          
          uploadedDrawings.push({
            ...newDrawing,
            file_size_formatted: formatFileSize(newDrawing.file_size),
            thumbnail_url: getThumbnailUrl(newDrawing.file_path)
          });
        } catch (err) {
          errors.push({
            file: file.originalname,
            error: err.message
          });
          // 删除上传失败的文件
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // 忽略删除失败
          }
        }
      });
    });
    
    insertMany(req.files);
    
    res.json({
      success: true,
      message: `成功上传 ${uploadedDrawings.length} 个图纸`,
      data: {
        uploaded: uploadedDrawings,
        errors: errors.length > 0 ? errors : undefined,
        total: uploadedDrawings.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('上传图纸失败:', error);
    // 清理所有已上传的文件
    req.files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // 忽略删除失败
      }
    });
    res.status(500).json({
      success: false,
      message: '上传图纸失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/completion/drawings/:id
 * 删除图纸
 */
router.delete('/drawings/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // 获取图纸信息
    const drawing = db.prepare(`
      SELECT cd.*, p.manager_id
      FROM completion_drawings cd
      LEFT JOIN projects p ON cd.project_id = p.id
      WHERE cd.id = ?
    `).get(id);
    
    if (!drawing) {
      return res.status(404).json({
        success: false,
        message: '图纸不存在'
      });
    }
    
    // 权限检查：只有上传者或项目经理可以删除
    const user = db.prepare(`
      SELECT u.id, GROUP_CONCAT(r.code) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id
    `).get(userId);
    
    const userRoles = user?.roles ? user.roles.split(',') : [];
    const isAdmin = userRoles.includes('ADMIN');
    const isManager = drawing.manager_id === userId;
    const isUploader = drawing.uploader_id === userId;
    
    if (!isAdmin && !isManager && !isUploader) {
      return res.status(403).json({
        success: false,
        message: '您没有权限删除此图纸'
      });
    }
    
    // 删除数据库记录
    db.prepare('DELETE FROM completion_drawings WHERE id = ?').run(id);
    
    // 删除文件
    try {
      if (fs.existsSync(drawing.file_path)) {
        fs.unlinkSync(drawing.file_path);
      }
    } catch (fileError) {
      console.error('删除图纸文件失败:', fileError);
      // 即使文件删除失败，数据库记录也已删除，不返回错误
    }
    
    res.json({
      success: true,
      message: '图纸删除成功'
    });
  } catch (error) {
    console.error('删除图纸失败:', error);
    res.status(500).json({
      success: false,
      message: '删除图纸失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/drawings/:id/download
 * 下载图纸
 */
router.get('/drawings/:id/download', (req, res) => {
  const { id } = req.params;
  
  try {
    const drawing = db.prepare(`
      SELECT cd.*, p.name as project_name
      FROM completion_drawings cd
      LEFT JOIN projects p ON cd.project_id = p.id
      WHERE cd.id = ?
    `).get(id);
    
    if (!drawing) {
      return res.status(404).json({
        success: false,
        message: '图纸不存在'
      });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(drawing.file_path)) {
      return res.status(404).json({
        success: false,
        message: '图纸文件不存在'
      });
    }
    
    // 获取文件扩展名
    const ext = path.extname(drawing.file_path).toLowerCase();
    const originalName = `${drawing.drawing_name}${ext}`;
    
    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    
    // 根据文件类型设置 Content-Type
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', drawing.file_size);
    
    // 发送文件
    res.sendFile(drawing.file_path, (err) => {
      if (err) {
        console.error('发送文件失败:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: '下载文件失败'
          });
        }
      }
    });
  } catch (error) {
    console.error('下载图纸失败:', error);
    res.status(500).json({
      success: false,
      message: '下载图纸失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/drawings/stats/overview
 * 获取图纸统计概览
 */
router.get('/drawings/stats/overview', (req, res) => {
  const { project_id } = req.query;
  
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (project_id) {
      whereClause += ' AND project_id = ?';
      params.push(project_id);
    }
    
    // 总数
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM completion_drawings WHERE ${whereClause}
    `).get(...params);
    
    // 按类型统计
    const typeStats = db.prepare(`
      SELECT drawing_type, COUNT(*) as count
      FROM completion_drawings
      WHERE ${whereClause}
      GROUP BY drawing_type
    `).all(...params);
    
    // 总文件大小
    const sizeResult = db.prepare(`
      SELECT COALESCE(SUM(file_size), 0) as total_size
      FROM completion_drawings
      WHERE ${whereClause}
    `).get(...params);
    
    // 按项目统计
    const projectStats = db.prepare(`
      SELECT p.id, p.name, p.project_no, COUNT(cd.id) as drawing_count
      FROM projects p
      LEFT JOIN completion_drawings cd ON p.id = cd.project_id
      GROUP BY p.id
      ORDER BY drawing_count DESC
      LIMIT 10
    `).all();
    
    res.json({
      success: true,
      data: {
        total: totalResult.total,
        totalSize: sizeResult.total_size,
        totalSizeFormatted: formatFileSize(sizeResult.total_size),
        typeStats: typeStats,
        projectStats: projectStats
      }
    });
  } catch (error) {
    console.error('获取图纸统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取图纸统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/drawings/projects/list
 * 获取有图纸的项目列表（用于筛选）
 */
router.get('/drawings/projects/list', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.project_no, p.status,
             COUNT(cd.id) as drawing_count
      FROM projects p
      INNER JOIN completion_drawings cd ON p.id = cd.project_id
      GROUP BY p.id
      ORDER BY drawing_count DESC
    `).all();
    
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

// ========================================
// 文档归档 API（Task 59）
// ========================================

// 确保文档上传目录存在
const docUploadDir = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(docUploadDir)) {
  fs.mkdirSync(docUploadDir, { recursive: true });
}

// 文档上传配置
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, docUploadDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名：时间戳 + 随机数 + 原始扩展名
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + ext);
  }
});

// 文档文件过滤器 - 支持多种格式
const docFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/jpg', 'image/gif',
    'application/pdf',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'text/plain', // .txt
    'application/zip', // .zip
    'application/x-rar-compressed' // .rar
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式'), false);
  }
};

// 文档上传中间件
const docUpload = multer({
  storage: docStorage,
  fileFilter: docFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB 限制
  }
});

/**
 * GET /api/completion/documents
 * 获取文档列表
 * 支持筛选：project_id, doc_type, keyword
 */
router.get('/documents', (req, res) => {
  const { project_id, doc_type, keyword, page = 1, pageSize = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(pageSize);
  
  let sql = `
    SELECT cd.*, p.name as project_name, p.project_no,
           u.real_name as uploader_name
    FROM completion_documents cd
    LEFT JOIN projects p ON cd.project_id = p.id
    LEFT JOIN users u ON cd.uploader_id = u.id
    WHERE 1=1
  `;
  
  const params = [];
  
  // 项目筛选
  if (project_id) {
    sql += ` AND cd.project_id = ?`;
    params.push(project_id);
  }
  
  // 文档类型筛选
  if (doc_type) {
    sql += ` AND cd.doc_type = ?`;
    params.push(doc_type);
  }
  
  // 关键词搜索
  if (keyword) {
    sql += ` AND (cd.doc_name LIKE ? OR p.name LIKE ? OR cd.remark LIKE ?)`;
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  
  // 获取总数
  const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
  const countResult = db.prepare(countSql).get(...params);
  const total = countResult ? countResult.total : 0;
  
  // 排序和分页
  sql += ` ORDER BY cd.upload_date DESC, cd.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), offset);
  
  try {
    const documents = db.prepare(sql).all(...params);
    
    // 格式化返回数据
    const formattedDocs = documents.map(doc => ({
      ...doc,
      file_size_formatted: formatFileSize(doc.file_size)
    }));
    
    res.json({
      success: true,
      data: formattedDocs,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取文档列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文档列表失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/documents/:id
 * 获取文档详情
 */
router.get('/documents/:id', (req, res) => {
  const { id } = req.params;
  
  try {
    const doc = db.prepare(`
      SELECT cd.*, p.name as project_name, p.project_no,
             u.real_name as uploader_name
      FROM completion_documents cd
      LEFT JOIN projects p ON cd.project_id = p.id
      LEFT JOIN users u ON cd.uploader_id = u.id
      WHERE cd.id = ?
    `).get(id);
    
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: '文档不存在'
      });
    }
    
    // 格式化返回数据
    const result = {
      ...doc,
      file_size_formatted: formatFileSize(doc.file_size),
      download_url: `/api/completion/documents/${id}/download`
    };
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取文档详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文档详情失败: ' + error.message
    });
  }
});

/**
 * POST /api/completion/documents
 * 上传文档（支持多文件）
 */
router.post('/documents', docUpload.array('files', 20), (req, res) => {
  const { project_id, doc_type, remark } = req.body;
  const userId = req.user.id;
  
  // 验证必填字段
  if (!project_id) {
    // 清理已上传的文件
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
    }
    return res.status(400).json({
      success: false,
      message: '请选择关联项目'
    });
  }
  
  // 检查是否有文件上传
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请选择要上传的文档文件'
    });
  }
  
  // 验证项目是否存在
  try {
    const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
    if (!project) {
      // 清理已上传的文件
      req.files.forEach(file => {
        fs.unlinkSync(file.path);
      });
      return res.status(400).json({
        success: false,
        message: '关联项目不存在'
      });
    }
  } catch (error) {
    // 清理已上传的文件
    req.files.forEach(file => {
      fs.unlinkSync(file.path);
    });
    return res.status(500).json({
      success: false,
      message: '验证项目失败: ' + error.message
    });
  }
  
  const uploadDate = new Date().toISOString().split('T')[0];
  const uploadedDocs = [];
  const errors = [];
  
  try {
    // 使用事务批量插入
    const insertStmt = db.prepare(`
      INSERT INTO completion_documents (
        project_id, doc_name, doc_type, file_path, file_size,
        upload_date, uploader_id, remark, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const insertMany = db.transaction((files) => {
      files.forEach(file => {
        try {
          // 获取原始文件名（处理中文）
          const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const fileName = path.parse(originalName).name;
          
          const result = insertStmt.run(
            parseInt(project_id),
            fileName,
            doc_type || 'other',
            file.path,
            file.size,
            uploadDate,
            userId,
            remark || null
          );
          
          // 获取插入的记录
          const newDoc = db.prepare(`
            SELECT cd.*, p.name as project_name, u.real_name as uploader_name
            FROM completion_documents cd
            LEFT JOIN projects p ON cd.project_id = p.id
            LEFT JOIN users u ON cd.uploader_id = u.id
            WHERE cd.id = ?
          `).get(result.lastInsertRowid);
          
          uploadedDocs.push({
            ...newDoc,
            file_size_formatted: formatFileSize(newDoc.file_size)
          });
        } catch (err) {
          errors.push({
            file: file.originalname,
            error: err.message
          });
          // 删除上传失败的文件
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            // 忽略删除失败
          }
        }
      });
    });
    
    insertMany(req.files);
    
    res.json({
      success: true,
      message: `成功上传 ${uploadedDocs.length} 个文档`,
      data: {
        uploaded: uploadedDocs,
        errors: errors.length > 0 ? errors : undefined,
        total: uploadedDocs.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('上传文档失败:', error);
    // 清理所有已上传的文件
    req.files.forEach(file => {
      try {
        fs.unlinkSync(file.path);
      } catch (e) {
        // 忽略删除失败
      }
    });
    res.status(500).json({
      success: false,
      message: '上传文档失败: ' + error.message
    });
  }
});

/**
 * DELETE /api/completion/documents/:id
 * 删除文档
 */
router.delete('/documents/:id', (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // 获取文档信息
    const doc = db.prepare(`
      SELECT cd.*, p.manager_id
      FROM completion_documents cd
      LEFT JOIN projects p ON cd.project_id = p.id
      WHERE cd.id = ?
    `).get(id);
    
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: '文档不存在'
      });
    }
    
    // 权限检查：只有上传者或项目经理可以删除
    const user = db.prepare(`
      SELECT u.id, GROUP_CONCAT(r.code) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id
    `).get(userId);
    
    const userRoles = user?.roles ? user.roles.split(',') : [];
    const isAdmin = userRoles.includes('ADMIN');
    const isManager = doc.manager_id === userId;
    const isUploader = doc.uploader_id === userId;
    
    if (!isAdmin && !isManager && !isUploader) {
      return res.status(403).json({
        success: false,
        message: '您没有权限删除此文档'
      });
    }
    
    // 删除数据库记录
    db.prepare('DELETE FROM completion_documents WHERE id = ?').run(id);
    
    // 删除文件
    try {
      if (fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }
    } catch (fileError) {
      console.error('删除文档文件失败:', fileError);
      // 即使文件删除失败，数据库记录也已删除，不返回错误
    }
    
    res.json({
      success: true,
      message: '文档删除成功'
    });
  } catch (error) {
    console.error('删除文档失败:', error);
    res.status(500).json({
      success: false,
      message: '删除文档失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/documents/:id/download
 * 下载文档
 */
router.get('/documents/:id/download', (req, res) => {
  const { id } = req.params;
  
  try {
    const doc = db.prepare(`
      SELECT cd.*, p.name as project_name
      FROM completion_documents cd
      LEFT JOIN projects p ON cd.project_id = p.id
      WHERE cd.id = ?
    `).get(id);
    
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: '文档不存在'
      });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({
        success: false,
        message: '文档文件不存在'
      });
    }
    
    // 获取文件扩展名
    const ext = path.extname(doc.file_path).toLowerCase();
    const originalName = `${doc.doc_name}${ext}`;
    
    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    
    // 根据文件类型设置 Content-Type
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed'
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', doc.file_size);
    
    // 发送文件
    res.sendFile(doc.file_path, (err) => {
      if (err) {
        console.error('发送文件失败:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: '下载文件失败'
          });
        }
      }
    });
  } catch (error) {
    console.error('下载文档失败:', error);
    res.status(500).json({
      success: false,
      message: '下载文档失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/documents/stats/overview
 * 获取文档统计概览
 */
router.get('/documents/stats/overview', (req, res) => {
  const { project_id } = req.query;
  
  try {
    let whereClause = '1=1';
    const params = [];
    
    if (project_id) {
      whereClause += ' AND project_id = ?';
      params.push(project_id);
    }
    
    // 总数
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM completion_documents WHERE ${whereClause}
    `).get(...params);
    
    // 按类型统计
    const typeStats = db.prepare(`
      SELECT doc_type, COUNT(*) as count
      FROM completion_documents
      WHERE ${whereClause}
      GROUP BY doc_type
    `).all(...params);
    
    // 总文件大小
    const sizeResult = db.prepare(`
      SELECT COALESCE(SUM(file_size), 0) as total_size
      FROM completion_documents
      WHERE ${whereClause}
    `).get(...params);
    
    // 按项目统计
    const projectStats = db.prepare(`
      SELECT p.id, p.name, p.project_no, COUNT(cd.id) as doc_count
      FROM projects p
      LEFT JOIN completion_documents cd ON p.id = cd.project_id
      GROUP BY p.id
      ORDER BY doc_count DESC
      LIMIT 10
    `).all();
    
    res.json({
      success: true,
      data: {
        total: totalResult.total,
        totalSize: sizeResult.total_size,
        totalSizeFormatted: formatFileSize(sizeResult.total_size),
        typeStats: typeStats,
        projectStats: projectStats
      }
    });
  } catch (error) {
    console.error('获取文档统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取文档统计失败: ' + error.message
    });
  }
});

/**
 * GET /api/completion/documents/projects/list
 * 获取有文档的项目列表（用于筛选）
 */
router.get('/documents/projects/list', (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.project_no, p.status,
             COUNT(cd.id) as doc_count
      FROM projects p
      INNER JOIN completion_documents cd ON p.id = cd.project_id
      GROUP BY p.id
      ORDER BY doc_count DESC
    `).all();
    
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

// ========================================
// Task 57: 劳务结算 API
// ========================================

/**
 * 生成结算编号
 * 格式: JS + YYMM + 3位序号
 * 例: 2026年3月第1个: JS2603001
 */
function generateSettlementNo() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `JS${year}${month}`;

  // 查询当月最大序号
  const maxNo = db.prepare(`
    SELECT MAX(settlement_no) as max_no 
    FROM completion_labor_settlements 
    WHERE settlement_no LIKE ?
  `).get(`${prefix}%`);

  let seq = 1;
  if (maxNo && maxNo.max_no) {
    const lastSeq = parseInt(maxNo.max_no.slice(-3), 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${seq.toString().padStart(3, '0')}`;
}

/**
 * GET /api/completion/labor-settlement
 * 获取劳务结算列表
 */
router.get('/labor-settlement', (req, res) => {
  try {
    const { status, projectId, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    // 构建查询条件
    let whereClause = '1=1';
    const params = [];

    if (status) {
      whereClause += ' AND cls.status = ?';
      params.push(status);
    }

    if (projectId) {
      whereClause += ' AND cls.project_id = ?';
      params.push(projectId);
    }

    if (keyword) {
      whereClause += ' AND (cls.settlement_no LIKE ? OR cls.worker_name LIKE ? OR p.name LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    // 查询总数
    const countSql = `
      SELECT COUNT(*) as total
      FROM completion_labor_settlements cls
      LEFT JOIN projects p ON cls.project_id = p.id
      WHERE ${whereClause}
    `;
    const countResult = db.prepare(countSql).get(...params);
    const total = countResult.total;

    // 查询列表
    const listSql = `
      SELECT 
        cls.*,
        p.name as project_name,
        p.project_no,
        p.status as project_status,
        creator.real_name as creator_name,
        approver.real_name as approver_name,
        payer.real_name as payer_name
      FROM completion_labor_settlements cls
      LEFT JOIN projects p ON cls.project_id = p.id
      LEFT JOIN users creator ON cls.creator_id = creator.id
      LEFT JOIN users approver ON cls.approver_id = approver.id
      LEFT JOIN users payer ON cls.paid_by = payer.id
      WHERE ${whereClause}
      ORDER BY cls.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(pageSize), offset);
    const list = db.prepare(listSql).all(...params);

    res.json({
      success: true,
      data: list,
      pagination: {
        current: parseInt(page),
        pageSize: parseInt(pageSize),
        total
      }
    });
  } catch (error) {
    console.error('获取劳务结算列表失败:', error);
    res.status(500).json({ success: false, message: '获取劳务结算列表失败', error: error.message });
  }
});

/**
 * GET /api/completion/labor-settlement/:id
 * 获取劳务结算详情
 */
router.get('/labor-settlement/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 查询结算详情
    const settlement = db.prepare(`
      SELECT 
        cls.*,
        p.name as project_name,
        p.project_no,
        p.status as project_status,
        p.contract_amount as project_contract_amount,
        creator.real_name as creator_name,
        approver.real_name as approver_name,
        payer.real_name as payer_name
      FROM completion_labor_settlements cls
      LEFT JOIN projects p ON cls.project_id = p.id
      LEFT JOIN users creator ON cls.creator_id = creator.id
      LEFT JOIN users approver ON cls.approver_id = approver.id
      LEFT JOIN users payer ON cls.paid_by = payer.id
      WHERE cls.id = ?
    `).get(id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: '结算记录不存在' });
    }

    // 查询审批记录
    const approvals = db.prepare(`
      SELECT 
        cla.*,
        approver.real_name as approver_name
      FROM completion_labor_settlement_approvals cla
      LEFT JOIN users approver ON cla.approver_id = approver.id
      WHERE cla.settlement_id = ?
      ORDER BY cla.step ASC
    `).all(id);

    // 查询项目已付款金额
    const paidAmount = db.prepare(`
      SELECT COALESCE(SUM(actual_amount), 0) as total_paid
      FROM completion_labor_settlements
      WHERE project_id = ? AND status = 'paid' AND id != ?
    `).get(settlement.project_id, id);

    settlement.approvals = approvals || [];
    settlement.projectPaidAmount = paidAmount.total_paid;

    res.json({
      success: true,
      data: settlement
    });
  } catch (error) {
    console.error('获取劳务结算详情失败:', error);
    res.status(500).json({ success: false, message: '获取劳务结算详情失败', error: error.message });
  }
});

/**
 * POST /api/completion/labor-settlement
 * 创建劳务结算
 */
router.post('/labor-settlement', (req, res) => {
  try {
    const {
      projectId,
      workerName,
      workType,
      workDays,
      dailyRate,
      deduction = 0,
      remark
    } = req.body;
    const userId = req.user.id;

    // 验证必填字段
    if (!projectId || !workerName || !workType || workDays === undefined || dailyRate === undefined) {
      return res.status(400).json({ success: false, message: '缺少必填字段' });
    }

    // 检查项目是否存在
    const project = db.prepare(`
      SELECT id, name, status FROM projects WHERE id = ?
    `).get(projectId);

    if (!project) {
      return res.status(400).json({ success: false, message: '项目不存在' });
    }

    // 计算金额
    const totalAmount = parseFloat(workDays) * parseFloat(dailyRate);
    const actualAmount = totalAmount - parseFloat(deduction);

    // 生成结算编号
    const settlementNo = generateSettlementNo();

    // 插入结算记录
    const result = db.prepare(`
      INSERT INTO completion_labor_settlements (
        settlement_no, project_id, worker_name, work_type,
        work_days, daily_rate, total_amount, deduction, actual_amount,
        status, remark, creator_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'), datetime('now'))
    `).run(
      settlementNo,
      projectId,
      workerName,
      workType,
      workDays,
      dailyRate,
      totalAmount,
      deduction,
      actualAmount,
      remark || '',
      userId
    );

    // 创建审批流程记录
    const steps = [
      { step: 1, stepName: '财务审批', role: 'FINANCE' },
      { step: 2, stepName: '总经理审批', role: 'GM' }
    ];

    steps.forEach(step => {
      db.prepare(`
        INSERT INTO completion_labor_settlement_approvals (
          settlement_id, step, step_name, role, action, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `).run(result.lastInsertRowid, step.step, step.stepName, step.role);
    });

    res.json({
      success: true,
      message: '创建劳务结算成功',
      data: {
        id: result.lastInsertRowid,
        settlementNo
      }
    });
  } catch (error) {
    console.error('创建劳务结算失败:', error);
    res.status(500).json({ success: false, message: '创建劳务结算失败', error: error.message });
  }
});

/**
 * PUT /api/completion/labor-settlement/:id
 * 更新劳务结算（仅待审批状态可修改）
 */
router.put('/labor-settlement/:id', (req, res) => {
  try {
    const { id } = req.params;
    const {
      workerName,
      workType,
      workDays,
      dailyRate,
      deduction,
      remark
    } = req.body;

    // 查询结算记录
    const settlement = db.prepare(`
      SELECT * FROM completion_labor_settlements WHERE id = ?
    `).get(id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: '结算记录不存在' });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({ success: false, message: '只有待审批状态的结算可以修改' });
    }

    // 重新计算金额
    const newWorkDays = workDays !== undefined ? workDays : settlement.work_days;
    const newDailyRate = dailyRate !== undefined ? dailyRate : settlement.daily_rate;
    const newDeduction = deduction !== undefined ? deduction : settlement.deduction;
    const totalAmount = parseFloat(newWorkDays) * parseFloat(newDailyRate);
    const actualAmount = totalAmount - parseFloat(newDeduction);

    // 更新记录
    db.prepare(`
      UPDATE completion_labor_settlements
      SET 
        worker_name = COALESCE(?, worker_name),
        work_type = COALESCE(?, work_type),
        work_days = COALESCE(?, work_days),
        daily_rate = COALESCE(?, daily_rate),
        total_amount = ?,
        deduction = ?,
        actual_amount = ?,
        remark = COALESCE(?, remark),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      workerName,
      workType,
      newWorkDays,
      newDailyRate,
      totalAmount,
      newDeduction,
      actualAmount,
      remark,
      id
    );

    res.json({
      success: true,
      message: '更新成功'
    });
  } catch (error) {
    console.error('更新劳务结算失败:', error);
    res.status(500).json({ success: false, message: '更新劳务结算失败', error: error.message });
  }
});

/**
 * DELETE /api/completion/labor-settlement/:id
 * 删除劳务结算（仅待审批或已驳回状态可删除）
 */
router.delete('/labor-settlement/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 查询结算记录
    const settlement = db.prepare(`
      SELECT * FROM completion_labor_settlements WHERE id = ?
    `).get(id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: '结算记录不存在' });
    }

    if (!['pending', 'rejected'].includes(settlement.status)) {
      return res.status(400).json({ success: false, message: '只有待审批或已驳回状态的结算可以删除' });
    }

    // 删除审批记录
    db.prepare(`
      DELETE FROM completion_labor_settlement_approvals WHERE settlement_id = ?
    `).run(id);

    // 删除结算记录
    db.prepare(`
      DELETE FROM completion_labor_settlements WHERE id = ?
    `).run(id);

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除劳务结算失败:', error);
    res.status(500).json({ success: false, message: '删除劳务结算失败', error: error.message });
  }
});

/**
 * POST /api/completion/labor-settlement/:id/approve
 * 审批劳务结算
 */
router.post('/labor-settlement/:id/approve', (req, res) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;
    const userId = req.user.id;

    // 验证参数
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '无效的审批动作' });
    }

    // 查询结算记录
    const settlement = db.prepare(`
      SELECT * FROM completion_labor_settlements WHERE id = ?
    `).get(id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: '结算记录不存在' });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({ success: false, message: '该结算已处理，无法重复审批' });
    }

    // 查询当前审批步骤
    const currentApproval = db.prepare(`
      SELECT * FROM completion_labor_settlement_approvals
      WHERE settlement_id = ? AND action = 'pending'
      ORDER BY step ASC
      LIMIT 1
    `).get(id);

    if (!currentApproval) {
      return res.status(400).json({ success: false, message: '没有待审批的步骤' });
    }

    // 更新审批记录
    db.prepare(`
      UPDATE completion_labor_settlement_approvals
      SET action = ?, approver_id = ?, comment = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(action, userId, comment || '', currentApproval.id);

    if (action === 'reject') {
      // 驳回：更新结算状态为已驳回
      db.prepare(`
        UPDATE completion_labor_settlements
        SET status = 'rejected', updated_at = datetime('now')
        WHERE id = ?
      `).run(id);

      res.json({
        success: true,
        message: '结算已驳回'
      });
    } else {
      // 通过：检查是否还有下一步审批
      const nextApproval = db.prepare(`
        SELECT * FROM completion_labor_settlement_approvals
        WHERE settlement_id = ? AND action = 'pending'
        ORDER BY step ASC
        LIMIT 1
      `).get(id);

      if (nextApproval) {
        // 还有下一步审批
        res.json({
          success: true,
          message: '审批通过，等待下一级审批'
        });
      } else {
        // 全部审批完成，更新结算状态为已审批
        db.prepare(`
          UPDATE completion_labor_settlements
          SET status = 'approved', approver_id = ?, approved_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(userId, id);

        res.json({
          success: true,
          message: '审批完成，可以进行支付'
        });
      }
    }
  } catch (error) {
    console.error('审批劳务结算失败:', error);
    res.status(500).json({ success: false, message: '审批劳务结算失败', error: error.message });
  }
});

/**
 * POST /api/completion/labor-settlement/:id/pay
 * 确认支付
 */
router.post('/labor-settlement/:id/pay', (req, res) => {
  try {
    const { id } = req.params;
    const { remark } = req.body;
    const userId = req.user.id;

    // 查询结算记录
    const settlement = db.prepare(`
      SELECT * FROM completion_labor_settlements WHERE id = ?
    `).get(id);

    if (!settlement) {
      return res.status(404).json({ success: false, message: '结算记录不存在' });
    }

    if (settlement.status !== 'approved') {
      return res.status(400).json({ success: false, message: '只有已审批的结算才能确认支付' });
    }

    if (settlement.status === 'paid') {
      return res.status(400).json({ success: false, message: '该结算已支付，请勿重复操作' });
    }

    // 更新结算状态为已支付
    db.prepare(`
      UPDATE completion_labor_settlements
      SET status = 'paid', paid_by = ?, paid_at = datetime('now'), 
          remark = COALESCE(remark || '
支付备注: ' || ?, ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(userId, remark, remark, id);

    res.json({
      success: true,
      message: '支付确认成功'
    });
  } catch (error) {
    console.error('确认支付失败:', error);
    res.status(500).json({ success: false, message: '确认支付失败', error: error.message });
  }
});

/**
 * GET /api/completion/labor-settlement/projects/completed
 * 获取已竣工项目列表（用于结算）
 */
router.get('/labor-settlement/projects/completed', (req, res) => {
  try {
    const { keyword } = req.query;

    let whereClause = "status IN ('completed', 'in_progress')";
    const params = [];

    if (keyword) {
      whereClause += ' AND (name LIKE ? OR project_no LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const projects = db.prepare(`
      SELECT id, project_no, name, contract_amount, status
      FROM projects
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT 100
    `).all(...params);

    res.json({
      success: true,
      data: projects
    });
  } catch (error) {
    console.error('获取项目列表失败:', error);
    res.status(500).json({ success: false, message: '获取项目列表失败', error: error.message });
  }
});

/**
 * GET /api/completion/labor-settlement/project/:projectId/stats
 * 获取项目结算统计
 */
router.get('/labor-settlement/project/:projectId/stats', (req, res) => {
  try {
    const { projectId } = req.params;

    // 查询项目信息
    const project = db.prepare(`
      SELECT id, name, contract_amount, status FROM projects WHERE id = ?
    `).get(projectId);

    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' });
    }

    // 查询项目结算统计
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(deduction), 0) as total_deduction,
        COALESCE(SUM(actual_amount), 0) as total_actual,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN actual_amount ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN actual_amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN actual_amount ELSE 0 END), 0) as pending_amount
      FROM completion_labor_settlements
      WHERE project_id = ?
    `).get(projectId);

    res.json({
      success: true,
      data: {
        project,
        ...stats
      }
    });
  } catch (error) {
    console.error('获取项目结算统计失败:', error);
    res.status(500).json({ success: false, message: '获取项目结算统计失败', error: error.message });
  }
});

/**
 * GET /api/completion/labor-settlement/pending-approvals
 * 获取待审批列表
 */
router.get('/labor-settlement/pending-approvals', (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let roleFilter = '';
    if (userRole === 'FINANCE') {
      roleFilter = "AND cla.role = 'FINANCE'";
    } else if (userRole === 'GM') {
      roleFilter = "AND cla.role = 'GM'";
    }

    const list = db.prepare(`
      SELECT 
        cls.*,
        p.name as project_name,
        p.project_no,
        creator.real_name as creator_name,
        cla.step_name,
        cla.role as approval_role
      FROM completion_labor_settlements cls
      LEFT JOIN projects p ON cls.project_id = p.id
      LEFT JOIN users creator ON cls.creator_id = creator.id
      INNER JOIN completion_labor_settlement_approvals cla ON cls.id = cla.settlement_id
      WHERE cls.status = 'pending' AND cla.action = 'pending' ${roleFilter}
      ORDER BY cls.created_at DESC
    `).all();

    res.json({
      success: true,
      data: list
    });
  } catch (error) {
    console.error('获取待审批列表失败:', error);
    res.status(500).json({ success: false, message: '获取待审批列表失败', error: error.message });
  }
});

/**
 * GET /api/completion/labor-settlement/statistics
 * 获取劳务结算统计概览
 */
router.get('/labor-settlement/statistics', (req, res) => {
  try {
    // 总体统计
    const overallStats = db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(actual_amount), 0) as actual_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN actual_amount ELSE 0 END), 0) as pending_amount,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN actual_amount ELSE 0 END), 0) as approved_amount,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN actual_amount ELSE 0 END), 0) as paid_amount,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count
      FROM completion_labor_settlements
    `).get();

    res.json({
      success: true,
      data: overallStats
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ success: false, message: '获取统计数据失败', error: error.message });
  }
});

// ========================================
// 辅助函数
// ========================================

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取缩略图URL
 * 对于图片文件，返回实际文件路径（前端可用作缩略图）
 * 对于PDF文件，返回通用图标
 */
function getThumbnailUrl(filePath) {
  if (!filePath) return null;
  
  const ext = path.extname(filePath).toLowerCase();
  
  if (['.jpg', '.jpeg', '.png'].includes(ext)) {
    // 图片文件可以生成缩略图URL
    // 这里返回相对路径，前端需要加上 /uploads 前缀
    return filePath.replace(/\\/g, '/').split('/uploads/')[1] || filePath;
  } else if (ext === '.pdf') {
    // PDF 文件使用通用图标
    return '/icons/pdf-icon.png';
  }
  
  return null;
}

module.exports = router;
