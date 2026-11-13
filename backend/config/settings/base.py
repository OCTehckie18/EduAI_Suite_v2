import os
import sys
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
from django.core.management.utils import get_random_secret_key
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(os.path.join(BASE_DIR, '.env'))


def _require(name):
    value = os.getenv(name)
    if not value:
        raise ImproperlyConfigured(f'Environment variable {name} must be set.')
    return value


# A random per-process key is used when none is configured, so no known key ever
# signs sessions or JWTs. Production settings require an explicit value.
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY') or get_random_secret_key()
DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'
ALLOWED_HOSTS = os.getenv('DJANGO_ALLOWED_HOSTS',
                          'localhost,127.0.0.1,0.0.0.0').split(',')

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'corsheaders',
    'django_filters',
    'channels',

    # EduAI Core Apps
    'apps.core',
    'apps.accounts',
    'apps.master_admin',
    'apps.institution',
    'apps.classrooms',
    'apps.assignments',
    'apps.announcements',
    'apps.appointments',
    'apps.exams',
    'apps.quizzes',
    'apps.omr',
    'apps.slido',
    'apps.vendor_api',
    'apps.games',
    'apps.lessons',
    'apps.calendar_app',
    'apps.mail',
    'apps.trello_app',
    'apps.forms_app',
    'apps.reports',
    'apps.analytics',
    'apps.ai_chat',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Refuses the API of any module the university switched off (Master Admin > Modules).
    'apps.institution.modules.ModuleSwitchMiddleware',
    # Times are shown in the university's own time zone (Master Admin > Grading and calendar).
    'apps.institution.academic.UniversityTimezoneMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 6}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
# Keep the upload locations used by the previous FastAPI service available
# while Django apps migrate file handling to MEDIA_ROOT.
UPLOADS_ROOT = os.path.join(BASE_DIR, 'uploads')
LOCAL_UPLOADS_ROOT = os.path.join(BASE_DIR, 'local_uploads')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'accounts.User'

# REST Framework Configuration
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'apps.accounts.authentication.EduAIJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    # Trust only the address our own edge proxy appended (the last X-Forwarded-For entry). Without this a caller
    # rotates a made-up X-Forwarded-For per request and never meets a login or refresh limit. Set to 0 with no proxy.
    'NUM_PROXIES': int(os.getenv('NUM_PROXIES', '1')),
    'DEFAULT_THROTTLE_RATES': {
        'login': os.getenv('THROTTLE_LOGIN_RATE', '10/min'),
        'refresh': os.getenv('THROTTLE_REFRESH_RATE', '30/min'),
    },
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
}

JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)

# The locked channel EduAI support uses to manage this university's Master Admins. Empty means the channel is off.
VENDOR_CHANNEL_SECRET = os.getenv('VENDOR_CHANNEL_SECRET', '')
JWT_ACCESS_TOKEN_LIFETIME_MINUTES = int(
    os.getenv('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', '60'))
JWT_REFRESH_TOKEN_LIFETIME_DAYS = int(
    os.getenv('JWT_REFRESH_TOKEN_LIFETIME_DAYS', '7'))
# OAuth client IDs are public identifiers (the client secret remains private).
# Keep the configured project usable when a deployment omits its environment
# file, while still allowing each environment to override this value.
GOOGLE_CLIENT_ID = os.getenv(
    'GOOGLE_CLIENT_ID',
    '',
)

# CORS Configuration
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176'
    ).split(',') if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

# Shared settings consumed by the OAuth, calendar, and AI integrations as
# they are ported from the previous backend.
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')
# Where the Master Admin portal lives: new Master Admins land here from the emailed set-password link.
MASTER_ADMIN_URL = os.getenv('MASTER_ADMIN_URL', 'http://localhost:5175')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
# Where Google sends the user back after they allow calendar access. It must be listed as an
# authorised redirect URI on the Google OAuth client.
GOOGLE_CALENDAR_REDIRECT_URI = os.getenv(
    'GOOGLE_CALENDAR_REDIRECT_URI',
    'http://localhost:8000/api/v1/calendar/google/callback',
)
# Key that encrypts the stored Google refresh tokens (a Fernet key: python -c "from cryptography.fernet
# import Fernet; print(Fernet.generate_key().decode())"). Required outside development.
CALENDAR_TOKEN_KEY = os.getenv('CALENDAR_TOKEN_KEY', '')
GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
REDIS_URL = os.getenv('REDIS_URL', '')

TESTING = 'test' in sys.argv

# Local memory by default. Production points both caches at Redis (production.py) so every worker shares them.
CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    # The university settings; see apps/institution/cache.py. Not cached while running tests.
    'settings': {'BACKEND': 'django.core.cache.backends.dummy.DummyCache' if TESTING else 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'university-settings'},
}

# Celery Configuration
CELERY_BROKER_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
