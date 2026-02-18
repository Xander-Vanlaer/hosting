# ============================================
# Nginx Reverse Proxy Dockerfile
# ============================================
FROM nginx:alpine

# Install wget for healthchecks
RUN apk add --no-cache wget

# Create cache directory
RUN mkdir -p /var/cache/nginx && \
    chown -R nginx:nginx /var/cache/nginx

# Expose port 8080 (internal reverse proxy port)
EXPOSE 8080

# Health check endpoint will be handled by nginx config
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
