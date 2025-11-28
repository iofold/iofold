#!/bin/bash

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

API_BASE="http://localhost:8787"
WORKSPACE="workspace_default"
TEST_RESULTS=()

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}============================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================================${NC}\n"
}

# Function to print test result
print_result() {
    local test_num=$1
    local test_name=$2
    local expected=$3
    local actual=$4
    local status=$5

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}[PASS]${NC} Test $test_num: $test_name"
        TEST_RESULTS+=("PASS")
    else
        echo -e "${RED}[FAIL]${NC} Test $test_num: $test_name"
        TEST_RESULTS+=("FAIL")
    fi
    echo -e "  Expected: $expected"
    echo -e "  Actual: $actual"
    echo ""
}

# Function to extract HTTP status code
extract_status() {
    echo "$1" | tail -n1
}

# Function to extract response body
extract_body() {
    echo "$1" | sed '$d'
}

print_header "AGENT API EDGE CASE TESTING"
echo "Testing against: $API_BASE"
echo "Workspace: $WORKSPACE"

# ==============================================================================
# TEST 1: Missing Workspace Header
# ==============================================================================
print_header "TEST 1: Missing Workspace Header"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/agents" 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: GET /api/agents (no X-Workspace-Id header)"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "Missing X-Workspace-Id header"; then
    print_result "1" "Missing Workspace Header" "400 + Missing header error" "Got $STATUS + correct message" "PASS"
else
    print_result "1" "Missing Workspace Header" "400 + Missing header error" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 2: Create Agent with Empty Name
# ==============================================================================
print_header "TEST 2: Create Agent with Empty Name"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d '{"name": "", "description": "Test"}' 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: POST /api/agents with empty name"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "name is required"; then
    print_result "2" "Create Agent with Empty Name" "400 + validation error" "Got $STATUS + correct message" "PASS"
else
    print_result "2" "Create Agent with Empty Name" "400 + validation error" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 3: Create Agent with Missing Name
# ==============================================================================
print_header "TEST 3: Create Agent with Missing Name"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d '{"description": "No name provided"}' 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: POST /api/agents with no name field"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "name is required"; then
    print_result "3" "Create Agent with Missing Name" "400 + validation error" "Got $STATUS + correct message" "PASS"
else
    print_result "3" "Create Agent with Missing Name" "400 + validation error" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 4: Duplicate Agent Name
# ==============================================================================
print_header "TEST 4: Duplicate Agent Name"
UNIQUE_NAME="EdgeTest_Agent_$(date +%s)"

# First, create an agent
echo "Creating first agent with name: $UNIQUE_NAME"
RESPONSE1=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d "{\"name\": \"$UNIQUE_NAME\", \"description\": \"First agent\"}" 2>&1)
STATUS1=$(extract_status "$RESPONSE1")
BODY1=$(extract_body "$RESPONSE1")
echo "First creation status: $STATUS1"
echo "First creation body: $BODY1"

# Try to create another with the same name
echo -e "\nTrying to create duplicate agent..."
RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d "{\"name\": \"$UNIQUE_NAME\", \"description\": \"Second agent\"}" 2>&1)
STATUS2=$(extract_status "$RESPONSE2")
BODY2=$(extract_body "$RESPONSE2")
echo "Duplicate creation status: $STATUS2"
echo "Duplicate creation body: $BODY2"

if [ "$STATUS2" = "409" ] && echo "$BODY2" | grep -q "ALREADY_EXISTS"; then
    print_result "4" "Duplicate Agent Name" "409 ALREADY_EXISTS" "Got $STATUS2 + ALREADY_EXISTS" "PASS"
else
    print_result "4" "Duplicate Agent Name" "409 ALREADY_EXISTS" "Got $STATUS2" "FAIL"
fi

# ==============================================================================
# TEST 5: Get Non-existent Agent
# ==============================================================================
print_header "TEST 5: Get Non-existent Agent"
RESPONSE=$(curl -s -w "\n%{http_code}" "$API_BASE/api/agents/agent_nonexistent123" \
  -H "X-Workspace-Id: $WORKSPACE" 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: GET /api/agents/agent_nonexistent123"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "404" ] && echo "$BODY" | grep -q "NOT_FOUND"; then
    print_result "5" "Get Non-existent Agent" "404 NOT_FOUND" "Got $STATUS + NOT_FOUND" "PASS"
else
    print_result "5" "Get Non-existent Agent" "404 NOT_FOUND" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 6: Create Version for Non-existent Agent
# ==============================================================================
print_header "TEST 6: Create Version for Non-existent Agent"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents/agent_nonexistent123/versions" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d '{"prompt_template": "Test prompt", "variables": {}}' 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: POST /api/agents/agent_nonexistent123/versions"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "404" ] && echo "$BODY" | grep -q "NOT_FOUND"; then
    print_result "6" "Create Version for Non-existent Agent" "404 NOT_FOUND" "Got $STATUS + NOT_FOUND" "PASS"
