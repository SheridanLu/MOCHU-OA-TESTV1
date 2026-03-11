#!/bin/bash

# init.sh - MOCHU-OA 项目环境初始化脚本
# 用法: bash init.sh

set -e

echo "========================================"
echo "  MOCHU-OA 项目环境初始化"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${YELLOW}[1/6] 检查环境...${NC}"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}错误: 未安装 Node.js${NC}"
    exit 1
fi
echo -e "  Node.js: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}错误: 未安装 npm${NC}"
    exit 1
fi
echo -e "  npm: $(npm -v)"

# 检查 Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}错误: 未安装 Git${NC}"
    exit 1
fi
echo -e "  Git: $(git --version | cut -d' ' -f3)"

echo ""
echo -e "${YELLOW}[2/6] 安装后端依赖...${NC}"
cd backend
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}  ✓ 后端依赖安装完成${NC}"
else
    echo -e "${GREEN}  ✓ 后端依赖已存在${NC}"
fi
cd ..

echo ""
echo -e "${YELLOW}[3/6] 安装前端依赖...${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}  ✓ 前端依赖安装完成${NC}"
else
    echo -e "${GREEN}  ✓ 前端依赖已存在${NC}"
fi
cd ..

echo ""
echo -e "${YELLOW}[4/6] 检查数据库...${NC}"
if [ -f "backend/database.db" ]; then
    echo -e "${GREEN}  ✓ 数据库已存在${NC}"
else
    echo -e "${YELLOW}  ! 数据库不存在，将在首次启动时创建${NC}"
fi

echo ""
echo -e "${YELLOW}[5/6] 构建前端...${NC}"
cd frontend
if [ ! -d "dist" ]; then
    npm run build
    echo -e "${GREEN}  ✓ 前端构建完成${NC}"
else
    echo -e "${GREEN}  ✓ 前端已构建${NC}"
fi
cd ..

echo ""
echo -e "${YELLOW}[6/6] 检查 PM2...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}  ✓ PM2 已安装${NC}"
    pm2 list
else
    echo -e "${YELLOW}  ! PM2 未安装，使用 nohup 运行${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}  环境初始化完成！${NC}"
echo "========================================"
echo ""
echo "下一步:"
echo "  1. 查看任务列表: cat task.json"
echo "  2. 启动服务: pm2 start backend/server.js --name oa-server"
echo "  3. 访问: http://localhost:3001"
echo "  4. 自动运行: bash run_agent.sh 3"
echo ""
