"""Uploads: profile photos are public, documents are not; S3 and local disk
behave the same to callers."""

from app.core.config import settings
from app.services import storage
from tests.test_documents import PDF, _upload

PNG = ("me.png", b"\x89PNG\r\n\x1a\nfake", "image/png")


def test_avatar_is_served_publicly(client, auth_headers):
    body = client.post("/api/v1/users/me/avatar", headers=auth_headers, files={"file": PNG}).json()
    url = body["user"]["avatarUrl"]
    assert url.startswith("/uploads/avatars/")

    response = client.get(url)
    assert response.status_code == 200
    assert response.content == PNG[1]
    assert response.headers["content-type"] == "image/png"


def test_documents_are_not_reachable_through_uploads(client, auth_headers, db_session):
    from app.models.document import Document

    _upload(client, auth_headers)
    key = db_session.query(Document).one().file_path

    assert client.get(f"/uploads/{key}").status_code == 404
    assert client.get(f"/uploads/avatars/{key}").status_code == 404
    assert client.get("/uploads/avatars/../1/x.pdf").status_code == 404


class _FakeS3:
    """Just the calls storage makes, kept in a dict."""

    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[(Bucket, Key)] = (Body, ContentType)

    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            # What the live role gets for a missing key: no s3:ListBucket,
            # so S3 says AccessDenied instead of NoSuchKey.
            from botocore.exceptions import ClientError

            raise ClientError({"Error": {"Code": "AccessDenied"}}, "GetObject")

        class _Body:
            def __init__(self, data):
                self.data = data

            def read(self):
                return self.data

        return {"Body": _Body(self.objects[(Bucket, Key)][0])}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)


def test_s3_backend_stores_serves_and_deletes(client, auth_headers, monkeypatch):
    fake = _FakeS3()
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "S3_BUCKET", "test-bucket")
    monkeypatch.setattr(storage, "_s3", lambda: fake)

    document_id = _upload(client, auth_headers).json()["id"]
    [(bucket, key)] = fake.objects
    assert bucket == "test-bucket" and fake.objects[(bucket, key)] == (PDF[1], "application/pdf")

    downloaded = client.get(f"/api/v1/documents/{document_id}/file", headers=auth_headers)
    assert downloaded.status_code == 200 and downloaded.content == PDF[1]

    url = client.post("/api/v1/users/me/avatar", headers=auth_headers, files={"file": PNG}).json()["user"]["avatarUrl"]
    assert client.get(url).content == PNG[1]

    assert client.delete(f"/api/v1/documents/{document_id}", headers=auth_headers).status_code == 200
    assert (bucket, key) not in fake.objects
    assert client.get(f"/api/v1/documents/{document_id}/file", headers=auth_headers).status_code == 404
