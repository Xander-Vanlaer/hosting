# ============================================
# Outputs
# ============================================

output "swarm_manager_ips" {
  description = "IP addresses of Swarm manager nodes"
  value       = proxmox_vm_qemu.swarm_manager[*].default_ipv4_address
}

output "swarm_worker_ips" {
  description = "IP addresses of Swarm worker nodes"
  value       = proxmox_vm_qemu.swarm_worker[*].default_ipv4_address
}

output "nfs_storage_ip" {
  description = "IP address of NFS storage server"
  value       = proxmox_vm_qemu.nfs_storage[*].default_ipv4_address
}

output "monitoring_ip" {
  description = "IP address of monitoring server"
  value       = proxmox_vm_qemu.monitoring[*].default_ipv4_address
}

output "all_vms" {
  description = "All VM details"
  value = {
    managers   = proxmox_vm_qemu.swarm_manager[*].name
    workers    = proxmox_vm_qemu.swarm_worker[*].name
    storage    = proxmox_vm_qemu.nfs_storage[*].name
    monitoring = proxmox_vm_qemu.monitoring[*].name
  }
}
