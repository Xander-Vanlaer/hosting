# 🚀 Hosting Platform - Opdracht 13

Complete hostingplatform voor een klantapplicatie met automatisering, monitoring en deployment.

## 📦 Stack

- **Application**: Node.js + Express REST API
- **Database**: PostgreSQL 15
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes (K3s)
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Load Testing**: k6

## 🎯 Features

✅ REST API met CRUD operaties
✅ PostgreSQL database met persistente storage
✅ Health checks en readiness probes
✅ Automated deployments
✅ Monitoring & alerting
✅ Performance testing
✅ Complete documentatie

## 🚀 Quick Start - Docker Compose (Lokaal)

### Prerequisites

- Docker Desktop geïnstalleerd
- Git
- Node.js 18+ (voor lokale development)

### Stap 1: Clone repository

```bash
git clone https://github.com/Xander-Vanlaer/hosting.git
cd hosting
```

### Stap 2: Environment variables

```bash
cp .env.example .env
# Edit .env als je wilt (defaults zijn OK voor lokaal)
```

### Stap 3: Start alles

```bash
docker-compose up -d
```

Dit start:
- **App**: http://localhost:3000
- **Database**: PostgreSQL op port 5432
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### Stap 4: Test de API

```bash
# Health check
curl http://localhost:3000/health

# Get all users
curl http://localhost:3000/api/users

# Create user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

# Get user by ID
curl http://localhost:3000/api/users/1
```

## 📊 Monitoring

### Prometheus
- URL: http://localhost:9090
- Metrics: http://localhost:3000/metrics

### Grafana
- URL: http://localhost:3001
- Login: admin/admin
- Dashboard wordt automatisch geladen

**Key Metrics:**
- HTTP request rate
- Response time (p50, p95, p99)
- Error rate
- Database connections
- CPU/Memory usage

## 🧪 Testing

### Performance Testing met k6

```bash
# Installeer k6
brew install k6  # macOS
# of
sudo apt install k6  # Ubuntu

# Run load test
k6 run tests/load-test.js

# Soak test (2 uur)
k6 run tests/soak-test.js
```

## 🐳 Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Clean everything (inclusief volumes!)
docker-compose down -v
```

## ☸️ Kubernetes Deployment

### Prerequisites

- K3s of Kubernetes cluster
- kubectl configured
- Docker registry (optioneel: Docker Hub, GHCR)

### Deploy naar Kubernetes

```bash
# Create namespace
kubectl create namespace production

# Create secrets
kubectl create secret generic app-secrets \
  --from-literal=database-url=postgresql://user:password@postgres:5432/appdb \
  -n production

# Deploy
kubectl apply -f k8s/ -n production

# Check status
kubectl get pods -n production
kubectl get svc -n production

# Get logs
kubectl logs -f deployment/client-app -n production
```

## 🔄 CI/CD Pipeline

GitHub Actions draait automatisch bij elke push naar `main`:

1. **Build** - Docker image bouwen
2. **Test** - Unit tests draaien
3. **Scan** - Security scanning
4. **Deploy** - Naar staging/production

Zie `.github/workflows/deploy.yml` voor details.

## 📁 Project Structuur

```
hosting/
├── app/                    # Node.js applicatie
│   ├── server.js          # Express server
│   ├── package.json       # Dependencies
│   ├── Dockerfile         # Container image
│   └── healthcheck.js     # Health check script
├── k8s/                   # Kubernetes manifests
│   ├── deployment.yaml    # App deployment
│   ├── service.yaml       # Service
│   ├── ingress.yaml       # Ingress
│   └── configmap.yaml     # Configuration
├── monitoring/            # Monitoring stack
│   ├── prometheus.yml     # Prometheus config
│   └── grafana/          # Grafana dashboards
├── tests/                 # Load tests
│   ├── load-test.js      # k6 load test
│   └── soak-test.js      # Endurance test
├── docs/                  # Documentation
│   ├── deployment.md     # Deployment procedures
│   ├── monitoring.md     # Monitoring guide
│   └── troubleshooting.md # Common issues
├── terraform/             # Infrastructure as Code
│   └── main.tf           # Terraform config
├── .github/workflows/     # CI/CD pipelines
│   └── deploy.yml        # GitHub Actions
├── docker-compose.yml     # Local development
├── .env.example          # Environment template
└── README.md             # This file
```

## 🔧 Development

### Lokaal draaien (zonder Docker)

```bash
cd app

# Install dependencies
npm install

# Set environment variables
export DATABASE_URL=postgresql://postgres:password@localhost:5432/appdb
export PORT=3000

# Run
npm start

# Development mode (auto-reload)
npm run dev
```

### Database toegang

```bash
# Via Docker
docker-compose exec db psql -U postgres -d appdb

# Lokaal
psql -h localhost -U postgres -d appdb
```

## 🛡️ Security (Basic)

- Environment variables voor secrets
- Database credentials niet in code
- Health checks voor availability
- Resource limits in Docker/K8s
- Regular security updates

## 📈 Performance

**Tested met k6:**
- ✅ 100 concurrent users
- ✅ 95th percentile < 500ms
- ✅ Error rate < 1%
- ✅ 2 hour soak test passed

## 🐛 Troubleshooting

### App start niet

```bash
# Check logs
docker-compose logs app

# Check database
docker-compose ps db
```

### Database connectie errors

```bash
# Restart database
docker-compose restart db

# Check database logs
docker-compose logs db
```

### Port already in use

```bash
# Find process
lsof -i :3000

# Change port in .env
PORT=3001
```

Zie `docs/troubleshooting.md` voor meer.

## 📚 Procedures

- **Deployment**: Zie `docs/deployment.md`
- **Monitoring**: Zie `docs/monitoring.md`
- **Rollback**: Zie `docs/deployment.md#rollback`
- **Backup**: Zie `docs/backup.md`

## 🎓 Opdracht Checklist

- [x] Hostingplatform voor klantapplicatie
- [x] Beveiligingsmaatregelen (basic)
- [x] Automatisering (CI/CD)
- [x] Deploy in Docker (done)
- [x] Procedures geschreven
- [ ] Security tests uitvoeren
- [x] Performance tests uitvoeren

## 📝 License

MIT

## 👤 Author

Xander Vanlaer
