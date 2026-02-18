# 🚀 Professional Hosting Platform

Complete production-ready hosting platform op DevOps-niveau met volledige automatisering, monitoring en operational procedures.

## 📦 Technology Stack

- **OS**: Ubuntu 22.04 LTS / Rocky Linux 9
- **Containerization**: Docker + Docker Compose / Docker Swarm
- **Load Balancer**: HAProxy 2.9
- **Reverse Proxy**: Nginx Alpine
- **Application**: Node.js 18 + Express REST API
- **Database**: PostgreSQL 15 (Primary + Replica)
- **Cache**: Redis 7.2
- **Storage**: Docker volumes + NFS
- **Monitoring**: Prometheus + Grafana + Loki + cAdvisor
- **IaC**: Terraform (Proxmox/Cloud)
- **Configuration Management**: Ansible
- **CI/CD**: GitHub Actions
- **Performance Testing**: k6

## 🎯 Features

✅ Horizontaal schaalbare applicatie (3-10+ replicas)  
✅ Multi-layer load balancing (HAProxy + Nginx)  
✅ Database replicatie (Primary-Replica setup)  
✅ Multi-level caching (Redis + Nginx)  
✅ Complete monitoring stack met dashboards  
✅ Infrastructure as Code (Terraform + Ansible)  
✅ CI/CD pipeline met automated deployments  
✅ Comprehensive operational runbooks  
✅ Performance testing en optimization guides  
✅ Docker Swarm orchestration  
✅ Network segmentation (5 isolated networks)  
✅ Health checks en auto-recovery  
✅ Backup en restore procedures  
✅ Production-ready configuraties

## 🚀 Quick Start

### Option 1: Local Development (Docker Compose)

```bash
# Clone repository
git clone https://github.com/Xander-Vanlaer/hosting.git
cd hosting

# Run setup script (creates directories, validates config)
# For Linux/Mac:
./scripts/setup-local.sh

# For Windows:
scripts\setup-local.bat

# Setup environment (or use the .env created by setup script)
cp .env.example .env

# Start all services
docker-compose up -d

# Verify deployment
docker-compose ps
curl http://localhost/health
```

**Services Available:**
- **Application**: http://localhost (via HAProxy)
- **Dashboard**: http://localhost:5000 (admin/admin)
- **HAProxy Stats**: http://localhost:8404
- **PostgreSQL**: localhost:5432
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **cAdvisor**: http://localhost:8080

## 🎨 Web Dashboard

Access the deployment dashboard at **http://localhost:5000**

Default credentials:
- Username: `admin`
- Password: `admin` (change in .env)

Features:
- 🚀 One-click application deployment
- 📊 Real-time service monitoring
- 📝 Container log viewer
- ⚖️ Easy scaling controls
- 🔧 Configuration management

**Quick Start:**
1. Visit http://localhost:5000
2. Log in with credentials (admin/admin)
3. Click "Deploy" tab → Upload ZIP or select runtime → Click "Deploy" → App is live
4. View all services with status, logs, and metrics in the "Services" tab
5. Monitor overall system health in the "Overview" tab

No terminal/command-line knowledge required!

### Option 2: Production Deployment (Docker Swarm)

**Complete deployment guide:** [docs/deployment.md](docs/deployment.md)

```bash
# 1. Provision infrastructure with Terraform
cd terraform/proxmox
terraform init && terraform apply

# 2. Configure servers with Ansible
cd ../../ansible
ansible-playbook -i inventory/production playbooks/base-setup.yml
ansible-playbook -i inventory/production playbooks/setup-docker.yml

# 3. Initialize Docker Swarm
ansible-playbook -i inventory/production playbooks/deploy-swarm.yml

# 4. Deploy application stack
ssh ubuntu@10.0.1.10
cd /opt/hosting
docker stack deploy -c docker-compose.prod.yml hosting

# 5. Verify
docker service ls
curl http://10.0.1.10/health
```

### API Testing

```bash
# Health check
curl http://localhost/health

# Get users
curl http://localhost/api/users

# Create user
curl -X POST http://localhost/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

# Get metrics
curl http://localhost/metrics
```

## 📊 Monitoring & Observability

**Complete monitoring setup met:**
- **Prometheus**: Metrics collection en storage
- **Grafana**: Visualization dashboards
- **Loki**: Log aggregation
- **Promtail**: Log collection
- **cAdvisor**: Container metrics

**Access Points:**
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)
- Loki: http://localhost:3100

**Key Metrics:**
- HTTP request rate en response times (p50, p95, p99)
- Error rates en status codes
- Database connections en query performance
- Cache hit ratios
- Container CPU/Memory usage
- Network I/O

**Pre-configured Dashboards:**
- Docker Container Monitoring
- Application Performance
- Database Metrics
- System Resources

## 🧪 Performance Testing

**Complete test suite met k6:**

```bash
# Install k6
brew install k6  # macOS
sudo apt install k6  # Ubuntu

# Basic load test (100 concurrent users)
k6 run performance-tests/scripts/load-test-basic.js

# Spike test (500 concurrent users)
k6 run performance-tests/scripts/load-test-spike.js

# Stress test (1000+ concurrent users)
k6 run performance-tests/scripts/load-test-stress.js

# Soak test (2 hour endurance)
k6 run performance-tests/scripts/load-test-soak.js
```

**Performance Benchmarks:**

