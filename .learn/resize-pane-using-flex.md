# Flex로 패널 리사이즈하는 방법 (초심자용)

이 문서는 QA 시나리오 화면의 **에디터/체크리스트 패널 크기 조절**이 어떻게 동작하는지 아주 쉽게 설명합니다.
같은 기능을 다른 프로젝트에서 다시 구현할 때 참고하기 좋게 핵심 원리와 코드 흐름을 정리했습니다.

## 1) 구조 먼저 이해하기
사용자가 머릿속으로 바로 떠올릴 수 있도록 **실제 DOM 형태를 먼저 보여줍니다**.

아래 구조가 화면에 그대로 있다고 생각하면 됩니다.

```html
<main class="app-content">
  <section class="pane editor-pane" id="editor-pane">
    <!-- JSON Editor 영역 -->
  </section>

  <div class="pane-resizer" id="pane-resizer"></div>

  <section class="pane checklist-pane">
    <!-- Checklist UI 영역 -->
  </section>
</main>
```

이 구조에서 역할은 이렇게 나뉩니다.

- **컨테이너**: `.app-content` (flex 컨테이너)
- **왼쪽 패널**: `.editor-pane` (flex 아이템)
- **오른쪽 패널**: `.checklist-pane` (flex 아이템)
- **핸들바**: `#pane-resizer` (드래그용 막대)

즉, **왼쪽/오른쪽 패널은 flex 아이템**이고, 그 사이에 **드래그 가능한 막대**가 끼어 있는 구조입니다.

[!note]
**flex 컨테이너**는 자식 요소들을 가로/세로로 배치하고 크기를 분배하는 레이아웃입니다.
여기서는 가로(row) 방향으로 패널들을 배치합니다.

## 2) 리사이즈의 핵심 원리
드래그 중에는 **왼쪽 패널을 고정 폭으로 만들고**, 오른쪽 패널이 **남은 공간을 자동으로 채우게** 합니다.

정확히는 아래 한 줄이 핵심입니다.

```js
EL.editorPane.style.flex = `0 0 ${width}px`;
```

이 한 줄이 하는 일은 다음과 같습니다.

### `flex: 0 0 {width}px`가 의미하는 것
`flex`는 사실 3개의 값을 한 줄로 적는 축약형(short property)입니다.

```css
flex: <flex-grow> <flex-shrink> <flex-basis>;
```

그래서 아래는 같은 의미입니다.

```css
flex: 0 0 320px;
```

⬇️ 풀어서 쓰면 이렇게 됩니다.

```css
flex-grow: 0;
flex-shrink: 0;
flex-basis: 320px;
```

각 값의 의미는 다음과 같습니다.

- **flex-grow: 0**
  - 남는 공간을 **추가로 늘려서 차지하지 않는다**
- **flex-shrink: 0**
  - 공간이 부족해도 **줄어들지 않는다**
- **flex-basis: 320px**
  - 기본 크기를 **320px로 고정한다**

즉, **왼쪽 패널은 딱 320px로 고정되고**, 오른쪽 패널이 나머지를 채우게 됩니다.

[!note]
`flex-basis`는 “이 요소의 기본 크기”라고 생각하면 이해가 쉽습니다.
`flex-basis`가 고정되면 레이아웃은 매우 안정적으로 동작합니다.

## 3) 드래그가 부드럽게 느껴지는 이유
드래그 중에는 애니메이션(transition)을 꺼서 **즉시 반응**하도록 처리합니다.

```js
document.body.classList.add('is-resizing');
EL.paneResizer.classList.add('resizing');
```

CSS에서 `body.is-resizing`이 있을 때는 transition을 제거하여 “느릿느릿 움직이는 느낌”을 없앱니다.

[!note]
transition이 켜져 있으면 마우스 움직임보다 레이아웃 변경이 늦게 따라오며 “렉”처럼 느껴질 수 있습니다.

## 4) 실제 코드 흐름 (요약)
코드는 `qa-scenario/script.js`의 `setupResizing()`에서 실행됩니다.

```js
let isResizing = false;
let resizeOriginLeft = 0;

const startResizing = (event) => {
  if (event.button !== 0) return;
  isResizing = true;
  resizeOriginLeft = EL.appContent.getBoundingClientRect().left;
  document.body.classList.add('is-resizing');
  EL.paneResizer.classList.add('resizing');
};

window.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const width = Math.max(0, e.clientX - resizeOriginLeft);
  EL.editorPane.style.flex = `0 0 ${width}px`;
});

window.addEventListener('mouseup', () => {
  isResizing = false;
  document.body.classList.remove('is-resizing');
  EL.paneResizer.classList.remove('resizing');
});
```

**정리하면**:
1) 마우스를 누르면 리사이즈 시작
2) 마우스를 움직이면 왼쪽 패널 폭이 고정됨
3) 마우스를 떼면 리사이즈 종료

## 5) 중요한 오해 바로잡기
리사이즈는 **패널을 가리는 방식이 아닙니다**.

- “왼쪽을 덮는다” → ❌
- “왼쪽을 고정 폭으로 만들고 오른쪽이 남은 공간을 채운다” → ✅

즉, **레이아웃 자체를 다시 계산하는 방식**입니다.

## 6) 확장 아이디어 (선택)
필요하다면 다음을 추가할 수 있습니다.

- **최소/최대 폭 제한**
  - `Math.min/Math.max`로 폭을 제한
- **리사이즈 폭 저장**
  - localStorage에 저장해 새로고침 후 복원

[!note]
폭 제한은 UX를 안정적으로 만드는 데 특히 유용합니다.
너무 좁아져서 패널이 거의 사라지는 상황을 막을 수 있습니다.

---

### 참고 파일
- `qa-scenario/script.js`
- `qa-scenario/style.css`
