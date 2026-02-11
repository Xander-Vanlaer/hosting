# ============================================
# Outputs
# ============================================

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_url" {
  description = "URL to access the application"
  value       = "http://${aws_lb.main.dns_name}"
}

output "swarm_manager_ips" {
  description = "Public IP addresses of Swarm manager nodes"
  value       = aws_instance.swarm_manager[*].public_ip
}

output "swarm_worker_ips" {
  description = "Public IP addresses of Swarm worker nodes"
  value       = aws_instance.swarm_worker[*].public_ip
}

output "efs_id" {
  description = "EFS file system ID"
  value       = aws_efs_file_system.main.id
}

output "efs_dns_name" {
  description = "EFS DNS name for mounting"
  value       = aws_efs_file_system.main.dns_name
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = var.use_rds ? aws_db_instance.postgres[0].endpoint : null
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = var.use_elasticache ? aws_elasticache_cluster.redis[0].cache_nodes[0].address : null
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "ssh_commands" {
  description = "SSH commands to connect to instances"
  value = {
    manager = "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${aws_instance.swarm_manager[0].public_ip}"
    workers = [for i, ip in aws_instance.swarm_worker[*].public_ip : "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${ip}"]
  }
}
