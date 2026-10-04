from .base import *
import dj_database_url

DEBUG = False
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

SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
