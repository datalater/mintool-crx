# Standard Chrome Extension Architecture Blueprint

이 문서는 크롬 확장 프로그램 프로젝트의 유지보수성, 확장성, 그리고 코드 재사용성을 극대화하기 위한 표준 아키텍처 가이드라인입니다. 새로운 프로젝트 시작 시 또는 리팩토링 시 이 구조를 엄격히 준수해야 합니다.

## 1. 디렉토리 구조 및 역할

프로젝트 루트는 기능별로 명확히 분리된 폴더 구조를 유지해야 합니다.

### `/constants` (Pure Enums)
- **역할**: 애플리케이션 전반에서 사용되는 변경되지 않는 고정 값(문자열, 숫자 등)을 정의합니다.
- **예시**: `HTTP_METHODS`, `LOG_LEVELS`, `MESSAGE_TYPES` 등.
- **원칙**: 로직이나 계산이 포함되어서는 안 되며, 오타 방지와 코드 가독성을 위한 명칭 정의만 포함합니다.

### `/configs` (Application Settings)
- **역할**: 애플리케이션의 동작을 제어하는 설정값과 제한(Limit) 값을 관리합니다.
- **예시**: `STORAGE_LIMITS`, `API_ENDPOINTS`, `FEATURE_FLAGS` 등.
- **원칙**: 비즈니스 로직 수정 없이 설정값 변경만으로 시스템 동작을 바꿀 수 있어야 합니다.

### `/utils` (Shared Pure Utilities)
- **역할**: 상태를 가지지 않고(Stateless), 입력에 대해 항상 일관된 결과를 반환하는 순수 함수를 모듈별로 관리합니다.
- **구분**: `date.js`, `text.js`, `url.js`, `chrome-api.js` 등 자료형이나 도구 성격에 따라 분리합니다.
- **원칙**: **Background와 Popup(또는 Content Script) 간에 공유**될 수 있도록 작성하여 코드 중복을 원천 차단합니다.

### `/popup`, `/options`, `/content` (UI Components)
- **역할**: 각 진입점(Entry Point)별로 필요한 HTML, CSS, JS 자산을 응집력 있게 관리합니다.
- **구성**:
  - `reset.css`: 전역 및 기본 엘리먼트 스타일, 디자인 시스템 변수(`:root`).
  - `main.css`: 해당 컴포넌트 특화 스타일.
  - `main.js`: UI 이벤트 핸들링 및 상태 관리. 복잡한 로직은 `utils`로 위임합니다.

### `/lib` (External Dependencies)
- **역할**: NPM 패키지를 직접 사용하기 어렵거나 별도의 번들링 없이 포함해야 하는 외부 라이브러리를 보관합니다.

## 2. 핵심 설계 원칙

### 1) 관심사의 분리 (Separation of Concerns)
- **UI Script**: DOM 조작과 사용자 이벤트 처리에만 집중합니다.
- **Background Script**: 시스템 이벤트(알람, 네트워크 인터셉트 등)와 긴 호흡의 상태 유지에 집중합니다.
- **Utility**: 데이터를 가공하거나 검증하는 범용 로직을 담당합니다.

### 2) 단일 진실 공급원 (Single Source of Truth)
- 공유되는 모든 설정과 상수(상한선, 리소스 타입 등)는 각 폴더에 정의된 모듈에서만 가져와야 합니다.
- 동일한 값을 여러 파일에 하드코딩하는 것을 엄격히 금지합니다.

### 3) CSS 모듈화 및 전역 변수화
- 색상, 여백, 폰트 크기 등은 `:root`에 CSS 변수로 정의하여 사용합니다.
- 기본 엘리먼트 스타일(태그 기반)은 `reset.css`와 같은 별도 파일로 분리하여 레이아웃 스타일과 섞이지 않게 합니다.

### 4) 비동기 처리의 명확성
- Chrome API는 프로미스(Promise) 기반 또는 콜백 기반 중 하나를 선택하되 프로젝트 내에서 일관성을 유지합니다.
- 에러 핸들링(`try-catch`, `chrome.runtime.lastError` 체크)을 모든 외부 API 호출에 적용합니다.

## 3. 리팩토링 체크리스트 (AI용 프롬프트 지침)
- [ ] 파일 하나가 500줄을 넘는다면 관심사 분리가 필요한 시점입니까?
- [ ] 여러 파일에서 동일한 정규식이나 유틸리티 함수를 정의하고 있지 않습니까?
- [ ] 매직 넘버(숫자 5, 100 등) 대신 명확한 명칭의 상수를 사용하고 있습니까?
- [ ] UI 스타일이 브라우저 기본값에 의존하지 않고 정의된 디자인 시스템을 따르고 있습니까?

## 4. `manifest.json` 작성 가이드라인

`manifest.json`은 확장 프로그램의 보안과 성능을 결정하는 핵심 파일입니다.

### 1) Manifest V3 (MV3) 준수
- 항상 `"manifest_version": 3`을 사용합니다.
- 배경 스크립트는 `"background": { "service_worker": "..." }` 형식을 사용해야 합니다.

### 2) 최소 권한의 원칙 (Principle of Least Privilege)
- **Permissions**: `"storage"`, `"tabs"` 등 꼭 필요한 API 권한만 요청합니다.
- **Host Permissions**: `<all_urls>` 보다는 특정 도메인(`https://*.example.com/*`)으로 제한하는 것이 보안과 심사(Review) 면에서 유리합니다. 만약 범용 도구가 아니라면 범위를 좁히십시오.

### 3) 모듈 시스템 활용
- 배경 서비스 워커에서 ES Modules를 사용하려면 `"type": "module"`을 명시합니다.
  ```json
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
  ```

### 4) 보안 정책 (CSP)
- MV3에서는 인라인 스크립트나 외부 원격 스크립트 실행이 금지됩니다. 모든 로직은 확장 프로그램 패키지 내부의 파일에 포함되어야 합니다.

### 5) 사용자 정보 및 버전 관리
- `name`과 `description`은 사용자가 기능을 바로 이해할 수 있도록 명확하게 작성합니다.
- `version`은 SemVer(Semantic Versioning) 규칙을 따릅니다.
