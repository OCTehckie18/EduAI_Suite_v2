from .base import *
import dj_database_url

DEBUG = True

# Database Configuration with seamless SQLite fallback for immediate testing
DATABASE_URL = os.getenv('DATABASE_URL')
USE_SQLITE_FALLBACK = os.getenv('USE_SQLITE_FALLBACK', 'True') == 'True'

try:
    if DATABASE_URL and not USE_SQLITE_FALLBACK:
        DATABASES = {
            'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
        }
    else:
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
            }
        }
except Exception:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
        }
    }

# In-memory channel layer for local development if Redis is offline
REDIS_URL = os.getenv('REDIS_URL')
if REDIS_URL and not USE_SQLITE_FALLBACK:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [REDIS_URL]},
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer'
        }
    }
