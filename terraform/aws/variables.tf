# ============================================
# AWS Region
# ============================================
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

# ============================================
# EC2 Configuration
# ============================================
variable "key_name" {
  description = "SSH key pair name"
  type        = string
}

variable "manager_instance_type" {
  description = "EC2 instance type for Swarm managers"
  type        = string
  default     = "t3.large"
}

variable "worker_instance_type" {
  description = "EC2 instance type for Swarm workers"
  type        = string
  default     = "t3.xlarge"
}

variable "worker_count" {
  description = "Number of worker nodes"
  type        = number
  default     = 2
}

variable "admin_cidr" {
  description = "CIDR block for admin SSH access"
  type        = string
  default     = "0.0.0.0/0"
}

# ============================================
# RDS Configuration
# ============================================
variable "use_rds" {
  description = "Use RDS PostgreSQL instead of containerized database"
  type        = bool
  default     = false
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.large"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "hosting_db"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "hosting_user"
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

# ============================================
# ElastiCache Configuration
# ============================================
variable "use_elasticache" {
  description = "Use ElastiCache Redis instead of containerized Redis"
  type        = bool
  default     = false
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}
