"""Application storage facade backed exclusively by Supabase Storage."""

from typing import Optional
from services.supabase_storage_service import SupabaseStorageService

# Keep the historical class name available to existing imports.
StorageService = SupabaseStorageService
storage_service: Optional[SupabaseStorageService] = None


def get_storage_service() -> SupabaseStorageService:
    """Return the singleton Supabase Storage adapter."""
    global storage_service
    if storage_service is None:
        storage_service = SupabaseStorageService()
    return storage_service
