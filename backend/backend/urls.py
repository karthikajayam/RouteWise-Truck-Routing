from django.contrib import admin
from django.urls import path
from routing.views import home, plan_route

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", home, name="home"),
    path("api/plan-route/", plan_route, name="plan_route"),
]