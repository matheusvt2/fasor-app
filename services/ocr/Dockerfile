# Story 8.3: the OCR sidecar. Every model file is fetched and converted here, at
# build time; the running container never downloads anything.
#
#   docker compose --profile ocr build ocr
#   docker compose --profile ocr run --rm ocr pytest

ARG PYTHON_IMAGE=python:3.13.15-slim-bookworm

# --- stage 1: PARSeq to ONNX (CPU torch lives only in this stage) --------------------
FROM python:3.12.12-slim-bookworm AS parseq
RUN pip install --no-cache-dir --timeout 600 --retries 10 --index-url https://download.pytorch.org/whl/cpu \
      torch==2.5.1 torchvision==0.20.1 \
 && pip install --no-cache-dir --timeout 600 --retries 10 timm==0.9.16 pyyaml==6.0.2 onnx==1.17.0 numpy==2.1.3
# Upstream source pinned to a commit, released weights pinned by checksum.
ADD --checksum=sha256:f57289cb1fc7fe41f488a52ea48f8a7f114252ef405b0b64efc1d528c29b48ef \
    https://github.com/baudm/parseq/archive/1902db043c029a7e03a3818c616c06600af574be.tar.gz /tmp/parseq.tar.gz
ADD --checksum=sha256:bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00 \
    https://github.com/baudm/parseq/releases/download/v1.0.0/parseq-bb5792a6.pt /tmp/parseq.pt
RUN pip install --no-cache-dir --timeout 600 --retries 10 onnxruntime==1.20.1
RUN mkdir /src && tar -xzf /tmp/parseq.tar.gz -C /src --strip-components=1
COPY builder/export_parseq.py /tmp/export_parseq.py
RUN PARSEQ_SRC=/src PARSEQ_WEIGHTS=/tmp/parseq.pt python /tmp/export_parseq.py

# --- stage 2: the uv venv and the PP-OCRv5 detection weights ------------------------
FROM ${PYTHON_IMAGE} AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.30 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-install-project
ENV PATH=/opt/venv/bin:$PATH
# Download the detection model once (PaddleX official model store) and keep it under /opt/models.
ENV PADDLE_PDX_MODEL_SOURCE=huggingface
RUN python -c "from paddleocr import TextDetection; TextDetection(model_name='PP-OCRv5_server_det')" \
 && mkdir -p /opt/models \
 && cp -r /root/.paddlex/official_models/PP-OCRv5_server_det /opt/models/PP-OCRv5_server_det
# The pydantic models the responses are built through, generated from the kernel's JSON Schema.
COPY contract/ ./contract/
RUN mkdir -p /opt/generated && datamodel-codegen \
      --input contract/ocr-contract.schema.json --input-file-type jsonschema \
      --output-model-type pydantic_v2.BaseModel --target-python-version 3.13 \
      --use-annotated --field-constraints --disable-timestamp \
      --output /opt/generated/contract_models.py

# --- stage 3: runtime --------------------------------------------------------------
FROM ${PYTHON_IMAGE}
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core libgomp1 libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 ocr
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /opt/models /opt/models
COPY --from=parseq /out/ /opt/models/parseq/
WORKDIR /app
COPY contract/ ./contract/
COPY app/ ./app/
COPY --from=builder /opt/generated/contract_models.py ./app/contract_models.py
COPY tests/ ./tests/
COPY pyproject.toml ./
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OCR_MODELS_DIR=/opt/models \
    # Offline: no model-source probe, no hub access, no telemetry.
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    HF_HUB_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PADDLE_PDX_LOCAL_FONT_FILE_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
    OMP_NUM_THREADS=4 \
    # Decode cap: 50 megapixels (the api's print variant is at most 2000 px a side), so a
    # small PNG with a huge header answers 422 instead of allocating gigabytes.
    OPENCV_IO_MAX_IMAGE_PIXELS=50000000
USER ocr
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
