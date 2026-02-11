# ============================================
# Proxmox Connection Variables
# ============================================
variable "proxmox_api_url" {
  description = "Proxmox API URL"
  type        = string
  default     = "https://proxmox.example.com:8006/api2/json"
}

variable "proxmox_user" {
  description = "Proxmox user (format: user@pam)"
  type        = string
  default     = "root@pam"
}

variable "proxmox_password" {
  description = "Proxmox password"
  type        = string
  sensitive   = true
}

variable "proxmox_tls_insecure" {
  description = "Skip TLS verification"
  type        = bool
  default     = true
}

variable "proxmox_node" {
  description = "Proxmox node name"
  type        = string
  default     = "pve"
}

# ============================================
# VM Configuration Variables
# ============================================
variable "template_name" {
  description = "Name of the VM template to clone"
  type        = string
  default     = "ubuntu-22.04-template"
}

variable "storage_name" {
  description = "Storage pool name"
  type        = string
  default     = "local-lvm"
}

variable "worker_count" {
  description = "Number of worker nodes"
  type        = number
  default     = 2
}

# ============================================
# Network Variables
# ============================================
variable "network_bridge" {
  description = "Network bridge"
  type        = string
  default     = "vmbr0"
}

variable "network_gateway" {
  description = "Network gateway"
  type        = string
  default     = "10.0.1.1"
}

variable "dns_servers" {
  description = "DNS servers"
  type        = string
  default     = "8.8.8.8,8.8.4.4"
}
