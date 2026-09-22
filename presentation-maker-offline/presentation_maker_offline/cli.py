import argparse
from .workflow import ImageStrategy, Operation, ProjectStore, Workflow

def main() -> None:
    parser = argparse.ArgumentParser(description="Offline Presentation Maker core")
    parser.add_argument("source")
    parser.add_argument("--operation", choices=[x.value for x in Operation], default=Operation.KEEP.value)
    parser.add_argument("--image-strategy", choices=[x.value for x in ImageStrategy], default=ImageStrategy.REUSE.value)
    parser.add_argument("--state", default="project.sqlite3")
    args = parser.parse_args()
    project_id = Workflow(ProjectStore(args.state)).start(args.source, Operation(args.operation), ImageStrategy(args.image_strategy))
    print(project_id)

