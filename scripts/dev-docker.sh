#!/bin/bash
# Dev server management script using Docker Compose
#
# All services run in Docker containers:
#   - Python Sandbox: Secure eval execution
#   - Backend: Cloudflare Workers via Wrangler
#   - Frontend: Next.js
#
# REQUIRED: Add CLOUDFLARE_API_TOKEN to .dev.vars

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"

usage() {
    echo "Usage: $0 {start|stop|restart|logs|status|clean|rebuild}"
    echo ""
    echo "Commands:"
    echo "  start    - Start all dev servers in background"
    echo "  stop     - Stop all dev servers"
    echo "  restart  - Restart all dev servers"
    echo "  logs     - Follow logs from all services"
    echo "  logs:be  - Follow backend logs only"
    echo "  logs:fe  - Follow frontend logs only"
    echo "  logs:py  - Follow Python sandbox logs only"
    echo "  status   - Show container status"
    echo "  clean    - Stop and remove volumes (fixes cache corruption)"
    echo "  rebuild  - Clean rebuild (removes node_modules volumes)"
    exit 1
}

case "${1:-}" in
    start)
        echo "Starting dev servers..."
        docker compose -f "$COMPOSE_FILE" up -d
        echo ""
        echo "Services:"
        echo "  Backend:        http://localhost:8787"
        echo "  Frontend:       http://localhost:3000"
        echo "  Python Sandbox: http://localhost:9999"
        echo ""
        echo "Run '$0 logs' to follow logs"
        ;;
    stop)
        echo "Stopping dev servers..."
        docker compose -f "$COMPOSE_FILE" down
        ;;
    restart)
        echo "Restarting dev servers..."
        docker compose -f "$COMPOSE_FILE" restart
        ;;
    logs)
        docker compose -f "$COMPOSE_FILE" logs -f
        ;;
    logs:be)
        docker compose -f "$COMPOSE_FILE" logs -f backend
        ;;
    logs:fe)
        docker compose -f "$COMPOSE_FILE" logs -f frontend
        ;;
    logs:py)
        docker compose -f "$COMPOSE_FILE" logs -f python-sandbox
        ;;
    status)
        docker compose -f "$COMPOSE_FILE" ps
        ;;
    clean)
        echo "Stopping and cleaning up (removes .next cache)..."
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
        echo "Cleaned. Run '$0 start' to restart fresh."
        ;;
    rebuild)
        echo "Full rebuild (removes node_modules and caches)..."
        docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
        docker volume rm -f iofold_backend_node_modules iofold_frontend_node_modules iofold_frontend_next_cache iofold_backend_wrangler 2>/dev/null || true
        echo "Volumes removed. Run '$0 start' to rebuild from scratch."
        ;;
    *)
        usage
        ;;
esac
