from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.core.views import HealthCheckView, legacy_health_view, root_view

urlpatterns = [
    path('', root_view, name='root'),
    path('admin/', admin.site.urls),
    
    # Core Health Endpoint
    path('api/v1/health/', HealthCheckView.as_view(), name='health-check'),
    path('api/health', legacy_health_view, name='legacy-health-check'),
    path('api/v1/institution/', include('apps.institution.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static('/uploads/', document_root=settings.UPLOADS_ROOT)
    urlpatterns += static('/local_uploads/', document_root=settings.LOCAL_UPLOADS_ROOT)
