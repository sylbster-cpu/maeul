// Firebase 콘솔에서 웹 앱 등록 후 받은 공개 설정을 이 파일에 넣습니다.
// 데이터베이스 보안 규칙(firestore.rules)을 먼저 배포해야 합니다.
// 관리자 비밀 키/서비스 계정 JSON은 절대로 여기에 넣지 마세요.
// 설정 전에는 기존 오프라인 집과 #home= 공유만 작동합니다.
// 아래는 2026-11-20 사용자가 Firebase 콘솔의 웹 앱 등록 화면에서 받은 공개 웹 설정이다.
// 이 값은 브라우저에 그대로 전달되는 공개 식별자이며, 접근 제한은 firestore.rules 가 맡는다.
// 애널리틱스는 쓰지 않으므로 measurementId 는 넣지 않았다.
// 온라인 기능을 끄려면 이 값을 null 로 바꾼다.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAYvAeGK4RAb-NFLtgDvVjyp-Dvf9s86n4',
  authDomain: 'maeul-d8ec0.firebaseapp.com',
  projectId: 'maeul-d8ec0',
  appId: '1:710838957335:web:9f90f2891e2c39d13b7352',
};
