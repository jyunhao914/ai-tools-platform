# Build with: python3 -m PyInstaller --noconfirm --clean --distpath <output> macos_app.spec
import os
from pathlib import Path
from PyInstaller.utils.hooks import copy_metadata

runtime_root = Path(os.environ.get(
    "PRESENTATION_MLX_SERVE_BUNDLE",
    Path.home() / "Library/Application Support/PresentationMaker/runtime/mlx-serve-macos-arm64",
)).expanduser().resolve()
if not (runtime_root / "mlx-serve").is_file():
    raise RuntimeError("Set PRESENTATION_MLX_SERVE_BUNDLE to a verified mlx-serve runtime folder")

# Transformers and Diffusers inspect installed distribution versions at runtime.
runtime_metadata = []
for distribution in (
    "requests", "transformers", "diffusers", "accelerate", "huggingface-hub", "tokenizers",
    "safetensors", "torch", "Pillow", "numpy", "packaging", "filelock",
    "tqdm", "regex", "PyYAML",
):
    runtime_metadata.extend(copy_metadata(distribution))

a = Analysis(
    ["app_launcher.py"],
    pathex=["."],
    binaries=[],
    datas=[(str(runtime_root), "mlx-serve-macos-arm64"), *runtime_metadata],
    hiddenimports=[
        "pypdf",
        "docx",
        "pptx",
        "diffusers.pipelines.qwenimage21.pipeline_qwenimage21",
        "accelerate",
        "transformers.models.qwen3.modeling_qwen3",
        "transformers.models.qwen3.configuration_qwen3",
        "safetensors.torch",
        "PySide6.QtWidgets",
        "PySide6.QtGui",
        "PySide6.QtCore",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=["offline_runtime_hook.py"],
    excludes=[
        "mlx", "mlx_lm", "tkinter", "pytest", "IPython", "jupyter",
        # Keep unused training, analytics, and notebook stacks out of the desktop bundle.
        "torchaudio", "sklearn", "matplotlib",
        "pandas", "onnxruntime", "cv2", "timm", "numba",
    ],
    noarchive=False,
    optimize=1,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="OfflinePresentationStudio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch="arm64",
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="OfflinePresentationStudio",
)
app = BUNDLE(
    coll,
    name="OfflinePresentationStudio.app",
    icon=None,
    bundle_identifier="tw.ai-tools.offlinepresentationstudio",
    info_plist={
        "CFBundleName": "離線簡報工作室",
        "CFBundleDisplayName": "離線簡報工作室",
        "CFBundleShortVersionString": "0.4.4",
        "CFBundleVersion": "9",
        "LSMinimumSystemVersion": "13.0",
        "NSHighResolutionCapable": True,
    },
    target_arch="arm64",
)
