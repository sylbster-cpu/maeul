# Firebase 온라인 집과 비동기 방문 인사 — 두 번째 실험

> 작성 2026-11-20, GPT. **프로그램·보안 규칙·검증 시험은 구현했으나, 사용자의 Firebase 프로젝트와 웹 앱 공개 설정이 아직 없어 실서버에는 연결되지 않았다.** 정식 서비스가 아니라 두 기기에서 영속적인 흔적이 남는지 확인하는 소규모 실험이다.
>
> 2026-11-20 덧붙임(Claude): 사용자가 아래 1~4번을 마쳤고 공개 웹 설정이 코드에 연결됐다. 읽기 권한은 실제 서버에서 규칙대로 동작했다. **실제 서버에 쓰는 동작과 두 기기 시험(6번)은 아직 하지 못했다.**

## 목적과 현재 범위

기존 `#home=` 집 공유는 서버 없이 링크에 집의 사본을 담아 전달하므로, 인사를 남길 수 없고 이후 집의 수정 상태가 자동으로 보이지 않는다.

이번 `#visit=집주인UID` 링크는 Firebase Authentication(익명 인증) + Cloud Firestore(서버 데이터베이스)를 이용한다. 집주인이 **온라인 집 게시**를 눌렀을 때만 현재 집을 서버에 올린다. 친구는 짧은 온라인 주소로 집을 방문해 **방문 인사 한 줄**을 한 번 남긴다. 집주인은 접속해 **방명록 보기**, **삭제**, **공개 중지**를 할 수 있다.

기존 로컬 자동 저장과 `#home=` 링크는 그대로 유지한다. Firebase 설정이 없으면 온라인 버튼은 숨고 기존 게임은 동일하게 작동한다. 서버 오류나 공유 링크 오류로 로컬 집을 덮어쓰지 않는다. 4인 실시간 이동·동기화는 이 실험에 포함되지 않는다.

## 운영 연결 절차: 실제 Firebase 프로젝트 관리자에게 필요한 일

관리자 계정 없이 AI가 Firebase 콘솔의 프로젝트를 만들거나 보안 규칙을 배포할 수는 없다. 휴대폰에서도 가능한 범위로 안내하지만 모바일 콘솔 동작은 아직 실기기 확인하지 못했다.

1. `https://console.firebase.google.com/` 에서 Firebase 프로젝트를 만들고 **웹 앱(`</>`)** 을 등록한다. 프로젝트에서 보여 주는 공개 웹 설정 `firebaseConfig` 객체(보통 `apiKey`, `authDomain`, `projectId`, `appId` 포함)를 복사한다. 관리자 개인 키나 비밀번호는 필요하지 않다.
2. **Authentication → Sign-in method → Anonymous** 를 사용 설정한다. 같은 화면의 **자동 정리**(30일이 지난 익명 계정 삭제)는 켜지 않는다. 집의 소유권이 익명 UID에 묶여 있어 계정이 지워지면 집주인이 자기 집을 고치지도 공개를 중지하지도 못한다. Authentication의 **Settings → Authorized domains**에 `sylbster-cpu.github.io`가 있는지 확인하고 없으면 추가한다(필요하면 로컬 시험 주소도 추가).
3. **Firestore Database → 데이터베이스 생성**에서 `(default)` 데이터베이스를 만든다. 이 앱은 Cloud Firestore **Standard 에디션**을 전제로 한다. 공개 시험 모드 규칙을 계속 쓰지 말고 처음부터 접근을 막는 모드로 시작한다.
4. Firestore → Rules(규칙)에서 저장소의 `firestore.rules` 전체를 붙여 넣고 **게시(Publish)** 한다. 규칙에는 집주인만 쓰기, 집 목록 열람 금지, 방명록 본인 한 번 작성, 집주인만 방명록 목록·삭제, 글자 수와 서버 시각 검사 등이 있다. 보안 규칙 검증은 별도 에뮬레이터 자동 시험에서 확인한다.
5. 공개 웹 설정 객체를 GPT 또는 Claude에게 보내 `src/firebase-config.js`의 `FIREBASE_CONFIG = null`을 **공개 설정**으로 바꾸는 별도 PR을 작성하도록 한다. 공개 웹 설정은 클라이언트에 노출될 수 있지만, 서비스 계정 키/관리자 인증 토큰은 절대 공개하지 않는다. Google 서비스 결제 수단을 등록할 필요가 없는 Spark 범위에서 시작한다.
6. 그 PR을 병합한 뒤 GitHub Pages에서 **온라인** 버튼이 나타나면 기기 A가 **내 집 온라인 게시**를 누르고 링크를 기기 B에 전달한다. B가 방문해 인사말 하나를 남긴 뒤 A에서 **방명록 보기**를 누른다. A가 공개 중지를 누르면 이후 방문은 거부되어야 한다.

