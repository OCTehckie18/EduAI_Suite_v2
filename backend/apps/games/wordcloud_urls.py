from django.urls import path

from .views import WordCloudSessionDetailView, WordCloudSessionListCreateView


urlpatterns = [
    path("create", WordCloudSessionListCreateView.as_view(), name="wordcloud-create"),
    path("", WordCloudSessionListCreateView.as_view(), name="wordcloud-list"),
    path("<str:pin>", WordCloudSessionDetailView.as_view(), name="wordcloud-detail"),
]
