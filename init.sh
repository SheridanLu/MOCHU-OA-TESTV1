#!/bin/bash
# OA-MOCHU 项目初始化脚本

cd /root/.openclaw/workspace/oa-workspace/OA-MOCHU-reset

echo "🦞 初始化 OA-MOCHU 项目..."

# 创建目录结构
mkdir -p frontend backend

echo "✅ 目录结构创建完成"
echo "📁 项目位置: $(pwd)"
echo ""
echo "接下来请运行: ./run_glm_agent.sh 1"
