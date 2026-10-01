"""The OCR sidecar package.

Security review 2026-09-30: OpenCV reads its decode cap from the environment once, when
`cv2` is first imported. The Dockerfile sets it, but a run outside that image (a local
venv, another base image) would decode a small PNG that declares 30000 x 30000 pixels
into gigabytes. Setting the default here, before any module of the package imports
`cv2`, gives every run the same cap; an explicit environment value still wins.
"""

import os

MAX_IMAGE_PIXELS = 50_000_000

os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_IMAGE_PIXELS))
