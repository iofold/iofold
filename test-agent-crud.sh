#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8787"
WORKSPACE_ID="workspace_default"

echo "======================================"
echo "Agent CRUD API Test Suite"
echo "======================================"
echo ""

# Test 1: Create Agent
echo "TEST 1: Create Agent"
echo "======================================"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST ${BASE_URL}/api/agents \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: ${WORKSPACE_ID}" \
  -d '{"name": "Test Agent CRUD", "description": "Testing CRUD operations"}')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request:"
echo "  POST ${BASE_URL}/api/agents"
echo "  Headers: Content-Type: application/json, X-Workspace-Id: ${WORKSPACE_ID}"
echo "  Body: {\"name\": \"Test Agent CRUD\", \"description\": \"Testing CRUD operations\"}"
echo ""
echo "Response:"
echo "  Status: ${HTTP_STATUS}"
echo "  Body: ${BODY}"
echo ""

if [ "$HTTP_STATUS" -eq 201 ]; then
  AGENT_ID=$(echo "$BODY" | grep -o '"id":"agent_[^"]*"' | cut -d'"' -f4)
  STATUS_VALUE=$(echo "$BODY" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  if [ ! -z "$AGENT_ID" ] && [[ "$AGENT_ID" == agent_* ]]; then
    if [ "$STATUS_VALUE" == "confirmed" ]; then
      echo -e "${GREEN}✓ PASS${NC} - Agent created successfully with ID: ${AGENT_ID} and status: ${STATUS_VALUE}"
    else
      echo -e "${RED}✗ FAIL${NC} - Status is not 'confirmed': ${STATUS_VALUE}"
    fi
  else
    echo -e "${RED}✗ FAIL${NC} - Agent ID not found or doesn't start with 'agent_'"
  fi
else
  echo -e "${RED}✗ FAIL${NC} - Expected 201, got ${HTTP_STATUS}"
  exit 1
fi

echo ""
echo ""

# Test 2: List Agents
echo "TEST 2: List Agents"
echo "======================================"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET ${BASE_URL}/api/agents \
  -H "X-Workspace-Id: ${WORKSPACE_ID}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request:"
echo "  GET ${BASE_URL}/api/agents"
echo "  Headers: X-Workspace-Id: ${WORKSPACE_ID}"
echo ""
echo "Response:"
echo "  Status: ${HTTP_STATUS}"
echo "  Body: ${BODY}"
echo ""

if [ "$HTTP_STATUS" -eq 200 ]; then
  if echo "$BODY" | grep -q "\"agents\""; then
    if echo "$BODY" | grep -q "${AGENT_ID}"; then
      echo -e "${GREEN}✓ PASS${NC} - Agent list contains created agent"
    else
      echo -e "${YELLOW}⚠ WARNING${NC} - Agent not found in list (might be timing issue)"
    fi
  else
    echo -e "${RED}✗ FAIL${NC} - Response doesn't contain 'agents' array"
  fi
else
  echo -e "${RED}✗ FAIL${NC} - Expected 200, got ${HTTP_STATUS}"
fi

echo ""
echo ""

# Test 3: Get Agent Details
echo "TEST 3: Get Agent Details"
echo "======================================"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET ${BASE_URL}/api/agents/${AGENT_ID} \
  -H "X-Workspace-Id: ${WORKSPACE_ID}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request:"
echo "  GET ${BASE_URL}/api/agents/${AGENT_ID}"
echo "  Headers: X-Workspace-Id: ${WORKSPACE_ID}"
echo ""
echo "Response:"
echo "  Status: ${HTTP_STATUS}"
echo "  Body: ${BODY}"
echo ""

if [ "$HTTP_STATUS" -eq 200 ]; then
  CHECKS_PASSED=true

  if ! echo "$BODY" | grep -q "\"id\""; then
    echo -e "${RED}✗ FAIL${NC} - Missing 'id' field"
    CHECKS_PASSED=false
  fi

  if ! echo "$BODY" | grep -q "\"name\""; then
    echo -e "${RED}✗ FAIL${NC} - Missing 'name' field"
    CHECKS_PASSED=false
  fi

  if ! echo "$BODY" | grep -q "\"versions\""; then
    echo -e "${RED}✗ FAIL${NC} - Missing 'versions' field"
    CHECKS_PASSED=false
  fi

  if ! echo "$BODY" | grep -q "\"metrics\""; then
    echo -e "${RED}✗ FAIL${NC} - Missing 'metrics' field"
    CHECKS_PASSED=false
  fi

  if [ "$CHECKS_PASSED" = true ]; then
    echo -e "${GREEN}✓ PASS${NC} - All required fields present"
  fi
else
  echo -e "${RED}✗ FAIL${NC} - Expected 200, got ${HTTP_STATUS}"
fi

echo ""
echo ""

# Test 4: Delete Agent (Archive)
echo "TEST 4: Delete Agent (Archive)"
echo "======================================"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X DELETE ${BASE_URL}/api/agents/${AGENT_ID} \
  -H "X-Workspace-Id: ${WORKSPACE_ID}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request:"
echo "  DELETE ${BASE_URL}/api/agents/${AGENT_ID}"
echo "  Headers: X-Workspace-Id: ${WORKSPACE_ID}"
echo ""
echo "Response:"
echo "  Status: ${HTTP_STATUS}"
echo "  Body: ${BODY}"
echo ""

if [ "$HTTP_STATUS" -eq 204 ]; then
  echo -e "${GREEN}✓ PASS${NC} - Agent deleted successfully (204 No Content)"
else
  echo -e "${RED}✗ FAIL${NC} - Expected 204, got ${HTTP_STATUS}"
fi

echo ""
echo ""

# Test 5: Verify Archived
echo "TEST 5: Verify Agent is Archived"
echo "======================================"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X GET ${BASE_URL}/api/agents/${AGENT_ID} \
  -H "X-Workspace-Id: ${WORKSPACE_ID}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Request:"
echo "  GET ${BASE_URL}/api/agents/${AGENT_ID}"
echo "  Headers: X-Workspace-Id: ${WORKSPACE_ID}"
echo ""
echo "Response:"
echo "  Status: ${HTTP_STATUS}"
echo "  Body: ${BODY}"
echo ""

if [ "$HTTP_STATUS" -eq 200 ]; then
  STATUS_VALUE=$(echo "$BODY" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  if [ "$STATUS_VALUE" == "archived" ]; then
    echo -e "${GREEN}✓ PASS${NC} - Agent status is 'archived'"
  else
    echo -e "${RED}✗ FAIL${NC} - Expected status 'archived', got '${STATUS_VALUE}'"
  fi
else
  echo -e "${RED}✗ FAIL${NC} - Expected 200, got ${HTTP_STATUS}"
fi

echo ""
echo ""
echo "======================================"
echo "Test Suite Complete"
echo "======================================"
