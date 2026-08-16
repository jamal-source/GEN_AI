import sys
import os
import json
import uuid
import contextlib
import io
from PIL import Image, ImageDraw

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from pipeline import ProductContentPipeline

def create_default_label(brand_name: str, variant_name: str, text_info: str) -> str:
    temp_dir = os.path.join(BASE_DIR, "temp", "chat_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    filename = f"label_{brand_name.lower()}_{variant_name.lower().replace(' ', '_')}.jpg"
    path = os.path.join(temp_dir, filename)

    img = Image.new("RGB", (1000, 1200), color="#FEF9C3")
    draw = ImageDraw.Draw(img)

    lines = [
        f"BRAND: {brand_name.upper()}",
        f"VARIAN: {variant_name.upper()}",
        "100% HERBAL ALAMI",
        "TANPA PENGAWET BUATAN",
        "NETTO: 250 ml",
        f"INFO: {text_info[:60]}",
        "EXP: 31/12/2026"
    ]

    y = 100
    for line in lines:
        draw.text((60, y), line, fill="#000000")
        y += 100

    img.save(path, format="JPEG", quality=95)
    return path

import re

def sanitize_name(name: str, default: str) -> str:
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', '', name).strip()
    return cleaned if cleaned else default

def main():
    try:
        if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
            with open(sys.argv[1], "r", encoding="utf-8") as f:
                payload = json.load(f)
        else:
            raw_input = sys.stdin.read().strip()
            payload = json.loads(raw_input) if raw_input else {}
    except Exception:
        payload = {}

    raw_brand = payload.get("brand_name", "UMKM Indonesia")
    raw_variant = payload.get("variant_name", "Produk Unggulan")

    brand_name = sanitize_name(raw_brand, "UMKM Indonesia")
    variant_name = sanitize_name(raw_variant, "Produk Unggulan")
    info_text = payload.get("info", "Produk herbal dan alami berkualitas tinggi")
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"

    image_path = payload.get("image_path")
    if not image_path or not os.path.exists(image_path):
        image_path = create_default_label(brand_name, variant_name, info_text)

    # Redirect pipeline stdout logs to sys.stderr so stdout contains only pure JSON output
    with contextlib.redirect_stdout(sys.stderr):
        pipeline = ProductContentPipeline()
        res = pipeline.run_single_variant(
            brand_name=brand_name,
            variant_name=variant_name,
            image_path=image_path,
            batch_id=batch_id
        )

    # Collect generated file relative paths
    out_dir = os.path.join(BASE_DIR, "output", batch_id, brand_name.replace(" ", "_"), variant_name.replace(" ", "_"))
    generated_assets = []
    video_url = None

    if os.path.exists(out_dir):
        for fname in sorted(os.listdir(out_dir)):
            rel_path = f"/output/{batch_id}/{brand_name.replace(' ', '_')}/{variant_name.replace(' ', '_')}/{fname}"
            if fname.endswith(".png"):
                generated_assets.append({
                    "name": fname.replace(".png", "").replace("_", " ").title(),
                    "url": rel_path
                })
            elif fname.endswith(".mp4"):
                video_url = rel_path

    response = {
        "status": "SUCCESS",
        "batch_id": batch_id,
        "brand_name": brand_name,
        "variant_name": variant_name,
        "total_assets": len(generated_assets),
        "assets": generated_assets,
        "video_url": video_url,
        "pipeline_summary": res
    }

    # Print pure JSON output on stdout
    print(json.dumps(response, indent=2))

if __name__ == "__main__":
    main()

