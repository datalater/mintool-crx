#!/usr/bin/env bash
# MinTool release helper (auto version + changelog from commits)
#
# Usage (repo root):
#   ./scripts/release.sh
#   ./scripts/release.sh --dry-run
#
# Automates:
#   - bump type from conventional commits since last tag
#   - CHANGELOG sections from commit subjects
#   - commit message / tag name / date defaults
# Prompts only to confirm or override.

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MANIFEST="manifest.json"
CHANGELOG="CHANGELOG.md"
REMOTE="origin"
TODAY="$(date +%F)"

die() {
  echo "error: $*" >&2
  exit 1
}

info() {
  echo "→ $*"
}

confirm() {
  local prompt="$1"
  local default="${2:-n}"
  local hint answer
  if [[ "$default" == "y" ]]; then
    hint="Y/n"
  else
    hint="y/N"
  fi
  read -r -p "$prompt [$hint] " answer
  answer="${answer:-$default}"
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' 이(가) 필요합니다."
}

is_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

latest_tag() {
  git describe --tags --abbrev=0 2>/dev/null || true
}

require_cmd git
require_cmd node
require_cmd python3

[[ -f "$MANIFEST" ]] || die "$MANIFEST 이(가) 없습니다. repo 루트에서 실행하세요."
[[ -f "$CHANGELOG" ]] || die "$CHANGELOG 이(가) 없습니다."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "git 저장소가 아닙니다."

CURRENT_VERSION="$(node -e "console.log(require('./$MANIFEST').version)")"
BRANCH="$(git branch --show-current)"
LAST_TAG="$(latest_tag)"

RANGE_ARGS=()
if [[ -n "$LAST_TAG" ]]; then
  RANGE_ARGS=("$LAST_TAG"..HEAD)
else
  RANGE_ARGS=(HEAD)
fi

COMMIT_FILE="$(mktemp)"
ENTRY_FILE="$(mktemp)"
META_FILE="$(mktemp)"
trap 'rm -f "$COMMIT_FILE" "$ENTRY_FILE" "$META_FILE"' EXIT

if [[ -n "$LAST_TAG" ]]; then
  git log "${RANGE_ARGS[@]}" --pretty=format:'%s' --no-merges >"$COMMIT_FILE" || true
else
  git log -30 --pretty=format:'%s' --no-merges >"$COMMIT_FILE" || true
fi

# Analyze commits → suggested bump + changelog body (without heading)
CURRENT_VERSION="$CURRENT_VERSION" \
COMMIT_FILE="$COMMIT_FILE" \
META_FILE="$META_FILE" \
ENTRY_BODY_FILE="$ENTRY_FILE" \
python3 <<'PY'
from __future__ import annotations

import os
import re
from pathlib import Path

commit_file = Path(os.environ["COMMIT_FILE"])
meta_file = Path(os.environ["META_FILE"])
entry_body_file = Path(os.environ["ENTRY_BODY_FILE"])
current = os.environ["CURRENT_VERSION"]

CONV = re.compile(
    r"^(?P<type>[A-Za-z]+)(?:\([^)]*\))?(?P<breaking>!)?:\s*(?P<summary>.+)$"
)
VERSION_SUFFIX = re.compile(r"\s*\(v?\d+\.\d+\.\d+\)\s*$")
SKIP = re.compile(
    r"^(chore:\s*(release|bump)|bump version|feat:\s*release|docs:\s*update changelog)",
    re.I,
)

ADDED_TYPES = {"feat", "feature"}
FIXED_TYPES = {"fix", "bugfix"}
# Everything else notable goes to Changed; noisy types can be skipped.
SKIP_TYPES = {"chore", "ci", "test", "build"}

added: list[str] = []
changed: list[str] = []
fixed: list[str] = []
breaking = False
subjects: list[str] = []

raw = commit_file.read_text(encoding="utf-8").splitlines()
for subject in raw:
    subject = subject.strip()
    if not subject or SKIP.match(subject):
        continue
    subjects.append(subject)

    match = CONV.match(subject)
    if not match:
        changed.append(subject)
        continue

    ctype = match.group("type").lower()
    summary = VERSION_SUFFIX.sub("", match.group("summary")).strip()
    if match.group("breaking"):
        breaking = True
    if re.search(r"BREAKING CHANGE", subject, re.I):
        breaking = True

    if ctype in ADDED_TYPES:
        added.append(summary)
    elif ctype in FIXED_TYPES:
        fixed.append(summary)
    elif ctype in SKIP_TYPES:
        continue
    else:
        # refactor/style/docs/perf/github/... → Changed
        changed.append(summary)


