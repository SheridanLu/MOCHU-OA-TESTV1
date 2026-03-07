/**
 * 收入对账单定时任务
 * Task 45: 每月25日自动生成对账单
 */

const cron = require('node-cron');
const incomeStatementService = require('./incomeStatementService');

let scheduledTask = null;

/**
 * 启动定时任务
 * 每月25日上午9点执行
 */
function startScheduler() {
  if (scheduledTask) {
    console.log('收入对账单定时任务已在运行中');
    return;
  }

  // 每月25日上午9点执行
  // cron 格式: 秒 分 时 日 月 星期
  scheduledTask = cron.schedule('0 9 25 * *', async () => {
    console.log('开始执行收入对账单自动生成任务...');
    
    try {
      const result = incomeStatementService.autoGenerateForAllProjects();
      console.log(`收入对账单自动生成完成: 成功 ${result.success} 个, 失败 ${result.failed} 个`);
      
      if (result.projects.length > 0) {
        result.projects.forEach(p => {
          if (p.status === 'success') {
            console.log(`  ✓ ${p.projectName} (${p.statementNo})`);
          } else {
            console.log(`  ✗ ${p.projectName}: ${p.error}`);
          }
        });
      }
    } catch (error) {
      console.error('收入对账单自动生成失败:', error);
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai'
  });

  console.log('收入对账单定时任务已启动（每月25日上午9点执行）');
}

/**
 * 停止定时任务
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('收入对账单定时任务已停止');
  }
}

/**
 * 获取定时任务状态
 */
function getSchedulerStatus() {
  return {
    running: scheduledTask !== null,
    schedule: '每月25日上午9点'
  };
}

/**
 * 手动触发一次对账单生成（用于测试）
 */
function triggerManually() {
  console.log('手动触发收入对账单生成...');
  return incomeStatementService.autoGenerateForAllProjects();
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerManually
};
