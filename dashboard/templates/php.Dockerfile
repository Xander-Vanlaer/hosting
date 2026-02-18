FROM php:8.2-apache

WORKDIR /var/www/html

# Install PHP extensions
RUN docker-php-ext-install pdo pdo_mysql mysqli

# Copy application code
COPY . .

# Set permissions
RUN chown -R www-data:www-data /var/www/html

# Expose port
EXPOSE 80

# Start Apache
CMD ["apache2-foreground"]