**순서 중요:** 보안 규칙을 게시한 후에 Firebase 웹 설정을 켠다. 규칙을 `allow read, write: if true`로 여는 것은 금지한다.

## 코드와 데이터

- `src/firebase-config.js`: 웹 앱 공개 설정(초기에는 `null`; 없는 동안 접속하지 않음)
- `src/online-data.js`: 주소 검증, 집 스냅샷 검사, 140자 인사말 검사
- `src/online.js`: 필요한 순간에만 Firebase CDN의 모듈 SDK 로드(13.4.0 고정), 익명 로그인
- `src/online-service.js`: 게시, 단건 방문 조회, 작성자 UID별 한 번 인사, 목록 확인, 집주인의 삭제·비공개
- `src/online-ui.js`: 휴대폰 터치 UI, 텍스트만 표시, 방명록 팝업. 집주인의 창에는 이 브라우저로 게시한 집의 상태(공개 중, 공개 중지, 없음)를 보여 준다. 익명 계정이 브라우저마다 따로라서, 다른 브라우저에서 게시한 집과 그 방명록은 보이지 않는다
- `firestore.rules`, `firebase.json`, `test/firestore-rules.mjs`: 보안 규칙 및 에뮬레이터 시험
- `test/online-data.test.mjs`, `test/online-service.test.mjs`: 원격 접근을 일으키지 않는 단위 시험

저장 구조:

```text
houses/{ownerUid}
  ownerUid: 소유자 Firebase Auth UID
  snapshot: 사용자 승인 시점의 집(저장 형식 v2 JSON, 80KB 이내)
  isPublic: true/false
  updatedAt: 서버 시각

houses/{ownerUid}/notes/{visitorUid}
  authorUid: 작성자 Firebase Auth UID
  body: 1~140자 일반 텍스트
  createdAt: 서버 시각
```

- `houses`는 공개된 문서만 인증 사용자에게 **단건 읽기**를 허용하고 목록 조회를 거부한다. 집주인만 게시/변경/비공개할 수 있다.
- `notes`는 공개된 집에서 인증한 다른 사용자가 자기 UID의 문서로 한 번 작성한다. 덮어쓰기와 남의 UID로 작성은 거부한다. 집주인만 방명록 목록을 읽고 삭제한다. 방문자는 자신의 글만 단건 읽을 수 있다.
- 서버의 JSON은 **믿지 않는다.** 받아서 기존 `save.parse`의 배치 규칙 검사를 통과시킨 후에만 구경 모드로 열며, 데이터가 잘못되었으면 원래 집을 그대로 연다.
- 외부 데이터는 HTML로 렌더링하지 않고 `textContent`로만 출력한다. 주민 이름/이메일을 저장하지 않고 Firebase UID만 쓴다.
- 기존 `localStorage`는 개인 집 저장의 원본이다. Firebase에는 명시적으로 온라인 게시한 사본만 쓴다. 가구 이동마다 서버에 기록하지 않는다.

## 보안과 한계

- **익명 로그인은 친구의 실제 신원을 확인하지 않는다.** 사용자 스스로 브라우저 데이터를 지우면 같은 익명 UID로 돌아오지 못할 수 있고, 기존 온라인 집의 수정 권한도 잃는다. 향후 계정 연동·복구·집 백업이 필수다.
- 방문자별 한 번 쓰기 제한은 익명 계정을 새로 생성하면 회피할 수 있다. URL을 아는 불특정 다수가 접근할 수 있으므로 공개 배포 전에 신고/차단, App Check, 과금·빈도 모니터링을 추가 검토해야 한다.
- 방명록은 최대 30개만 한 번에 읽는 시제품이다. 정식 게임이라면 페이지네이션·삭제/스팸 대응을 설계한다.
- Firestore 보안 규칙만으로 JSON 내부 가구의 모든 관계를 완전히 검증하지 못한다. 현재는 크기, 타입, 소유권 제한을 서버 규칙에서 검사하고 **클라이언트에서 재검증**한다. 신뢰할 수 없는 클라이언트가 가구를 변조해 올리는 것을 서버가 완전히 막는 구조는 아니다.
- 실시간 4인 이동/전투/합주는 별도의 동기화 방법이 필요하다.

## 시험

기본 `npm test`는 서버 없이 도는 게임 규칙과 온라인 데이터 단위 시험이다. `test/firestore-rules.mjs`는 `@firebase/rules-unit-testing` 및 Firestore 에뮬레이터가 있는 환경에서 따로 실행한다. GitHub Actions의 `Firebase 보안 규칙 검증` 워크플로에 자동화했다. 별도 웹 설정과 실서버 연결 시험은 **아직 수행하지 않았다**.

Firebase 공식 문서: https://firebase.google.com/docs/web/alt-setup , https://firebase.google.com/docs/auth/web/anonymous-auth , https://firebase.google.com/docs/firestore/security/rules-fields , https://firebase.google.com/docs/firestore/security/test-rules-emulator .