def uniq(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


added = uniq(added)
changed = uniq(changed)
fixed = uniq(fixed)

major, minor, patch = (int(x) for x in current.split("."))
if breaking:
    bump = "major"
    suggested = f"{major + 1}.0.0"
elif added:
    bump = "minor"
    suggested = f"{major}.{minor + 1}.0"
elif fixed or changed:
    bump = "patch"
    suggested = f"{major}.{minor}.{patch + 1}"
else:
    bump = "patch"
    suggested = f"{major}.{minor}.{patch + 1}"

lines: list[str] = []
if added:
    lines.append("### Added")
    lines.extend(f"- {item}" for item in added)
    lines.append("")
if changed:
    lines.append("### Changed")
    lines.extend(f"- {item}" for item in changed)
    lines.append("")
if fixed:
    lines.append("### Fixed")
    lines.extend(f"- {item}" for item in fixed)
    lines.append("")

entry_body_file.write_text("\n".join(lines).rstrip() + ("\n" if lines else ""), encoding="utf-8")
meta_file.write_text(
    "\n".join(
        [
            f"bump={bump}",
            f"suggested={suggested}",
            f"commit_count={len(subjects)}",
            f"has_sections={1 if lines else 0}",
        ]
    )
    + "\n",
    encoding="utf-8",
)
PY

set -a
# shellcheck disable=SC1090
source "$META_FILE"
set +a

echo "MinTool release"
echo "==============="
echo "branch  : $BRANCH"
echo "current : $CURRENT_VERSION"
echo "last tag: ${LAST_TAG:-"(none)"}"
echo "commits : $commit_count since ${LAST_TAG:-"start"}"
echo "suggest : $suggested ($bump)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "mode    : dry-run"
fi
echo

if [[ "$commit_count" -eq 0 && -z "$(git status --porcelain)" ]]; then
  die "릴리스할 커밋/변경이 없습니다."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "작업 트리 변경:"
  git status --short
  echo
  confirm "이 변경들을 릴리스 커밋에 포함할까요?" "y" || die "중단했습니다."

  # If there are no commits since last tag, build bullets from porcelain status.
  if [[ "$has_sections" -eq 0 ]]; then
    STATUS_FILE="$(mktemp)"
    git status --porcelain >"$STATUS_FILE"
    ENTRY_FILE="$ENTRY_FILE" STATUS_FILE="$STATUS_FILE" python3 <<'PY'
from pathlib import Path
import os

added, changed = [], []
for line in Path(os.environ["STATUS_FILE"]).read_text().splitlines():
    if len(line) < 4:
        continue
    code, path = line[:2], line[3:].strip().strip('"')
    if " -> " in path:
        path = path.split(" -> ", 1)[1]
    if code == "??" or "A" in code:
        added.append(f"add `{path}`")
    elif "D" in code:
        changed.append(f"remove `{path}`")
    else:
        changed.append(f"update `{path}`")

lines = []
if added:
    lines += ["### Added", *[f"- {x}" for x in added], ""]
if changed:
    lines += ["### Changed", *[f"- {x}" for x in changed], ""]
if not lines:
    lines = ["### Changed", "- workspace changes included in this release", ""]
Path(os.environ["ENTRY_FILE"]).write_text("\n".join(lines), encoding="utf-8")
PY
    rm -f "$STATUS_FILE"
    has_sections=1
  fi
fi

if [[ "$BRANCH" != "main" ]]; then
  confirm "현재 브랜치가 main이 아닙니다 ($BRANCH). 계속할까요?" "n" || die "중단했습니다."
fi

read -r -p "새 버전 [$suggested]: " NEW_VERSION
NEW_VERSION="${NEW_VERSION:-$suggested}"
is_semver "$NEW_VERSION" || die "SemVer(x.y.z) 형식이어야 합니다: $NEW_VERSION"
[[ "$NEW_VERSION" != "$CURRENT_VERSION" ]] || die "현재 버전과 같습니다: $NEW_VERSION"

TAG="v$NEW_VERSION"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  die "태그 $TAG 가 이미 존재합니다."
fi

RELEASE_DATE="$TODAY"
DEFAULT_COMMIT="chore: release $TAG"
COMMIT_MSG="$DEFAULT_COMMIT"

# Build full changelog entry
{
  echo "## [$NEW_VERSION] - $RELEASE_DATE"
  echo
  if [[ -s "$ENTRY_FILE" ]]; then
    cat "$ENTRY_FILE"
  else
    echo "### Changed"
    echo "- release $TAG"
    echo
  fi
} >"${ENTRY_FILE}.full"
mv "${ENTRY_FILE}.full" "$ENTRY_FILE"

echo
echo "----- auto CHANGELOG -----"
cat "$ENTRY_FILE"
echo "--------------------------"
echo "편집: Enter=이대로 / e=에디터 / m=직접 입력"
read -r -p "CHANGELOG 처리 [Enter]: " CHANGELOG_MODE
CHANGELOG_MODE="${CHANGELOG_MODE:-}"

case "$CHANGELOG_MODE" in
  e|E)
    ${EDITOR:-vi} "$ENTRY_FILE"
    ;;
  m|M)
    echo "CHANGELOG 본문을 입력하세요. 종료: Ctrl-D" >&2
    cat >"$ENTRY_FILE"
    # Ensure heading exists
    if ! grep -q "^## \[$NEW_VERSION\]" "$ENTRY_FILE"; then
      TMP="$(mktemp)"
      {
        echo "## [$NEW_VERSION] - $RELEASE_DATE"
        echo
        cat "$ENTRY_FILE"
      } >"$TMP"
      mv "$TMP" "$ENTRY_FILE"
    fi
    ;;
  "")
    ;;
  *)
    die "알 수 없는 선택: $CHANGELOG_MODE"
    ;;
