# API-GATEWAY-APP
## Setup KIND cluster
### Step 1: Docker installation
```bash
sudo apt-get update
sudo apt-get install ca-certificates curl -y
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group (log out / in or newgrp to apply)
sudo usermod -aG docker  ubuntu
newgrp docker
```
### Step 2: Kubectl installation
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl.sha256"
echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
# Note:
# If you do not have root access on the target system, you can still install kubectl to the ~/.local/bin directory:
chmod +x kubectl
mkdir -p ~/.local/bin
mv ./kubectl ~/.local/bin/kubectl
# and then append (or prepend) ~/.local/bin to $PATH
kubectl version --client
```
### Step 3: Helm installation
```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4
chmod 700 get_helm.sh
./get_helm.sh
```
### Step 4: Kind installation
```bash
# For AMD64 / x86_64
[ $(uname -m) = x86_64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.31.0/kind-linux-amd64
# For ARM64
[ $(uname -m) = aarch64 ] && curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.31.0/kind-linux-arm64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
```
## Create kind cluster
**kind-cluster.yaml**
```bash
# kind-cluster.yaml
# Creates a production-like cluster with:
# - 1 control plane node
# - 3 worker nodes
# - Port mappings for Kong API Gateway
# - Extra port mappings for local access

kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4

name: microservices-cluster

nodes:
  # ─── Control Plane ───────────────────────────────────────────────
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"   # needed for ingress controller
    extraPortMappings:
      - containerPort: 30080    # Kong HTTP proxy (NodePort)
        hostPort: 80            # accessible at localhost:80
        protocol: TCP
      - containerPort: 30443    # Kong HTTPS proxy (NodePort)
        hostPort: 443           # accessible at localhost:443
        protocol: TCP
      - containerPort: 30081    # Kong Admin API (for debugging)
        hostPort: 8001
        protocol: TCP

  # ─── Worker Nodes ─────────────────────────────────────────────────
  - role: worker
    labels:
      node-type: worker         # optional — for pod scheduling rules

  - role: worker
    labels:
      node-type: worker

  - role: worker
    labels:
      node-type: worker

# ─── Networking ───────────────────────────────────────────────────
networking:
  apiServerAddress: "127.0.0.1"
  apiServerPort: 6443           # K8s API server port
  podSubnet: "10.244.0.0/16"   # IP range for pods
  serviceSubnet: "10.96.0.0/16" # IP range for services
  disableDefaultCNI: false      # use default kindnet CNI
```
**Create cluster**
```bash
kind create cluster --config kind-cluster.yaml
```
![kind-install](/doc/images/1-kind-install.png)

## Deployment of workload (MongoDB using statefulset)
### step1: Create secret
secret.yaml
```bash

# Store MongoDB credentials as a K8s Secret
# To generate base64: echo -n "yourpassword" | base64
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-secret
  namespace: default
type: Opaque
stringData:                        # stringData auto base64-encodes for you
  MONGO_ROOT_USERNAME: root
  MONGO_ROOT_PASSWORD: rootPassword123
  MONGO_DATABASE: auth_service
```
```bash
kubectl apply -f secret.yaml
```
### step2: Create pvc
pvc.yaml
```bash
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mongodb-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce          # one pod at a time (fine for MongoDB)
  resources:
    requests:
      storage: 10Gi          # 10GB of storage
  storageClassName: local # for kind setup, can be ingnored
```
### step3: Create services (headless & cluster IP)
```bash
# k8s/mongodb/05-services.yaml
# Two services are needed for MongoDB StatefulSet:
# 1. Headless Service — required by StatefulSet for pod DNS names
# 2. ClusterIP Service — used by microservices to connect

---
# HEADLESS SERVICE
# Required by StatefulSet — gives each pod a stable DNS name
# mongodb-0.mongodb-headless.default.svc.cluster.local
# mongodb-1.mongodb-headless.default.svc.cluster.local
# mongodb-2.mongodb-headless.default.svc.cluster.local
apiVersion: v1
kind: Service
metadata:
  name: mongodb-headless
  namespace: default
spec:
  clusterIP: None              # None = headless (no virtual IP)
  selector:
    app: mongodb
  ports:
    - port: 27017
      targetPort: 27017

---
# CLUSTERIP SERVICE
# What your microservices use to connect to MongoDB
# Connection string: mongodb://user:pass@mongodb-service:27017/dbname
# Kong automatically routes internal traffic — no external exposure needed
apiVersion: v1
kind: Service
metadata:
  name: mongodb-service
  namespace: default
spec:
  type: ClusterIP              # internal only — never exposed to internet
  selector:
    app: mongodb
  ports:
    - port: 27017
      targetPort: 27017
```
### step4: Create statefulset
statefulset.yaml
```bash
# k8s/mongodb/04-statefulset.yaml
# StatefulSet — NOT a Deployment!
# StatefulSet gives each pod a stable name (mongodb-0, mongodb-1, mongodb-2)
# and its own persistent volume. This is required for databases.

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: default
spec:
  serviceName: mongodb-headless   # links to the headless service
  replicas: 3                     # 1 primary + 2 secondaries
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
        - name: mongodb
          image: mongo:7.0
          ports:
            - containerPort: 27017
          env:
            - name: MONGO_INITDB_ROOT_USERNAME
              valueFrom:
                secretKeyRef:
                  name: mongodb-secret
                  key: MONGO_ROOT_USERNAME
            - name: MONGO_INITDB_ROOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mongodb-secret
                  key: MONGO_ROOT_PASSWORD
            - name: MONGO_INITDB_DATABASE
              valueFrom:
                secretKeyRef:
                  name: mongodb-secret
                  key: MONGO_DATABASE
          # Health checks
          livenessProbe:
            exec:
              command: ["mongosh", "--eval", "db.adminCommand('ping')"]
            initialDelaySeconds: 30
            periodSeconds: 20
            timeoutSeconds: 10

          readinessProbe:
            exec:
              command: ["mongosh", "--eval", "db.adminCommand('ping')"]
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5

          # Resource limits
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"

   
  # volumeClaimTemplates: each pod gets its OWN 10Gi PVC automatically
  # mongodb-0 → mongodb-data-mongodb-0
  # mongodb-1 → mongodb-data-mongodb-1
  # mongodb-2 → mongodb-data-mongodb-2
  volumeClaimTemplates:
    - metadata:
        name: mongodb-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```
**Apply**
```bash
kubectl apply -f pvc.yaml
kubectl apply -f service.yaml
kubectl apply -f statefulset.yaml
```
## Deployment of application (auth service)
auth-secret.yaml
```bash
apiVersion: v1
kind: Secret
metadata:
  name: auth-secrets
  namespace: default
type: Opaque
stringData:                        # stringData auto base64-encodes for you
  jwt-secret: *********
  jwt-refresh-secret: **********
  # Full connection string — used by microservices
  mongo-uri: 'mongodb://<USERNAME>:<PASSWORD>@mongodb-service:27017/auth_service?authSource=admin'
```
deployment.yaml
```bash
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  labels:
    app: auth-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
        - name: auth-service
          image: gauravgirase/auth-service:v1.0.0   # replace with your image
          ports:
            - containerPort: 3000
          env:
            - name: PORT
              value: "3000"
            - name: MONGO_URI
              valueFrom:
                secretKeyRef:
                  name: auth-secrets
                  key: mongo-uri
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: auth-secrets
                  key: jwt-secret
            - name: JWT_REFRESH_SECRET
              valueFrom:
                secretKeyRef:
                  name: auth-secrets
                  key: jwt-refresh-secret
            - name: JWT_EXPIRES_IN
              value: "1h"
            - name: JWT_REFRESH_EXPIRES_IN
              value: "7d"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
spec:
  selector:
    app: auth-service
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP       # Internal only — accessed via API Gateway

```
### Note: Generate JWT_SECRET & JWT_REFRESH_SECRET
```bash
echo "myjwtsecurejwtkey" | base64
echo "myjwtsecurerefreshjwtkey" | base64
```
**Apply manifests**
```bash
kubectl apply -f auth-secrets.yaml
kubectl apply -f deployment.yaml
```
### Verify workload is deployed 
![workload](/doc/images/2-workload-running.png)

## Auth Service

JWT-based Authentication & Authorization REST API for Kubernetes microservices.

## Quick Start
Dockerize the application and run
```bash
docker network create auth-service
```
```bash
docker run -d -p 3000:3000 \
--network auth-network \
--env MONGO_URI=<URI> \
--env JWT_SECRET=<KEY> \
--env JWT_REFRESH_SECRET=<KEY> \
--name auth-service \
--rm auth-service:latest \
```
Running mongoDB as container
```bash
docker run -d \
--network auth-network \
--name mongodb \
--env MONGO_INITDB_ROOT_USERNAME=admin \
--env MONGO_INITDB_ROOT_PASSWORD=admin@123 \
mongo
```
```bash
cp .env.example .env      # fill in your values
npm install
npm run dev               # starts with nodemon
```

---

## API Endpoints

### Public (no token needed)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, get tokens |
| POST | `/auth/refresh` | Get new access token |
| POST | `/auth/logout` | Revoke refresh token |
| POST | `/auth/verify` | Verify a token (used by API Gateway) |
| GET | `/health` | Health check |

### Protected (Bearer token required)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/users/me` | any | Get own profile |
| PATCH | `/users/me` | any | Update name |
| PATCH | `/users/me/password` | any | Change password |
| GET | `/users` | admin | List all users |
| GET | `/users/:id` | admin | Get user by ID |
| PATCH | `/users/:id/roles` | admin | Update user roles |
| DELETE | `/users/:id` | admin | Deactivate user |

---

## Usage Examples

### Register
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{ "name": "Alice", "email": "alice@example.com", "password": "Password1" }'

# Response:
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": { "id": "...", "name": "Alice", "email": "alice@example.com", "roles": ["user"] }
}
```

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "alice@example.com", "password": "Password1" }'
```

