#!/bin/bash

# iofold Development Server Starter
# Starts both backend and frontend on consistent ports

set -e

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting iofold Development Servers${NC}"
echo ""

# Check if ports are in use
check_port() {
    local port=$1
    local name=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: Port $port is already in use by $name${NC}"
        echo "   Run: lsof -ti:$port | xargs kill -9"
        return 1
    fi
    return 0
}

# Kill any existing dev servers
echo -e "${YELLOW}Checking for existing dev servers...${NC}"
pkill -f "wrangler dev" 2>/dev/null && echo "  Killed existing wrangler" || true
pkill -f "next dev" 2>/dev/null && echo "  Killed existing next" || true
sleep 1

# Check ports
echo ""
echo -e "${YELLOW}Checking ports...${NC}"
BACKEND_PORT=8787
FRONTEND_PORT=3000

check_port $BACKEND_PORT "backend"
check_port $FRONTEND_PORT "frontend"

echo ""
echo -e "${GREEN}✅ Ports available${NC}"
echo ""

# Start backend
echo -e "${GREEN}🔧 Starting backend (Wrangler) on port $BACKEND_PORT...${NC}"
cd "$(dirname "$0")"
pnpm run dev > /tmp/iofold-backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
echo "   Logs: tail -f /tmp/iofold-backend.log"

# Wait for backend to start
sleep 3

# Start frontend
echo ""
echo -e "${GREEN}🎨 Starting frontend (Next.js) on port $FRONTEND_PORT...${NC}"
cd frontend
pnpm run dev > /tmp/iofold-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
echo "   Logs: tail -f /tmp/iofold-frontend.log"

# Wait for frontend to start
sleep 3

echo ""
echo -e "${GREEN}✨ Development servers started!${NC}"
echo ""
echo "📍 Backend API:  http://localhost:$BACKEND_PORT"
echo "📍 Frontend UI:  http://localhost:$FRONTEND_PORT"
echo ""
echo "📋 Process IDs:"
echo "   Backend:  $BACKEND_PID"
echo "   Frontend: $FRONTEND_PID"
echo ""
echo "🛑 To stop servers:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
echo "   or: pkill -f 'wrangler dev' && pkill -f 'next dev'"
echo ""
echo "📝 View logs:"
echo "   Backend:  tail -f /tmp/iofold-backend.log"
echo "   Frontend: tail -f /tmp/iofold-frontend.log"
