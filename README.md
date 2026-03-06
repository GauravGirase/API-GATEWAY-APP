# API-GATEWAY-APP
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
