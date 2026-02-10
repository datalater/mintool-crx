: '
크롬 확장 프로그램 프로젝트에 AI 지침(Best Practices)과 표준 아키텍처 가이드를 주입하거나 동기화합니다.

[사용법] 프로젝트 루트 디렉토리에서 아래 명령을 실행하세요:

1. 실행 권한 부여 (최초 1회)
chmod +x .agent/scripts/setup-agent.sh

2. 지식 전이 실행 (대상 프로젝트 경로 입력)
.agent/scripts/setup-agent.sh /path/to/new-project

3. 지식 전이 및 자동 아키텍처 감사(Audit) 실행
.agent/scripts/setup-agent.sh /path/to/new-project --audit

4. 핵심 지침만 동기화 (기존 프로젝트의 AI.md나 context.md를 보존하며 지침만 최신화)
.agent/scripts/setup-agent.sh /path/to/target-project --sync
'

TARGET_DIR=$1
FLAGS=$*

if [ -z "$TARGET_DIR" ]; then
    echo "Usage: $0 /path/to/target-project [--audit | --sync]"
    exit 1
fi

# Resolve absolute path for target
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS realpath alternative
    TARGET_DIR=$(cd "$TARGET_DIR" && pwd)
    SOURCE_AGENT_DIR=$(cd "$(dirname "$0")/.." && pwd)
else
    TARGET_DIR=$(realpath "$TARGET_DIR")
    SOURCE_AGENT_DIR=$(dirname "$(dirname "$(readlink -f "$0")")")
fi

echo "🚀 Processing AI Agent files for: $TARGET_DIR"

# 1. Create .agent directory in target
mkdir -p "$TARGET_DIR/.agent"

# 2. Copy universal files (Instructions & Architecture)
# Always overwrite to ensure the latest best practices are synchronized
cp "$SOURCE_AGENT_DIR/instructions.md" "$TARGET_DIR/.agent/"
cp "$SOURCE_AGENT_DIR/architecture.md" "$TARGET_DIR/.agent/"

# Check for --sync flag
if [[ "$FLAGS" == *"--sync"* ]]; then
    echo "🔄 Sync mode: core instructions updated. Skipping AI.md and context.md creation."
else
    # 3. Create/Update context.md for the project
    if [ ! -f "$TARGET_DIR/.agent/context.md" ]; then
        echo "📄 Creating fresh context.md..."
        cat <<EOF > "$TARGET_DIR/.agent/context.md"
# Project Context: $(basename "$TARGET_DIR")

이 문서는 AI 에이전트가 현재 프로젝트의 고유한 배경과 진행 상황을 파악하기 위한 전용 공간입니다.

## 1. 프로젝트 개요
- **목적**: (여기에 프로젝트의 목적을 작성하세요)
- **주요 기능**: (핵심 기능을 나열하세요)

## 2. 진행 상황 및 히스토리
- (현재 단계와 주요 결정 사항을 기록하세요)
EOF
    else
        echo "⏭️  Existing context.md found. Skipping to preserve project history."
    fi

    # 4. Create root AI.md entry point (overwrite to ensure latest links/guides)
    cat <<EOF > "$TARGET_DIR/AI.md"
# AI Information

이 프로젝트는 AI 에이전트와 협업하기 위해 최적화된 구조를 가지고 있습니다.
AI는 작업 시작 전 반드시 아래 경로의 지침을 확인하십시오.

- **AI Instructions**: [.agent/instructions.md](./.agent/instructions.md)

## 💡 Knowledge Transfer & Audit (지식 전이 및 점검)
현재 프로젝트에서 진화된 AI 지식을 다른 프로젝트로 전이하거나 점검하려면 아래 명령어를 사용하세요:
\`\`\`bash
.agent/scripts/setup-agent.sh /path/to/target-project
\`\`\`
EOF
fi

# 5. Copy the script itself for future use
mkdir -p "$TARGET_DIR/.agent/scripts"
cp "$0" "$TARGET_DIR/.agent/scripts/"

# 6. Handle --audit flag
if [[ "$FLAGS" == *"--audit"* ]]; then
    echo "🔍 Triggering automatic architecture audit..."
    touch "$TARGET_DIR/.agent/audit_pending"
fi

echo "✅ Task complete!"
if [[ "$FLAGS" == *"--sync"* ]]; then
    echo "Tip: 지침이 성공적으로 동기화되었습니다."
else
    echo "Tip: AI에게 'AI.md를 읽고 작업을 시작해줘'라고 명령하거나, --audit을 썼다면 자동으로 감사를 시작할 것입니다."
fi
