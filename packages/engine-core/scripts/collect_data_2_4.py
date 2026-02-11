import argparse
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from datasets import load_dataset


AIHUB_DATASET_ID = "shihyunlim/aihub-ko-en-everyday-expression"
OPUS_KO_URL = "https://object.pouta.csc.fi/OPUS-OpenSubtitles/v2024/mono/ko.txt.gz"


def collect_aihub(raw_dir: Path, max_lines: int) -> dict:
    out_path = raw_dir / "aihub_ko.txt"
    ds = load_dataset(AIHUB_DATASET_ID, split=f"train[:{max_lines}]")
    count = 0
    with out_path.open("w", encoding="utf-8") as f:
        for row in ds:
            text = (row.get("ko") or "").strip()
            if not text:
                continue
            f.write(text.replace("\n", " ") + "\n")
            count += 1
    return {
        "source_name": "AIHub-derived (Hugging Face mirror)",
        "dataset_id": AIHUB_DATASET_ID,
        "output_file": str(out_path),
        "lines_written": count,
    }


def collect_opus(raw_dir: Path, max_lines: int) -> dict:
    out_path = raw_dir / "opus_open_subtitles_ko.txt"
    count = 0
    with urlopen(OPUS_KO_URL) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            with out_path.open("w", encoding="utf-8") as f:
                for raw in gz:
                    if count >= max_lines:
                        break
                    text = raw.decode("utf-8", errors="ignore").strip()
                    if not text:
                        continue
                    f.write(text.replace("\n", " ") + "\n")
                    count += 1
    return {
        "source_name": "OPUS OpenSubtitles v2024",
        "url": OPUS_KO_URL,
        "output_file": str(out_path),
        "lines_written": count,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", default="corpus/raw")
    parser.add_argument("--aihub-max-lines", type=int, default=120000)
    parser.add_argument("--opus-max-lines", type=int, default=120000)
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir).resolve()
    raw_dir.mkdir(parents=True, exist_ok=True)

    print("[collect] collecting AIHub (2)")
    aihub_meta = collect_aihub(raw_dir, args.aihub_max_lines)
    print(f"[collect] aihub lines: {aihub_meta['lines_written']}")

    print("[collect] collecting OPUS OpenSubtitles (4)")
    opus_meta = collect_opus(raw_dir, args.opus_max_lines)
    print(f"[collect] opus lines: {opus_meta['lines_written']}")

    meta = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "items": [aihub_meta, opus_meta],
    }
    meta_path = raw_dir / "sources_2_4.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[collect] metadata: {meta_path}")


if __name__ == "__main__":
    main()

