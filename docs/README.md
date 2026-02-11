# 📚 Documentation Index

Welcome to the complete documentation for the Professional Hosting Platform.

---

## 🗂️ Documentation Structure

### Architecture & Design
- **[Architecture Documentation](architecture.md)** - Complete system architecture with diagrams
  - System overview and architecture diagrams
  - Network topology
  - Container specifications
  - Scaling strategies
  - Technology stack
  - Data flow diagrams

### Deployment & Operations
- **[Deployment Guide](deployment.md)** - Step-by-step deployment procedures
  - VM specifications
  - Network configuration
  - Complete deployment workflow (Terraform → Ansible → Docker Swarm)
  - Verification procedures
  - Troubleshooting guide

### Operational Runbooks
Located in `operations/runbooks/`:

1. **[Deploy New Application](operations/runbooks/01-deploy-new-application.md)**
   - Prerequisites and preparation
   - Deployment procedures
   - Verification steps
   - Rollback procedures

2. **[Release New Version](operations/runbooks/02-release-new-version.md)**
   - Rolling update strategies
   - Zero-downtime deployments
   - Health check validation
   - Rollback on failure

3. **[Scale Containers](operations/runbooks/03-scale-containers.md)**
   - Horizontal scaling procedures
   - Auto-scaling strategies
   - Load distribution verification
   - Performance monitoring

4. **[Database Migration](operations/runbooks/04-database-migration.md)**
   - Migration preparation
   - Execution procedures
   - Zero-downtime vs full-downtime strategies
   - Rollback procedures

5. **[Backup Procedures](operations/runbooks/05-backup-procedures.md)**
   - Database backups
   - Volume backups
   - Automated backup scheduling
   - Backup retention policies

6. **[Restore Procedures](operations/runbooks/06-restore-procedures.md)**
   - Full system restore
   - Selective restore (database only, volumes only)
   - Verification procedures
   - Disaster recovery

7. **[Log Analysis](operations/runbooks/07-log-analysis.md)**
   - Service log access
   - Centralized logging with Loki
   - Common issue patterns
   - Troubleshooting workflows

8. **[Platform Restart](operations/runbooks/08-platform-restart.md)**
   - Graceful service restarts
   - Node maintenance procedures
   - Complete platform restart
   - Emergency recovery

### Performance & Testing
- **[Performance Testing](performance-testing.md)** - Load testing with k6
  - Test scenarios (basic, spike, stress, soak)
  - Expected results and benchmarks
  - Monitoring during tests
  - Result analysis

- **[Performance Optimization](performance-optimization.md)** - Optimization strategies
  - Horizontal scaling
  - Database connection pooling
  - Redis caching implementation
  - Nginx proxy caching
  - Query optimization
  - Load balancer tuning
  - Complete before/after benchmarks

---

## 🚀 Quick Start Guides

### Local Development
```bash
# Clone repository
git clone https://github.com/Xander-Vanlaer/hosting.git
cd hosting

# Setup environment
cp .env.example .env

# Start all services
docker-compose up -d

# Access
# - Application: http://localhost:3000
# - Grafana: http://localhost:3001 (admin/admin)
# - Prometheus: http://localhost:9090
```

### Production Deployment
```bash
# 1. Provision VMs with Terraform
cd terraform/proxmox
terraform init && terraform apply

# 2. Configure servers with Ansible
cd ../../ansible
ansible-playbook -i inventory/production playbooks/base-setup.yml
ansible-playbook -i inventory/production playbooks/setup-docker.yml

# 3. Deploy Docker Swarm
ansible-playbook -i inventory/production playbooks/deploy-swarm.yml

# 4. Verify
ssh ubuntu@10.0.1.10 'docker service ls'
```

### Performance Testing
```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run basic load test
k6 run performance-tests/scripts/load-test-basic.js

# Run spike test
k6 run performance-tests/scripts/load-test-spike.js
```

---

## 📊 Key Metrics & SLAs

### Performance Targets

| Metric | Target | Acceptable | Critical |
|--------|--------|------------|----------|
| Response Time (p95) | < 300ms | < 500ms | < 1000ms |
| Response Time (p99) | < 500ms | < 800ms | < 1500ms |
| Error Rate | < 0.1% | < 1% | < 5% |
| Uptime | 99.9% | 99.5% | 99% |
| Throughput | 1000 req/s | 500 req/s | 200 req/s |

### Capacity

| Configuration | Concurrent Users | Throughput |
|---------------|------------------|------------|
| 3 replicas (dev) | 500 | 180 req/s |
| 5 replicas (prod baseline) | 750 | 280 req/s |
| 8 replicas (optimized) | 1200 | 420 req/s |
| 10+ replicas (peak) | 2000+ | 600+ req/s |

---

## 🏗️ Architecture Overview

