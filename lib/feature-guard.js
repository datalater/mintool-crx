// Convention: features default to ENABLED. Disabled only when `features[key] === false`.

const FEATURE_DEFS = [
  { key: 'adBlock', label: 'Ad Block', description: '광고 차단', group: 'global' },
  { key: 'domEraser', label: 'DOM 제거/숨기기', description: '우클릭 메뉴로 DOM 요소 제거 또는 숨기기', group: 'global' },
  { key: 'domStyleEditor', label: 'DOM 스타일 편집', description: '우클릭 메뉴로 요소 스타일 편집', group: 'global' },
  { key: 'virtualFullscreen', label: '창 내부 전체화면', description: '전체 화면을 창 내부로 제한하기', group: 'global' },
  { key: 'githubAutoRefresh', label: '자동 새로고침', description: 'PR/알림 페이지 자동 새로고침', group: 'github' },
  { key: 'githubNotificationFilters', label: '알림 필터', description: '알림 페이지에 커스텀 필터 추가', group: 'github' },
  { key: 'githubCommentShortcut', label: '댓글 단축키', description: 'Issue/PR 댓글 편집 단축키', group: 'github' },
  { key: 'githubShortcut', label: 'PR 파일트리 단축키', description: 'PR 파일트리 토글 단축키', group: 'github' },
  { key: 'githubPrCommitAutoEmbed', label: 'PR 커밋 자동 임베드', description: 'PR에 커밋 링크 자동 삽입', group: 'github' },
  { key: 'tossinvest', label: 'TossInvest 가격 범위', description: '주식 페이지에 가격 범위 표시', group: 'site' },
  { key: 'jira', label: 'Jira 복사 컨트롤', description: 'Jira 티켓 복사 버튼 추가', group: 'site' },
];

const FEATURE_GROUPS = [
  { key: 'global', label: '전역' },
  { key: 'github', label: 'GitHub' },
  { key: 'site', label: '사이트별' },
];

const _featureSettingsPromise = chrome.storage.sync.get('features')
  .then(r => r.features || {});

async function isFeatureEnabled(key) {
  const features = await _featureSettingsPromise;
  return features[key] !== false;
}
