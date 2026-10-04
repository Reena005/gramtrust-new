"""Experimental CLIP image-text alignment test for construction-stage prompts."""

import argparse
import sys
from pathlib import Path

import torch
import torch.nn.functional as functional
from PIL import Image, UnidentifiedImageError

from model import MODEL_NAME, get_device, load_model

STAGES = (
    ("Not started", "Construction work has not started"),
    ("Early stage", "Construction work is in the early stage"),
    ("Partially completed", "Construction work is partially completed"),
    ("Mostly completed", "Construction work is mostly completed"),
    ("Fully completed", "Construction work is fully completed"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare a local image with five experimental construction-stage "
            "descriptions using CLIP."
        )
    )
    parser.add_argument("image_path", type=Path, help="Path to a local image file")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    image_path = args.image_path

    if not image_path.is_file():
        print(
            f"Error: image file does not exist or is not a file: {image_path}",
            file=sys.stderr,
        )
        return 1

    try:
        with Image.open(image_path) as source_image:
            source_image.load()
            image = source_image.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        print(
            f"Error: cannot read a supported image at {image_path}: {exc}",
            file=sys.stderr,
        )
        return 1

    try:
        model, processor = load_model()
        device = torch.device(get_device())
    except RuntimeError as exc:
        print(f"Error: CLIP model loading failed: {exc}", file=sys.stderr)
        return 1

    descriptions = [description for _, description in STAGES]
    try:
        inputs = processor(
            images=image,
            text=descriptions,
            return_tensors="pt",
            padding=True,
        )
        inputs = inputs.to(device)

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
    except (KeyError, OSError, RuntimeError, TypeError, ValueError) as exc:
        print(f"Error: CLIP inference failed: {exc}", file=sys.stderr)
        return 1

    results = [
        (label, description, similarity)
        for (label, description), similarity in zip(STAGES, similarities)
    ]
    ranked_results = sorted(results, key=lambda result: result[2], reverse=True)
    _, highest_description, highest_score = ranked_results[0]

    print("=" * 40)
    print("GramTrust Construction Stage Prototype")
    print("=" * 40)
    print(f"Model: {MODEL_NAME}")
    print(f"Device: {device}")
    print(f"Image: {image_path}")
    print()
    print("Stage Similarities:")
    for label, _, similarity in results:
        print(f"{label}: {similarity:.6f}")

    print()
    print("Ranking (highest similarity first):")
    for rank, (label, description, similarity) in enumerate(ranked_results, start=1):
        print(f"{rank}. {label}: {description} ({similarity:.6f})")

    print()
    print("CLIP's highest-alignment stage:")
    print(highest_description)
    print()
    print(f"Score: {highest_score:.6f}")
    print()
    print("NOTE:")
    print("This is an experimental CLIP image-text alignment result.")
    print("It is not a validated construction completion percentage")
    print("or proof of project completion.")
    print()
    print("=" * 40)

    return 0


if __name__ == "__main__":
    sys.exit(main())
