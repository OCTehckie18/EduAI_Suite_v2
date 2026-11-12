from .base import *
from .base import _require
import dj_database_url

DEBUG = False
SECRET_KEY = _require('DJANGO_SECRET_KEY')
JWT_SECRET_KEY = _require('JWT_SECRET_KEY')
CORS_ALLOW_ALL_ORIGINS = False
ALLOWED_HOSTS = [h.strip() for h in _require('DJANGO_ALLOWED_HOSTS').split(',') if h.strip()]

DATABASES = {
    'default': dj_database_url.config(
        default=_require('DATABASE_URL'),
        conn_max_age=600,
        ssl_require=True
    )
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {'hosts': [_require('REDIS_URL')]},
    },
}

# One shared cache for every worker: login throttles count globally and a settings change shows everywhere at once.
CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': _require('REDIS_URL'), 'KEY_PREFIX': 'eduai'},
    'settings': {'BACKEND': 'django.core.cache.backends.redis.RedisCache', 'LOCATION': _require('REDIS_URL'), 'KEY_PREFIX': 'eduai-settings'},
}

SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

SECURE_SSL_REDIRECT = os.getenv('SECURE_SSL_REDIRECT', 'True') == 'True'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_REFERRER_POLICY = 'same-origin'
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()]