| Configuration | Concurrent Users | Response Time p95 | Throughput |
|---------------|------------------|-------------------|------------|
| 5 replicas | 750 | 280ms | 280 req/s |
| 8 replicas (optimized) | 1200 | 385ms | 420 req/s |
| 10+ replicas | 2000+ | 650ms | 600+ req/s |

**See:** [docs/performance-testing.md](docs/performance-testing.md)

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

## 📁 Project Structure

```
hosting/
├── .github/workflows/         # CI/CD Pipelines
│   ├── deploy.yml            # Automated deployment
│   └── test.yml              # Test automation
├── ansible/                  # Configuration Management
│   ├── inventory/            # Server inventories
│   ├── playbooks/            # Automation playbooks
│   └── roles/                # Reusable roles
├── app/                      # Application Code
│   ├── src/server.js         # Express REST API
│   ├── Dockerfile            # Multi-stage build
│   └── package.json          # Dependencies
├── docs/                     # Complete Documentation
│   ├── README.md             # Documentation index
│   ├── architecture.md       # System architecture
│   ├── deployment.md         # Deployment guide
│   ├── performance-testing.md # Load testing guide
│   ├── performance-optimization.md # Optimization strategies
│   └── operations/runbooks/  # Operational procedures (8 runbooks)
├── monitoring/               # Monitoring Stack
│   ├── prometheus/           # Prometheus config
│   ├── grafana/              # Grafana dashboards
│   └── loki/                 # Log aggregation
├── nginx/                    # Reverse Proxy
│   ├── Dockerfile            # Nginx image
│   ├── nginx.conf            # Main config
│   └── conf.d/               # Site configs
├── performance-tests/        # k6 Load Tests
│   └── scripts/              # Test scenarios
├── postgres/                 # Database Config
│   ├── init.sql              # Schema initialization
│   └── postgresql.conf       # Performance tuning
├── redis/                    # Cache Config
│   └── redis.conf            # Redis settings
├── scripts/                  # Automation Scripts
│   ├── deploy.sh             # Deployment automation
│   ├── backup.sh             # Backup procedures
│   ├── restore.sh            # Restore procedures
│   └── health-check.sh       # Health validation
├── terraform/proxmox/        # Infrastructure as Code
│   ├── main.tf               # VM provisioning
│   ├── variables.tf          # Configuration
│   └── outputs.tf            # Resource outputs
├── docker-compose.yml        # Local development
├── docker-compose.prod.yml   # Production (Swarm)
├── .env.example              # Environment template
└── README.md                 # This file
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

## 📚 Documentation

**Complete professional documentation:**

### Core Documentation
- **[Documentation Index](docs/README.md)** - Complete overview
- **[Architecture](docs/architecture.md)** - System design & diagrams
- **[Deployment Guide](docs/deployment.md)** - Production deployment
- **[Performance Testing](docs/performance-testing.md)** - k6 test scenarios
- **[Performance Optimization](docs/performance-optimization.md)** - Tuning guide

### Operational Runbooks (8 detailed procedures)
1. **[Deploy New Application](docs/operations/runbooks/01-deploy-new-application.md)**
2. **[Release New Version](docs/operations/runbooks/02-release-new-version.md)**
3. **[Scale Containers](docs/operations/runbooks/03-scale-containers.md)**
4. **[Database Migration](docs/operations/runbooks/04-database-migration.md)**
5. **[Backup Procedures](docs/operations/runbooks/05-backup-procedures.md)**
6. **[Restore Procedures](docs/operations/runbooks/06-restore-procedures.md)**
7. **[Log Analysis](docs/operations/runbooks/07-log-analysis.md)**
8. **[Platform Restart](docs/operations/runbooks/08-platform-restart.md)**

## 🏗️ Architecture Highlights

- **Multi-layer Load Balancing**: HAProxy → Nginx → App containers
- **Horizontal Scaling**: 3-10+ app replicas with least-connections algorithm
- **Database HA**: Primary-Replica PostgreSQL setup
- **Multi-level Caching**: Redis + Nginx proxy cache
- **Network Segmentation**: 5 isolated Docker networks
- **Complete Observability**: Prometheus + Grafana + Loki
- **Automated Operations**: Terraform + Ansible + GitHub Actions
- **Performance Optimized**: Tested to 2000+ concurrent users

## 🎯 Project Deliverables

✅ **Infrastructure as Code**
- Terraform configuration voor Proxmox deployment
- Ansible playbooks voor server configuratie
- Complete automation van provisioning tot deployment

✅ **Containerization & Orchestration**
- Docker Compose voor lokale development
- Docker Swarm voor productie deployment
- Multi-container architectuur met health checks

✅ **Monitoring & Observability**
- Prometheus metrics collection
- Grafana visualization dashboards
- Loki log aggregation
- cAdvisor container metrics

✅ **CI/CD Pipeline**
- GitHub Actions workflows
- Automated testing en building
- Deployment automation met rollback

✅ **Performance Engineering**
- k6 load testing scripts (4 scenarios)
- Performance benchmarking
- Optimization guide met before/after metrics

✅ **Operational Excellence**
- 8 detailed operational runbooks
- Backup en restore procedures
- Troubleshooting guides
- Emergency procedures

✅ **Complete Documentation**
- Architecture diagrams (Mermaid)
- Deployment procedures
- Performance testing guide
- 50+ pages of professional documentation

## 📝 License

MIT

## 👤 Author

Xander Vanlaer

---

**Built with ❤️ for HBO DevOps Engineering**
