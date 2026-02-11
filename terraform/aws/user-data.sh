#!/bin/bash
# User data script for EC2 instances

# Update system
apt-get update
apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Add ubuntu user to docker group
usermod -aG docker ubuntu

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Configure Docker daemon
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "metrics-addr": "0.0.0.0:9323",
  "experimental": true
}
EOF

# Restart Docker
systemctl restart docker

# Install useful tools
apt-get install -y htop vim curl wget git nfs-common

# Disable swap
swapoff -a
sed -i '/ swap / s/^/#/' /etc/fstab

# Optimize sysctl
cat >> /etc/sysctl.conf <<EOF
vm.swappiness=10
vm.max_map_count=262144
net.ipv4.ip_forward=1
net.core.somaxconn=4096
EOF

sysctl -p

echo "Instance initialization complete"
