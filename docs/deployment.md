# 🚀 Deployment Guide

## VM Specifications

| Node | Role | CPU | RAM | Storage | OS | IP Address |
|------|------|-----|-----|---------|----|------------|
| swarm-manager-01 | Swarm Manager | 4 cores | 8GB | 100GB SSD | Ubuntu 22.04 | 10.0.1.10 |
| swarm-worker-01 | Swarm Worker | 8 cores | 16GB | 200GB SSD | Ubuntu 22.04 | 10.0.1.11 |
| swarm-worker-02 | Swarm Worker | 8 cores | 16GB | 200GB SSD | Ubuntu 22.04 | 10.0.1.12 |
| nfs-storage-01 | Storage Server | 2 cores | 4GB | 1TB HDD | Ubuntu 22.04 | 10.0.1.20 |
| monitoring-01 | Monitoring | 4 cores | 8GB | 100GB SSD | Ubuntu 22.04 | 10.0.1.30 |

---

## Network Configuration

```
VLAN 10: Management (10.0.1.0/24)
VLAN 20: Application (10.0.2.0/24)
VLAN 30: Database (10.0.3.0/24)
VLAN 40: Monitoring (10.0.4.0/24)
```

---

## Deployment Steps

### Step 1: VM Provisioning (Terraform)

```bash
cd terraform/proxmox

# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Apply configuration
terraform apply

# Note the output IP addresses
terraform output
```

**Expected Output:**
```
swarm_manager_ips = ["10.0.1.10"]
swarm_worker_ips = ["10.0.1.11", "10.0.1.12"]
nfs_storage_ip = ["10.0.1.20"]
monitoring_ip = ["10.0.1.30"]
```

---

### Step 2: Base System Setup (Ansible)

```bash
cd ansible

# Test connectivity
ansible all -i inventory/production -m ping

# Run base setup
ansible-playbook -i inventory/production playbooks/base-setup.yml
```

**What this does:**
- Updates all packages
- Installs base utilities
- Configures sysctl for performance
- Disables swap
- Sets timezone to UTC

---

### Step 3: Docker Installation

```bash
ansible-playbook -i inventory/production playbooks/setup-docker.yml
```

**Verifies:**
```bash
ansible swarm -i inventory/production -a "docker --version"
```

**Expected:** `Docker version 24.0.x`

---

### Step 4: Docker Swarm Initialization

#### On Manager Node (Manual Method)

```bash
# SSH to manager
ssh ubuntu@10.0.1.10

# Initialize Swarm
docker swarm init --advertise-addr 10.0.1.10

# Get worker join token
docker swarm join-token worker
```

#### Join Workers

```bash
# On worker-01
ssh ubuntu@10.0.1.11
docker swarm join --token <WORKER-TOKEN> 10.0.1.10:2377

# On worker-02
ssh ubuntu@10.0.1.12
docker swarm join --token <WORKER-TOKEN> 10.0.1.10:2377
```

#### Or Use Ansible (Automated Method)

```bash
ansible-playbook -i inventory/production playbooks/deploy-swarm.yml
```

#### Verify Swarm

```bash
ssh ubuntu@10.0.1.10
docker node ls
```

**Expected Output:**
```
ID                HOSTNAME          STATUS    AVAILABILITY   MANAGER STATUS
abc123 *          swarm-manager-01  Ready     Active         Leader
def456            swarm-worker-01   Ready     Active
ghi789            swarm-worker-02   Ready     Active
```

---

### Step 5: NFS Storage Setup

#### On NFS Server (10.0.1.20)

```bash
ssh ubuntu@10.0.1.20

# Install NFS server
sudo apt update
sudo apt install nfs-kernel-server -y

# Create export directories
sudo mkdir -p /mnt/storage/{postgres,redis,uploads}
sudo chown -R nobody:nogroup /mnt/storage
sudo chmod 755 /mnt/storage

# Configure exports
sudo tee /etc/exports <<EOF
/mnt/storage/postgres 10.0.1.0/24(rw,sync,no_subtree_check,no_root_squash)
/mnt/storage/redis 10.0.1.0/24(rw,sync,no_subtree_check,no_root_squash)
/mnt/storage/uploads 10.0.1.0/24(rw,sync,no_subtree_check,no_root_squash)
EOF

# Apply exports
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
```

#### Mount on Swarm Nodes

```bash
# On all Swarm nodes
for host in 10.0.1.10 10.0.1.11 10.0.1.12; do
  ssh ubuntu@$host <<'ENDSSH'
    sudo apt install nfs-common -y
    sudo mkdir -p /mnt/nfs
    sudo mount -t nfs 10.0.1.20:/mnt/storage /mnt/nfs
    echo "10.0.1.20:/mnt/storage /mnt/nfs nfs defaults 0 0" | sudo tee -a /etc/fstab
ENDSSH
done
```

