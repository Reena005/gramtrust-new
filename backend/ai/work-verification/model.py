"""Load and expose the shared CLIP model and processor."""

from datetime import datetime

import torch
import torch.nn.functional as functional
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_NAME = "openai/clip-vit-base-patch32"

CONSTRUCTION_STAGES = (
    ("Not started", "Construction work has not started"),
    ("Early stage", "Construction work is in the early stage"),
    ("Partially completed", "Construction work is partially completed"),
    ("Mostly completed", "Construction work is mostly completed"),
    ("Fully completed", "Construction work is fully completed"),
)

_model: CLIPModel | None = None
_processor: CLIPProcessor | None = None
_device: torch.device | None = None


def load_model() -> tuple[CLIPModel, CLIPProcessor]:
    """Load CLIP once and cache it for reuse by the service."""
    global _model, _processor, _device

    if _model is not None and _processor is not None:
        return _model, _processor

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    try:
        processor = CLIPProcessor.from_pretrained(MODEL_NAME)
        model = CLIPModel.from_pretrained(MODEL_NAME)
        model.to(device)
        model.eval()
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load Hugging Face model {MODEL_NAME!r}. "
            "Check that the service can access the model files and has "
            "enough memory, then restart it."
        ) from exc

    _model = model
    _processor = processor
    _device = device
    return _model, _processor


def get_model() -> CLIPModel:
    if _model is None:
        raise RuntimeError("CLIP model is not loaded; start the application first.")
    return _model


def get_processor() -> CLIPProcessor:
    if _processor is None:
        raise RuntimeError(
            "CLIP processor is not loaded; start the application first."
        )
    return _processor


def get_device() -> str:
    if _device is None:
        raise RuntimeError("CLIP device is not initialized; start the application first.")
    return str(_device)


def compare_images(
    reference_image: Image.Image,
    citizen_image: Image.Image,
) -> float:
    """Return cosine similarity for two images using the shared CLIP model."""
    model = get_model()
    processor = get_processor()
    device = torch.device(get_device())
    inputs = processor(
        images=[reference_image, citizen_image],
        return_tensors="pt",
    ).to(device)

    with torch.inference_mode():
        image_embeddings = model.get_image_features(
            pixel_values=inputs["pixel_values"]
        )
        normalized_embeddings = functional.normalize(
            image_embeddings, p=2, dim=-1
        )
        similarity = torch.sum(
            normalized_embeddings[0] * normalized_embeddings[1]
        )

    return float(similarity.item())


def extract_image_metadata(image: Image.Image) -> dict[str, str | float | None]:
    """Extract optional GPS coordinates and capture time from image EXIF."""
    metadata: dict[str, str | float | None] = {
        "latitude": None,
        "longitude": None,
        "capture_timestamp": None,
    }

    try:
        exif = image.getexif()
        if not exif:
            return metadata

        try:
            gps_info = exif.get_ifd(34853)
        except (AttributeError, KeyError, TypeError, ValueError):
            gps_info = exif.get(34853)

        if isinstance(gps_info, dict):
            metadata["latitude"] = _exif_coordinate(
                gps_info.get(2), gps_info.get(1), "N", "S", 90
            )
            metadata["longitude"] = _exif_coordinate(
                gps_info.get(4), gps_info.get(3), "E", "W", 180
            )

        try:
            exif_ifd = exif.get_ifd(34665)
        except (AttributeError, KeyError, TypeError, ValueError):
            exif_ifd = {}

        capture_time = (
            exif_ifd.get(36867) if isinstance(exif_ifd, dict) else None
        ) or exif.get(306)
        if isinstance(capture_time, bytes):
            capture_time = capture_time.decode("ascii", errors="ignore")
        if isinstance(capture_time, str):
            try:
                metadata["capture_timestamp"] = datetime.strptime(
                    capture_time.strip(), "%Y:%m:%d %H:%M:%S"
                ).isoformat()
            except ValueError:
                pass
    except Exception:
        # Malformed optional EXIF must not prevent image verification.
        return {
            "latitude": None,
            "longitude": None,
            "capture_timestamp": None,
        }

    return metadata


def _exif_coordinate(
    values: object,
    direction: object,
    positive_direction: str,
    negative_direction: str,
    limit: float,
) -> float | None:
    if not isinstance(values, (tuple, list)) or len(values) != 3:
        return None
    if isinstance(direction, bytes):
        direction = direction.decode("ascii", errors="ignore")
    if not isinstance(direction, str):
        return None

    try:
        degrees, minutes, seconds = (float(value) for value in values)
        coordinate = degrees + minutes / 60 + seconds / 3600
        direction = direction.strip().upper()
        if direction == negative_direction:
            coordinate = -coordinate
        elif direction != positive_direction:
            return None
        if not -limit <= coordinate <= limit:
            return None
        return coordinate
    except (OverflowError, TypeError, ValueError, ZeroDivisionError):
        return None


def analyze_image(image: Image.Image, project_description: str) -> dict[str, object]:
    """Compare one image with the project description and construction stages."""
    if not project_description.strip():
        raise ValueError("Project description must not be empty.")

    model = get_model()
    processor = get_processor()
    device = torch.device(get_device())

    stage_descriptions = [description for _, description in CONSTRUCTION_STAGES]
    texts = [project_description, *stage_descriptions]
    inputs = processor(
        images=image,
        text=texts,
        return_tensors="pt",
        padding=True,
    ).to(device)

    with torch.inference_mode():
        image_embedding = model.get_image_features(
            pixel_values=inputs["pixel_values"]
        )
        text_embeddings = model.get_text_features(
            input_ids=inputs["input_ids"],
            attention_mask=inputs.get("attention_mask"),
        )

        normalized_image_embedding = functional.normalize(
            image_embedding, p=2, dim=-1
        )
        normalized_text_embeddings = functional.normalize(
            text_embeddings, p=2, dim=-1
        )
        similarities = torch.matmul(
            normalized_text_embeddings,
            normalized_image_embedding.squeeze(0),
        ).tolist()

    project_description_similarity = similarities[0]
    stage_results = [
        {
            "stage": label,
            "description": description,
            "similarity_score": score,
        }
        for (label, description), score in zip(
            CONSTRUCTION_STAGES, similarities[1:]
        )
    ]
    highest_stage = max(stage_results, key=lambda stage: stage["similarity_score"])
    stage_scores = {
        label.lower().replace(" ", "_"): score
        for (label, _), score in zip(CONSTRUCTION_STAGES, similarities[1:])
    }

    return {
        "model": MODEL_NAME,
        "similarity_scores": {
            "project_description": project_description_similarity,
            **stage_scores,
        },
        "predicted_stage": highest_stage["stage"],
        "similarity_score": highest_stage["similarity_score"],
        "result": "REVIEW_REQUIRED",
        "reason": (
            "Experimental CLIP image-text alignment requires human review; "
            "it is not a validated construction completion assessment."
        ),
        "details": {
            "project_description": project_description,
            "project_description_similarity": project_description_similarity,
            "construction_stage_similarities": stage_results,
        },
    }