```
┌─────────────┐
│   Clients   │
└──────┬──────┘
       │
┌──────▼──────┐
│   HAProxy   │ (Load Balancer)
│   80/443    │
└──────┬──────┘
       │
┌──────▼──────┐
│Nginx Proxies│ (2 instances)
│ Caching     │
└──────┬──────┘
       │
┌──────▼──────┐
│ App Layer   │ (5-8 instances)
│ Node.js API │
└─┬─────────┬─┘
  │         │
┌─▼───┐ ┌──▼──────┐
│Redis│ │PostgreSQL│
│Cache│ │ Primary  │
└─────┘ └──┬──────┘
           │
      ┌────▼────┐
      │PostgreSQL│
      │ Replica  │
      └──────────┘
```

---

## 📁 Repository Structure

```
hosting/
├── .github/workflows/       # CI/CD pipelines
│   ├── deploy.yml          # Deployment workflow
│   └── test.yml            # Test workflow
├── ansible/                # Configuration management
│   ├── inventory/          # Server inventories
│   ├── playbooks/          # Automation playbooks
│   └── roles/              # Reusable roles
├── app/                    # Application code
│   ├── src/                # Source files
│   ├── Dockerfile          # App container image
│   └── package.json        # Dependencies
├── docs/                   # Documentation (you are here)
│   ├── architecture.md
│   ├── deployment.md
│   ├── performance-testing.md
│   ├── performance-optimization.md
│   └── operations/runbooks/
├── monitoring/             # Monitoring configs
│   ├── grafana/
│   └── prometheus/
├── nginx/                  # Reverse proxy
│   ├── conf.d/
│   ├── Dockerfile
│   └── nginx.conf
├── performance-tests/      # Load testing
│   └── scripts/
├── postgres/               # Database configs
│   ├── init.sql
│   └── postgresql.conf
├── redis/                  # Cache configs
│   └── redis.conf
├── scripts/                # Automation scripts
│   ├── deploy.sh
│   ├── backup.sh
│   └── restore.sh
├── terraform/              # Infrastructure as Code
│   └── proxmox/
├── docker-compose.yml      # Local development
├── docker-compose.prod.yml # Production deployment
└── .env.example            # Environment template
```

---

## 🔧 Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| OS | Ubuntu Server | 22.04 LTS | Base system |
| Containerization | Docker | 24.x | Container runtime |
| Orchestration | Docker Swarm | Built-in | Container orchestration |
| Load Balancer | HAProxy | 2.9 | Layer 7 LB |
| Reverse Proxy | Nginx | Alpine | HTTP proxy |
| Application | Node.js + Express | 18 | REST API |
| Database | PostgreSQL | 15 | RDBMS |
| Cache | Redis | 7.2 | In-memory cache |
| Monitoring | Prometheus | Latest | Metrics |
| Visualization | Grafana | Latest | Dashboards |
| IaC | Terraform | 1.x | Provisioning |
| Config Mgmt | Ansible | Latest | Configuration |
| CI/CD | GitHub Actions | - | Automation |
| Load Testing | k6 | Latest | Performance tests |

---

## 🛠️ Operations

### Daily Tasks
- Monitor dashboards (Grafana)
- Check service health: `docker service ls`
- Review logs: `docker service logs -f hosting_app`
- Verify backups: `ls -lh /backups/`

### Weekly Tasks
- Review performance metrics
- Check disk space: `df -h`
- Update dependencies
- Test backup restoration
- Review security updates

### Monthly Tasks
- Performance testing
- Capacity planning review
- Documentation updates
- Infrastructure audit
- Cost optimization review

---

## 🆘 Emergency Contacts & Procedures

### Quick Diagnostics
```bash
# Service status
docker service ls

# Service logs
docker service logs --tail 100 hosting_app

# Container stats
docker stats

# Node status
docker node ls

# Network inspection
docker network ls
```

### Emergency Rollback
```bash
# Rollback to previous version
docker service update --rollback hosting_app

# Or redeploy entire stack
docker stack rm hosting
docker stack deploy -c docker-compose.prod.yml hosting
```

### Health Check
```bash
curl http://localhost/health
```

Expected: `{"status":"healthy"}`

---

## 📝 Contributing

When updating documentation:

1. **Keep it accurate** - Test all commands before documenting
2. **Include examples** - Show expected output
3. **Use consistent formatting** - Follow existing patterns
4. **Add diagrams** - Visual aids improve understanding
5. **Update index** - Keep this README current

---

## 📖 Additional Resources

- **Docker Documentation:** https://docs.docker.com
- **Docker Swarm Tutorial:** https://docs.docker.com/engine/swarm/
- **Terraform Docs:** https://www.terraform.io/docs
- **Ansible Docs:** https://docs.ansible.com
- **k6 Documentation:** https://k6.io/docs
- **PostgreSQL Tuning:** https://pgtune.leopard.in.ua
- **Nginx Optimization:** https://www.nginx.com/blog/tuning-nginx

---

## 🔄 Document Version Control

This documentation is version-controlled with the code. Check git history for changes:

```bash
git log --oneline docs/
```

Last Updated: 2026-02-11
