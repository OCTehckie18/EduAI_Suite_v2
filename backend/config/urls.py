from django.contrib import admin
from django.urls import path, re_path, include
from django.views.decorators.clickjacking import xframe_options_sameorigin
from django.views.static import serve as serve_file
from django.conf import settings
from django.conf.urls.static import static

from apps.core.views import HealthCheckView, legacy_health_view, root_view, ActionHistoryListCreateView, NotificationListView, NotificationReadView
from apps.classrooms.legacy_urls import student_urlpatterns, resource_urlpatterns
from apps.assignments.urls import assignment_urlpatterns, submission_urlpatterns

urlpatterns = [
    path('', root_view, name='root'),
    path('admin/', admin.site.urls),

    # Core Health & Status Endpoints
    path('api/v1/health/', HealthCheckView.as_view(), name='health-check'),
    path('api/health', legacy_health_view, name='legacy-health-check'),
    path('health', legacy_health_view, name='root-health-check'),

    # History & Action Log Endpoints
    path('api/v1/notifications', NotificationListView.as_view(), name='api-notifications'),
    path('api/v1/notifications/read', NotificationReadView.as_view(), name='api-notifications-read'),
    path('api/v1/history/', ActionHistoryListCreateView.as_view(), name='api-history'),

    # Auth & Accounts
    path('api/v1/auth/', include('apps.accounts.urls')),

    # Master Admin
    path('api/v1/master-admin/', include('apps.master_admin.urls')),

    # Institution
    path('api/v1/institution/', include('apps.institution.urls')),

    # Classrooms & Legacy Courses
    path('api/v1/classrooms/', include('apps.classrooms.urls')),
    path('api/v1/courses/', include('apps.classrooms.legacy_urls')),
    path('api/v1/students/', include((student_urlpatterns, 'students'))),
    path('api/v1/resources/', include((resource_urlpatterns, 'api-resources'))),

    # Announcements
    path('api/v1/announcements/', include('apps.announcements.urls')),

    # Assignments & Submissions
    path('api/v1/assignments/', include((assignment_urlpatterns, 'assignments'))),
    path('api/v1/submissions/', include((submission_urlpatterns, 'submissions'))),

    # Appointments
    path('api/v1/appointments/', include('apps.appointments.urls')),

    # Lessons
    path('api/v1/lessons/', include('apps.lessons.urls')),

    # Exams
    path('api/v1/exams/', include('apps.exams.urls')),

    # Calendar
    path('api/v1/calendar/', include('apps.calendar_app.urls')),

    # Mail
    path('api/v1/mail/', include('apps.mail.urls')),

    # Reports
    path('api/v1/reports/', include('apps.reports.urls')),

    # Analytics & Dashboard
    path('api/v1/dashboard/', include('apps.analytics.urls')),
    path('api/v1/analytics/', include('apps.analytics.urls')),

    # Engagement
    path('api/v1/engagement/', include('apps.analytics.engagement_urls')),

    # EduGames: Chain Answer & Word Games
    path('api/v1/games/', include('apps.games.urls')),
    path('api/v1/wordcloud/', include('apps.games.wordcloud_urls')),

    # Quizzes: Live & Solo
    path('api/v1/quizzes/', include('apps.quizzes.urls')),

    # Slido: Interactive Presentations & Q&A
    path('api/v1/slido/', include('apps.slido.urls')),

    # OMR Evaluation
    path('api/v1/omr/', include('apps.omr.urls')),

    # Trello
    path('api/v1/trello/', include('apps.trello_app.urls')),
    path('api/v1/', include('apps.forms_app.urls')),

    # Uploaded files (submissions, announcements, OMR scans). Stored paths look like /uploads/...
    # and the apps prefix them with the API base, so both spellings are served. Names are random
    # and unguessable. Framing is allowed from the same origin so a PDF can preview in a page.
    re_path(r'^api/v1/uploads/(?P<path>.*)$', xframe_options_sameorigin(serve_file), {'document_root': settings.UPLOADS_ROOT}),
    re_path(r'^uploads/(?P<path>.*)$', xframe_options_sameorigin(serve_file), {'document_root': settings.UPLOADS_ROOT}),

    # AI Chat
    path('api/v1/ai/', include('apps.ai_chat.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL,
                          document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)
    urlpatterns += static('/uploads/', document_root=settings.UPLOADS_ROOT)
    urlpatterns += static('/local_uploads/',
                          document_root=settings.LOCAL_UPLOADS_ROOT)
