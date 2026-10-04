"""Compare one local image with multiple text descriptions using CLIP."""

import argparse
import sys
from pathlib import Path

import torch
import torch.nn.functional as functional
from PIL import Image, UnidentifiedImageError

from model import MODEL_NAME, get_device, load_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Calculate and rank CLIP cosine similarities between a local "
            "image and one or more project/work descriptions."
        )
    )
    parser.add_argument("image_path", type=Path, help="Path to a local image file")
    parser.add_argument(
        "descriptions",
        nargs="+",
        help="One or more project/work descriptions; quote each description",
    )
    args = parser.parse_args()
    if any(not description.strip() for description in args.descriptions):
        parser.error("descriptions must not be empty")
    return args


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

    try:
        inputs = processor(
            images=image,
            text=args.descriptions,
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
            )
    except (KeyError, OSError, RuntimeError, TypeError, ValueError) as exc:
        print(f"Error: CLIP inference failed: {exc}", file=sys.stderr)
        return 1

    print("=" * 40)
    print("GramTrust CLIP Multi-Text Test")
    print("=" * 40)
    print(f"Model: {MODEL_NAME}")
    print(f"Device: {device}")
    print(f"Image: {image_path}")
    print()

    results = list(zip(args.descriptions, similarities.tolist()))
    for description, similarity in results:
        print(f"Description: {description}")
        print(f"Cosine Similarity: {similarity:.6f}")
        print()

    ranked_results = sorted(
        results,
        key=lambda result: result[1],
        reverse=True,
    )

    print("Ranking (highest similarity first):")
    for rank, (description, similarity) in enumerate(ranked_results, start=1):
        print(f"{rank}. {description} ({similarity:.6f})")
    print()
    print(
        "CLIP similarity indicates image-text alignment and is not a direct "
        "construction completion percentage."
    )
    print()
    print("=" * 40)
    return 0


if __name__ == "__main__":
    sys.exit(main())
