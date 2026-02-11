# ============================================
# Proxmox Provider Configuration
# ============================================
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    proxmox = {
      source  = "telmate/proxmox"
      version = "~> 2.9"
    }
  }
}

provider "proxmox" {
  pm_api_url      = var.proxmox_api_url
  pm_user         = var.proxmox_user
  pm_password     = var.proxmox_password
  pm_tls_insecure = var.proxmox_tls_insecure
}

# ============================================
# Docker Swarm Manager
# ============================================
resource "proxmox_vm_qemu" "swarm_manager" {
  count       = 1
  name        = "swarm-manager-${format("%02d", count.index + 1)}"
  target_node = var.proxmox_node
  clone       = var.template_name
  
  cores   = 4
  sockets = 1
  memory  = 8192
  
  disk {
    size    = "100G"
    type    = "scsi"
    storage = var.storage_name
    ssd     = 1
  }
  
  network {
    model  = "virtio"
    bridge = "vmbr0"
  }
  
  ipconfig0 = "ip=10.0.1.${10 + count.index}/24,gw=10.0.1.1"
  
  tags = "swarm,manager,docker"
  
  lifecycle {
    ignore_changes = [
      network,
    ]
  }
}

# ============================================
# Docker Swarm Workers
# ============================================
resource "proxmox_vm_qemu" "swarm_worker" {
  count       = var.worker_count
  name        = "swarm-worker-${format("%02d", count.index + 1)}"
  target_node = var.proxmox_node
  clone       = var.template_name
  
  cores   = 8
  sockets = 1
  memory  = 16384
  
  disk {
    size    = "200G"
    type    = "scsi"
    storage = var.storage_name
    ssd     = 1
  }
  
  network {
    model  = "virtio"
    bridge = "vmbr0"
  }
  
  ipconfig0 = "ip=10.0.1.${11 + count.index}/24,gw=10.0.1.1"
  
  tags = "swarm,worker,docker"
  
  lifecycle {
    ignore_changes = [
      network,
    ]
  }
}

# ============================================
# NFS Storage Server
# ============================================
resource "proxmox_vm_qemu" "nfs_storage" {
  count       = 1
  name        = "nfs-storage-01"
  target_node = var.proxmox_node
  clone       = var.template_name
  
  cores   = 2
  sockets = 1
  memory  = 4096
  
  disk {
    size    = "100G"
    type    = "scsi"
    storage = var.storage_name
    ssd     = 1
  }
  
  # Additional disk for data
  disk {
    size    = "1000G"
    type    = "scsi"
    storage = var.storage_name
  }
  
  network {
    model  = "virtio"
    bridge = "vmbr0"
  }
  
  ipconfig0 = "ip=10.0.1.20/24,gw=10.0.1.1"
  
  tags = "storage,nfs"
}

# ============================================
# Monitoring Server
# ============================================
resource "proxmox_vm_qemu" "monitoring" {
  count       = 1
  name        = "monitoring-01"
  target_node = var.proxmox_node
  clone       = var.template_name
  
  cores   = 4
  sockets = 1
  memory  = 8192
  
  disk {
    size    = "100G"
    type    = "scsi"
    storage = var.storage_name
    ssd     = 1
  }
  
  network {
    model  = "virtio"
    bridge = "vmbr0"
  }
  
  ipconfig0 = "ip=10.0.1.30/24,gw=10.0.1.1"
  
  tags = "monitoring,prometheus,grafana"
}