else
    print_result "6" "Create Version for Non-existent Agent" "404 NOT_FOUND" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 7: Create Version with Empty Prompt
# ==============================================================================
print_header "TEST 7: Create Version with Empty Prompt"

# First create a valid agent
echo "Creating test agent for version tests..."
CREATE_RESPONSE=$(curl -s -X POST "$API_BASE/api/agents" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d "{\"name\": \"VersionTest_Agent_$(date +%s)\", \"description\": \"For version testing\"}")
AGENT_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Created agent with ID: $AGENT_ID"

# Try to create version with empty prompt
echo -e "\nCreating version with empty prompt..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents/$AGENT_ID/versions" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d '{"prompt_template": "", "variables": {}}' 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "prompt_template"; then
    print_result "7" "Create Version with Empty Prompt" "400 + validation error" "Got $STATUS + prompt error" "PASS"
else
    print_result "7" "Create Version with Empty Prompt" "400 + validation error" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 8: Promote Non-existent Version
# ==============================================================================
print_header "TEST 8: Promote Non-existent Version"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents/$AGENT_ID/versions/999/promote" \
  -H "X-Workspace-Id: $WORKSPACE" 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: POST /api/agents/$AGENT_ID/versions/999/promote"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "404" ] && echo "$BODY" | grep -q "NOT_FOUND"; then
    print_result "8" "Promote Non-existent Version" "404 NOT_FOUND" "Got $STATUS + NOT_FOUND" "PASS"
else
    print_result "8" "Promote Non-existent Version" "404 NOT_FOUND" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 9: Promote Already Active Version
# ==============================================================================
print_header "TEST 9: Promote Already Active Version"

# Create a version
echo "Creating version for agent $AGENT_ID..."
CREATE_VER_RESPONSE=$(curl -s -X POST "$API_BASE/api/agents/$AGENT_ID/versions" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d '{"prompt_template": "Test prompt for promotion", "variables": {}}')
VERSION_NUM=$(echo "$CREATE_VER_RESPONSE" | grep -o '"version":[0-9]*' | head -1 | cut -d':' -f2)
echo "Created version: $VERSION_NUM"

# Promote the version
echo -e "\nPromoting version $VERSION_NUM..."
PROMOTE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents/$AGENT_ID/versions/$VERSION_NUM/promote" \
  -H "X-Workspace-Id: $WORKSPACE" 2>&1)
echo "Promotion response: $(extract_body "$PROMOTE_RESPONSE")"

# Try to promote again
echo -e "\nTrying to promote again..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents/$AGENT_ID/versions/$VERSION_NUM/promote" \
  -H "X-Workspace-Id: $WORKSPACE" 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "already active"; then
    print_result "9" "Promote Already Active Version" "400 + already active error" "Got $STATUS + correct message" "PASS"
else
    print_result "9" "Promote Already Active Version" "400 + already active error" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 10: Reject Active Version
# ==============================================================================
print_header "TEST 10: Reject Active Version"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents/$AGENT_ID/versions/$VERSION_NUM/reject" \
  -H "X-Workspace-Id: $WORKSPACE" 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: POST /api/agents/$AGENT_ID/versions/$VERSION_NUM/reject"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "Cannot reject an active version"; then
    print_result "10" "Reject Active Version" "400 + cannot reject active" "Got $STATUS + correct message" "PASS"
else
    print_result "10" "Reject Active Version" "400 + cannot reject active" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# TEST 11: Invalid JSON Body
# ==============================================================================
print_header "TEST 11: Invalid JSON Body"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE/api/agents" \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: $WORKSPACE" \
  -d 'not valid json' 2>&1)
STATUS=$(extract_status "$RESPONSE")
BODY=$(extract_body "$RESPONSE")
echo "Request: POST /api/agents with invalid JSON"
echo "Response Status: $STATUS"
echo "Response Body: $BODY"

if [ "$STATUS" = "400" ] && echo "$BODY" | grep -q "Invalid JSON"; then
    print_result "11" "Invalid JSON Body" "400 + Invalid JSON error" "Got $STATUS + correct message" "PASS"
else
    print_result "11" "Invalid JSON Body" "400 + Invalid JSON error" "Got $STATUS" "FAIL"
fi

# ==============================================================================
# SUMMARY
# ==============================================================================
print_header "TEST SUMMARY"

TOTAL_TESTS=${#TEST_RESULTS[@]}
PASSED=$(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c "PASS")
FAILED=$(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c "FAIL")

echo -e "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the output above.${NC}"
    exit 1
fi
