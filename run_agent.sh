#!/bin/bash

# run_agent.sh - MOCHU-OA 自动化开发流程脚本
# 用法: bash run_agent.sh <次数>
# 示例: bash run_agent.sh 3  (运行3次开发流程)

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 获取参数
RUN_COUNT=${1:-1}

# 验证参数
if ! [[ "$RUN_COUNT" =~ ^[0-9]+$ ]] || [ "$RUN_COUNT" -lt 1 ]; then
    echo -e "${RED}错误: 请提供有效的运行次数（正整数）${NC}"
    echo "用法: bash run_agent.sh <次数>"
    echo "示例: bash run_agent.sh 3"
    exit 1
fi

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 日志文件
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MAIN_LOG="$LOG_DIR/agent_${TIMESTAMP}.log"

# 日志函数
log() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "[${timestamp}] [${level}] ${message}" | tee -a "$MAIN_LOG"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }
log_success() { log "SUCCESS" "$1"; }

# 分隔线
separator() {
    echo "==================================================" | tee -a "$MAIN_LOG"
}

# 获取当前待处理任务数
get_pending_count() {
    if [ -f "task.json" ]; then
        grep -o '"status": "pending"' task.json | wc -l
    else
        echo 0
    fi
}

# 检查是否有待处理任务
has_pending_task() {
    local count=$(get_pending_count)
    [ "$count" -gt 0 ]
}

# 运行单次开发流程
run_single_iteration() {
    local iteration=$1
    local total=$2
    
    echo "" | tee -a "$MAIN_LOG"
    separator
    log_info "${CYAN}开始第 ${iteration}/${total} 次开发流程${NC}"
    separator
    echo "" | tee -a "$MAIN_LOG"
    
    # 检查是否还有待处理任务
    local pending_before=$(get_pending_count)
    log_info "当前待处理任务数: ${pending_before}"
    
    if [ "$pending_before" -eq 0 ]; then
        log_warn "没有待处理的任务，跳过本次运行"
        return 0
    fi
    
    # 读取当前任务信息
    local current_task=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('task.json', 'utf8'));
        const pending = data.tasks.find(t => t.status === 'pending');
        if (pending) {
            console.log('Task #' + pending.id + ': ' + pending.title);
        } else {
            console.log('No pending tasks');
        }
    " 2>/dev/null || echo "无法读取任务")
    log_info "下一个任务: ${current_task}"
    
    # 构建发送给 GLM 的 prompt
    local PROMPT="你是一个软件开发助手。请按照以下步骤工作：

1. 读取 task.json 文件，找到第一个 status 为 'pending' 的任务
2. 将该任务的 status 改为 'in_progress'，设置 assigned 为你的名字，started_at 为当前时间
3. 按照 CLAUDE.md 中的指南开发实现
4. 完成后测试验证功能
5. 更新 task.json 将任务 status 改为 'completed'，填写 completed_at
6. 更新 progress.txt 记录工作日志
7. 使用 git add . && git commit -m 'feat: 任务标题 (#task-id)' && git push 提交代码

重要规则：
- 一次只做一个任务
- 遇到问题及时更新 task.json 的 error 字段并报告
- 保持代码在可运行状态

