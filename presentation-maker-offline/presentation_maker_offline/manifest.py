from __future__ import annotations
import hashlib, json
from dataclasses import dataclass, asdict
from pathlib import Path

@dataclass(frozen=True)
class CheckpointManifest:
    name: str
    path: str
    sha256: str
    source: str
    revision: str
    license: str
    framework: str
    apple_silicon: str = "untested"
    format: str = "directory"

    def validate(self, verify_hash: bool = True) -> list[str]:
        errors = []
        p = Path(self.path)
        if not p.exists(): errors.append("checkpoint path does not exist")
        if not self.source or not self.revision or not self.license or not self.framework: errors.append("source, revision, license and framework are required")
        if self.format not in {"directory", "mlx", "gguf", "safetensors"}: errors.append("unsupported checkpoint format")
        if len(self.sha256) != 64 or any(c not in "0123456789abcdef" for c in self.sha256.lower()): errors.append("sha256 must be a 64-character hex digest")
        if verify_hash and p.is_file() and not errors:
            digest = hashlib.sha256(p.read_bytes()).hexdigest()
            if digest != self.sha256.lower(): errors.append(f"sha256 mismatch: expected {self.sha256}, got {digest}")
        return errors

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(asdict(self), indent=2) + "\n")

    @classmethod
    def load(cls, path: str | Path) -> "CheckpointManifest":
        return cls(**json.loads(Path(path).read_text()))
