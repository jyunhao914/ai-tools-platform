# Build with: python3 -m PyInstaller --noconfirm --clean --distpath <output> macos_app.spec
import os
from pathlib import Path

runtime_root = Path(os.environ.get(
    "PRESENTATION_MLX_SERVE_BUNDLE",
    Path.home() / "Library/Application Support/PresentationMaker/runtime/mlx-serve-macos-arm64",
)).expanduser().resolve()
if not (runtime_root / "mlx-serve").is_file():
    raise RuntimeError("Set PRESENTATION_MLX_SERVE_BUNDLE to a verified mlx-serve runtime folder")

a = Analysis(
    ["app_launcher.py"],
    pathex=["."],
    binaries=[],
    datas=[(str(runtime_root), "mlx-serve-macos-arm64")],
    hiddenimports=[
        "pypdf",
        "docx",
        "pptx",
        "PySide6.QtWidgets",
        "PySide6.QtGui",
        "PySide6.QtCore",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=["offline_runtime_hook.py"],
    excludes=[
        "mlx", "mlx_lm", "tkinter", "pytest", "IPython", "jupyter",
        # The shipped Qt workflow does not expose image inference yet; keep its
        # multi-gigabyte training/inference stack out of the desktop bundle.
        "torch", "torchvision", "torchaudio", "diffusers", "transformers",
        "safetensors", "accelerate", "scipy", "sklearn", "matplotlib",
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
        "CFBundleShortVersionString": "0.2.0",
        "CFBundleVersion": "2",
        "LSMinimumSystemVersion": "13.0",
        "NSHighResolutionCapable": True,
    },
    target_arch="arm64",
)
