"""Supabase Storage adapter using the server-side Storage REST API."""

import os
from typing import Optional
from urllib.parse import quote

import requests


class SupabaseStorageService:
    """Storage implementation used by all backend upload workflows."""

    def __init__(self) -> None:
        self.supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.bucket_name = os.getenv("SUPABASE_STORAGE_BUCKET", "edui-presentations")
        self.max_file_size = int(os.getenv("SUPABASE_MAX_FILE_SIZE_BYTES", str(45 * 1024 * 1024)))
        if not self.supabase_url or not self.service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

    @property
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
        }

    def _object_url(self, object_key: str) -> str:
        return f"{self.supabase_url}/storage/v1/object/{quote(self.bucket_name, safe='')}/{quote(object_key, safe='/')}"

    def upload_file(
        self,
        file_content: bytes,
        file_name: str,
        folder: str = "presentations",
        content_type: str = "application/octet-stream",
    ) -> Optional[str]:
        if len(file_content) > self.max_file_size:
            raise ValueError("File exceeds the configured Supabase Storage size limit")

        object_key = f"{folder.strip('/')}/{file_name.lstrip('/')}"
        response = requests.post(
            self._object_url(object_key),
            headers={**self._headers, "Content-Type": content_type, "x-upsert": "false"},
            data=file_content,
            timeout=30,
        )
        if not response.ok:
            raise RuntimeError(f"Supabase Storage upload failed: {response.status_code} {response.text[:200]}")
        return object_key

    def generate_presigned_url(self, object_key: str, expiration: int = 3600, operation: str = "get_object") -> Optional[str]:
        if operation != "get_object":
            raise ValueError("Supabase adapter currently supports signed download URLs only")
        response = requests.post(
            f"{self.supabase_url}/storage/v1/object/sign/{quote(self.bucket_name, safe='')}/{quote(object_key, safe='/')}",
            headers={**self._headers, "Content-Type": "application/json"},
            json={"expiresIn": expiration},
            timeout=10,
        )
        if not response.ok:
            raise RuntimeError(f"Supabase signed URL failed: {response.status_code} {response.text[:200]}")
        signed_url = response.json().get("signedURL") or response.json().get("signedUrl")
        if signed_url and signed_url.startswith("/"):
            return f"{self.supabase_url}{signed_url}"
        return signed_url

    def get_file(self, object_key: str) -> Optional[bytes]:
        response = requests.get(self._object_url(object_key), headers=self._headers, timeout=30)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.content

    def delete_file(self, object_key: str) -> bool:
        response = requests.post(
            f"{self.supabase_url}/storage/v1/object/remove/{quote(self.bucket_name, safe='')}",
            headers={**self._headers, "Content-Type": "application/json"},
            json={"prefixes": [object_key]},
            timeout=10,
        )
        return response.ok

    def list_files(self, folder: str = "presentations", max_keys: int = 100) -> list:
        response = requests.post(
            f"{self.supabase_url}/storage/v1/object/list/{quote(self.bucket_name, safe='')}",
            headers={**self._headers, "Content-Type": "application/json"},
            json={"prefix": folder.strip("/") + "/", "limit": max_keys, "offset": 0},
            timeout=10,
        )
        if not response.ok:
            raise RuntimeError(f"Supabase Storage list failed: {response.status_code} {response.text[:200]}")
        return response.json()

    def get_file_url(self, object_key: str, temporary: bool = True, expiration: int = 3600) -> Optional[str]:
        if temporary:
            return self.generate_presigned_url(object_key, expiration)
        return f"{self.supabase_url}/storage/v1/object/public/{quote(self.bucket_name, safe='')}/{quote(object_key, safe='/')}"
