# Build with: python3 -m PyInstaller --noconfirm --clean --distpath <output> macos_app.spec
a = Analysis(
    ["app_launcher.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=[
        "diffusers.pipelines.qwenimage21.pipeline_qwenimage21",
        "transformers",
        "safetensors.torch",
        "pypdf",
        "docx",
        "pptx",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=["offline_runtime_hook.py"],
    excludes=["mlx", "mlx_lm", "pytest", "IPython", "jupyter"],
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