### Call a protected route
```bash
curl http://localhost:3000/users/me \
  -H "Authorization: Bearer <accessToken>"
```

### Refresh access token
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "<refreshToken>" }'
```

### Verify token (API Gateway calls this)
```bash
curl -X POST http://localhost:3000/auth/verify \
  -H "Authorization: Bearer <accessToken>"

# Response:
{ "valid": true, "userId": "...", "email": "alice@example.com", "roles": ["user"] }
```

---

## Token Flow

```
1. POST /auth/login  →  { accessToken (1h), refreshToken (7d) }
2. Use accessToken in every API request header
3. When accessToken expires (401) → POST /auth/refresh → new accessToken
4. When refreshToken expires → user must log in again
5. POST /auth/logout → refreshToken is revoked
```

---

## Kubernetes Deploy

```bash
# Build & push
docker build -t yourrepo/auth-service:v1 .
docker push yourrepo/auth-service:v1

# Create secrets
kubectl create secret generic auth-secrets \
  --from-literal=mongo-uri='mongodb+srv://...' \
  --from-literal=jwt-secret='your-super-secret-32-chars-minimum' \
  --from-literal=jwt-refresh-secret='different-refresh-secret-32-chars'

# Deploy
kubectl apply -f k8s/deployment.yaml
```
