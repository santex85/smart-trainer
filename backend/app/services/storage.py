import asyncio
import io
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
    )


async def ensure_bucket_exists() -> None:
    client = get_s3_client()

    def _create_if_missing() -> None:
        try:
            client.head_bucket(Bucket=settings.s3_bucket)
        except ClientError:
            client.create_bucket(Bucket=settings.s3_bucket)

    await asyncio.to_thread(_create_if_missing)


async def upload_image(image_bytes: bytes, user_id: int, category: str = "food") -> str:
    """Upload image to S3-compatible storage and return object key."""
    key = f"{category}/{user_id}/{uuid.uuid4().hex}.jpg"
    client = get_s3_client()

    def _upload() -> None:
        client.upload_fileobj(
            io.BytesIO(image_bytes),
            settings.s3_bucket,
            key,
            ExtraArgs={"ContentType": "image/jpeg"},
        )

    await ensure_bucket_exists()
    await asyncio.to_thread(_upload)
    return key
