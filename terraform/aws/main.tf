# ============================================
# AWS Provider Configuration
# ============================================
terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ============================================
# VPC Configuration
# ============================================
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "hosting-vpc"
    Environment = var.environment
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "hosting-igw"
  }
}

# Subnets
resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "hosting-public-${count.index + 1}"
  }
}

# Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "hosting-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# ============================================
# Security Groups
# ============================================

# Application Load Balancer Security Group
resource "aws_security_group" "alb" {
  name        = "hosting-alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "hosting-alb-sg"
  }
}

# Application Instances Security Group
resource "aws_security_group" "app" {
  name        = "hosting-app-sg"
  description = "Security group for application instances"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    cidr_blocks     = [var.admin_cidr]
    description     = "SSH access"
  }

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
    description     = "Application port from ALB"
  }

  ingress {
    from_port   = 2377
    to_port     = 2377
    protocol    = "tcp"
    self        = true
    description = "Docker Swarm management"
  }

  ingress {
    from_port   = 7946
    to_port     = 7946
    protocol    = "tcp"
    self        = true
    description = "Docker Swarm overlay network"
  }

  ingress {
    from_port   = 4789
    to_port     = 4789
    protocol    = "udp"
    self        = true
    description = "Docker Swarm overlay network"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "hosting-app-sg"
  }
}

# ============================================
# EC2 Instances - Swarm Manager
# ============================================
resource "aws_instance" "swarm_manager" {
  count                  = 1
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.manager_instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.app.id]
  key_name               = var.key_name

  root_block_device {
    volume_size = 100
    volume_type = "gp3"
  }

  user_data = file("${path.module}/user-data.sh")

  tags = {
    Name = "swarm-manager-${format("%02d", count.index + 1)}"
    Role = "manager"
  }
}

# ============================================
# EC2 Instances - Swarm Workers
# ============================================
resource "aws_instance" "swarm_worker" {
  count                  = var.worker_count
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.worker_instance_type
  subnet_id              = aws_subnet.public[count.index % 3].id
  vpc_security_group_ids = [aws_security_group.app.id]
  key_name               = var.key_name

  root_block_device {
    volume_size = 200
    volume_type = "gp3"
  }

  user_data = file("${path.module}/user-data.sh")

  tags = {
    Name = "swarm-worker-${format("%02d", count.index + 1)}"
    Role = "worker"
  }
}

# ============================================
# Application Load Balancer
# ============================================
resource "aws_lb" "main" {
  name               = "hosting-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = {
    Name = "hosting-alb"
  }
}

resource "aws_lb_target_group" "app" {
  name     = "hosting-app-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = {
    Name = "hosting-app-tg"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Attach instances to target group
resource "aws_lb_target_group_attachment" "manager" {
  count            = 1
  target_group_arn = aws_lb_target_group.app.arn
  target_id        = aws_instance.swarm_manager[count.index].id
  port             = 80
}

resource "aws_lb_target_group_attachment" "workers" {
  count            = var.worker_count
  target_group_arn = aws_lb_target_group.app.arn
  target_id        = aws_instance.swarm_worker[count.index].id
  port             = 80
}

# ============================================
# AMI Data Source
# ============================================
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ============================================
# EFS for Shared Storage
# ============================================
resource "aws_efs_file_system" "main" {
  creation_token = "hosting-efs"
  encrypted      = true

  tags = {
    Name = "hosting-efs"
  }
}

resource "aws_efs_mount_target" "main" {
  count           = 3
  file_system_id  = aws_efs_file_system.main.id
  subnet_id       = aws_subnet.public[count.index].id
  security_groups = [aws_security_group.app.id]
}

# ============================================
# RDS PostgreSQL (Optional - Alternative to Docker PostgreSQL)
# ============================================
resource "aws_db_subnet_group" "main" {
  name       = "hosting-db-subnet"
  subnet_ids = aws_subnet.public[*].id

  tags = {
    Name = "hosting-db-subnet"
  }
}

resource "aws_db_instance" "postgres" {
  count = var.use_rds ? 1 : 0

  identifier           = "hosting-postgres"
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = var.db_instance_class
  allocated_storage    = 100
  storage_type         = "gp3"
  storage_encrypted    = true
  
  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.app.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  skip_final_snapshot = true

  tags = {
    Name = "hosting-postgres"
  }
}

# ============================================
# ElastiCache Redis (Optional)
# ============================================
resource "aws_elasticache_subnet_group" "main" {
  name       = "hosting-redis-subnet"
  subnet_ids = aws_subnet.public[*].id
}

resource "aws_elasticache_cluster" "redis" {
  count = var.use_elasticache ? 1 : 0

  cluster_id           = "hosting-redis"
  engine               = "redis"
  node_type            = var.redis_node_type
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.app.id]

  tags = {
    Name = "hosting-redis"
  }
}
