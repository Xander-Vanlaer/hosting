FROM node:18-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

# Create non-root user
RUN addgroup -g 1001 -S dashboard && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G dashboard -g dashboard dashboard && \
    chown -R dashboard:dashboard /app

# Switch to non-root user
USER dashboard

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start server
CMD ["node", "server.js"]
