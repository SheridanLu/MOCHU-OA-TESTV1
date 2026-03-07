/**
 * 企业邮箱路由
 * 提供邮箱检查、生成和更新的API接口
 */

const express = require('express');
const { db } = require('../models/database');
const { authMiddleware } = require('../middleware/authMiddleware');
const emailService = require('../services/email');

const router = express.Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * GET /api/email/check/:email
 * 检查邮箱是否已存在
 * Params: email - 要检查的邮箱地址
 */
router.get('/check/:email', (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: '邮箱地址不能为空'
      });
    }

    // 验证邮箱格式
    if (!emailService.validateEmailFormat(email)) {
      return res.status(400).json({
        success: false,
        message: '邮箱格式不正确',
        data: {
          email,
          valid: false
        }
      });
    }

    // 检查邮箱是否存在
    const { exists, user } = emailService.checkEmailExists(email);

    res.json({
      success: true,
      data: {
        email: email.trim().toLowerCase(),
        exists,
        valid: true,
        usedBy: exists ? {
          id: user.id,
          username: user.username,
          real_name: user.real_name
        } : null
      }
    });
  } catch (error) {
    console.error('检查邮箱失败:', error);
    res.status(500).json({
      success: false,
      message: '检查邮箱失败'
    });
  }
});

/**
 * POST /api/email/generate
 * 为用户生成企业邮箱
 * Body: { userId: number, username?: string }
 */
router.post('/generate', (req, res) => {
  try {
    const { userId, username } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '用户ID不能为空'
      });
    }

    // 获取用户信息
    const user = db.prepare('SELECT id, username, real_name FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 使用传入的用户名或用户的实际用户名
    const useUsername = username || user.username;

    // 生成企业邮箱
    const result = emailService.createCompanyEmail(userId, useUsername);

    if (result.success) {
      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          userId,
          username: user.username,
          real_name: user.real_name,
          email: result.email
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('生成邮箱失败:', error);
    res.status(500).json({
      success: false,
      message: `生成邮箱失败: ${error.message}`
    });
  }
});

/**
 * PUT /api/email/update/:userId
 * 更新用户的企业邮箱
 * Body: { email?: string }
 * 如果不提供 email，则根据用户名重新生成
 */
router.put('/update/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { email } = req.body;

    // 获取用户信息
    const user = db.prepare('SELECT id, username, real_name, company_email FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 更新企业邮箱
    const result = emailService.updateCompanyEmail(parseInt(userId), email);

    if (result.success) {
      // 获取更新后的用户信息
      const updatedUser = db.prepare(`
        SELECT 
          id, username, real_name, 
          company_email, email_enabled,
          updated_at
        FROM users 
        WHERE id = ?
      `).get(userId);

      res.json({
        success: true,
        message: result.message,
        data: updatedUser
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('更新邮箱失败:', error);
    res.status(500).json({
      success: false,
      message: `更新邮箱失败: ${error.message}`
    });
  }
});

/**
 * PUT /api/email/toggle/:userId
 * 启用/禁用用户的企业邮箱
 * Body: { enabled: boolean }
 */
router.put('/toggle/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled 参数必须为布尔值'
      });
    }

    const result = emailService.setEmailEnabled(parseInt(userId), enabled);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: {
          userId: parseInt(userId),
          enabled
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('切换邮箱状态失败:', error);
    res.status(500).json({
      success: false,
      message: `切换邮箱状态失败: ${error.message}`
    });
  }
});

/**
 * POST /api/email/preview
 * 预览邮箱生成结果（不实际创建）
 * Body: { username: string }
 */
router.post('/preview', (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({
        success: false,
        message: '用户名不能为空'
      });
    }

    try {
      const { email, baseUsername, suffix } = emailService.generateUniqueEmail(username);

      res.json({
        success: true,
        data: {
          username,
          suggestedEmail: email,
          baseUsername,
          suffix,
          domain: emailService.getEmailDomain(),
          available: true
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
        data: {
          username,
          available: false
        }
      });
    }
  } catch (error) {
    console.error('预览邮箱失败:', error);
    res.status(500).json({
      success: false,
      message: '预览邮箱失败'
    });
  }
});

/**
 * GET /api/email/stats
 * 获取企业邮箱统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const result = emailService.getEmailStats();

    if (result.success) {
      res.json({
        success: true,
        data: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    console.error('获取邮箱统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取邮箱统计失败'
    });
  }
});

/**
 * POST /api/email/batch
 * 批量为没有企业邮箱的用户生成邮箱
 */
router.post('/batch', (req, res) => {
  try {
    const result = emailService.batchGenerateEmails();

    res.json({
      success: result.success,
      message: result.success 
        ? `批量生成完成: 成功 ${result.processed} 个, 失败 ${result.failed} 个`
        : result.message,
      data: {
        total: result.total,
        processed: result.processed,
        failed: result.failed,
        details: result.details
      }
    });
  } catch (error) {
    console.error('批量生成邮箱失败:', error);
    res.status(500).json({
      success: false,
      message: '批量生成邮箱失败'
    });
  }
});

/**
 * GET /api/email/domain
 * 获取当前配置的邮箱域名
 */
router.get('/domain', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        domain: emailService.getEmailDomain()
      }
    });
  } catch (error) {
    console.error('获取邮箱域名失败:', error);
    res.status(500).json({
      success: false,
      message: '获取邮箱域名失败'
    });
  }
});

module.exports = router;
