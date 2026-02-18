FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appuser -g appuser appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "index.js"]
