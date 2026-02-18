@echo off
REM ============================================
REM Local Development Setup Script (Windows)
REM ============================================
REM This script prepares your local environment for running the hosting platform
REM with Docker Compose. It creates necessary directories and validates the setup.

echo ============================================
echo   Hosting Platform - Local Setup
echo ============================================
echo.

echo Checking prerequisites...

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo [X] Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)
echo [OK] Docker is installed

REM Check if Docker Compose is installed
docker-compose --version >nul 2>&1
if errorlevel 1 (
    docker compose version >nul 2>&1
    if errorlevel 1 (
        echo [X] Docker Compose is not installed. Please install Docker Desktop first.
        pause
        exit /b 1
    )
)
echo [OK] Docker Compose is installed

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [X] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)
echo [OK] Docker is running

echo.
echo Creating necessary directories...

REM Create upload directory for dashboard
if not exist "uploads" mkdir uploads
echo [OK] Created uploads directory

REM Create data directories for volumes
if not exist "data" mkdir data
if not exist "data\postgres" mkdir data\postgres
if not exist "data\redis" mkdir data\redis
if not exist "data\prometheus" mkdir data\prometheus
if not exist "data\grafana" mkdir data\grafana
if not exist "data\loki" mkdir data\loki
echo [OK] Created data directories

REM Create logs directory
if not exist "logs" mkdir logs
echo [OK] Created logs directory

echo.
echo Validating configuration files...

REM Check if required config files exist
set MISSING_FILES=0

if not exist "docker-compose.yml" (
    echo [X] Required file not found: docker-compose.yml
    set MISSING_FILES=1
)

if not exist "monitoring\prometheus\prometheus.yml" (
    echo [X] Required file not found: monitoring\prometheus\prometheus.yml
    set MISSING_FILES=1
)

if not exist "docker\monitoring\grafana\datasources.yml" (
    echo [X] Required file not found: docker\monitoring\grafana\datasources.yml
    set MISSING_FILES=1
)

if not exist "docker\monitoring\loki\loki-config.yml" (
    echo [X] Required file not found: docker\monitoring\loki\loki-config.yml
    set MISSING_FILES=1
)

if not exist "docker\monitoring\promtail\promtail-config.yml" (
    echo [X] Required file not found: docker\monitoring\promtail\promtail-config.yml
    set MISSING_FILES=1
)

if %MISSING_FILES%==1 (
    echo [X] Some required files are missing!
    pause
    exit /b 1
)

echo [OK] All required configuration files found

REM Check if .env file exists, if not create a sample one
if not exist ".env" (
    echo [!] .env file not found, creating sample .env file...
    (
        echo # ============================================
        echo # Environment Configuration
        echo # ============================================
        echo.
        echo # Node Environment
        echo NODE_ENV=development
        echo.
        echo # PostgreSQL Configuration
        echo POSTGRES_DB=hosting
        echo POSTGRES_USER=postgres
        echo POSTGRES_PASSWORD=change-this-in-production
        echo.
        echo # Redis Configuration
        echo REDIS_PASSWORD=change-this-in-production
        echo.
        echo # Dashboard Configuration
        echo DASHBOARD_USER=admin
        echo DASHBOARD_PASSWORD=admin
        echo SESSION_SECRET=change-this-secret-in-production
        echo.
        echo # Grafana Configuration
        echo GRAFANA_USER=admin
        echo GRAFANA_PASSWORD=admin
    ) > .env
    echo [OK] Created sample .env file - PLEASE REVIEW AND UPDATE PASSWORDS!
) else (
    echo [OK] .env file already exists
)

echo.
echo Validating docker-compose.yml syntax...
docker-compose config >nul 2>&1
if errorlevel 1 (
    docker compose config >nul 2>&1
    if errorlevel 1 (
        echo [X] docker-compose.yml has syntax errors
        pause
        exit /b 1
    )
)
echo [OK] docker-compose.yml syntax is valid

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Review and update .env file with secure passwords
echo   2. Run: docker-compose up -d
echo   3. Access dashboard at: http://localhost:5000
echo   4. Access Grafana at: http://localhost:3001
echo   5. Access Prometheus at: http://localhost:9090
echo.
echo To start the platform:
echo   docker-compose up -d
echo.
echo To view logs:
echo   docker-compose logs -f
echo.
echo To stop the platform:
echo   docker-compose down
echo.
pause
