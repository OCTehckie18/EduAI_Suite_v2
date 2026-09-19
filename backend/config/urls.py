from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from apps.core.views import HealthCheckView, legacy_health_view, root_view, ActionHistoryListCreateView
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
    path('history/', ActionHistoryListCreateView.as_view(), name='legacy-history'),
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
    path('api/courses/', include('apps.classrooms.legacy_urls')),
    path('courses/', include('apps.classrooms.legacy_urls')),
    path('api/v1/students/', include((student_urlpatterns, 'students'))),
    path('api/students/', include((student_urlpatterns, 'api-students'))),
    path('students/', include((student_urlpatterns, 'legacy-students'))),
    path('resources/', include((resource_urlpatterns, 'resources'))),
    path('api/v1/resources/', include((resource_urlpatterns, 'api-resources'))),

    # Announcements
    path('api/v1/announcements/', include('apps.announcements.urls')),
    path('announcements/', include('apps.announcements.urls')),

    # Assignments & Submissions
    path('api/v1/assignments/', include((assignment_urlpatterns, 'assignments'))),
    path('assignments/', include((assignment_urlpatterns, 'legacy-assignments'))),
    path('api/v1/submissions/', include((submission_urlpatterns, 'submissions'))),
    path('submissions/', include((submission_urlpatterns, 'legacy-submissions'))),

    # Appointments
    path('api/v1/appointments/', include('apps.appointments.urls')),
    path('appointments/', include('apps.appointments.urls')),

    # Lessons
    path('api/v1/lessons/', include('apps.lessons.urls')),
    path('lessons/', include('apps.lessons.urls')),

    # Exams
    path('api/v1/exams/', include('apps.exams.urls')),
    path('exams/', include('apps.exams.urls')),

    # Calendar
    path('api/v1/calendar/', include('apps.calendar_app.urls')),
    path('calendar/', include('apps.calendar_app.urls')),

    # Mail
    path('api/v1/mail/', include('apps.mail.urls')),
    path('mail/', include('apps.mail.urls')),

    # Reports
    path('api/v1/reports/', include('apps.reports.urls')),
    path('reports/', include('apps.reports.urls')),

    # Analytics & Dashboard
    path('api/v1/api/dashboard/', include('apps.analytics.urls')),
    path('api/v1/dashboard/', include('apps.analytics.urls')),
    path('api/dashboard/', include('apps.analytics.urls')),
    path('dashboard/', include('apps.analytics.urls')),
    path('api/v1/analytics/', include('apps.analytics.urls')),
    path('analytics/', include('apps.analytics.urls')),

    # Engagement
    path('api/v1/api/engagement/', include('apps.analytics.engagement_urls')),
    path('api/v1/engagement/', include('apps.analytics.engagement_urls')),
    path('api/engagement/', include('apps.analytics.engagement_urls')),
    path('engagement/', include('apps.analytics.engagement_urls')),

    # EduGames: Chain Answer & Word Games
    path('api/v1/games/', include('apps.games.urls')),
    path('games/', include('apps.games.urls')),

    # Quizzes: Live & Solo
    path('api/v1/quizzes/', include('apps.quizzes.urls')),
    path('quizzes/', include('apps.quizzes.urls')),

    # Slido: Interactive Presentations & Q&A
    path('api/v1/api/slido/', include('apps.slido.urls')),
    path('api/v1/slido/', include('apps.slido.urls')),
    path('api/slido/', include('apps.slido.urls')),
    path('slido/', include('apps.slido.urls')),

    # OMR Evaluation
    path('api/v1/omr/', include('apps.omr.urls')),
    path('omr/', include('apps.omr.urls')),

    # Trello
    path('api/v1/trello/', include('apps.trello_app.urls')),
    path('trello/', include('apps.trello_app.urls')),

    # AI Chat
    path('api/v1/ai/', include('apps.ai_chat.urls')),
    path('ai/', include('apps.ai_chat.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL,
                          document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL,
                          document_root=settings.STATIC_ROOT)
    urlpatterns += static('/uploads/', document_root=settings.UPLOADS_ROOT)
    urlpatterns += static('/local_uploads/',
                          document_root=settings.LOCAL_UPLOADS_ROOT)
