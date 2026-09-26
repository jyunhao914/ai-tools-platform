import os
import sys


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] in {"--self-test", "--self-test-image"}:
        os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
        from presentation_maker_offline.diagnostics import run_self_test

        raise SystemExit(run_self_test(sys.argv[2], image_smoke=sys.argv[1] == "--self-test-image"))
    from presentation_maker_offline.qt_ui import main

    main()