esac

[[ -s "$ENTRY_FILE" ]] || die "CHANGELOG 내용이 비어 있습니다."

PUSH=0
if confirm "$REMOTE/$BRANCH 와 태그 $TAG 를 push 할까요?" "y"; then
  PUSH=1
fi

echo
echo "----- preview -----"
echo "version : $CURRENT_VERSION → $NEW_VERSION"
echo "tag     : $TAG"
echo "commit  : $COMMIT_MSG"
if [[ "$PUSH" -eq 1 ]]; then
  echo "push    : yes"
else
  echo "push    : no"
fi
echo
cat "$ENTRY_FILE"
echo "-------------------"
confirm "진행할까요?" "y" || die "중단했습니다."

if [[ "$DRY_RUN" -eq 1 ]]; then
  info "dry-run: 여기서 종료합니다."
  exit 0
fi

node <<EOF
const fs = require("fs");
const path = "$MANIFEST";
const data = JSON.parse(fs.readFileSync(path, "utf8"));
data.version = "$NEW_VERSION";
fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
EOF
info "$MANIFEST → $NEW_VERSION"

CHANGELOG_PATH="$CHANGELOG" \
CHANGELOG_VERSION="$NEW_VERSION" \
CHANGELOG_ENTRY_FILE="$ENTRY_FILE" \
python3 <<'PY'
from pathlib import Path
import os
import sys

path = Path(os.environ["CHANGELOG_PATH"])
version = os.environ["CHANGELOG_VERSION"]
entry = Path(os.environ["CHANGELOG_ENTRY_FILE"]).read_text(encoding="utf-8").rstrip() + "\n"
text = path.read_text(encoding="utf-8")
needle = "All notable changes to this project are documented in this file.\n"

if needle not in text:
    sys.exit("CHANGELOG marker not found")
if f"## [{version}]" in text:
    sys.exit(f"CHANGELOG already has version {version}")

path.write_text(text.replace(needle, needle + "\n" + entry + "\n", 1), encoding="utf-8")
PY
info "$CHANGELOG 갱신"

git add -A
git commit -m "$COMMIT_MSG"
git tag "$TAG"
info "커밋/태그 완료: $(git rev-parse --short HEAD) ($TAG)"

if [[ "$PUSH" -eq 1 ]]; then
  git push "$REMOTE" "$BRANCH"
  git push "$REMOTE" "$TAG"
  info "push 완료: $REMOTE/$BRANCH , $TAG"
else
  info "로컬만 반영. 나중에: git push $REMOTE $BRANCH && git push $REMOTE $TAG"
fi

echo
echo "done: $CURRENT_VERSION → $NEW_VERSION ($TAG)"
