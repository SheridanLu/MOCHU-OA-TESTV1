#!/bin/bash
# GLM Agent 任务运行脚本
# 用法: ./run_glm_agent.sh <任务编号>

TASK_NUM=$1

if [ -z "$TASK_NUM" ]; then
    echo "❌ 请提供任务编号"
    echo "用法: ./run_glm_agent.sh <1-22>"
    echo ""
    echo "任务列表:"
    cat task.json | grep -E '"id"|"title"' | paste - - | sed 's/[{},"]//g' | awk '{print "  Task " $2 ": " $4}'
    exit 1
fi

echo "🦞 启动 GLM Agent 执行任务 $TASK_NUM..."
echo "======================================"

# 这里是占位符，实际的 Agent 执行需要通过 OpenClaw 的 sessions_spawn 来完成
echo "⚠️  此脚本为辅助脚本，实际任务执行应通过主 Agent 来完成"
echo ""
echo "当前任务信息:"
cat task.json | jq ".tasks[$((TASK_NUM-1))]" 2>/dev/null || echo "任务 $TASK_NUM 不存在或 jq 未安装"