开始工作！"

    log_info "调用 GLM 进行开发..."
    log_info "Prompt 长度: ${#PROMPT} 字符"
    
    # 记录开始时间
    local start_time=$(date +%s)
    
    # 调用 GLM (这里需要根据实际的 GLM 调用方式调整)
    # 假设使用 openclaw 的 sessions_spawn 功能
    # 如果直接在当前环境运行，可以简化为：
    
    # 方式1: 如果有 openclaw CLI
    if command -v openclaw &> /dev/null; then
        log_info "使用 openclaw CLI 调用..."
        # openclaw agent run --prompt "$PROMPT" --auto-approve 2>&1 | tee -a "$MAIN_LOG"
        log_warn "openclaw CLI 调用方式待配置"
        RESULT="待实现"
    
    # 方式2: 如果有其他 AI CLI 工具
    elif command -v claude &> /dev/null; then
        log_info "使用 claude CLI 调用..."
        # RESULT=$(claude --dangerously-skip-permissions --print "$PROMPT" 2>&1 | tee -a "$MAIN_LOG")
        log_warn "claude CLI 调用方式待配置"
        RESULT="待实现"
    
    # 方式3: 模拟运行（测试用）
    else
        log_warn "未检测到 AI CLI 工具，模拟运行..."
        RESULT="模拟完成"
        
        # 模拟：标记第一个任务为已完成
        node -e "
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync('task.json', 'utf8'));
            const task = data.tasks.find(t => t.status === 'pending');
            if (task) {
                task.status = 'completed';
                task.assigned = 'simulated-agent';
                task.started_at = new Date().toISOString();
                task.completed_at = new Date().toISOString();
                data.statistics.pending--;
                data.statistics.completed++;
                fs.writeFileSync('task.json', JSON.stringify(data, null, 2));
                console.log('模拟完成任务 #' + task.id + ': ' + task.title);
            }
        " 2>&1 | tee -a "$MAIN_LOG"
    fi
    
    # 记录结束时间
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # 检查任务状态变化
    local pending_after=$(get_pending_count)
    local completed=$((pending_before - pending_after))
    
    echo "" | tee -a "$MAIN_LOG"
    if [ "$completed" -gt 0 ]; then
        log_success "${GREEN}✓ 完成了 ${completed} 个任务${NC}"
    else
        log_warn "${YELLOW}⚠ 本次运行未完成任务${NC}"
    fi
    
    log_info "本次耗时: ${duration} 秒"
    log_info "剩余待处理任务: ${pending_after}"
    
    # 如果任务失败，等待一下再继续
    if [ "$completed" -eq 0 ] && [ "$pending_before" -gt 0 ]; then
        log_warn "任务可能遇到问题，等待 5 秒后继续..."
        sleep 5
    fi
    
    return 0
}

# 主流程
main() {
    echo "" | tee -a "$MAIN_LOG"
    separator
    log_info "${PURPLE}MOCHU-OA 自动化开发流程${NC}"
    log_info "运行次数: ${RUN_COUNT}"
    log_info "日志文件: ${MAIN_LOG}"
    separator
    
    # 初始化环境
    if [ ! -f ".initialized" ]; then
        log_info "首次运行，执行环境初始化..."
        bash init.sh 2>&1 | tee -a "$MAIN_LOG"
        touch .initialized
    fi
    
    # 循环运行
    local completed_total=0
    for i in $(seq 1 $RUN_COUNT); do
        # 检查是否还有任务
        if ! has_pending_task; then
            log_info "${GREEN}所有任务已完成！${NC}"
            break
        fi
        
        run_single_iteration $i $RUN_COUNT
        
        # 更新统计
        local pending_now=$(get_pending_count)
        if [ $i -lt $RUN_COUNT ] && [ "$pending_now" -gt 0 ]; then
            log_info "等待 3 秒后继续下一次运行..."
            sleep 3
        fi
    done
    
    # 最终统计
    echo "" | tee -a "$MAIN_LOG"
    separator
    log_info "${PURPLE}运行完成！${NC}"
    separator
    
    local final_pending=$(get_pending_count)
    local total_tasks=$(node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync('task.json', 'utf8'));
        console.log(data.statistics.total);
    " 2>/dev/null || echo "未知")
    local completed_tasks=$((total_tasks - final_pending))
    
    echo "" | tee -a "$MAIN_LOG"
    log_info "任务统计:"
    log_info "  - 总任务数: ${total_tasks}"
    log_info "  - 已完成: ${completed_tasks}"
    log_info "  - 待处理: ${final_pending}"
    log_info "  - 完成率: $((completed_tasks * 100 / total_tasks))%"
    echo ""
    log_info "日志文件: ${MAIN_LOG}"
}

# 执行主流程
main
