"""FastAPI application for GramTrust AI work verification."""

import asyncio
from contextlib import asynccontextmanager
from io import BytesIO
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from model import (
    MODEL_NAME,
    analyze_image,
    compare_images,
    extract_image_metadata,
    get_device,
    load_model,
)

MAX_IMAGE_BYTES = 10 * 1024 * 1024
SUPPORTED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
}

# Experimental CLIP similarity thresholds; they are not scientifically validated.
VERIFIED_THRESHOLD = 0.85
REVIEW_THRESHOLD = 0.70


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    load_model()
    yield


app = FastAPI(
    title="GramTrust AI Work Verification",
    description="CLIP model service for future project-work verification.",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "gramtrust-ai-work-verification",
        "model": MODEL_NAME,
        "device": get_device(),
    }


@app.post("/analyze")
async def analyze(
    image: UploadFile = File(...),
    project_description: str = Form(...),
) -> dict[str, object]:
    if not project_description.strip():
        raise HTTPException(status_code=400, detail="Project description is required.")

    image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
    await image.close()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MB limit.",
        )

    try:
        with Image.open(BytesIO(image_bytes)) as source_image:
            source_image.load()
            decoded_image = source_image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a supported, readable image.",
        ) from exc

    return await run_in_threadpool(
        analyze_image,
        decoded_image,
        project_description.strip(),
    )


async def read_uploaded_image(image: UploadFile, field_name: str) -> Image.Image:
    try:
        if image.content_type not in SUPPORTED_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"{field_name} must be a supported image type.",
            )

        image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail=f"{field_name} is empty.",
            )
        if len(image_bytes) > MAX_IMAGE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"{field_name} exceeds the "
                    f"{MAX_IMAGE_BYTES // (1024 * 1024)} MB limit."
                ),
            )

        with Image.open(BytesIO(image_bytes)) as source_image:
            source_image.load()
            return source_image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} is not a supported, readable image.",
        ) from exc
    finally:
        await image.close()


@app.post("/compare-images")
async def compare_uploaded_images(
    reference_image: UploadFile | None = File(default=None),
    citizen_image: UploadFile | None = File(default=None),
) -> dict[str, object]:
    if reference_image is None:
        raise HTTPException(
            status_code=400,
            detail="reference_image file is required.",
        )
    if citizen_image is None:
        await reference_image.close()
        raise HTTPException(
            status_code=400,
            detail="citizen_image file is required.",
        )

    reference, citizen = await asyncio.gather(
        read_uploaded_image(reference_image, "reference_image"),
        read_uploaded_image(citizen_image, "citizen_image"),
    )
    similarity = await run_in_threadpool(
        compare_images,
        reference,
        citizen,
    )
    metadata = extract_image_metadata(citizen)

    if similarity >= VERIFIED_THRESHOLD:
        result = "VERIFIED"
        reason = (
            "High visual similarity between the reference and citizen-submitted "
            "images. This is an AI-assisted result and should still be "
            "interpreted with project context; it does not establish that the "
            "images show the same physical location."
        )
    elif similarity >= REVIEW_THRESHOLD:
        result = "REVIEW_REQUIRED"
        reason = (
            "Moderate visual similarity between the reference and "
            "citizen-submitted images. Human review is recommended."
        )
    else:
        result = "INSUFFICIENT_EVIDENCE"
        reason = (
            "Low visual similarity between the reference and citizen-submitted "
            "images. The images do not provide sufficient visual evidence for "
            "automated verification; this is not proof of fraud or tampering."
        )

    return {
        "similarity_score": similarity,
        "model_name": MODEL_NAME,
        "result": result,
        "reason": reason,
        "metadata": metadata,
        "details": {
            "thresholds": {
                "verified": VERIFIED_THRESHOLD,
                "review_required": REVIEW_THRESHOLD,
            },
            "thresholds_are_experimental": True,
            "similarity_interpretation": (
                "AI-assisted visual similarity only; it does not prove that "
                "the images depict the same physical location."
            ),
        },
    }
