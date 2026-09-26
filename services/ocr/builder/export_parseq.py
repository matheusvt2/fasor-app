"""Builder-only: export the pretrained PARSeq word recognizer to ONNX.

Runs in the Dockerfile's `parseq` stage (CPU torch lives only there). Reads the
upstream source tree unpacked at PARSEQ_SRC, loads the released `parseq` weights
(94-character ASCII charset, 32x128 input) and writes:

- /out/parseq.onnx: images [N, 3, 32, 128] in [-1, 1] -> probabilities [N, 26, 95]
- /out/parseq.json: {"charset": ..., "eos_id": 0, "img_size": [32, 128], "max_label_length": 25}
"""

import json
import os
import sys
from pathlib import Path

import torch
import yaml

SRC = Path(os.environ["PARSEQ_SRC"])
WEIGHTS = Path(os.environ["PARSEQ_WEIGHTS"])
OUT = Path("/out")

sys.path.insert(0, str(SRC))

# Two export-only rewrites of the upstream decoder, same arithmetic:
# - squeeze only the step axis, so a one-image batch keeps its batch axis in the trace;
# - build the cloze mask with a boolean AND instead of an in-place masked assignment,
#   which traces to a boolean `Where` onnxruntime has no kernel for. `tgt_mask` and
#   `query_mask` are one tensor upstream, so both names keep pointing at the result.
PATCHES = [
    ("tgt_in[:, j] = p_i.squeeze().argmax(-1)", "tgt_in[:, j] = p_i.squeeze(1).argmax(-1)"),
    (
        "query_mask[torch.triu(torch.ones(num_steps, num_steps, dtype=torch.bool, device=self._device), 2)] = 0",
        "tgt_mask = query_mask = query_mask & ~torch.triu("
        "torch.ones(num_steps, num_steps, dtype=torch.bool, device=self._device), 2)",
    ),
]
_model_py = SRC / "strhub/models/parseq/model.py"
_source = _model_py.read_text()
for old, new in PATCHES:
    if old not in _source:
        raise SystemExit(f"upstream PARSeq source changed, patch target missing: {old}")
    _source = _source.replace(old, new)
_model_py.write_text(_source)

from strhub.models.parseq.model import PARSeq  # noqa: E402


def load_config() -> dict:
    main = yaml.safe_load((SRC / "configs/main.yaml").read_text())["model"]
    charset = yaml.safe_load((SRC / "configs/charset/94_full.yaml").read_text())["model"]
    model = yaml.safe_load((SRC / "configs/model/parseq.yaml").read_text())
    return {**main, **charset, **model}


class _Tokenizer:
    """The ids strhub's Tokenizer assigns: [E] + charset + [B], [P]."""

    def __init__(self, charset: str) -> None:
        self.eos_id = 0
        self.bos_id = len(charset) + 1
        self.pad_id = len(charset) + 2


class Recognizer(torch.nn.Module):
    def __init__(self, model: PARSeq, tokenizer: _Tokenizer, max_length: int) -> None:
        super().__init__()
        self.model = model
        self.tokenizer = tokenizer
        self.max_length = max_length

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        # An explicit max_length turns off the data-dependent early exit, so the trace
        # unrolls every decoding step.
        logits = self.model(self.tokenizer, images, max_length=self.max_length)
        return logits.softmax(-1)


def main() -> None:
    cfg = load_config()
    charset = cfg["charset_train"]
    tokenizer = _Tokenizer(charset)
    model = PARSeq(
        num_tokens=len(charset) + 3,
        max_label_length=cfg["max_label_length"],
        img_size=cfg["img_size"],
        patch_size=cfg["patch_size"],
        embed_dim=cfg["embed_dim"],
        enc_num_heads=cfg["enc_num_heads"],
        enc_mlp_ratio=cfg["enc_mlp_ratio"],
        enc_depth=cfg["enc_depth"],
        dec_num_heads=cfg["dec_num_heads"],
        dec_mlp_ratio=cfg["dec_mlp_ratio"],
        dec_depth=cfg["dec_depth"],
        decode_ar=True,
        refine_iters=1,
        dropout=cfg["dropout"],
    )
    model.load_state_dict(torch.load(WEIGHTS, map_location="cpu", weights_only=True))
    model.eval()
    wrapper = Recognizer(model, tokenizer, cfg["max_label_length"]).eval()

    h, w = cfg["img_size"]
    dummy = torch.rand(2, 3, h, w) * 2 - 1
    OUT.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            (dummy,),
            str(OUT / "parseq.onnx"),
            input_names=["images"],
            output_names=["probs"],
            dynamic_axes={"images": {0: "n"}, "probs": {0: "n"}},
            opset_version=17,
            do_constant_folding=True,
            dynamo=False,
        )
    # The graph must run on onnxruntime's CPU kernels and agree with torch, for a
    # one-image batch and a larger one.
    import onnxruntime as ort

    session = ort.InferenceSession(str(OUT / "parseq.onnx"), providers=["CPUExecutionProvider"])
    for n in (1, 3):
        sample = torch.rand(n, 3, h, w) * 2 - 1
        with torch.no_grad():
            reference = wrapper(sample).numpy()
        (probs,) = session.run(None, {"images": sample.numpy()})
        assert probs.shape == reference.shape, (probs.shape, reference.shape)
        assert (probs.argmax(-1) == reference.argmax(-1)).all(), "ONNX decode differs from torch"
    (OUT / "parseq.json").write_text(
        json.dumps(
            {
                "charset": charset,
                "eos_id": tokenizer.eos_id,
                "img_size": [h, w],
                "max_label_length": cfg["max_label_length"],
                "source": "baudm/parseq parseq-bb5792a6.pt",
            }
        )
    )
    print("exported", OUT / "parseq.onnx")


if __name__ == "__main__":
    main()