---

### Step 6: Deploy Application Stack

#### Prepare Environment

```bash
# On manager node
ssh ubuntu@10.0.1.10

# Create deployment directory
sudo mkdir -p /opt/hosting
cd /opt/hosting

# Copy files (from your local machine)
scp docker-compose.prod.yml ubuntu@10.0.1.10:/opt/hosting/
scp .env ubuntu@10.0.1.10:/opt/hosting/
```

#### Configure Environment Variables

```bash
# On manager node
cd /opt/hosting
vim .env

# Set production values:
POSTGRES_USER=hosting_user
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=hosting_db
REDIS_PASSWORD=<strong-password>
GRAFANA_PASSWORD=<strong-password>
VERSION=latest
DOCKER_REGISTRY=ghcr.io/your-org
```

#### Deploy Stack

```bash
docker stack deploy -c docker-compose.prod.yml hosting
```

#### Monitor Deployment

```bash
# Watch services starting
watch -n 2 'docker stack services hosting'

# Check individual service status
docker stack ps hosting

# View logs
docker service logs -f hosting_app
```

**Wait for all services to show 1/1 or 5/5 replicas running**

---

### Step 7: Monitoring Installation

```bash
ansible-playbook -i inventory/production playbooks/setup-monitoring.yml
```

#### Verify Monitoring

```bash
# Prometheus
curl http://10.0.1.30:9090/-/healthy

# Grafana
curl http://10.0.1.30:3000/api/health
```

#### Access Dashboards

- **Prometheus:** http://10.0.1.30:9090
- **Grafana:** http://10.0.1.30:3000 (admin/admin)

---

### Step 8: Verification

#### Service Status

```bash
# On manager node
docker service ls
```

**Expected:** All services showing desired replicas

```
ID             NAME               MODE         REPLICAS   IMAGE
abc123         hosting_nginx      replicated   2/2        nginx:alpine
def456         hosting_app        replicated   5/5        hosting-app:latest
ghi789         hosting_postgres   replicated   1/1        postgres:15-alpine
jkl012         hosting_redis      replicated   1/1        redis:7-alpine
```

#### Health Checks

```bash
# Application health
curl http://10.0.1.10/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-02-11T14:00:00.000Z",
  "hostname": "app-1",
  "database": "connected",
  "redis": "connected"
}
```

#### API Tests

```bash
# Get users
curl http://10.0.1.10/api/users

# Create user
curl -X POST http://10.0.1.10/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com"}'

# Get metrics
curl http://10.0.1.10/metrics
```

#### Database Connection

```bash
docker exec -it $(docker ps -q -f name=postgres-primary) psql -U hosting_user -d hosting_db

# Run test query
SELECT COUNT(*) FROM users;
```

---

## Post-Deployment Tasks

### 1. Configure Backups

```bash
# On manager node
crontab -e

# Add daily backup at 2 AM
0 2 * * * /opt/hosting/scripts/backup.sh >> /var/log/backup.log 2>&1
```

### 2. Setup Monitoring Alerts

Configure Prometheus alert rules and Grafana notifications.

### 3. Document Credentials

Store all passwords in a secure password manager.

### 4. Configure Firewall

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 2377/tcp  # Swarm
sudo ufw allow 7946/tcp  # Swarm overlay
sudo ufw allow 4789/udp  # Swarm overlay
sudo ufw enable
```

---

## Rollback Procedure

If deployment fails:

```bash
# Remove stack
docker stack rm hosting

# Wait for cleanup
sleep 30

# Redeploy previous version
export VERSION=<previous-version>
docker stack deploy -c docker-compose.prod.yml hosting
```

---

## Troubleshooting

### Services Not Starting

```bash
# Check service logs
docker service logs hosting_app

# Check node resources
docker node inspect swarm-worker-01

# Check network
docker network ls
docker network inspect hosting_backend
```

### Database Connection Issues

```bash
# Test database connectivity
docker exec -it $(docker ps -q -f name=postgres) psql -U hosting_user -d hosting_db

# Check logs
docker service logs hosting_postgres
```

### Performance Issues

```bash
# Check resource usage
docker stats

# Scale up
docker service scale hosting_app=10
```

---

## Maintenance Windows

**Recommended Schedule:**
- Major updates: Monthly, Sunday 2-6 AM
- Minor updates: Weekly, Sunday 3-4 AM
- Emergency patches: As needed

**Notification:** 48 hours advance notice to stakeholders
