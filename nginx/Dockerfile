FROM nginx:alpine

# Install tools for health checks
RUN apk add --no-cache wget

# Copy configuration files
COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/ /etc/nginx/conf.d/

# Create cache directory
RUN mkdir -p /var/cache/nginx && \
    chown -R nginx:nginx /var/cache/nginx

# Health check endpoint
RUN echo "OK" > /usr/share/nginx/html/health

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
