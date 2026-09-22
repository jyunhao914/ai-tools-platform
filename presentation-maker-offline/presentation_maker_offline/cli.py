import argparse
from pathlib import Path
from .manifest import CheckpointManifest
from .workflow import ImageStrategy, Operation, ProjectStore, Workflow

def main() -> None:
    parser = argparse.ArgumentParser(description="Offline Presentation Maker core")
    parser.add_argument("source", nargs="?")
    parser.add_argument("--validate-manifest")
    parser.add_argument("--operation", choices=[x.value for x in Operation], default=Operation.KEEP.value)
    parser.add_argument("--image-strategy", choices=[x.value for x in ImageStrategy], default=ImageStrategy.REUSE.value)
    parser.add_argument("--state", default="project.sqlite3")
    args = parser.parse_args()
    if args.validate_manifest:
        manifest = CheckpointManifest.load(args.validate_manifest)
        errors = manifest.validate()
        print("valid" if not errors else "invalid: " + "; ".join(errors))
        raise SystemExit(0 if not errors else 2)
    if not args.source: parser.error("source is required unless --validate-manifest is used")
    project_id = Workflow(ProjectStore(args.state)).start(args.source, Operation(args.operation), ImageStrategy(args.image_strategy))
    print(project_id)
