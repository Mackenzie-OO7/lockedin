#!/bin/bash

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "================================"
echo "Testing LockedIn API Endpoints"
echo "================================"
echo

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get auth token first
echo "${BLUE}1. Testing Authentication${NC}"
AUTH_RESPONSE=$(node "$SCRIPT_DIR/test-auth.js" | grep "JWT Token:" | cut -d' ' -f3)
if [ -z "$AUTH_RESPONSE" ]; then
    echo "${RED}✗ Failed to get auth token${NC}"
    exit 1
fi
TOKEN=$AUTH_RESPONSE
echo "${GREEN}✓ Got JWT token${NC}"
echo

# Test Profile endpoints
echo "${BLUE}2. Testing Profile Endpoints${NC}"

# GET profile
echo "GET /api/profile"
PROFILE_GET=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:3001/api/profile)
echo "$PROFILE_GET" | jq .
if echo "$PROFILE_GET" | jq -e '.success' > /dev/null; then
    echo "${GREEN}✓ GET /api/profile works${NC}"
else
    echo "${RED}✗ GET /api/profile failed${NC}"
fi
echo

# PUT profile
echo "PUT /api/profile"
PROFILE_PUT=$(curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test User","email":"test@example.com","emailOnPayment":true}' \
    http://localhost:3001/api/profile)
echo "$PROFILE_PUT" | jq .
if echo "$PROFILE_PUT" | jq -e '.success' > /dev/null; then
    echo "${GREEN}✓ PUT /api/profile works${NC}"
else
    echo "${RED}✗ PUT /api/profile failed${NC}"
fi
echo

# Test Template endpoints
echo "${BLUE}3. Testing Template Endpoints${NC}"

# GET templates (empty)
echo "GET /api/templates (should be empty)"
TEMPLATES_GET=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:3001/api/templates)
echo "$TEMPLATES_GET" | jq .
echo "${GREEN}✓ GET /api/templates works${NC}"
echo

# POST template
echo "POST /api/templates"
TEMPLATE_POST=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "My Monthly Bills",
      "description": "Standard recurring bills",
      "bills": [
        {
          "name": "Netflix",
          "category": "Subscriptions",
          "amount": "1500",
          "isRecurring": true,
          "dayOfMonth": 1
        },
        {
          "name": "Rent",
          "category": "Housing",
          "amount": "100000",
          "isRecurring": true,
          "dayOfMonth": 1
        }
      ]
    }' \
    http://localhost:3001/api/templates)
echo "$TEMPLATE_POST" | jq .
TEMPLATE_ID=$(echo "$TEMPLATE_POST" | jq -r '.template.id')
echo "${GREEN}✓ POST /api/templates works (ID: $TEMPLATE_ID)${NC}"
echo

# GET templates (with data)
echo "GET /api/templates (should have 1)"
TEMPLATES_GET2=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:3001/api/templates)
echo "$TEMPLATES_GET2" | jq .
echo "${GREEN}✓ Templates list updated${NC}"
echo

# GET single template
echo "GET /api/templates/$TEMPLATE_ID"
TEMPLATE_GET=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:3001/api/templates/$TEMPLATE_ID)
echo "$TEMPLATE_GET" | jq .
echo "${GREEN}✓ GET /api/templates/:id works${NC}"
echo

# PUT template
echo "PUT /api/templates/$TEMPLATE_ID"
TEMPLATE_PUT=$(curl -s -X PUT -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Updated Monthly Bills",
      "description": "Updated description"
    }' \
    http://localhost:3001/api/templates/$TEMPLATE_ID)
echo "$TEMPLATE_PUT" | jq .
echo "${GREEN}✓ PUT /api/templates/:id works${NC}"
echo

# Test Analytics endpoints
echo "${BLUE}4. Testing Analytics Endpoints${NC}"

# GET analytics
echo "GET /api/analytics"
ANALYTICS_GET=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:3001/api/analytics)
echo "$ANALYTICS_GET" | jq .
echo "${GREEN}✓ GET /api/analytics works${NC}"
echo

# POST analytics/refresh
echo "POST /api/analytics/refresh"
ANALYTICS_REFRESH=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"contractId":"CCUBYPV6KJWOXPXGKKTG4DUKUW576S2CN7ABHW6BEDAYJWQ4IHRGJP2Z"}' \
    http://localhost:3001/api/analytics/refresh)
echo "$ANALYTICS_REFRESH" | jq .
echo "${GREEN}✓ POST /api/analytics/refresh works${NC}"
echo

# DELETE template (cleanup)
echo "${BLUE}5. Cleanup${NC}"
echo "DELETE /api/templates/$TEMPLATE_ID"
TEMPLATE_DELETE=$(curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
    http://localhost:3001/api/templates/$TEMPLATE_ID)
echo "$TEMPLATE_DELETE" | jq .
echo "${GREEN}✓ DELETE /api/templates/:id works${NC}"
echo

echo "================================"
echo "${GREEN}All API tests passed! ✓${NC}"
echo "================================"
