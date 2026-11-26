# syntax=docker/dockerfile:1.7
# TaskFlow Laravel API: PHP-FPM + Nginx in one container, listening on :8000

ARG PHP_VERSION=8.3

############################################
# 1) vendor: install production PHP dependencies
############################################
FROM composer:2.8 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install \
      --no-dev --no-interaction --no-progress --prefer-dist \
      --no-scripts --no-autoloader --ignore-platform-reqs

############################################
# 2) base: PHP runtime with only the extensions we need
############################################
FROM php:${PHP_VERSION}-fpm-alpine AS base

RUN apk add --no-cache nginx supervisor curl libpq icu-libs libzip \
 && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS postgresql-dev icu-dev libzip-dev \
 && docker-php-ext-install -j"$(nproc)" pdo_pgsql pcntl opcache intl zip bcmath \
 && apk del .build-deps \
 && rm -rf /tmp/* /var/cache/apk/*

COPY --from=composer:2.8 /usr/bin/composer /usr/bin/composer
COPY docker/php/php.ini        /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/php/www.conf       /usr/local/etc/php-fpm.d/zz-www.conf
COPY docker/nginx/default.conf /etc/nginx/http.d/default.conf
COPY docker/supervisord.conf   /etc/supervisord.conf
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/entrypoint

WORKDIR /var/www/html

############################################
# 3) runtime: application code
############################################
FROM base AS runtime

ENV APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr

COPY --from=vendor --chown=www-data:www-data /app/vendor ./vendor
COPY --chown=www-data:www-data . .

RUN composer dump-autoload --optimize --classmap-authoritative --no-dev \
 && rm -f bootstrap/cache/*.php \
 && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs \
 && chown -R www-data:www-data storage bootstrap/cache \
 && mkdir -p /run/nginx /var/lib/nginx/tmp /var/log/nginx \
 && chown -R www-data:www-data /run/nginx /var/lib/nginx /var/log/nginx

USER www-data

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

ENTRYPOINT ["entrypoint"]
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
