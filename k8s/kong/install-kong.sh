#!/bin/bash
# install-kong.sh
# Installs and fully configures Kong on a kind cluster
# Run: chmod +x install-kong.sh && ./install-kong.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo ""
echo "================================"
echo "  Kong Install on kind cluster"
echo "================================"
echo ""

# ─── STEP 1: Add Helm repo ────────────────────────────────────────
log "Adding Kong Helm repo..."
helm repo add kong https://charts.konghq.com
helm repo update
log "Helm repo ready"

# ─── STEP 2: Install Kong ─────────────────────────────────────────
log "Installing Kong (this takes ~2 minutes)..."
helm upgrade --install kong kong/ingress \
  --namespace kong \
  --create-namespace \
  --values kong-values.yaml \
  --wait \
  --timeout 5m

log "Kong installed successfully"

# ─── STEP 3: Wait for Kong pods ───────────────────────────────────
log "Waiting for Kong pods to be ready..."
kubectl wait --for=condition=Ready \
  pod -l app.kubernetes.io/name=kong \
  -n kong \
  --timeout=120s
log "Kong pods are ready"

# ─── STEP 4: Apply Kong consumer ──────────────────────────────────
log "Creating Kong consumer (JWT issuer)..."
kubectl apply -f kong-consumer.yaml
log "Consumer created"

# ─── STEP 5: Apply plugins ────────────────────────────────────────
log "Applying Kong plugins..."
kubectl apply -f kong-plugins.yaml
log "Plugins applied"

# ─── STEP 6: Apply ingress routes ─────────────────────────────────
log "Applying ingress routes..."
kubectl apply -f ingress.yaml
log "Ingress routes applied"

# ─── STEP 7: Verify ───────────────────────────────────────────────
echo ""
log "Verifying installation..."
echo ""
echo "Kong pods:"
kubectl get pods -n kong
echo ""
echo "Kong plugins:"
kubectl get kongplugins
echo ""
echo "Ingress rules:"
kubectl get ingress
echo ""

# ─── STEP 8: Test Kong is reachable ───────────────────────────────
log "Testing Kong proxy..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/auth/health || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "404" ]; then
  log "Kong is reachable at http://localhost"
else
  warn "Kong returned status $HTTP_STATUS — it may still be starting up"
  warn "Try: curl http://localhost/auth/health in 30 seconds"
fi

echo ""
echo "================================"
echo "  Done! Kong is running"
echo "================================"
echo ""
echo "Proxy:  http://localhost:80       (API traffic)"
echo "Admin:  internal only (port-forward to access)"
echo ""
echo "To access Kong Admin API:"
echo "  kubectl port-forward svc/kong-controller-validation-webhook -n kong 8001:8001"
echo ""
echo "Quick test:"
echo "  curl http://localhost/auth/health"
echo "  curl http://localhost/orders        # should return 401 (no token)"
echo ""
echo "To watch logs:"
echo "  kubectl logs -n kong -l app.kubernetes.io/name=kong -f"
echo ""
