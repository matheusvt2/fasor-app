# Story 8.3: the OCR sidecar. Every model file is fetched and converted here, at
# build time; the running container never downloads anything.
#
#   docker compose --profile ocr build ocr
#   docker compose --profile ocr run --rm ocr pytest
#
# Review fixes 2026-09-30: two final stages. `runtime` is what production runs (the deploy
# builds `--target runtime`): no dev dependencies, no tests. `test`, the default target that
# compose builds, is `runtime` plus the dev group and `tests/`. Base images are pinned by
# digest (O-7); bump tag and digest together.

ARG PYTHON_IMAGE=python:3.13.15-slim-bookworm@sha256:2325bb286ec344af3e5898cc224b5844e2707ac6e26b1632516fd3edc84a5e26

# --- stage 1: PARSeq to ONNX (CPU torch lives only in this stage) --------------------
FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c AS parseq
RUN pip install --no-cache-dir --timeout 600 --retries 10 --index-url https://download.pytorch.org/whl/cpu \
      torch==2.5.1 torchvision==0.20.1 \
 && pip install --no-cache-dir --timeout 600 --retries 10 timm==0.9.16 pyyaml==6.0.2 onnx==1.17.0 numpy==2.1.3 \
 && pip install --no-cache-dir --timeout 600 --retries 10 onnxruntime==1.20.1
# Upstream source pinned to a commit, released weights pinned by checksum.
ADD --checksum=sha256:f57289cb1fc7fe41f488a52ea48f8a7f114252ef405b0b64efc1d528c29b48ef \
    https://github.com/baudm/parseq/archive/1902db043c029a7e03a3818c616c06600af574be.tar.gz /tmp/parseq.tar.gz
ADD --checksum=sha256:bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00 \
    https://github.com/baudm/parseq/releases/download/v1.0.0/parseq-bb5792a6.pt /tmp/parseq.pt
RUN mkdir /src && tar -xzf /tmp/parseq.tar.gz -C /src --strip-components=1
COPY builder/export_parseq.py /tmp/export_parseq.py
RUN PARSEQ_SRC=/src PARSEQ_WEIGHTS=/tmp/parseq.pt python /tmp/export_parseq.py

# --- stage 2: the uv venv and the PP-OCRv5 detection weights ------------------------
FROM ${PYTHON_IMAGE} AS builder
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.30@sha256:538e0b39736e7feae937a65983e49d2ab75e1559d35041f9878b7b7e51de91e4 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
# O-6: the runtime venv without the dev group; a second venv with it serves the codegen below
# and the `test` stage.
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-install-project --no-dev \
 && UV_PROJECT_ENVIRONMENT=/opt/venv-dev uv sync --frozen --no-install-project
ENV PATH=/opt/venv/bin:$PATH
# Download the detection model once (PaddleX official model store) and keep it under /opt/models.
ENV PADDLE_PDX_MODEL_SOURCE=huggingface
# Security review 2026-09-30: the download names no revision, so the files the image keeps are
# pinned by checksum (the ones the 2026-09-28 image was built and tested with); a changed
# upstream model fails the build here instead of shipping unreviewed weights.
RUN python -c "from paddleocr import TextDetection; TextDetection(model_name='PP-OCRv5_server_det')" \
 && mkdir -p /opt/models \
 && cp -r /root/.paddlex/official_models/PP-OCRv5_server_det /opt/models/PP-OCRv5_server_det \
 && cd /opt/models/PP-OCRv5_server_det \
 && printf '%s\n' \
      'af5876933d8806a1b50d895867e0781e135cd92ff37381992828fc8d1b842d28  inference.json' \
      '183146fe9d9910352f68482f623bcbbb9fa7b9e8fa1463b9ad288cef00524d2d  inference.pdiparams' \
      '28fb721efc3634fc8aa677e474b9602cb815a91cf569ef357a7a553d7b3ce685  inference.yml' \
      '436bf19010fe3879477e8599a870a0ec8ccd14ca39056805ec4ed20ab318ec04  config.json' \
    | sha256sum -c -
# The pydantic models the responses are built through, generated from the kernel's JSON Schema.
COPY contract/ ./contract/
RUN mkdir -p /opt/generated && /opt/venv-dev/bin/datamodel-codegen \
      --input contract/ocr-contract.schema.json --input-file-type jsonschema \
      --output-model-type pydantic_v2.BaseModel --target-python-version 3.13 \
      --use-annotated --field-constraints --disable-timestamp \
      --output /opt/generated/contract_models.py

# --- stage 3: runtime (production) ---------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime
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
# O-7: the image says how to tell it is up (compose uses it; ECS declares its own in ecs.tf).
HEALTHCHECK --interval=5s --timeout=5s --start-period=60s --retries=30 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# --- stage 4: test (the default target; compose builds it) ---------------------------
FROM runtime AS test
COPY --from=builder /opt/venv-dev /opt/venv
COPY tests/ ./tests/
